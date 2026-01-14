/**
 * Client for communicating with the AI Agent Service
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

export interface ChunkData {
  id: string;
  chunkIndex: number;
  textContent: string;
  sourceMeta: Record<string, unknown>;
}

export interface GenerateEmailsRequest {
  chunks: ChunkData[];
  industryPlaybooks?: Record<string, unknown>;
  uploadId?: string;  // For progress tracking
}

export interface GenerateEmailsResponse {
  businesses: Array<{
    temp_business_key: string;
    canonical_name: string;
    website?: string;
    industry_guess?: string;
    location?: string;
    confidence: number;
  }>;
  contacts: Array<{
    temp_business_key: string;
    email: string;
    name?: string;
    role?: string;
    confidence: number;
  }>;
  evidence: Array<{
    temp_business_key: string;
    email?: string;
    evidence_type: string;
    extracted_value: string;
    chunk_id: string;
    confidence: number;
  }>;
  emails: Array<{
    business_id: string;
    contact_id: string;
    subject: string;
    body_text: string;
    footer_text: string;
    personalization_tokens: Record<string, unknown>;
    confidence_score: number;
    deliverability_score: number;
    spam_flags: string[];
    status: string;
  }>;
  errors: string[];
}

export interface RecheckComplianceResponse {
  deliverabilityScore: number;
  spamFlags: string[];
  suggestions?: string;
  footerText: string;
}

class AIClient {
  private baseUrl: string;

  constructor(baseUrl: string = AI_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/config`);
    if (!response.ok) {
      throw new Error('Failed to get AI service config');
    }
    return response.json();
  }

  async generateEmails(request: GenerateEmailsRequest): Promise<GenerateEmailsResponse> {
    // Use AbortController with 10 minute timeout for large chunk processing
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to generate emails');
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 minutes');
      }
      throw error;
    }
  }

  async recheckCompliance(subject: string, bodyText: string): Promise<RecheckComplianceResponse> {
    const response = await fetch(`${this.baseUrl}/recheck-compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject, bodyText }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to recheck compliance');
    }

    return response.json();
  }
}

export const aiClient = new AIClient();
export default aiClient;
