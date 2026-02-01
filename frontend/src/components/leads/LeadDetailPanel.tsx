'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Globe,
  Linkedin,
  Tag,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Send,
  MessageSquare,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Calendar,
  Eye,
  MousePointer,
  Reply,
  UserCheck,
  UserX,
  Plane,
  Edit2,
  Save,
} from 'lucide-react';

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  emailProvider: string | null;
  emailSecurity: string | null;
  status: string;
  lastContactedAt: string | null;
  customColumns: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  enrichmentData?: Record<string, unknown>;
  lastEnrichedAt?: string | null;
  notes?: string;
  verificationStatus?: string;
}

interface LeadColumn {
  id: string;
  name: string;
  key: string;
  type: string;
  isEnriched: boolean;
}

interface Activity {
  id: string;
  type: 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed' | 'note' | 'status_change' | 'enriched';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface LeadDetailPanelProps {
  lead: Lead;
  columns: LeadColumn[];
  campaignId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  NOT_CONTACTED: { icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100', label: 'Not Contacted' },
  CONTACTED: { icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Contacted' },
  OPENED: { icon: Eye, color: 'text-cyan-600', bg: 'bg-cyan-50', label: 'Opened' },
  CLICKED: { icon: MousePointer, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Clicked' },
  REPLIED: { icon: Reply, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Replied' },
  INTERESTED: { icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50', label: 'Interested' },
  MEETING_BOOKED: { icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Meeting Booked' },
  NOT_INTERESTED: { icon: UserX, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Not Interested' },
  BOUNCED: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Bounced' },
  UNSUBSCRIBED: { icon: X, color: 'text-slate-500', bg: 'bg-slate-100', label: 'Unsubscribed' },
  OUT_OF_OFFICE: { icon: Plane, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Out of Office' },
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  sent: Send,
  opened: Eye,
  clicked: MousePointer,
  replied: Reply,
  bounced: AlertCircle,
  unsubscribed: UserX,
  note: MessageSquare,
  status_change: CheckCircle,
  enriched: Sparkles,
};

const TAG_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
];

function getTagColor(tag: string) {
  // Simple hash function for consistent colors
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function LeadDetailPanel({
  lead,
  columns,
  campaignId,
  onClose,
  onUpdate,
}: LeadDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'notes'>('details');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);

  // Fetch lead activity on mount
  useEffect(() => {
    fetchActivities();
  }, [lead.id]);

  const fetchActivities = async () => {
    setLoadingActivities(true);
    try {
      // Simulated activities based on lead status and timestamps
      const mockActivities: Activity[] = [];

      if (lead.createdAt) {
        mockActivities.push({
          id: '1',
          type: 'note',
          description: 'Lead added to campaign',
          timestamp: lead.createdAt,
        });
      }

      if (lead.lastContactedAt) {
        mockActivities.push({
          id: '2',
          type: 'sent',
          description: 'Email sent',
          timestamp: lead.lastContactedAt,
        });
      }

      if (lead.status === 'OPENED') {
        mockActivities.push({
          id: '3',
          type: 'opened',
          description: 'Opened email',
          timestamp: new Date().toISOString(),
        });
      }

      if (lead.status === 'CLICKED') {
        mockActivities.push({
          id: '4',
          type: 'clicked',
          description: 'Clicked link in email',
          timestamp: new Date().toISOString(),
        });
      }

      if (lead.status === 'REPLIED') {
        mockActivities.push({
          id: '5',
          type: 'replied',
          description: 'Replied to email',
          timestamp: new Date().toISOString(),
        });
      }

      if (lead.lastEnrichedAt) {
        mockActivities.push({
          id: '6',
          type: 'enriched',
          description: 'AI enrichment completed',
          timestamp: lead.lastEnrichedAt,
        });
      }

      setActivities(mockActivities.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;

    setAddingTag(true);
    try {
      const updatedTags = [...(lead.tags || []), newTag.trim()];

      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [lead.id],
          updates: { tags: updatedTags },
        }),
      });

      if (!res.ok) throw new Error('Failed to add tag');

      setNewTag('');
      onUpdate();
    } catch (error) {
      console.error('Error adding tag:', error);
    } finally {
      setAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      const updatedTags = (lead.tags || []).filter(t => t !== tagToRemove);

      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [lead.id],
          updates: { tags: updatedTags },
        }),
      });

      if (!res.ok) throw new Error('Failed to remove tag');

      onUpdate();
    } catch (error) {
      console.error('Error removing tag:', error);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [lead.id],
          updates: { status: newStatus },
        }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      setEditingStatus(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleSaveNote = async () => {
    if (!note.trim()) return;

    setSavingNote(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [lead.id],
          updates: {
            customColumns: {
              ...lead.customColumns,
              _notes: note
            }
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to save note');

      setNote('');
      onUpdate();
      fetchActivities();
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setSavingNote(false);
    }
  };

  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NOT_CONTACTED;
  const StatusIcon = statusConfig.icon;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {(lead.firstName?.[0] || lead.email[0]).toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                {lead.firstName || lead.lastName
                  ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
                  : lead.email}
              </h2>
              <p className="text-sm text-gray-500">{lead.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Status & Quick Actions */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {editingStatus ? (
                <select
                  value={lead.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  onBlur={() => setEditingStatus(false)}
                  autoFocus
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingStatus(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color} hover:opacity-80 transition-opacity`}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusConfig.label}
                  <Edit2 className="w-3 h-3 ml-1 opacity-50" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-white rounded-lg transition-colors" title="Send email">
                <Send className="w-4 h-4 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-white rounded-lg transition-colors" title="Add to sequence">
                <Mail className="w-4 h-4 text-gray-600" />
              </button>
              {lead.linkedinUrl && (
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-white rounded-lg transition-colors"
                  title="View LinkedIn"
                >
                  <Linkedin className="w-4 h-4 text-gray-600" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['details', 'activity', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' && (
            <div className="p-6 space-y-6">
              {/* Tags */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(lead.tags || []).map((tag) => {
                    const color = getTagColor(tag);
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${color.bg} ${color.text} border ${color.border}`}
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:opacity-70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add tag..."
                      className="w-24 px-2 py-1 text-xs border border-dashed border-gray-300 rounded-full focus:outline-none focus:border-blue-500"
                    />
                    {newTag && (
                      <button
                        onClick={handleAddTag}
                        disabled={addingTag}
                        className="p-1 hover:bg-gray-100 rounded-full"
                      >
                        {addingTag ? (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                        ) : (
                          <Plus className="w-3 h-3 text-gray-500" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Contact Information</h3>
                <div className="space-y-3">
                  <InfoRow icon={Mail} label="Email" value={lead.email} />
                  {lead.phone && <InfoRow icon={Phone} label="Phone" value={lead.phone} />}
                  {lead.company && <InfoRow icon={Building2} label="Company" value={lead.company} />}
                  {lead.title && <InfoRow icon={Briefcase} label="Title" value={lead.title} />}
                  {lead.location && <InfoRow icon={MapPin} label="Location" value={lead.location} />}
                  {lead.industry && <InfoRow icon={Building2} label="Industry" value={lead.industry} />}
                  {lead.website && (
                    <InfoRow
                      icon={Globe}
                      label="Website"
                      value={lead.website}
                      isLink
                    />
                  )}
                  {lead.linkedinUrl && (
                    <InfoRow
                      icon={Linkedin}
                      label="LinkedIn"
                      value={lead.linkedinUrl}
                      isLink
                    />
                  )}
                </div>
              </div>

              {/* Email Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Email Details</h3>
                <div className="space-y-3">
                  {lead.emailProvider && (
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Provider</span>
                      <span className="text-sm font-medium text-gray-900">{lead.emailProvider}</span>
                    </div>
                  )}
                  {lead.emailSecurity && (
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Security</span>
                      <span className="text-sm font-medium text-gray-900">{lead.emailSecurity}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Verification</span>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Valid
                    </span>
                  </div>
                </div>
              </div>

              {/* Custom Fields */}
              {columns.length > 0 && Object.keys(lead.customColumns || {}).filter(k => !k.startsWith('_')).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Custom & Enriched Fields
                  </h3>
                  <div className="space-y-2">
                    {columns.map((col) => {
                      const value = lead.customColumns?.[col.key];
                      if (!value) return null;
                      return (
                        <div key={col.key} className="py-2 px-3 bg-purple-50 rounded-lg">
                          <div className="flex items-center gap-1 mb-1">
                            {col.isEnriched && <Sparkles className="w-3 h-3 text-purple-500" />}
                            <span className="text-xs font-medium text-purple-700">{col.name}</span>
                          </div>
                          <p className="text-sm text-gray-900">{String(value)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Created {formatDate(lead.createdAt)}</span>
                  {lead.lastContactedAt && (
                    <span>Last contacted {formatDate(lead.lastContactedAt)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="p-6">
              {loadingActivities ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No activity yet</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

                  <div className="space-y-4">
                    {activities.map((activity) => {
                      const Icon = ACTIVITY_ICONS[activity.type] || Clock;
                      return (
                        <div key={activity.id} className="relative flex gap-4">
                          <div className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                            <Icon className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="text-sm text-gray-900">{activity.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDate(activity.timestamp)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="p-6">
              {/* Add Note */}
              <div className="mb-6">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note about this lead..."
                  className="w-full h-24 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !note.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingNote ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Note
                  </button>
                </div>
              </div>

              {/* Existing Notes */}
              {Boolean(lead.customColumns?._notes) && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">Note</span>
                  </div>
                  <p className="text-sm text-gray-700">{String(lead.customColumns?._notes || '')}</p>
                </div>
              )}

              {!Boolean(lead.customColumns?._notes) && !note && (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No notes yet</p>
                  <p className="text-xs text-gray-400 mt-1">Add notes to keep track of important information</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Helper component for info rows
function InfoRow({
  icon: Icon,
  label,
  value,
  isLink,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate"
          >
            {value}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-gray-900 truncate">{value}</p>
        )}
      </div>
    </div>
  );
}
