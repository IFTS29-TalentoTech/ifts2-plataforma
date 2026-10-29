import { Router } from 'express';

const router = Router();

/**
 * GET /health (y /api/v1/health): estado de la API y la base, y proveedor activo de cada
 * integración (sin secretos). `demoMode` es true si algo corre con doble/consola: el panel lo
 * usa para mostrar el aviso "modo demostración".
 */
router.get('/', async (req, res) => {
  let db: 'ok' | 'error' = 'ok';
  try {
    await req.ctx.prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }

  let integrations: { storage: string; mailer: string; instagram: string } = {
    storage: req.ctx.storage.kind,
    mailer: 'unknown',
    instagram: 'unknown',
  };
  if (db === 'ok') {
    const [mail, ig] = await Promise.all([req.ctx.getMailer(), req.ctx.getInstagramClient()]);
    integrations = { storage: req.ctx.storage.kind, mailer: mail.mailer.kind, instagram: ig.kind };
  }
  const demoMode =
    integrations.mailer === 'console' ||
    integrations.mailer === 'fake' ||
    integrations.instagram === 'fake' ||
    integrations.storage === 'memory';

  res.status(db === 'ok' ? 200 : 503).json({
    status: db === 'ok' ? 'ok' : 'degraded',
    api: 'ok',
    db,
    integrations,
    demoMode,
    time: new Date().toISOString(),
  });
});

export default router;
