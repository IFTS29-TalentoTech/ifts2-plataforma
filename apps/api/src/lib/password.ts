import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** argon2id (ADR-06). @node-rs/argon2 trae binarios precompilados (funciona en Windows) y usa argon2id por defecto. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Hash de relleno para igualar tiempos cuando el correo no existe (evita enumerar usuarios). */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword('relleno-para-igualar-tiempos-1'));
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** Clave temporal legible (sin caracteres ambiguos) que cumple la regla letras + números. */
export function generateTempPassword(length = 14): string {
  const all = LETTERS + DIGITS;
  const chars = [
    LETTERS[randomInt(LETTERS.length)]!,
    DIGITS[randomInt(DIGITS.length)]!,
    ...Array.from({ length: length - 2 }, () => all[randomInt(all.length)]!),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
