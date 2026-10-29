import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * AES-256-GCM. Formato: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * `key` = APP_ENCRYPTION_KEY (32 bytes).
 */
export function encrypt(plain: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

/** Lanza si el valor fue alterado o la clave no corresponde. */
export function decrypt(payload: string, key: Buffer): string {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Formato de dato cifrado no válido.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function encryptJson(value: unknown, key: Buffer): string {
  return encrypt(JSON.stringify(value), key);
}
export function decryptJson<T>(payload: string, key: Buffer): T {
  return JSON.parse(decrypt(payload, key)) as T;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hmac(secret: string | Buffer, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "••••1234": muestra solo los últimos 4 caracteres. Nada secreto sale en claro de la API. */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
