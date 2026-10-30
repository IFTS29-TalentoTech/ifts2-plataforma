'use client';

import { api } from '@/lib/api';
import type { CategoryDto, Page } from './types';
import { useResource } from './use-resource';

/**
 * Categorías para los selectores (GET /categories?kind=). Son pocas (hasta 100) y las necesitan los
 * formularios de publicaciones (kind PUBLICATION) y de avisos (kind NOTICE).
 * Si la consulta falla el selector queda solo con "Sin categoría": no bloquea el formulario.
 */
export function useCategories(kind: 'PUBLICATION' | 'NOTICE') {
  const { data } = useResource(`categories:${kind}`, () =>
    api.get<Page<CategoryDto>>(`/categories?kind=${kind}&pageSize=100`),
  );
  return data?.items ?? [];
}

/** Valor del <Select> para "sin categoría" (Radix no admite value=""). */
export const NO_CATEGORY = 'none';

export function categoryOptions(categories: CategoryDto[]) {
  return [
    { value: NO_CATEGORY, label: 'Sin categoría' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
}
