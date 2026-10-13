-- AlterEnum: remove CIRURGIAO_DENTISTA e adiciona AUXILIAR_ENFERMAGEM (D13)
BEGIN;
CREATE TYPE "ProfessionalCategory_new" AS ENUM ('MEDICO', 'ENFERMEIRO', 'TECNICO_ENFERMAGEM', 'AUXILIAR_ENFERMAGEM', 'FARMACEUTICO');
ALTER TABLE "professional_registries" ALTER COLUMN "category" TYPE "ProfessionalCategory_new" USING ("category"::text::"ProfessionalCategory_new");
ALTER TYPE "ProfessionalCategory" RENAME TO "ProfessionalCategory_old";
ALTER TYPE "ProfessionalCategory_new" RENAME TO "ProfessionalCategory";
DROP TYPE "public"."ProfessionalCategory_old";
COMMIT;
