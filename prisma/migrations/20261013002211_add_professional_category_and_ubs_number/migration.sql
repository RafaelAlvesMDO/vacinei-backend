-- CreateEnum
CREATE TYPE "ProfessionalCategory" AS ENUM ('MEDICO', 'ENFERMEIRO', 'TECNICO_ENFERMAGEM', 'FARMACEUTICO', 'CIRURGIAO_DENTISTA');

-- AlterTable: adiciona a coluna como opcional para preencher os registros existentes
ALTER TABLE "professional_registries" ADD COLUMN "category" "ProfessionalCategory";

-- Backfill: deriva a categoria do conselho já cadastrado (COREN assume ENFERMEIRO)
UPDATE "professional_registries"
SET "category" = CASE UPPER("council")
  WHEN 'CRM' THEN 'MEDICO'::"ProfessionalCategory"
  WHEN 'CRF' THEN 'FARMACEUTICO'::"ProfessionalCategory"
  WHEN 'CRO' THEN 'CIRURGIAO_DENTISTA'::"ProfessionalCategory"
  ELSE 'ENFERMEIRO'::"ProfessionalCategory"
END;

ALTER TABLE "professional_registries" ALTER COLUMN "category" SET NOT NULL;

-- AlterTable
ALTER TABLE "ubss" ADD COLUMN "number" TEXT NOT NULL DEFAULT 's/n';
