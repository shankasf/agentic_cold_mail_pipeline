-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('EMAIL', 'DOMAIN');

-- AlterTable
ALTER TABLE "ses_identities" ADD COLUMN "identity_type" "IdentityType" NOT NULL DEFAULT 'EMAIL';
