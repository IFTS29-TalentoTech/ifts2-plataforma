/** Solo se optimizan rutas propias o URLs de la API sin parámetros; las firmadas se cargan directo. */
export function canOptimizeCover(src: string, apiOrigin: string): boolean {
  try {
    const api = new URL(apiOrigin);
    const url = new URL(src, api);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search) return false;
    if (src.startsWith('/') && !src.startsWith('//')) return true;
    return url.origin === api.origin && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
