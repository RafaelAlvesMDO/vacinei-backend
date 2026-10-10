import crypto from 'crypto';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { MailProvider } from '../../../providers/MailProvider/MailProvider';
import { ForgotPasswordDTO } from '../dtos/auth.dto';

export function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export class ForgotPasswordService {
  async execute({ email }: ForgotPasswordDTO): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    // Não revela se o e-mail existe: o controller sempre devolve a mesma resposta
    if (!user || !user.isActive) {
      return;
    }

    // Durante um bloqueio ativo não é gerado novo código (evita burlar o bloqueio)
    const blockedCode = await prisma.passwordResetCode.findFirst({
      where: { userId: user.id, blockedUntil: { gt: new Date() } },
    });

    if (blockedCode) {
      return;
    }

    // Invalida códigos anteriores ainda não utilizados
    await prisma.passwordResetCode.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + authConfig.passwordReset.expiresInMinutes * 60 * 1000);

    await prisma.passwordResetCode.create({
      data: {
        code: hashResetCode(code),
        userId: user.id,
        expiresAt,
      },
    });

    const mailProvider = new MailProvider();
    await mailProvider.sendMail({
      to: user.email,
      subject: 'VACINEI!? - Código de recuperação de senha',
      text: `Olá, ${user.name}!\n\nSeu código de recuperação de senha é: ${code}\n\nEle é válido por ${authConfig.passwordReset.expiresInMinutes} minutos. Se você não solicitou, ignore este e-mail.`,
      html: `<p>Olá, ${user.name}!</p><p>Seu código de recuperação de senha é: <strong style="font-size:20px">${code}</strong></p><p>Ele é válido por ${authConfig.passwordReset.expiresInMinutes} minutos. Se você não solicitou, ignore este e-mail.</p>`,
    });
  }
}
