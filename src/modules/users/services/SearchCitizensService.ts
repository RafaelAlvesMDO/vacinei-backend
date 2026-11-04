import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { SearchCitizensQueryDTO } from '../dtos/user.dto';
import { isCpfLike, maskCpf, normalizeCpf } from '../../../utils/cpf';

const MAX_RESULTS = 20;

interface ICitizenRow {
  id: string;
  name: string;
  birthDate: Date | null;
  cpf: string | null;
  role: UserRole;
  responsibleId: string | null;
  responsibleName: string | null;
}

export class SearchCitizensService {
  async execute({ search }: SearchCitizensQueryDTO) {
    // Termo com formato de CPF busca pelo CPF exato; senão, busca por nome (RF010 nota 1).
    // O CPF do responsável também traz os dependentes dele, que muitas vezes não têm CPF (D33).
    const filter = isCpfLike(search)
      ? Prisma.sql`(u.cpf = ${normalizeCpf(search)} OR r.cpf = ${normalizeCpf(search)})`
      : // Escapa curingas do LIKE para que o termo seja tratado literalmente
        Prisma.sql`unaccent(u.name) ILIKE unaccent(${`%${search.replace(/[\\%_]/g, '\\$&')}%`})`;

    const citizens = await prisma.$queryRaw<ICitizenRow[]>`
      SELECT u.id, u.name, u.birth_date AS "birthDate", u.cpf, u.role,
             r.id AS "responsibleId", r.name AS "responsibleName"
      FROM users u
      LEFT JOIN users r ON r.id = u.responsible_id
      -- O profissional de saúde também é cidadão (D11); ADMIN fica de fora
      WHERE u.role IN ('CIDADAO'::"UserRole", 'PROFISSIONAL_SAUDE'::"UserRole")
        AND u.is_active = true
        AND ${filter}
      -- Titulares antes dos dependentes
      ORDER BY (u.responsible_id IS NOT NULL) ASC, u.name ASC
      LIMIT ${MAX_RESULTS}
    `;

    return citizens.map((citizen) => ({
      id: citizen.id,
      name: citizen.name,
      birthDate: citizen.birthDate,
      cpf: maskCpf(citizen.cpf),
      role: citizen.role,
      // Dependente (D33): o profissional vê quem é o responsável
      responsible: citizen.responsibleId ? { id: citizen.responsibleId, name: citizen.responsibleName } : null,
    }));
  }
}
