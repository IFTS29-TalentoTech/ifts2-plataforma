/**
 * Módulo `dashboard` — datos del Resumen del panel (US-12, pantalla 07 del Figma).
 *
 * `GET /dashboard` junta en una sola respuesta lo que muestran las tarjetas: estado de Instagram,
 * publicaciones de redes por moderar, avisos activos y por vencer, ciclo vigente, próximo llamado a examen
 * e ingreso. Lee las tablas con Prisma directamente (los avisos, ciclos y llamados los administran otros
 * módulos; acá solo se consultan) y calcula la vigencia con las reglas de @ifts2/shared, al consultar.
 * Permiso: `dashboard:read` (los tres roles).
 */
import { Router } from 'express';
import {
  EXPIRING_SOON_DAYS,
  hasPendingConfirmation,
  isNoticeExpiringSoon,
  isNoticeVisible,
  TERM_KIND_LABELS,
  toDateStrBA,
} from '@ifts2/shared';
import type { AppContext } from '../../context';
import { requirePermission } from '../../middleware/auth';
import { instagramView } from '../integrations/instagram.service';

export const mountPath = '/dashboard';
export const router = Router();

/**
 * Estado de Instagram para la tarjeta "Instagram API". `ok=false` muestra el estado de error con su motivo
 * (RF04: si falla, el Resumen lo dice y el panel ofrece la carga manual sin impedir el resto).
 * Nunca incluye secretos: `instagramView` solo expone máscaras y fechas.
 */
async function instagramCard(ctx: AppContext) {
  const v = await instagramView(ctx);
  const real = v.mode === 'real';
  let error: string | undefined;
  if (v.lastError) error = v.lastError;
  else if (real && v.status === 'credentials_saved')
    error = 'Falta conectar la cuenta de Instagram.';
  else if (real && v.lastSyncOk === false) error = 'La última sincronización falló.';
  const ok = !real || (v.status !== 'credentials_saved' && !error);
  return {
    /** 'demo' = sin cuenta real (modo demostración); 'real' = cuenta conectada o por conectar. */
    mode: v.mode,
    /** Mismos estados que Configuración: demo, credentials_saved, connected, expiring, error. */
    status: v.status,
    ok,
    lastSyncAt: v.lastSyncAt,
    ...(error ? { error } : {}),
    ...(real && v.tokenExpiresAt ? { tokenExpiresAt: v.tokenExpiresAt } : {}),
    hashtag: v.hashtag,
  };
}

router.get('/', requirePermission('dashboard:read'), async (req, res) => {
  const { prisma } = req.ctx;
  const now = new Date();

  const [instagram, pendingPosts, activeCandidates, currentTerm, nextExam, ingresoSections] =
    await Promise.all([
      instagramCard(req.ctx),
      prisma.socialPost.count({ where: { status: 'DETECTED' } }),
      // Candidatos en la base (activos, ya iniciados, sin vencer); la regla final la aplican los helpers compartidos.
      prisma.notice.findMany({
        where: {
          status: 'ACTIVE',
          visibleFrom: { lte: now },
          OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
        },
        select: { status: true, visibleFrom: true, visibleUntil: true },
      }),
      prisma.academicTerm.findFirst({ where: { publicCurrent: true } }),
      prisma.examCall.findFirst({
        where: { endsOn: { gte: now } },
        orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
      }),
      // A14: lo que realmente publica la página de Ingreso (mismas secciones que ve el público).
      prisma.contentSection.findMany({
        where: { page: 'ingreso', visible: true },
        select: { title: true, body: true },
      }),
    ]);

  const visible = activeCandidates.filter((n) => isNoticeVisible(n, now));
  const expiring = visible.filter((n) => isNoticeExpiringSoon(n, now, EXPIRING_SOON_DAYS));

  // Ingreso: la inscripción del ciclo lectivo SIGUIENTE (en octubre se inscribe para el año que viene).
  // No existe aún un dato propio de ingreso; se deriva del año del ciclo vigente (`derived: true`):
  // la tarjeta lo presenta como ESTIMADO, no como dato institucional (A14).
  const baseYear = currentTerm?.year ?? Number(toDateStrBA(now).slice(0, 4));

  res.json({
    instagram,
    pendingPosts,
    activeNotices: visible.length,
    noticesExpiringIn7Days: expiring.length,
    currentTerm: currentTerm
      ? {
          id: currentTerm.id,
          year: currentTerm.year,
          kind: currentTerm.kind,
          label: `${TERM_KIND_LABELS[currentTerm.kind]} ${currentTerm.year}`,
          startsOn: currentTerm.startsOn,
          endsOn: currentTerm.endsOn,
        }
      : null,
    examCallNext: nextExam
      ? {
          id: nextExam.id,
          name: nextExam.name,
          startsOn: nextExam.startsOn,
          endsOn: nextExam.endsOn,
          enrollmentOpen: nextExam.enrollmentOpen,
          published: nextExam.published,
        }
      : null,
    ingresoCycle: { year: baseYear + 1, derived: true },
    // A14: estado verificable de la página de Ingreso, en lugar de afirmar una preinscripción activa.
    // `pendingConfirmation` = algún texto visible tiene la marca "[a confirmar ...]" (regla 10).
    ingresoContent: {
      visibleSections: ingresoSections.length,
      pendingConfirmation: ingresoSections.some(
        (s) => hasPendingConfirmation(s.title) || hasPendingConfirmation(s.body),
      ),
    },
  });
});
