import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { SearchCitizensQueryDTO } from '../dtos/user.dto';

const MAX_RESULTS = 20;

interface ICitizenRow {
  id: string;
  name: string;
  birthDate: Date | null;
  cpf: string | null;
  role: UserRole;
}

// LGPD: expõe apenas os dígitos centrais do CPF (***.123.456-**)
function maskCpf(cpf: string | null): string | null {
  const digits = cpf?.replace(/\D/g, '') ?? '';
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export class SearchCitizensService {
  async execute({ search }: SearchCitizensQueryDTO) {
    // Escapa curingas do LIKE para que o termo seja tratado literalmente
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;

    const citizens = await prisma.$queryRaw<ICitizenRow[]>`
      SELECT id, name, birth_date AS "birthDate", cpf, role
      FROM users
      -- O profissional de saúde também é cidadão (D11); ADMIN fica de fora
      WHERE role IN ('CIDADAO'::"UserRole", 'PROFISSIONAL_SAUDE'::"UserRole")
        AND is_active = true
        AND unaccent(name) ILIKE unaccent(${pattern})
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
