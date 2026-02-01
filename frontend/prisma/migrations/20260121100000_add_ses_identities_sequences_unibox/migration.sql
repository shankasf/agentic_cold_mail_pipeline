-- CreateEnum
CREATE TYPE "SESIdentityStatus" AS ENUM ('PENDING', 'VERIFIED', 'WARMING', 'ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ses_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "display_name" TEXT,
    "ses_identity_arn" TEXT,
    "config_set_name" TEXT,
    "status" "SESIdentityStatus" NOT NULL DEFAULT 'PENDING',
    "warmup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "warmup_day" INTEGER NOT NULL DEFAULT 0,
    "daily_limit" INTEGER NOT NULL DEFAULT 50,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3),
    "bounce_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaint_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ses_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "ses_identity_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "sending_days" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "sending_hours" JSONB NOT NULL DEFAULT '{"start": 9, "end": 17}',
    "total_leads" INTEGER NOT NULL DEFAULT 0,
    "active_leads" INTEGER NOT NULL DEFAULT 0,
    "completed_leads" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_steps" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "step_number" INTEGER NOT NULL,
    "delay_days" INTEGER NOT NULL DEFAULT 1,
    "delay_hours" INTEGER NOT NULL DEFAULT 0,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "skip_if_replied" BOOLEAN NOT NULL DEFAULT true,
    "skip_if_clicked" BOOLEAN NOT NULL DEFAULT false,
    "skip_if_opened" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_leads" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_action_at" TIMESTAMP(3),

    CONSTRAINT "sequence_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_lead_steps" (
    "id" TEXT NOT NULL,
    "sequence_lead_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "email_draft_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "skipped_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_lead_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_emails" (
    "id" TEXT NOT NULL,
    "ses_message_id" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "body_html" TEXT,
    "in_reply_to" TEXT,
    "references" TEXT,
    "thread_id" TEXT,
    "original_email_id" TEXT,
    "contact_id" TEXT,
    "business_id" TEXT,
    "ses_identity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "raw_payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

-- Add SES tracking fields to email_drafts
ALTER TABLE "email_drafts" ADD COLUMN "ses_identity_id" TEXT;
ALTER TABLE "email_drafts" ADD COLUMN "ses_message_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ses_identities_email_address_key" ON "ses_identities"("email_address");
CREATE INDEX "ses_identities_user_id_idx" ON "ses_identities"("user_id");
CREATE INDEX "ses_identities_status_idx" ON "ses_identities"("status");

CREATE INDEX "sequences_user_id_idx" ON "sequences"("user_id");
CREATE INDEX "sequences_status_idx" ON "sequences"("status");

CREATE UNIQUE INDEX "sequence_steps_sequence_id_step_number_key" ON "sequence_steps"("sequence_id", "step_number");
CREATE INDEX "sequence_steps_sequence_id_idx" ON "sequence_steps"("sequence_id");

CREATE UNIQUE INDEX "sequence_leads_sequence_id_contact_id_key" ON "sequence_leads"("sequence_id", "contact_id");
CREATE INDEX "sequence_leads_sequence_id_idx" ON "sequence_leads"("sequence_id");
CREATE INDEX "sequence_leads_contact_id_idx" ON "sequence_leads"("contact_id");
CREATE INDEX "sequence_leads_status_idx" ON "sequence_leads"("status");

CREATE UNIQUE INDEX "sequence_lead_steps_sequence_lead_id_step_id_key" ON "sequence_lead_steps"("sequence_lead_id", "step_id");
CREATE INDEX "sequence_lead_steps_sequence_lead_id_idx" ON "sequence_lead_steps"("sequence_lead_id");
CREATE INDEX "sequence_lead_steps_status_idx" ON "sequence_lead_steps"("status");

CREATE UNIQUE INDEX "inbound_emails_ses_message_id_key" ON "inbound_emails"("ses_message_id");
CREATE INDEX "inbound_emails_from_email_idx" ON "inbound_emails"("from_email");
CREATE INDEX "inbound_emails_thread_id_idx" ON "inbound_emails"("thread_id");
CREATE INDEX "inbound_emails_original_email_id_idx" ON "inbound_emails"("original_email_id");
CREATE INDEX "inbound_emails_is_read_idx" ON "inbound_emails"("is_read");
CREATE INDEX "inbound_emails_received_at_idx" ON "inbound_emails"("received_at");

CREATE UNIQUE INDEX "email_drafts_ses_message_id_key" ON "email_drafts"("ses_message_id");
CREATE INDEX "email_drafts_ses_identity_id_idx" ON "email_drafts"("ses_identity_id");

-- AddForeignKey
ALTER TABLE "ses_identities" ADD CONSTRAINT "ses_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sequences" ADD CONSTRAINT "sequences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_ses_identity_id_fkey" FOREIGN KEY ("ses_identity_id") REFERENCES "ses_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sequence_leads" ADD CONSTRAINT "sequence_leads_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequence_leads" ADD CONSTRAINT "sequence_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequence_leads" ADD CONSTRAINT "sequence_leads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sequence_lead_steps" ADD CONSTRAINT "sequence_lead_steps_sequence_lead_id_fkey" FOREIGN KEY ("sequence_lead_id") REFERENCES "sequence_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequence_lead_steps" ADD CONSTRAINT "sequence_lead_steps_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "sequence_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_original_email_id_fkey" FOREIGN KEY ("original_email_id") REFERENCES "email_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_ses_identity_id_fkey" FOREIGN KEY ("ses_identity_id") REFERENCES "ses_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_ses_identity_id_fkey" FOREIGN KEY ("ses_identity_id") REFERENCES "ses_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
