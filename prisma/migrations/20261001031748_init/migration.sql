-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CIDADAO', 'PROFISSIONAL_SAUDE', 'ADMIN');

-- CreateEnum
CREATE TYPE "TargetAudience" AS ENUM ('CRIANCA', 'ADOLESCENTE', 'ADULTO', 'IDOSO', 'GESTANTE', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "VaccineStatus" AS ENUM ('EM_DIA', 'ATRASADA', 'COMPLETA', 'CONFIRMADO');

-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('MANUAL', 'OCR_ICR', 'SISTEMA_PRESENCIAL');

-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('MOBILE', 'WEB');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "birth_date" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'CIDADAO',
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_registries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "council" TEXT NOT NULL,
    "registry_number" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_registries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "cpf" TEXT,
    "relationship" TEXT NOT NULL,
    "gender" TEXT,
    "guardian_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_audience" "TargetAudience" NOT NULL DEFAULT 'CRIANCA',
    "target_disease" TEXT NOT NULL,
    "doses_count" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doses" (
    "id" TEXT NOT NULL,
    "vaccine_id" TEXT NOT NULL,
    "dose_number" INTEGER NOT NULL,
    "dose_name" TEXT NOT NULL,
    "recommended_age_months" INTEGER,
    "interval_days_from_previous" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "dependent_id" TEXT,
    "dose_id" TEXT NOT NULL,
    "status" "VaccineStatus" NOT NULL DEFAULT 'EM_DIA',
    "application_date" TIMESTAMP(3),
    "expected_date" TIMESTAMP(3),
    "lot_number" TEXT,
    "manufacturer" TEXT,
    "ubs_id" TEXT,
    "applied_by_id" TEXT,
    "origin" "RecordOrigin" NOT NULL DEFAULT 'MANUAL',
    "ocr_confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubss" (
    "id" TEXT NOT NULL,
    "cnes" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "opening_hours" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ubss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "banner_url" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "target_audience" "TargetAudience",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_vaccines" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "vaccineId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_vaccines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_ubss" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "ubs_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_ubss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "ClientPlatform" NOT NULL,
    "device_name" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "professional_registries_user_id_key" ON "professional_registries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_registries_council_registry_number_uf_key" ON "professional_registries"("council", "registry_number", "uf");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "dependents_cpf_key" ON "dependents"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "dependents_name_birth_date_key" ON "dependents"("name", "birth_date");

-- CreateIndex
CREATE UNIQUE INDEX "vaccines_name_key" ON "vaccines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "doses_vaccine_id_dose_number_key" ON "doses"("vaccine_id", "dose_number");

-- CreateIndex
CREATE UNIQUE INDEX "ubss_cnes_key" ON "ubss"("cnes");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_vaccines_campaignId_vaccineId_key" ON "campaign_vaccines"("campaignId", "vaccineId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_ubss_campaign_id_ubs_id_key" ON "campaign_ubss"("campaign_id", "ubs_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- AddForeignKey
ALTER TABLE "professional_registries" ADD CONSTRAINT "professional_registries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doses" ADD CONSTRAINT "doses_vaccine_id_fkey" FOREIGN KEY ("vaccine_id") REFERENCES "vaccines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_dose_id_fkey" FOREIGN KEY ("dose_id") REFERENCES "doses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "ubss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_vaccines" ADD CONSTRAINT "campaign_vaccines_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_vaccines" ADD CONSTRAINT "campaign_vaccines_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "vaccines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_ubss" ADD CONSTRAINT "campaign_ubss_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_ubss" ADD CONSTRAINT "campaign_ubss_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "ubss"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
