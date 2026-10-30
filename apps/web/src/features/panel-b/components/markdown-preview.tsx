/**
 * Panel B · vista previa del "Markdown acotado" de las secciones editables.
 *
 * Soporta lo mismo que la API conserva al guardar (api/src/lib/markdown.ts): párrafos, títulos (#),
 * negrita, cursiva, listas, citas y enlaces http(s)/mailto/tel. Se renderiza con nodos de React
 * (NUNCA con dangerouslySetInnerHTML): cualquier HTML escrito queda como texto, así que la vista
 * previa no puede ejecutar nada. Es solo una guía visual: el sitio público renderiza por su cuenta.
 */
import type { ReactNode } from 'react';

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** Negrita, cursiva y enlaces dentro de una línea. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('*')) out.push(<em key={key}>{t.slice(1, -1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
      const href = link?.[2] ?? '';
      if (link && SAFE_URL.test(href)) {
        out.push(
          <a key={key} href={href} className="text-accent underline" rel="noopener noreferrer">
            {link[1]}
          </a>,
        );
      } else out.push(link ? link[1] : t);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownPreview({ source }: { source: string }) {
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 text-sm text-accent-3">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (lines.length === 0) return null;
        const key = `b${bi}`;
        const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '');
        if (heading && lines.length === 1) {
          const size = ['text-xl', 'text-lg', 'text-base'][(heading[1]?.length ?? 1) - 1];
          return (
            <p key={key} className={`font-display font-bold ${size}`}>
              {inline(heading[2] ?? '', key)}
            </p>
          );
        }
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={key} className="list-disc pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${key}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^>\s?/.test(l))) {
          return (
            <blockquote key={key} className="border-l-4 border-primary pl-3 italic">
              {inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), key)}
            </blockquote>
          );
        }
        return <p key={key}>{inline(lines.join(' '), key)}</p>;
      })}
    </div>
  );
}
