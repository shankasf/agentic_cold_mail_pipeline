'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Tag,
  FolderInput,
  Mail,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  UserCheck,
  UserX,
  Calendar,
  AlertCircle,
  X,
  Plane,
  Eye,
  MousePointer,
  Reply,
  Plus,
  Send,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
}

interface Sequence {
  id: string;
  name: string;
  status: string;
}

interface BulkActionsMenuProps {
  selectedCount: number;
  campaignId: string;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
  onAddTags: (tags: string[]) => void;
  onMoveToCampaign: (campaignId: string) => void;
  onAddToSequence: (sequenceId: string) => void;
  onVerify: () => void;
}

const STATUS_OPTIONS = [
  { key: 'NOT_CONTACTED', label: 'Not Contacted', icon: Clock, color: 'text-slate-600' },
  { key: 'CONTACTED', label: 'Contacted', icon: Mail, color: 'text-blue-600' },
  { key: 'OPENED', label: 'Opened', icon: Eye, color: 'text-cyan-600' },
  { key: 'CLICKED', label: 'Clicked', icon: MousePointer, color: 'text-teal-600' },
  { key: 'REPLIED', label: 'Replied', icon: Reply, color: 'text-purple-600' },
  { key: 'INTERESTED', label: 'Interested', icon: UserCheck, color: 'text-green-600' },
  { key: 'MEETING_BOOKED', label: 'Meeting Booked', icon: Calendar, color: 'text-emerald-600' },
  { key: 'NOT_INTERESTED', label: 'Not Interested', icon: UserX, color: 'text-orange-600' },
  { key: 'BOUNCED', label: 'Bounced', icon: AlertCircle, color: 'text-red-600' },
  { key: 'UNSUBSCRIBED', label: 'Unsubscribed', icon: X, color: 'text-slate-500' },
  { key: 'OUT_OF_OFFICE', label: 'Out of Office', icon: Plane, color: 'text-amber-600' },
];

const PRESET_TAGS = [
  'hot',
  'cold',
  'warm',
  'priority',
  'follow-up',
  'decision-maker',
  'enterprise',
  'startup',
  'smb',
  'qualified',
  'unqualified',
  'demo-requested',
];

export function BulkActionsMenu({
  selectedCount,
  campaignId,
  onStatusChange,
  onDelete,
  onAddTags,
  onMoveToCampaign,
  onAddToSequence,
  onVerify,
}: BulkActionsMenuProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch campaigns when dropdown opens
  useEffect(() => {
    if (activeDropdown === 'campaign') {
      fetchCampaigns();
    } else if (activeDropdown === 'sequence') {
      fetchSequences();
    }
  }, [activeDropdown]);

  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.filter((c: Campaign) => c.id !== campaignId));
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchSequences = async () => {
    setLoadingSequences(true);
    try {
      const res = await fetch('/api/sequences');
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setLoadingSequences(false);
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleApplyTags = () => {
    const allTags = [...selectedTags];
    if (customTag.trim()) {
      allTags.push(customTag.trim());
    }
    if (allTags.length > 0) {
      onAddTags(allTags);
      setSelectedTags([]);
      setCustomTag('');
      setActiveDropdown(null);
    }
  };

  return (
    <div ref={dropdownRef} className="flex items-center gap-2">
      {/* Selected count badge */}
      <span className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg">
        {selectedCount} selected
      </span>

      {/* Status dropdown */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'status' ? null : 'status')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Status
          <ChevronDown className="w-3 h-3" />
        </button>
        {activeDropdown === 'status' && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status.key}
                onClick={() => {
                  onStatusChange(status.key);
                  setActiveDropdown(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <status.icon className={`w-4 h-4 ${status.color}`} />
                {status.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tags dropdown */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'tags' ? null : 'tags')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Tag className="w-4 h-4" />
          Tags
          <ChevronDown className="w-3 h-3" />
        </button>
        {activeDropdown === 'tags' && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
            <div className="mb-3">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="Custom tag..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <button
              onClick={handleApplyTags}
              disabled={selectedTags.length === 0 && !customTag.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Apply Tags
            </button>
          </div>
        )}
      </div>

      {/* Sequence dropdown */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'sequence' ? null : 'sequence')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Send className="w-4 h-4" />
          Sequence
          <ChevronDown className="w-3 h-3" />
        </button>
        {activeDropdown === 'sequence' && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
            {loadingSequences ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : sequences.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-gray-500">No sequences found</p>
                <a
                  href="/dashboard/campaigns"
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  Create a sequence
                </a>
              </div>
            ) : (
              sequences.map((sequence) => (
                <button
                  key={sequence.id}
                  onClick={() => {
                    onAddToSequence(sequence.id);
                    setActiveDropdown(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span className="truncate">{sequence.name}</span>
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
                    sequence.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {sequence.status}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Move to Campaign dropdown */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'campaign' ? null : 'campaign')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FolderInput className="w-4 h-4" />
          Move
          <ChevronDown className="w-3 h-3" />
        </button>
        {activeDropdown === 'campaign' && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
            {loadingCampaigns ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No other campaigns
              </div>
            ) : (
              campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  onClick={() => {
                    onMoveToCampaign(campaign.id);
                    setActiveDropdown(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FolderInput className="w-4 h-4 text-gray-400" />
                  <span className="truncate">{campaign.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Verify button */}
      <button
        onClick={onVerify}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
      >
        <CheckCircle className="w-4 h-4" />
        Verify
      </button>

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>
    </div>
  );
}
