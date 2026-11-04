/*
  Warnings:

  - You are about to drop the column `dependent_id` on the `vaccination_records` table. All the data in the column will be lost.
  - You are about to drop the `dependents` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MASCULINO', 'FEMININO');

-- CreateEnum
CREATE TYPE "DependentRelationship" AS ENUM ('FILHO', 'PAI_MAE', 'CONJUGE', 'CURATELADO', 'OUTRO');

-- DropForeignKey
ALTER TABLE "dependents" DROP CONSTRAINT "dependents_guardian_id_fkey";

-- DropForeignKey
ALTER TABLE "vaccination_records" DROP CONSTRAINT "vaccination_records_dependent_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "relationship" "DependentRelationship",
ADD COLUMN     "responsible_id" TEXT,
ADD COLUMN     "sex" "Sex",
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vaccination_records" DROP COLUMN "dependent_id";

-- DropTable
DROP TABLE "dependents";

-- CreateIndex
CREATE INDEX "users_responsible_id_idx" ON "users"("responsible_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
