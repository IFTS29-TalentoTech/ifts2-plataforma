/**
 * Piezas visuales compartidas por las páginas públicas (hero, secciones, tarjetas, archivos,
 * paginación por enlaces). Son componentes de servidor; CoverImage aísla el manejo de errores.
 *
 * Reglas de estilo: SOLO clases del tema (tokens CSS); nada de hex ni fuentes a mano (ADR-021).
 * Contraste (RNF07): el hero usa `primary-strong` con texto `surface` (5,0:1); el color `primary`
 * original del Figma no alcanza AA con texto blanco (ver ADR-021).
 */
import { ArrowRight, ArrowUpRight, Download, FileText, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PublicFileDto, PublicPublicationCardDto } from '@ifts2/shared';
import { Badge, Button, Card, ErrorState, Eyebrow } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateAR } from '@/lib/dates';
import { formatBytes } from './data';
import { CoverImage } from './cover-image';
import { canOptimizeCover } from './cover-policy';

/** Contenedor centrado estándar (ancho máximo + gutters del tema). */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto max-w-container px-gutter lg:px-gutter-lg', className)}>
      {children}
    </div>
  );
}

/** Franja de título de página (un único h1 por página: RNF07). `aside` es la ficha lateral opcional. */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="bg-primary-strong text-surface">
      <Container className="flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:py-14">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wider text-surface">{eyebrow}</p>
          )}
          <h1 className="mt-2 break-words font-display text-3xl font-extrabold leading-tight sm:text-4xl">
            {title}
          </h1>
          {description && <div className="mt-4 text-lg text-surface">{description}</div>}
          {actions && <div className="mt-6 flex flex-col gap-3 sm:flex-row">{actions}</div>}
        </div>
        {aside && <div className="lg:shrink-0">{aside}</div>}
      </Container>
    </section>
  );
}

/** Bloque con encabezado "etiqueta + h2" como en el Figma ("ACCESOS RÁPIDOS / ¿Qué necesitás encontrar?"). */
export function Section({
  eyebrow,
  title,
  id,
  children,
  className,
  action,
}: {
  eyebrow?: string;
  title?: string;
  id?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={title ? `${id ?? title}-t` : undefined}>
      <Container className={cn('py-8 lg:py-10', className)}>
        {(eyebrow || title) && (
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {title && (
                <h2
                  id={`${id ?? title}-t`}
                  className="mt-1 font-display text-2xl font-extrabold text-accent-3"
                >
                  {title}
                </h2>
              )}
            </div>
            {action}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

/** Tarjeta completa clickeable (accesos rápidos, enlaces de interés). Externos: pestaña nueva y `rel` seguro. */
export function LinkCard({
  href,
  title,
  description,
  external,
}: {
  href: string;
  title: string;
  description?: string | null;
  external?: boolean;
}) {
  const body = (
    <Card
      accentBar
      className="flex h-full min-h-28 flex-col gap-2 transition-shadow hover:shadow-popover"
    >
      <span className="flex items-start justify-between gap-2 font-display text-lg font-bold text-accent-3">
        {title}
        {external ? (
          <>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </>
        ) : null}
      </span>
      {description && <span className="text-sm text-font-strong">{description}</span>}
    </Card>
  );
  const cls = 'block h-full rounded-lg focus-visible:outline-none focus-visible:shadow-focus';
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** Portada con `next/image`: dimensiones explícitas (sin saltos de layout) y carga diferida (RNF05). */
export function Cover({
  src,
  alt,
  width,
  height,
  priority,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <CoverImage
      key={src}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes ?? '(min-width: 1024px) 380px, 100vw'}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      unoptimized={!canOptimizeCover(src, process.env.API_ORIGIN ?? 'http://localhost:4000')}
      className={cn('h-auto w-full object-cover', className)}
    />
  );
}

/** Tarjeta de novedad (Inicio y Novedades). Sin portada se muestra un bloque neutro, sin imagen rota. */
export function PublicationCard({
  p,
  archived,
}: {
  p: PublicPublicationCardDto;
  archived?: boolean;
}) {
  const href = `/novedades/${p.id}${archived ? '?archived=true' : ''}`;
  return (
    <Card padded={false} className="relative flex h-full flex-col overflow-hidden">
      {p.coverUrl ? (
        <Cover
          src={p.coverUrl}
          alt=""
          width={640}
          height={360}
          className="aspect-video"
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
        />
      ) : (
        // Sin portada: bloque neutro del mismo tamaño, así la grilla no queda despareja.
        <div
          aria-hidden="true"
          className="flex aspect-video w-full items-center justify-center bg-accent-2 text-accent"
        >
          <ImageIcon className="h-8 w-8" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {p.category && <Badge>{p.category.name}</Badge>}
          <time dateTime={p.date} className="text-xs text-font-strong">
            {formatDateAR(p.date)}
          </time>
        </div>
        <h3 className="font-display text-lg font-bold text-accent-3">
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:shadow-focus"
          >
            {p.title}
          </Link>
        </h3>
        {p.summary && <p className="text-sm text-font-strong">{p.summary}</p>}
        <span
          aria-hidden="true"
          className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-accent"
        >
          Ver publicación <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

/**
 * Descarga de un archivo adjunto. `downloadUrl` puede ser null si el almacenamiento falló
 * (RNF03): en ese caso se muestra el nombre y un aviso, sin enlace roto.
 */
export function FileLink({ file, label }: { file: PublicFileDto | null; label?: string }) {
  if (!file) return null;
  const meta = `${file.mimeType.split('/')[1]?.toUpperCase() ?? 'Archivo'} · ${formatBytes(file.sizeBytes)}`;
  if (!file.downloadUrl) {
    return (
      <p className="flex items-center gap-2 text-sm text-font-strong">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {label ?? file.title}: el archivo no está disponible por el momento. Probá de nuevo en
          unos minutos.
        </span>
      </p>
    );
  }
  return (
    <Button asChild variant="secondary" size="sm" className="w-fit">
      <a href={file.downloadUrl} download={file.filename} rel="noopener noreferrer">
        <Download className="h-4 w-4" aria-hidden="true" />
        {label ?? 'Descargar'}
        <span className="font-normal text-font-strong">({meta})</span>
        <span className="sr-only">: {file.title}</span>
      </a>
    </Button>
  );
}

/** Error de carga de una sección: la página sigue en pie (RNF03). Lenguaje claro, sin códigos. */
export function SectionError({ what }: { what: string }) {
  return (
    <ErrorState
      title={`No pudimos cargar ${what}`}
      description="Hubo un problema al obtener la información. Recargá la página en unos minutos."
    />
  );
}

/** Paginación por enlaces (funciona sin JavaScript y es cacheable). `hrefFor(n)` arma la URL de la página n. */
export function LinkPagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-font-strong"
    >
      <p>
        Página {page} de {pages} ({total} publicaciones)
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={hrefFor(page - 1)} rel="prev">
              Anterior
            </Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={hrefFor(page + 1)} rel="next">
              Siguiente
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/**
 * Fotos del encabezado de Inicio (Figma 01): dos fotos superpuestas a la derecha en escritorio y
 * apiladas debajo del texto en móvil. Son decorativas (alt vacío: el titular ya dice de qué trata).
 * Sin ninguna imagen configurada no se dibuja nada y el encabezado queda solo con texto.
 */
export function HeroPhotos({ first, second }: { first?: string; second?: string }) {
  if (!first && !second) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row lg:relative lg:block lg:h-72 lg:w-[26rem]">
      {first && (
        <div className="overflow-hidden rounded-xl shadow-popover sm:w-1/2 lg:absolute lg:left-0 lg:top-0 lg:w-64">
          <Cover
            src={first}
            alt=""
            width={640}
            height={427}
            priority
            sizes="(min-width: 1024px) 256px, 50vw"
          />
        </div>
      )}
      {second && (
        <div className="overflow-hidden rounded-xl shadow-popover sm:w-1/2 lg:absolute lg:bottom-0 lg:right-0 lg:w-60 lg:ring-4 lg:ring-primary-strong">
          <Cover
            src={second}
            alt=""
            width={640}
            height={427}
            priority
            sizes="(min-width: 1024px) 240px, 50vw"
          />
        </div>
      )}
    </div>
  );
}

/** Foto única del encabezado de una página (Ingreso): decorativa, con bordes redondeados. */
export function HeroImage({ src, className }: { src?: string; className?: string }) {
  if (!src) return null;
  return (
    <div className={cn('overflow-hidden rounded-xl shadow-popover lg:w-96', className)}>
      <Cover
        src={src}
        alt=""
        width={640}
        height={427}
        priority
        sizes="(min-width: 1024px) 384px, 100vw"
      />
    </div>
  );
}

/**
 * Tarjeta de la galería "Vida en la cocina" (Figma 04): foto con el título y la descripción sobre
 * un degradé oscuro (contraste AA del texto sobre la foto). El texto es la descripción accesible; la
 * foto es decorativa. No es un carrusel: es una grilla estática (sin JavaScript, sin trampas de foco).
 */
export function PhotoCard({
  src,
  title,
  description,
}: {
  src: string;
  title: string;
  description?: string;
}) {
  return (
    <figure className="relative overflow-hidden rounded-xl shadow-card">
      <Cover
        src={src}
        alt=""
        width={800}
        height={534}
        className="aspect-[3/2]"
        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
      />
      {(title || description) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-accent-3 via-accent-3 to-transparent px-4 pb-4 pt-14 text-surface">
          {title && <p className="font-display text-lg font-bold">{title}</p>}
          {description && <p className="text-sm">{description}</p>}
        </figcaption>
      )}
    </figure>
  );
}
