'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, ChevronRight, Send, Clock, CheckCircle, Reply, Loader2, Building2, User, AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { ErrorState } from '@/components/LoadingStates';

interface EmailEvent {
  id: string;
  eventType: string;
  createdAt: string;
}

interface Email {
  id: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
  sentAt?: string;
  parentEmailId?: string;
  fromName: string;
  fromEmail: string;
  business: {
    id: string;
    canonicalName: string;
    industryGuess?: string;
  };
  contact: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  };
  events?: EmailEvent[];
}

export default function ThreadDetailPage() {
  const params = useParams();
  const businessId = params.businessId as string;

  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string>('');

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/threads?businessId=${businessId}`);
      if (!res.ok) throw new Error('Failed to load emails');
      const data = await res.json();
      setEmails(data.emails || []);

      // Set default contact
      if (data.emails && data.emails.length > 0) {
        setSelectedContact(data.emails[0].contact.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="badge-info text-xs"><Clock className="w-3 h-3 mr-1" />Draft</span>;
      case 'NEEDS_REVIEW':
        return <span className="badge-warning text-xs"><AlertCircle className="w-3 h-3 mr-1" />Review</span>;
      case 'APPROVED':
        return <span className="badge-success text-xs"><CheckCircle className="w-3 h-3 mr-1" />Approved</span>;
      case 'SENT':
        return <span className="badge-success text-xs"><Send className="w-3 h-3 mr-1" />Sent</span>;
      case 'BOUNCED':
        return <span className="badge-danger text-xs">Bounced</span>;
      case 'COMPLAINT':
        return <span className="badge-danger text-xs">Complaint</span>;
      default:
        return <span className="badge-gray text-xs">{status}</span>;
    }
  };

  const handleOpenReply = () => {
    if (emails.length > 0) {
      const latestEmail = emails[emails.length - 1];
      setReplySubject(`Re: ${latestEmail.subject.replace(/^Re:\s*/i, '')}`);
    }
    setReplyBody('');
    setSendImmediately(false);
    setShowReplyModal(true);
  };

  const handleSendReply = async () => {
    if (!replySubject || !replyBody || !selectedContact) {
      alert('Please fill in all required fields');
      return;
    }

    setSendingReply(true);
    try {
      const res = await fetch('/api/emails/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          contactId: selectedContact,
          subject: replySubject,
          bodyText: replyBody,
          sendImmediately,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reply');
      }

      alert(data.sent ? 'Reply sent successfully!' : 'Reply created as draft');
      setShowReplyModal(false);
      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendEmail = async (emailId: string) => {
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: [emailId] }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      if (data.queued > 0) {
        alert('Email queued for sending!');
        fetchEmails();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send email');
    }
  };

  // Get unique contacts from emails
  const uniqueContacts = emails.reduce((acc, email) => {
    if (!acc.find((c) => c.id === email.contact.id)) {
      acc.push(email.contact);
    }
    return acc;
  }, [] as Email['contact'][]);

  const businessName = emails[0]?.business.canonicalName || 'Loading...';
  const businessIndustry = emails[0]?.business.industryGuess;

  if (error) {
    return (
      <ErrorState
        title="Failed to load conversation"
        message={error}
        onRetry={fetchEmails}
      />
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/dashboard/emails" className="hover:text-gray-700">
          Emails
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/dashboard/emails/threads" className="hover:text-gray-700">
          Threads
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{businessName}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-primary-100 p-3 rounded-lg">
            <Building2 className="w-8 h-8 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
            {businessIndustry && (
              <p className="text-gray-500">{businessIndustry}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleOpenReply}
          className="btn-primary flex items-center gap-2"
        >
          <Reply className="w-4 h-4" />
          Compose Reply
        </button>
      </div>

      {/* Contact info */}
      {uniqueContacts.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Contacts</h3>
          <div className="flex flex-wrap gap-3">
            {uniqueContacts.map((contact) => (
              <div key={contact.id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                <User className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {contact.name || contact.email}
                  </p>
                  {contact.name && (
                    <p className="text-xs text-gray-500">{contact.email}</p>
                  )}
                  {contact.role && (
                    <p className="text-xs text-gray-400">{contact.role}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email thread */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {emails.map((email, index) => (
            <div
              key={email.id}
              className={`card ${email.parentEmailId ? 'ml-4 sm:ml-8 border-l-4 border-primary-200' : ''}`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{email.subject}</p>
                    <p className="text-sm text-gray-500">
                      From: {email.fromName} &lt;{email.fromEmail}&gt;
                    </p>
                    <p className="text-sm text-gray-500">
                      To: {email.contact.name || email.contact.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(email.status)}
                  <span className="text-xs text-gray-500">
                    {email.sentAt
                      ? format(new Date(email.sentAt), 'MMM d, yyyy HH:mm')
                      : format(new Date(email.createdAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-3">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                  {email.bodyText}
                </pre>
              </div>

              {/* Email events */}
              {email.events && email.events.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {email.events.map((event) => (
                    <span
                      key={event.id}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                    >
                      {event.eventType.toLowerCase()} - {format(new Date(event.createdAt), 'MMM d, HH:mm')}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                {email.status === 'APPROVED' && (
                  <button
                    onClick={() => handleSendEmail(email.id)}
                    className="btn-primary text-sm flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send Now
                  </button>
                )}
                <Link
                  href={`/dashboard/emails/${email.id}`}
                  className="btn-secondary text-sm"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}

          {emails.length === 0 && (
            <div className="card text-center py-12">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No emails yet</h3>
              <p className="text-gray-500 mb-4">
                Start the conversation by composing a new email.
              </p>
              <button
                onClick={handleOpenReply}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Reply className="w-4 h-4" />
                Compose Email
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reply Modal */}
      {showReplyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowReplyModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Compose Reply</h3>
                <button onClick={() => setShowReplyModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Contact selector */}
                {uniqueContacts.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <select
                      value={selectedContact}
                      onChange={(e) => setSelectedContact(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      {uniqueContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name ? `${contact.name} <${contact.email}>` : contact.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Re: Previous subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Hi,&#10;&#10;..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sendImmediately"
                    checked={sendImmediately}
                    onChange={(e) => setSendImmediately(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="sendImmediately" className="text-sm text-gray-700">
                    Send immediately (otherwise save as draft)
                  </label>
                </div>

                <div className="text-xs text-gray-500">
                  <p>From: Sagar &lt;sagar@callsphere.tech&gt;</p>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 flex justify-end gap-3">
                <button
                  onClick={() => setShowReplyModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replySubject || !replyBody}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {sendingReply ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : sendImmediately ? (
                    <Send className="w-4 h-4" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {sendingReply ? 'Sending...' : sendImmediately ? 'Send Now' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
