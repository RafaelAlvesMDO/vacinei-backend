import { Prisma } from '@prisma/client';

export const professionalSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  createdAt: true,
  professionalRegistry: {
    select: {
      council: true,
      registryNumber: true,
      uf: true,
      isVerified: true,
      verifiedAt: true,
      verifiedBy: { select: { id: true, name: true } },
      rejectedAt: true,
      rejectedBy: { select: { id: true, name: true } },
      rejectionReason: true,
    },
  },
} satisfies Prisma.UserSelect;

type ProfessionalRow = Prisma.UserGetPayload<{ select: typeof professionalSelect }>;

export type VerificationStatus = 'PENDENTE' | 'VERIFICADO' | 'RECUSADO';

// Formato de resposta dos endpoints de verificação de profissionais (RS001)
export function toProfessionalResponse({ professionalRegistry: registry, ...user }: ProfessionalRow) {
  const verificationStatus: VerificationStatus = registry?.isVerified
    ? 'VERIFICADO'
    : registry?.rejectedAt
      ? 'RECUSADO'
      : 'PENDENTE';

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt,
    category: registry?.council ?? null,
    registry: registry
      ? { council: registry.council, registryNumber: registry.registryNumber, uf: registry.uf }
      : null,
    isVerified: registry?.isVerified ?? false,
    verificationStatus,
    verifiedAt: registry?.verifiedAt ?? null,
    verifiedBy: registry?.verifiedBy ?? null,
    rejectedAt: registry?.rejectedAt ?? null,
    rejectedBy: registry?.rejectedBy ?? null,
    rejectionReason: registry?.rejectionReason ?? null,
  };
}
