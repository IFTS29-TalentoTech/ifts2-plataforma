import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Valida con zod (esquemas de @ifts2/shared). El resultado parseado queda en `req.valid`
 * (en Express 5 `req.query` es de solo lectura). Los errores salen como 400 con `errors` por campo.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    req.valid = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const source = part === 'body' ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(source);
      if (!result.success) return next(result.error);
      req.valid[part] = result.data;
    }
    next();
  };
}

/** Tipado cómodo en los controladores: `const body = valid<NoticeCreateInput>(req, 'body')`. */
export function valid<T>(req: { valid: { body?: unknown; query?: unknown; params?: unknown } }, part: 'body' | 'query' | 'params'): T {
  return req.valid[part] as T;
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
