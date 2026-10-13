import { ProfessionalCategory } from '@prisma/client';

// Conselho de classe derivado da categoria (RF001); nunca é enviado pelo cliente
export const COUNCIL_BY_CATEGORY: Record<ProfessionalCategory, string> = {
  MEDICO: 'CRM',
  ENFERMEIRO: 'COREN',
  TECNICO_ENFERMAGEM: 'COREN',
  AUXILIAR_ENFERMAGEM: 'COREN',
  FARMACEUTICO: 'CRF',
};

// Número do registro com sufixo de UF opcional (ex: 123456 ou 123456-AL)
export const REGISTRY_NUMBER_REGEX = /^([A-Za-z0-9]{1,20})(?:-([A-Za-z]{2}))?$/;

export function parseRegistryNumber(raw: string) {
  const match = REGISTRY_NUMBER_REGEX.exec(raw.trim());
  if (!match) return null;
  return { number: match[1].toUpperCase(), uf: match[2]?.toUpperCase() };
}
