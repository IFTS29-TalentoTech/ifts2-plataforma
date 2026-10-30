import { describe, expect, it } from 'vitest';
import { sanitizeMarkdown } from '../../src/lib/markdown';

describe('sanitizeMarkdown (Markdown acotado, sin HTML crudo)', () => {
  it('conserva Markdown legítimo', () => {
    const md =
      '# Título\n\nTexto con **negrita**, _cursiva_ y un [enlace](https://sitio.test/a?b=1).\n\n- uno\n- dos\n\n> cita';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  it('elimina etiquetas HTML y deja el texto', () => {
    expect(sanitizeMarkdown('Hola <b>mundo</b> <img src=x onerror=alert(1)>')).toBe('Hola mundo');
  });

  it('descarta scripts, estilos, iframes y comentarios con su contenido', () => {
    expect(
      sanitizeMarkdown(
        'A<script>alert(1)</script>B<style>x{}</style>C<iframe src="x"></iframe>D<!-- c -->E',
      ),
    ).toBe('ABCDE');
  });

  it('neutraliza enlaces con esquemas peligrosos y deja el texto', () => {
    expect(sanitizeMarkdown('[clic](javascript:alert(1))')).toBe('clic');
    expect(sanitizeMarkdown('[clic](  JavaScript:alert(1))')).toBe('clic');
    expect(sanitizeMarkdown('[x](data:text/html;base64,AAAA)')).toBe('x');
    expect(
      sanitizeMarkdown('[mail](mailto:a@b.test) [tel](tel:4638) [rel](/ingreso) [ancla](#a)'),
    ).toBe('[mail](mailto:a@b.test) [tel](tel:4638) [rel](/ingreso) [ancla](#a)');
  });

  it('reemplaza imágenes por su texto alternativo y limpia definiciones de referencia peligrosas', () => {
    expect(sanitizeMarkdown('![logo](https://x.test/l.png)')).toBe('logo');
    expect(sanitizeMarkdown('[ref]: javascript:alert(1)\ntexto')).toBe('texto');
  });

  it('normaliza saltos de línea y bytes nulos', () => {
    expect(sanitizeMarkdown('a\r\nb\u0000c')).toBe('a\nbc');
  });
});
