'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle, AlertCircle, Clock, Send, Download, Loader2, Calendar, Reply, MessageSquare, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton, ErrorState } from '@/components/LoadingStates';

interface EmailDraft {
  id: string;
  subject: string;
  confidenceScore: number;
  deliverabilityScore: number;
  status: string;
  createdAt: string;
  sentAt?: string;
  business: {
    id: string;
    canonicalName: string;
    industryGuess?: string;
  };
  contact: {
    id: string;
    email: string;
    name?: string;
  };
}

const statusOptions = ['ALL', 'DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'SENT', 'BOUNCED', 'COMPLAINT'];

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState('');
  const [followUpBody, setFollowUpBody] = useState('');
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status !== 'ALL') params.set('status', status);
      if (selectedDate) params.set('date', selectedDate);

      const res = await fetch(`/api/emails?${params}`);
      if (!res.ok) throw new Error('Failed to load emails');
      const data = await res.json();
      setEmails(data.emails || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [page, status, selectedDate]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="badge-info"><Clock className="w-3 h-3 mr-1" />Draft</span>;
      case 'NEEDS_REVIEW':
        return <span className="badge-warning"><AlertCircle className="w-3 h-3 mr-1" />Review</span>;
      case 'APPROVED':
        return <span className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Approved</span>;
      case 'SENT':
        return <span className="badge-success"><Send className="w-3 h-3 mr-1" />Sent</span>;
      case 'BOUNCED':
        return <span className="badge-danger">Bounced</span>;
      case 'COMPLAINT':
        return <span className="badge-danger">Complaint</span>;
      default:
        return <span className="badge-gray">{status}</span>;
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Approve ${selectedIds.length} emails?`)) return;

    for (const id of selectedIds) {
      await fetch(`/api/emails/${id}/approve`, { method: 'POST' });
    }
    setSelectedIds([]);
    fetchEmails();
  };

  const handleBulkSend = async () => {
    if (selectedIds.length === 0) return;

    const selectedEmails = emails.filter((e) => selectedIds.includes(e.id));
    const unapproved = selectedEmails.filter((e) => e.status !== 'APPROVED');

    if (unapproved.length > 0) {
      alert(`${unapproved.length} email(s) are not approved. Please approve all selected emails before sending.`);
      return;
    }

    if (!confirm(`Send ${selectedIds.length} emails?`)) return;

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send emails');
      }

      alert(`${data.queued} email(s) queued for sending!${data.skippedSuppressed > 0 ? ` (${data.skippedSuppressed} skipped - in suppression list)` : ''}`);
      setSelectedIds([]);
      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send emails');
    }
  };

  const handleFollowUp = () => {
    if (selectedIds.length === 0) return;
    // Get the first selected email to use as template for subject
    const firstEmail = emails.find((e) => selectedIds.includes(e.id));
    if (firstEmail) {
      setFollowUpSubject(`Re: ${firstEmail.subject.replace(/^Re:\s*/i, '')}`);
    }
    setFollowUpBody('');
    setShowFollowUpModal(true);
  };

  const handleCreateFollowUp = async () => {
    if (!followUpSubject || !followUpBody) {
      alert('Please enter subject and body for the follow-up');
      return;
    }

    setCreatingFollowUp(true);
    try {
      const res = await fetch('/api/emails/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailIds: selectedIds,
          subject: followUpSubject,
          bodyText: followUpBody,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create follow-up');
      }

      alert(`Created ${data.created} follow-up email(s)!`);
      setShowFollowUpModal(false);
      setSelectedIds([]);
      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create follow-up');
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (selectedIds.length > 0) params.set('ids', selectedIds.join(','));
    window.open(`/api/exports/csv?${params}`, '_blank');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === emails.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(emails.map((e) => e.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} email(s)? This action cannot be undone.`)) return;

    try {
      const res = await fetch('/api/emails/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete emails');
      }

      alert(`Deleted ${data.deleted} email(s)`);
      setSelectedIds([]);
      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete emails');
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    if (!confirm('Are you sure you want to delete this email? This action cannot be undone.')) return;

    try {
      const res = await fetch('/api/emails/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: [emailId] }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete email');
      }

      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete email');
    }
  };

  const handleSendEmail = async (email: EmailDraft) => {
    if (email.status === 'SENT') {
      alert('This email has already been sent.');
      return;
    }

    if (email.status !== 'APPROVED') {
      alert('Please approve this email before sending.');
      return;
    }

    setSendingId(email.id);
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: [email.id] }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      if (data.queued > 0) {
        alert('Email queued for sending!');
        fetchEmails();
      } else if (data.skippedSuppressed > 0) {
        alert('Email skipped - recipient is in suppression list.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setSendingId(null);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Failed to load emails"
        message={error}
        onRetry={fetchEmails}
      />
    );
  }

  return (
    <div>
      {/* Header - responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Email Queue</h1>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {selectedIds.length > 0 && (
            <>
              <button onClick={handleBulkApprove} className="btn-primary text-sm sm:text-base">
                Approve ({selectedIds.length})
              </button>
              <button onClick={handleFollowUp} className="btn-secondary flex items-center gap-1 sm:gap-2 bg-purple-600 hover:bg-purple-700 text-white border-purple-600 text-sm sm:text-base">
                <Reply className="w-4 h-4" />
                Follow Up ({selectedIds.length})
              </button>
              <button onClick={handleBulkSend} className="btn-secondary flex items-center gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-white border-blue-600 text-sm sm:text-base">
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send Selected</span>
                <span className="sm:hidden">Send</span> ({selectedIds.length})
              </button>
              <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span> ({selectedIds.length})
              </button>
            </>
          )}
          <Link href="/dashboard/emails/threads" className="btn-secondary flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">View Threads</span>
            <span className="sm:hidden">Threads</span>
          </Link>
          <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {selectedDate && (
              <button
                onClick={() => {
                  setSelectedDate('');
                  setPage(1);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status filters - scrollable on mobile */}
          <div className="flex gap-2 overflow-x-auto min-w-0">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  status === s
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="lg:hidden space-y-4">
            {emails.map((email) => (
              <div key={email.id} className="card">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(email.id)}
                    onChange={() => toggleSelect(email.id)}
                    className="rounded mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link
                        href={`/dashboard/emails/${email.id}`}
                        className="font-medium text-gray-900 hover:text-primary-600 line-clamp-2"
                      >
                        {email.subject}
                      </Link>
                      {getStatusBadge(email.status)}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <p className="truncate">To: {email.contact.email}</p>
                      <Link
                        href={`/dashboard/emails/threads/${email.business.id}`}
                        className="text-primary-600 hover:underline truncate block"
                      >
                        {email.business.canonicalName}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className={email.confidenceScore >= 70 ? 'text-green-600' : 'text-yellow-600'}>
                        Conf: {email.confidenceScore}%
                      </span>
                      <span className={email.deliverabilityScore >= 70 ? 'text-green-600' : 'text-yellow-600'}>
                        Deliv: {email.deliverabilityScore}%
                      </span>
                      <span className="text-gray-500">
                        {format(new Date(email.createdAt), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {email.status !== 'SENT' && (
                        <button
                          onClick={() => handleSendEmail(email)}
                          disabled={sendingId === email.id}
                          className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                            email.status === 'APPROVED'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {sendingId === email.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          {email.status === 'APPROVED' ? 'Send' : 'Approve First'}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/emails/threads/${email.business.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Thread
                      </Link>
                      <button
                        onClick={() => handleDeleteEmail(email.id)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-red-50 hover:bg-red-100 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {emails.length === 0 && (
              <div className="card text-center py-8 text-gray-500">
                No emails found{selectedDate && ` for ${format(new Date(selectedDate), 'MMM d, yyyy')}`}.
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="card hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === emails.length && emails.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deliverability</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {emails.map((email) => (
                    <tr key={email.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(email.id)}
                          onChange={() => toggleSelect(email.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/emails/threads/${email.business.id}`}
                          className="font-medium text-gray-900 hover:text-primary-600"
                        >
                          {email.business.canonicalName}
                        </Link>
                        {email.business.industryGuess && (
                          <p className="text-xs text-gray-500">{email.business.industryGuess}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{email.contact.email}</p>
                        {email.contact.name && (
                          <p className="text-xs text-gray-500">{email.contact.name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/emails/${email.id}`}
                          className="text-sm text-gray-900 hover:text-primary-600 line-clamp-2"
                        >
                          {email.subject}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${email.confidenceScore >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                          {email.confidenceScore}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${email.deliverabilityScore >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                          {email.deliverabilityScore}%
                        </span>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(email.status)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {email.sentAt ? (
                          <span className="text-green-600">
                            Sent {format(new Date(email.sentAt), 'MMM d, HH:mm')}
                          </span>
                        ) : (
                          format(new Date(email.createdAt), 'MMM d, HH:mm')
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {email.status !== 'SENT' ? (
                            <button
                              onClick={() => handleSendEmail(email)}
                              disabled={sendingId === email.id}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                email.status === 'APPROVED'
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                              }`}
                              title={email.status !== 'APPROVED' ? 'Approve email first' : 'Send email'}
                            >
                              {sendingId === email.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Send
                            </button>
                          ) : (
                            <span className="text-green-600 text-sm flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Sent
                            </span>
                          )}
                          <Link
                            href={`/dashboard/emails/threads/${email.business.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-100"
                            title="View thread"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleDeleteEmail(email.id)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm text-red-600 hover:bg-red-50"
                            title="Delete email"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {emails.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No emails found{selectedDate && ` for ${format(new Date(selectedDate), 'MMM d, yyyy')}`}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2 py-4">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50 text-sm"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-600 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="btn-secondary disabled:opacity-50 text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowFollowUpModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Create Follow-up Email</h3>
                <button onClick={() => setShowFollowUpModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="bg-blue-50 px-4 py-2 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Creating follow-up for {selectedIds.length} email(s)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={followUpSubject}
                    onChange={(e) => setFollowUpSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Re: Original subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={followUpBody}
                    onChange={(e) => setFollowUpBody(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Hi,&#10;&#10;Just wanted to follow up on my previous email..."
                  />
                </div>

                <div className="text-xs text-gray-500">
                  <p>Available variables: {'{{name}}'}, {'{{company}}'}, {'{{role}}'}, {'{{industry}}'}</p>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 flex justify-end gap-3">
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFollowUp}
                  disabled={creatingFollowUp || !followUpSubject || !followUpBody}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {creatingFollowUp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Reply className="w-4 h-4" />
                  )}
                  {creatingFollowUp ? 'Creating...' : 'Create Follow-up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
