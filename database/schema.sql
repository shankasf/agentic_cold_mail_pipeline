-- Email Marketing Dashboard Database Schema
-- PostgreSQL 15+

-- Drop existing tables and types (for clean setup)
DROP TABLE IF EXISTS suppression_list CASCADE;
DROP TABLE IF EXISTS email_events CASCADE;
DROP TABLE IF EXISTS email_exports CASCADE;
DROP TABLE IF EXISTS email_drafts CASCADE;
DROP TABLE IF EXISTS industry_observations CASCADE;
DROP TABLE IF EXISTS industry_playbook CASCADE;
DROP TABLE IF EXISTS business_evidence CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
DROP TABLE IF EXISTS parsed_chunks CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;

DROP TYPE IF EXISTS "UploadStatus" CASCADE;
DROP TYPE IF EXISTS "EvidenceType" CASCADE;
DROP TYPE IF EXISTS "EmailStatus" CASCADE;
DROP TYPE IF EXISTS "ExportType" CASCADE;
DROP TYPE IF EXISTS "EmailEventType" CASCADE;
DROP TYPE IF EXISTS "SuppressionReason" CASCADE;

-- Create ENUMs
CREATE TYPE "UploadStatus" AS ENUM ('QUEUED', 'PARSED', 'FAILED');
CREATE TYPE "EvidenceType" AS ENUM ('EMAIL_FOUND', 'INDUSTRY', 'SERVICES', 'TOOLS', 'PAIN_POINT', 'LOCATION', 'OTHER');
CREATE TYPE "EmailStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'EXPORTED', 'SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT');
CREATE TYPE "ExportType" AS ENUM ('CSV', 'PDF', 'BATCH_ZIP');
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPEN', 'CLICK', 'REPLY', 'BOUNCE', 'COMPLAINT');
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL');

-- Uploads table
CREATE TABLE uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status "UploadStatus" DEFAULT 'QUEUED',
    progress_text TEXT,
    error_text TEXT
);

-- Parsed chunks table
CREATE TABLE parsed_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    source_meta JSONB NOT NULL DEFAULT '{}',
    hash VARCHAR(64) NOT NULL,
    UNIQUE(upload_id, hash)
);

CREATE INDEX idx_parsed_chunks_upload_id ON parsed_chunks(upload_id);

-- Businesses table
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry_guess VARCHAR(100),
    location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_businesses_canonical_name ON businesses(canonical_name);
CREATE INDEX idx_businesses_industry ON businesses(industry_guess);

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    role VARCHAR(100),
    source_confidence INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contacts_business_id ON contacts(business_id);
CREATE INDEX idx_contacts_email ON contacts(email);

-- Business evidence table
CREATE TABLE business_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES parsed_chunks(id) ON DELETE CASCADE,
    evidence_type "EvidenceType" NOT NULL,
    extracted_value TEXT NOT NULL,
    confidence INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_business_evidence_business_id ON business_evidence(business_id);
CREATE INDEX idx_business_evidence_type ON business_evidence(evidence_type);

-- Industry playbook table
CREATE TABLE industry_playbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry VARCHAR(100) NOT NULL UNIQUE,
    common_pain_points JSONB NOT NULL DEFAULT '[]',
    value_props JSONB NOT NULL DEFAULT '[]',
    subject_angles JSONB NOT NULL DEFAULT '[]',
    safe_claims JSONB NOT NULL DEFAULT '[]',
    banned_phrases JSONB NOT NULL DEFAULT '[]',
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_industry_playbook_industry ON industry_playbook(industry);

-- Industry observations table
CREATE TABLE industry_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry VARCHAR(100) NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    observation TEXT NOT NULL,
    evidence_chunk_id UUID NOT NULL REFERENCES parsed_chunks(id) ON DELETE CASCADE,
    confidence INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_industry_observations_business_id ON industry_observations(business_id);
CREATE INDEX idx_industry_observations_industry ON industry_observations(industry);

-- Email drafts table
CREATE TABLE email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    from_name VARCHAR(100) DEFAULT 'CallSphere',
    from_email VARCHAR(255) DEFAULT 'greetings@callsphere.tech',
    subject VARCHAR(500) NOT NULL,
    body_text TEXT NOT NULL,
    footer_text TEXT NOT NULL,
    personalization_tokens JSONB NOT NULL DEFAULT '{}',
    confidence_score INTEGER DEFAULT 0,
    deliverability_score INTEGER DEFAULT 0,
    spam_flags JSONB DEFAULT '[]',
    status "EmailStatus" DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_drafts_business_id ON email_drafts(business_id);
CREATE INDEX idx_email_drafts_contact_id ON email_drafts(contact_id);
CREATE INDEX idx_email_drafts_status ON email_drafts(status);

-- Email exports table
CREATE TABLE email_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type "ExportType" NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    file_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email events table
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_draft_id UUID NOT NULL REFERENCES email_drafts(id) ON DELETE CASCADE,
    event_type "EmailEventType" NOT NULL,
    provider_message_id VARCHAR(255),
    event_payload JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_events_email_draft_id ON email_events(email_draft_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);

-- Suppression list table
CREATE TABLE suppression_list (
    email VARCHAR(255) PRIMARY KEY,
    reason "SuppressionReason" NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin settings table (single row)
CREATE TABLE admin_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_address TEXT DEFAULT '27 Orchard Pl, New York, NY 12601',
    calendly_url TEXT DEFAULT 'https://calendly.com/sagar-callsphere/new-meeting',
    confidence_threshold INTEGER DEFAULT 70,
    deliverability_threshold INTEGER DEFAULT 70,
    max_words INTEGER DEFAULT 110,
    sending_cap_per_day INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin settings
INSERT INTO admin_settings (id) VALUES (gen_random_uuid());

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_drafts_updated_at
    BEFORE UPDATE ON email_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VALIDATED EMAIL BUSINESSES
-- Tracks businesses with successfully delivered emails for reputation tracking
-- =============================================================================

CREATE TABLE validated_email_businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- First and last successful delivery timestamps
    first_validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Email metrics for this business
    total_emails_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_complaints INTEGER DEFAULT 0,

    -- Calculated rates (stored for quick queries)
    delivery_rate FLOAT DEFAULT 0,       -- delivered / sent
    open_rate FLOAT DEFAULT 0,           -- opened / delivered
    click_rate FLOAT DEFAULT 0,          -- clicked / delivered
    reply_rate FLOAT DEFAULT 0,          -- replied / delivered
    bounce_rate FLOAT DEFAULT 0,         -- bounced / sent
    complaint_rate FLOAT DEFAULT 0,      -- complaints / sent

    -- Validation status
    is_validated BOOLEAN DEFAULT true,   -- Email deliverability confirmed
    validation_score INTEGER DEFAULT 100, -- 0-100 score based on metrics

    -- Last contact email that was validated
    last_validated_email VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(business_id)
);

CREATE INDEX idx_validated_email_businesses_business_id ON validated_email_businesses(business_id);
CREATE INDEX idx_validated_email_businesses_validation_score ON validated_email_businesses(validation_score);
CREATE INDEX idx_validated_email_businesses_is_validated ON validated_email_businesses(is_validated);
CREATE INDEX idx_validated_email_businesses_last_validated ON validated_email_businesses(last_validated_at);

-- Trigger for updated_at
CREATE TRIGGER update_validated_email_businesses_updated_at
    BEFORE UPDATE ON validated_email_businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
