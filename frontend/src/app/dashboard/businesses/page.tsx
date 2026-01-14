'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Mail, FileText, ExternalLink, Search } from 'lucide-react';
import { format } from 'date-fns';

interface Business {
  id: string;
  canonicalName: string;
  website?: string;
  industryGuess?: string;
  location?: string;
  createdAt: string;
  _count: {
    contacts: number;
    evidence: number;
    emailDrafts: number;
  };
}

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchBusinesses = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);

        const res = await fetch(`/api/businesses?${params}`);
        const data = await res.json();
        setBusinesses(data.businesses || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (error) {
        console.error('Error fetching businesses:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchBusinesses, 300);
    return () => clearTimeout(debounce);
  }, [page, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
      </div>

      <div className="card mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or website..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input pl-10"
            />
          </div>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industry</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacts</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Points</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Drafts</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {businesses.map((business) => (
                    <tr key={business.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/businesses/${business.id}`} className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900 hover:text-primary-600">
                            {business.canonicalName}
                          </span>
                        </Link>
                        {business.website && (
                          <a
                            href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1 mt-1"
                          >
                            {business.website}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {business.industryGuess || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {business.location || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <Mail className="w-4 h-4" />
                          {business._count.contacts}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <FileText className="w-4 h-4" />
                          {business._count.evidence}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {business._count.emailDrafts}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {format(new Date(business.createdAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                  {businesses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No businesses found.
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
