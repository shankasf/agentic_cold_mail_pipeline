'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban,
  ArrowLeft,
  Building2,
  Mail,
  Users,
  Upload,
  Play,
  Pause,
  CheckCircle,
  Archive,
  FileEdit,
  Loader2,
  ExternalLink,
  Edit3,
  Save,
  X,
  Trash2,
  BarChart3,
  FileText,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';

interface CampaignDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  stats: {
    totalBusinesses: number;
    totalContacts: number;
    totalEmails: number;
    totalUploads: number;
    emailStatusBreakdown: Record<string, number>;
  };
  recentBusinesses: Array<{
    id: string;
    canonicalName: string;
    industryGuess?: string;
    createdAt: string;
    _count: {
      contacts: number;
      emailDrafts: number;
    };
  }>;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  DRAFT: { icon: FileEdit, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Draft' },
  ACTIVE: { icon: Play, color: 'text-green-600', bg: 'bg-green-100', label: 'Active' },
  PAUSED: { icon: Pause, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Paused' },
  COMPLETED: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Completed' },
  ARCHIVED: { icon: Archive, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Archived' },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch campaign');
      }
      const data = await res.json();
      setCampaign(data);
      setEditName(data.name);
      setEditDescription(data.description || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleSave = async () => {
    if (!editName.trim()) {
      alert('Campaign name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update campaign');
      }

      setEditing(false);
      fetchCampaign();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      fetchCampaign();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!campaign) return;
    if (!confirm(`Are you sure you want to delete "${campaign.name}"? Companies in this campaign will be orphaned.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete campaign');
      }
      router.push('/dashboard/campaigns');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch(`/api/campaigns/${campaignId}/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import file');
      }

      alert(`Successfully imported ${data.created} companies! ${data.skipped > 0 ? `Skipped ${data.skipped} rows.` : ''}`);
      setImportFile(null);
      fetchCampaign();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Campaign not found'}</p>
        <Link href="/dashboard/campaigns" className="btn-primary">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  const StatusIcon = statusConfig[campaign.status]?.icon || FileEdit;
  const statusColor = statusConfig[campaign.status]?.color || 'text-gray-600';
  const statusBg = statusConfig[campaign.status]?.bg || 'bg-gray-100';
  const statusLabel = statusConfig[campaign.status]?.label || campaign.status;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/campaigns"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input text-2xl font-bold"
              placeholder="Campaign name"
            />
          ) : (
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="btn-secondary flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="btn-secondary flex items-center gap-2 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status and Description */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${statusBg}`}>
              <StatusIcon className={`w-5 h-5 ${statusColor}`} />
            </div>
            <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {campaign.status === 'DRAFT' && (
              <button
                onClick={() => handleStatusUpdate('ACTIVE')}
                className="btn-secondary flex items-center gap-2 text-green-600 hover:bg-green-50"
              >
                <Play className="w-4 h-4" />
                Activate
              </button>
            )}
            {campaign.status === 'ACTIVE' && (
              <>
                <button
                  onClick={() => handleStatusUpdate('PAUSED')}
                  className="btn-secondary flex items-center gap-2 text-yellow-600 hover:bg-yellow-50"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={() => handleStatusUpdate('COMPLETED')}
                  className="btn-secondary flex items-center gap-2 text-blue-600 hover:bg-blue-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Complete
                </button>
              </>
            )}
            {campaign.status === 'PAUSED' && (
              <button
                onClick={() => handleStatusUpdate('ACTIVE')}
                className="btn-secondary flex items-center gap-2 text-green-600 hover:bg-green-50"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}
            {(campaign.status === 'COMPLETED' || campaign.status === 'PAUSED') && (
              <button
                onClick={() => handleStatusUpdate('ARCHIVED')}
                className="btn-secondary flex items-center gap-2 text-gray-600 hover:bg-gray-100"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="input min-h-[80px] w-full"
            placeholder="Campaign description..."
          />
        ) : campaign.description ? (
          <p className="text-gray-600">{campaign.description}</p>
        ) : (
          <p className="text-gray-400 italic">No description</p>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t text-sm text-gray-500">
          <span>Created {format(new Date(campaign.createdAt), 'MMM d, yyyy')}</span>
          <span>by {campaign.user.name || campaign.user.email}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Link
          href={`/dashboard/businesses?campaignId=${campaignId}`}
          className="card hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaign.stats.totalBusinesses}</p>
              <p className="text-sm text-gray-500">Companies</p>
            </div>
          </div>
        </Link>

        <Link
          href={`/dashboard/businesses?campaignId=${campaignId}`}
          className="card hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaign.stats.totalContacts}</p>
              <p className="text-sm text-gray-500">Contacts</p>
            </div>
          </div>
        </Link>

        <Link
          href={`/dashboard/emails?campaignId=${campaignId}`}
          className="card hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Mail className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaign.stats.totalEmails}</p>
              <p className="text-sm text-gray-500">Emails</p>
            </div>
          </div>
        </Link>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Upload className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaign.stats.totalUploads}</p>
              <p className="text-sm text-gray-500">Imports</p>
            </div>
          </div>
        </div>
      </div>

      {/* Leads Management Card */}
      <div className="card mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Leads Management
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI Enrichment
                </span>
              </h2>
              <p className="text-sm text-gray-600">
                Import leads, manage contacts, and use AI to research and enrich your data
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/campaigns/${campaignId}/leads`}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Users className="w-4 h-4" />
            Manage Leads
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Email Status Breakdown */}
      {campaign.stats.totalEmails > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Email Status
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(campaign.stats.emailStatusBreakdown).map(([status, count]) => (
              <Link
                key={status}
                href={`/dashboard/emails?campaignId=${campaignId}&status=${status}`}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  status === 'SENT' ? 'bg-green-100 text-green-700' :
                  status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                  status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                  status === 'NEEDS_REVIEW' ? 'bg-yellow-100 text-yellow-700' :
                  status === 'BOUNCED' ? 'bg-red-100 text-red-700' :
                  status === 'REPLIED' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-700'
                }`}
              >
                {status.replace('_', ' ')}: {count}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Import Data */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import Companies
        </h2>

        {!importFile ? (
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-primary-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">CSV, Excel, JSON, TSV</p>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls,.json,.tsv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImportFile(file);
                e.target.value = '';
              }}
            />
          </label>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary-600" />
              <div>
                <p className="font-medium text-gray-900">{importFile.name}</p>
                <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setImportFile(null)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Companies */}
      {campaign.recentBusinesses.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Recent Companies
            </h2>
            <Link
              href={`/dashboard/businesses?campaignId=${campaignId}`}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1"
            >
              View all
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y">
            {campaign.recentBusinesses.map((business) => (
              <Link
                key={business.id}
                href={`/dashboard/businesses/${business.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-4 px-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{business.canonicalName}</p>
                  <p className="text-sm text-gray-500">{business.industryGuess || 'Unknown industry'}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{business._count.contacts} contacts</span>
                  <span>{business._count.emailDrafts} emails</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
