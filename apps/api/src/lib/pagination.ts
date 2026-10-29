/** Paginación común de los listados: `?page=1&pageSize=20` -> `{ items, page, pageSize, total }` (04-api.md). */
import type { Page, PaginationQuery } from '@ifts2/shared';

/** `skip`/`take` de Prisma a partir de `?page=&pageSize=`. */
export function pageArgs(q: PaginationQuery) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(items: T[], total: number, q: PaginationQuery): Page<T> {
  return { items, page: q.page, pageSize: q.pageSize, total };
}
