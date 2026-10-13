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
}

export class SearchCitizensService {
  async execute({ search }: SearchCitizensQueryDTO) {
    // Termo com formato de CPF busca pelo CPF exato; senão, busca por nome (RF010 nota 1)
    const filter = isCpfLike(search)
      ? Prisma.sql`cpf = ${normalizeCpf(search)}`
      : // Escapa curingas do LIKE para que o termo seja tratado literalmente
        Prisma.sql`unaccent(name) ILIKE unaccent(${`%${search.replace(/[\\%_]/g, '\\$&')}%`})`;

    const citizens = await prisma.$queryRaw<ICitizenRow[]>`
      SELECT id, name, birth_date AS "birthDate", cpf, role
      FROM users
      -- O profissional de saúde também é cidadão (D11); ADMIN fica de fora
      WHERE role IN ('CIDADAO'::"UserRole", 'PROFISSIONAL_SAUDE'::"UserRole")
        AND is_active = true
        AND ${filter}
      ORDER BY name ASC
      LIMIT ${MAX_RESULTS}
    `;

    return citizens.map((citizen) => ({
      id: citizen.id,
      name: citizen.name,
      birthDate: citizen.birthDate,
      cpf: maskCpf(citizen.cpf),
      role: citizen.role,
    }));
  }
}
