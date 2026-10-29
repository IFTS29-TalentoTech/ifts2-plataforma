import type { ConnectionTest, InstagramClient, InstagramMedia } from './types';

export const FAKE_MEDIA: InstagramMedia[] = [
  {
    id: 'fake-ig-001',
    caption:
      'Jornada gastronómica en sede Lugano. Actividades de las prácticas profesionalizantes. #ifts2web',
    mediaType: 'IMAGE',
    mediaUrl: 'https://example.invalid/fake/jornada-gastronomica.jpg',
    permalink: 'https://www.instagram.com/p/fake-ig-001/',
    timestamp: '2026-10-28T14:00:00.000Z',
  },
  {
    id: 'fake-ig-002',
    caption:
      'Mateada Patria 2025: compartimos la celebración del 25 de mayo con toda la comunidad. #ifts2web',
    mediaType: 'IMAGE',
    mediaUrl: 'https://example.invalid/fake/mateada-patria.jpg',
    permalink: 'https://www.instagram.com/p/fake-ig-002/',
    timestamp: '2025-05-25T15:00:00.000Z',
  },
  {
    id: 'fake-ig-003',
    caption:
      'Feliz Día del Trabajador Gastronómico. Un saludo institucional a toda la comunidad. #ifts2web',
    mediaType: 'IMAGE',
    mediaUrl: 'https://example.invalid/fake/dia-del-trabajador.jpg',
    permalink: 'https://www.instagram.com/p/fake-ig-003/',
    timestamp: '2026-10-27T12:00:00.000Z',
  },
];

/** Modo demostración y doble de pruebas: devuelve 3 publicaciones de ejemplo, sin red. */
export class FakeInstagramClient implements InstagramClient {
  readonly kind = 'fake' as const;
  failWith: Error | null = null;
  constructor(private readonly media: InstagramMedia[] = FAKE_MEDIA) {}

  async fetchRecentMedia(opts?: { limit?: number }) {
    if (this.failWith) throw this.failWith;
    return this.media.slice(0, opts?.limit ?? this.media.length);
  }
  async testConnection(): Promise<ConnectionTest> {
    if (this.failWith) return { ok: false, error: this.failWith.message };
    return { ok: true, username: 'cuenta_de_demostracion' };
  }
}
