/**
 * Pre-Send Email Validation
 *
 * Final validation checks before sending an email:
 * - Broken personalization tokens
 * - Invalid characters
 * - Excessive length
 * - Blacklisted links/domains
 * - Required fields
 */

import { logger } from './logger';

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  field: string;
  message: string;
}

export interface ValidationWarning {
  code: string;
  field: string;
  message: string;
}

// Configuration
const VALIDATION_CONFIG = {
  // Subject line constraints
  maxSubjectLength: 100,
  minSubjectLength: 2,

  // Body constraints
  maxBodyLength: 10000,
  minBodyLength: 50,

  // Blacklisted domains (spam/phishing indicators)
  blacklistedDomains: [
    'bit.ly',
    'tinyurl.com',
    'goo.gl',
    't.co',
    // Add more as needed
  ],

  // Blacklisted words in links
  blacklistedLinkWords: [
    'unsubscribe-confirm',
    'track-click',
    'redirect',
    'phishing',
  ],

  // Invalid character patterns
  invalidCharPatterns: [
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/g, // Control characters
    /\uFFFD/g,                        // Replacement character
  ],

  // Broken token patterns
  brokenTokenPatterns: [
    /\{\{undefined\}\}/gi,
    /\{\{null\}\}/gi,
    /\{\{\s*\}\}/g,               // Empty tokens
    /\{\{[^}]*undefined[^}]*\}\}/gi,
    /\[object Object\]/gi,
  ],

  // Spam trigger patterns
  spamPatterns: [
    /click here/gi,
    /act now/gi,
    /limited time/gi,
    /winner/gi,
    /congratulations/gi,
    /\$\d+,?\d*/g,                // Dollar amounts
    /!!!+/g,                       // Multiple exclamation marks
    /\?\?\?+/g,                    // Multiple question marks
  ],
};

/**
 * Validate an email before sending
 */
export function validateEmail(params: {
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate email addresses
  validateEmailAddresses(params, errors);

  // Validate subject
  validateSubject(params.subject, errors, warnings);

  // Validate body
  validateBody(params.bodyText, errors, warnings);

  // Validate HTML if present
  if (params.bodyHtml) {
    validateHtml(params.bodyHtml, errors, warnings);
  }

  // Check for broken tokens in all fields
  validateTokens(params, errors);

  // Check for blacklisted content
  validateBlacklist(params, errors, warnings);

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('Pre-send validation failed', {
      toEmail: params.toEmail,
      errorCount: errors.length,
      errors: errors.map(e => e.code),
    });
  }

  return { valid, errors, warnings };
}

/**
 * Validate email addresses
 */
function validateEmailAddresses(
  params: { toEmail: string; fromEmail: string },
  errors: ValidationError[]
): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!params.toEmail) {
    errors.push({
      code: 'MISSING_TO_EMAIL',
      field: 'toEmail',
      message: 'Recipient email address is required',
    });
  } else if (!emailRegex.test(params.toEmail)) {
    errors.push({
      code: 'INVALID_TO_EMAIL',
      field: 'toEmail',
      message: `Invalid recipient email format: ${params.toEmail}`,
    });
  }

  if (!params.fromEmail) {
    errors.push({
      code: 'MISSING_FROM_EMAIL',
      field: 'fromEmail',
      message: 'Sender email address is required',
    });
  } else if (!emailRegex.test(params.fromEmail)) {
    errors.push({
      code: 'INVALID_FROM_EMAIL',
      field: 'fromEmail',
      message: `Invalid sender email format: ${params.fromEmail}`,
    });
  }
}

/**
 * Validate subject line
 */
function validateSubject(
  subject: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (!subject || subject.trim().length === 0) {
    errors.push({
      code: 'MISSING_SUBJECT',
      field: 'subject',
      message: 'Email subject is required',
    });
    return;
  }

  if (subject.length > VALIDATION_CONFIG.maxSubjectLength) {
    errors.push({
      code: 'SUBJECT_TOO_LONG',
      field: 'subject',
      message: `Subject exceeds ${VALIDATION_CONFIG.maxSubjectLength} characters (${subject.length})`,
    });
  }

  if (subject.length < VALIDATION_CONFIG.minSubjectLength) {
    errors.push({
      code: 'SUBJECT_TOO_SHORT',
      field: 'subject',
      message: `Subject must be at least ${VALIDATION_CONFIG.minSubjectLength} characters`,
    });
  }

  // Check for invalid characters
  for (const pattern of VALIDATION_CONFIG.invalidCharPatterns) {
    if (pattern.test(subject)) {
      errors.push({
        code: 'INVALID_CHARS_SUBJECT',
        field: 'subject',
        message: 'Subject contains invalid control characters',
      });
      break;
    }
  }

  // Check for all caps (spam indicator)
  if (subject === subject.toUpperCase() && subject.length > 10) {
    warnings.push({
      code: 'ALL_CAPS_SUBJECT',
      field: 'subject',
      message: 'Subject line is all caps (may trigger spam filters)',
    });
  }
}

/**
 * Validate email body
 */
function validateBody(
  body: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (!body || body.trim().length === 0) {
    errors.push({
      code: 'MISSING_BODY',
      field: 'bodyText',
      message: 'Email body is required',
    });
    return;
  }

  if (body.length > VALIDATION_CONFIG.maxBodyLength) {
    errors.push({
      code: 'BODY_TOO_LONG',
      field: 'bodyText',
      message: `Body exceeds ${VALIDATION_CONFIG.maxBodyLength} characters (${body.length})`,
    });
  }

  if (body.length < VALIDATION_CONFIG.minBodyLength) {
    warnings.push({
      code: 'BODY_TOO_SHORT',
      field: 'bodyText',
      message: `Body is very short (${body.length} characters)`,
    });
  }

  // Check for invalid characters
  for (const pattern of VALIDATION_CONFIG.invalidCharPatterns) {
    if (pattern.test(body)) {
      errors.push({
        code: 'INVALID_CHARS_BODY',
        field: 'bodyText',
        message: 'Body contains invalid control characters',
      });
      break;
    }
  }

  // Check for spam patterns
  for (const pattern of VALIDATION_CONFIG.spamPatterns) {
    if (pattern.test(body)) {
      const match = body.match(pattern);
      warnings.push({
        code: 'SPAM_PATTERN_BODY',
        field: 'bodyText',
        message: `Body contains potential spam trigger: "${match?.[0]}"`,
      });
    }
  }
}

/**
 * Validate HTML content
 */
function validateHtml(
  html: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Check for unclosed tags
  const openTags = (html.match(/<[a-z]+[^>]*>/gi) || []).length;
  const closeTags = (html.match(/<\/[a-z]+>/gi) || []).length;

  if (Math.abs(openTags - closeTags) > 5) {
    warnings.push({
      code: 'UNBALANCED_HTML',
      field: 'bodyHtml',
      message: 'HTML may have unclosed tags',
    });
  }

  // Check for script tags (security)
  if (/<script/i.test(html)) {
    errors.push({
      code: 'SCRIPT_TAG_FOUND',
      field: 'bodyHtml',
      message: 'HTML contains script tags (not allowed)',
    });
  }

  // Check for form tags
  if (/<form/i.test(html)) {
    warnings.push({
      code: 'FORM_TAG_FOUND',
      field: 'bodyHtml',
      message: 'HTML contains form tags (may be flagged)',
    });
  }
}

/**
 * Check for broken personalization tokens
 */
function validateTokens(
  params: { subject: string; bodyText: string; bodyHtml?: string },
  errors: ValidationError[]
): void {
  const fieldsToCheck = [
    { name: 'subject', value: params.subject },
    { name: 'bodyText', value: params.bodyText },
    ...(params.bodyHtml ? [{ name: 'bodyHtml', value: params.bodyHtml }] : []),
  ];

  for (const field of fieldsToCheck) {
    for (const pattern of VALIDATION_CONFIG.brokenTokenPatterns) {
      const matches = field.value.match(pattern);
      if (matches) {
        errors.push({
          code: 'BROKEN_TOKEN',
          field: field.name,
          message: `Broken personalization token found: "${matches[0]}"`,
        });
      }
    }
  }
}

/**
 * Check for blacklisted content
 */
function validateBlacklist(
  params: { subject: string; bodyText: string; bodyHtml?: string },
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Extract URLs from content
  const urlPattern = /https?:\/\/[^\s<>"]+/gi;
  const allContent = `${params.subject} ${params.bodyText} ${params.bodyHtml || ''}`;
  const urls = allContent.match(urlPattern) || [];

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();

      // Check for blacklisted domains
      if (VALIDATION_CONFIG.blacklistedDomains.some(d => domain.includes(d))) {
        errors.push({
          code: 'BLACKLISTED_DOMAIN',
          field: 'bodyText',
          message: `URL contains blacklisted domain: ${domain}`,
        });
      }

      // Check for blacklisted words in URL path
      const fullUrl = url.toLowerCase();
      for (const word of VALIDATION_CONFIG.blacklistedLinkWords) {
        if (fullUrl.includes(word)) {
          warnings.push({
            code: 'SUSPICIOUS_URL',
            field: 'bodyText',
            message: `URL contains suspicious word "${word}": ${url.substring(0, 50)}...`,
          });
        }
      }
    } catch {
      // Invalid URL format
      warnings.push({
        code: 'MALFORMED_URL',
        field: 'bodyText',
        message: `Potentially malformed URL: ${url.substring(0, 50)}`,
      });
    }
  }
}

/**
 * Quick validation check (returns boolean)
 */
export function isValidForSending(params: {
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
}): boolean {
  const result = validateEmail(params);
  return result.valid;
}

/**
 * Get validation summary for logging
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return 'Valid';
  }

  const parts: string[] = [];
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error(s)`);
  }
  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning(s)`);
  }

  return parts.join(', ');
}
