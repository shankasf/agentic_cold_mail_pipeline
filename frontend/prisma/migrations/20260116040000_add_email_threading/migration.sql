-- Add threading columns to email_drafts
ALTER TABLE "email_drafts" ADD COLUMN IF NOT EXISTS "parent_email_id" TEXT;
ALTER TABLE "email_drafts" ADD COLUMN IF NOT EXISTS "thread_id" TEXT;
ALTER TABLE "email_drafts" ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP(3);

-- Add self-referential foreign key for threading
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_parent_email_id_fkey" FOREIGN KEY ("parent_email_id") REFERENCES "email_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
