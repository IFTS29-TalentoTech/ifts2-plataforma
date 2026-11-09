/**
 * Lectura/escritura de ajustes del sitio (`SiteSetting`, clave/valor). ADR-022: ningún dato
 * institucional está escrito en el código; todo sale de acá.
 *
 * Representación: todo se guarda como texto. `exam_enrollment_open` se guarda como 'true'/'false'
 * y se expone como booleano.
 */
import type { Prisma } from '@prisma/client';
import {
  SETTING_IMAGE_KEYS,
  SETTING_KEYS,
  type PublicSettingsDto,
  type SettingKey,
  type SettingsDto,
} from '@ifts2/shared';
import type { Db } from '../infra/prisma';
import type { StorageProvider } from '../infra/storage';
import { resolveCoverSrc } from './cover';

type DbLike = Db | Prisma.TransactionClient;

/** Claves que no se publican en `/public/settings`. */
const PRIVATE_KEYS: ReadonlySet<SettingKey> = new Set(['instagram_hashtag']);

/** Mapa crudo { clave: valor } de lo que hay guardado (solo claves conocidas). */
export async function readRawSettings(db: DbLike): Promise<Partial<Record<SettingKey, string>>> {
  const rows = await db.siteSetting.findMany();
  const known = new Set<string>(SETTING_KEYS);
  const out: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) if (known.has(r.key)) out[r.key as SettingKey] = r.value;
  return out;
}

export const asBool = (v: string | undefined): boolean => v === 'true';

/** Valor a guardar para una clave (los booleanos pasan a 'true'/'false'). */
export const serializeSetting = (v: string | boolean): string =>
  typeof v === 'boolean' ? String(v) : v;

/**
 * Las imágenes subidas como archivo se guardan como CLAVE del almacenamiento (`site/<uuid>.webp`);
 * las URL firmadas vencen, así que acá se convierten en una URL utilizable al responder (igual que las
 * galerías, ADR-036). Las rutas propias (`/img/...`) y las direcciones https pasan tal cual. Si el
 * almacenamiento falla (RNF03) la imagen queda sin valor y el sitio muestra su respaldo.
 */
export async function resolveSettingImages(
  storage: StorageProvider,
  raw: Partial<Record<SettingKey, string>>,
): Promise<Partial<Record<SettingKey, string>>> {
  const out = { ...raw };
  await Promise.all(
    SETTING_IMAGE_KEYS.map(async (k) => {
      if (!raw[k]) return;
      const src = await resolveCoverSrc(storage, raw[k]);
      if (src) out[k] = src;
      else delete out[k];
    }),
  );
  return out;
}

/** Vista del panel: todas las claves, `null` si no hay valor, `exam_enrollment_open` booleano. */
export function toSettingsDto(raw: Partial<Record<SettingKey, string>>): SettingsDto {
  const out: Record<string, string | boolean | null> = {};
  for (const k of SETTING_KEYS) {
    out[k] = k === 'exam_enrollment_open' ? asBool(raw[k]) : (raw[k] ?? null);
  }
  return out as unknown as SettingsDto;
}

/** Vista pública: solo claves con valor y sin las privadas. */
export function toPublicSettingsDto(raw: Partial<Record<SettingKey, string>>): PublicSettingsDto {
  const out: Record<string, string | boolean> = {};
  for (const k of SETTING_KEYS) {
    if (PRIVATE_KEYS.has(k)) continue;
    if (k === 'exam_enrollment_open') {
      out[k] = asBool(raw[k]);
      continue;
    }
    const v = raw[k];
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out as PublicSettingsDto;
}
