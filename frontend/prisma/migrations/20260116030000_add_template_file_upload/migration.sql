-- CreateTable
CREATE TABLE IF NOT EXISTS "template_file_uploads" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_text" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_template_id" TEXT,

    CONSTRAINT "template_file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "template_file_uploads_created_template_id_key" ON "template_file_uploads"("created_template_id");

-- AddForeignKey
ALTER TABLE "template_file_uploads" ADD CONSTRAINT "template_file_uploads_created_template_id_fkey" FOREIGN KEY ("created_template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
