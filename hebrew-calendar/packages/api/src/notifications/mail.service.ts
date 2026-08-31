import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outgoing email.
 *
 * Configured entirely from SMTP environment variables. With none set the
 * service logs what it would have sent and reports failure to the caller, so
 * a development machine never silently pretends mail went out.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.MAIL_FROM || 'יומן עברי <no-reply@example.com>';
    if (!host) {
      this.transport = null;
      this.log.log('SMTP_HOST not set — email delivery is disabled');
      return;
    }
    this.transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  /** Returns whether the message was actually handed to a mail server. */
  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!this.transport) {
      this.log.debug(`[mail disabled] would send "${subject}" to ${to}`);
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text, html });
      return true;
    } catch (err) {
      this.log.warn(`mail to ${to} failed: ${String(err)}`);
      return false;
    }
  }
}
