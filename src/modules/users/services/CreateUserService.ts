import bcrypt from 'bcryptjs';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { CreateUserDTO } from '../dtos/user.dto';

export class CreateUserService {
  async execute(data: CreateUserDTO) {
    const { name, email, password, cpf, phone, birthDate, role, professionalRegistry } = data;

    // 1. Verifica duplicidade de e-mail
    const emailAlreadyInUse = await prisma.user.findUnique({
      where: { email },
    });

    if (emailAlreadyInUse) {
      throw new AppError('Já existe um usuário cadastrado com este e-mail.', 409);
    }

    // 2. Verifica duplicidade de CPF se fornecido
    if (cpf) {
      const cpfAlreadyInUse = await prisma.user.findUnique({
        where: { cpf },
      });

      if (cpfAlreadyInUse) {
        throw new AppError('Já existe um usuário cadastrado com este CPF.', 409);
      }
    }

    // 3. Validação do Registro Profissional (RS001)
    if (role === 'PROFISSIONAL_SAUDE' && professionalRegistry) {
      const registryAlreadyInUse = await prisma.professionalRegistry.findUnique({
        where: {
          council_registryNumber_uf: {
            council: professionalRegistry.council.toUpperCase(),
            registryNumber: professionalRegistry.registryNumber,
            uf: professionalRegistry.uf.toUpperCase(),
          },
        },
      });

      if (registryAlreadyInUse) {
        throw new AppError('Este registro profissional já está cadastrado no sistema.', 409);
      }
    }

    // 4. Hash da senha
    const passwordHash = await bcrypt.hash(password, 8);

    // 5. Criação atômica no banco de dados
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        cpf: cpf || null,
        phone: phone || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        role,
        ...(professionalRegistry && role === 'PROFISSIONAL_SAUDE'
          ? {
              professionalRegistry: {
                create: {
                  council: professionalRegistry.council.toUpperCase(),
                  registryNumber: professionalRegistry.registryNumber,
                  uf: professionalRegistry.uf.toUpperCase(),
                  isVerified: true, // Pré-validado para fins de desenvolvimento/apresentação
                  verifiedAt: new Date(),
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
