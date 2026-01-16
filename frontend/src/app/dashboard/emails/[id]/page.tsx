'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, CheckCircle, AlertTriangle, Send, Trash2 } from 'lucide-react';

interface EmailDetail {
  id: string;
  subject: string;
  bodyText: string;
  footerText: string;
  confidenceScore: number;
  deliverabilityScore: number;
  spamFlags: string[];
  personalizationTokens: {
    facts_used?: Array<{ type: string; value: string; confidence: number }>;
    pain_point?: string;
    industry?: string;
  };
  status: string;
  fromName: string;
  fromEmail: string;
  business: {
    id: string;
    canonicalName: string;
    website?: string;
    evidence?: Array<{
      evidenceType: string;
      extractedValue: string;
      confidence: number;
      chunk: { textContent: string };
    }>;
  };
  contact: {
    email: string;
    name?: string;
    role?: string;
  };
}

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const res = await fetch(`/api/emails/${params.id}`);
        if (!res.ok) throw new Error('Email not found');
        const data = await res.json();
        setEmail(data);
        setEditSubject(data.subject);
        setEditBody(data.bodyText);
      } catch (error) {
        console.error('Error fetching email:', error);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) fetchEmail();
  }, [params.id]);

  const handleSave = async () => {
    if (!email) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${email.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: editSubject, bodyText: editBody }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setEmail({ ...email, ...updated });
      setEditing(false);
    } catch (error) {
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!email) return;
    try {
      const res = await fetch(`/api/emails/${email.id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setEmail({ ...email, status: 'APPROVED' });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve');
    }
  };

  const handleMarkReview = async () => {
    if (!email) return;
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'needs_review' }),
      });
      setEmail({ ...email, status: 'NEEDS_REVIEW' });
    } catch (error) {
      alert('Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!email) return;
    if (!confirm('Are you sure you want to delete this email?')) return;
    try {
      const res = await fetch('/api/emails/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: [email.id] }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      router.push('/dashboard/emails');
    } catch (error) {
      alert('Failed to delete email');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!email) {
    return <div className="card text-center py-8">Email not found</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Email Details</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Email Preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Email Preview</h2>
              <div className="flex gap-2">
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
                    Edit
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
                <a
                  href={`/api/exports/pdf/${email.id}`}
                  target="_blank"
                  className="btn-secondary text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> PDF
                </a>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-sm text-gray-500 mb-2">
                <span className="font-medium">From:</span> {email.fromName} &lt;{email.fromEmail}&gt;
              </div>
              <div className="text-sm text-gray-500 mb-2">
                <span className="font-medium">To:</span> {email.contact.email}
                {email.contact.name && ` (${email.contact.name})`}
              </div>
              <div className="text-sm text-gray-500 mb-4">
                <span className="font-medium">Business:</span>{' '}
                <Link href={`/dashboard/businesses/${email.business.id}`} className="text-primary-600 hover:underline">
                  {email.business.canonicalName}
                </Link>
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="label">Subject</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Body</label>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={8}
                      className="input font-mono text-sm"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-medium text-gray-900 mb-4">{email.subject}</div>
                  <div className="whitespace-pre-wrap text-gray-700 mb-4">{email.bodyText}</div>
                  <div className="border-t pt-4 text-sm text-gray-500 whitespace-pre-wrap">
                    {email.footerText}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Evidence Panel */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Evidence Used</h2>
            {(email.business.evidence?.length ?? 0) > 0 ? (
              <div className="space-y-4">
                {email.business.evidence!.slice(0, 5).map((ev, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="badge-info text-xs">{ev.evidenceType.replace('_', ' ')}</span>
                      <span className="text-sm text-gray-500">{ev.confidence}% confidence</span>
                    </div>
                    <p className="font-medium text-gray-900 mb-2">{ev.extractedValue}</p>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      Source: {ev.chunk.textContent.substring(0, 200)}...
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No evidence available</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Status & Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Status</h2>
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-4 ${
              email.status === 'APPROVED' || email.status === 'SENT'
                ? 'bg-green-100 text-green-800'
                : email.status === 'NEEDS_REVIEW'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {email.status === 'APPROVED' || email.status === 'SENT' ? (
                <CheckCircle className="w-4 h-4" />
              ) : email.status === 'NEEDS_REVIEW' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : null}
              {email.status.replace('_', ' ')}
            </div>

            <div className="space-y-2">
              {['DRAFT', 'NEEDS_REVIEW'].includes(email.status) && (
                <button onClick={handleApprove} className="btn-primary w-full flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
              )}
              {email.status === 'DRAFT' && (
                <button onClick={handleMarkReview} className="btn-secondary w-full">
                  Mark for Review
                </button>
              )}
              <button onClick={handleDelete} className="btn-danger w-full flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>

          {/* Scores */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Scores</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Confidence</span>
                  <span className={email.confidenceScore >= 70 ? 'text-green-600' : 'text-yellow-600'}>
                    {email.confidenceScore}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${email.confidenceScore >= 70 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${email.confidenceScore}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Deliverability</span>
                  <span className={email.deliverabilityScore >= 70 ? 'text-green-600' : 'text-yellow-600'}>
                    {email.deliverabilityScore}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${email.deliverabilityScore >= 70 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${email.deliverabilityScore}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Spam Flags */}
          {email.spamFlags.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Spam Flags</h2>
              <ul className="space-y-2">
                {email.spamFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Personalization */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Personalization</h2>
            {email.personalizationTokens.facts_used && email.personalizationTokens.facts_used.length > 0 ? (
              <ul className="space-y-2">
                {email.personalizationTokens.facts_used.map((fact, idx) => (
                  <li key={idx} className="text-sm">
                    <span className="font-medium text-gray-900">{fact.type}:</span>{' '}
                    <span className="text-gray-600">{fact.value}</span>
                    <span className="text-gray-400 ml-2">({fact.confidence}%)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No personalization data</p>
            )}
            {email.personalizationTokens.pain_point && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm">
                  <span className="font-medium text-gray-900">Pain Point:</span>{' '}
                  <span className="text-gray-600">{email.personalizationTokens.pain_point}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
