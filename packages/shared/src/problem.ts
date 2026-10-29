import type { ErrorCode } from './enums';

/** Formato de error de la API (Problem Details, RFC 7807). */
export interface ProblemDetails {
  type: string; // `about:blank#<code>` o una URL; usar `code` para decidir
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode;
  /** Errores por campo: { "email": ["El correo es obligatorio."] } */
  errors?: Record<string, string[]>;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'payload-too-large': 413,
  'unsupported-media-type': 415,
  unprocessable: 422,
  'too-many-requests': 429,
  'bad-gateway': 502,
  internal: 500,
};
