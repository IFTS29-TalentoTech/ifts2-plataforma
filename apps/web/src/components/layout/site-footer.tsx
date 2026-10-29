import type { SiteInfo } from '@/lib/site';

/** Pie oscuro. Todo el texto viene de la configuración del sitio. */
export function SiteFooter({ site }: { site: SiteInfo }) {
  const contacts = [site.address, site.phone, site.emailInstitutional].filter(Boolean);
  return (
    <footer className="bg-accent-3 text-base">
      <div className="mx-auto flex max-w-container flex-col gap-3 px-gutter py-8 lg:px-gutter-lg">
        {site.footerText && <p className="font-display text-sm font-semibold">{site.footerText}</p>}
        {contacts.length > 0 && <p className="text-sm text-accent-2">{contacts.join(' · ')}</p>}
        {(site.instagramUrl || site.facebookUrl) && (
          <ul className="flex gap-4 text-sm">
            {site.instagramUrl && (
              <li>
                <a
                  href={site.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  Instagram<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </li>
            )}
            {site.facebookUrl && (
              <li>
                <a
                  href={site.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  Facebook<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </li>
            )}
          </ul>
        )}
      </div>
    </footer>
  );
}
