import { z } from 'zod';

// Formato único de paginação no servidor (D22): ?page= (padrão 1) e ?limit= (padrão 20, máx. 100)
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number('page deve ser um número')
    .int('page deve ser um número inteiro')
    .min(1, 'page deve ser no mínimo 1')
    .default(1),
  limit: z.coerce
    .number('limit deve ser um número')
    .int('limit deve ser um número inteiro')
    .min(1, 'limit deve ser no mínimo 1')
    .max(100, 'limit deve ser no máximo 100')
    .default(20),
});

export type PaginationQueryDTO = z.infer<typeof paginationQuerySchema>;

export interface IPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function toSkipTake({ page, limit }: PaginationQueryDTO) {
  return { skip: (page - 1) * limit, take: limit };
}

export function buildPage<T>(items: T[], total: number, { page, limit }: PaginationQueryDTO): IPage<T> {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Para listas calculadas em memória (ex.: busca ativa do dashboard)
export function paginateArray<T>(all: T[], pagination: PaginationQueryDTO): IPage<T> {
  const { skip, take } = toSkipTake(pagination);
  return buildPage(all.slice(skip, skip + take), all.length, pagination);
}
