-- Performance indexes for optimized queries
-- These indexes improve query performance for common filters and joins

-- Business indexes
CREATE INDEX IF NOT EXISTS "businesses_industry_guess_idx" ON "businesses"("industry_guess");
CREATE INDEX IF NOT EXISTS "businesses_location_idx" ON "businesses"("location");
CREATE INDEX IF NOT EXISTS "businesses_created_at_idx" ON "businesses"("created_at");

-- Contact indexes
CREATE INDEX IF NOT EXISTS "contacts_business_id_idx" ON "contacts"("business_id");
CREATE INDEX IF NOT EXISTS "contacts_created_at_idx" ON "contacts"("created_at");

-- Business evidence indexes
CREATE INDEX IF NOT EXISTS "business_evidence_business_id_idx" ON "business_evidence"("business_id");
CREATE INDEX IF NOT EXISTS "business_evidence_upload_id_idx" ON "business_evidence"("upload_id");

-- Industry observations indexes
CREATE INDEX IF NOT EXISTS "industry_observations_business_id_idx" ON "industry_observations"("business_id");
CREATE INDEX IF NOT EXISTS "industry_observations_industry_idx" ON "industry_observations"("industry");

-- Email drafts indexes
CREATE INDEX IF NOT EXISTS "email_drafts_business_id_idx" ON "email_drafts"("business_id");
CREATE INDEX IF NOT EXISTS "email_drafts_contact_id_idx" ON "email_drafts"("contact_id");
CREATE INDEX IF NOT EXISTS "email_drafts_status_idx" ON "email_drafts"("status");
CREATE INDEX IF NOT EXISTS "email_drafts_created_at_idx" ON "email_drafts"("created_at");
CREATE INDEX IF NOT EXISTS "email_drafts_thread_id_idx" ON "email_drafts"("thread_id");

-- Email events indexes
CREATE INDEX IF NOT EXISTS "email_events_email_draft_id_idx" ON "email_events"("email_draft_id");
CREATE INDEX IF NOT EXISTS "email_events_event_type_idx" ON "email_events"("event_type");
CREATE INDEX IF NOT EXISTS "email_events_created_at_idx" ON "email_events"("created_at");

-- Template rows indexes
CREATE INDEX IF NOT EXISTS "template_rows_upload_id_idx" ON "template_rows"("upload_id");
CREATE INDEX IF NOT EXISTS "template_rows_status_idx" ON "template_rows"("status");
