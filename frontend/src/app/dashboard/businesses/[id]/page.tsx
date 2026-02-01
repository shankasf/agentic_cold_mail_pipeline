'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Mail, FileText, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface BusinessDetail {
  id: string;
  canonicalName: string;
  website?: string;
  industryGuess?: string;
  location?: string;
  createdAt: string;
  contacts: Array<{
    id: string;
    email: string;
    name?: string;
    role?: string;
    sourceConfidence: number;
  }>;
  evidence: Array<{
    id: string;
    evidenceType: string;
    extractedValue: string;
    confidence: number;
    chunk: { textContent: string };
    upload: { id: string; filename: string };
  }>;
  emailDrafts: Array<{
    id: string;
    subject: string;
    status: string;
    confidenceScore: number;
    contact: { email: string };
  }>;
}

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/businesses/${params.id}`)
        .then((res) => {
          if (!res.ok) throw new Error('Business not found');
          return res.json();
        })
        .then((data) => {
          // Ensure required arrays exist to prevent crashes
          setBusiness({
            ...data,
            contacts: data.contacts || [],
            evidence: data.evidence || [],
            emailDrafts: data.emailDrafts || [],
          });
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!business) {
    return <div className="card text-center py-8">Company not found</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            {business.canonicalName}
          </h1>
          {business.website && (
            <a
              href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:underline flex items-center gap-1"
            >
              {business.website} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Business Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Company Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Industry</p>
                <p className="font-medium">{business.industryGuess || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{business.location || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{format(new Date(business.createdAt), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Contacts</p>
                <p className="font-medium">{business.contacts.length}</p>
              </div>
            </div>
          </div>

          {/* Evidence */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              <FileText className="w-5 h-5 inline mr-2" />
              Insights ({business.evidence.length})
            </h2>
            {business.evidence.length > 0 ? (
              <div className="space-y-4">
                {business.evidence.map((ev) => (
                  <div key={ev.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="badge-info text-xs">{ev.evidenceType.replace('_', ' ')}</span>
                      <span className="text-sm text-gray-500">{ev.confidence}% quality</span>
                    </div>
                    <p className="font-medium text-gray-900 mb-2">{ev.extractedValue}</p>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      Source ({ev.upload?.filename || 'Unknown'}): {ev.chunk?.textContent?.substring(0, 200) || 'N/A'}...
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No insights recorded</p>
            )}
          </div>

          {/* Email Drafts */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              <Mail className="w-5 h-5 inline mr-2" />
              Email Drafts ({business.emailDrafts.length})
            </h2>
            {business.emailDrafts.length > 0 ? (
              <div className="space-y-3">
                {business.emailDrafts.map((email) => (
                  <Link
                    key={email.id}
                    href={`/dashboard/emails/${email.id}`}
                    className="block border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-500">{email.contact.email}</span>
                      <span className={`badge-${email.status === 'APPROVED' || email.status === 'SENT' ? 'success' : email.status === 'NEEDS_REVIEW' ? 'warning' : 'info'}`}>
                        {email.status === 'APPROVED' ? 'Ready' : email.status === 'NEEDS_REVIEW' ? 'Review' : email.status === 'BOUNCED' ? 'Failed' : email.status === 'COMPLAINT' ? 'Spam' : email.status}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{email.subject}</p>
                    <p className="text-sm text-gray-500">Quality: {email.confidenceScore}%</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No emails generated yet</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Contacts */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              <Mail className="w-5 h-5 inline mr-2" />
              Contacts
            </h2>
            {business.contacts.length > 0 ? (
              <div className="space-y-3">
                {business.contacts.map((contact) => (
                  <div key={contact.id} className="border rounded-lg p-3">
                    <p className="font-medium text-gray-900">{contact.email}</p>
                    {contact.name && <p className="text-sm text-gray-600">{contact.name}</p>}
                    {contact.role && <p className="text-xs text-gray-500">{contact.role}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Quality: {contact.sourceConfidence}%
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No contacts found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
