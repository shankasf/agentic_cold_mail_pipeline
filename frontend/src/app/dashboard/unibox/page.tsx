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
} from 'lucide-react';

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
  receivedAt: string;
  originalEmail: {
    id: string;
    subject: string;
    status: string;
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
  } | null;
  sesIdentity: {
    id: string;
    emailAddress: string;
    displayName: string | null;
  } | null;
}

interface Identity {
  id: string;
  emailAddress: string;
  displayName: string | null;
}

interface UniboxResponse {
  emails: InboundEmail[];
  unreadCount: number;
  identities: Identity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function UniboxPage() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<string>('all');
  const [showIdentityDropdown, setShowIdentityDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowIdentityDropdown(false);
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

  const { data, isLoading, error } = useSWR<UniboxResponse>(
    `/api/unibox?${params.toString()}`,
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

    try {
      await fetch('/api/unibox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), updates }),
      });
      setSelectedIds(new Set());
      mutate(`/api/unibox?${params.toString()}`);
    } catch (err) {
      alert('Failed to update emails');
    }
  };

  const handleOpenEmail = async (email: InboundEmail) => {
    setSelectedEmail(email);

    // Mark as read if not already
    if (!email.isRead) {
      try {
        await fetch('/api/unibox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [email.id], updates: { isRead: true } }),
        });
        mutate(`/api/unibox?${params.toString()}`);
      } catch (err) {
        console.error('Failed to mark as read');
      }
    }
  };

  const handleToggleStar = async (email: InboundEmail, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/unibox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [email.id], updates: { isStarred: !email.isStarred } }),
      });
      mutate(`/api/unibox?${params.toString()}`);
    } catch (err) {
      console.error('Failed to toggle star');
    }
  };

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

  // Get selected identity display name
  const getSelectedIdentityLabel = () => {
    if (selectedIdentity === 'all') return 'All Inboxes';
    const identity = identities.find((i) => i.id === selectedIdentity);
    return identity?.displayName || identity?.emailAddress || 'All Inboxes';
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
            <button
              onClick={() => mutate(`/api/unibox?${params.toString()}`)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-3 mb-4">
            {/* Identity Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowIdentityDropdown(!showIdentityDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 min-w-[160px]"
              >
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-left truncate">{getSelectedIdentityLabel()}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showIdentityDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showIdentityDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedIdentity('all');
                      setShowIdentityDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                      selectedIdentity === 'all' ? 'bg-primary-50 text-primary-700' : ''
                    }`}
                  >
                    <Inbox className="w-4 h-4" />
                    All Inboxes
                  </button>
                  <div className="border-t" />
                  {identities.map((identity) => (
                    <button
                      key={identity.id}
                      onClick={() => {
                        setSelectedIdentity(identity.id);
                        setShowIdentityDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        selectedIdentity === identity.id ? 'bg-primary-50 text-primary-700' : ''
                      }`}
                    >
                      <div className="font-medium truncate">{identity.displayName || identity.emailAddress}</div>
                      {identity.displayName && (
                        <div className="text-xs text-gray-500 truncate">{identity.emailAddress}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-gray-200" />

            {/* Status Filters */}
            {(['all', 'unread', 'starred', 'archived'] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${
                  filter === f
                    ? 'bg-primary-100 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f === 'unread' && <MailOpen className="w-3.5 h-3.5" />}
                {f === 'starred' && <Star className="w-3.5 h-3.5" />}
                {f === 'archived' && <Archive className="w-3.5 h-3.5" />}
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
                placeholder="Search emails..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Search
            </button>
          </form>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-2">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBulkAction('read')}
              className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50"
            >
              Mark Read
            </button>
            <button
              onClick={() => handleBulkAction('unread')}
              className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50"
            >
              Mark Unread
            </button>
            <button
              onClick={() => handleBulkAction('archive')}
              className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50"
            >
              Archive
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-gray-500 hover:text-gray-700"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Email List */}
        <div className="flex-1 overflow-y-auto">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Mail className="w-12 h-12 mb-2 opacity-50" />
              <p>No emails found</p>
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => handleOpenEmail(email)}
                  className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 ${
                    !email.isRead ? 'bg-blue-50/50' : ''
                  } ${selectedEmail?.id === email.id ? 'bg-primary-50' : ''}`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectEmail(email.id);
                    }}
                    className="mt-1"
                  >
                    {selectedIds.has(email.id) ? (
                      <CheckSquare className="w-4 h-4 text-primary-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  <button onClick={(e) => handleToggleStar(email, e)} className="mt-1">
                    <Star
                      className={`w-4 h-4 ${
                        email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'
                      }`}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm ${!email.isRead ? 'font-semibold' : ''}`}>
                        {email.fromName || email.fromEmail}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(email.receivedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${!email.isRead ? 'font-medium' : 'text-gray-700'}`}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-1">
                      {email.bodyText?.slice(0, 100) || '(No preview)'}
                    </p>
                    {email.business && (
                      <div className="flex items-center gap-1 mt-1">
                        <Building2 className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500">{email.business.canonicalName}</span>
                      </div>
                    )}
                  </div>

                  {!email.isRead && (
                    <div className="w-2 h-2 bg-primary-500 rounded-full mt-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {pagination.total} emails
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Email Detail */}
      {selectedEmail && (
        <div className="w-1/2 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-lg truncate">{selectedEmail.subject}</h2>
            <button
              onClick={() => setSelectedEmail(null)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium">{selectedEmail.fromName || selectedEmail.fromEmail}</p>
                  <p className="text-sm text-gray-500">{selectedEmail.fromEmail}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  {format(new Date(selectedEmail.receivedAt), 'MMM d, yyyy h:mm a')}
                </div>
                <p className="text-xs text-gray-400">To: {selectedEmail.toEmail}</p>
              </div>
            </div>

            {(selectedEmail.contact || selectedEmail.business) && (
              <div className="mt-3 pt-3 border-t flex items-center gap-4">
                {selectedEmail.contact && (
                  <div className="flex items-center gap-1 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      {selectedEmail.contact.name || selectedEmail.contact.email}
                    </span>
                    {selectedEmail.contact.role && (
                      <span className="text-gray-400">({selectedEmail.contact.role})</span>
                    )}
                  </div>
                )}
                {selectedEmail.business && (
                  <div className="flex items-center gap-1 text-sm">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{selectedEmail.business.canonicalName}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl">
              {selectedEmail.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                />
              ) : (
                <div className="text-gray-700 leading-relaxed">
                  {(selectedEmail.bodyText || '(No content)').split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="mb-4 last:mb-0">
                      {paragraph.split('\n').map((line, lineIdx) => (
                        <span key={lineIdx}>
                          {line}
                          {lineIdx < paragraph.split('\n').length - 1 && <br />}
                        </span>
                      ))}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedEmail.originalEmail && (
            <div className="p-4 border-t bg-gray-50">
              <p className="text-sm text-gray-500">
                In reply to:{' '}
                <a
                  href={`/dashboard/emails?id=${selectedEmail.originalEmail.id}`}
                  className="text-primary-600 hover:underline"
                >
                  {selectedEmail.originalEmail.subject}
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
