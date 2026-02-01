'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Filter,
  Upload,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  RefreshCw,
  Download,
  Settings,
  BarChart3,
  Users,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  X,
  Eye,
  MousePointer,
  Reply,
  UserCheck,
  UserX,
  Plane,
  Calendar,
  Tag,
  LayoutGrid,
  Send,
  MoreHorizontal,
  Columns,
} from 'lucide-react';
import { AIPromptSidebar } from '@/components/leads/AIPromptModal';
import { LeadEditModal } from '@/components/leads/LeadEditModal';
import { ImportModal } from '@/components/leads/ImportModal';
import { LeadDetailPanel } from '@/components/leads/LeadDetailPanel';
import { ColumnManager } from '@/components/leads/ColumnManager';
import { AdvancedFilters } from '@/components/leads/AdvancedFilters';
import { AddToSequenceModal } from '@/components/leads/AddToSequenceModal';
import { EmailGenerationModal } from '@/components/leads/EmailGenerationModal';

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  emailProvider: string | null;
  emailSecurity: string | null;
  status: string;
  lastContactedAt: string | null;
  customColumns: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  enrichmentData?: Record<string, unknown>;
  lastEnrichedAt?: string | null;
}

interface LeadColumn {
  id: string;
  name: string;
  key: string;
  type: string;
  isEnriched: boolean;
  orderIndex: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface FilterState {
  tags: string[];
  companies: string[];
  industries: string[];
  locations: string[];
  emailProviders: string[];
  verificationStatus: string;
  dateFrom: string;
  dateTo: string;
  hasPhone: string;
  hasLinkedin: string;
  hasWebsite: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  NOT_CONTACTED: { icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100', label: 'Not Contacted' },
  CONTACTED: { icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Contacted' },
  OPENED: { icon: Eye, color: 'text-cyan-600', bg: 'bg-cyan-50', label: 'Opened' },
  CLICKED: { icon: MousePointer, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Clicked' },
  REPLIED: { icon: Reply, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Replied' },
  INTERESTED: { icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50', label: 'Interested' },
  MEETING_BOOKED: { icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Meeting Booked' },
  NOT_INTERESTED: { icon: UserX, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Not Interested' },
  BOUNCED: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Bounced' },
  UNSUBSCRIBED: { icon: X, color: 'text-slate-500', bg: 'bg-slate-100', label: 'Unsubscribed' },
  OUT_OF_OFFICE: { icon: Plane, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Out of Office' },
};

const TABS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '' },
  { id: 'leads', label: 'Leads', icon: Users, href: '/leads' },
  { id: 'sequences', label: 'Sequences', icon: Mail, href: '/sequences' },
  { id: 'schedule', label: 'Schedule', icon: Clock, href: '/schedule' },
  { id: 'options', label: 'Options', icon: Settings, href: '/options' },
];

// Default visible columns
const DEFAULT_VISIBLE_COLUMNS = ['email', 'emailProvider', 'emailSecurity', 'status', 'firstName', 'lastName', 'company', 'tags'];

const TAG_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function CampaignLeadsPage() {
  const params = useParams();
  const campaignId = params.id as string;

  // Data state
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [columns, setColumns] = useState<LeadColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Stats
  const [stats, setStats] = useState<{ total: number; statusBreakdown: Record<string, number> }>({
    total: 0,
    statusBreakdown: {},
  });

  // UI state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);

  // Advanced filters
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    tags: [],
    companies: [],
    industries: [],
    locations: [],
    emailProviders: [],
    verificationStatus: 'all',
    dateFrom: '',
    dateTo: '',
    hasPhone: 'all',
    hasLinkedin: 'all',
    hasWebsite: 'all',
  });

  // Modals
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLeadDetail, setSelectedLeadDetail] = useState<Lead | null>(null);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showEmailGeneration, setShowEmailGeneration] = useState(false);
  const [emailGenerationMode, setEmailGenerationMode] = useState<'initial' | 'followup'>('initial');

  // Extract unique values for filters
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    leads.forEach((lead) => lead.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [leads]);

  const availableCompanies = useMemo(() => {
    const companies = new Set<string>();
    leads.forEach((lead) => lead.company && companies.add(lead.company));
    return Array.from(companies).slice(0, 50);
  }, [leads]);

  const availableIndustries = useMemo(() => {
    const industries = new Set<string>();
    leads.forEach((lead) => lead.industry && industries.add(lead.industry));
    return Array.from(industries);
  }, [leads]);

  // Fetch campaign details
  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign');
      const data = await res.json();
      setCampaign(data);
    } catch {
      setError('Failed to fetch campaign');
    }
  }, [campaignId]);

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (advancedFilters.tags.length > 0) params.set('tags', advancedFilters.tags.join(','));

      const res = await fetch(`/api/campaigns/${campaignId}/leads?${params}`);
      if (!res.ok) throw new Error('Failed to fetch leads');

      const data = await res.json();
      setLeads(data.leads);
      setColumns(data.columns);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setStats(data.stats);
    } catch {
      setError('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [campaignId, page, search, statusFilter, advancedFilters]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Sort leads
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const aRaw = a[sortField as keyof Lead] || '';
      const bRaw = b[sortField as keyof Lead] || '';

      if (sortField === 'createdAt' || sortField === 'lastContactedAt') {
        const aTime = aRaw ? new Date(aRaw as string).getTime() : 0;
        const bTime = bRaw ? new Date(bRaw as string).getTime() : 0;
        return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
      }

      const aVal = String(aRaw);
      const bVal = String(bRaw);

      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [leads, sortField, sortDirection]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelectLead = (id: string) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedLeads(newSelection);
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;
    if (!confirm(`Delete ${selectedLeads.size} leads? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedLeads) }),
      });

      if (!res.ok) throw new Error('Failed to delete leads');

      setSelectedLeads(new Set());
      fetchLeads();
    } catch {
      alert('Failed to delete leads');
    }
  };

  // Bulk status update
  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedLeads.size === 0) return;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeads),
          updates: { status },
        }),
      });

      if (!res.ok) throw new Error('Failed to update leads');

      setSelectedLeads(new Set());
      fetchLeads();
    } catch {
      alert('Failed to update leads');
    }
  };

  // Bulk add tags
  const handleBulkAddTags = async (tags: string[]) => {
    if (selectedLeads.size === 0 || tags.length === 0) return;

    try {
      // Get current tags for each lead and merge
      const leadsToUpdate = leads.filter((l) => selectedLeads.has(l.id));

      for (const lead of leadsToUpdate) {
        const currentTags = lead.tags || [];
        const newTags = [...new Set([...currentTags, ...tags])];

        await fetch(`/api/campaigns/${campaignId}/leads`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadIds: [lead.id],
            updates: { tags: newTags },
          }),
        });
      }

      setSelectedLeads(new Set());
      fetchLeads();
    } catch {
      alert('Failed to add tags');
    }
  };

  // Export leads
  const handleExport = () => {
    const exportData = leads.map((lead) => ({
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      location: lead.location,
      industry: lead.industry,
      emailProvider: lead.emailProvider,
      status: lead.status,
      tags: lead.tags?.join(';'),
      ...lead.customColumns,
    }));

    const csv = convertToCSV(exportData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${campaignId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertToCSV = (data: Record<string, unknown>[]) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  };

  // Sort handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get status icon and colors
  const getStatusDisplay = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.NOT_CONTACTED;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // Email provider icon
  const getProviderIcon = (provider: string | null) => {
    if (!provider) return <span className="text-xs text-gray-400">-</span>;
    const colors: Record<string, { text: string; bg: string }> = {
      Google: { text: 'text-red-700', bg: 'bg-red-50' },
      Microsoft: { text: 'text-blue-700', bg: 'bg-blue-50' },
      Yahoo: { text: 'text-purple-700', bg: 'bg-purple-50' },
      Apple: { text: 'text-gray-700', bg: 'bg-gray-100' },
      ProtonMail: { text: 'text-indigo-700', bg: 'bg-indigo-50' },
    };
    const style = colors[provider] || { text: 'text-gray-600', bg: 'bg-gray-100' };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded ${style.text} ${style.bg}`}>
        {provider}
      </span>
    );
  };

  // Render sort indicator
  const SortIndicator = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3 h-3 ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-1" />
    );
  };

  // Active filter count
  const activeFilterCount =
    advancedFilters.tags.length +
    advancedFilters.companies.length +
    advancedFilters.industries.length +
    (advancedFilters.verificationStatus !== 'all' ? 1 : 0) +
    (advancedFilters.dateFrom ? 1 : 0) +
    (advancedFilters.dateTo ? 1 : 0);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center py-12 px-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4 text-lg">{error}</p>
          <Link href="/dashboard/campaigns" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-40 shadow-sm">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link
                href={`/dashboard/campaigns/${campaignId}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 text-lg">
                  {campaign?.name || 'Loading...'}
                </h1>
                <p className="text-xs text-gray-500">Campaign Leads</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-sm text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">{total} leads</span>
              <button
                onClick={() => setShowAIPrompt(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">AI Prompts</span>
              </button>
              <button
                onClick={() => setShowColumnManager(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Manage columns"
              >
                <Columns className="w-5 h-5 text-gray-500" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 lg:px-6 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/dashboard/campaigns/${campaignId}${tab.href}`}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab.id === 'leads'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b border-gray-100 bg-gray-50 px-4 lg:px-6 py-3">
        <div className="flex items-center gap-3 sm:gap-6 text-sm overflow-x-auto scrollbar-hide">
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span className="text-gray-600 font-medium">Contacted</span>
            <span className="text-gray-900 font-semibold">{stats.statusBreakdown.CONTACTED || 0}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
            <span className="text-gray-600 font-medium">Opened</span>
            <span className="text-gray-900 font-semibold">{stats.statusBreakdown.OPENED || 0}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-gray-600 font-medium">Replied</span>
            <span className="text-gray-900 font-semibold">{stats.statusBreakdown.REPLIED || 0}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
            <span className="text-gray-600 font-medium">Interested</span>
            <span className="text-gray-900 font-semibold">{stats.statusBreakdown.INTERESTED || 0}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="text-gray-600 font-medium">Bounced</span>
            <span className="text-gray-900 font-semibold">{stats.statusBreakdown.BOUNCED || 0}</span>
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-white px-4 lg:px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search leads..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Status</option>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvancedFilters(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                activeFilterCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk Actions */}
            {selectedLeads.size > 0 && (
              <div className="flex items-center gap-2 mr-2 pr-2 border-r border-gray-200">
                <span className="text-sm text-gray-600 font-medium bg-blue-50 px-2 py-1 rounded">
                  {selectedLeads.size} selected
                </span>

                {/* Generate Emails */}
                <button
                  onClick={() => {
                    setEmailGenerationMode('initial');
                    setShowEmailGeneration(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  title="Generate AI emails"
                >
                  <Mail className="w-4 h-4" />
                  <span className="hidden lg:inline">Generate</span>
                </button>

                {/* Generate Follow-ups */}
                <button
                  onClick={() => {
                    setEmailGenerationMode('followup');
                    setShowEmailGeneration(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  title="Generate follow-up emails"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden lg:inline">Follow-up</span>
                </button>

                {/* AI Enrich */}
                <button
                  onClick={() => setShowAIPrompt(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                  title="AI enrich leads"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                {/* Add to Sequence */}
                <button
                  onClick={() => setShowSequenceModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  title="Add to sequence"
                >
                  <Send className="w-4 h-4" />
                </button>

                {/* Status dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                    Status
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 max-h-64 overflow-y-auto">
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <button
                        key={key}
                        onClick={() => handleBulkStatusUpdate(key)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        <config.icon className={`w-4 h-4 ${config.color}`} />
                        {config.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                    <Tag className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                    {['hot', 'warm', 'cold', 'priority', 'follow-up'].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleBulkAddTags([tag])}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                      >
                        Add &quot;{tag}&quot;
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Add Lead */}
            <button
              onClick={() => setShowAddLead(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

            {/* Import */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchLeads()}
              className="p-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full min-w-max border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="w-12 px-4 py-3 bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedLeads.size === leads.length && leads.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                <th className="w-12 px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase bg-gray-50">#</th>

                {/* Email column (always visible) */}
                {visibleColumns.includes('email') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '200px' }}
                    onClick={() => handleSort('email')}
                  >
                    <span className="flex items-center">
                      Email
                      <SortIndicator field="email" />
                    </span>
                  </th>
                )}

                {visibleColumns.includes('emailProvider') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '100px' }}>
                    Provider
                  </th>
                )}

                {visibleColumns.includes('emailSecurity') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '100px' }}>
                    Security
                  </th>
                )}

                {visibleColumns.includes('status') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '140px' }}
                    onClick={() => handleSort('status')}
                  >
                    <span className="flex items-center">
                      Status
                      <SortIndicator field="status" />
                    </span>
                  </th>
                )}

                {visibleColumns.includes('firstName') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '120px' }}
                    onClick={() => handleSort('firstName')}
                  >
                    <span className="flex items-center">
                      First Name
                      <SortIndicator field="firstName" />
                    </span>
                  </th>
                )}

                {visibleColumns.includes('lastName') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '120px' }}
                    onClick={() => handleSort('lastName')}
                  >
                    <span className="flex items-center">
                      Last Name
                      <SortIndicator field="lastName" />
                    </span>
                  </th>
                )}

                {visibleColumns.includes('company') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '150px' }}
                    onClick={() => handleSort('company')}
                  >
                    <span className="flex items-center">
                      Company
                      <SortIndicator field="company" />
                    </span>
                  </th>
                )}

                {visibleColumns.includes('title') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '150px' }}>
                    Title
                  </th>
                )}

                {visibleColumns.includes('tags') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '150px' }}>
                    Tags
                  </th>
                )}

                {visibleColumns.includes('location') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '150px' }}>
                    Location
                  </th>
                )}

                {visibleColumns.includes('industry') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50" style={{ minWidth: '130px' }}>
                    Industry
                  </th>
                )}

                {visibleColumns.includes('createdAt') && (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 cursor-pointer hover:bg-gray-100"
                    style={{ minWidth: '120px' }}
                    onClick={() => handleSort('createdAt')}
                  >
                    <span className="flex items-center">
                      Created
                      <SortIndicator field="createdAt" />
                    </span>
                  </th>
                )}

                {/* Custom columns */}
                {columns.filter((c) => visibleColumns.includes(c.key)).map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50"
                    style={{ minWidth: '150px' }}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.isEnriched && <Sparkles className="w-3 h-3 text-purple-500" />}
                      {col.name}
                    </span>
                  </th>
                ))}

                <th className="w-12 px-4 py-3 bg-gray-50"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + columns.length + 3} className="px-4 py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-sm text-gray-500 mt-3">Loading leads...</p>
                  </td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + columns.length + 3} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <Users className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-gray-600 font-medium mb-1">No leads found</p>
                      <p className="text-sm text-gray-400">Import or add leads to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedLeads.map((lead, index) => (
                  <tr
                    key={lead.id}
                    className={`group transition-colors cursor-pointer ${
                      selectedLeads.has(lead.id)
                        ? 'bg-blue-50 hover:bg-blue-100'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedLeadDetail(lead)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleSelectLead(lead.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-400 font-medium">{(page - 1) * 50 + index + 1}</td>

                    {visibleColumns.includes('email') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900 font-medium">{lead.email}</span>
                      </td>
                    )}

                    {visibleColumns.includes('emailProvider') && (
                      <td className="px-4 py-3">{getProviderIcon(lead.emailProvider)}</td>
                    )}

                    {visibleColumns.includes('emailSecurity') && (
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{lead.emailSecurity || 'None'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('status') && (
                      <td className="px-4 py-3">{getStatusDisplay(lead.status)}</td>
                    )}

                    {visibleColumns.includes('firstName') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900">{lead.firstName || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('lastName') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900">{lead.lastName || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('company') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{lead.company || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('title') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{lead.title || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('tags') && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(lead.tags || []).slice(0, 2).map((tag) => {
                            const color = getTagColor(tag);
                            return (
                              <span key={tag} className={`px-2 py-0.5 text-xs font-medium rounded-full ${color.bg} ${color.text}`}>
                                {tag}
                              </span>
                            );
                          })}
                          {(lead.tags || []).length > 2 && (
                            <span className="px-2 py-0.5 text-xs text-gray-500">+{lead.tags.length - 2}</span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.includes('location') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{lead.location || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('industry') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{lead.industry || '-'}</span>
                      </td>
                    )}

                    {visibleColumns.includes('createdAt') && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                    )}

                    {/* Custom columns */}
                    {columns.filter((c) => visibleColumns.includes(c.key)).map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <span className="text-sm text-gray-600 line-clamp-2 max-w-xs">
                          {String(lead.customColumns[col.key] || '-')}
                        </span>
                      </td>
                    ))}

                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingLead(lead)}
                        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="w-4 h-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 lg:px-6 py-4 border-t border-gray-200 bg-white">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{(page - 1) * 50 + 1}</span> to <span className="font-medium">{Math.min(page * 50, total)}</span> of <span className="font-medium">{total}</span> leads
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 px-2">
              Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AIPromptSidebar
        campaignId={campaignId}
        selectedLeadIds={Array.from(selectedLeads)}
        columns={columns}
        leads={leads}
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        onSuccess={() => {
          setShowAIPrompt(false);
          fetchLeads();
        }}
      />

      {showImport && (
        <ImportModal
          campaignId={campaignId}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            fetchLeads();
          }}
        />
      )}

      {(showAddLead || editingLead) && (
        <LeadEditModal
          campaignId={campaignId}
          lead={editingLead}
          columns={columns}
          onClose={() => {
            setShowAddLead(false);
            setEditingLead(null);
          }}
          onSuccess={() => {
            setShowAddLead(false);
            setEditingLead(null);
            fetchLeads();
          }}
        />
      )}

      {selectedLeadDetail && (
        <LeadDetailPanel
          lead={selectedLeadDetail}
          columns={columns}
          campaignId={campaignId}
          onClose={() => setSelectedLeadDetail(null)}
          onUpdate={() => {
            fetchLeads();
          }}
        />
      )}

      {showColumnManager && (
        <ColumnManager
          columns={columns}
          visibleColumns={visibleColumns}
          onVisibilityChange={setVisibleColumns}
          onClose={() => setShowColumnManager(false)}
        />
      )}

      {showAdvancedFilters && (
        <AdvancedFilters
          filters={advancedFilters}
          onChange={(filters) => {
            setAdvancedFilters(filters);
            setPage(1);
          }}
          onClose={() => setShowAdvancedFilters(false)}
          availableTags={availableTags}
          availableCompanies={availableCompanies}
          availableIndustries={availableIndustries}
        />
      )}

      {showSequenceModal && (
        <AddToSequenceModal
          campaignId={campaignId}
          selectedLeadIds={Array.from(selectedLeads)}
          onClose={() => setShowSequenceModal(false)}
          onSuccess={() => {
            setShowSequenceModal(false);
            setSelectedLeads(new Set());
            fetchLeads();
          }}
        />
      )}

      {/* Email Generation Modal */}
      <EmailGenerationModal
        isOpen={showEmailGeneration}
        onClose={() => setShowEmailGeneration(false)}
        campaignId={campaignId}
        leadIds={Array.from(selectedLeads)}
        mode={emailGenerationMode}
        onComplete={(stats) => {
          setShowEmailGeneration(false);
          setSelectedLeads(new Set());
          fetchLeads();
          // Show toast or notification with stats
          if (stats.successful > 0) {
            alert(`Successfully generated ${stats.successful} emails!${stats.failed > 0 ? ` (${stats.failed} failed)` : ''}`);
          }
        }}
      />
    </div>
  );
}
