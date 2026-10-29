import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError, errors } from '../infra/errors';

const PROBLEM = 'application/problem+json';

export function zodToFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(errors.notFound('La dirección que buscás no existe.'));
};

/** Convierte cualquier error en Problem Details (RFC 7807) con los códigos de docs/specs/04-api.md. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let problem: AppError;

  if (err instanceof AppError) {
    problem = err;
  } else if (err instanceof ZodError) {
    const fields = zodToFieldErrors(err);
    const first = Object.values(fields)[0]?.[0] ?? 'Revisá los datos ingresados.';
    problem = errors.validation(first, fields);
  } else if (err instanceof MulterError) {
    problem =
      err.code === 'LIMIT_FILE_SIZE'
        ? errors.tooLarge('El archivo pesa demasiado.')
        : errors.validation('No pudimos leer el archivo enviado.');
  } else if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type: string }).type === 'entity.too.large'
  ) {
    problem = errors.tooLarge('El contenido enviado es demasiado grande.');
  } else if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type: string }).type === 'entity.parse.failed'
  ) {
    problem = errors.validation('El cuerpo de la petición no es un JSON válido.');
  } else {
    req.ctx?.logger.error(
      { err: { message: (err as Error)?.message, stack: (err as Error)?.stack }, path: req.path },
      'error no controlado',
    );
    problem = new AppError(
      'internal',
      'Error interno',
      'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.',
    );
  }

  res.status(problem.status).type(PROBLEM).json(problem.toProblem());
};
