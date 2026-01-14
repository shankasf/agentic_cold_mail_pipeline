'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle, AlertCircle, Clock, Send, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface EmailDraft {
  id: string;
  subject: string;
  confidenceScore: number;
  deliverabilityScore: number;
  status: string;
  createdAt: string;
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
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmails = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (status !== 'ALL') params.set('status', status);

        const res = await fetch(`/api/emails?${params}`);
        const data = await res.json();
        setEmails(data.emails || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (error) {
        console.error('Error fetching emails:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmails();
  }, [page, status]);

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
    window.location.reload();
  };

  const handleBulkSend = async () => {
    if (selectedIds.length === 0) return;

    // Check if all selected emails are approved
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
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send emails');
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
        // Refresh the list
        const params = new URLSearchParams({ page: String(page) });
        if (status !== 'ALL') params.set('status', status);
        const refreshRes = await fetch(`/api/emails?${params}`);
        const refreshData = await refreshRes.json();
        setEmails(refreshData.emails || []);
      } else if (data.skippedSuppressed > 0) {
        alert('Email skipped - recipient is in suppression list.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Queue</h1>
        <div className="flex gap-3">
          {selectedIds.length > 0 && (
            <>
              <button onClick={handleBulkApprove} className="btn-primary">
                Approve Selected ({selectedIds.length})
              </button>
              <button onClick={handleBulkSend} className="btn-secondary flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border-blue-600">
                <Send className="w-4 h-4" />
                Send Selected ({selectedIds.length})
              </button>
            </>
          )}
          <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex gap-2 flex-wrap">
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
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

      <div className="card">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
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
                          href={`/dashboard/businesses/${email.business.id}`}
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
                      <td className="px-4 py-3">
                        {email.status === 'SENT' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                            <CheckCircle className="w-4 h-4" />
                            Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 text-sm">
                            <Clock className="w-4 h-4" />
                            Unsent
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {format(new Date(email.createdAt), 'MMM d, HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        {email.status === 'SENT' ? (
                          <span className="text-gray-400 text-sm">Sent</span>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  ))}
                  {emails.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        No emails found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4 pt-4 border-t">
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
    </div>
  );
}
