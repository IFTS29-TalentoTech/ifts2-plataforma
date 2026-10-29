import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config';
import { createInstagramClient } from '../../src/infra/instagram';
import { IntegrationStore } from '../../src/infra/integration-store';
import {
  PUBLICATION_STATUSES,
  ROLES,
  NOTICE_STATUSES,
  DOCUMENT_KINDS,
  TERM_KINDS,
  SOCIAL_STATUSES,
  PUBLICATION_SECTIONS,
  PUBLICATION_ORIGINS,
  PUBLICATION_KINDS,
  NOTICE_AUDIENCES,
  DOCUMENT_STATUSES,
  MESSAGE_STATUSES,
} from '@ifts2/shared';

const base = {
  DATABASE_URL: 'postgresql://x',
  APP_ORIGIN: 'http://localhost:3000',
  API_ORIGIN: 'http://localhost:4000',
  APP_ENCRYPTION_KEY: 'ZGV2LW9ubHktZXhhbXBsZS1rZXktMzItYnl0ZXMhISE=',
};

describe('loadConfig', () => {
  it('con lo mínimo usa proveedores de demostración', () => {
    const c = loadConfig(base);
    expect(c.storage.provider).toBe('local');
    expect(c.mailer.provider).toBe('console');
    expect(c.instagram.provider).toBe('fake');
    expect(c.instagram.redirectUri).toBe(
      'http://localhost:4000/api/v1/integrations/instagram/callback',
    );
  });
  it('falla con mensaje claro si falta DATABASE_URL o la clave no mide 32 bytes', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, APP_ENCRYPTION_KEY: 'corta' })).toThrow(/32 bytes/);
  });
  it('STORAGE_PROVIDER=s3 exige bucket y credenciales', () => {
    expect(() => loadConfig({ ...base, STORAGE_PROVIDER: 's3' })).toThrow(/S3_BUCKET/);
    expect(
      loadConfig({
        ...base,
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'a',
        S3_SECRET_ACCESS_KEY: 's',
      }).storage.provider,
    ).toBe('s3');
  });
  it('MAILER_PROVIDER=smtp exige SMTP_URL; INSTAGRAM_PROVIDER=graph exige App ID y Secret', () => {
    expect(() => loadConfig({ ...base, MAILER_PROVIDER: 'smtp' })).toThrow(/SMTP_URL/);
    expect(() => loadConfig({ ...base, INSTAGRAM_PROVIDER: 'graph' })).toThrow(/INSTAGRAM_APP_ID/);
  });
  it('rechaza proveedores desconocidos', () => {
    expect(() => loadConfig({ ...base, STORAGE_PROVIDER: 'ftp' })).toThrow(ConfigError);
  });
});

describe('createInstagramClient sin base (valores por defecto del entorno)', () => {
  const store = { get: async () => null } as unknown as IntegrationStore;
  it('sin configuración => doble de demostración', async () => {
    expect((await createInstagramClient(loadConfig(base), store)).kind).toBe('fake');
  });
  it('INSTAGRAM_PROVIDER=graph con credenciales => Graph', async () => {
    const c = loadConfig({
      ...base,
      INSTAGRAM_PROVIDER: 'graph',
      INSTAGRAM_APP_ID: '1',
      INSTAGRAM_APP_SECRET: 's',
    });
    expect((await createInstagramClient(c, store)).kind).toBe('graph');
  });
});

describe('enums de shared alineados con prisma/schema.prisma', async () => {
  const client = await import('@prisma/client');
  it('todos los enums coinciden', () => {
    const pairs: Array<[readonly string[], Record<string, string>]> = [
      [ROLES, client.Role],
      [PUBLICATION_KINDS, client.PublicationKind],
      [PUBLICATION_STATUSES, client.PublicationStatus],
      [PUBLICATION_ORIGINS, client.PublicationOrigin],
      [PUBLICATION_SECTIONS, client.PublicationSection],
      [SOCIAL_STATUSES, client.SocialStatus],
      [NOTICE_STATUSES, client.NoticeStatus],
      [NOTICE_AUDIENCES, client.NoticeAudience],
      [DOCUMENT_KINDS, client.DocumentKind],
      [DOCUMENT_STATUSES, client.DocumentStatus],
      [TERM_KINDS, client.TermKind],
      [MESSAGE_STATUSES, client.MessageStatus],
    ];
    for (const [a, b] of pairs) expect([...a].sort()).toEqual(Object.values(b).sort());
  });
});
