import { PrismaClient } from '@prisma/client';
import dns from 'dns';
import { promisify } from 'util';

const prisma = new PrismaClient();
const resolveMx = promisify(dns.resolveMx);

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'tempail.com', 'getnada.com', 'mohmal.com', 'maildrop.cc',
]);

async function validateEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
  const normalized = email.toLowerCase().trim();
  
  // Format check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, reason: 'Invalid format' };
  }
  
  const [, domain] = normalized.split('@');
  
  // Disposable check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Disposable email' };
  }
  
  // MX record check
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: 'No MX records' };
    }
  } catch {
    return { valid: false, reason: 'MX lookup failed' };
  }
  
  return { valid: true };
}

async function main() {
  // Get draft emails
  const drafts = await prisma.emailDraft.findMany({
    where: { status: 'DRAFT' },
    include: { contact: true },
  });
  
  console.log(`Validating ${drafts.length} draft emails...\n`);
  
  const valid: string[] = [];
  const invalid: { id: string; email: string; reason: string }[] = [];
  
  // Check suppression list
  const suppressedEmails = await prisma.suppressionList.findMany();
  const suppressedSet = new Set(suppressedEmails.map(s => s.email.toLowerCase()));
  
  for (const draft of drafts) {
    const email = draft.contact.email.toLowerCase();
    
    // Check suppression list first
    if (suppressedSet.has(email)) {
      invalid.push({ id: draft.id, email, reason: 'In suppression list' });
      continue;
    }
    
    const result = await validateEmail(email);
    if (result.valid) {
      valid.push(draft.id);
    } else {
      invalid.push({ id: draft.id, email, reason: result.reason! });
    }
  }
  
  console.log(`\n=== VALIDATION RESULTS ===`);
  console.log(`Valid: ${valid.length}`);
  console.log(`Invalid: ${invalid.length}`);
  
  if (invalid.length > 0) {
    console.log(`\nInvalid emails:`);
    for (const inv of invalid) {
      console.log(`  - ${inv.email}: ${inv.reason}`);
    }
  }
  
  console.log(`\nValid email IDs (for approval):`);
  console.log(JSON.stringify(valid));
  
  await prisma.$disconnect();
}

main().catch(console.error);
