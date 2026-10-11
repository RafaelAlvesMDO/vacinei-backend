import nodemailer, { Transporter } from 'nodemailer';
import { mailConfig, isSmtpConfigured } from '../../config/mail';

export interface SendMailDTO {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class MailProvider {
  private transporter: Transporter | null;

  constructor() {
    this.transporter = isSmtpConfigured
      ? nodemailer.createTransport({
          host: mailConfig.host,
          port: mailConfig.port,
          secure: mailConfig.secure,
          auth: { user: mailConfig.user, pass: mailConfig.pass },
        })
      : null;
  }

  async sendMail({ to, subject, text, html }: SendMailDTO): Promise<void> {
    // Sem SMTP configurado: exibe o conteúdo no console para testes locais
    if (!this.transporter) {
      console.log(
        [
          '',
          '==================== [MailProvider] SMTP NÃO CONFIGURADO ====================',
          `Para:     ${to}`,
          `Assunto:  ${subject}`,
          '----------------------------------------------------------------------------',
          text,
          '============================================================================',
          '',
        ].join('\n'),
      );
      return;
    }

    await this.transporter.sendMail({ from: mailConfig.from, to, subject, text, html });
  }
}
