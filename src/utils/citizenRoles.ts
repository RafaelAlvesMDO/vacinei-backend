import { UserRole } from '@prisma/client';

// Perfis que possuem caderneta própria: o profissional de saúde também é cidadão (D11)
export const CITIZEN_ROLES: UserRole[] = [UserRole.CIDADAO, UserRole.PROFISSIONAL_SAUDE];
