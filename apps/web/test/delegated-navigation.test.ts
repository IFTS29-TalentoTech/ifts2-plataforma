import { describe, expect, it } from 'vitest';
import { can, type Action } from '@ifts2/shared';
import { PANEL_NAV } from '../src/lib/nav';

const cases: [Action, string][] = [
  ['users:manage', '/panel/configuracion'],
  ['content:manage', '/panel/paginas'],
  ['gallery:manage', '/panel/galerias'],
  ['links:manage', '/panel/configuracion'],
  ['integrations:manage', '/panel/configuracion'],
  ['terms:manage', '/panel/horarios'],
  ['terms:setPublic', '/panel/horarios'],
  ['examCalls:manage', '/panel/horarios'],
  ['social:moderate', '/panel/publicaciones'],
];
describe('B01: navegación de capacidades delegadas', () => {
  for (const [permission, href] of cases) {
    it(`${permission} ofrece ${href} sin permisos del contenedor`, () => {
      const item = PANEL_NAV.find((entry) => entry.href === href)!;
      const actions = 'anyOf' in item && Array.isArray(item.anyOf) ? item.anyOf : [item.permission];
      expect(actions.some((action: Action) => can([permission], action))).toBe(true);
    });
  }
});

it('los contenedores y sus enlaces usan la misma decisión y deniegan capacidades ajenas', async () => {
  const { canAccessNav, canAccessPanel, PANEL_CAPABILITIES } = await import('../src/lib/nav');
  const pages = [
    ['/panel/configuracion', PANEL_CAPABILITIES.configuration],
    ['/panel/horarios', PANEL_CAPABILITIES.schedules],
    ['/panel/publicaciones', PANEL_CAPABILITIES.publications],
  ] as const;
  for (const [href, actions] of pages) {
    const item = PANEL_NAV.find((entry) => entry.href === href)!;
    for (const permission of actions)
      expect(canAccessNav([permission], item)).toBe(canAccessPanel([permission], actions));
    expect(canAccessNav([], item)).toBe(false);
    expect(canAccessNav(['audit:read'], item)).toBe(false);
  }
});

it('conserva la navegación tradicional de EDITOR y BEDELIA', async () => {
  const { DEFAULT_ROLE_PERMISSIONS } = await import('@ifts2/shared');
  const { canAccessNav } = await import('../src/lib/nav');
  const allowed = (role: 'EDITOR' | 'BEDELIA', href: string) =>
    canAccessNav(
      DEFAULT_ROLE_PERMISSIONS[role],
      PANEL_NAV.find((item) => item.href === href)!,
    );
  expect(allowed('EDITOR', '/panel/configuracion')).toBe(false);
  expect(allowed('EDITOR', '/panel/publicaciones')).toBe(true);
  expect(allowed('BEDELIA', '/panel/horarios')).toBe(true);
  expect(allowed('BEDELIA', '/panel/publicaciones')).toBe(false);
});
