/**
 * Secciones que el administrador agrega a una página desde "Páginas del sitio" (ADR-041), para
 * cualquier página del sitio:
 * - `GallerySections`: una galería de fotos con nombre, como carrusel y con filtro por categoría
 *   si alguna foto la tiene (RF09, US-30). Una galería sin fotos utilizables no llega acá (la API la omite).
 * - `TextSections`: secciones de texto extra, para las páginas que no tienen un diseño propio de
 *   secciones (Estudiantes e Inscripciones).
 */
import type { PublicContentDto, PublicGallerySectionDto } from '@ifts2/shared';
import { Card } from '@/components/ui';
import { GalleryFilter } from './gallery-filter';
import { Markdown } from './markdown';
import { PhotoCard, Section } from './parts';

/** Tarjetas del carrusel: 1 en celular, 2 en tableta y 3 en escritorio. */
const SLIDE_CLASS = 'w-[85%] sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]';

export function GallerySections({ galleries }: { galleries: PublicGallerySectionDto[] }) {
  return (
    <>
      {galleries.map((g) => (
        <Section key={g.slug} title={g.title} id={g.slug}>
          {g.body.trim() && <Markdown source={g.body} className="mb-6" />}
          <div data-testid="galeria">
            <GalleryFilter
              label={g.title}
              slideClassName={SLIDE_CLASS}
              slides={g.items.map((i) => ({
                key: i.id,
                category: i.category,
                node: <PhotoCard src={i.src} title={i.title} description={i.caption} alt={i.alt} />,
              }))}
            />
          </div>
        </Section>
      ))}
    </>
  );
}

export function TextSections({ sections }: { sections: PublicContentDto['sections'] }) {
  if (sections.length === 0) return null;
  return (
    <Section>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.slug} accentBar className="flex flex-col gap-3" data-testid="seccion-extra">
            <h2 className="font-display text-xl font-bold text-accent-3">{s.title}</h2>
            <Markdown source={s.body} />
          </Card>
        ))}
      </div>
    </Section>
  );
}
