import { z } from 'zod';

const loteSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,20}$/, 'Lote deve ter de 1 a 20 caracteres alfanuméricos')
  .transform((value) => value.toUpperCase());

const applicationDateSchema = z
  .union([z.iso.datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)], {
    error: (issue) =>
      issue.input === undefined
        ? 'Data de aplicação é obrigatória'
        : 'Data de aplicação deve estar no formato YYYY-MM-DD ou ISO 8601',
  })
  // Rejeita datas inexistentes (ex: 2024-02-30), que o Date rolaria para o mês seguinte
  .refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
  }, 'Data de aplicação inválida')
  .transform((value) => new Date(value));

export const confirmVaccinationSchema = z.object({
  citizenId: z.uuid('citizenId deve ser um UUID válido'),
  vaccineId: z.uuid('vaccineId deve ser um UUID válido'),
  doseId: z.uuid('doseId deve ser um UUID válido'),
  lote: loteSchema,
});

// Cadastro manual pelo titular (RF005 / D30); usado também na edição (PUT substitui o registro)
export const manualVaccinationRecordSchema = z.object({
  vaccineId: z.uuid('vaccineId deve ser um UUID válido'),
  doseId: z.uuid('doseId deve ser um UUID válido'),
  applicationDate: applicationDateSchema,
  lote: loteSchema.optional(),
});

export const citizenIdParamsSchema = z.object({
  id: z.uuid('ID do cidadão deve ser um UUID válido'),
});

export const recordIdParamsSchema = z.object({
  id: z.uuid('ID do registro deve ser um UUID válido'),
});

export type ConfirmVaccinationDTO = z.infer<typeof confirmVaccinationSchema>;
export type ManualVaccinationRecordDTO = z.infer<typeof manualVaccinationRecordSchema>;
