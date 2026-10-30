import { Router } from 'express';
import {
  instagramConfigInput,
  mailConfigInput,
  type InstagramConfigInput,
  type MailConfigInput,
} from '@ifts2/shared';
import { z } from 'zod';
import type { InstagramStoredConfig } from '../../infra/integration-store';
import { maskSecret } from '../../infra/crypto';
import { errors } from '../../infra/errors';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  GraphInstagramClient,
} from '../../infra/instagram';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { instagramView, signState, verifyState } from './instagram.service';

export const mountPath = '/integrations';
export const router = Router();

/**
 * Integraciones que el CLIENTE configura desde el panel (ADR-20). Solo ADMIN. Los secretos se guardan
 * cifrados (AES-256-GCM) y NUNCA salen en una respuesta: solo máscaras y estados.
 */
router.use(requirePermission('integrations:manage'));

// ---------------- Instagram ----------------

router.get('/instagram', async (req, res) => {
  res.json(await instagramView(req.ctx));
});

router.put('/instagram', validate({ body: instagramConfigInput }), async (req, res) => {
  const body = valid<InstagramConfigInput>(req, 'body');
  const { integrations, prisma } = req.ctx;
  const current: InstagramStoredConfig = (await integrations.get('instagram')) ?? { mode: 'demo' };
  const next: InstagramStoredConfig = { ...current };

  if (body.mode) next.mode = body.mode;
  if (body.appId && body.appId !== current.appId) {
    next.appId = body.appId;
    delete next.accessToken; // otra app: el token anterior ya no sirve
    delete next.tokenExpiresAt;
    delete next.username;
    next.lastError = null;
  }
  if (body.appSecret && body.appSecret !== current.appSecret) {
    next.appSecret = body.appSecret;
    delete next.accessToken;
    delete next.tokenExpiresAt;
    next.lastError = null;
  }
  if (body.accessToken) {
    next.accessToken = body.accessToken;
    next.connectedAt = new Date().toISOString();
    next.lastError = null;
    delete next.tokenExpiresAt; // se desconoce el vencimiento de un token pegado a mano
  }
  if (next.mode === 'real' && (!next.appId || !next.appSecret)) {
    throw errors.unprocessable('Para usar Instagram real cargá el App ID y el App Secret.', {
      ...(next.appId ? {} : { appId: ['El App ID es obligatorio.'] }),
      ...(next.appSecret ? {} : { appSecret: ['El App Secret es obligatorio.'] }),
    });
  }

  await prisma.$transaction(async (tx) => {
    if (body.hashtag) {
      await tx.siteSetting.upsert({
        where: { key: 'instagram_hashtag' },
        create: { key: 'instagram_hashtag', value: body.hashtag },
        update: { value: body.hashtag },
      });
    }
    await audit.fromReq(
      req,
      {
        action: 'integration.instagram.update',
        entity: 'IntegrationConfig',
        entityId: 'instagram',
        // Solo nombres de campos y modo: nunca valores secretos.
        detail: { fields: Object.keys(body), mode: next.mode },
      },
      tx,
    );
  });
  await integrations.set('instagram', next, req.auth!.user.id);
  res.json(await instagramView(req.ctx));
});

/** Devuelve la URL de autorización para el botón "Conectar con Instagram". */
router.get('/instagram/connect', async (req, res) => {
  const stored = await req.ctx.integrations.get('instagram');
  const appId = stored?.appId ?? req.ctx.config.instagram.appId;
  if (!appId || !(stored?.appSecret ?? req.ctx.config.instagram.appSecret)) {
    throw errors.unprocessable('Primero guardá el App ID y el App Secret de tu app de Meta.');
  }
  const url = buildAuthorizationUrl({
    appId,
    redirectUri: req.ctx.config.instagram.redirectUri,
    state: signState(req.ctx, req.auth!.user.id),
  });
  res.json({ url });
});

const callbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/** Destino al que Meta redirige tras autorizar. Guarda el token cifrado y vuelve al panel. */
router.get('/instagram/callback', validate({ query: callbackQuery }), async (req, res) => {
  const q = valid<z.infer<typeof callbackQuery>>(req, 'query');
  const back = (result: 'connected' | 'error') =>
    res.redirect(`${req.ctx.config.appOrigin}/panel/configuracion?instagram=${result}`);
  const { integrations } = req.ctx;
  const stored = await integrations.get('instagram');

  const fail = async (message: string) => {
    if (stored) await integrations.patch('instagram', { lastError: message }, req.auth!.user.id);
    return back('error');
  };

  if (q.error) return fail(q.error_description ?? 'Se canceló la autorización en Instagram.');
  if (!q.code || !q.state || !verifyState(req.ctx, q.state, req.auth!.user.id)) {
    return fail('La autorización no es válida o venció. Intentá conectar de nuevo.');
  }
  if (!stored?.appId || !stored.appSecret) {
    return fail('Faltan el App ID y el App Secret.');
  }
  try {
    const grant = await exchangeCodeForToken(
      {
        appId: stored.appId,
        appSecret: stored.appSecret,
        redirectUri: req.ctx.config.instagram.redirectUri,
        code: q.code,
      },
      req.ctx.fetch,
    );
    const probe = await new GraphInstagramClient({
      appId: stored.appId,
      appSecret: stored.appSecret,
      accessToken: grant.accessToken,
      fetchFn: req.ctx.fetch,
    }).testConnection();
    await integrations.set(
      'instagram',
      {
        ...stored,
        mode: 'real',
        accessToken: grant.accessToken,
        tokenExpiresAt: grant.expiresAt.toISOString(),
        username: probe.username,
        connectedAt: new Date().toISOString(),
        lastError: null,
      },
      req.auth!.user.id,
    );
    await audit.fromReq(req, {
      action: 'integration.instagram.connect',
      entity: 'IntegrationConfig',
      entityId: 'instagram',
    });
    return back('connected');
  } catch (e) {
    req.ctx.logger.warn(
      { message: (e as Error).message },
      'falló el canje del código de Instagram',
    );
    return fail(
      'No pudimos completar la conexión con Instagram. Revisá las credenciales e intentá de nuevo.',
    );
  }
});

router.post('/instagram/test', async (req, res) => {
  const client = await req.ctx.getInstagramClient();
  const result = await client.testConnection();
  const stored = await req.ctx.integrations.get('instagram');
  if (stored && client.kind === 'graph') {
    await req.ctx.integrations.patch(
      'instagram',
      {
        lastError: result.ok ? null : (result.error ?? 'Error desconocido'),
        ...(result.username ? { username: result.username } : {}),
      },
      req.auth!.user.id,
    );
  }
  await audit.fromReq(req, {
    action: 'integration.instagram.test',
    entity: 'IntegrationConfig',
    entityId: 'instagram',
    detail: { ok: result.ok, client: client.kind },
  });
  res.json({
    ok: result.ok,
    demo: client.kind === 'fake',
    username: result.username ?? null,
    error: result.error ?? null,
  });
});

/** Borra credenciales y token y vuelve al modo demostración (aunque el entorno tenga valores por defecto). */
router.post('/instagram/disconnect', async (req, res) => {
  await req.ctx.integrations.set('instagram', { mode: 'demo' }, req.auth!.user.id);
  await audit.fromReq(req, {
    action: 'integration.instagram.disconnect',
    entity: 'IntegrationConfig',
    entityId: 'instagram',
  });
  res.json(await instagramView(req.ctx));
});

// ---------------- Correo ----------------

function maskSmtp(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? '••••@' : ''}${u.host}`;
  } catch {
    return maskSecret(url);
  }
}

async function mailView(req: import('express').Request) {
  const stored = await req.ctx.integrations.get('mail');
  const resolved = await req.ctx.getMailer();
  return {
    provider: resolved.mailer.kind,
    source: resolved.source,
    demoMode: resolved.mailer.kind !== 'smtp',
    contactToEmail: resolved.contactTo,
    smtpConfigured: resolved.mailer.kind === 'smtp',
    smtpMasked: maskSmtp(stored?.smtpUrl ?? req.ctx.config.mailer.smtpUrl),
  };
}

router.get('/mail', async (req, res) => {
  res.json(await mailView(req));
});

router.put('/mail', validate({ body: mailConfigInput }), async (req, res) => {
  const body = valid<MailConfigInput>(req, 'body');
  const { integrations } = req.ctx;
  const next = { ...((await integrations.get('mail')) ?? {}) };
  if (body.contactToEmail) next.contactToEmail = body.contactToEmail;
  if (body.smtpUrl !== undefined) {
    if (body.smtpUrl === null) delete next.smtpUrl;
    else next.smtpUrl = body.smtpUrl;
  }
  await integrations.set('mail', next, req.auth!.user.id);
  await audit.fromReq(req, {
    action: 'integration.mail.update',
    entity: 'IntegrationConfig',
    entityId: 'mail',
    detail: { fields: Object.keys(body) },
  });
  res.json(await mailView(req));
});

/** Envía un correo de prueba al destino de contacto. Falla con 502 si el servicio de correo no responde. */
router.post('/mail/test', async (req, res) => {
  const { mailer, contactTo } = await req.ctx.getMailer();
  if (!contactTo) throw errors.unprocessable('Cargá primero el correo de destino de contacto.');
  try {
    await mailer.send({
      to: contactTo,
      subject: 'Prueba de correo del sitio',
      text: 'Este es un correo de prueba enviado desde el panel de gestión.',
    });
  } catch {
    throw errors.badGateway('No pudimos enviar el correo de prueba. Revisá la conexión SMTP.');
  }
  res.json({ ok: true, demo: mailer.kind !== 'smtp' });
});
