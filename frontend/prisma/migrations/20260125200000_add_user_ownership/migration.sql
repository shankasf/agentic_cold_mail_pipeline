-- Add userId to uploads table
ALTER TABLE "uploads" ADD COLUMN "user_id" TEXT;
CREATE INDEX "uploads_user_id_idx" ON "uploads"("user_id");
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to businesses table
ALTER TABLE "businesses" ADD COLUMN "user_id" TEXT;
CREATE INDEX "businesses_user_id_idx" ON "businesses"("user_id");
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to email_drafts table
ALTER TABLE "email_drafts" ADD COLUMN "user_id" TEXT;
CREATE INDEX "email_drafts_user_id_idx" ON "email_drafts"("user_id");
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to email_exports table
ALTER TABLE "email_exports" ADD COLUMN "user_id" TEXT;
CREATE INDEX "email_exports_user_id_idx" ON "email_exports"("user_id");
ALTER TABLE "email_exports" ADD CONSTRAINT "email_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to template_file_uploads table
ALTER TABLE "template_file_uploads" ADD COLUMN "user_id" TEXT;
CREATE INDEX "template_file_uploads_user_id_idx" ON "template_file_uploads"("user_id");
ALTER TABLE "template_file_uploads" ADD CONSTRAINT "template_file_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to email_templates table
ALTER TABLE "email_templates" ADD COLUMN "user_id" TEXT;
CREATE INDEX "email_templates_user_id_idx" ON "email_templates"("user_id");
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add userId to template_uploads table
ALTER TABLE "template_uploads" ADD COLUMN "user_id" TEXT;
CREATE INDEX "template_uploads_user_id_idx" ON "template_uploads"("user_id");
ALTER TABLE "template_uploads" ADD CONSTRAINT "template_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
