import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { AppError } from '../../../errors/AppError';
import { LoginDTO } from '../dtos/auth.dto';
import { toRegistrySummary } from '../../professionals/services/professionalPresenter';

export class AuthenticateUserService {
  async execute({ email, password }: LoginDTO) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        professionalRegistry: true,
      },
    });

    // RF002: Mensagem genérica para evitar enumeração de contas
    if (!user) {
      throw new AppError('Credenciais inválidas.', 401);
    }

    if (!user.isActive) {
      throw new AppError('Esta conta de usuário está desativada.', 403);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError('Credenciais inválidas.', 401);
    }

    // 1. Gera Access Token (curta duração - 15 min)
    const token = jwt.sign(
      { role: user.role },
      authConfig.jwt.secret,
      {
        subject: user.id,
        expiresIn: authConfig.jwt.expiresIn as any,
      },
    );

    // 2. Gera Refresh Token opaco e persiste no banco
    const refreshTokenString = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + authConfig.refreshToken.expiresInDays);

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenString,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        cpf: user.cpf,
        role: user.role,
        professionalRegistry: toRegistrySummary(user.role, user.professionalRegistry),
      },
      token,
      refreshToken: refreshTokenString,
    };
  }
}
