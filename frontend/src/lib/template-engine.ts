/**
 * Template Engine for Non-Agentic Email Pipeline
 * Handles variable substitution in email templates
 */

export interface TemplateData {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  industry?: string;
  [key: string]: string | undefined;
}

export interface EmailTemplate {
  id: string;
  category: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: string[];
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
}

/**
 * Render a template with variable substitution
 * Variables are in format: {{variableName}}
 */
export function renderTemplate(
  template: string,
  data: TemplateData
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    const value = data[variable];
    return value !== undefined ? value : match; // Keep placeholder if no value
  });
}

/**
 * Render both subject and body of an email template
 */
export function renderEmail(
  template: EmailTemplate,
  data: TemplateData,
  signature: string
): RenderedEmail {
  const subject = renderTemplate(template.subjectTemplate, data);
  const bodyWithoutSignature = renderTemplate(template.bodyTemplate, data);
  const body = `${bodyWithoutSignature}\n\n${signature}`;

  return { subject, body };
}

/**
 * Extract all variable names from a template string
 */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const variables = matches.map(m => m.replace(/[{}]/g, ''));
  return [...new Set(variables)]; // Remove duplicates
}

/**
 * Validate that CSV headers contain required columns
 */
export function validateCsvHeaders(
  headers: string[],
  requiredColumns: string[] = ['email']
): ValidationResult {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  const missing = requiredColumns.filter(
    col => !normalizedHeaders.includes(col.toLowerCase())
  );

  return {
    valid: missing.length === 0,
    missing,
    errors: missing.length > 0
      ? [`Missing required columns: ${missing.join(', ')}`]
      : [],
  };
}

/**
 * Validate that data has values for template variables
 */
export function validateTemplateData(
  data: TemplateData,
  requiredVariables: string[]
): ValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];

  // Email is always required
  if (!data.email || !isValidEmail(data.email)) {
    errors.push('Invalid or missing email address');
  }

  // Check required variables
  for (const variable of requiredVariables) {
    if (variable === 'email') continue; // Already checked
    if (!data[variable]) {
      missing.push(variable);
    }
  }

  return {
    valid: errors.length === 0 && missing.length === 0,
    missing,
    errors,
  };
}

/**
 * Basic email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse CSV row into TemplateData
 */
export function parseRowToTemplateData(
  row: Record<string, string>,
  columnMapping?: Record<string, string>
): TemplateData {
  const mapping = columnMapping || {
    email: 'email',
    name: 'name',
    company: 'company',
    role: 'role',
    industry: 'industry',
  };

  const data: TemplateData = {
    email: '',
  };

  // Map standard columns
  for (const [key, csvColumn] of Object.entries(mapping)) {
    const value = row[csvColumn] || row[csvColumn.toLowerCase()];
    if (value) {
      data[key] = value.trim();
    }
  }

  // Include any extra columns as custom fields
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().trim();
    if (!Object.values(mapping).includes(normalizedKey) && value) {
      data[normalizedKey] = value.trim();
    }
  }

  return data;
}

/**
 * Generate default signature from config
 */
export function generateSignature(config: {
  senderName: string;
  senderTitle: string;
  companyName: string;
}): string {
  return `Best regards,
${config.senderName}
${config.senderTitle}
${config.companyName}`;
}

/**
 * Preview template with sample data
 */
export function previewTemplate(
  template: EmailTemplate,
  sampleData?: Partial<TemplateData>
): RenderedEmail {
  const defaultData: TemplateData = {
    email: 'john@example.com',
    name: 'John Smith',
    company: 'Acme Corp',
    role: 'CEO',
    industry: 'Technology',
    ...sampleData,
  };

  const signature = generateSignature({
    senderName: 'Sagar Shankaran',
    senderTitle: 'Founder & CEO',
    companyName: 'CallSphere LLC',
  });

  return renderEmail(template, defaultData, signature);
}

/**
 * Get all available template categories
 */
export const TEMPLATE_CATEGORIES = [
  'SALES',
  'DEMO',
  'PARTNERSHIP',
  'SUPPORT',
  'WEBINAR',
  'PRODUCT_LAUNCH',
] as const;

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

/**
 * Default templates for each category
 */
export const DEFAULT_TEMPLATES: Record<TemplateCategory, { subject: string; body: string }> = {
  SALES: {
    subject: '{{company}} - Quick question about your {{industry}} needs',
    body: `Hi {{name}},

I noticed {{company}} is in the {{industry}} space and wanted to reach out.

We help companies like yours automate customer calls with AI voice agents, reducing response times by 80% while maintaining a personal touch.

Would you be open to a quick 15-minute call to see if this could help {{company}}?

Book a time here: {{calendly_url}}`,
  },
  DEMO: {
    subject: 'Demo request - AI Voice Agents for {{company}}',
    body: `Hi {{name}},

Thanks for your interest in CallSphere!

I'd love to show you how our AI voice agents can help {{company}} handle customer calls more efficiently.

In just 15 minutes, I can demonstrate:
- How our AI handles inbound calls naturally
- Integration with your existing systems
- ROI calculator for {{industry}} businesses

Book your personalized demo: {{calendly_url}}`,
  },
  PARTNERSHIP: {
    subject: 'Partnership opportunity - {{company}} x CallSphere',
    body: `Hi {{name}},

I've been following {{company}}'s work in the {{industry}} space and I'm impressed by what you've built.

At CallSphere, we're looking for strategic partners to expand our AI voice agent solutions. Given your position as {{role}} at {{company}}, I thought you might be interested in exploring a collaboration.

Would you be open to a brief call to discuss potential synergies?

Schedule here: {{calendly_url}}`,
  },
  SUPPORT: {
    subject: 'Following up - {{company}} support inquiry',
    body: `Hi {{name}},

I wanted to personally follow up on your recent inquiry about CallSphere.

As {{role}} at {{company}}, you likely deal with customer communication challenges daily. Our AI voice agents are specifically designed to help {{industry}} companies like yours.

I'm happy to answer any questions or walk you through a quick demo.

Let's connect: {{calendly_url}}`,
  },
  WEBINAR: {
    subject: 'You\'re invited: AI Voice Agents for {{industry}}',
    body: `Hi {{name}},

You're invited to an exclusive webinar on how {{industry}} companies are using AI voice agents to transform customer communication.

What you'll learn:
- Real case studies from companies like {{company}}
- Implementation best practices
- Live Q&A with our team

As {{role}}, you'll find actionable insights you can apply immediately.

Register now: {{calendly_url}}`,
  },
  PRODUCT_LAUNCH: {
    subject: 'New feature alert for {{company}}',
    body: `Hi {{name}},

Exciting news! We've just launched a new feature that's perfect for {{industry}} companies like {{company}}.

Our latest update includes:
- Enhanced voice recognition accuracy
- Faster response times
- Better integration options

As {{role}}, you'll appreciate how this can streamline operations at {{company}}.

See it in action: {{calendly_url}}`,
  },
};
