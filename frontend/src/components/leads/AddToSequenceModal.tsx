'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Calendar,
  Clock,
  Users,
  Play,
  Pause,
  Plus,
} from 'lucide-react';

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  totalLeads: number;
  activeLeads: number;
  completedLeads: number;
  steps?: SequenceStep[];
}

interface SequenceStep {
  id: string;
  stepNumber: number;
  delayDays: number;
  delayHours: number;
  subjectTemplate: string;
}

interface AddToSequenceModalProps {
  campaignId: string;
  selectedLeadIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function AddToSequenceModal({
  campaignId,
  selectedLeadIds,
  onClose,
  onSuccess,
}: AddToSequenceModalProps) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);

  useEffect(() => {
    fetchSequences();
  }, []);

  const fetchSequences = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sequences');
      if (!res.ok) throw new Error('Failed to fetch sequences');
      const data = await res.json();
      setSequences(data.sequences || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sequences');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToSequence = async () => {
    if (!selectedSequence) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`/api/sequences/${selectedSequence}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          campaignId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add leads to sequence');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add leads to sequence');
    } finally {
      setAdding(false);
    }
  };

  const filteredSequences = sequences.filter(
    (seq) =>
      seq.name.toLowerCase().includes(search.toLowerCase()) ||
      seq.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
      ACTIVE: { bg: 'bg-green-100', text: 'text-green-700', icon: Play },
      PAUSED: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Pause },
      COMPLETED: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle },
      ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-500', icon: Clock },
    };
    const config = configs[status] || configs.DRAFT;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Leads Added Successfully!
          </h3>
          <p className="text-gray-600">
            {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} added to sequence
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Add to Sequence
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sequences..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Adding {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} to sequence
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredSequences.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Sequences Found
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                {search
                  ? 'No sequences match your search'
                  : 'Create a sequence to start automating your outreach'}
              </p>
              <a
                href={`/dashboard/campaigns/${campaignId}/sequences`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Sequence
              </a>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {filteredSequences.map((sequence) => (
                <div
                  key={sequence.id}
                  className={`border rounded-xl transition-all cursor-pointer ${
                    selectedSequence === sequence.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedSequence(sequence.id)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          checked={selectedSequence === sequence.id}
                          onChange={() => setSelectedSequence(sequence.id)}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <h3 className="font-medium text-gray-900">{sequence.name}</h3>
                          {sequence.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{sequence.description}</p>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(sequence.status)}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>{sequence.totalLeads} total</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <Play className="w-3.5 h-3.5" />
                        <span>{sequence.activeLeads} active</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{sequence.completedLeads} completed</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSequence(expandedSequence === sequence.id ? null : sequence.id);
                        }}
                        className="ml-auto text-xs text-blue-600 hover:underline"
                      >
                        {expandedSequence === sequence.id ? 'Hide steps' : 'View steps'}
                      </button>
                    </div>

                    {/* Steps preview */}
                    {expandedSequence === sequence.id && sequence.steps && sequence.steps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        {sequence.steps.map((step) => (
                          <div
                            key={step.id}
                            className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-100"
                          >
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                              {step.stepNumber}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">{step.subjectTemplate}</p>
                              <p className="text-xs text-gray-500">
                                {step.delayDays > 0 && `${step.delayDays}d `}
                                {step.delayHours > 0 && `${step.delayHours}h `}
                                delay
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddToSequence}
            disabled={!selectedSequence || adding}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add to Sequence
          </button>
        </div>
      </div>
    </div>
  );
}
