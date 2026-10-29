import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, decryptJson, encrypt, encryptJson, maskSecret } from '../../src/infra/crypto';

const key = randomBytes(32);

describe('cifrado AES-256-GCM del token de Instagram', () => {
  it('el valor descifrado coincide con el original', () => {
    const token = 'IGQWRPtoken-de-larga-duracion-123456';
    const enc = encrypt(token, key);
    expect(enc).not.toContain(token);
    expect(decrypt(enc, key)).toBe(token);
  });

  it('cifrar dos veces el mismo valor produce resultados distintos (IV aleatorio)', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key));
  });

  it('un token alterado falla al descifrar', () => {
    const enc = encrypt('secreto', key);
    const parts = enc.split('.');
    const data = Buffer.from(parts[3]!, 'base64url');
    data[0] = data[0]! ^ 0xff;
    parts[3] = data.toString('base64url');
    expect(() => decrypt(parts.join('.'), key)).toThrow();
  });

  it('una clave distinta falla al descifrar', () => {
    expect(() => decrypt(encrypt('secreto', key), randomBytes(32))).toThrow();
  });

  it('exige una clave de 32 bytes', () => {
    expect(() => encrypt('x', Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it('JSON ida y vuelta', () => {
    const v = { appId: '1', nested: { a: [1, 2] } };
    expect(decryptJson(encryptJson(v, key), key)).toEqual(v);
  });

  it('maskSecret muestra solo los últimos 4 caracteres', () => {
    expect(maskSecret('abcdef123456')).toBe('••••3456');
    expect(maskSecret(null)).toBeNull();
  });
});
