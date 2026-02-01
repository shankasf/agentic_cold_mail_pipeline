'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, CheckCircle, AlertCircle, Clock, Send, Download, Loader2, Calendar, Reply, MessageSquare, X, Trash2, Eye, EyeOff, MousePointerClick, PackageCheck, MessageCircle, Search, ChevronDown, ChevronUp, Filter, RotateCcw, Sparkles, Snowflake, MailOpen, Ban, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton, ErrorState } from '@/components/LoadingStates';
import CampaignFilter from '@/components/CampaignFilter';

interface TrackingStatus {
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  complained: boolean;
  replied: boolean;
}

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
  trackingStatus?: TrackingStatus;
}

const statusOptions = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'NEEDS_REVIEW', label: 'Review' },
  { value: 'APPROVED', label: 'Ready' },
  { value: 'SENT', label: 'Sent' },
  { value: 'BOUNCED', label: 'Failed' },
  { value: 'COMPLAINT', label: 'Spam' },
];

// Engagement filter buttons with icons and colors
const engagementFilters = [
  { value: '', label: 'All', icon: 'Mail', color: 'gray' },
  { value: 'delivered', label: 'Delivered', icon: 'PackageCheck', color: 'green' },
  { value: 'opened', label: 'Opened', icon: 'Eye', color: 'blue' },
  { value: 'clicked', label: 'Clicked', icon: 'MousePointerClick', color: 'purple' },
  { value: 'replied', label: 'Replied', icon: 'MessageCircle', color: 'indigo' },
  { value: 'bounced', label: 'Bounced', icon: 'AlertCircle', color: 'red' },
  { value: 'not_opened', label: 'Not Opened', icon: 'EyeOff', color: 'orange' },
  { value: 'engaged', label: 'Engaged', icon: 'Sparkles', color: 'emerald' },
  { value: 'not_engaged', label: 'Cold', icon: 'Snowflake', color: 'slate' },
];

function EmailsPageContent() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId');
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [page, setPage] = useState(1);
  // New filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingFilter, setTrackingFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [minDeliverability, setMinDeliverability] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [senderIdentities, setSenderIdentities] = useState<{email: string; displayName: string}[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState('');
  const [followUpBody, setFollowUpBody] = useState('');
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [showAIFollowUpModal, setShowAIFollowUpModal] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerationLogs, setAiGenerationLogs] = useState<Array<{ id: string; message: string; type: string; timestamp: Date }>>([]);
  const [aiGenerationStats, setAiGenerationStats] = useState({ total: 0, completed: 0, successful: 0, failed: 0 });
  const [aiGenerationStatus, setAiGenerationStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [generatedEmailIds, setGeneratedEmailIds] = useState<string[]>([]);
  const [sendingFollowUps, setSendingFollowUps] = useState(false);
  const [sendResult, setSendResult] = useState<{ queued: number; distribution?: Record<string, number> } | null>(null);

  // Fetch sender identities for filter dropdown
  useEffect(() => {
    async function fetchIdentities() {
      try {
        const res = await fetch('/api/ses-identities');
        if (res.ok) {
          const data = await res.json();
          setSenderIdentities(data.identities?.map((i: { emailAddress: string; displayName: string }) => ({
            email: i.emailAddress,
            displayName: i.displayName || i.emailAddress,
          })) || []);
        }
      } catch {
        // Ignore errors
      }
    }
    fetchIdentities();
  }, []);

  // Subscribe to real-time email event updates via SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      eventSource = new EventSource('/api/emails/events/stream');

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'email_event' && data.emailId) {
            // Update the email's status and tracking status in real-time
            setEmails((prevEmails) =>
              prevEmails.map((email) => {
                if (email.id === data.emailId) {
                  const newTrackingStatus = { ...email.trackingStatus } as TrackingStatus;
                  let newEmailStatus = email.status;
                  let newSentAt = email.sentAt;

                  switch (data.eventType) {
                    case 'SENT':
                      newEmailStatus = 'SENT';
                      newSentAt = new Date().toISOString();
                      break;
                    case 'DELIVERED':
                      newTrackingStatus.delivered = true;
                      break;
                    case 'OPEN':
                      newTrackingStatus.opened = true;
                      break;
                    case 'CLICK':
                      newTrackingStatus.clicked = true;
                      break;
                    case 'BOUNCE':
                      newTrackingStatus.bounced = true;
                      newEmailStatus = 'BOUNCED';
                      break;
                    case 'COMPLAINT':
                      newTrackingStatus.complained = true;
                      newEmailStatus = 'COMPLAINT';
                      break;
                    case 'REPLY':
                      newTrackingStatus.replied = true;
                      break;
                  }
                  return {
                    ...email,
                    status: newEmailStatus,
                    sentAt: newSentAt,
                    trackingStatus: newTrackingStatus,
                  };
                }
                return email;
              })
            );
          }
        } catch {
          // Ignore parse errors for heartbeat messages
        }
      };

      eventSource.onerror = () => {
        setSseConnected(false);
        eventSource?.close();
        // Reconnect after 5 seconds
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (campaignId) params.set('campaignId', campaignId);
      if (status !== 'ALL') params.set('status', status);
      if (selectedDate) params.set('date', selectedDate);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (searchQuery) params.set('search', searchQuery);
      if (trackingFilter) params.set('tracking', trackingFilter);
      if (industryFilter) params.set('industry', industryFilter);
      if (minConfidence) params.set('minConfidence', minConfidence);
      if (minDeliverability) params.set('minDeliverability', minDeliverability);
      if (senderFilter) params.set('fromEmail', senderFilter);

      const res = await fetch(`/api/emails?${params}`);
      if (!res.ok) throw new Error('Failed to load emails');
      const data = await res.json();
      setEmails(data.emails || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalEmails(data.pagination?.total || 0);
      // Reset all pages selection when filters change
      setAllPagesSelected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [page, status, selectedDate, dateFrom, dateTo, campaignId, searchQuery, trackingFilter, industryFilter, minConfidence, minDeliverability, senderFilter]);

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
        return <span className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Ready</span>;
      case 'SENT':
        return <span className="badge-success"><Send className="w-3 h-3 mr-1" />Sent</span>;
      case 'BOUNCED':
        return <span className="badge-danger">Failed</span>;
      case 'COMPLAINT':
        return <span className="badge-danger">Spam</span>;
      default:
        return <span className="badge-gray">{status}</span>;
    }
  };

  // Render tracking status indicators for sent emails
  const renderTrackingStatus = (email: EmailDraft) => {
    if (email.status !== 'SENT' || !email.trackingStatus) {
      return null;
    }

    const { delivered, opened, clicked, replied, bounced, complained } = email.trackingStatus;

    return (
      <div className="flex flex-wrap items-center gap-1">
        {delivered && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
            Delivered
          </span>
        )}
        {opened && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
            Opened
          </span>
        )}
        {clicked && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
            Clicked
          </span>
        )}
        {replied && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">
            Replied
          </span>
        )}
        {bounced && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
            Bounced
          </span>
        )}
        {complained && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
            Spam
          </span>
        )}
        {!delivered && !opened && !clicked && !replied && !bounced && !complained && (
          <span className="text-xs text-gray-400">Pending</span>
        )}
      </div>
    );
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Approve ${selectedIds.length} emails?`)) return;

    let approved = 0;
    const errors: string[] = [];

    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/emails/${id}/approve`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          approved++;
        } else {
          errors.push(data.error || 'Unknown error');
        }
      } catch {
        errors.push('Network error');
      }
    }

    if (errors.length > 0) {
      alert(`Approved ${approved} email(s). ${errors.length} failed:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`);
    } else {
      alert(`Approved ${approved} email(s)`);
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
        throw new Error(data.error?.message || data.error || 'Failed to send emails');
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

  const handleAIFollowUp = async () => {
    if (selectedIds.length === 0) return;

    setShowAIFollowUpModal(true);
    setAiGenerating(true);
    setAiGenerationLogs([]);
    setAiGenerationStats({ total: selectedIds.length, completed: 0, successful: 0, failed: 0 });
    setAiGenerationStatus('running');

    try {
      // Start AI generation
      const response = await fetch('/api/emails/follow-up/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start AI generation');
      }

      const { streamUrl } = await response.json();

      // Connect to SSE stream
      const eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'log' || data.type === 'email_generated' || data.type === 'email_failed') {
            setAiGenerationLogs(prev => [...prev, {
              id: `${Date.now()}-${Math.random()}`,
              message: data.message || '',
              type: data.logType || data.type || 'info',
              timestamp: new Date(),
            }]);
          }

          if (data.stats) {
            setAiGenerationStats(data.stats);
          }

          if (data.type === 'complete') {
            setAiGenerationStatus('completed');
            setAiGenerating(false);
            // Capture generated email IDs for sending
            if (data.completedEmails && Array.isArray(data.completedEmails)) {
              setGeneratedEmailIds(data.completedEmails);
              setAiGenerationLogs(prev => [...prev, {
                id: `${Date.now()}-ready`,
                message: `${data.completedEmails.length} emails ready to send`,
                type: 'info',
                timestamp: new Date(),
              }]);
            }
            eventSource.close();
          }

          if (data.type === 'error') {
            setAiGenerationStatus('error');
            setAiGenerating(false);
            eventSource.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        setAiGenerationStatus('error');
        setAiGenerating(false);
        eventSource.close();
      };

    } catch (err) {
      setAiGenerationLogs(prev => [...prev, {
        id: `${Date.now()}`,
        message: err instanceof Error ? err.message : 'Unknown error',
        type: 'error',
        timestamp: new Date(),
      }]);
      setAiGenerationStatus('error');
      setAiGenerating(false);
    }
  };

  // Send all generated follow-up emails with even distribution
  const sendGeneratedFollowUps = async () => {
    if (generatedEmailIds.length === 0) return;

    setSendingFollowUps(true);
    setAiGenerationLogs(prev => [...prev, {
      id: `${Date.now()}-sending`,
      message: `Approving and sending ${generatedEmailIds.length} follow-up emails...`,
      type: 'info',
      timestamp: new Date(),
    }]);

    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailIds: generatedEmailIds,
          approveFirst: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send emails');
      }

      setSendResult({
        queued: result.queued,
        distribution: result.identityDistribution,
      });

      setAiGenerationLogs(prev => [...prev, {
        id: `${Date.now()}-sent`,
        message: `Successfully queued ${result.queued} emails for sending!`,
        type: 'success',
        timestamp: new Date(),
      }]);

      // Show distribution info
      if (result.identityDistribution) {
        const distInfo = Object.entries(result.identityDistribution)
          .map(([identity, count]) => `${identity}: ${count}`)
          .join(', ');
        setAiGenerationLogs(prev => [...prev, {
          id: `${Date.now()}-dist`,
          message: `Distribution across inboxes: ${distInfo}`,
          type: 'info',
          timestamp: new Date(),
        }]);
      }

    } catch (err) {
      setAiGenerationLogs(prev => [...prev, {
        id: `${Date.now()}-error`,
        message: `Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error',
        timestamp: new Date(),
      }]);
    } finally {
      setSendingFollowUps(false);
    }
  };

  const closeAIFollowUpModal = () => {
    setShowAIFollowUpModal(false);
    if (aiGenerationStatus === 'completed') {
      setSelectedIds([]);
      fetchEmails();
    }
    setAiGenerationStatus('idle');
    setAiGenerationLogs([]);
    setGeneratedEmailIds([]);
    setSendResult(null);
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
        throw new Error(data.error?.message || data.error || 'Failed to create follow-up');
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
    if (trackingFilter) params.set('tracking', trackingFilter);
    if (industryFilter) params.set('industry', industryFilter);
    window.open(`/api/exports/csv?${params}`, '_blank');
  };

  // Check if any filters are active
  const hasActiveFilters = status !== 'ALL' || selectedDate || dateFrom || dateTo || searchQuery || trackingFilter || industryFilter || minConfidence || minDeliverability || senderFilter;

  // Clear all filters
  const clearAllFilters = () => {
    setStatus('ALL');
    setSelectedDate('');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setTrackingFilter('');
    setIndustryFilter('');
    setMinConfidence('');
    setMinDeliverability('');
    setSenderFilter('');
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    // If manually toggling, we're no longer in "all pages" mode
    setAllPagesSelected(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === emails.length && emails.length > 0) {
      setSelectedIds([]);
      setAllPagesSelected(false);
    } else {
      setSelectedIds(emails.map((e) => e.id));
    }
  };

  const selectAllPages = async () => {
    // Fetch all email IDs matching current filters
    try {
      const params = new URLSearchParams({ limit: '10000' }); // Large limit to get all
      if (campaignId) params.set('campaignId', campaignId);
      if (status !== 'ALL') params.set('status', status);
      if (selectedDate) params.set('date', selectedDate);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (searchQuery) params.set('search', searchQuery);
      if (trackingFilter) params.set('tracking', trackingFilter);
      if (industryFilter) params.set('industry', industryFilter);
      if (minConfidence) params.set('minConfidence', minConfidence);
      if (minDeliverability) params.set('minDeliverability', minDeliverability);
      if (senderFilter) params.set('fromEmail', senderFilter);

      const res = await fetch(`/api/emails?${params}`);
      if (!res.ok) throw new Error('Failed to fetch all emails');
      const data = await res.json();

      const allIds = (data.emails || []).map((e: EmailDraft) => e.id);
      setSelectedIds(allIds);
      setAllPagesSelected(true);
    } catch {
      alert('Failed to select all emails');
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setAllPagesSelected(false);
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
        throw new Error(data.error?.message || data.error || 'Failed to delete emails');
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
        throw new Error(data.error?.message || data.error || 'Failed to delete email');
      }

      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete email');
    }
  };

  const handleApproveEmail = async (emailId: string) => {
    try {
      const res = await fetch(`/api/emails/${emailId}/approve`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to approve email');
      }

      fetchEmails();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve email');
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
        throw new Error(data.error?.message || data.error || 'Failed to send email');
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Emails</h1>
          <CampaignFilter />
          {sseConnected && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600" title="Real-time updates active">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Live
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {selectedIds.length > 0 && (
            <>
              <button onClick={handleBulkApprove} className="btn-primary text-sm sm:text-base">
                Approve ({selectedIds.length})
              </button>
              <button onClick={handleAIFollowUp} className="btn-secondary flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-purple-600 text-sm sm:text-base">
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">AI Follow-Up</span>
                <span className="sm:hidden">AI</span> ({selectedIds.length})
              </button>
              <button onClick={handleFollowUp} className="btn-secondary flex items-center gap-1 sm:gap-2 bg-purple-600 hover:bg-purple-700 text-white border-purple-600 text-sm sm:text-base">
                <Reply className="w-4 h-4" />
                <span className="hidden sm:inline">Manual</span> ({selectedIds.length})
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
            <span className="hidden sm:inline">Conversations</span>
            <span className="sm:hidden">Convos</span>
          </Link>
          <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6 space-y-4">
        {/* Primary row: Search and Status */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by subject, email, name, or business..."
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status filters - scrollable on mobile */}
          <div className="flex gap-2 overflow-x-auto min-w-0">
            {statusOptions.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setStatus(s.value === 'ALL' ? 'ALL' : s.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  status === s.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Engagement Filters Row */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500 mr-1">Engagement:</span>
          {engagementFilters.map((filter) => {
            const isActive = trackingFilter === filter.value;
            const colorClasses: Record<string, string> = {
              gray: isActive ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              green: isActive ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100',
              blue: isActive ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
              purple: isActive ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100',
              indigo: isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
              red: isActive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100',
              orange: isActive ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100',
              emerald: isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
              slate: isActive ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            };

            const IconComponent = {
              Mail, PackageCheck, Eye, MousePointerClick, MessageCircle, AlertCircle, EyeOff, Sparkles, Snowflake
            }[filter.icon] || Mail;

            return (
              <button
                key={filter.value}
                onClick={() => {
                  setTrackingFilter(filter.value);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${colorClasses[filter.color]}`}
              >
                <IconComponent className="w-3.5 h-3.5" />
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Secondary row: Date Range, Sender, Industry, Advanced */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setSelectedDate(''); // Clear single date if using range
                setPage(1);
              }}
              placeholder="From"
              title="From date"
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-32"
            />
            <span className="text-gray-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setSelectedDate(''); // Clear single date if using range
                setPage(1);
              }}
              placeholder="To"
              title="To date"
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-32"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="text-gray-400 hover:text-gray-600"
                title="Clear date range"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sender Identity Filter */}
          {senderIdentities.length > 0 && (
            <select
              value={senderFilter}
              onChange={(e) => {
                setSenderFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            >
              <option value="">All Senders</option>
              {senderIdentities.map((identity) => (
                <option key={identity.email} value={identity.email}>
                  {identity.displayName}
                </option>
              ))}
            </select>
          )}

          {/* Industry Filter */}
          <input
            type="text"
            value={industryFilter}
            onChange={(e) => {
              setIndustryFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Industry..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-28"
          />

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Filter className="w-4 h-4" />
            Advanced
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>

        {/* Advanced Filters (Collapsible) */}
        {showAdvanced && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
              {/* Min Confidence */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Min Quality:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={minConfidence}
                  onChange={(e) => {
                    setMinConfidence(e.target.value);
                    setPage(1);
                  }}
                  placeholder="0"
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>

              {/* Min Deliverability */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Min Safety:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={minDeliverability}
                  onChange={(e) => {
                    setMinDeliverability(e.target.value);
                    setPage(1);
                  }}
                  placeholder="0"
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>

              {/* Campaign Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Campaign:</label>
                <CampaignFilter />
              </div>
            </div>
          </div>
        )}

        {/* Active filters summary */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">Active filters:</span>
            {status !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                Status: {statusOptions.find(s => s.value === status)?.label}
                <button onClick={() => { setStatus('ALL'); setPage(1); }} className="hover:text-primary-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {trackingFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                Engagement: {engagementFilters.find(t => t.value === trackingFilter)?.label}
                <button onClick={() => { setTrackingFilter(''); setPage(1); }} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedDate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                Date: {format(new Date(selectedDate), 'MMM d, yyyy')}
                <button onClick={() => { setSelectedDate(''); setPage(1); }} className="hover:text-green-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                Range: {dateFrom ? format(new Date(dateFrom), 'MMM d') : '...'} → {dateTo ? format(new Date(dateTo), 'MMM d') : '...'}
                <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="hover:text-green-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {senderFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs rounded-full">
                From: {senderIdentities.find(i => i.email === senderFilter)?.displayName || senderFilter}
                <button onClick={() => { setSenderFilter(''); setPage(1); }} className="hover:text-cyan-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                Search: &quot;{searchQuery.length > 15 ? searchQuery.slice(0, 15) + '...' : searchQuery}&quot;
                <button onClick={() => { setSearchQuery(''); setPage(1); }} className="hover:text-purple-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {industryFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                Industry: {industryFilter}
                <button onClick={() => { setIndustryFilter(''); setPage(1); }} className="hover:text-orange-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minConfidence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">
                Quality ≥ {minConfidence}%
                <button onClick={() => { setMinConfidence(''); setPage(1); }} className="hover:text-teal-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minDeliverability && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                Safety ≥ {minDeliverability}%
                <button onClick={() => { setMinDeliverability(''); setPage(1); }} className="hover:text-indigo-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Selection Bar */}
      {!loading && emails.length > 0 && (
        <div className="card mb-4 py-3 bg-gray-50">
          <div className="flex flex-wrap items-center gap-3">
            {/* Select page checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === emails.length && emails.length > 0}
                onChange={toggleSelectAll}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                This page ({emails.length})
              </span>
            </label>

            {/* Divider */}
            <span className="text-gray-300">|</span>

            {/* Select ALL emails button */}
            {totalEmails > emails.length && !allPagesSelected && (
              <button
                onClick={selectAllPages}
                className="text-sm bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded-md font-medium"
              >
                Select All {totalEmails} Emails
              </button>
            )}

            {allPagesSelected && (
              <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                All {totalEmails} emails selected
              </span>
            )}

            {/* Selection count and clear */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-gray-600">
                  {selectedIds.length} selected
                </span>
                <button
                  onClick={clearSelection}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="lg:hidden space-y-4">
            {/* Mobile Select All Header */}
            {emails.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-1 py-2 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === emails.length && emails.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600">Page ({emails.length})</span>
                </label>

                {totalEmails > emails.length && !allPagesSelected && (
                  <button
                    onClick={selectAllPages}
                    className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded font-medium"
                  >
                    All {totalEmails}
                  </button>
                )}

                {allPagesSelected && (
                  <span className="text-xs text-green-600 font-medium">
                    All {totalEmails} selected
                  </span>
                )}

                {selectedIds.length > 0 && (
                  <button
                    onClick={clearSelection}
                    className="text-xs text-red-600 hover:text-red-700 ml-auto"
                  >
                    Clear ({selectedIds.length})
                  </button>
                )}
              </div>
            )}
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
                        Quality: {email.confidenceScore}%
                      </span>
                      <span className={email.deliverabilityScore >= 70 ? 'text-green-600' : 'text-yellow-600'}>
                        Safety: {email.deliverabilityScore}%
                      </span>
                      <span className="text-gray-500">
                        {format(new Date(email.createdAt), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    {email.status === 'SENT' && (
                      <div className="mt-2">
                        {renderTrackingStatus(email)}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      {['DRAFT', 'NEEDS_REVIEW'].includes(email.status) && (
                        <button
                          onClick={() => handleApproveEmail(email.id)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                      )}
                      {email.status === 'APPROVED' && (
                        <button
                          onClick={() => handleSendEmail(email)}
                          disabled={sendingId === email.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {sendingId === email.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          Send
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Safety</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
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
                      <td className="px-4 py-3">{renderTrackingStatus(email)}</td>
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
                          {['DRAFT', 'NEEDS_REVIEW'].includes(email.status) && (
                            <button
                              onClick={() => handleApproveEmail(email.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium bg-green-600 hover:bg-green-700 text-white"
                              title="Approve email"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}
                          {email.status === 'APPROVED' && (
                            <button
                              onClick={() => handleSendEmail(email)}
                              disabled={sendingId === email.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                              title="Send email"
                            >
                              {sendingId === email.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Send
                            </button>
                          )}
                          {email.status === 'SENT' && (
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
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
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

      {/* AI Follow-up Generation Modal */}
      {showAIFollowUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={aiGenerating ? undefined : closeAIFollowUpModal} />
          <div className="relative w-full max-w-2xl max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">AI Follow-up Generation</h2>
                  <p className="text-sm text-gray-500">
                    {aiGenerationStatus === 'running' && 'Generating...'}
                    {aiGenerationStatus === 'completed' && 'Completed'}
                    {aiGenerationStatus === 'error' && 'Error occurred'}
                  </p>
                </div>
              </div>
              {!aiGenerating && (
                <button onClick={closeAIFollowUpModal} className="p-2 hover:bg-white/80 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              )}
            </div>

            {/* Progress Section */}
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-600">
                      {aiGenerationStats.completed} / {aiGenerationStats.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600">{aiGenerationStats.successful} successful</span>
                  </div>
                  {aiGenerationStats.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-600">{aiGenerationStats.failed} failed</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {aiGenerationStats.total > 0 ? Math.round((aiGenerationStats.completed / aiGenerationStats.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ease-out ${
                    aiGenerationStatus === 'error' ? 'bg-red-500' :
                    aiGenerationStatus === 'completed' ? 'bg-green-500' :
                    'bg-gradient-to-r from-purple-600 to-blue-600'
                  }`}
                  style={{ width: `${aiGenerationStats.total > 0 ? (aiGenerationStats.completed / aiGenerationStats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Logs Section */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-[250px]">
              <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Live Progress</span>
                {aiGenerating && (
                  <span className="flex items-center gap-1.5 text-xs text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-3 bg-gray-900 font-mono text-sm">
                {aiGenerationLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-1 animate-fadeIn ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'step' ? 'text-blue-400' :
                      'text-gray-300'
                    }`}
                  >
                    <span className="text-gray-500 flex-shrink-0">
                      [{log.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}]
                    </span>
                    {log.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                    {log.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    {log.type === 'warning' && <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))}
                {aiGenerating && (
                  <div className="flex items-center gap-2 py-1 text-purple-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {aiGenerationStatus === 'completed' && !sendResult && !sendingFollowUps && generatedEmailIds.length > 0 && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {generatedEmailIds.length} emails ready to send
                  </span>
                )}
                {sendingFollowUps && (
                  <span className="text-blue-600 flex items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Distributing emails across inboxes...
                  </span>
                )}
                {sendResult && (
                  <span className="text-green-600 flex items-center gap-1">
                    <Send className="w-4 h-4" />
                    {sendResult.queued} emails queued
                    {sendResult.distribution && (
                      <span className="text-gray-500 ml-1">
                        (across {Object.keys(sendResult.distribution).length} inboxes)
                      </span>
                    )}
                  </span>
                )}
                {aiGenerationStatus === 'error' && (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Generation failed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {aiGenerationStatus === 'completed' && !sendResult && !sendingFollowUps && generatedEmailIds.length > 0 && (
                  <>
                    <button
                      onClick={closeAIFollowUpModal}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      Review Later
                    </button>
                    <button
                      onClick={sendGeneratedFollowUps}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-md hover:shadow-lg"
                    >
                      <Send className="w-4 h-4" />
                      Approve & Send Now
                      <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs ml-1">
                        {generatedEmailIds.length}
                      </span>
                    </button>
                  </>
                )}
                {sendingFollowUps && (
                  <button
                    disabled
                    className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </button>
                )}
                {(sendResult || (aiGenerationStatus === 'completed' && generatedEmailIds.length === 0) || aiGenerationStatus === 'error') && !sendingFollowUps && (
                  <button
                    onClick={closeAIFollowUpModal}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} columns={6} />}>
      <EmailsPageContent />
    </Suspense>
  );
}
