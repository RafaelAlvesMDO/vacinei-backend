import { maskCpf } from '../../../utils/cpf';
import { OverdueQueryDTO } from '../dtos/dashboard.dto';
import { loadCitizenVaccineStatuses } from './loadCitizenVaccineStatuses';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Compara nomes sem diferenciar maiúsculas, minúsculas e acentos
function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface IOverduePerson {
  id: string;
  name: string;
  cpf: string | null;
  maxDaysOverdue: number;
  overdueVaccines: {
    vaccineId: string;
    vaccineName: string;
    nextDose: { id: string; doseName: string };
    nextDoseDate: Date;
    daysOverdue: number;
  }[];
}

export class GetOverdueListService {
  /**
   * Lista de busca ativa de faltosos (RF009, D21): pessoas com ao menos uma
   * vacina ATRASADA, da mais atrasada para a menos atrasada. Usa o mesmo
   * cálculo do /summary, então o total sem `search` bate com o card.
   */
  async execute({ limit, search }: OverdueQueryDTO, referenceDate = new Date()) {
    const { statuses } = await loadCitizenVaccineStatuses(referenceDate);
    const today = utcDay(referenceDate);
    const term = search ? normalizeName(search) : null;

    const people = new Map<string, IOverduePerson>();

    for (const item of statuses) {
      if (item.status !== 'ATRASADA' || !item.nextDose || !item.nextDoseDate || !item.userId || !item.user) continue;
      if (term && !normalizeName(item.user.name).includes(term)) continue;

      const daysOverdue = Math.round((today - utcDay(item.nextDoseDate)) / DAY_IN_MS);
      const person: IOverduePerson = people.get(item.userId) ?? {
        id: item.userId,
        name: item.user.name,
        cpf: maskCpf(item.user.cpf),
        maxDaysOverdue: 0,
        overdueVaccines: [],
      };

      person.overdueVaccines.push({
        vaccineId: item.vaccineId,
        vaccineName: item.vaccineName,
        nextDose: { id: item.nextDose.id, doseName: item.nextDose.doseName },
        nextDoseDate: item.nextDoseDate,
        daysOverdue,
      });
      person.maxDaysOverdue = Math.max(person.maxDaysOverdue, daysOverdue);
      people.set(item.userId, person);
    }

    const sorted = [...people.values()].sort(
      (a, b) => b.maxDaysOverdue - a.maxDaysOverdue || a.name.localeCompare(b.name, 'pt-BR'),
    );
    for (const person of sorted) {
      person.overdueVaccines.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    return {
      totalPessoas: sorted.length,
      totalDosesAtrasadas: sorted.reduce((sum, person) => sum + person.overdueVaccines.length, 0),
      items: sorted.slice(0, limit),
    };
  }
}
