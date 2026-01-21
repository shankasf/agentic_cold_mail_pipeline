'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, Mail, Building2, ChevronRight, Clock, Send, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton, ErrorState } from '@/components/LoadingStates';

interface Thread {
  businessId: string;
  businessName: string;
  industry?: string;
  emailCount: number;
  latestEmail: {
    id: string;
    subject: string;
    status: string;
    createdAt: string;
    sentAt?: string;
  } | null;
  primaryContact: {
    email: string;
    name?: string;
  } | null;
}

export default function ThreadsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      const res = await fetch(`/api/emails/threads?${params}`);
      if (!res.ok) throw new Error('Failed to load threads');
      const data = await res.json();
      setThreads(data.threads || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'APPROVED':
        return <Send className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Failed to load threads"
        message={error}
        onRetry={fetchThreads}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/emails" className="text-gray-500 hover:text-gray-700">
            <Mail className="w-5 h-5" />
          </Link>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        </div>
      </div>

      <div className="card mb-6">
        <p className="text-sm text-gray-600">
          View all email conversations grouped by company. Click on a company to see the full conversation thread.
        </p>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <>
          {/* Thread list */}
          <div className="space-y-3">
            {threads.map((thread) => (
              <Link
                key={thread.businessId}
                href={`/dashboard/emails/threads/${thread.businessId}`}
                className="card block hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary-100 p-3 rounded-lg">
                      <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{thread.businessName}</h3>
                      {thread.industry && (
                        <p className="text-sm text-gray-500">{thread.industry}</p>
                      )}
                      {thread.primaryContact && (
                        <p className="text-sm text-gray-600 mt-1">
                          {thread.primaryContact.name ? `${thread.primaryContact.name} - ` : ''}
                          {thread.primaryContact.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{thread.emailCount}</span>
                        <span className="text-sm text-gray-500">emails</span>
                      </div>
                      {thread.latestEmail && (
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          {getStatusIcon(thread.latestEmail.status)}
                          <span>
                            {thread.latestEmail.sentAt
                              ? `Sent ${format(new Date(thread.latestEmail.sentAt), 'MMM d')}`
                              : format(new Date(thread.latestEmail.createdAt), 'MMM d')}
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {thread.latestEmail && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600 line-clamp-1">
                      <span className="font-medium">Latest:</span> {thread.latestEmail.subject}
                    </p>
                  </div>
                )}
              </Link>
            ))}

            {threads.length === 0 && (
              <div className="card text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No conversations yet</h3>
                <p className="text-gray-500">
                  Start sending emails to create conversation threads.
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
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
