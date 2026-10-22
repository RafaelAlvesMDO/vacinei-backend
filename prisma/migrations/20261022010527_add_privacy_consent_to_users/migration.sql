-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privacy_consent_at" TIMESTAMP(3),
ADD COLUMN     "privacy_policy_version" TEXT;
