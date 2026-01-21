'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, FileText, Edit2, Trash2, RefreshCw, Eye, Copy, Check, X,
  Sparkles, Loader2, Save, Search, Filter, ChevronDown, ChevronUp,
  Send, CheckSquare, Square, Mail, Building2, Users
} from 'lucide-react';
import { format } from 'date-fns';

interface Template {
  id: string;
  category: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { uploads: number };
}

interface GeneratedTemplate {
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  description: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface Business {
  id: string;
  canonicalName: string;
  industryGuess?: string;
  _count: { contacts: number };
  contacts?: Contact[];
}

interface Filters {
  search: string;
  category: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  hasVariable: string;
}

const defaultFilters: Filters = {
  search: '',
  category: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  hasVariable: '',
};

const CATEGORIES = [
  'SALES',
  'DEMO',
  'PARTNERSHIP',
  'SUPPORT',
  'WEBINAR',
  'PRODUCT_LAUNCH',
];

const VARIABLES = ['first_name', 'company', 'role', 'industry', 'email'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [sending, setSending] = useState(false);
  const [businessSearch, setBusinessSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewBusinessId, setPreviewBusinessId] = useState<string | null>(null);

  // AI Generation state
  const [showAiModal, setShowAiModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [aiInsights, setAiInsights] = useState('');
  const [editingGeneratedIdx, setEditingGeneratedIdx] = useState<number | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    category: 'SALES',
    name: '',
    description: '',
    subjectTemplate: '',
    bodyTemplate: '',
    isActive: true,
  });

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== '' && key !== 'search'
  ).length;

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply filters to templates
  useEffect(() => {
    let result = [...templates];

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.description?.toLowerCase().includes(search) ||
        t.subjectTemplate.toLowerCase().includes(search)
      );
    }

    if (filters.category) {
      result = result.filter(t => t.category === filters.category);
    }

    if (filters.status) {
      const isActive = filters.status === 'active';
      result = result.filter(t => t.isActive === isActive);
    }

    if (filters.dateFrom) {
      result = result.filter(t => new Date(t.createdAt) >= new Date(filters.dateFrom));
    }

    if (filters.dateTo) {
      result = result.filter(t => new Date(t.createdAt) <= new Date(filters.dateTo));
    }

    if (filters.hasVariable) {
      result = result.filter(t => t.variables.includes(filters.hasVariable));
    }

    setFilteredTemplates(result);
  }, [templates, filters]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const fetchBusinesses = useCallback(async () => {
    setLoadingBusinesses(true);
    try {
      const res = await fetch('/api/businesses?all=true&includeContacts=true');
      const data = await res.json();
      setBusinesses(data.businesses || []);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoadingBusinesses(false);
    }
  }, []);

  // Load businesses for preview data
  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  // Render template with real values
  const renderTemplatePreview = (template: string, business: Business, contact?: Contact) => {
    const firstName = contact?.name?.split(' ')[0] || 'John';
    const variables: Record<string, string> = {
      first_name: firstName,
      name: contact?.name || 'John Doe',
      company: business.canonicalName,
      industry: business.industryGuess || 'Technology',
      role: contact?.role || 'Manager',
      email: contact?.email || 'contact@example.com',
      calendly_url: 'https://calendly.com/sagar-callsphere/new-meeting',
    };
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return variables[variable] || match;
    });
  };

  // Get preview business and contact
  const getPreviewData = () => {
    if (!previewBusinessId) return null;
    const business = businesses.find(b => b.id === previewBusinessId);
    if (!business) return null;
    const contact = business.contacts?.[0];
    return { business, contact };
  };

  // Sample data for AI template preview - will use real data if businesses loaded
  const getSamplePreviewData = () => {
    // Use first business with contacts if available
    const businessWithContacts = businesses.find(b => b.contacts && b.contacts.length > 0);
    if (businessWithContacts && businessWithContacts.contacts?.[0]) {
      return {
        business: businessWithContacts,
        contact: businessWithContacts.contacts[0]
      };
    }
    // Fallback to sample data
    return {
      business: {
        id: 'sample',
        canonicalName: 'Acme Corporation',
        industryGuess: 'Technology',
        _count: { contacts: 1 }
      },
      contact: {
        id: 'sample',
        name: 'John Smith',
        email: 'john@acme.com',
        role: 'CEO'
      }
    };
  };

  // Render AI-generated template preview with real/sample values
  const renderAiTemplatePreview = (template: string) => {
    const { business, contact } = getSamplePreviewData();
    const firstName = contact?.name?.split(' ')[0] || 'John';
    const variables: Record<string, string> = {
      first_name: firstName,
      name: contact?.name || 'John Smith',
      company: business.canonicalName,
      industry: business.industryGuess || 'Technology',
      role: contact?.role || 'CEO',
      email: contact?.email || 'contact@example.com',
      calendly_url: 'https://calendly.com/sagar-callsphere/new-meeting',
    };
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return variables[variable] || match;
    });
  };

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredTemplates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTemplates.map(t => t.id));
    }
  };

  const handleSeedTemplates = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/templates', { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to seed templates');
      await fetchTemplates();
    } catch (error) {
      console.error('Error seeding templates:', error);
      alert('Failed to seed default templates');
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      category: 'SALES',
      name: '',
      description: '',
      subjectTemplate: '',
      bodyTemplate: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      category: template.category,
      name: template.name,
      description: template.description || '',
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      isActive: template.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingTemplate
        ? `/api/templates/${editingTemplate.id}`
        : '/api/templates';
      const method = editingTemplate ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setShowModal(false);
      await fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save template');
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;

    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete template');
    }
  };

  const handleToggleActive = async (template: Template) => {
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });

      if (!res.ok) throw new Error('Failed to update template');
      await fetchTemplates();
    } catch (error) {
      alert('Failed to update template status');
    }
  };

  // Send modal handlers
  const openSendModal = () => {
    setShowSendModal(true);
    setSelectedBusinessIds([]);
    setBusinessSearch('');
    fetchBusinesses();
  };

  const toggleBusinessSelect = (id: string) => {
    setSelectedBusinessIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllBusinesses = () => {
    const filtered = filteredBusinesses;
    if (selectedBusinessIds.length === filtered.length) {
      setSelectedBusinessIds([]);
    } else {
      setSelectedBusinessIds(filtered.map(b => b.id));
    }
  };

  const filteredBusinesses = businesses.filter(b =>
    b.canonicalName.toLowerCase().includes(businessSearch.toLowerCase()) ||
    b.industryGuess?.toLowerCase().includes(businessSearch.toLowerCase())
  );

  const handleSendEmails = async () => {
    if (selectedIds.length === 0 || selectedBusinessIds.length === 0) return;

    setSending(true);
    try {
      // Send for each selected template
      for (const templateId of selectedIds) {
        const res = await fetch('/api/businesses/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessIds: selectedBusinessIds,
            templateId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to send emails');
        }
      }

      alert(`Emails queued successfully for ${selectedBusinessIds.length} companies using ${selectedIds.length} template(s)`);
      setShowSendModal(false);
      setSelectedIds([]);
      setSelectedBusinessIds([]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send emails');
    } finally {
      setSending(false);
    }
  };

  // AI Generation handlers
  const generateTemplatesFromPurpose = async () => {
    if (!purpose.trim()) {
      alert('Please enter what you want the templates for');
      return;
    }

    setGenerating(true);
    setGeneratedTemplates([]);
    setAiInsights('');

    try {
      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: purpose.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate templates');
      }

      const data = await res.json();
      setGeneratedTemplates(data.template ? [data.template] : []);
      setAiInsights(data.insights || '');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate templates');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveGeneratedTemplate = async (template: GeneratedTemplate, index: number) => {
    setSavingTemplate(index);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'SALES',
          name: template.name,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          bodyTemplate: template.bodyTemplate,
          isActive: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setGeneratedTemplates(prev => prev.filter((_, i) => i !== index));
      await fetchTemplates();

      if (generatedTemplates.length === 1) {
        setShowAiModal(false);
        setPurpose('');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSavingTemplate(null);
    }
  };

  const handleUpdateGeneratedTemplate = (index: number, field: keyof GeneratedTemplate, value: string) => {
    setGeneratedTemplates(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    ));
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      SALES: 'bg-blue-100 text-blue-800 border-blue-200',
      DEMO: 'bg-purple-100 text-purple-800 border-purple-200',
      PARTNERSHIP: 'bg-green-100 text-green-800 border-green-200',
      SUPPORT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      WEBINAR: 'bg-pink-100 text-pink-800 border-pink-200',
      PRODUCT_LAUNCH: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage your email templates for outreach campaigns
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={openSendModal}
              className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <Send className="w-4 h-4" />
              Send ({selectedIds.length})
            </button>
          )}
          <button onClick={fetchTemplates} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {templates.length === 0 && (
            <button
              onClick={handleSeedTemplates}
              disabled={seeding}
              className="btn-secondary flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {seeding ? 'Loading...' : 'Load Defaults'}
            </button>
          )}
          <button
            onClick={() => {
              setShowAiModal(true);
              fetchBusinesses(); // Load businesses for real preview data
            }}
            className="btn-secondary flex items-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0 hover:from-purple-600 hover:to-blue-600"
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </button>
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col gap-4">
          {/* Search and Filter Toggle */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates by name, subject, or description..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex items-center gap-2 ${activeFilterCount > 0 ? 'border-primary-500 text-primary-600 bg-primary-50' : ''}`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {activeFilterCount}
                </span>
              )}
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="btn-secondary flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Has Variable</label>
                <select
                  value={filters.hasVariable}
                  onChange={(e) => updateFilter('hasVariable', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Any Variables</option>
                  {VARIABLES.map(v => (
                    <option key={v} value={v}>{`{{${v}}}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">From Date</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">To Date</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            {selectedIds.length === filteredTemplates.length && filteredTemplates.length > 0 ? (
              <CheckSquare className="w-5 h-5 text-primary-600" />
            ) : (
              <Square className="w-5 h-5" />
            )}
            Select All
          </button>
          {selectedIds.length > 0 && (
            <span className="text-sm font-medium text-primary-600">
              {selectedIds.length} selected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          Showing {filteredTemplates.length} of {templates.length} templates
        </p>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className={`bg-white rounded-xl border-2 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
              selectedIds.includes(template.id)
                ? 'border-primary-500 ring-2 ring-primary-100'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {/* Card Header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => toggleSelect(template.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {selectedIds.includes(template.id) ? (
                      <CheckSquare className="w-5 h-5 text-primary-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
                    {template.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getCategoryBadgeColor(template.category)}`}>
                  {template.category.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Subject</p>
                <p className="text-sm text-gray-900 truncate">
                  {renderAiTemplatePreview(template.subjectTemplate)}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Body Preview</p>
                <p className="text-sm text-gray-700 line-clamp-3">
                  {renderAiTemplatePreview(template.bodyTemplate)}
                </p>
              </div>
            </div>

            {/* Card Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleActive(template)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    template.isActive
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {template.isActive ? (
                    <><Check className="w-3 h-3" /> Active</>
                  ) : (
                    <><X className="w-3 h-3" /> Inactive</>
                  )}
                </button>
                <span className="text-xs text-gray-400">
                  {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewTemplate(template)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEdit(template)}
                  className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(template)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
          <p className="text-gray-500 mb-4">
            {templates.length === 0
              ? 'Get started by loading default templates or creating your own.'
              : 'Try adjusting your filters to find what you\'re looking for.'}
          </p>
          {templates.length === 0 && (
            <div className="flex justify-center gap-3">
              <button onClick={handleSeedTemplates} className="btn-secondary">
                Load Defaults
              </button>
              <button onClick={() => setShowAiModal(true)} className="btn-primary">
                AI Generate
              </button>
            </div>
          )}
        </div>
      )}

      {/* Send Emails Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => !sending && setShowSendModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-xl">
                      <Send className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Send Emails</h3>
                      <p className="text-sm text-gray-500">
                        Using {selectedIds.length} template{selectedIds.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => !sending && setShowSendModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                    disabled={sending}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex">
                {/* Left Panel - Company Selection */}
                <div className="w-1/2 p-6 border-r border-gray-200 overflow-y-auto max-h-[60vh]">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Companies to Send To
                    </label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search companies..."
                        value={businessSearch}
                        onChange={(e) => setBusinessSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      />
                    </div>

                    {loadingBusinesses ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4 mb-3">
                          <button
                            onClick={toggleSelectAllBusinesses}
                            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                          >
                            {selectedBusinessIds.length === filteredBusinesses.length && filteredBusinesses.length > 0 ? (
                              <CheckSquare className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                            Select All ({filteredBusinesses.length})
                          </button>
                          {selectedBusinessIds.length > 0 && (
                            <span className="text-sm text-primary-600 font-medium">
                              {selectedBusinessIds.length} selected
                            </span>
                          )}
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto border rounded-lg p-2">
                          {filteredBusinesses.map((business) => (
                            <div
                              key={business.id}
                              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedBusinessIds.includes(business.id)
                                  ? 'bg-primary-50 border border-primary-200'
                                  : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                              } ${previewBusinessId === business.id ? 'ring-2 ring-blue-400' : ''}`}
                            >
                              <div className="flex items-center gap-3 flex-1" onClick={() => toggleBusinessSelect(business.id)}>
                                {selectedBusinessIds.includes(business.id) ? (
                                  <CheckSquare className="w-5 h-5 text-primary-600" />
                                ) : (
                                  <Square className="w-5 h-5 text-gray-400" />
                                )}
                                <div>
                                  <p className="font-medium text-gray-900">{business.canonicalName}</p>
                                  {business.industryGuess && (
                                    <p className="text-xs text-gray-500">{business.industryGuess}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {business._count.contacts}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewBusinessId(previewBusinessId === business.id ? null : business.id);
                                  }}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    previewBusinessId === business.id
                                      ? 'bg-blue-100 text-blue-600'
                                      : 'hover:bg-gray-200 text-gray-400'
                                  }`}
                                  title="Preview email"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {filteredBusinesses.length === 0 && (
                            <p className="text-center py-8 text-gray-500">No companies found</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Panel - Live Preview */}
                <div className="w-1/2 p-6 bg-gray-50 overflow-y-auto max-h-[60vh]">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Live Preview</h4>
                    {previewBusinessId && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        Showing real values
                      </span>
                    )}
                  </div>

                  {!previewBusinessId ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Eye className="w-10 h-10 text-gray-300 mb-3" />
                      <p className="text-gray-500 text-sm">Click the <Eye className="w-4 h-4 inline" /> icon on a company to preview the email with real values</p>
                    </div>
                  ) : (
                    (() => {
                      const previewData = getPreviewData();
                      if (!previewData) return null;
                      const { business, contact } = previewData;
                      const selectedTemplate = templates.find(t => selectedIds.includes(t.id));

                      if (!selectedTemplate) {
                        return <p className="text-gray-500 text-sm">Select a template to preview</p>;
                      }

                      return (
                        <div className="space-y-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-blue-700 mb-1">Previewing for:</p>
                            <p className="text-sm font-semibold text-blue-900">{business.canonicalName}</p>
                            {contact && (
                              <p className="text-xs text-blue-700">{contact.name} ({contact.email})</p>
                            )}
                          </div>

                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 border-b">
                              <p className="text-xs font-medium text-gray-500">SUBJECT</p>
                              <p className="text-sm font-semibold text-gray-900 mt-1">
                                {renderTemplatePreview(selectedTemplate.subjectTemplate, business, contact)}
                              </p>
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-xs font-medium text-gray-500 mb-2">BODY</p>
                              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                                {renderTemplatePreview(selectedTemplate.bodyTemplate, business, contact)}
                              </pre>
                            </div>
                          </div>

                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-xs text-green-700">
                              <Check className="w-3 h-3 inline mr-1" />
                              Variables replaced with real data from your contacts
                            </p>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {selectedBusinessIds.length > 0
                    ? `Will send to ${selectedBusinessIds.reduce((acc, id) => {
                        const b = businesses.find(x => x.id === id);
                        return acc + (b?._count.contacts || 0);
                      }, 0)} contacts`
                    : 'Select companies to continue'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSendModal(false)}
                    disabled={sending}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendEmails}
                    disabled={sending || selectedBusinessIds.length === 0}
                    className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send Emails</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => !generating && setShowAiModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">AI Template Generator</h3>
                      <p className="text-sm text-gray-500">Generate professional templates with AI</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (!generating) { setShowAiModal(false); setPurpose(''); setGeneratedTemplates([]); } }}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                    disabled={generating}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[65vh]">
                {/* Purpose Input Section */}
                {generatedTemplates.length === 0 && !generating && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        What do you want this template for?
                      </label>
                      <textarea
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="e.g., Cold outreach to SaaS companies to book demos for our AI voice agent product"
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
                      />
                    </div>

                    <button
                      onClick={generateTemplatesFromPurpose}
                      disabled={!purpose.trim()}
                      className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                      <Sparkles className="w-5 h-5" />
                      Generate Template
                    </button>

                    <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100">
                      <p className="text-sm font-medium text-purple-800 mb-2">Example purposes:</p>
                      <ul className="text-sm text-purple-700 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="text-purple-400">-</span>
                          Book demos with e-commerce companies for inventory management software
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-purple-400">-</span>
                          Re-engage leads who went cold after initial contact
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-purple-400">-</span>
                          Partner outreach to marketing agencies for referral program
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Generating State */}
                {generating && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                      <Sparkles className="w-8 h-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-gray-900 font-medium mt-6">Generating your template...</p>
                    <p className="text-sm text-gray-500 mt-1">AI is crafting a professional email</p>
                  </div>
                )}

                {/* Generated Templates */}
                {generatedTemplates.length > 0 && !generating && (
                  <div className="space-y-6">
                    {/* Sample Data Info */}
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      <span className="text-sm text-green-700">
                        <Check className="w-4 h-4 inline mr-1" />
                        Preview using: <strong>{getSamplePreviewData().business.canonicalName}</strong>
                      </span>
                      <span className="text-xs text-green-600">Real contact data</span>
                    </div>

                    {aiInsights && (
                      <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100">
                        <p className="text-sm font-medium text-purple-800 mb-1">AI Insights</p>
                        <p className="text-sm text-purple-700">{aiInsights}</p>
                      </div>
                    )}

                    {generatedTemplates.map((template, idx) => (
                      <div key={idx} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                          {editingGeneratedIdx === idx ? (
                            <input
                              type="text"
                              value={template.name}
                              onChange={(e) => handleUpdateGeneratedTemplate(idx, 'name', e.target.value)}
                              className="text-sm font-medium text-gray-900 border rounded-lg px-3 py-1.5 flex-1 mr-3"
                            />
                          ) : (
                            <span className="text-sm font-semibold text-gray-900">{template.name}</span>
                          )}
                          <div className="flex items-center gap-2">
                            {editingGeneratedIdx === idx ? (
                              <button
                                onClick={() => setEditingGeneratedIdx(null)}
                                className="text-green-600 hover:text-green-800 text-sm font-medium px-3 py-1"
                              >
                                Done
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingGeneratedIdx(idx)}
                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleSaveGeneratedTemplate(template, idx)}
                              disabled={savingTemplate === idx}
                              className="btn-primary text-sm py-1.5 px-4 flex items-center gap-2"
                            >
                              {savingTemplate === idx ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              Save Template
                            </button>
                            <button
                              onClick={() => setGeneratedTemplates(prev => prev.filter((_, i) => i !== idx))}
                              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
                              title="Discard"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 space-y-4">
                          {editingGeneratedIdx === idx ? (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                                <input
                                  type="text"
                                  value={template.description}
                                  onChange={(e) => handleUpdateGeneratedTemplate(idx, 'description', e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Subject</label>
                                <input
                                  type="text"
                                  value={template.subjectTemplate}
                                  onChange={(e) => handleUpdateGeneratedTemplate(idx, 'subjectTemplate', e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Body</label>
                                <textarea
                                  value={template.bodyTemplate}
                                  onChange={(e) => handleUpdateGeneratedTemplate(idx, 'bodyTemplate', e.target.value)}
                                  rows={10}
                                  className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-gray-500">{template.description}</p>
                              <div className="rounded-lg p-4 bg-white border border-gray-200">
                                <p className="text-xs font-medium text-gray-500 mb-1">Subject</p>
                                <p className="font-medium text-gray-900">
                                  {renderAiTemplatePreview(template.subjectTemplate)}
                                </p>
                              </div>
                              <div className="rounded-lg p-4 bg-white border border-gray-200">
                                <p className="text-xs font-medium text-gray-500 mb-1">Body</p>
                                <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800">
                                  {renderAiTemplatePreview(template.bodyTemplate)}
                                </pre>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="flex justify-center pt-4">
                      <button
                        onClick={() => {
                          setGeneratedTemplates([]);
                          setAiInsights('');
                          setPurpose('');
                        }}
                        className="btn-secondary"
                      >
                        Generate Another
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {generatedTemplates.length === 0 && !generating && (
                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
                  <button
                    onClick={() => { setShowAiModal(false); setPurpose(''); }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
              <form onSubmit={handleSubmit}>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {editingTemplate ? 'Edit Template' : 'Create New Template'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Template Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Sales Outreach v1"
                        required
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of this template"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject Template</label>
                    <input
                      type="text"
                      value={formData.subjectTemplate}
                      onChange={(e) => setFormData({ ...formData, subjectTemplate: e.target.value })}
                      placeholder="e.g., {{company}} - Quick question about your {{industry}} operations"
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Body Template</label>
                    <textarea
                      value={formData.bodyTemplate}
                      onChange={(e) => setFormData({ ...formData, bodyTemplate: e.target.value })}
                      placeholder="Hi {{first_name}},&#10;&#10;I noticed that {{company}} is..."
                      required
                      rows={10}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 font-mono text-sm"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                      Variables: {'{{first_name}}'}, {'{{company}}'}, {'{{role}}'}, {'{{industry}}'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="isActive" className="text-sm text-gray-700">
                      Template is active and available for use
                    </label>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => setPreviewTemplate(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-xl">
                      <Eye className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{previewTemplate.name}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${getCategoryBadgeColor(previewTemplate.category)}`}>
                        {previewTemplate.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {previewTemplate.description && (
                  <p className="text-sm text-gray-600">{previewTemplate.description}</p>
                )}

                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-sm text-green-700">
                    <Check className="w-4 h-4 inline mr-1" />
                    Preview using: <strong>{getSamplePreviewData().business.canonicalName}</strong>
                  </span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase">Subject</p>
                  <p className="text-gray-900 font-medium">
                    {renderAiTemplatePreview(previewTemplate.subjectTemplate)}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase">Body</p>
                  <pre className="text-gray-900 whitespace-pre-wrap font-sans">
                    {renderAiTemplatePreview(previewTemplate.bodyTemplate)}
                  </pre>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                <button onClick={() => setPreviewTemplate(null)} className="btn-secondary">
                  Close
                </button>
                <button
                  onClick={() => {
                    handleEdit(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
