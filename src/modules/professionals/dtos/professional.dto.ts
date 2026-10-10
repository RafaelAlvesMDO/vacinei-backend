import { z } from 'zod';

export const listProfessionalsQuerySchema = z.object({
  verified: z.enum(['true', 'false'], 'verified deve ser true ou false').transform((v) => v === 'true').optional(),
});

export const professionalIdParamsSchema = z.object({
  id: z.uuid('ID do profissional deve ser um UUID válido'),
});

export const rejectProfessionalSchema = z.object({
  reason: z.string().trim().min(3, 'Motivo deve ter no mínimo 3 caracteres').max(500, 'Motivo deve ter no máximo 500 caracteres').optional(),
});

export type ListProfessionalsQueryDTO = z.infer<typeof listProfessionalsQuerySchema>;
export type RejectProfessionalDTO = z.infer<typeof rejectProfessionalSchema>;
