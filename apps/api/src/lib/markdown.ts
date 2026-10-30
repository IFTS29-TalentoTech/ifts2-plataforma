/**
 * Sanitización del "Markdown acotado" de las secciones editables (RF01/RF02, 02-decisiones-tecnicas:
 * "sin HTML crudo"). Se aplica al GUARDAR y otra vez al LEER en `/public/content`, así que un
 * dato insertado por fuera de la API (semilla, SQL manual) tampoco llega al navegador con HTML.
 *
 * Qué se permite: párrafos, títulos (#), negrita/cursiva, listas, citas y enlaces http(s)/mailto/tel.
 * Qué se elimina: etiquetas HTML (se conserva el texto), comentarios, imágenes (se deja el texto
 * alternativo) y enlaces con esquemas peligrosos (`javascript:`, `data:`, `vbscript:`...).
 * El renderizado final (Markdown -> HTML) lo hace la web con un renderizador que además escapa HTML.
 */

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

export function sanitizeMarkdown(input: string): string {
  // eslint-disable-next-line no-control-regex
  let s = input.replace(/\r\n?/g, '\n').replace(/\x00/g, '');

  // Comentarios y bloques que ejecutan o cargan cosas: se descartan con su contenido.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '');
  // Cualquier otra etiqueta HTML: se quita la etiqueta y se conserva el texto.
  s = s.replace(/<\/?[a-zA-Z!][^>]*>/g, '');

  // Imágenes ![alt](url) -> alt (el contenido estanco no incluye imágenes incrustadas).
  s = s.replace(/!\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1');

  // Enlaces [texto](url "título"): si el esquema no es seguro, queda solo el texto. La URL admite un
  // nivel de paréntesis anidados (por ejemplo `javascript:alert(1)`), para no dejar restos sueltos.
  s = s.replace(
    /\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()]*\))*)(\s+"[^"]*")?\s*\)/g,
    (_m, label: string, url: string, title?: string) =>
      SAFE_URL.test(url) ? `[${label}](${url}${title ?? ''})` : label,
  );
  // Red de seguridad: si quedó algún `](javascript:` con una forma rara, se desactiva igual.
  s = s.replace(/\]\(\s*(?:javascript|vbscript|data|file)\s*:/gi, '](#');
  // Definiciones de referencia `[x]: esquema-peligroso` -> se eliminan.
  s = s.replace(/^\s*\[[^\]]+\]:\s*(?!https?:\/\/|mailto:|tel:|\/|#)\S+.*$/gim, '');

  return s.trim();
}
