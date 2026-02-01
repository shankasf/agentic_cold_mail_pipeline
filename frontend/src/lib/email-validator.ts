/**
 * Email Verification Utility
 * Validates email addresses before adding to the system
 */

import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

export interface EmailValidationResult {
  isValid: boolean;
  email: string;
  normalizedEmail: string;
  errors: string[];
  warnings: string[];
  checks: {
    format: boolean;
    mxRecord: boolean;
    disposable: boolean;
    roleAccount: boolean;
  };
}

// Common disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'tempail.com', 'getnada.com', 'mohmal.com', 'maildrop.cc',
  'dispostable.com', 'sharklasers.com', 'spam4.me', 'grr.la', 'mailnesia.com',
]);

// Role-based email prefixes (often not real individuals)
const ROLE_PREFIXES = [
  'admin', 'info', 'support', 'sales', 'contact', 'help', 'hello',
  'noreply', 'no-reply', 'marketing', 'hr', 'jobs', 'careers',
  'webmaster', 'postmaster', 'abuse', 'billing', 'accounts',
  'newsletter', 'subscribe', 'unsubscribe', 'feedback', 'team',
];

/**
 * Validate email format using RFC 5322 compliant regex
 */
function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Check if domain has valid MX records
 */
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if email is from a disposable email provider
 */
function isDisposableEmail(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Check if email is a role-based account
 */
function isRoleAccount(localPart: string): boolean {
  const lowerLocal = localPart.toLowerCase();
  return ROLE_PREFIXES.some(prefix =>
    lowerLocal === prefix || lowerLocal.startsWith(`${prefix}.`) || lowerLocal.startsWith(`${prefix}_`)
  );
}

/**
 * Normalize email address (lowercase, trim)
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validate a single email address
 */
export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedEmail = normalizeEmail(email);

  const result: EmailValidationResult = {
    isValid: true,
    email,
    normalizedEmail,
    errors,
    warnings,
    checks: {
      format: false,
      mxRecord: false,
      disposable: true, // true = not disposable (passed)
      roleAccount: true, // true = not role account (passed)
    },
  };

  // Check format
  if (!isValidEmailFormat(normalizedEmail)) {
    result.checks.format = false;
    errors.push('Invalid email format');
    result.isValid = false;
    return result;
  }
  result.checks.format = true;

  // Extract domain and local part
  const [localPart, domain] = normalizedEmail.split('@');

  if (!domain) {
    errors.push('Missing domain');
    result.isValid = false;
    return result;
  }

  // Check MX records
  const hasMx = await hasMxRecords(domain);
  result.checks.mxRecord = hasMx;
  if (!hasMx) {
    errors.push(`Domain "${domain}" has no mail server (MX record)`);
    result.isValid = false;
  }

  // Check disposable email
  if (isDisposableEmail(domain)) {
    result.checks.disposable = false;
    errors.push('Disposable email addresses are not allowed');
    result.isValid = false;
  }

  // Check role account (warning only, not blocking)
  if (isRoleAccount(localPart)) {
    result.checks.roleAccount = false;
    warnings.push('This appears to be a role-based email (e.g., info@, support@), not a personal address');
  }

  return result;
}

/**
 * Validate multiple emails in batch
 */
export async function validateEmails(emails: string[]): Promise<{
  valid: EmailValidationResult[];
  invalid: EmailValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
}> {
  const results = await Promise.all(emails.map(validateEmail));

  const valid = results.filter(r => r.isValid);
  const invalid = results.filter(r => !r.isValid);
  const withWarnings = results.filter(r => r.warnings.length > 0);

  return {
    valid,
    invalid,
    summary: {
      total: emails.length,
      valid: valid.length,
      invalid: invalid.length,
      warnings: withWarnings.length,
    },
  };
}

/**
 * Quick validation (format only, no DNS lookup)
 * Use for real-time validation in forms
 */
export function quickValidateEmail(email: string): { isValid: boolean; error?: string } {
  const normalized = normalizeEmail(email);

  if (!isValidEmailFormat(normalized)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  const [, domain] = normalized.split('@');

  if (isDisposableEmail(domain)) {
    return { isValid: false, error: 'Disposable email addresses are not allowed' };
  }

  return { isValid: true };
}

/**
 * Check if email already exists in suppression list
 */
export async function isEmailBlocked(email: string, prisma: any): Promise<{ blocked: boolean; reason?: string }> {
  const normalized = normalizeEmail(email);

  const suppressed = await prisma.suppressionList.findUnique({
    where: { email: normalized },
  });

  if (suppressed) {
    return {
      blocked: true,
      reason: `Email is in suppression list (${suppressed.reason})`
    };
  }

  return { blocked: false };
}
