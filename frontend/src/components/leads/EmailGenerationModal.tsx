'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mail,
  Search,
  BarChart3,
  FileEdit,
  Shield,
  Flag,
  Sparkles,
  Play,
  Pause,
  Square,
  Clock,
  ChevronRight,
  RefreshCw,
  Check,
  ArrowRight,
  Send,
  Inbox,
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'step';
  step?: number;
  details?: string;
}

interface GenerationStats {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  currentEmail?: string;
  currentBusiness?: string;
}

interface EmailGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  leadIds: string[];
  mode: 'initial' | 'followup';
  onComplete: (stats: GenerationStats) => void;
}

const PIPELINE_STEPS = [
  { id: 1, name: 'Email Validation', icon: Shield, description: 'Validating email addresses' },
  { id: 2, name: 'Entity Resolution', icon: Search, description: 'Extracting businesses & contacts' },
  { id: 3, name: 'Business Analysis', icon: BarChart3, description: 'Analyzing business context' },
  { id: 4, name: 'Email Writing', icon: FileEdit, description: 'Generating personalized emails' },
  { id: 5, name: 'Compliance Check', icon: Shield, description: 'Checking spam & deliverability' },
  { id: 6, name: 'Gatekeeper', icon: Flag, description: 'Final quality decision' },
];

const FOLLOWUP_STEPS = [
  { id: 1, name: 'Context Loading', icon: Search, description: 'Loading previous email context' },
  { id: 2, name: 'Follow-up Writing', icon: FileEdit, description: 'Generating follow-up emails' },
  { id: 3, name: 'Compliance Check', icon: Shield, description: 'Checking spam & deliverability' },
  { id: 4, name: 'Gatekeeper', icon: Flag, description: 'Final quality decision' },
];

export function EmailGenerationModal({
  isOpen,
  onClose,
  campaignId,
  leadIds,
  mode,
  onComplete,
}: EmailGenerationModalProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error'>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<GenerationStats>({
    total: leadIds.length,
    completed: 0,
    successful: 0,
    failed: 0,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedEmailIds, setGeneratedEmailIds] = useState<string[]>([]);
  const [sendingStatus, setSendingStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendResult, setSendResult] = useState<{ queued: number; distribution?: Record<string, number> } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const steps = mode === 'followup' ? FOLLOWUP_STEPS : PIPELINE_STEPS;

  // Auto-scroll to bottom of logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Add log entry helper
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', step?: number, details?: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message,
      type,
      step,
      details,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  // Start generation
  const startGeneration = useCallback(async () => {
    setStatus('running');
    setLogs([]);
    setError(null);
    setCurrentStep(1);

    addLog(`Starting ${mode === 'followup' ? 'follow-up' : 'initial'} email generation for ${leadIds.length} leads...`, 'info');

    try {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Start the generation job
      const response = await fetch(`/api/campaigns/${campaignId}/leads/generate-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds,
          mode,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start email generation');
      }

      const { jobId: newJobId, streamUrl } = await response.json();
      setJobId(newJobId);

      addLog(`Job started with ID: ${newJobId}`, 'info');

      // Connect to SSE stream for progress updates
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleProgressUpdate(data);
        } catch (e) {
          console.error('Error parsing SSE message:', e);
        }
      };

      eventSource.onerror = (e) => {
        console.error('SSE error:', e);
        // Only show error if not intentionally closed
        if (eventSource.readyState === EventSource.CLOSED && status === 'running') {
          addLog('Connection lost. Attempting to reconnect...', 'warning');
        }
      };

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        addLog('Generation cancelled by user', 'warning');
        setStatus('cancelled');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        addLog(`Error: ${errorMessage}`, 'error');
        setError(errorMessage);
        setStatus('error');
      }
    }
  }, [campaignId, leadIds, mode, addLog, status]);

  // Handle progress updates from SSE
  const handleProgressUpdate = useCallback((data: {
    type: string;
    message?: string;
    step?: number;
    stats?: Partial<GenerationStats>;
    status?: string;
    details?: string;
    logType?: LogEntry['type'];
    completedEmails?: string[];
  }) => {
    switch (data.type) {
      case 'log':
        addLog(data.message || '', data.logType || 'info', data.step, data.details);
        if (data.step) {
          setCurrentStep(data.step);
        }
        break;

      case 'progress':
        if (data.stats) {
          setStats(prev => ({ ...prev, ...data.stats }));
        }
        break;

      case 'step_change':
        if (data.step) {
          setCurrentStep(data.step);
          const stepInfo = steps.find(s => s.id === data.step);
          if (stepInfo) {
            addLog(`Step ${data.step}/${steps.length}: ${stepInfo.name}`, 'step', data.step);
          }
        }
        break;

      case 'email_validated':
        addLog(`Email validated: ${data.message}`, 'success', undefined, data.details);
        break;

      case 'email_invalid':
        addLog(`Invalid email: ${data.message}`, 'warning', undefined, data.details);
        break;

      case 'email_generated':
        addLog(`Email generated: ${data.message}`, 'success', undefined, data.details);
        setStats(prev => ({
          ...prev,
          completed: prev.completed + 1,
          successful: prev.successful + 1,
        }));
        break;

      case 'email_failed':
        addLog(`Failed: ${data.message}`, 'error', undefined, data.details);
        setStats(prev => ({
          ...prev,
          completed: prev.completed + 1,
          failed: prev.failed + 1,
        }));
        break;

      case 'complete':
        addLog('Generation completed successfully!', 'success');
        setStatus('completed');
        // Capture generated email IDs for sending
        if (data.completedEmails && Array.isArray(data.completedEmails)) {
          setGeneratedEmailIds(data.completedEmails);
          addLog(`${data.completedEmails.length} emails ready to send`, 'info');
        }
        eventSourceRef.current?.close();
        break;

      case 'error':
        addLog(`Error: ${data.message}`, 'error');
        setError(data.message || 'Unknown error');
        setStatus('error');
        eventSourceRef.current?.close();
        break;

      case 'cancelled':
        addLog('Generation cancelled. Completed emails have been saved.', 'warning');
        setStatus('cancelled');
        eventSourceRef.current?.close();
        break;
    }
  }, [addLog, steps]);

  // Send all generated emails with even distribution
  const sendAllEmails = useCallback(async () => {
    if (generatedEmailIds.length === 0) {
      addLog('No emails to send', 'warning');
      return;
    }

    setSendingStatus('sending');
    addLog(`Approving and sending ${generatedEmailIds.length} emails...`, 'info');

    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailIds: generatedEmailIds,
          approveFirst: true, // Approve drafts before sending
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send emails');
      }

      setSendingStatus('sent');
      setSendResult({
        queued: result.queued,
        distribution: result.identityDistribution,
      });

      addLog(`Successfully queued ${result.queued} emails for sending!`, 'success');

      // Show distribution info
      if (result.identityDistribution) {
        const distInfo = Object.entries(result.identityDistribution)
          .map(([identity, count]) => `${identity}: ${count}`)
          .join(', ');
        addLog(`Distribution across inboxes: ${distInfo}`, 'info');
      }

      if (result.skippedSuppressed > 0) {
        addLog(`Skipped ${result.skippedSuppressed} suppressed emails`, 'warning');
      }
      if (result.skippedNoQuota > 0) {
        addLog(`Skipped ${result.skippedNoQuota} emails (no quota)`, 'warning');
      }

    } catch (err) {
      setSendingStatus('error');
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to send emails: ${errorMsg}`, 'error');
    }
  }, [generatedEmailIds, addLog]);

  // Cancel generation
  const cancelGeneration = useCallback(async () => {
    addLog('Cancelling generation...', 'warning');

    // Close SSE connection
    eventSourceRef.current?.close();

    // Abort fetch request
    abortControllerRef.current?.abort();

    // Notify backend to cancel and save progress
    if (jobId) {
      try {
        await fetch(`/api/campaigns/${campaignId}/leads/generate-emails/${jobId}/cancel`, {
          method: 'POST',
        });
      } catch (e) {
        console.error('Error cancelling job:', e);
      }
    }

    setStatus('cancelled');
  }, [jobId, campaignId, addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, []);

  // Start generation when modal opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      startGeneration();
    }
  }, [isOpen, status, startGeneration]);

  // Handle close
  const handleClose = () => {
    if (status === 'running') {
      if (confirm('Generation is in progress. Cancel and save completed emails?')) {
        cancelGeneration();
      }
      return;
    }

    if (status === 'completed' || status === 'cancelled') {
      onComplete(stats);
    }

    // Reset state
    setStatus('idle');
    setLogs([]);
    setStats({ total: leadIds.length, completed: 0, successful: 0, failed: 0 });
    setCurrentStep(0);
    setJobId(null);
    setError(null);
    setGeneratedEmailIds([]);
    setSendingStatus('idle');
    setSendResult(null);

    onClose();
  };

  // Get log icon
  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
      case 'step':
        return <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      default:
        return <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />;
    }
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Calculate progress percentage
  const progressPercentage = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {mode === 'followup' ? 'Generating Follow-up Emails' : 'Generating Emails'}
              </h2>
              <p className="text-sm text-gray-500">
                {status === 'running' && 'Processing...'}
                {status === 'completed' && 'Completed successfully'}
                {status === 'cancelled' && 'Cancelled - partial results saved'}
                {status === 'error' && 'Error occurred'}
                {status === 'idle' && 'Starting...'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/80 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Section */}
        <div className="px-6 py-4 border-b bg-gray-50">
          {/* Stats */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {stats.completed} / {stats.total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">{stats.successful} successful</span>
              </div>
              {stats.failed > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">{stats.failed} failed</span>
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {Math.round(progressPercentage)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out ${
                status === 'error' ? 'bg-red-500' :
                status === 'cancelled' ? 'bg-yellow-500' :
                status === 'completed' ? 'bg-green-500' :
                'bg-gradient-to-r from-purple-600 to-blue-600'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Step Indicators */}
          <div className="flex items-center justify-between mt-4 overflow-x-auto pb-2">
            {steps.map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              const StepIcon = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isActive
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white ring-4 ring-purple-100'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <StepIcon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 whitespace-nowrap ${
                        isActive ? 'text-purple-600 font-medium' : 'text-gray-500'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Logs Section */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Live Progress</span>
            <div className="flex items-center gap-2">
              {status === 'running' && (
                <span className="flex items-center gap-1.5 text-xs text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-3 bg-gray-900 font-mono text-sm">
            {logs.map((log) => (
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
                  [{formatTime(log.timestamp)}]
                </span>
                {getLogIcon(log.type)}
                <span className="flex-1">
                  {log.message}
                  {log.details && (
                    <span className="text-gray-500 ml-2">({log.details})</span>
                  )}
                </span>
              </div>
            ))}
            {status === 'running' && (
              <div className="flex items-center gap-2 py-1 text-purple-400">
                <span className="text-gray-500">[{formatTime(new Date())}]</span>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {status === 'running' && stats.currentBusiness && (
              <span>Current: {stats.currentBusiness}</span>
            )}
            {status === 'completed' && sendingStatus === 'idle' && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {generatedEmailIds.length} emails ready to send
              </span>
            )}
            {status === 'completed' && sendingStatus === 'sending' && (
              <span className="text-blue-600 flex items-center gap-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Distributing emails across inboxes...
              </span>
            )}
            {status === 'completed' && sendingStatus === 'sent' && (
              <span className="text-green-600 flex items-center gap-1">
                <Send className="w-4 h-4" />
                {sendResult?.queued} emails queued for sending
                {sendResult?.distribution && (
                  <span className="text-gray-500 ml-2">
                    (across {Object.keys(sendResult.distribution).length} inboxes)
                  </span>
                )}
              </span>
            )}
            {status === 'completed' && sendingStatus === 'error' && (
              <span className="text-red-600 flex items-center gap-1">
                <XCircle className="w-4 h-4" />
                Failed to send - emails saved as drafts
              </span>
            )}
            {status === 'cancelled' && (
              <span className="text-yellow-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {stats.successful} emails saved before cancellation
              </span>
            )}
            {status === 'error' && (
              <span className="text-red-600 flex items-center gap-1">
                <XCircle className="w-4 h-4" />
                {error}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {status === 'running' && (
              <button
                onClick={cancelGeneration}
                className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors"
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
            )}

            {status === 'completed' && sendingStatus === 'idle' && generatedEmailIds.length > 0 && (
              <>
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Review Later
                </button>
                <button
                  onClick={sendAllEmails}
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

            {status === 'completed' && sendingStatus === 'sending' && (
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </button>
            )}

            {status === 'completed' && (sendingStatus === 'sent' || sendingStatus === 'error') && (
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Done
              </button>
            )}

            {status === 'completed' && sendingStatus === 'idle' && generatedEmailIds.length === 0 && (
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Done
              </button>
            )}

            {(status === 'cancelled' || status === 'error') && (
              <button
                onClick={handleClose}
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
  );
}

export default EmailGenerationModal;
