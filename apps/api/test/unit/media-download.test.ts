import { EventEmitter } from 'node:events';
import type { IncomingMessage, RequestOptions } from 'node:http';
import type { LookupAddress } from 'node:dns';
import net, { isIP } from 'node:net';
import { Duplex, Readable } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_LIMITS } from '@ifts2/shared';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), http: vi.fn(), https: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.resolve }));
vi.mock('node:http', async (original) => ({
  ...(await original<typeof import('node:http')>()),
  request: mocks.http,
}));
vi.mock('node:https', () => ({ request: mocks.https }));

import {
  assertPublicHttpUrl,
  downloadImage,
  MediaDownloadError,
} from '../../src/infra/media-download';

type Reply = {
  status?: number;
  headers?: IncomingMessage['headers'];
  chunks?: Buffer[];
  waitHeaders?: boolean;
  waitBody?: boolean;
  bodyError?: boolean;
};
let replies: Reply[];
let connections: string[];
let responses: IncomingMessage[];
let requests: Array<EventEmitter & { destroy: ReturnType<typeof vi.fn> }>;
const public4 = '93.184.215.14';
const public6 = '2606:4700:4700::1111';
const imageUrl = 'https://scontent.cdninstagram.com/img/foto.jpg?oe=abc&oh=firma';

function requestMock(url: URL, options: RequestOptions) {
  const req = new EventEmitter() as EventEmitter & {
    end: () => void;
    destroy: ReturnType<typeof vi.fn>;
  };
  let res: IncomingMessage | undefined;
  const abort = () => {
    req.emit('error', new Error('AbortError'));
    res?.destroy(new Error('AbortError'));
  };
  req.destroy = vi.fn(() => options.signal?.removeEventListener('abort', abort));
  options.signal?.addEventListener('abort', abort);
  requests.push(req);
  req.end = () => {
    const connected = (error: Error | null, address: string | LookupAddress[]) => {
      if (error) return void req.emit('error', error);
      const selected = typeof address === 'string' ? address : address[0]!.address;
      connections.push(selected);
      const reply = replies.shift() ?? {};
      if (reply.waitHeaders) return;
      res = (
        reply.waitBody || reply.bodyError
          ? new Readable({ read() {} })
          : Readable.from(reply.chunks ?? [Buffer.from('imagen')])
      ) as IncomingMessage;
      res.statusCode = reply.status ?? 200;
      res.headers = reply.headers ?? {};
      responses.push(res);
      req.emit('response', res);
      if (reply.bodyError) queueMicrotask(() => res?.destroy(new Error('token=secreto')));
    };
    queueMicrotask(() => {
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host)) connected(null, host);
      else options.lookup!(host, { all: true }, connected);
    });
  };
  return req;
}

beforeEach(() => {
  vi.resetAllMocks();
  replies = [];
  connections = [];
  responses = [];
  requests = [];
  mocks.resolve.mockResolvedValue([{ address: public4, family: 4 }]);
  mocks.http.mockImplementation(requestMock);
  mocks.https.mockImplementation(requestMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('destinos públicos y conexión DNS', () => {
  it('descarga la URL firmada de Instagram preservando dominio, ruta y parámetros', async () => {
    expect(await downloadImage(imageUrl)).toEqual(Buffer.from('imagen'));
    const [url, options] = mocks.https.mock.calls[0]!;
    expect(url.href).toBe(imageUrl);
    expect(options).toMatchObject({ agent: false, autoSelectFamily: true });
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith('scontent.cdninstagram.com', {
      all: true,
      verbatim: true,
    });
    expect(connections).toEqual([public4]);
    expect(responses[0]!.destroyed).toBe(true);
    expect(requests[0]!.destroy).toHaveBeenCalledOnce();
  });

  it.each([4, 6])(
    'usa la dirección validada de familia IPv%s sin una segunda consulta',
    async (family) => {
      const address = family === 4 ? public4 : public6;
      mocks.resolve
        .mockResolvedValueOnce([{ address, family }])
        .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await downloadImage(imageUrl);
      expect(connections).toEqual([address]);
      expect(mocks.resolve).toHaveBeenCalledTimes(1);
    },
  );

  it('acepta respuestas mixtas cuando todas las direcciones son públicas', async () => {
    mocks.resolve.mockResolvedValue([
      { address: public6, family: 6 },
      { address: public4, family: 4 },
    ]);
    await downloadImage(imageUrl);
    expect(connections).toEqual([public6]);
  });

  it.each([`http://${public4}/a`, `https://[${public6}]/a`])(
    'acepta la IP pública literal %s',
    async (url) => {
      await downloadImage(url);
      expect(mocks.resolve).not.toHaveBeenCalled();
      expect(connections).toHaveLength(1);
    },
  );

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.2',
    '169.254.169.254',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:5db8:d70e',
    '::127.0.0.1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '64:ff9b::7f00:1',
    '64:ff9b:1::1',
    '100::1',
    '2001::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '3ffe::1',
    '3fff::1',
    '4000::1',
  ])('rechaza la IP literal y la respuesta DNS %s sin conectar', async (address) => {
    const literal = isIP(address) === 6 ? `[${address}]` : address;
    expect(() => assertPublicHttpUrl(`http://${literal}/a`)).toThrow(MediaDownloadError);
    mocks.resolve.mockResolvedValue([{ address, family: isIP(address) }]);
    await expect(downloadImage(imageUrl)).rejects.toThrow(/red no permitida/);
    expect(connections).toEqual([]);
  });

  it.each([
    'http://2130706433/a',
    'http://0x7f000001/a',
    'http://0177.0.0.1/a',
    'http://localhost./a',
    'https://a.localhost./a',
    'https://a.local./a',
    'https://a.internal/a',
    'http://intranet/a',
    'ftp://example.com/a',
    'file:///etc/passwd',
    'https://user:secret@example.com/a',
    'inválida',
  ])('rechaza URL insegura o inválida %s antes de resolver', async (url) => {
    await expect(downloadImage(url)).rejects.toBeInstanceOf(MediaDownloadError);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(connections).toEqual([]);
  });

  it.each([
    [],
    [
      { address: public4, family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [
      { address: public4, family: 4 },
      { address: '::1', family: 6 },
    ],
    [{ address: 'no-es-ip', family: 4 }],
    [{ address: public4, family: 6 }],
  ])('rechaza resultados DNS vacíos, mixtos inseguros o inválidos: %j', async (...addresses) => {
    mocks.resolve.mockResolvedValue(addresses);
    await expect(downloadImage(imageUrl)).rejects.toThrow(/red no permitida/);
    expect(connections).toEqual([]);
  });

  it('controla errores DNS sin revelar detalles internos', async () => {
    mocks.resolve.mockRejectedValue(new Error('ENOTFOUND token=secreto 10.0.0.1'));
    await expect(downloadImage(imageUrl)).rejects.toThrow(
      'No pudimos resolver el servidor de la imagen.',
    );
    expect(connections).toEqual([]);
  });
});

describe('redirecciones y recursos', () => {
  it('sigue redirecciones relativas y entre CDN públicas, validando cada conexión', async () => {
    replies = [
      { status: 302, headers: { location: '/otra.jpg?oh=firma' } },
      { status: 307, headers: { location: 'https://scontent.xx.fbcdn.net/final.jpg' } },
      {},
    ];
    await downloadImage(imageUrl);
    expect(mocks.resolve).toHaveBeenCalledTimes(3);
    expect(mocks.https.mock.calls.map(([url]) => url.href)).toEqual([
      imageUrl,
      'https://scontent.cdninstagram.com/otra.jpg?oh=firma',
      'https://scontent.xx.fbcdn.net/final.jpg',
    ]);
    expect(responses.every((res) => res.destroyed)).toBe(true);
  });

  it.each(['http://127.0.0.1/a', 'http://[::ffff:10.0.0.1]/a', 'file:///etc/passwd'])(
    'bloquea el salto a %s',
    async (location) => {
      replies = [{ status: 302, headers: { location } }];
      await expect(downloadImage(imageUrl)).rejects.toBeInstanceOf(MediaDownloadError);
      expect(connections).toEqual([public4]);
    },
  );

  it('bloquea el DNS privado en una redirección, incluso al mismo host', async () => {
    replies = [{ status: 302, headers: { location: '/otra.jpg' } }];
    mocks.resolve
      .mockResolvedValueOnce([{ address: public4, family: 4 }])
      .mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    await expect(downloadImage(imageUrl)).rejects.toThrow(/red no permitida/);
    expect(connections).toEqual([public4]);
  });

  it('permite tres saltos y corta el cuarto sin abrir otra conexión', async () => {
    replies = Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/loop' } }));
    await expect(downloadImage(imageUrl)).rejects.toThrow(/demasiadas veces/);
    expect(connections).toHaveLength(4);
  });

  it.each([undefined, 'http://[inválida]'])(
    'controla Location ausente o inválido: %s',
    async (location) => {
      replies = [{ status: 302, headers: { location } }];
      await expect(downloadImage(imageUrl)).rejects.toBeInstanceOf(MediaDownloadError);
      expect(responses[0]!.destroyed).toBe(true);
    },
  );

  it('mantiene el error de imagen vencida de Instagram', async () => {
    replies = [{ status: 403 }];
    await expect(downloadImage(imageUrl)).rejects.toThrow(/Instagram.*vencido/);
  });

  it.each(['dns', 'headers', 'body'])('corta a los 15 segundos incluyendo %s', async (stage) => {
    vi.useFakeTimers();
    if (stage === 'dns') mocks.resolve.mockReturnValue(new Promise(() => {}));
    replies = [{ waitHeaders: stage === 'headers', waitBody: stage === 'body' }];
    const result = expect(downloadImage(imageUrl)).rejects.toThrow(/sin respuesta/);
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(requests[0]!.destroy).toHaveBeenCalledOnce();
    expect(responses.every((res) => res.destroyed)).toBe(true);
  });

  it('limita Content-Length y cancela antes de leer el cuerpo', async () => {
    replies = [
      { headers: { 'content-length': String(FILE_LIMITS.imageMaxBytes + 1) }, waitBody: true },
    ];
    await expect(downloadImage(imageUrl)).rejects.toThrow(/pesa demasiado/);
    expect(responses[0]!.destroyed).toBe(true);
  });

  it('limita bytes efectivos aunque Content-Length sea menor o falte', async () => {
    for (const headers of [{}, { 'content-length': '1' }]) {
      replies = [{ headers, chunks: [Buffer.from('123'), Buffer.from('456')] }];
      await expect(downloadImage(imageUrl, 5)).rejects.toThrow(/pesa demasiado/);
    }
    expect(responses.every((res) => res.destroyed)).toBe(true);
  });

  it.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const)(
    'conserva la descompresión %s y limita el tamaño descomprimido',
    async (encoding, compress) => {
      const chunks = [compress(Buffer.from('imagen'))];
      replies = [{ headers: { 'content-encoding': encoding }, chunks }];
      expect(await downloadImage(imageUrl)).toEqual(Buffer.from('imagen'));
      replies = [{ headers: { 'content-encoding': encoding }, chunks }];
      await expect(downloadImage(imageUrl, 5)).rejects.toThrow(/pesa demasiado/);
    },
  );

  it('controla errores del cuerpo sin exponer datos del transporte', async () => {
    replies = [{ bodyError: true }];
    await expect(downloadImage(imageUrl)).rejects.toThrow(
      'No pudimos descargar la imagen (sin respuesta del servidor).',
    );
  });
});

describe('contrato del cliente HTTP nativo sin sockets de red', () => {
  it('entrega al socket solo las IP validadas y conserva Host y la ruta firmada', async () => {
    const nativeHttp = await vi.importActual<typeof import('node:http')>('node:http');
    mocks.http.mockImplementation(nativeHttp.request);
    mocks.resolve
      .mockResolvedValueOnce([
        { address: public6, family: 6 },
        { address: public4, family: 4 },
      ])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    let wireRequest = '';
    let socketAddresses: string | LookupAddress[] | undefined;
    vi.spyOn(net, 'createConnection').mockImplementation((...args) => {
      const options = args[0] as unknown as net.TcpNetConnectOpts;
      const socket = Object.assign(
        new Duplex({
          read() {},
          write(chunk, _encoding, done) {
            wireRequest += chunk.toString();
            done();
            this.push(
              Buffer.from(
                'HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nimagen',
              ),
            );
            this.push(null);
          },
        }),
        {
          connecting: true,
          setKeepAlive() {
            return this;
          },
          setNoDelay() {
            return this;
          },
        },
      );
      options.lookup!(options.host!, { all: true }, (error, addresses) => {
        if (error) return void socket.destroy(error);
        socketAddresses = addresses;
        socket.connecting = false;
        socket.emit('connect');
      });
      return socket as unknown as net.Socket;
    });
    expect(await downloadImage(imageUrl.replace('https:', 'http:'))).toEqual(Buffer.from('imagen'));
    expect(socketAddresses).toEqual([
      { address: public6, family: 6 },
      { address: public4, family: 4 },
    ]);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(wireRequest).toContain('Host: scontent.cdninstagram.com');
    expect(wireRequest).toContain('GET /img/foto.jpg?oe=abc&oh=firma HTTP/1.1');
  });

  it('propaga el rechazo DNS a través del cliente nativo antes de conectar', async () => {
    const nativeHttp = await vi.importActual<typeof import('node:http')>('node:http');
    mocks.http.mockImplementation(nativeHttp.request);
    mocks.resolve.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(downloadImage('http://images.example.com/a')).rejects.toThrow(/red no permitida/);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });
});
