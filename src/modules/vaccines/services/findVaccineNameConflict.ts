import { prisma } from '../../../config/prisma';
import { normalizeName } from '../../../utils/normalizeName';

// Procura vacina com nome equivalente (sem diferenciar maiúsculas, minúsculas e acentos).
// O catálogo de vacinas é pequeno, então a comparação é feita em memória.
export async function findVaccineNameConflict(name: string, ignoreId?: string) {
  const target = normalizeName(name);

  const vaccines = await prisma.vaccine.findMany({
    where: ignoreId ? { id: { not: ignoreId } } : undefined,
    select: { id: true, name: true },
  });

  return vaccines.find((v) => normalizeName(v.name) === target) ?? null;
}
