import { z } from 'zod';

export const recentDosesQuerySchema = z.object({
  limit: z.coerce
    .number('limit deve ser um número')
    .int('limit deve ser um número inteiro')
    .min(1, 'limit deve ser no mínimo 1')
    .max(50, 'limit deve ser no máximo 50')
    .default(10),
});

export type RecentDosesQueryDTO = z.infer<typeof recentDosesQuerySchema>;
