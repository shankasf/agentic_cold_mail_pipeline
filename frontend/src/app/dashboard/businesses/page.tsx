'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Building2, Mail, FileText, ExternalLink, Search, Sparkles, CheckSquare, Square, Loader2, Filter, X, ChevronDown, ChevronUp, Save, Edit2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

interface GeneratedTemplate {
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  description: string;
}

interface Filters {
  search: string;
  industry: string;
  location: string;
  minContacts: string;
  maxContacts: string;
  minEvidence: string;
  maxEvidence: string;
  minDrafts: string;
  maxDrafts: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: Filters = {
  search: '',
  industry: '',
  location: '',
  minContacts: '',
  maxContacts: '',
  minEvidence: '',
  maxEvidence: '',
  minDrafts: '',
  maxDrafts: '',
  dateFrom: '',
  dateTo: '',
};

export default function BusinessesPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<{ industries: string[]; locations: string[] }>({
    industries: [],
    locations: [],
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // AI Template Generation state
  const [showAiModal, setShowAiModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [aiInsights, setAiInsights] = useState('');
  const [editingGeneratedIdx, setEditingGeneratedIdx] = useState<number | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== '' && key !== 'search'
  ).length;

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filters.search) params.set('search', filters.search);
      if (filters.industry) params.set('industry', filters.industry);
      if (filters.location) params.set('location', filters.location);
      if (filters.minContacts) params.set('minContacts', filters.minContacts);
      if (filters.maxContacts) params.set('maxContacts', filters.maxContacts);
      if (filters.minEvidence) params.set('minEvidence', filters.minEvidence);
      if (filters.maxEvidence) params.set('maxEvidence', filters.maxEvidence);
      if (filters.minDrafts) params.set('minDrafts', filters.minDrafts);
      if (filters.maxDrafts) params.set('maxDrafts', filters.maxDrafts);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      const res = await fetch(`/api/businesses?${params}`);
      const data = await res.json();
      setBusinesses(data.businesses || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/businesses/filters');
      const data = await res.json();
      setFilterOptions({
        industries: data.industries || [],
        locations: data.locations || [],
      });
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(fetchBusinesses, 300);
    return () => clearTimeout(debounce);
  }, [fetchBusinesses]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    setSelectedIds([]);
    setSelectAll(false);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setPage(1);
    setSelectedIds([]);
    setSelectAll(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSelectAll(false);
  };

  const toggleSelectPage = () => {
    if (selectedIds.length === businesses.length) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      setSelectedIds(businesses.map(b => b.id));
    }
  };

  const handleSelectAll = async () => {
    if (selectAll) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      // Fetch all business IDs with current filters
      try {
        const params = new URLSearchParams({ all: 'true' });
        if (filters.search) params.set('search', filters.search);
        if (filters.industry) params.set('industry', filters.industry);
        if (filters.location) params.set('location', filters.location);
        if (filters.minContacts) params.set('minContacts', filters.minContacts);
        if (filters.maxContacts) params.set('maxContacts', filters.maxContacts);
        if (filters.minEvidence) params.set('minEvidence', filters.minEvidence);
        if (filters.maxEvidence) params.set('maxEvidence', filters.maxEvidence);
        if (filters.minDrafts) params.set('minDrafts', filters.minDrafts);
        if (filters.maxDrafts) params.set('maxDrafts', filters.maxDrafts);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const res = await fetch(`/api/businesses?${params}`);
        const data = await res.json();
        setSelectedIds(data.businesses?.map((b: Business) => b.id) || []);
        setSelectAll(true);
      } catch (error) {
        console.error('Error selecting all:', error);
      }
    }
  };

  // AI Template Generation handlers
  const openAiModal = () => {
    setShowAiModal(true);
    setGeneratedTemplates([]);
    setAiInsights('');
    setEditingGeneratedIdx(null);
    setPurpose('');
  };

  const generateTemplatesFromBusinesses = async () => {
    if (selectedIds.length === 0 || !purpose.trim()) return;

    setGenerating(true);
    setGeneratedTemplates([]);
    setAiInsights('');

    try {
      // Fetch business details to build context
      const selectedBusinesses = selectAll
        ? businesses
        : businesses.filter(b => selectedIds.includes(b.id));

      // Build document content from selected businesses
      const documentContent = selectedBusinesses.map(b => {
        return `Company: ${b.canonicalName}
Website: ${b.website || 'N/A'}
Industry: ${b.industryGuess || 'Unknown'}
Location: ${b.location || 'Unknown'}
Contacts: ${b._count.contacts}
Data Points: ${b._count.evidence}`;
      }).join('\n\n---\n\n');

      // Get unique industries for context
      const industries = [...new Set(selectedBusinesses.map(b => b.industryGuess).filter(Boolean))];

      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: purpose.trim(),
          documentContent: `Business Information:\n\n${documentContent}`,
          contextHints: {
            industry: industries.join(', '),
            company_type: 'B2B prospects',
          },
        }),
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
          category: 'SALES', // Default category for AI-generated templates
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

      // Remove saved template from generated list
      setGeneratedTemplates(prev => prev.filter((_, i) => i !== index));

      if (generatedTemplates.length === 1) {
        setShowAiModal(false);
        setPurpose('');
        router.push('/dashboard/templates');
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

  const closeAiModal = () => {
    if (!generating) {
      setShowAiModal(false);
      setGeneratedTemplates([]);
      setAiInsights('');
      setEditingGeneratedIdx(null);
      setPurpose('');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        {selectedIds.length > 0 && (
          <button
            onClick={openAiModal}
            className="btn-secondary flex items-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0 hover:from-purple-600 hover:to-blue-600"
          >
            <Sparkles className="w-4 h-4" />
            Generate Template ({selectAll ? totalCount : selectedIds.length} Selected)
          </button>
        )}
      </div>

      <div className="card mb-6">
        <div className="flex flex-col gap-4">
          {/* Search and Filter Toggle */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or website..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="input pl-10"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex items-center gap-2 ${activeFilterCount > 0 ? 'border-primary-500 text-primary-600' : ''}`}
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
                className="btn-secondary flex items-center gap-2 text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="border-t pt-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Industry Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Industry</label>
                  <select
                    value={filters.industry}
                    onChange={(e) => updateFilter('industry', e.target.value)}
                    className="input text-sm"
                  >
                    <option value="">All Industries</option>
                    {filterOptions.industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <select
                    value={filters.location}
                    onChange={(e) => updateFilter('location', e.target.value)}
                    className="input text-sm"
                  >
                    <option value="">All Locations</option>
                    {filterOptions.locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contacts Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Contacts</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.minContacts}
                      onChange={(e) => updateFilter('minContacts', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.maxContacts}
                      onChange={(e) => updateFilter('maxContacts', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                  </div>
                </div>

                {/* Data Points Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data Points</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.minEvidence}
                      onChange={(e) => updateFilter('minEvidence', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.maxEvidence}
                      onChange={(e) => updateFilter('maxEvidence', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                  </div>
                </div>

                {/* Drafts Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Drafts</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.minDrafts}
                      onChange={(e) => updateFilter('minDrafts', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.maxDrafts}
                      onChange={(e) => updateFilter('maxDrafts', e.target.value)}
                      className="input text-sm w-full"
                      min="0"
                    />
                  </div>
                </div>

                {/* Date Range */}
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Created Date</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => updateFilter('dateFrom', e.target.value)}
                      className="input text-sm"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => updateFilter('dateTo', e.target.value)}
                      className="input text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* Selection controls */}
            {businesses.length > 0 && (
              <div className="flex items-center gap-4 mb-4 pb-4 border-b">
                <button
                  onClick={toggleSelectPage}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {selectedIds.length === businesses.length && businesses.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-primary-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Select Page
                </button>
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {selectAll ? (
                    <CheckSquare className="w-4 h-4 text-primary-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Select All ({totalCount})
                </button>
                {selectedIds.length > 0 && (
                  <span className="text-sm text-primary-600 font-medium">
                    {selectAll ? totalCount : selectedIds.length} selected
                  </span>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left w-10"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
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
                        <button onClick={() => toggleSelect(business.id)}>
                          {selectedIds.includes(business.id) ? (
                            <CheckSquare className="w-5 h-5 text-primary-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
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
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No companies found.
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

      {/* AI Template Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={closeAiModal} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      AI Template Generator
                    </h3>
                  </div>
                  <button
                    onClick={closeAiModal}
                    className="text-gray-400 hover:text-gray-600"
                    disabled={generating}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Purpose Input Step */}
                {generatedTemplates.length === 0 && !generating && (
                  <div className="mb-6">
                    <p className="text-sm text-gray-600 mb-4">
                      Tell us what you want these email templates for. AI will analyze the {selectAll ? totalCount : selectedIds.length} selected companies and generate personalized templates.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          What do you want these templates for?
                        </label>
                        <textarea
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          placeholder="e.g., Cold outreach to book demos for our AI voice agent product"
                          rows={3}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>

                      <button
                        onClick={generateTemplatesFromBusinesses}
                        disabled={!purpose.trim()}
                        className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        Generate Templates
                      </button>
                    </div>

                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800 font-medium mb-2">Example purposes:</p>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>- &quot;Book demos with these companies for our software&quot;</li>
                        <li>- &quot;Follow up on previous conversations about partnership&quot;</li>
                        <li>- &quot;Introduce our new product features&quot;</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Generating State */}
                {generating && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-12 h-12 text-primary-600 animate-spin mb-4" />
                    <p className="text-gray-600 font-medium">Analyzing {selectAll ? totalCount : selectedIds.length} companies...</p>
                    <p className="text-sm text-gray-500 mt-1">Generating personalized templates</p>
                  </div>
                )}

                {/* Generated Templates */}
                {generatedTemplates.length > 0 && !generating && (
                  <div className="space-y-6">
                    {/* Insights */}
                    {aiInsights && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm font-medium text-purple-800 mb-2">AI Insights</p>
                        <p className="text-sm text-purple-700">{aiInsights}</p>
                      </div>
                    )}

                    {/* Template Cards */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-gray-700">
                        Generated {generatedTemplates.length} template{generatedTemplates.length > 1 ? 's' : ''} -
                        Review and save to use:
                      </p>

                      {generatedTemplates.map((template, idx) => (
                        <div key={idx} className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {editingGeneratedIdx === idx ? (
                                <input
                                  type="text"
                                  value={template.name}
                                  onChange={(e) => handleUpdateGeneratedTemplate(idx, 'name', e.target.value)}
                                  className="text-sm font-medium text-gray-900 border rounded px-2 py-1 flex-1"
                                />
                              ) : (
                                <span className="text-sm font-medium text-gray-900">{template.name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {editingGeneratedIdx === idx ? (
                                <button
                                  onClick={() => setEditingGeneratedIdx(null)}
                                  className="text-green-600 hover:text-green-800 text-sm font-medium"
                                >
                                  Done
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditingGeneratedIdx(idx)}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleSaveGeneratedTemplate(template, idx)}
                                disabled={savingTemplate === idx}
                                className="btn-primary text-sm py-1 px-3 flex items-center gap-1"
                              >
                                {savingTemplate === idx ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Save
                              </button>
                              <button
                                onClick={() => setGeneratedTemplates(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-600 hover:text-red-800"
                                title="Discard"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="p-4 space-y-3">
                            {editingGeneratedIdx === idx ? (
                              <>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                                  <input
                                    type="text"
                                    value={template.description}
                                    onChange={(e) => handleUpdateGeneratedTemplate(idx, 'description', e.target.value)}
                                    className="w-full text-sm rounded border px-2 py-1"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                                  <input
                                    type="text"
                                    value={template.subjectTemplate}
                                    onChange={(e) => handleUpdateGeneratedTemplate(idx, 'subjectTemplate', e.target.value)}
                                    className="w-full text-sm rounded border px-2 py-1"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                                  <textarea
                                    value={template.bodyTemplate}
                                    onChange={(e) => handleUpdateGeneratedTemplate(idx, 'bodyTemplate', e.target.value)}
                                    rows={8}
                                    className="w-full text-sm rounded border px-2 py-1 font-mono"
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-gray-500">{template.description}</p>
                                <div className="bg-gray-50 rounded p-3">
                                  <p className="text-xs text-gray-500 mb-1">Subject:</p>
                                  <p className="text-sm font-medium">{template.subjectTemplate}</p>
                                </div>
                                <div className="bg-gray-50 rounded p-3">
                                  <p className="text-xs text-gray-500 mb-1">Body:</p>
                                  <pre className="text-sm whitespace-pre-wrap font-sans">{template.bodyTemplate}</pre>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Regenerate */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <button
                        onClick={() => {
                          setGeneratedTemplates([]);
                          setAiInsights('');
                          setPurpose('');
                        }}
                        className="btn-secondary"
                      >
                        Start Over
                      </button>
                      <p className="text-sm text-gray-500">
                        {generatedTemplates.length} template{generatedTemplates.length > 1 ? 's' : ''} remaining
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {!generating && generatedTemplates.length === 0 && (
                <div className="bg-gray-50 px-6 py-3 flex justify-end">
                  <button onClick={closeAiModal} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
