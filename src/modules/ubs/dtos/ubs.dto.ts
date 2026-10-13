import { z } from 'zod';

// CEP aceito com ou sem hífen e padronizado como 00000-000
const zipCodeSchema = z
  .string('CEP é obrigatório')
  .regex(/^\d{5}-?\d{3}$/, 'CEP deve conter 8 dígitos (ex: 57020-600)')
  .transform((cep) => `${cep.slice(0, 5)}-${cep.slice(-3)}`);

// Padrão gerado pelo Gerenciador Web: "<dias>: HH:MM às HH:MM", faixas separadas por " · "
// Dias: "Seg a Sex" (consecutivos) ou "Seg, Qua" (soltos). Ex: "Seg a Sex: 07:00 às 17:00 · Sáb: 07:00 às 14:00"
const DAY = '(?:Seg|Ter|Qua|Qui|Sex|Sáb|Dom)';
const DAYS = `${DAY}(?: a ${DAY})?(?:, ${DAY}(?: a ${DAY})?)*`;
const TIME = '(?:[01]\\d|2[0-3]):[0-5]\\d';
const RANGE = `${DAYS}: ${TIME} às ${TIME}`;
const openingHoursRegex = new RegExp(`^${RANGE}(?: · ${RANGE})*$`);

const openingHoursSchema = z
  .string('Horário de funcionamento é obrigatório')
  .trim()
  .regex(
    openingHoursRegex,
    'Horário de funcionamento fora do padrão. Use "<dias>: HH:MM às HH:MM", com faixas separadas por " · " (ex: "Seg a Sex: 07:00 às 17:00 · Sáb: 07:00 às 14:00")',
  );

// Campos do RF008: nome, endereço (CEP, logradouro, número, bairro), horário, telefone opcional e coordenadas
export const createUbsSchema = z.object({
  cnes: z.string().optional(),
  name: z.string('Nome da UBS é obrigatório').min(3, 'Nome da UBS é obrigatório'),
  zipCode: zipCodeSchema,
  address: z.string('Logradouro é obrigatório').trim().min(3, 'Logradouro é obrigatório'),
  number: z.string('Número é obrigatório (use "s/n" se não houver)').trim().min(1, 'Número é obrigatório (use "s/n" se não houver)').max(10),
  neighborhood: z.string('Bairro é obrigatório').trim().min(2, 'Bairro é obrigatório'),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().length(2, 'Estado (UF) deve ter 2 caracteres'),
  latitude: z.number('Latitude é obrigatória').min(-90).max(90, 'Latitude inválida'),
  longitude: z.number('Longitude é obrigatória').min(-180).max(180, 'Longitude inválida'),
  phone: z.string().optional(),
  openingHours: openingHoursSchema,
});

// Ativação/desativação fica no PATCH /ubs/:id/status
export const updateUbsSchema = createUbsSchema.partial();

export const updateUbsStatusSchema = z.object({
  isActive: z.boolean('Informe isActive (true ou false)'),
});

export const listUbsQuerySchema = z.object({
  search: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().default(15),
  includeInactive: z.enum(['true', 'false']).transform((v) => v === 'true').default(false),
});

export type CreateUbsDTO = z.infer<typeof createUbsSchema>;
export type UpdateUbsDTO = z.infer<typeof updateUbsSchema>;
export type UpdateUbsStatusDTO = z.infer<typeof updateUbsStatusSchema>;
export type ListUbsQueryDTO = z.infer<typeof listUbsQuerySchema>;
