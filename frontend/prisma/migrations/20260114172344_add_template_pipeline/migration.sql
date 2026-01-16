-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('QUEUED', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('EMAIL_FOUND', 'INDUSTRY', 'SERVICES', 'TOOLS', 'PAIN_POINT', 'LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'EXPORTED', 'SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('CSV', 'PDF', 'BATCH_ZIP');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPEN', 'CLICK', 'REPLY', 'BOUNCE', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('SALES', 'DEMO', 'PARTNERSHIP', 'SUPPORT', 'WEBINAR', 'PRODUCT_LAUNCH');

-- CreateEnum
CREATE TYPE "PipelineType" AS ENUM ('AGENTIC', 'TEMPLATE');

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UploadStatus" NOT NULL DEFAULT 'QUEUED',
    "progress_text" TEXT,
    "error_text" TEXT,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parsed_chunks" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text_content" TEXT NOT NULL,
    "source_meta" JSONB NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "parsed_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "website" TEXT,
    "industry_guess" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "source_confidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_evidence" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "evidence_type" "EvidenceType" NOT NULL,
    "extracted_value" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_playbook" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "common_pain_points" JSONB NOT NULL,
    "value_props" JSONB NOT NULL,
    "subject_angles" JSONB NOT NULL,
    "safe_claims" JSONB NOT NULL,
    "banned_phrases" JSONB NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_observations" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "evidence_chunk_id" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_drafts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "from_name" TEXT NOT NULL DEFAULT 'CallSphere',
    "from_email" TEXT NOT NULL DEFAULT 'hello@callsphere.tech',
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "footer_text" TEXT NOT NULL,
    "personalization_tokens" JSONB NOT NULL,
    "confidence_score" INTEGER NOT NULL DEFAULT 0,
    "deliverability_score" INTEGER NOT NULL DEFAULT 0,
    "spam_flags" JSONB NOT NULL DEFAULT '[]',
    "status" "EmailStatus" NOT NULL DEFAULT 'DRAFT',
    "pipeline_type" "PipelineType" NOT NULL DEFAULT 'AGENTIC',
    "template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_exports" (
    "id" TEXT NOT NULL,
    "export_type" "ExportType" NOT NULL,
    "filters" JSONB NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "email_draft_id" TEXT NOT NULL,
    "event_type" "EmailEventType" NOT NULL,
    "provider_message_id" TEXT,
    "event_payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list" (
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" TEXT NOT NULL,
    "business_address" TEXT NOT NULL DEFAULT '27 Orchard Pl, New York, NY 12601',
    "calendly_url" TEXT NOT NULL DEFAULT 'https://calendly.com/sagar-callsphere/new-meeting',
    "confidence_threshold" INTEGER NOT NULL DEFAULT 70,
    "deliverability_threshold" INTEGER NOT NULL DEFAULT 70,
    "max_words" INTEGER NOT NULL DEFAULT 110,
    "sending_cap_per_day" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '["name", "company", "role", "industry"]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_uploads" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'QUEUED',
    "progress_text" TEXT,
    "error_text" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_rows" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "role" TEXT,
    "industry" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_text" TEXT,
    "email_draft_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parsed_chunks_upload_id_hash_key" ON "parsed_chunks"("upload_id", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "industry_playbook_industry_key" ON "industry_playbook"("industry");

-- AddForeignKey
ALTER TABLE "parsed_chunks" ADD CONSTRAINT "parsed_chunks_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_evidence" ADD CONSTRAINT "business_evidence_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_evidence" ADD CONSTRAINT "business_evidence_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_evidence" ADD CONSTRAINT "business_evidence_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "parsed_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_observations" ADD CONSTRAINT "industry_observations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_observations" ADD CONSTRAINT "industry_observations_evidence_chunk_id_fkey" FOREIGN KEY ("evidence_chunk_id") REFERENCES "parsed_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_draft_id_fkey" FOREIGN KEY ("email_draft_id") REFERENCES "email_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_uploads" ADD CONSTRAINT "template_uploads_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_rows" ADD CONSTRAINT "template_rows_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "template_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
