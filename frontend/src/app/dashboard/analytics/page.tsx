'use client';

import { useEffect, useState } from 'react';
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
} from 'recharts';

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
  sendingStatus: {
    sentToday: number;
    dailyCap: number;
    remaining: number;
  };
  dailyTrend: Array<{
    date: string;
    generated: number;
    needsReview: number;
    approved: number;
    sent: number;
  }>;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetch(`/api/analytics?days=${days}`)
      .then((res) => res.json())
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return <div>Failed to load analytics</div>;
  }

  const statusData = Object.entries(analytics.statusBreakdown).map(([name, value]) => ({
    name: name.replace('_', ' '),
    count: value,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily Trend Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Email Generation</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="generated" stroke="#3b82f6" name="Generated" strokeWidth={2} />
                <Line type="monotone" dataKey="approved" stroke="#22c55e" name="Approved" strokeWidth={2} />
                <Line type="monotone" dataKey="sent" stroke="#8b5cf6" name="Sent" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Breakdown</h2>
          <div className="h-80">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        </div>

        {/* Email Events */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Events</h2>
          {Object.keys(analytics.events).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(analytics.events).map(([event, count]) => (
                <div key={event} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{event}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">No events recorded yet</p>
          )}
        </div>

        {/* Key Metrics */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Total Emails</span>
              <span className="text-xl font-bold text-gray-900">{analytics.overview.totalEmails}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Businesses</span>
              <span className="text-xl font-bold text-gray-900">{analytics.overview.totalBusinesses}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Contacts</span>
              <span className="text-xl font-bold text-gray-900">{analytics.overview.totalContacts}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
              <span className="text-sm text-gray-600">Suppressed</span>
              <span className="text-xl font-bold text-red-600">{analytics.overview.suppressionCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
