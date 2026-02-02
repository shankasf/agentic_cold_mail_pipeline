'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/swr';
import { format } from 'date-fns';
import {
  Inbox,
  Mail,
  MailOpen,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  Clock,
  X,
  Filter,
  ChevronDown,
  Reply,
  Forward,
  MoreHorizontal,
  Calendar,
  FolderKanban,
  AlertTriangle,
  Send,
  ExternalLink,
  Tag,
  CheckCheck,
  ArchiveRestore,
  Paperclip,
  Download,
  FileText,
  Image,
  File,
} from 'lucide-react';

interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
}

interface InboundEmail {
  id: string;
  sesMessageId: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  threadId: string | null;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  originalEmail: {
    id: string;
    subject: string;
    status: string;
    businessId: string;
  } | null;
  contact: {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
  } | null;
  business: {
    id: string;
    canonicalName: string;
    industryGuess: string | null;
    campaignId: string | null;
    campaign: {
      id: string;
      name: string;
    } | null;
  } | null;
  sesIdentity: {
    id: string;
    emailAddress: string;
    displayName: string | null;
  } | null;
  attachments: EmailAttachment[];
}

interface Identity {
  id: string;
  emailAddress: string;
  displayName: string | null;
}

interface Campaign {
  id: string;
  name: string;
}

interface InboxResponse {
  emails: InboundEmail[];
  unreadCount: number;
  identities: Identity[];
  campaigns: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper function to get icon for file type
function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) {
    return <Image className="w-4 h-4" />;
  }
  if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('text')) {
    return <FileText className="w-4 h-4" />;
  }
  return <File className="w-4 h-4" />;
}

export default function InboxPage() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showIdentityDropdown, setShowIdentityDropdown] = useState(false);
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const identityDropdownRef = useRef<HTMLDivElement>(null);
  const campaignDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (identityDropdownRef.current && !identityDropdownRef.current.contains(event.target as Node)) {
        setShowIdentityDropdown(false);
      }
      if (campaignDropdownRef.current && !campaignDropdownRef.current.contains(event.target as Node)) {
        setShowCampaignDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build query params
  const params = new URLSearchParams();
  params.set('page', page.toString());
  if (filter === 'unread') params.set('isRead', 'false');
  if (filter === 'starred') params.set('isStarred', 'true');
  if (filter === 'archived') {
    params.set('isArchived', 'true');
  } else {
    params.set('isArchived', 'false');
  }
  if (search) params.set('search', search);
  if (selectedIdentity !== 'all') params.set('identityId', selectedIdentity);
  if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);

  const { data, isLoading, error } = useSWR<InboxResponse>(
    `/api/inbox?${params.toString()}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSelectAll = () => {
    if (!data) return;
    if (selectedIds.size === data.emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.emails.map((e) => e.id)));
    }
  };

  const handleSelectEmail = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkAction = async (action: 'read' | 'unread' | 'archive' | 'unarchive' | 'star' | 'unstar') => {
    if (selectedIds.size === 0) return;

    const updates: Record<string, boolean> = {};
    switch (action) {
      case 'read':
        updates.isRead = true;
        break;
      case 'unread':
        updates.isRead = false;
        break;
      case 'archive':
        updates.isArchived = true;
        break;
      case 'unarchive':
        updates.isArchived = false;
        break;
      case 'star':
        updates.isStarred = true;
        break;
      case 'unstar':
        updates.isStarred = false;
        break;
    }

    const idsToUpdate = Array.from(selectedIds);

    // Optimistic update
    mutate(
      `/api/inbox?${params.toString()}`,
      (currentData: InboxResponse | undefined) => {
        if (!currentData) return currentData;

        // For archive/unarchive, remove from current view if it doesn't match filter
        if (action === 'archive' && filter !== 'archived') {
          return {
            ...currentData,
            emails: currentData.emails.filter((e) => !selectedIds.has(e.id)),
            pagination: {
              ...currentData.pagination,
              total: currentData.pagination.total - idsToUpdate.length,
            },
          };
        }
        if (action === 'unarchive' && filter === 'archived') {
          return {
            ...currentData,
            emails: currentData.emails.filter((e) => !selectedIds.has(e.id)),
            pagination: {
              ...currentData.pagination,
              total: currentData.pagination.total - idsToUpdate.length,
            },
          };
        }

        // Update in place for other actions
        return {
          ...currentData,
          emails: currentData.emails.map((e) =>
            selectedIds.has(e.id) ? { ...e, ...updates } : e
          ),
        };
      },
      false
    );

    setSelectedIds(new Set());

    try {
      await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToUpdate, updates }),
      });
      mutate(`/api/inbox?${params.toString()}`);
    } catch (err) {
      mutate(`/api/inbox?${params.toString()}`);
      alert('Failed to update emails');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);

    // Optimistic update - remove from UI immediately
    mutate(
      `/api/inbox?${params.toString()}`,
      (currentData: InboxResponse | undefined) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          emails: currentData.emails.filter((e) => !selectedIds.has(e.id)),
          pagination: {
            ...currentData.pagination,
            total: currentData.pagination.total - idsToDelete.length,
          },
        };
      },
      false // Don't revalidate yet
    );

    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    setSelectedEmail(null);

    try {
      await fetch('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      // Revalidate to sync with server
      mutate(`/api/inbox?${params.toString()}`);
    } catch (err) {
      // Revert on error by revalidating
      mutate(`/api/inbox?${params.toString()}`);
      alert('Failed to delete emails');
    }
  };

  const handleDeleteSingle = async (id: string) => {
    // Optimistic update - remove from UI immediately
    mutate(
      `/api/inbox?${params.toString()}`,
      (currentData: InboxResponse | undefined) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          emails: currentData.emails.filter((e) => e.id !== id),
          pagination: {
            ...currentData.pagination,
            total: currentData.pagination.total - 1,
          },
        };
      },
      false
    );

    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
    }

    try {
      await fetch('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      mutate(`/api/inbox?${params.toString()}`);
    } catch (err) {
      mutate(`/api/inbox?${params.toString()}`);
      alert('Failed to delete email');
    }
  };

  const handleOpenEmail = async (email: InboundEmail) => {
    setSelectedEmail(email);

    if (!email.isRead) {
      try {
        await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [email.id], updates: { isRead: true } }),
        });
        mutate(`/api/inbox?${params.toString()}`);
      } catch (err) {
        console.error('Failed to mark as read');
      }
    }
  };

  const handleToggleStar = async (email: InboundEmail, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStarred = !email.isStarred;

    // Optimistic update
    mutate(
      `/api/inbox?${params.toString()}`,
      (currentData: InboxResponse | undefined) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          emails: currentData.emails.map((e) =>
            e.id === email.id ? { ...e, isStarred: newStarred } : e
          ),
        };
      },
      false
    );

    // Also update selected email if it's the same one
    if (selectedEmail?.id === email.id) {
      setSelectedEmail({ ...selectedEmail, isStarred: newStarred });
    }

    try {
      await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [email.id], updates: { isStarred: newStarred } }),
      });
      mutate(`/api/inbox?${params.toString()}`);
    } catch (err) {
      mutate(`/api/inbox?${params.toString()}`);
      console.error('Failed to toggle star');
    }
  };

  const handleReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;

    setReplySending(true);
    try {
      const response = await fetch('/api/emails/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedEmail.business?.id || selectedEmail.originalEmail?.businessId,
          contactId: selectedEmail.contact?.id,
          subject: `Re: ${selectedEmail.subject}`,
          bodyText: replyBody,
          sendImmediately: true,
          inReplyToMessageId: selectedEmail.sesMessageId,
        }),
      });

      if (response.ok) {
        setShowReplyModal(false);
        setReplyBody('');
        alert('Reply sent successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to send reply: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Failed to send reply');
    } finally {
      setReplySending(false);
    }
  };

  const clearFilters = () => {
    setSelectedIdentity('all');
    setSelectedCampaign('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setSearchInput('');
    setFilter('all');
    setPage(1);
  };

  const hasActiveFilters = selectedIdentity !== 'all' || selectedCampaign !== 'all' || dateFrom || dateTo || search;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-96 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          Failed to load inbox. Please try again.
        </div>
      </div>
    );
  }

  const emails = data?.emails || [];
  const pagination = data?.pagination;
  const unreadCount = data?.unreadCount || 0;
  const identities = data?.identities || [];
  const campaigns = data?.campaigns || [];

  const getSelectedIdentityLabel = () => {
    if (selectedIdentity === 'all') return 'All Inboxes';
    const identity = identities.find((i) => i.id === selectedIdentity);
    return identity?.displayName || identity?.emailAddress || 'All Inboxes';
  };

  const getSelectedCampaignLabel = () => {
    if (selectedCampaign === 'all') return 'All Campaigns';
    const campaign = campaigns.find((c) => c.id === selectedCampaign);
    return campaign?.name || 'All Campaigns';
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Email List */}
      <div className={`flex flex-col ${selectedEmail ? 'w-1/2 border-r' : 'w-full'}`}>
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Inbox className="w-6 h-6 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className={`p-2 rounded-lg flex items-center gap-1 ${showFiltersPanel || hasActiveFilters ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Filter className="w-4 h-4" />
                {hasActiveFilters && <span className="text-xs">Active</span>}
              </button>
              <button
                onClick={() => mutate(`/api/inbox?${params.toString()}`)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFiltersPanel && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Filters</span>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-primary-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Identity Filter */}
                <div className="relative" ref={identityDropdownRef}>
                  <label className="block text-xs text-gray-500 mb-1">Identity</label>
                  <button
                    onClick={() => setShowIdentityDropdown(!showIdentityDropdown)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-white bg-white"
                  >
                    <Mail className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-left truncate">{getSelectedIdentityLabel()}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showIdentityDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showIdentityDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => { setSelectedIdentity('all'); setShowIdentityDropdown(false); setPage(1); }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${selectedIdentity === 'all' ? 'bg-primary-50 text-primary-700' : ''}`}
                      >
                        All Inboxes
                      </button>
                      {identities.map((identity) => (
                        <button
                          key={identity.id}
                          onClick={() => { setSelectedIdentity(identity.id); setShowIdentityDropdown(false); setPage(1); }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 truncate ${selectedIdentity === identity.id ? 'bg-primary-50 text-primary-700' : ''}`}
                        >
                          {identity.displayName || identity.emailAddress}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Campaign Filter */}
                <div className="relative" ref={campaignDropdownRef}>
                  <label className="block text-xs text-gray-500 mb-1">Campaign</label>
                  <button
                    onClick={() => setShowCampaignDropdown(!showCampaignDropdown)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-white bg-white"
                  >
                    <FolderKanban className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-left truncate">{getSelectedCampaignLabel()}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCampaignDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showCampaignDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => { setSelectedCampaign('all'); setShowCampaignDropdown(false); setPage(1); }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${selectedCampaign === 'all' ? 'bg-primary-50 text-primary-700' : ''}`}
                      >
                        All Campaigns
                      </button>
                      {campaigns.map((campaign) => (
                        <button
                          key={campaign.id}
                          onClick={() => { setSelectedCampaign(campaign.id); setShowCampaignDropdown(false); setPage(1); }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 truncate ${selectedCampaign === campaign.id ? 'bg-primary-50 text-primary-700' : ''}`}
                        >
                          {campaign.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 text-sm border rounded-lg"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 text-sm border rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Quick Filters Row */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {(['all', 'unread', 'starred', 'archived'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${
                  filter === f
                    ? 'bg-primary-100 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f === 'unread' && <MailOpen className="w-3.5 h-3.5" />}
                {f === 'starred' && <Star className="w-3.5 h-3.5" />}
                {f === 'archived' && <Archive className="w-3.5 h-3.5" />}
                {f === 'all' && <Inbox className="w-3.5 h-3.5" />}
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by sender, subject, or content..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Search
            </button>
          </form>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-primary-50 border-b flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-primary-700">{selectedIds.size} selected</span>
            <div className="h-4 w-px bg-primary-200" />
            <button onClick={() => handleBulkAction('read')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 flex items-center gap-1">
              <CheckCheck className="w-3 h-3" /> Mark Read
            </button>
            <button onClick={() => handleBulkAction('unread')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 flex items-center gap-1">
              <Mail className="w-3 h-3" /> Mark Unread
            </button>
            <button onClick={() => handleBulkAction('star')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 flex items-center gap-1">
              <Star className="w-3 h-3" /> Star
            </button>
            {filter === 'archived' ? (
              <button onClick={() => handleBulkAction('unarchive')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 flex items-center gap-1">
                <ArchiveRestore className="w-3 h-3" /> Unarchive
              </button>
            ) : (
              <button onClick={() => handleBulkAction('archive')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 flex items-center gap-1">
                <Archive className="w-3 h-3" /> Archive
              </button>
            )}
            <button onClick={() => setShowDeleteConfirm(true)} className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        )}

        {/* Select All Row */}
        {emails.length > 0 && (
          <div className="px-4 py-2 border-b flex items-center gap-3 bg-gray-50">
            <button onClick={handleSelectAll} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
              {selectedIds.size === emails.length ? (
                <CheckSquare className="w-4 h-4 text-primary-600" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Select All
            </button>
            <span className="text-xs text-gray-500">
              {pagination?.total} total emails
            </span>
          </div>
        )}

        {/* Email List */}
        <div className="flex-1 overflow-y-auto">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Mail className="w-12 h-12 mb-2 opacity-50" />
              <p className="font-medium">No emails found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => handleOpenEmail(email)}
                  className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !email.isRead ? 'bg-blue-50/50' : ''
                  } ${selectedEmail?.id === email.id ? 'bg-primary-50 border-l-2 border-l-primary-500' : ''}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSelectEmail(email.id); }}
                    className="mt-1 flex-shrink-0"
                  >
                    {selectedIds.has(email.id) ? (
                      <CheckSquare className="w-4 h-4 text-primary-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>

                  <button onClick={(e) => handleToggleStar(email, e)} className="mt-1 flex-shrink-0">
                    <Star className={`w-4 h-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {email.fromName || email.fromEmail}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {(email.hasAttachments || email.attachments?.length > 0) && (
                          <span title="Has attachments">
                            <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {format(new Date(email.receivedAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm truncate ${!email.isRead ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      {email.subject || '(No subject)'}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-1">
                      {email.bodyText?.slice(0, 120) || '(No preview)'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {email.business && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                          <Building2 className="w-3 h-3" />
                          {email.business.canonicalName}
                        </span>
                      )}
                      {email.business?.campaign && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 rounded text-xs text-primary-600">
                          <Tag className="w-3 h-3" />
                          {email.business.campaign.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
                        <Mail className="w-3 h-3" />
                        {email.toEmail}
                      </span>
                    </div>
                  </div>

                  {!email.isRead && (
                    <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-500">
              Page {page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Email Detail Panel */}
      {selectedEmail && (
        <div className="w-1/2 flex flex-col bg-white">
          {/* Detail Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-lg truncate flex-1">{selectedEmail.subject || '(No subject)'}</h2>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setShowReplyModal(true)}
                className="p-2 text-gray-500 hover:bg-primary-50 hover:text-primary-600 rounded-lg"
                title="Reply"
              >
                <Reply className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleToggleStar(selectedEmail, { stopPropagation: () => {} } as React.MouseEvent)}
                className="p-2 text-gray-500 hover:bg-yellow-50 rounded-lg"
                title={selectedEmail.isStarred ? 'Unstar' : 'Star'}
              >
                <Star className={`w-5 h-5 ${selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
              <button
                onClick={() => handleBulkAction(selectedEmail.isArchived ? 'unarchive' : 'archive')}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                title={selectedEmail.isArchived ? 'Unarchive' : 'Archive'}
              >
                {selectedEmail.isArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
              </button>
              <button
                onClick={() => handleDeleteSingle(selectedEmail.id)}
                className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sender Info */}
          <div className="p-4 border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedEmail.fromName || selectedEmail.fromEmail}</p>
                  <p className="text-sm text-gray-500">{selectedEmail.fromEmail}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  {format(new Date(selectedEmail.receivedAt), 'MMM d, yyyy h:mm a')}
                </div>
                <p className="text-xs text-gray-400 mt-1">To: {selectedEmail.toEmail}</p>
              </div>
            </div>

            {/* Contact & Business Info */}
            {(selectedEmail.contact || selectedEmail.business) && (
              <div className="mt-4 pt-4 border-t flex items-center gap-4 flex-wrap">
                {selectedEmail.contact && (
                  <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{selectedEmail.contact.name || selectedEmail.contact.email}</span>
                    {selectedEmail.contact.role && (
                      <span className="text-gray-400">• {selectedEmail.contact.role}</span>
                    )}
                  </div>
                )}
                {selectedEmail.business && (
                  <a
                    href={`/dashboard/businesses?id=${selectedEmail.business.id}`}
                    className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  >
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{selectedEmail.business.canonicalName}</span>
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </a>
                )}
                {selectedEmail.business?.campaign && (
                  <a
                    href={`/dashboard/campaigns/${selectedEmail.business.campaign.id}`}
                    className="flex items-center gap-2 text-sm bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100"
                  >
                    <FolderKanban className="w-4 h-4 text-primary-500" />
                    <span className="text-primary-700">{selectedEmail.business.campaign.name}</span>
                    <ExternalLink className="w-3 h-3 text-primary-400" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Email Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl mx-auto">
              {selectedEmail.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                />
              ) : (
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedEmail.bodyText || '(No content)'}
                </div>
              )}

              {/* Attachments Section */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
                    <Paperclip className="w-4 h-4" />
                    Attachments ({selectedEmail.attachments.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEmail.attachments
                      .filter((att) => !att.isInline)
                      .map((attachment) => (
                        <a
                          key={attachment.id}
                          href={`/api/attachments/${attachment.id}`}
                          download={attachment.filename}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                        >
                          <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg border flex items-center justify-center text-gray-500">
                            {getFileIcon(attachment.contentType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(attachment.sizeBytes)}
                            </p>
                          </div>
                          <Download className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
                        </a>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Original Email Reference */}
          {selectedEmail.originalEmail && (
            <div className="p-4 border-t bg-gray-50">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Reply className="w-4 h-4" />
                In reply to:{' '}
                <a
                  href={`/dashboard/emails?id=${selectedEmail.originalEmail.id}`}
                  className="text-primary-600 hover:underline font-medium"
                >
                  {selectedEmail.originalEmail.subject}
                </a>
              </p>
            </div>
          )}

          {/* Quick Reply */}
          <div className="p-4 border-t">
            <button
              onClick={() => setShowReplyModal(true)}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center gap-2"
            >
              <Reply className="w-5 h-5" />
              Click to reply
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Emails</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-700 mb-6">
              Are you sure you want to permanently delete {selectedIds.size} email{selectedIds.size > 1 ? 's' : ''}?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {showReplyModal && selectedEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Reply to {selectedEmail.fromName || selectedEmail.fromEmail}</h3>
              <button onClick={() => setShowReplyModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <p className="text-gray-600">{selectedEmail.fromEmail}</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <p className="text-gray-600">Re: {selectedEmail.subject}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={10}
                  className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary-500"
                  placeholder="Write your reply..."
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowReplyModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReply}
                disabled={replySending || !replyBody.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {replySending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Reply
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
