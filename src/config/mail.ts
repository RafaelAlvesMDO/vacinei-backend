export const mailConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM || 'VACINEI!? <no-reply@vacinei.app>',
};

export const isSmtpConfigured = Boolean(mailConfig.host && mailConfig.user && mailConfig.pass);
