/** Descarga de imágenes públicas con validación DNS en la conexión (SSRF, ADR-09). */
import { lookup } from 'node:dns/promises';
import {
  request as httpRequest,
  type IncomingMessage,
  type ClientRequest,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { FILE_LIMITS } from '@ifts2/shared';

export class MediaDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const NETWORK_ERROR = 'La dirección de la imagen apunta a una red no permitida.';
const DOWNLOAD_ERROR = 'No pudimos descargar la imagen (sin respuesta del servidor).';
const SIZE_ERROR = 'La imagen pesa demasiado (máximo 5 MB).';
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}
const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3ffe::', 16],
  ['3fff::', 20],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  // Solo unicast global; excluye también traducción, túneles e IPv4 mapeada en IPv6.
  return (
    family === 6 && globalIPv6.check(address, 'ipv6') && !blockedAddresses.check(address, 'ipv6')
  );
}

/** Valida la URL y las IP literales; el DNS se valida al abrir cada conexión. */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MediaDownloadError('La dirección de la imagen no es válida.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new MediaDownloadError('La dirección de la imagen debe empezar con http:// o https://.');
  }
  if (u.username || u.password) {
    throw new MediaDownloadError('La dirección de la imagen no debe incluir credenciales.');
  }
  const host = u.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  const blocked = isIP(host)
    ? !isPublicAddress(host)
    : host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      !host.includes('.');
  if (blocked) throw new MediaDownloadError(NETWORK_ERROR);
  return u;
}

function publicLookup(signal: AbortSignal): LookupFunction {
  return (hostname, options, callback) => {
    void lookup(hostname, { all: true, verbatim: true }).then(
      (addresses) => {
        if (signal.aborted) return callback(new MediaDownloadError(DOWNLOAD_ERROR), '', 0);
        const first = addresses[0];
        if (
          !first ||
          addresses.some((a) => isIP(a.address) !== a.family || !isPublicAddress(a.address))
        ) {
          return callback(new MediaDownloadError(NETWORK_ERROR), '', 0);
        }
        // net.connect usa solo estas IP sin volver a resolver; Host y SNI conservan el dominio.
        if (options.all) callback(null, addresses);
        else callback(null, first.address, first.family);
      },
      () =>
        callback(new MediaDownloadError('No pudimos resolver el servidor de la imagen.'), '', 0),
    );
  };
}

async function readLimited(res: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new MediaDownloadError(SIZE_ERROR);
  let body: Readable = res;
  switch (res.headers['content-encoding']?.toLowerCase()) {
    case undefined:
    case 'identity':
      break;
    case 'gzip':
      body = res.pipe(createGunzip());
      break;
    case 'deflate':
      body = res.pipe(createInflate());
      break;
    case 'br':
      body = res.pipe(createBrotliDecompress());
      break;
    default:
      throw new MediaDownloadError('No pudimos interpretar la imagen del servidor.');
  }
  const forwardError = (error: Error) => body.destroy(error);
  if (body !== res) res.on('error', forwardError);
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      const value = Buffer.from(chunk);
      total += value.length;
      if (total > maxBytes) throw new MediaDownloadError(SIZE_ERROR);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    body.destroy();
  }
}

/** El tipo real de la imagen se verifica por firma al guardarla. */
export async function downloadImage(
  url: string,
  maxBytes: number = FILE_LIMITS.imageMaxBytes,
): Promise<Buffer> {
  let current = assertPublicHttpUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const request = current.protocol === 'https:' ? httpsRequest : httpRequest;
    let req: ClientRequest | undefined;
    let res: IncomingMessage | undefined;
    try {
      const options: RequestOptions & { autoSelectFamily: boolean } = {
        // Una conexión nueva por salto, sin agentes globales ni una segunda resolución DNS.
        agent: false,
        autoSelectFamily: true,
        lookup: publicLookup(controller.signal),
        signal: controller.signal,
        headers: { 'accept-encoding': 'identity' },
      };
      const outgoing = request(current, options);
      req = outgoing;
      res = await new Promise<IncomingMessage>((resolve, reject) => {
        outgoing.once('response', resolve);
        outgoing.once('error', reject);
        outgoing.end();
      });
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = res.headers.location;
        if (!location) throw new MediaDownloadError('No pudimos descargar la imagen.');
        if (hop === MAX_REDIRECTS) {
          throw new MediaDownloadError('La imagen redirige demasiadas veces.');
        }
        current = assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (status < 200 || status >= 300) {
        throw new MediaDownloadError(
          `No pudimos descargar la imagen (el servidor respondió ${status}). Si es de Instagram, la dirección pudo haber vencido.`,
        );
      }
      return await readLimited(res, maxBytes);
    } catch (error) {
      if (error instanceof MediaDownloadError) throw error;
      throw new MediaDownloadError(DOWNLOAD_ERROR);
    } finally {
      clearTimeout(timer);
      res?.destroy();
      req?.destroy();
    }
  }
  throw new MediaDownloadError('La imagen redirige demasiadas veces.');
}
