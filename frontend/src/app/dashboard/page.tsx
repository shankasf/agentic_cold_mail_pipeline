'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher, defaultSWRConfig } from '@/lib/swr';
import { useAuth } from '@/context/AuthContext';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import {
  Mail,
  Building2,
  Upload,
  AlertTriangle,
  Send,
  Ban,
  Users,
  Eye,
  MousePointer,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle,
  Clock,
  BarChart3,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/LoadingStates';

interface Campaign {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface Analytics {
  overview: {
    totalEmails: number;
    totalBusinesses: number;
    totalContacts: number;
    totalUploads: number;
    suppressionCount: number;
  };
  statusBreakdown: Record<string, number>;
  events: Record<string, number>;
  deliveryMetrics: {
    sent: number;
    delivered: number;
    deliveryRate: number;
    bounced: number;
    bounceRate: number;
    rejected: number;
    delayed: number;
  };
  engagementMetrics: {
    opens: number;
    uniqueOpens: number;
    openRate: number;
    clicks: number;
    uniqueClicks: number;
    clickRate: number;
    clickThroughRate: number;
  };
  reputationMetrics: {
    complaints: number;
    complaintRate: number;
    suppressedEmails: number;
  };
  deliveryFunnel: Array<{
    stage: string;
    count: number;
  }>;
  sendingStatus: {
    sentToday: number;
    dailyCap: number;
    remaining: number;
  };
  dailyTrend: Array<{
    date: string;
    generated: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complaints: number;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  NEEDS_REVIEW: '#f59e0b',
  APPROVED: '#3b82f6',
  SENT: '#22c55e',
  BOUNCED: '#ef4444',
  COMPLAINT: '#dc2626',
  REPLIED: '#8b5cf6',
};

// Simplified status display labels
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  NEEDS_REVIEW: 'Review',
  APPROVED: 'Ready',
  SENT: 'Sent',
  BOUNCED: 'Failed',
  COMPLAINT: 'Spam',
  REPLIED: 'Replied',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

function DashboardSkeleton() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-7 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="card">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

const EMAIL_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SENT', label: 'Sent' },
  { value: 'BOUNCED', label: 'Bounced' },
  { value: 'COMPLAINT', label: 'Complaint' },
];

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const [days, setDays] = useState(7);
  const [customDate, setCustomDate] = useState('');
  const [filterMode, setFilterMode] = useState<'preset' | 'custom'>('preset');

  // Advanced filter state
  const [showFilters, setShowFilters] = useState(false);
  const [campaignId, setCampaignId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Set page title
  useEffect(() => {
    document.title = 'Dashboard | CallSphere';
  }, []);

  // Fetch campaigns for filter dropdown
  const { data: campaignsData } = useSWR<{ campaigns: Campaign[] }>(
    '/api/campaigns?limit=100',
    fetcher,
    { ...defaultSWRConfig, revalidateOnFocus: false }
  );

  // Fetch users for filter dropdown (admin only)
  const { data: usersData } = useSWR<{ users: User[] }>(
    isAdmin ? '/api/users' : null,
    fetcher,
    { ...defaultSWRConfig, revalidateOnFocus: false }
  );

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (campaignId) count++;
    if (userId) count++;
    if (startDate && endDate) count++;
    if (statusFilter) count++;
    return count;
  }, [campaignId, userId, startDate, endDate, statusFilter]);

  // Clear all filters
  const clearFilters = () => {
    setCampaignId('');
    setUserId('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
  };

  // Build API URL with all filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();

    // Date range takes precedence over days preset
    if (startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    } else if (filterMode === 'custom' && customDate) {
      params.set('date', customDate);
    } else {
      params.set('days', String(days));
    }

    if (campaignId) params.set('campaignId', campaignId);
    if (userId) params.set('userId', userId);
    if (statusFilter) params.set('status', statusFilter);

    return `/api/analytics?${params.toString()}`;
  }, [days, filterMode, customDate, startDate, endDate, campaignId, userId, statusFilter]);

  // Use SWR for data fetching with caching and deduplication
  const { data: analytics, error, isLoading, mutate } = useSWR<Analytics>(
    apiUrl,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 300000, // Refresh every 5 minutes
    }
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !analytics) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        message={error?.message || 'Unable to fetch analytics data'}
        onRetry={() => mutate()}
      />
    );
  }

  // Prepare data for charts
  const statusPieData = Object.entries(analytics.statusBreakdown)
    .filter(([_, count]) => count > 0)
    .map(([name, value]) => ({
      name: STATUS_LABELS[name] || name.replace('_', ' '),
      value,
      color: STATUS_COLORS[name] || '#6b7280',
    }));

  const engagementFunnelData = [
    { name: 'Sent', value: analytics.deliveryMetrics.sent, color: '#3b82f6' },
    { name: 'Delivered', value: analytics.deliveryMetrics.delivered, color: '#22c55e' },
    { name: 'Opened', value: analytics.engagementMetrics.opens, color: '#f59e0b' },
    { name: 'Clicked', value: analytics.engagementMetrics.clicks, color: '#8b5cf6' },
  ];

  const capacityPercentage = (analytics.sendingStatus.sentToday / analytics.sendingStatus.dailyCap) * 100;

  return (
    <div>
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your email campaigns</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Presets */}
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => {
                setDays(d);
                setFilterMode('preset');
                // Clear date range when using preset
                setStartDate('');
                setEndDate('');
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                filterMode === 'preset' && days === d && !startDate && !endDate
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
          {/* Custom Date Picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setFilterMode('custom');
                // Clear date range when using single date
                setStartDate('');
                setEndDate('');
              }}
              className={`px-3 py-2 rounded-lg text-sm border ${
                filterMode === 'custom' && !startDate && !endDate
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 bg-white'
              } focus:outline-none focus:ring-2 focus:ring-primary-500`}
            />
          </div>
          {/* Filters Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white text-primary-600 font-bold">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="card mb-6 border-primary-200 bg-primary-50/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Advanced Filters
            </h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Campaign Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Campaign</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All Campaigns</option>
                {campaignsData?.campaigns?.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>

            {/* User Filter (Admin only) */}
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">All Users</option>
                  {usersData?.users?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {EMAIL_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range - From */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  startDate && endDate
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 bg-white'
                } focus:outline-none focus:ring-2 focus:ring-primary-500`}
              />
            </div>

            {/* Date Range - To */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  startDate && endDate
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 bg-white'
                } focus:outline-none focus:ring-2 focus:ring-primary-500`}
              />
            </div>
          </div>

          {/* Active Filters Summary */}
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-2">
                {campaignId && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    Campaign: {campaignsData?.campaigns?.find(c => c.id === campaignId)?.name || 'Selected'}
                    <button onClick={() => setCampaignId('')} className="hover:text-primary-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {userId && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    User: {usersData?.users?.find(u => u.id === userId)?.name || usersData?.users?.find(u => u.id === userId)?.email || 'Selected'}
                    <button onClick={() => setUserId('')} className="hover:text-primary-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {statusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    Status: {EMAIL_STATUSES.find(s => s.value === statusFilter)?.label}
                    <button onClick={() => setStatusFilter('')} className="hover:text-primary-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {startDate && endDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    Date: {startDate} to {endDate}
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="hover:text-primary-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500 rounded-xl shadow-lg shadow-blue-500/30">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Total Emails</p>
              <p className="text-2xl font-bold text-blue-700">{analytics.overview.totalEmails.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500 rounded-xl shadow-lg shadow-green-500/30">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Companies</p>
              <p className="text-2xl font-bold text-green-700">{analytics.overview.totalBusinesses.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500 rounded-xl shadow-lg shadow-purple-500/30">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Contacts</p>
              <p className="text-2xl font-bold text-purple-700">{analytics.overview.totalContacts.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 rounded-xl shadow-lg shadow-amber-500/30">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Uploads</p>
              <p className="text-2xl font-bold text-amber-700">{analytics.overview.totalUploads.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery & Engagement Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="w-4 h-4 text-blue-600" />
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              analytics.deliveryMetrics.deliveryRate >= 95 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {analytics.deliveryMetrics.deliveryRate}%
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.deliveryMetrics.sent.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Emails Sent</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
              {analytics.deliveryMetrics.delivered.toLocaleString()}
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.deliveryMetrics.deliveryRate}%</p>
          <p className="text-xs text-gray-500 mt-1">Delivery Rate</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Eye className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {analytics.engagementMetrics.uniqueOpens} unique
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.engagementMetrics.openRate}%</p>
          <p className="text-xs text-gray-500 mt-1">Open Rate</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MousePointer className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
              {analytics.engagementMetrics.uniqueClicks} unique
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.engagementMetrics.clickThroughRate}%</p>
          <p className="text-xs text-gray-500 mt-1">Click-Through Rate</p>
        </div>
      </div>

      {/* Charts Row 1 - Status and Engagement Donut Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {/* Email Status Pie Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Email Status</h2>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), 'Count']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-2 mt-3 pt-3 border-t">
            {statusPieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-1 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-gray-600">{entry.name}</span>
                <span className="font-medium text-gray-900">({entry.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open Rate Donut Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Open Rate</h2>
            <Eye className="w-5 h-5 text-amber-500" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Opened', value: analytics.engagementMetrics.uniqueOpens, color: '#f59e0b' },
                    { name: 'Not Opened', value: Math.max(0, analytics.deliveryMetrics.delivered - analytics.engagementMetrics.uniqueOpens), color: '#e5e7eb' },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                >
                  <Cell fill="#f59e0b" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), 'Count']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Center Stats */}
          <div className="text-center -mt-24 mb-16 relative z-10">
            <p className="text-3xl font-bold text-amber-600">{analytics.engagementMetrics.openRate}%</p>
            <p className="text-xs text-gray-500">Open Rate</p>
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 pt-3 border-t">
            <div className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-gray-600">Opened</span>
              <span className="font-medium text-gray-900">({analytics.engagementMetrics.uniqueOpens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded-full bg-gray-200" />
              <span className="text-gray-600">Not Opened</span>
              <span className="font-medium text-gray-900">({Math.max(0, analytics.deliveryMetrics.delivered - analytics.engagementMetrics.uniqueOpens)})</span>
            </div>
          </div>
        </div>

        {/* Click Rate Donut Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Click Rate</h2>
            <MousePointer className="w-5 h-5 text-purple-500" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Clicked', value: analytics.engagementMetrics.uniqueClicks, color: '#8b5cf6' },
                    { name: 'Not Clicked', value: Math.max(0, analytics.engagementMetrics.uniqueOpens - analytics.engagementMetrics.uniqueClicks), color: '#e5e7eb' },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), 'Count']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Center Stats */}
          <div className="text-center -mt-24 mb-16 relative z-10">
            <p className="text-3xl font-bold text-purple-600">{analytics.engagementMetrics.clickThroughRate}%</p>
            <p className="text-xs text-gray-500">Click-Through Rate</p>
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 pt-3 border-t">
            <div className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-gray-600">Clicked</span>
              <span className="font-medium text-gray-900">({analytics.engagementMetrics.uniqueClicks})</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded-full bg-gray-200" />
              <span className="text-gray-600">Not Clicked</span>
              <span className="font-medium text-gray-900">({Math.max(0, analytics.engagementMetrics.uniqueOpens - analytics.engagementMetrics.uniqueClicks)})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Funnel */}
      <div className="grid grid-cols-1 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Engagement Funnel</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementFunnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" fontSize={12} />
                <YAxis dataKey="name" type="category" width={80} fontSize={12} />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Count']} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {engagementFunnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Conversion Rates */}
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-lg font-bold text-blue-600">{analytics.deliveryMetrics.sent.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Sent</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{analytics.deliveryMetrics.deliveryRate}%</p>
              <p className="text-xs text-gray-500">Delivered</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600">{analytics.engagementMetrics.openRate}%</p>
              <p className="text-xs text-gray-500">Opened</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-purple-600">{analytics.engagementMetrics.clickThroughRate}%</p>
              <p className="text-xs text-gray-500">Clicked</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 - Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily Trend Area Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.dailyTrend}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  fontSize={11}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis fontSize={11} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorSent)"
                  name="Sent"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#colorDelivered)"
                  name="Delivered"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Trend Line Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Engagement Trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  fontSize={11}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis fontSize={11} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="opened"
                  stroke="#f59e0b"
                  name="Opened"
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicked"
                  stroke="#8b5cf6"
                  name="Clicked"
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row - Capacity & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Sending Capacity */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Sending Capacity</h2>
          <div className="relative">
            {/* Circular Progress */}
            <div className="flex justify-center mb-4">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    stroke="#e5e7eb"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    stroke={capacityPercentage >= 90 ? '#ef4444' : capacityPercentage >= 70 ? '#f59e0b' : '#22c55e'}
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${capacityPercentage * 3.77} 377`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{analytics.sendingStatus.sentToday}</span>
                  <span className="text-xs text-gray-500">of {analytics.sendingStatus.dailyCap}</span>
                </div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-primary-600">{analytics.sendingStatus.remaining}</span> emails remaining today
              </p>
            </div>
          </div>
        </div>

        {/* Reputation Health */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reputation Health</h2>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Bounce Rate</span>
                <div className="flex items-center gap-2">
                  {analytics.deliveryMetrics.bounceRate <= 5 ? (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-lg font-bold ${
                    analytics.deliveryMetrics.bounceRate <= 5 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {analytics.deliveryMetrics.bounceRate}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    analytics.deliveryMetrics.bounceRate <= 5 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(analytics.deliveryMetrics.bounceRate * 10, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Target: &lt;5%</p>
            </div>

            <div className="p-3 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Complaint Rate</span>
                <div className="flex items-center gap-2">
                  {analytics.reputationMetrics.complaintRate <= 0.1 ? (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-lg font-bold ${
                    analytics.reputationMetrics.complaintRate <= 0.1 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {analytics.reputationMetrics.complaintRate}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    analytics.reputationMetrics.complaintRate <= 0.1 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(analytics.reputationMetrics.complaintRate * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Target: &lt;0.1%</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-red-50">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-600">Suppressed</span>
              </div>
              <span className="text-lg font-bold text-red-600">{analytics.overview.suppressionCount}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions & Alerts */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Overview</h2>
          <div className="space-y-3">
            {analytics.statusBreakdown.NEEDS_REVIEW > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Needs Review</span>
                </div>
                <span className="text-lg font-bold text-yellow-700">{analytics.statusBreakdown.NEEDS_REVIEW}</span>
              </div>
            )}

            {analytics.statusBreakdown.APPROVED > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Ready</span>
                </div>
                <span className="text-lg font-bold text-blue-700">{analytics.statusBreakdown.APPROVED}</span>
              </div>
            )}

            {analytics.statusBreakdown.DRAFT > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Drafts</span>
                </div>
                <span className="text-lg font-bold text-gray-600">{analytics.statusBreakdown.DRAFT}</span>
              </div>
            )}

            {analytics.deliveryMetrics.delayed > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <span className="text-sm font-medium text-orange-800">Delayed Delivery</span>
                </div>
                <span className="text-lg font-bold text-orange-700">{analytics.deliveryMetrics.delayed}</span>
              </div>
            )}

            {analytics.statusBreakdown.BOUNCED > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-800">Failed</span>
                </div>
                <span className="text-lg font-bold text-red-700">{analytics.statusBreakdown.BOUNCED}</span>
              </div>
            )}

            {Object.keys(analytics.statusBreakdown).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No email activity yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
