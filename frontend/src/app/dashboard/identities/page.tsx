'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/swr';
import {
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  Clock,
  AlertCircle,
  Flame,
  Shield,
  BarChart3,
  X,
  Globe,
} from 'lucide-react';

interface SESIdentity {
  id: string;
  userId: string;
  emailAddress: string;
  displayName: string | null;
  identityType: 'EMAIL' | 'DOMAIN';
  sesIdentityArn: string | null;
  configSetName: string | null;
  status: string;
  warmupEnabled: boolean;
  warmupDay: number;
  dailyLimit: number;
  sentToday: number;
  lastSentAt: string | null;
  bounceRate: number;
  complaintRate: number;
  verifiedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  _count: {
    emailDrafts: number;
    sequences: number;
  };
}

interface IdentitiesResponse {
  identities: SESIdentity[];
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  PENDING: { color: 'yellow', icon: Clock, label: 'Pending Verification' },
  VERIFIED: { color: 'blue', icon: CheckCircle, label: 'Verified' },
  WARMING: { color: 'orange', icon: Flame, label: 'Warming Up' },
  ACTIVE: { color: 'green', icon: CheckCircle, label: 'Active' },
  PAUSED: { color: 'gray', icon: Pause, label: 'Paused' },
  ERROR: { color: 'red', icon: AlertCircle, label: 'Error' },
};

export default function IdentitiesPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [identityTypeInput, setIdentityTypeInput] = useState<'EMAIL' | 'DOMAIN'>('EMAIL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: fetchError } = useSWR<IdentitiesResponse>(
    '/api/ses-identities',
    fetcher,
    { refreshInterval: 30000 }
  );

  const handleAddIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Format the email address - prepend @ for domain type
      const emailAddress = identityTypeInput === 'DOMAIN'
        ? (newEmail.startsWith('@') ? newEmail : `@${newEmail}`)
        : newEmail;

      const response = await fetch('/api/ses-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailAddress,
          displayName: newDisplayName || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add identity');
      }

      setShowAddModal(false);
      setNewEmail('');
      setNewDisplayName('');
      setIdentityTypeInput('EMAIL');
      mutate('/api/ses-identities');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckVerification = async (id: string) => {
    try {
      const response = await fetch(`/api/ses-identities/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-verification' }),
      });

      const data = await response.json();
      if (data.verified) {
        mutate('/api/ses-identities');
      }
      alert(data.message);
    } catch (err) {
      alert('Failed to check verification status');
    }
  };

  const handleToggleWarmup = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch(`/api/ses-identities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warmupEnabled: !currentEnabled }),
      });
      mutate('/api/ses-identities');
    } catch (err) {
      alert('Failed to update warmup setting');
    }
  };

  const handlePauseResume = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'PAUSED' ? 'resume' : 'pause';
    try {
      await fetch(`/api/ses-identities/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      mutate('/api/ses-identities');
    } catch (err) {
      alert(`Failed to ${action} identity`);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      await fetch(`/api/ses-identities?id=${id}`, { method: 'DELETE' });
      mutate('/api/ses-identities');
    } catch (err) {
      alert('Failed to delete identity');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          Failed to load identities. Please try again.
        </div>
      </div>
    );
  }

  const identities = data?.identities || [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Identities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your verified sender email addresses
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Identity
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Identities</p>
              <p className="text-xl font-bold">{identities.length}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Globe className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Domains</p>
              <p className="text-xl font-bold">
                {identities.filter((i) => i.identityType === 'DOMAIN').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-xl font-bold">
                {identities.filter((i) => i.status === 'ACTIVE' || i.status === 'WARMING' || i.status === 'VERIFIED').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Flame className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Warming Up</p>
              <p className="text-xl font-bold">
                {identities.filter((i) => i.status === 'WARMING').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-xl font-bold">
                {identities.filter((i) => i.status === 'PENDING').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Identities Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email Address
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Warmup
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Daily Usage
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reputation
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {identities.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No email identities yet. Add one to get started.
                </td>
              </tr>
            ) : (
              identities.map((identity) => {
                const statusConfig = STATUS_CONFIG[identity.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusConfig.icon;
                const usagePercent = (identity.sentToday / identity.dailyLimit) * 100;

                return (
                  <tr key={identity.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {identity.identityType === 'DOMAIN'
                                ? `Any *${identity.emailAddress}`
                                : identity.emailAddress}
                            </p>
                            {identity.identityType === 'DOMAIN' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                <Globe className="w-3 h-3" />
                                Domain
                              </span>
                            )}
                          </div>
                          {identity.displayName && (
                            <p className="text-sm text-gray-500">{identity.displayName}</p>
                          )}
                          {identity.identityType === 'DOMAIN' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Allows sending from any address at this domain
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-${statusConfig.color}-100 text-${statusConfig.color}-700`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {identity.status !== 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleWarmup(identity.id, identity.warmupEnabled)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              identity.warmupEnabled ? 'bg-orange-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                identity.warmupEnabled ? 'translate-x-4' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          {identity.warmupEnabled && (
                            <span className="text-xs text-gray-500">Day {identity.warmupDay}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-32">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span>{identity.sentToday}</span>
                          <span className="text-gray-500">/ {identity.dailyLimit}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              usagePercent >= 90
                                ? 'bg-red-500'
                                : usagePercent >= 70
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Bounce:</span>
                          <span
                            className={
                              identity.bounceRate > 5 ? 'text-red-600 font-medium' : 'text-gray-700'
                            }
                          >
                            {identity.bounceRate.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Complaint:</span>
                          <span
                            className={
                              identity.complaintRate > 0.1
                                ? 'text-red-600 font-medium'
                                : 'text-gray-700'
                            }
                          >
                            {identity.complaintRate.toFixed(3)}%
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {identity.status === 'PENDING' && (
                          <button
                            onClick={() => handleCheckVerification(identity.id)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Check Verification"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        {identity.status !== 'PENDING' && (
                          <button
                            onClick={() => handlePauseResume(identity.id, identity.status)}
                            className={`p-1.5 rounded ${
                              identity.status === 'PAUSED'
                                ? 'text-green-600 hover:bg-green-50'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                            title={identity.status === 'PAUSED' ? 'Resume' : 'Pause'}
                          >
                            {identity.status === 'PAUSED' ? (
                              <Play className="w-4 h-4" />
                            ) : (
                              <Pause className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(identity.id, identity.emailAddress)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Identity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Add Email Identity</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddIdentity} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
              )}
              {/* Identity Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Identity Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIdentityTypeInput('EMAIL'); setNewEmail(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      identityTypeInput === 'EMAIL'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIdentityTypeInput('DOMAIN'); setNewEmail(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      identityTypeInput === 'DOMAIN'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Domain
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {identityTypeInput === 'DOMAIN' ? 'Domain *' : 'Email Address *'}
                </label>
                {identityTypeInput === 'DOMAIN' ? (
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      @
                    </span>
                    <input
                      type="text"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value.replace('@', ''))}
                      placeholder="yourdomain.com"
                      className="flex-1 px-3 py-2 border rounded-r-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>
                ) : (
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="sender@example.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {identityTypeInput === 'DOMAIN'
                    ? 'Allows sending from any email address at this domain. Requires DNS verification.'
                    : 'A verification email will be sent to this address'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder={identityTypeInput === 'DOMAIN' ? 'Company Domain' : 'John Smith'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setIdentityTypeInput('EMAIL'); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : `Add ${identityTypeInput === 'DOMAIN' ? 'Domain' : 'Identity'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
