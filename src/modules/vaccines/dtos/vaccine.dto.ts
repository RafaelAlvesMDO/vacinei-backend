import { z } from 'zod';
import { TargetAudience } from '@prisma/client';

export const createDoseSchema = z.object({
  doseNumber: z.number().int().min(0, 'Número da dose deve ser maior ou igual a 0'),
  doseName: z.string().min(1, 'Nome da dose é obrigatório (ex: 1ª Dose, Reforço)'),
  recommendedAgeMonths: z.number().int().nullable().optional(),
  intervalDaysFromPrevious: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const createVaccineSchema = z.object({
  name: z.string().min(2, 'Nome da vacina é obrigatório'),
  description: z.string().optional(),
  targetAudience: z.nativeEnum(TargetAudience).default(TargetAudience.CRIANCA),
  targetDisease: z.string().min(2, 'Doenças prevenidas são obrigatórias'),
  dosesCount: z.number().int().min(1, 'Quantidade de doses deve ser no mínimo 1'),
  doses: z.array(createDoseSchema).optional(),
});

export const updateVaccineSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  targetAudience: z.nativeEnum(TargetAudience).optional(),
  targetDisease: z.string().min(2).optional(),
  dosesCount: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const listVaccinesQuerySchema = z.object({
  targetAudience: z.nativeEnum(TargetAudience).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export type CreateVaccineDTO = z.infer<typeof createVaccineSchema>;
export type UpdateVaccineDTO = z.infer<typeof updateVaccineSchema>;
export type ListVaccinesQueryDTO = z.infer<typeof listVaccinesQuerySchema>;
