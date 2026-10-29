import pino from 'pino';

/** Logger estructurado. Nunca registrar datos personales (correos, contraseñas, mensajes de contacto). */
export function createLogger(level: string, pretty = false) {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        '*.password',
        '*.email',
        '*.token',
        '*.appSecret',
        '*.accessToken',
        '*.smtpUrl',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}
export type Logger = ReturnType<typeof createLogger>;
