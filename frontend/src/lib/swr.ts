'use client';

import useSWR, { SWRConfiguration } from 'swr';

// Default fetcher for SWR
export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    throw error;
  }
  return res.json();
};

// Default SWR config for optimal performance
export const defaultSWRConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60000, // 1 minute deduplication
  errorRetryCount: 3,
  errorRetryInterval: 5000,
};

// Analytics hook with caching
interface AnalyticsData {
  totalBusinesses: number;
  totalEmails: number;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  avgConfidence: number;
  avgDeliverability: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  industryBreakdown: Array<{ industry: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  dailyTrend: Array<{ date: string; sent: number; opened: number; replied: number }>;
}

export function useAnalytics(timeRange: string = '7d') {
  return useSWR<AnalyticsData>(
    `/api/analytics?timeRange=${timeRange}`,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 300000, // Refresh every 5 minutes
    }
  );
}

// Businesses hook with pagination
interface Business {
  id: string;
  canonicalName: string;
  website: string | null;
  industryGuess: string | null;
  location: string | null;
  createdAt: string;
  _count: {
    contacts: number;
    evidence: number;
    emailDrafts: number;
  };
}

interface BusinessesResponse {
  businesses: Business[];
  total: number;
  page: number;
  limit: number;
}

export function useBusinesses(params: {
  page?: number;
  limit?: number;
  search?: string;
  industry?: string;
  location?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.industry) searchParams.set('industry', params.industry);
  if (params.location) searchParams.set('location', params.location);

  const queryString = searchParams.toString();
  const url = `/api/businesses${queryString ? `?${queryString}` : ''}`;

  return useSWR<BusinessesResponse>(url, fetcher, defaultSWRConfig);
}

// Emails hook with pagination
interface EmailDraft {
  id: string;
  subject: string;
  status: string;
  confidenceScore: number;
  deliverabilityScore: number;
  createdAt: string;
  business: {
    id: string;
    canonicalName: string;
  };
  contact: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface EmailsResponse {
  emails: EmailDraft[];
  total: number;
  page: number;
  limit: number;
}

export function useEmails(params: {
  page?: number;
  limit?: number;
  status?: string;
  businessId?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.businessId) searchParams.set('businessId', params.businessId);

  const queryString = searchParams.toString();
  const url = `/api/emails${queryString ? `?${queryString}` : ''}`;

  return useSWR<EmailsResponse>(url, fetcher, defaultSWRConfig);
}

// Email logs hook
interface EmailLog {
  id: string;
  eventType: string;
  createdAt: string;
  emailDraft: {
    id: string;
    subject: string;
    contact: {
      email: string;
    };
    business: {
      canonicalName: string;
    };
  };
}

interface EmailLogsResponse {
  logs: EmailLog[];
  total: number;
  page: number;
  limit: number;
}

export function useEmailLogs(params: {
  page?: number;
  limit?: number;
  eventType?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.eventType) searchParams.set('eventType', params.eventType);

  const queryString = searchParams.toString();
  const url = `/api/email-logs${queryString ? `?${queryString}` : ''}`;

  return useSWR<EmailLogsResponse>(url, fetcher, defaultSWRConfig);
}

// Uploads hook
interface Upload {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string;
  totalRows?: number;
  validRows?: number;
  errorRows?: number;
}

interface UploadsResponse {
  uploads: Upload[];
}

export function useUploads() {
  return useSWR<UploadsResponse>('/api/uploads', fetcher, {
    ...defaultSWRConfig,
    refreshInterval: 10000, // Refresh more frequently for upload status
  });
}

// Templates hook
interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  subjectTemplate: string;
  isActive: boolean;
  createdAt: string;
}

interface TemplatesResponse {
  templates: EmailTemplate[];
}

export function useTemplates() {
  return useSWR<TemplatesResponse>('/api/templates', fetcher, defaultSWRConfig);
}
