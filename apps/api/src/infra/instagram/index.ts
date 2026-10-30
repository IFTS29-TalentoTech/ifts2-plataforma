import type { AppConfig } from '../../config';
import type { IntegrationStore } from '../integration-store';
import { FakeInstagramClient } from './fake';
import { GraphInstagramClient } from './graph';
import type { InstagramClient } from './types';

export * from './types';
export { FakeInstagramClient, FAKE_MEDIA } from './fake';
export {
  GraphInstagramClient,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshLongLivedToken,
  TOKEN_INVALID_MESSAGE,
  type TokenGrant,
} from './graph';
export { captionHasHashtag, normalizeHashtag } from './hashtag';

/**
 * Resuelve el cliente de Instagram EN CADA USO (no se cachea), para que los cambios hechos desde el
 * panel se apliquen de inmediato. Orden:
 *  1. Configuración guardada desde el panel (base, cifrada): modo `real` con App ID/Secret -> Graph;
 *     modo `demo` -> Fake.
 *  2. Variables de entorno (INSTAGRAM_PROVIDER=graph con App ID/Secret) como valor por defecto.
 *  3. Si no hay nada: FakeInstagramClient (modo demostración).
 */
export async function createInstagramClient(
  config: AppConfig,
  store: IntegrationStore,
  fetchFn?: typeof fetch,
): Promise<InstagramClient> {
  const stored = await store.get('instagram');
  if (stored) {
    if (stored.mode === 'real' && stored.appId && stored.appSecret) {
      return new GraphInstagramClient({
        appId: stored.appId,
        appSecret: stored.appSecret,
        accessToken: stored.accessToken,
        fetchFn,
      });
    }
    return new FakeInstagramClient();
  }
  if (
    config.instagram.provider === 'graph' &&
    config.instagram.appId &&
    config.instagram.appSecret
  ) {
    return new GraphInstagramClient({
      appId: config.instagram.appId,
      appSecret: config.instagram.appSecret,
      fetchFn,
    });
  }
  return new FakeInstagramClient();
}
