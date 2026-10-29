import nodemailer from 'nodemailer';
import type { AppConfig } from '../../config';
import type { IntegrationStore } from '../integration-store';
import type { Logger } from '../logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/** ADR-16: el correo va detrás de una interfaz; el mensaje de contacto se guarda SIEMPRE antes de enviarlo. */
export interface Mailer {
  readonly kind: 'console' | 'smtp' | 'fake';
  send(message: MailMessage): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  readonly kind = 'console' as const;
  constructor(private readonly logger?: Logger) {}
  async send(m: MailMessage) {
    // Modo demostración: no se envía nada, solo se registra el asunto (sin cuerpo ni destinatario completo).
    this.logger?.info({ subject: m.subject }, 'mail (consola): no se envía en modo demostración');
  }
}

/** Doble para pruebas: guarda lo "enviado" y puede simular una falla. */
export class FakeMailer implements Mailer {
  readonly kind = 'fake' as const;
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;
  async send(m: MailMessage) {
    if (this.failWith) throw this.failWith;
    this.sent.push(m);
  }
}

export class SmtpMailer implements Mailer {
  readonly kind = 'smtp' as const;
  private readonly transport;
  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(m: MailMessage) {
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, replyTo: m.replyTo });
  }
}

export interface ResolvedMailer {
  mailer: Mailer;
  contactTo: string | null;
  /** 'panel' = configurado desde el panel; 'env' = variables de entorno; 'default' = consola. */
  source: 'panel' | 'env' | 'default';
}

/**
 * Resuelve el correo en cada uso: primero lo guardado desde el panel (base), luego el entorno
 * (MAILER_PROVIDER / SMTP_URL / CONTACT_TO_EMAIL) y, si no hay nada, la consola (modo demostración).
 */
export async function createMailer(
  config: AppConfig,
  store: IntegrationStore,
  logger?: Logger,
): Promise<ResolvedMailer> {
  const stored = await store.get('mail');
  const contactTo = stored?.contactToEmail ?? config.mailer.contactToEmail ?? null;
  if (stored?.smtpUrl) {
    return { mailer: new SmtpMailer(stored.smtpUrl, contactTo ?? 'no-reply@localhost'), contactTo, source: 'panel' };
  }
  if (config.mailer.provider === 'smtp' && config.mailer.smtpUrl) {
    return {
      mailer: new SmtpMailer(config.mailer.smtpUrl, contactTo ?? 'no-reply@localhost'),
      contactTo,
      source: 'env',
    };
  }
  return { mailer: new ConsoleMailer(logger), contactTo, source: 'default' };
}
