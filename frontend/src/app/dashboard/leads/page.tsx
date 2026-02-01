'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import {
  Users,
  Eye,
  MousePointer,
  MessageSquare,
  TrendingUp,
  Search,
  Filter,
  ExternalLink,
  Mail,
  Building2,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface Lead {
  contactId: string;
  email: string;
  contactName: string | null;
  role: string | null;
  businessId: string;
  company: string;
  industry: string | null;
  website: string | null;
  lastEmailId: string;
  lastSubject: string;
  lastEventType: string;
  lastEventAt: string;
  openCount: number;
  clickCount: number;
  replyCount: number;
  score: number;
}

interface LeadsResponse {
  leads: Lead[];
  metrics: {
    totalEngaged: number;
    opened: number;
    clicked: number;
    replied: number;
    totalSent: number;
    openRate: string;
    clickRate: string;
    replyRate: string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filterOptions: {
    industries: string[];
    campaigns: { id: string; name: string }[];
  };
}

const LEAD_TYPES = [
  { value: 'all', label: 'All Engaged' },
  { value: 'opened', label: 'Opened' },
  { value: 'clicked', label: 'Clicked' },
  { value: 'replied', label: 'Replied' },
];

const SCORE_FILTERS = [
  { value: '', label: 'All Scores' },
  { value: 'hot', label: 'Hot (80+)' },
  { value: 'warm', label: 'Warm (50-79)' },
  { value: 'cool', label: 'Cool (20-49)' },
  { value: 'cold', label: 'Cold (0-19)' },
];

const DATE_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
  { value: '90days', label: 'Last 90 Days' },
];

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-100';
  if (score >= 50) return 'text-yellow-600 bg-yellow-100';
  if (score >= 20) return 'text-orange-600 bg-orange-100';
  return 'text-gray-600 bg-gray-100';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 50) return 'Warm';
  if (score >= 20) return 'Cool';
  return 'Cold';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function LeadsPage() {
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [scoreFilter, setScoreFilter] = useState('');
  const [industry, setIndustry] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [campaignId, setCampaignId] = useState('');
  const [minOpens, setMinOpens] = useState('');
  const [minClicks, setMinClicks] = useState('');
  const [minReplies, setMinReplies] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const queryParams = new URLSearchParams({
    type,
    page: String(page),
    limit: '20',
  });
  if (search) queryParams.set('search', search);
  if (scoreFilter) queryParams.set('score', scoreFilter);
  if (industry) queryParams.set('industry', industry);
  if (dateRange && dateRange !== 'all') queryParams.set('dateRange', dateRange);
  if (campaignId) queryParams.set('campaignId', campaignId);
  if (minOpens) queryParams.set('minOpens', minOpens);
  if (minClicks) queryParams.set('minClicks', minClicks);
  if (minReplies) queryParams.set('minReplies', minReplies);

  const { data, isLoading, error } = useSWR<LeadsResponse>(
    `/api/leads?${queryParams}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          Failed to load leads. Please try again.
        </div>
      </div>
    );
  }

  const metrics = data?.metrics;
  const leads = data?.leads || [];
  const pagination = data?.pagination;
  const filterOptions = data?.filterOptions;

  const hasActiveFilters = scoreFilter || industry || dateRange !== 'all' || campaignId || minOpens || minClicks || minReplies;

  const clearAllFilters = () => {
    setScoreFilter('');
    setIndustry('');
    setDateRange('all');
    setCampaignId('');
    setMinOpens('');
    setMinClicks('');
    setMinReplies('');
    setSearch('');
    setType('all');
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500 mt-1">
          Contacts who engaged with your emails
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Engaged</p>
              <p className="text-xl font-bold">
                {isLoading ? '...' : metrics?.totalEngaged || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Opened</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold">
                  {isLoading ? '...' : metrics?.opened || 0}
                </p>
                <span className="text-sm text-gray-500">
                  ({metrics?.openRate || 0}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MousePointer className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Clicked</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold">
                  {isLoading ? '...' : metrics?.clicked || 0}
                </p>
                <span className="text-sm text-gray-500">
                  ({metrics?.clickRate || 0}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Replied</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold">
                  {isLoading ? '...' : metrics?.replied || 0}
                </p>
                <span className="text-sm text-gray-500">
                  ({metrics?.replyRate || 0}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sent</p>
              <p className="text-xl font-bold">
                {isLoading ? '...' : metrics?.totalSent || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        {/* Primary Filters Row */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, name, or company..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Type Filter */}
          <div className="flex gap-2">
            {LEAD_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filters Row */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Score Filter */}
          <select
            value={scoreFilter}
            onChange={(e) => {
              setScoreFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {SCORE_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {DATE_RANGES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          {/* Industry Filter */}
          {filterOptions?.industries && filterOptions.industries.length > 0 && (
            <select
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Industries</option>
              {filterOptions.industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          )}

          {/* Campaign Filter */}
          {filterOptions?.campaigns && filterOptions.campaigns.length > 0 && (
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Campaigns</option>
              {filterOptions.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <Filter className="w-4 h-4" />
            {showAdvanced ? 'Hide' : 'More'} Filters
          </button>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Advanced Filters (Expandable) */}
        {showAdvanced && (
          <div className="pt-3 border-t flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Min Opens:</label>
              <input
                type="number"
                min="0"
                value={minOpens}
                onChange={(e) => {
                  setMinOpens(e.target.value);
                  setPage(1);
                }}
                className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Min Clicks:</label>
              <input
                type="number"
                min="0"
                value={minClicks}
                onChange={(e) => {
                  setMinClicks(e.target.value);
                  setPage(1);
                }}
                className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Min Replies:</label>
              <input
                type="number"
                min="0"
                value={minReplies}
                onChange={(e) => {
                  setMinReplies(e.target.value);
                  setPage(1);
                }}
                className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0"
              />
            </div>
          </div>
        )}
      </div>

      {/* Leads Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium">No leads found</p>
            <p className="text-sm mt-1">
              Leads will appear here when contacts engage with your emails
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Engagement
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Activity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr key={lead.contactId} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {lead.contactName || lead.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-gray-500">{lead.email}</p>
                      {lead.role && (
                        <p className="text-xs text-gray-400">{lead.role}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{lead.company}</p>
                        {lead.industry && (
                          <p className="text-xs text-gray-500">{lead.industry}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-600">
                        <span className="text-gray-500">Opens:</span> {lead.openCount}
                      </span>
                      <span className="text-purple-600">
                        <span className="text-gray-500">Clicks:</span> {lead.clickCount}
                      </span>
                      <span className="text-orange-600">
                        <span className="text-gray-500">Replies:</span> {lead.replyCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(
                          lead.score
                        )}`}
                      >
                        {lead.score}
                      </span>
                      <span className="text-xs text-gray-500">
                        {getScoreLabel(lead.score)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm text-gray-900">
                        {lead.lastEventType === 'OPEN' && 'Opened email'}
                        {lead.lastEventType === 'CLICK' && 'Clicked link'}
                        {lead.lastEventType === 'REPLY' && 'Replied'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(lead.lastEventAt)}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/emails/${lead.lastEmailId}`}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                        title="View Email"
                      >
                        <Mail className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/dashboard/businesses/${lead.businessId}`}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                        title="View Company"
                      >
                        <Building2 className="w-4 h-4" />
                      </Link>
                      {lead.website && (
                        <a
                          href={
                            lead.website.startsWith('http')
                              ? lead.website
                              : `https://${lead.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="Visit Website"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} leads
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page === pagination.totalPages}
                className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
