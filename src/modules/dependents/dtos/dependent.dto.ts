import { z } from 'zod';
import { DependentRelationship, Sex } from '@prisma/client';
import { birthDateSchema, cpfSchema, nameSchema } from '../../users/dtos/user.dto';

// Cadastro e edição do dependente (RF012 / D33); o PUT substitui os dados básicos
export const dependentSchema = z.object({
  name: nameSchema,
  birthDate: birthDateSchema.transform((value) => new Date(value)),
  sex: z.enum(Sex, 'Sexo deve ser MASCULINO ou FEMININO'),
  // CPF opcional: vazio ou nulo é tratado como "sem CPF"
  cpf: z.preprocess((value) => (value === '' || value === null ? undefined : value), cpfSchema.optional()),
  relationship: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(DependentRelationship, 'Parentesco deve ser FILHO, PAI_MAE, CONJUGE, CURATELADO ou OUTRO').optional(),
  ),
});

export const dependentIdParamsSchema = z.object({
  id: z.uuid('ID do dependente deve ser um UUID válido'),
});

export const dependentRecordParamsSchema = z.object({
  id: z.uuid('ID do dependente deve ser um UUID válido'),
  recordId: z.uuid('ID do registro deve ser um UUID válido'),
});

export type DependentDTO = z.infer<typeof dependentSchema>;
