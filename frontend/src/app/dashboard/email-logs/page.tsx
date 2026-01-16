'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Clock, Send, XCircle, Terminal, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface EmailEvent {
  id: string;
  eventType: string;
  providerMessageId?: string;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

interface EmailLog {
  id: string;
  subject: string;
  bodyText: string;
  footerText: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    email: string;
    name?: string;
  };
  business: {
    id: string;
    canonicalName: string;
  };
  events: EmailEvent[];
}

export default function EmailLogsPage() {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/email-logs?page=${page}`);
      const data = await res.json();
      setEmails(data.emails || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Error fetching email logs:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'BOUNCED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'COMPLAINT':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sent</span>;
      case 'BOUNCED':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Bounced</span>;
      case 'COMPLAINT':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">Complaint</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'SENT':
        return <Send className="w-4 h-4 text-green-500" />;
      case 'BOUNCE':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'COMPLAINT':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'OPEN':
        return <Mail className="w-4 h-4 text-blue-500" />;
      case 'CLICK':
        return <CheckCircle className="w-4 h-4 text-purple-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatEventPayload = (payload: Record<string, unknown>) => {
    if (!payload || Object.keys(payload).length === 0) return null;
    return JSON.stringify(payload, null, 2);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Logs</h1>
        <button onClick={fetchLogs} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="card">
        <p className="text-sm text-gray-500 mb-4">
          View logs for sent emails. Click on any email to see detailed event history.
        </p>

        {emails.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No sent emails yet.</p>
            <p className="text-sm mt-1">Emails will appear here after they are sent.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <div
                key={email.id}
                className={`border rounded-lg overflow-hidden transition-all ${
                  expandedId === email.id ? 'border-blue-300 shadow-md' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Email Header Row */}
                <div
                  className={`flex items-center gap-4 p-4 cursor-pointer ${
                    expandedId === email.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => toggleExpand(email.id)}
                >
                  <div className="flex-shrink-0">
                    {getStatusIcon(email.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 truncate">{email.subject}</h3>
                      {getStatusBadge(email.status)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>To: {email.contact.email}</span>
                      <span className="text-gray-300">|</span>
                      <span>{email.business.canonicalName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="text-gray-500">
                        {format(new Date(email.updatedAt), 'MMM d, yyyy')}
                      </div>
                      <div className="text-gray-400">
                        {format(new Date(email.updatedAt), 'HH:mm:ss')}
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {expandedId === email.id ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Logs Section */}
                {expandedId === email.id && (
                  <div className="border-t border-gray-200">
                    {/* Email Content Preview */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Email Content</h4>
                      <div className="bg-white rounded border border-gray-200 p-3 text-sm text-gray-600">
                        <p className="whitespace-pre-wrap">{email.bodyText}</p>
                        {email.footerText && (
                          <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                            {email.footerText}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Event Timeline */}
                    <div className="p-4 bg-gray-900">
                      <div className="flex items-center gap-2 mb-3">
                        <Terminal className="w-4 h-4 text-green-400" />
                        <h4 className="text-sm font-medium text-white">Event Log</h4>
                        <span className="text-xs text-gray-400">({email.events.length} events)</span>
                      </div>

                      {email.events.length === 0 ? (
                        <div className="text-gray-400 text-sm py-4 text-center">
                          No events recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-2 font-mono text-xs">
                          {email.events.map((event, index) => (
                            <div key={event.id} className="flex gap-3">
                              <span className="text-gray-500 flex-shrink-0">
                                [{format(new Date(event.createdAt), 'HH:mm:ss')}]
                              </span>
                              <span className="flex-shrink-0">
                                {getEventIcon(event.eventType)}
                              </span>
                              <div className="flex-1">
                                <span className={`font-medium ${
                                  event.eventType === 'SENT' ? 'text-green-400' :
                                  event.eventType === 'BOUNCE' ? 'text-red-400' :
                                  event.eventType === 'COMPLAINT' ? 'text-orange-400' :
                                  'text-gray-300'
                                }`}>
                                  {event.eventType}
                                </span>
                                {event.providerMessageId && (
                                  <span className="text-gray-500 ml-2">
                                    ID: {event.providerMessageId}
                                  </span>
                                )}
                                {event.eventPayload && Object.keys(event.eventPayload).length > 0 && (
                                  <pre className="mt-1 text-gray-400 overflow-x-auto">
                                    {formatEventPayload(event.eventPayload)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6 pt-4 border-t">
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
      </div>
    </div>
  );
}
