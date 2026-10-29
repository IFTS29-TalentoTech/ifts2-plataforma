import { z } from 'zod';

/**
 * Configuración validada con zod desde variables de entorno. Si falta algo que el proveedor
 * elegido exige, la API NO arranca y explica qué falta (ADR de integraciones seteables).
 *
 * Instagram y correo se configuran principalmente desde el panel (se guardan cifrados en la base);
 * las variables de entorno de esos dos servicios son solo valores por defecto.
 */
const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL (conexión PostgreSQL).'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGIN: z.string().url('APP_ORIGIN debe ser una URL (ej. http://localhost:3000).'),
    API_ORIGIN: z.string().url('API_ORIGIN debe ser una URL (ej. http://localhost:4000).'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    SESSION_COOKIE_NAME: z.string().min(1).default('ifts2_session'),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
    SESSION_REMEMBER_DAYS: z.coerce.number().positive().default(14),
    APP_ENCRYPTION_KEY: z
      .string()
      .min(1, 'Falta APP_ENCRYPTION_KEY (32 bytes en base64).')
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message:
          'APP_ENCRYPTION_KEY debe ser de 32 bytes en base64. Generá una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      }),
    REVALIDATE_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().positive().default(15),

    // Almacenamiento (infraestructura: lo maneja DevOps, solo por entorno)
    STORAGE_PROVIDER: z.enum(['local', 'memory', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('uploads'),
    STORAGE_SIGNING_SECRET: z.string().optional(),
    STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_PUBLIC_URL: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool,

    // Correo: valor por defecto; el cliente lo cambia desde el panel
    MAILER_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    SMTP_URL: z.string().optional(),
    CONTACT_TO_EMAIL: z.string().optional(),

    // Instagram: valor por defecto; el cliente lo configura desde el panel
    INSTAGRAM_PROVIDER: z.enum(['fake', 'graph']).default('fake'),
    INSTAGRAM_APP_ID: z.string().optional(),
    INSTAGRAM_APP_SECRET: z.string().optional(),
    INSTAGRAM_REDIRECT_URI: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (cond: unknown, path: string, msg: string) => {
      if (!cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: msg });
    };
    if (e.STORAGE_PROVIDER === 's3') {
      need(e.S3_BUCKET, 'S3_BUCKET', 'STORAGE_PROVIDER=s3 exige S3_BUCKET.');
      need(e.S3_ACCESS_KEY_ID, 'S3_ACCESS_KEY_ID', 'STORAGE_PROVIDER=s3 exige S3_ACCESS_KEY_ID.');
      need(
        e.S3_SECRET_ACCESS_KEY,
        'S3_SECRET_ACCESS_KEY',
        'STORAGE_PROVIDER=s3 exige S3_SECRET_ACCESS_KEY.',
      );
    }
    if (e.STORAGE_PROVIDER === 'local' && e.NODE_ENV === 'production') {
      need(
        e.STORAGE_SIGNING_SECRET,
        'STORAGE_SIGNING_SECRET',
        'En produccion, STORAGE_PROVIDER=local exige STORAGE_SIGNING_SECRET.',
      );
    }
    if (e.MAILER_PROVIDER === 'smtp') {
      need(e.SMTP_URL, 'SMTP_URL', 'MAILER_PROVIDER=smtp exige SMTP_URL (ej. smtp://usuario:clave@host:587).');
    }
    if (e.INSTAGRAM_PROVIDER === 'graph') {
      need(e.INSTAGRAM_APP_ID, 'INSTAGRAM_APP_ID', 'INSTAGRAM_PROVIDER=graph exige INSTAGRAM_APP_ID.');
      need(
        e.INSTAGRAM_APP_SECRET,
        'INSTAGRAM_APP_SECRET',
        'INSTAGRAM_PROVIDER=graph exige INSTAGRAM_APP_SECRET.',
      );
    }
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProd: boolean;
  databaseUrl: string;
  port: number;
  appOrigin: string;
  apiOrigin: string;
  trustProxy: number;
  logLevel: string;
  revalidateSecret?: string;
  session: { cookieName: string; ttlHours: number; rememberDays: number; secureCookie: boolean };
  loginLimit: { max: number; windowMs: number };
  encryptionKey: Buffer;
  storage: {
    provider: 'local' | 'memory' | 's3';
    localDir: string;
    signingSecret: string;
    signedUrlTtlSeconds: number;
    s3: {
      endpoint?: string;
      bucket?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      region: string;
      publicUrl?: string;
      forcePathStyle: boolean;
    };
  };
  mailer: { provider: 'console' | 'smtp'; smtpUrl?: string; contactToEmail?: string };
  instagram: {
    provider: 'fake' | 'graph';
    appId?: string;
    appSecret?: string;
    redirectUri: string;
  };
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuración inválida:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const apiOrigin = e.API_ORIGIN.replace(/\/$/, '');
  return {
    nodeEnv: e.NODE_ENV,
    isProd,
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    appOrigin: e.APP_ORIGIN.replace(/\/$/, ''),
    apiOrigin,
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    revalidateSecret: e.REVALIDATE_SECRET,
    session: {
      cookieName: e.SESSION_COOKIE_NAME,
      ttlHours: e.SESSION_TTL_HOURS,
      rememberDays: e.SESSION_REMEMBER_DAYS,
      secureCookie: e.APP_ORIGIN.startsWith('https://'),
    },
    loginLimit: { max: e.LOGIN_MAX_ATTEMPTS, windowMs: e.LOGIN_WINDOW_MINUTES * 60_000 },
    encryptionKey: Buffer.from(e.APP_ENCRYPTION_KEY, 'base64'),
    storage: {
      provider: e.STORAGE_PROVIDER,
      localDir: e.STORAGE_LOCAL_DIR,
      signingSecret: e.STORAGE_SIGNING_SECRET ?? 'dev-only-storage-signing-secret',
      signedUrlTtlSeconds: e.STORAGE_SIGNED_URL_TTL_SECONDS,
      s3: {
        endpoint: e.S3_ENDPOINT || undefined,
        bucket: e.S3_BUCKET || undefined,
        accessKeyId: e.S3_ACCESS_KEY_ID || undefined,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY || undefined,
        region: e.S3_REGION,
        publicUrl: e.S3_PUBLIC_URL || undefined,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
      },
    },
    mailer: {
      provider: e.MAILER_PROVIDER,
      smtpUrl: e.SMTP_URL || undefined,
      contactToEmail: e.CONTACT_TO_EMAIL || undefined,
    },
    instagram: {
      provider: e.INSTAGRAM_PROVIDER,
      appId: e.INSTAGRAM_APP_ID || undefined,
      appSecret: e.INSTAGRAM_APP_SECRET || undefined,
      redirectUri: e.INSTAGRAM_REDIRECT_URI || `${apiOrigin}/api/v1/integrations/instagram/callback`,
    },
  };
}
