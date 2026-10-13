import { z } from 'zod';
import { ProfessionalCategory, UserRole } from '@prisma/client';
import { passwordSchema } from '../../../utils/passwordSchema';
import { parseRegistryNumber } from '../../../utils/professionalCouncil';

// Regras do RF001 compartilhadas entre cadastro e edição
const nameSchema = z
  .string('Nome é obrigatório')
  .trim()
  .max(120, 'Nome deve ter no máximo 120 caracteres')
  .refine((name) => name.split(/\s+/).length >= 2, 'Informe nome e sobrenome');

const phoneSchema = z
  .string('Celular é obrigatório')
  .regex(/^\d{11}$/, 'Celular deve conter apenas números: DDD + 9 dígitos (11 no total)');

// UF vem no campo uf ou como sufixo do número (ex: 123456-AL); o council é derivado da categoria
export const professionalRegistrySchema = z
  .object({
    category: z.enum(ProfessionalCategory, 'Categoria profissional inválida'),
    registryNumber: z
      .string('Registro profissional é obrigatório')
      .trim()
      .min(1, 'Registro profissional é obrigatório'),
    uf: z.string().length(2, 'UF deve conter exatamente 2 caracteres (ex: AL)').optional(),
  })
  .superRefine((registry, ctx) => {
    const parsed = parseRegistryNumber(registry.registryNumber);

    if (!parsed) {
      ctx.addIssue({
        code: 'custom',
        path: ['registryNumber'],
        message: 'Registro deve ter até 20 caracteres alfanuméricos, opcionalmente seguido de -UF (ex: 123456-AL)',
      });
      return;
    }

    if (!parsed.uf && !registry.uf) {
      ctx.addIssue({ code: 'custom', path: ['uf'], message: 'Informe a UF do registro profissional' });
    }

    if (parsed.uf && registry.uf && parsed.uf !== registry.uf.toUpperCase()) {
      ctx.addIssue({ code: 'custom', path: ['uf'], message: 'A UF informada difere da UF do número de registro' });
    }
  });

export const createUserSchema = z.object({
  name: nameSchema,
  email: z.string('E-mail é obrigatório').email('E-mail em formato inválido').max(100, 'E-mail deve ter no máximo 100 caracteres'),
  password: passwordSchema,
  cpf: z.string().optional(),
  phone: phoneSchema,
  birthDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  role: z.nativeEnum(UserRole).default(UserRole.CIDADAO),
  professionalRegistry: professionalRegistrySchema.optional(),
}).refine((data) => {
  if (data.role === UserRole.PROFISSIONAL_SAUDE && !data.professionalRegistry) {
    return false;
  }
  return true;
}, {
  message: 'Registro profissional e categoria (professionalRegistry) são obrigatórios para Profissional de Saúde.',
  path: ['professionalRegistry'],
});

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
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

export const searchCitizensQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres para a busca')
    .max(100, 'Termo de busca deve ter no máximo 100 caracteres'),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;
export type SearchCitizensQueryDTO = z.infer<typeof searchCitizensQuerySchema>;
