'use client';

import { useEffect, useState, useCallback } from 'react';
import {
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
import { Mail, Send, Eye, MousePointer, AlertTriangle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
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

// Analytics skeleton component
function AnalyticsSkeleton() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div>
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-7 w-12" />
              </div>
            </div>
            <Skeleton className="h-3 w-24 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="card">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="h-80 flex items-end gap-2">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="flex-1"
                  style={{ height: `${30 + Math.random() * 60}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const fetchAnalytics = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load analytics');
        return res.json();
      })
      .then(setAnalytics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  if (error || !analytics) {
    return (
      <ErrorState
        title="Failed to load analytics"
        message={error || 'Unable to fetch analytics data'}
        onRetry={fetchAnalytics}
      />
    );
  }

  const statusData = Object.entries(analytics.statusBreakdown).map(([name, value]) => ({
    name: name.replace('_', ' '),
    count: value,
  }));

  const funnelColors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                days === d ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Delivery Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">Sent</p>
              <p className="text-2xl font-bold text-blue-700">{analytics.deliveryMetrics.sent}</p>
            </div>
          </div>
          <p className="text-xs text-blue-500 mt-2">
            {analytics.deliveryMetrics.deliveryRate}% delivered
          </p>
        </div>

        <div className="card bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Mail className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">Delivered</p>
              <p className="text-2xl font-bold text-green-700">{analytics.deliveryMetrics.delivered}</p>
            </div>
          </div>
          <p className="text-xs text-green-500 mt-2">
            {analytics.deliveryMetrics.bounced} bounced ({analytics.deliveryMetrics.bounceRate}%)
          </p>
        </div>

        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Eye className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600 font-medium">Opens</p>
              <p className="text-2xl font-bold text-amber-700">{analytics.engagementMetrics.opens}</p>
            </div>
          </div>
          <p className="text-xs text-amber-500 mt-2">
            {analytics.engagementMetrics.openRate}% open rate ({analytics.engagementMetrics.uniqueOpens} unique)
          </p>
        </div>

        <div className="card bg-purple-50 border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MousePointer className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-purple-600 font-medium">Clicks</p>
              <p className="text-2xl font-bold text-purple-700">{analytics.engagementMetrics.clicks}</p>
            </div>
          </div>
          <p className="text-xs text-purple-500 mt-2">
            {analytics.engagementMetrics.clickThroughRate}% CTR ({analytics.engagementMetrics.uniqueClicks} unique)
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Delivery Trend Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Trend</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="sent" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Sent" />
                <Area type="monotone" dataKey="delivered" stackId="2" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Delivered" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Trend Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Engagement Trend</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="opened" stroke="#f59e0b" name="Opened" strokeWidth={2} />
                <Line type="monotone" dataKey="clicked" stroke="#8b5cf6" name="Clicked" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Delivery Funnel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Funnel</h2>
          <div className="space-y-3">
            {analytics.deliveryFunnel.map((item, idx) => {
              const maxCount = analytics.deliveryFunnel[0]?.count || 1;
              const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <div key={item.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.stage}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: funnelColors[idx] || '#6b7280',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reputation Health */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reputation Health</h2>
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Bounce Rate</span>
                <span className={`text-lg font-bold ${analytics.deliveryMetrics.bounceRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                  {analytics.deliveryMetrics.bounceRate}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {analytics.deliveryMetrics.bounceRate > 5 ? (
                  <><TrendingUp className="w-3 h-3 text-red-500" /><span className="text-red-500">Above 5% threshold</span></>
                ) : (
                  <><TrendingDown className="w-3 h-3 text-green-500" /><span className="text-green-500">Healthy</span></>
                )}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Complaint Rate</span>
                <span className={`text-lg font-bold ${analytics.reputationMetrics.complaintRate > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                  {analytics.reputationMetrics.complaintRate}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {analytics.reputationMetrics.complaintRate > 0.1 ? (
                  <><AlertTriangle className="w-3 h-3 text-red-500" /><span className="text-red-500">Above 0.1% threshold</span></>
                ) : (
                  <><TrendingDown className="w-3 h-3 text-green-500" /><span className="text-green-500">Healthy</span></>
                )}
              </div>
            </div>

            <div className="p-3 bg-red-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Suppressed Emails</span>
                <span className="text-lg font-bold text-red-600">{analytics.reputationMetrics.suppressedEmails}</span>
              </div>
            </div>

            {analytics.deliveryMetrics.delayed > 0 && (
              <div className="p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-gray-600">Delayed</span>
                  </div>
                  <span className="text-lg font-bold text-yellow-600">{analytics.deliveryMetrics.delayed}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sending Capacity */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Sending Capacity</h2>
          <div className="text-center mb-4">
            <p className="text-4xl font-bold text-primary-600">
              {analytics.sendingStatus.sentToday}
              <span className="text-2xl text-gray-400">/{analytics.sendingStatus.dailyCap}</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">Emails sent today</p>
          </div>
          <div className="relative pt-1">
            <div className="overflow-hidden h-4 text-xs flex rounded-full bg-gray-200">
              <div
                style={{
                  width: `${(analytics.sendingStatus.sentToday / analytics.sendingStatus.dailyCap) * 100}%`,
                }}
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary-500 rounded-full transition-all duration-500"
              />
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-2">
            {analytics.sendingStatus.remaining} emails remaining
          </p>

          <div className="mt-6 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Overview</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-500">Total Emails</p>
                <p className="font-bold">{analytics.overview.totalEmails}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-500">Companies</p>
                <p className="font-bold">{analytics.overview.totalBusinesses}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-500">Contacts</p>
                <p className="font-bold">{analytics.overview.totalContacts}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-500">Uploads</p>
                <p className="font-bold">{analytics.overview.totalUploads}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Status Breakdown</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="name" type="category" width={100} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
