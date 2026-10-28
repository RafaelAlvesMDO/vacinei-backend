import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination';

export const recentDosesQuerySchema = z.object({
  limit: z.coerce
    .number('limit deve ser um número')
    .int('limit deve ser um número inteiro')
    .min(1, 'limit deve ser no mínimo 1')
    .max(50, 'limit deve ser no máximo 50')
    .default(10),
});

export type RecentDosesQueryDTO = z.infer<typeof recentDosesQuerySchema>;

export const overdueQuerySchema = paginationQuerySchema.extend({
  search: z
    .string('search deve ser um texto')
    .trim()
    .max(100, 'search deve ter no máximo 100 caracteres')
    .optional()
    .transform((value) => value || undefined),
  // Grupo da busca ativa (D32): doses atrasadas sem registro ou informadas aguardando conferência
  status: z
    .enum(['ATRASADA', 'AGUARDANDO_CONFERENCIA'], 'status deve ser ATRASADA ou AGUARDANDO_CONFERENCIA')
    .default('ATRASADA'),
});

export type OverdueQueryDTO = z.infer<typeof overdueQuerySchema>;
