import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const professionalRegistrySchema = z.object({
  council: z.string().min(2, 'O conselho deve ter no mínimo 2 caracteres (ex: CRM, COREN)'),
  registryNumber: z.string().min(1, 'Número de registro no conselho é obrigatório'),
  uf: z.string().length(2, 'UF deve conter exatamente 2 caracteres (ex: AL)'),
});

export const createUserSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('E-mail em formato inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  role: z.nativeEnum(UserRole).default(UserRole.CIDADAO),
  professionalRegistry: professionalRegistrySchema.optional(),
}).refine((data) => {
  if (data.role === UserRole.PROFISSIONAL_SAUDE && !data.professionalRegistry) {
    return false;
  }
  return true;
}, {
  message: 'Dados do conselho de classe (professionalRegistry) são obrigatórios para Profissional de Saúde.',
  path: ['professionalRegistry'],
});

export const updateUserSchema = z.object({
  name: z.string().min(3).optional(),
  phone: z.string().optional(),
  birthDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  avatarUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;
