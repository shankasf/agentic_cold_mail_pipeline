'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FolderKanban,
  Plus,
  Search,
  Building2,
  Mail,
  Users,
  Trash2,
  Loader2,
  Play,
  Pause,
  CheckCircle,
  Archive,
  FileEdit,
} from 'lucide-react';
import { format } from 'date-fns';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    businesses: number;
    uploads: number;
    emails: number;
    contacts: number;
  };
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  DRAFT: { icon: FileEdit, color: 'text-gray-600', bg: 'bg-gray-100' },
  ACTIVE: { icon: Play, color: 'text-green-600', bg: 'bg-green-100' },
  PAUSED: { icon: Pause, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  COMPLETED: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
  ARCHIVED: { icon: Archive, color: 'text-gray-500', bg: 'bg-gray-100' },
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/campaigns?${params}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(fetchCampaigns, 300);
    return () => clearTimeout(debounce);
  }, [fetchCampaigns]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? Companies in this campaign will be orphaned.`)) {
      return;
    }

    setDeleting(id);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete campaign');
      }
      fetchCampaigns();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete campaign');
    } finally {
      setDeleting(null);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      fetchCampaigns();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <Link href="/dashboard/campaigns/create" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Campaign
        </Link>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input w-full sm:w-40"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card text-center py-12">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns found</h3>
          <p className="text-gray-500 mb-4">
            {search || statusFilter
              ? 'Try adjusting your filters'
              : 'Create your first campaign to organize your outreach'}
          </p>
          {!search && !statusFilter && (
            <Link href="/dashboard/campaigns/create" className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Campaign
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((campaign) => {
              const StatusIcon = statusConfig[campaign.status]?.icon || FileEdit;
              const statusColor = statusConfig[campaign.status]?.color || 'text-gray-600';
              const statusBg = statusConfig[campaign.status]?.bg || 'bg-gray-100';

              return (
                <div
                  key={campaign.id}
                  className="card hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${statusBg}`}>
                        <FolderKanban className={`w-5 h-5 ${statusColor}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 line-clamp-1">{campaign.name}</h3>
                        <div className={`flex items-center gap-1 text-xs ${statusColor}`}>
                          <StatusIcon className="w-3 h-3" />
                          {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {campaign.status === 'DRAFT' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusUpdate(campaign.id, 'ACTIVE');
                          }}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Activate"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {campaign.status === 'ACTIVE' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusUpdate(campaign.id, 'PAUSED');
                          }}
                          className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded"
                          title="Pause"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      {campaign.status === 'PAUSED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusUpdate(campaign.id, 'ACTIVE');
                          }}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Resume"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(campaign.id, campaign.name);
                        }}
                        disabled={deleting === campaign.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === campaign.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {campaign.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{campaign.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      {campaign._count.businesses} companies
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-gray-400" />
                      {campaign._count.contacts} contacts
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {campaign._count.emails} emails
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
