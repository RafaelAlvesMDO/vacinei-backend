import { z } from 'zod';
import { passwordSchema } from '../../../utils/passwordSchema';
import { nameSchema } from '../../users/dtos/user.dto';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'A senha é obrigatória'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'O refresh token é obrigatório'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'O código deve ter 6 dígitos'),
  newPassword: passwordSchema,
});

// RF003: só o nome é editável pelo próprio usuário; campos extras são recusados
export const updateProfileSchema = z.strictObject({
  name: nameSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'A senha atual é obrigatória'),
  newPassword: passwordSchema,
  // Opcional: identifica a sessão atual para mantê-la ativa
  refreshToken: z.string().min(1).optional(),
});

export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
