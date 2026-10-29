import { STATUS_BY_CODE, type ErrorCode, type ProblemDetails } from '@ifts2/shared';

/** Error de negocio que el manejador convierte en Problem Details (RFC 7807). */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: Record<string, string[]>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.status = STATUS_BY_CODE[code];
  }
  toProblem(): ProblemDetails & Record<string, unknown> {
    return {
      type: `about:blank#${this.code}`,
      title: this.title,
      status: this.status,
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
      ...(this.extra ?? {}),
    };
  }
}

export const errors = {
  validation: (detail: string, fieldErrors?: Record<string, string[]>) =>
    new AppError('validation', 'Hay datos incorrectos', detail, fieldErrors),
  unauthorized: (detail = 'Iniciá sesión para continuar.') =>
    new AppError('unauthorized', 'No autenticado', detail),
  forbidden: (detail = 'No tenés permiso para realizar esta acción.', extra?: Record<string, unknown>) =>
    new AppError('forbidden', 'Sin permiso', detail, undefined, extra),
  notFound: (detail = 'No encontramos lo que buscabas.') =>
    new AppError('not-found', 'No encontrado', detail),
  conflict: (detail: string, fieldErrors?: Record<string, string[]>) =>
    new AppError('conflict', 'Conflicto', detail, fieldErrors),
  tooLarge: (detail: string) => new AppError('payload-too-large', 'Archivo demasiado grande', detail),
  unsupported: (detail: string) =>
    new AppError('unsupported-media-type', 'Tipo de archivo no permitido', detail),
  unprocessable: (detail: string, fieldErrors?: Record<string, string[]>) =>
    new AppError('unprocessable', 'No se puede realizar la acción', detail, fieldErrors),
  tooMany: (detail = 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.') =>
    new AppError('too-many-requests', 'Demasiados intentos', detail),
  badGateway: (detail: string) =>
    new AppError('bad-gateway', 'Falla de un servicio externo', detail),
};
