import { z } from 'zod';

export const createUbsSchema = z.object({
  cnes: z.string().optional(),
  name: z.string().min(3, 'Nome da UBS é obrigatório'),
  address: z.string().min(3, 'Endereço é obrigatório'),
  neighborhood: z.string().optional(),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().length(2, 'Estado (UF) deve ter 2 caracteres'),
  zipCode: z.string().optional(),
  latitude: z.number().min(-90).max(90, 'Latitude inválida'),
  longitude: z.number().min(-180).max(180, 'Longitude inválida'),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
});

export const updateUbsSchema = z.object({
  cnes: z.string().optional(),
  name: z.string().min(3).optional(),
  address: z.string().min(3).optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(2).optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const listUbsQuerySchema = z.object({
  search: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().default(15),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export type CreateUbsDTO = z.infer<typeof createUbsSchema>;
export type UpdateUbsDTO = z.infer<typeof updateUbsSchema>;
export type ListUbsQueryDTO = z.infer<typeof listUbsQuerySchema>;
