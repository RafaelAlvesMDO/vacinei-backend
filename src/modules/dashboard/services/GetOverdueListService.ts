import { maskCpf } from '../../../utils/cpf';
import { paginateArray } from '../../../utils/pagination';
import { OverdueQueryDTO } from '../dtos/dashboard.dto';
import { loadCitizenVaccineStatuses } from './loadCitizenVaccineStatuses';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type OverdueGroup = OverdueQueryDTO['status'];

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Compara nomes sem diferenciar maiúsculas, minúsculas e acentos
function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface IOverdueVaccine {
  vaccineId: string;
  vaccineName: string;
  // Dose vencida sem registro (só no grupo ATRASADA)
  nextDose: { id: string; doseName: string } | null;
  nextDoseDate: Date | null;
  daysOverdue: number | null;
  // Doses informadas pelo cidadão e ainda não confirmadas
  pendingDoses: { id: string; doseName: string; applicationDate: Date | null }[];
}

interface IOverduePerson {
  id: string;
  name: string;
  cpf: string | null;
  maxDaysOverdue: number | null;
  vaccines: IOverdueVaccine[];
}

type Groups = Record<OverdueGroup, Map<string, IOverduePerson>>;

export class GetOverdueListService {
  /**
   * Lista de busca ativa de faltosos (RF009, D21), em dois grupos (D32):
   * - ATRASADA: pessoas com dose vencida sem nenhum registro, da mais atrasada
   *   para a menos atrasada. Bate com o card "Doses atrasadas" do /summary.
   * - AGUARDANDO_CONFERENCIA: pessoas com doses informadas e não confirmadas,
   *   por nome. Não há dias de atraso: falta só a conferência presencial.
   * Uma vacina pode estar nos dois grupos, com doses diferentes.
   */
  async execute({ page, limit, search, status }: OverdueQueryDTO, referenceDate = new Date()) {
    const { statuses } = await loadCitizenVaccineStatuses(referenceDate);
    const today = utcDay(referenceDate);
    const term = search ? normalizeName(search) : null;

    const groups: Groups = { ATRASADA: new Map(), AGUARDANDO_CONFERENCIA: new Map() };

    const addVaccine = (group: OverdueGroup, item: (typeof statuses)[number], vaccine: IOverdueVaccine) => {
      if (!item.userId || !item.user) return;
      const person: IOverduePerson = groups[group].get(item.userId) ?? {
        id: item.userId,
        name: item.user.name,
        cpf: maskCpf(item.user.cpf),
        maxDaysOverdue: null,
        vaccines: [],
      };
      person.vaccines.push(vaccine);
      if (vaccine.daysOverdue !== null) {
        person.maxDaysOverdue = Math.max(person.maxDaysOverdue ?? 0, vaccine.daysOverdue);
      }
      groups[group].set(item.userId, person);
    };

    for (const item of statuses) {
      if (!item.userId || !item.user) continue;
      if (term && !normalizeName(item.user.name).includes(term)) continue;

      const pendingDoses = item.pendingDoses.map(({ id, doseName, applicationDate }) => ({
        id,
        doseName,
        applicationDate,
      }));

      if (item.status === 'ATRASADA' && item.nextDose && item.nextDoseDate) {
        addVaccine('ATRASADA', item, {
          vaccineId: item.vaccineId,
          vaccineName: item.vaccineName,
          nextDose: { id: item.nextDose.id, doseName: item.nextDose.doseName },
          nextDoseDate: item.nextDoseDate,
          daysOverdue: Math.round((today - utcDay(item.nextDoseDate)) / DAY_IN_MS),
          pendingDoses,
        });
      }

      if (pendingDoses.length > 0) {
        addVaccine('AGUARDANDO_CONFERENCIA', item, {
          vaccineId: item.vaccineId,
          vaccineName: item.vaccineName,
          nextDose: null,
          nextDoseDate: null,
          daysOverdue: null,
          pendingDoses,
        });
      }
    }

    const overdue = [...groups.ATRASADA.values()].sort(
      (a, b) => (b.maxDaysOverdue ?? 0) - (a.maxDaysOverdue ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
    );
    for (const person of overdue) {
      person.vaccines.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
    }

    const awaiting = [...groups.AGUARDANDO_CONFERENCIA.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    for (const person of awaiting) {
      person.vaccines.sort((a, b) => a.vaccineName.localeCompare(b.vaccineName, 'pt-BR'));
    }

    const countDoses = (people: IOverduePerson[], group: OverdueGroup) =>
      people.reduce(
        (sum, person) =>
          sum +
          person.vaccines.reduce((acc, vaccine) => acc + (group === 'ATRASADA' ? 1 : vaccine.pendingDoses.length), 0),
        0,
      );

    const selected = status === 'ATRASADA' ? overdue : awaiting;

    // A lista é calculada em memória (status vem do motor de regras), então pagina depois de ordenar
    return {
      ...paginateArray(selected, { page, limit }),
      // Totais dos dois grupos com a busca aplicada (D22), para as abas
      counts: { ATRASADA: overdue.length, AGUARDANDO_CONFERENCIA: awaiting.length },
      doseCounts: {
        ATRASADA: countDoses(overdue, 'ATRASADA'),
        AGUARDANDO_CONFERENCIA: countDoses(awaiting, 'AGUARDANDO_CONFERENCIA'),
      },
    };
  }
}
