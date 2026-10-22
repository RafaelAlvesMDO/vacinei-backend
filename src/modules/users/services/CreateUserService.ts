import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { privacyConfig } from '../../../config/privacy';
import { AppError } from '../../../errors/AppError';
import { CreateUserDTO } from '../dtos/user.dto';
import { COUNCIL_BY_CATEGORY, parseRegistryNumber } from '../../../utils/professionalCouncil';

interface IRequester {
  id: string;
  role: UserRole;
}

// Formato já validado no DTO: separa o sufixo -UF do número e deriva o conselho
function normalizeRegistry({ category, registryNumber, uf }: NonNullable<CreateUserDTO['professionalRegistry']>) {
  const parsed = parseRegistryNumber(registryNumber);

  if (!parsed) {
    throw new AppError('Registro profissional em formato inválido.', 400);
  }

  return {
    category,
    council: COUNCIL_BY_CATEGORY[category],
    registryNumber: parsed.number,
    uf: (parsed.uf ?? uf ?? '').toUpperCase(),
  };
}

export class CreateUserService {
  async execute(data: CreateUserDTO, requester?: IRequester) {
    const { name, email, password, cpf, phone, birthDate, role, professionalRegistry } = data;

    const isCreatedByAdmin = requester?.role === UserRole.ADMIN;

    // Cadastro público só cria CIDADAO e PROFISSIONAL_SAUDE; ADMIN apenas por outro admin
    if (role === UserRole.ADMIN && !isCreatedByAdmin) {
      throw new AppError('Apenas administradores podem criar contas de administrador.', 403);
    }

    // 1. Verifica duplicidade de e-mail
    const emailAlreadyInUse = await prisma.user.findUnique({
      where: { email },
    });

    if (emailAlreadyInUse) {
      throw new AppError('Já existe um usuário cadastrado com este e-mail.', 409);
    }

    // 2. Verifica duplicidade de CPF (já normalizado para 11 dígitos no DTO)
    const cpfAlreadyInUse = await prisma.user.findUnique({
      where: { cpf },
    });

    if (cpfAlreadyInUse) {
      throw new AppError('Já existe um usuário cadastrado com este CPF.', 409);
    }

    // 3. Validação do Registro Profissional (RS001); council derivado da categoria
    const registry =
      role === UserRole.PROFISSIONAL_SAUDE && professionalRegistry
        ? normalizeRegistry(professionalRegistry)
        : null;

    if (registry) {
      const registryAlreadyInUse = await prisma.professionalRegistry.findUnique({
        where: {
          council_registryNumber_uf: {
            council: registry.council,
            registryNumber: registry.registryNumber,
            uf: registry.uf,
          },
        },
      });

      if (registryAlreadyInUse) {
        throw new AppError('Este registro profissional já está cadastrado no sistema.', 409);
      }
    }

    // 4. Hash da senha
    const passwordHash = await bcrypt.hash(password, authConfig.bcryptSaltRounds);

    // 5. Criação atômica no banco de dados
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        cpf,
        phone,
        birthDate: new Date(birthDate),
        role,
        // acceptedPrivacyPolicy já garantido como true no DTO (D26)
        privacyConsentAt: new Date(),
        privacyPolicyVersion: privacyConfig.policyVersion,
        ...(registry
          ? {
              professionalRegistry: {
                create: {
                  ...registry,
                  // Cadastro público nasce pendente (RS001); criado por ADMIN já nasce verificado
                  ...(isCreatedByAdmin
                    ? { isVerified: true, verifiedAt: new Date(), verifiedById: requester.id }
                    : { isVerified: false }),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        phone: true,
        birthDate: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        professionalRegistry: true,
      },
    });

    return user;
  }
}
