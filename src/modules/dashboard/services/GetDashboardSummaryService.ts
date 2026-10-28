import { loadCitizenVaccineStatuses } from './loadCitizenVaccineStatuses';

export class GetDashboardSummaryService {
  /**
   * Indicadores do painel do profissional (RF009). Considera as cadernetas de
   * cidadãos e profissionais ativos (D11); dependentes entram com o RF012.
   * Doses atrasadas contam só as que não têm nenhum registro; as informadas pelo
   * cidadão e ainda não confirmadas ficam em `totalDosesAguardandoConferencia` (D32).
   */
  async execute(referenceDate = new Date()) {
    const { records, statuses } = await loadCitizenVaccineStatuses(referenceDate);

    return {
      totalCadernetas: new Set(records.map((record) => record.userId)).size,
      totalVacinasRegistradas: records.length,
      totalDosesAtrasadas: statuses.filter(({ status }) => status === 'ATRASADA').length,
      totalDosesAguardandoConferencia: statuses.reduce((sum, item) => sum + item.pendingDoses.length, 0),
    };
  }
}
