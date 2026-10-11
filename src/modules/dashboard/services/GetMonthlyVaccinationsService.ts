import { prisma } from '../../../config/prisma';

const TIMEZONE = 'America/Maceio';

interface IMonthlyRow {
  month: string;
  total: number;
}

export class GetMonthlyVaccinationsService {
  /**
   * Vacinas aplicadas por mês nos últimos 12 meses, incluindo o mês atual (RF009).
   * Agrupa pela applicationDate no fuso local; meses sem registros vêm com zero.
   * Dependentes ficam de fora até o RF012.
   */
  async execute() {
    const rows = await prisma.$queryRaw<IMonthlyRow[]>`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE ${TIMEZONE}) - interval '11 months',
          date_trunc('month', now() AT TIME ZONE ${TIMEZONE}),
          interval '1 month'
        ) AS month
      ),
      records AS (
        SELECT date_trunc('month', vr.application_date AT TIME ZONE 'UTC' AT TIME ZONE ${TIMEZONE}) AS month
        FROM vaccination_records vr
        INNER JOIN users u ON u.id = vr.user_id
        WHERE vr.dependent_id IS NULL
          AND vr.application_date IS NOT NULL
          AND u.role = 'CIDADAO'::"UserRole"
          AND u.is_active = true
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month, COUNT(r.month)::int AS total
      FROM months m
      LEFT JOIN records r ON r.month = m.month
      GROUP BY m.month
      ORDER BY m.month ASC
    `;

    return rows;
  }
}
