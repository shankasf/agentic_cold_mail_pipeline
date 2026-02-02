import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { s3Storage } from './storage';
import { logger } from './logger';

/**
 * Parsed email result from S3
 */
export interface ParsedEmail {
  subject: string;
  from: {
    name: string | null;
    email: string;
  };
  to: string[];
  text: string | null;
  html: string | null;
  date: Date | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  attachments: ParsedAttachment[];
}

/**
 * Parsed attachment info
 */
export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId: string | null;
  isInline: boolean;
}

/**
 * Fetch raw email from S3 and parse with mailparser
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @returns Parsed email with text, html, attachments, etc.
 */
export async function fetchAndParseEmailFromS3(
  bucket: string,
  key: string
): Promise<{ success: boolean; data?: ParsedEmail; error?: string }> {
  try {
    // Fetch raw email from S3
    logger.debug('Fetching email from S3', { bucket, key });
    const result = await s3Storage.readFromBucket(bucket, key);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to fetch email from S3',
      };
    }

    // Parse the raw email using mailparser
    logger.debug('Parsing email content', { size: result.data.length });
    const parsed = await simpleParser(result.data);

    // Extract sender info
    const fromAddress = parsed.from?.value?.[0];
    const from = {
      name: fromAddress?.name || null,
      email: fromAddress?.address?.toLowerCase() || '',
    };

    // Extract recipients
    const to = extractAddresses(parsed.to);

    // Process attachments
    const attachments = processAttachments(parsed.attachments || []);

    // Build result
    const parsedEmail: ParsedEmail = {
      subject: parsed.subject || '(No Subject)',
      from,
      to,
      text: parsed.text || null,
      html: typeof parsed.html === 'string' ? parsed.html : null,
      date: parsed.date || null,
      messageId: parsed.messageId || null,
      inReplyTo: parsed.inReplyTo || null,
      references: formatReferences(parsed.references),
      attachments,
    };

    logger.debug('Email parsed successfully', {
      subject: parsedEmail.subject,
      from: parsedEmail.from.email,
      attachmentCount: attachments.length,
    });

    return {
      success: true,
      data: parsedEmail,
    };
  } catch (error: any) {
    logger.error('Failed to fetch and parse email from S3', error, { bucket, key });
    return {
      success: false,
      error: error.message || 'Failed to parse email',
    };
  }
}

/**
 * Parse raw email content (not from S3)
 * @param content - Raw email content as Buffer or string
 * @returns Parsed email
 */
export async function parseRawEmail(
  content: Buffer | string
): Promise<{ success: boolean; data?: ParsedEmail; error?: string }> {
  try {
    const parsed = await simpleParser(content);

    // Extract sender info
    const fromAddress = parsed.from?.value?.[0];
    const from = {
      name: fromAddress?.name || null,
      email: fromAddress?.address?.toLowerCase() || '',
    };

    // Extract recipients
    const to = extractAddresses(parsed.to);

    // Process attachments
    const attachments = processAttachments(parsed.attachments || []);

    // Build result
    const parsedEmail: ParsedEmail = {
      subject: parsed.subject || '(No Subject)',
      from,
      to,
      text: parsed.text || null,
      html: typeof parsed.html === 'string' ? parsed.html : null,
      date: parsed.date || null,
      messageId: parsed.messageId || null,
      inReplyTo: parsed.inReplyTo || null,
      references: formatReferences(parsed.references),
      attachments,
    };

    return {
      success: true,
      data: parsedEmail,
    };
  } catch (error: any) {
    logger.error('Failed to parse raw email', error);
    return {
      success: false,
      error: error.message || 'Failed to parse email',
    };
  }
}

/**
 * Extract email addresses from mailparser address object
 */
function extractAddresses(
  addressObj: ParsedMail['to']
): string[] {
  if (!addressObj) return [];

  if (Array.isArray(addressObj)) {
    return addressObj.flatMap((addr) =>
      addr.value.map((v) => v.address?.toLowerCase() || '')
    ).filter(Boolean);
  }

  return addressObj.value.map((v) => v.address?.toLowerCase() || '').filter(Boolean);
}

/**
 * Process attachments from parsed email
 */
function processAttachments(attachments: Attachment[]): ParsedAttachment[] {
  return attachments.map((attachment) => ({
    filename: attachment.filename || 'unnamed',
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size || attachment.content?.length || 0,
    content: attachment.content,
    contentId: attachment.contentId || null,
    isInline: attachment.contentDisposition === 'inline' || !!attachment.contentId,
  }));
}

/**
 * Format references header (can be string or array)
 */
function formatReferences(
  references: string | string[] | undefined
): string | null {
  if (!references) return null;
  if (Array.isArray(references)) {
    return references.join(' ');
  }
  return references;
}

export default {
  fetchAndParseEmailFromS3,
  parseRawEmail,
};
