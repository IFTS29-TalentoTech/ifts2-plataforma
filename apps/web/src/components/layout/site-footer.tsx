import type { SVGProps } from 'react';
import type { SiteInfo } from '@/lib/site';

/**
 * Pie oscuro. Todo el texto viene de la configuración del sitio (producto genérico, ADR-022).
 * En escritorio va en UNA fila (texto y contactos a la izquierda, redes a la derecha) para que sea bajo;
 * en móvil se apila. Las redes son íconos con nombre accesible (lector de pantalla y `title`).
 */
export function SiteFooter({ site }: { site: SiteInfo }) {
  const contacts = [site.address, site.phone, site.emailInstitutional].filter(Boolean);
  const social = [
    site.instagramUrl && { href: site.instagramUrl, label: 'Instagram', Icon: InstagramIcon },
    site.facebookUrl && { href: site.facebookUrl, label: 'Facebook', Icon: FacebookIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof InstagramIcon }[];

  return (
    <footer className="bg-accent-3 text-base">
      <div className="mx-auto flex max-w-container flex-col gap-4 px-gutter py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-gutter-lg">
        <div className="flex min-w-0 flex-col gap-1">
          {site.footerText && (
            <p className="font-display text-sm font-semibold">{site.footerText}</p>
          )}
          {contacts.length > 0 && <p className="text-sm text-accent-2">{contacts.join(' · ')}</p>}
        </div>
        {social.length > 0 && (
          <ul className="flex shrink-0 gap-2" aria-label="Redes sociales">
            {social.map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="flex h-10 w-10 items-center justify-center rounded-pill border border-accent-2 text-base hover:bg-accent focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{label} (se abre en una pestaña nueva)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

/*
 * Íconos de redes dibujados acá: la versión de lucide-react del proyecto ya no trae íconos de marcas.
 * Usan `currentColor` (heredan el color del texto), así respetan la regla de colores por tokens (ADR-021).
 */
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14 8h3V4h-3c-2.76 0-5 2.24-5 5v2H6v4h3v7h4v-7h3l1-4h-4V9c0-.55.45-1 1-1Z" />
    </svg>
  );
}
