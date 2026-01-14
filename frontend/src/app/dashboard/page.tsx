'use client';

import { useEffect, useState } from 'react';
import { Mail, Building2, Upload, AlertTriangle, Send, Ban } from 'lucide-react';

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
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  const stats = [
    {
      name: 'Total Emails',
      value: analytics.overview.totalEmails,
      icon: Mail,
      color: 'bg-blue-500',
    },
    {
      name: 'Businesses',
      value: analytics.overview.totalBusinesses,
      icon: Building2,
      color: 'bg-green-500',
    },
    {
      name: 'Uploads',
      value: analytics.overview.totalUploads,
      icon: Upload,
      color: 'bg-purple-500',
    },
    {
      name: 'Needs Review',
      value: analytics.statusBreakdown.NEEDS_REVIEW || 0,
      icon: AlertTriangle,
      color: 'bg-yellow-500',
    },
    {
      name: 'Sent Today',
      value: `${analytics.sendingStatus.sentToday}/${analytics.sendingStatus.dailyCap}`,
      icon: Send,
      color: 'bg-indigo-500',
    },
    {
      name: 'Suppressed',
      value: analytics.overview.suppressionCount,
      icon: Ban,
      color: 'bg-red-500',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center gap-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Status Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(analytics.statusBreakdown).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{status.replace('_', ' ')}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Events</h2>
          <div className="space-y-3">
            {Object.entries(analytics.events).map(([event, count]) => (
              <div key={event} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{event}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
            {Object.keys(analytics.events).length === 0 && (
              <p className="text-sm text-gray-500">No events yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sending Capacity</h2>
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <div>
              <span className="text-xs font-semibold inline-block text-primary-600">
                {analytics.sendingStatus.sentToday} sent today
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold inline-block text-primary-600">
                {analytics.sendingStatus.remaining} remaining
              </span>
            </div>
          </div>
          <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
            <div
              style={{
                width: `${(analytics.sendingStatus.sentToday / analytics.sendingStatus.dailyCap) * 100}%`,
              }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary-500"
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
