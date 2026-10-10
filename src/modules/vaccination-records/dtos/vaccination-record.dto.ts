import { z } from 'zod';

export const confirmVaccinationSchema = z.object({
  citizenId: z.uuid('citizenId deve ser um UUID válido'),
  vaccineId: z.uuid('vaccineId deve ser um UUID válido'),
  doseId: z.uuid('doseId deve ser um UUID válido'),
  lote: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,20}$/, 'Lote deve ter de 1 a 20 caracteres alfanuméricos')
    .transform((value) => value.toUpperCase()),
});

export const citizenIdParamsSchema = z.object({
  id: z.uuid('ID do cidadão deve ser um UUID válido'),
});

export type ConfirmVaccinationDTO = z.infer<typeof confirmVaccinationSchema>;
