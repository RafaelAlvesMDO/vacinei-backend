-- AlterTable
ALTER TABLE "vaccines" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
