/**
 * Renderizador de "Markdown acotado" (RF01/RF02) para las secciones editables y el cuerpo de las
 * publicaciones. La API ya sanitiza al guardar y al leer; esta capa agrega la defensa final:
 * NO usa `dangerouslySetInnerHTML`, todo texto pasa por React (que escapa HTML) y los enlaces se
 * validan otra vez (solo http(s), mailto, tel, rutas internas y anclas).
 *
 * Soporta: párrafos, títulos (# a ###; se rebajan a h3/h4 porque el h1 es el de la página),
 * listas con viñetas y numeradas, citas, **negrita**, *cursiva* y [enlaces](url).
 * Lo demás se muestra como texto plano. Es deliberadamente chico: no hace falta una librería.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type MdBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 3 | 4; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string };

/** Convierte el texto Markdown en bloques. Exportado para que las páginas puedan, por ejemplo, tomar la lista de pasos. */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({
        type: 'h',
        level: (heading[1] ?? '').length <= 2 ? 3 : 4,
        text: heading[2] ?? '',
      });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul ?? ol)?.[1] ?? '');
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushPara();
      flushList();
      blocks.push({ type: 'quote', text: quote[1] ?? '' });
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks;
}

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** Negrita, cursiva y enlaces dentro de una línea. Todo lo demás queda como texto (escapado por React). */
export function renderInline(text: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1] !== undefined) {
      const href = m[2] ?? '';
      const label = m[1];
      if (!SAFE_HREF.test(href)) out.push(label);
      else if (href.startsWith('/')) {
        out.push(
          <Link key={key} href={href} className="font-medium text-accent underline">
            {label}
          </Link>,
        );
      } else {
        const external = /^https?:/i.test(href);
        out.push(
          <a
            key={key}
            href={href}
            className="font-medium text-accent underline"
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {label}
          </a>,
        );
      }
    } else if (m[3] !== undefined) out.push(<strong key={key}>{m[3]}</strong>);
    else out.push(<em key={key}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renderiza bloques ya parseados. */
export function MarkdownBlocks({ blocks, className }: { blocks: MdBlock[]; className?: string }) {
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-font-strong', className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case 'h':
            return b.level === 3 ? (
              <h3 key={key} className="pt-2 font-display text-lg font-bold text-accent-3">
                {renderInline(b.text, key)}
              </h3>
            ) : (
              <h4 key={key} className="pt-1 font-display text-[1rem] font-bold text-accent-3">
                {renderInline(b.text, key)}
              </h4>
            );
          case 'ul':
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key} className="border-l-4 border-primary pl-4 italic">
                {renderInline(b.text, key)}
              </blockquote>
            );
          default:
            return <p key={key}>{renderInline(b.text, key)}</p>;
        }
      })}
    </div>
  );
}

/** Atajo: Markdown (string) -> HTML seguro. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <MarkdownBlocks blocks={parseMarkdown(source)} className={className} />;
}
