import type { ReactNode } from 'react';
import type { SiteInfo } from '@/lib/site';

/**
 * Pie oscuro y compacto: textos a la izquierda y redes como iconos a la derecha (en móvil se
 * apilan). Todo el texto y los enlaces vienen de la configuración del sitio (ADR-22).
 * Los iconos de redes son SVG propios (lucide ya no incluye logos de marcas) y heredan el color.
 */
export function SiteFooter({ site }: { site: SiteInfo }) {
  const contacts = [site.address, site.phone, site.emailInstitutional].filter(Boolean);
  const socials: { label: string; href: string; icon: ReactNode }[] = [];
  if (site.instagramUrl)
    socials.push({ label: 'Instagram', href: site.instagramUrl, icon: <InstagramIcon /> });
  if (site.facebookUrl)
    socials.push({ label: 'Facebook', href: site.facebookUrl, icon: <FacebookIcon /> });

  return (
    <footer className="bg-accent-3 text-base">
      <div className="mx-auto flex max-w-container flex-col gap-4 px-gutter py-5 sm:flex-row sm:items-center sm:justify-between lg:px-gutter-lg">
        <div className="flex flex-col gap-1">
          {site.footerText && (
            <p className="font-display text-sm font-semibold">{site.footerText}</p>
          )}
          {contacts.length > 0 && <p className="text-xs text-accent-2">{contacts.join(' · ')}</p>}
        </div>
        {socials.length > 0 && (
          <ul className="flex shrink-0 items-center gap-2" aria-label="Redes sociales">
            {socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-pill border border-accent-2 hover:bg-accent focus-visible:outline-none focus-visible:shadow-focus"
                >
                  {s.icon}
                  <span className="sr-only">{s.label} (se abre en una pestaña nueva)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function InstagramIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V8.5z" />
    </svg>
  );
}
