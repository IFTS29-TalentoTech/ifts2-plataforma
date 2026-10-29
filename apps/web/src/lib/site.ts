import type { SettingKey } from '@ifts2/shared';
import { api } from './api';

/**
 * Datos de la institución. NO se escriben en el código: viven en SiteSetting (se cargan desde el
 * panel y la semilla) y se leen de `GET /public/settings` (respuesta plana { clave: valor }).
 * Así el producto puede reutilizarse para otra institución sin tocar componentes.
 */
export interface SiteInfo {
  name: string;
  short: string;
  subtitle: string;
  footerText: string;
  address: string;
  phone: string;
  emailInstitutional: string;
  emailBedelia: string;
  instagramUrl: string;
  facebookUrl: string;
  tagline: string;
}

/** Valores genéricos mientras no hay configuración (nunca texto de una institución concreta). */
const GENERIC: SiteInfo = {
  name: 'Sitio institucional',
  short: 'Institución',
  subtitle: '',
  footerText: '',
  address: '',
  phone: '',
  emailInstitutional: '',
  emailBedelia: '',
  instagramUrl: '',
  facebookUrl: '',
  tagline: '',
};

export function toSiteInfo(s: Partial<Record<SettingKey, string>>): SiteInfo {
  return {
    name: s.institution_name ?? GENERIC.name,
    short: s.institution_short ?? GENERIC.short,
    subtitle: s.institution_subtitle ?? GENERIC.subtitle,
    footerText:
      s.footer_text ?? [s.institution_short, s.institution_subtitle].filter(Boolean).join(' • '),
    address: s.address ?? '',
    phone: s.phone ?? '',
    emailInstitutional: s.email_institutional ?? '',
    emailBedelia: s.email_bedelia ?? '',
    instagramUrl: s.instagram_url ?? '',
    facebookUrl: s.facebook_url ?? '',
    tagline: s.tagline ?? '',
  };
}

/** Lee la configuración pública (cacheada 60 s, ADR-10). Si la API no responde, usa valores genéricos. */
export async function getSiteInfo(): Promise<SiteInfo> {
  try {
    const settings = await api.get<Partial<Record<SettingKey, string>>>('/public/settings', {
      next: { revalidate: 60, tags: ['settings'] },
    });
    return toSiteInfo(settings);
  } catch {
    return GENERIC;
  }
}
