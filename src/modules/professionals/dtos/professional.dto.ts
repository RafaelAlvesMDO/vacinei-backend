import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination';

export const listProfessionalsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDENTE', 'VERIFICADO', 'RECUSADO'], 'status deve ser PENDENTE, VERIFICADO ou RECUSADO').optional(),
  search: z
    .string('search deve ser um texto')
    .trim()
    .max(100, 'search deve ter no máximo 100 caracteres')
    .optional()
    .transform((value) => value || undefined),
});

export const professionalIdParamsSchema = z.object({
  id: z.uuid('ID do profissional deve ser um UUID válido'),
});

export const rejectProfessionalSchema = z.object({
  reason: z.string().trim().min(3, 'Motivo deve ter no mínimo 3 caracteres').max(500, 'Motivo deve ter no máximo 500 caracteres').optional(),
});

export type ListProfessionalsQueryDTO = z.infer<typeof listProfessionalsQuerySchema>;
export type RejectProfessionalDTO = z.infer<typeof rejectProfessionalSchema>;
