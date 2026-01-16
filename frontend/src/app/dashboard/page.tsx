'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/LoadingStates';

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

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [customDate, setCustomDate] = useState('');
  const [filterMode, setFilterMode] = useState<'preset' | 'custom'>('preset');

  const fetchAnalytics = useCallback(() => {
    setLoading(true);
    setError(null);

    let url = `/api/analytics?days=${days}`;
    if (filterMode === 'custom' && customDate) {
      url = `/api/analytics?date=${customDate}`;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load analytics');
        return res.json();
      })
      .then(setAnalytics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days, filterMode, customDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !analytics) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        message={error || 'Unable to fetch analytics data'}
        onRetry={fetchAnalytics}
      />
    );
  }

  // Prepare data for charts
  const statusPieData = Object.entries(analytics.statusBreakdown)
    .filter(([_, count]) => count > 0)
    .map(([name, value]) => ({
      name: name.replace('_', ' '),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
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
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                filterMode === 'preset' && days === d
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
              }}
              className={`px-3 py-2 rounded-lg text-sm border ${
                filterMode === 'custom'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 bg-white'
              } focus:outline-none focus:ring-2 focus:ring-primary-500`}
            />
          </div>
        </div>
      </div>

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
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Businesses</p>
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

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Email Status Pie Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Email Status Distribution</h2>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
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
          <div className="flex flex-wrap justify-center gap-3 mt-4 pt-4 border-t">
            {statusPieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-gray-600">{entry.name}</span>
                <span className="font-medium text-gray-900">({entry.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Engagement Funnel */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Engagement Funnel</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-72">
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
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{analytics.deliveryMetrics.deliveryRate}%</p>
              <p className="text-xs text-gray-500">Delivery</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600">{analytics.engagementMetrics.openRate}%</p>
              <p className="text-xs text-gray-500">Open</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-purple-600">{analytics.engagementMetrics.clickThroughRate}%</p>
              <p className="text-xs text-gray-500">CTR</p>
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
                  <span className="text-sm font-medium text-blue-800">Ready to Send</span>
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
                  <span className="text-sm font-medium text-red-800">Bounced</span>
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
