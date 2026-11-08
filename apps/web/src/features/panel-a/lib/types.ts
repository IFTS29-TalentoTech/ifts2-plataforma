/**
 * Tipos de las respuestas del panel (parte A) que NO están en `@ifts2/shared`.
 * Los de avisos (`NoticeDto`), contacto (`ContactMessageDto`) y documentos vienen de `@ifts2/shared`.
 * Las formas salen de docs/specs/04-api.md y de los README de apps/api/src/modules/{dashboard,social,publications}.
 */
import type {
  PublicationKind,
  PublicationOrigin,
  PublicationSection,
  PublicationStatus,
  SocialStatus,
} from '@ifts2/shared';

/** Respuestas paginadas: `{ items, page, pageSize, total }`. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type InstagramStatus = 'demo' | 'credentials_saved' | 'connected' | 'expiring' | 'error';

/** GET /dashboard (apps/api/src/modules/dashboard/README.md). */
export interface DashboardDto {
  instagram: {
    mode: 'demo' | 'real';
    status: InstagramStatus;
    ok: boolean;
    lastSyncAt: string | null;
    /** Último fetch exitoso y su tipo (ADR-038). */
    lastFetchAt?: string | null;
    lastSyncMode?: 'incremental' | 'full' | null;
    error?: string;
    tokenExpiresAt?: string;
    hashtag: string | null;
  };
  pendingPosts: number;
  activeNotices: number;
  noticesExpiringIn7Days: number;
  currentTerm: { id: string; year: number; kind: string; label: string } | null;
  examCallNext: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    enrollmentOpen: boolean;
    published: boolean;
  } | null;
  ingresoCycle: { year: number; derived: boolean } | null;
  /** A14: estado real de la página de Ingreso (secciones visibles y datos "[a confirmar]"). */
  ingresoContent: { visibleSections: number; pendingConfirmation: boolean };
}

/** Elemento de GET /social/posts. */
export interface SocialPostDto {
  id: string;
  source: 'instagram' | 'manual';
  permalink: string;
  caption: string;
  /** Dirección original de la imagen (puede expirar). */
  mediaUrl: string;
  postedAt: string;
  status: SocialStatus;
  detectedAt: string;
  moderatedAt: string | null;
  moderatedByName: string | null;
  publication: { id: string; title: string; status: string; coverSrc: string | null } | null;
}

export interface SocialPostsPage extends Page<SocialPostDto> {
  counts: Record<SocialStatus, number>;
}

export interface SyncResultDto {
  created: number;
  matched: number;
  alreadyKnown: number;
  demo: boolean;
  lastSyncAt: string;
  /** `incremental` (solo lo posterior al último fetch exitoso) o `full` (carga completa). */
  mode: 'incremental' | 'full';
  lastFetchAt: string;
}

/** Elemento de GET /publications. */
export interface PublicationDto {
  id: string;
  kind: PublicationKind;
  title: string;
  summary: string;
  body: string;
  coverUrl: string | null;
  coverSrc: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  section: PublicationSection;
  status: PublicationStatus;
  origin: PublicationOrigin;
  socialPermalink: string | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  createdAt: string;
  updatedAt: string;
  visible: boolean;
  expired: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  kind: 'PUBLICATION' | 'NOTICE' | 'GALLERY';
  usageCount?: number;
}
