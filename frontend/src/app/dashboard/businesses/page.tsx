'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Building2, Mail, FileText, ExternalLink, Search, ListPlus, CheckSquare, Square, Loader2, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
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

interface Template {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
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
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
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
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<'select' | 'custom' | 'confirm'>('select');
  const [customTemplate, setCustomTemplate] = useState({
    subject: '',
    body: '',
  });
  const [contactCount, setContactCount] = useState(0);

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

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?active=true');
      const data = await res.json();
      setTemplates(data.filter((t: Template) => t.isActive));
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(fetchBusinesses, 300);
    return () => clearTimeout(debounce);
  }, [fetchBusinesses]);

  useEffect(() => {
    fetchTemplates();
    fetchFilterOptions();
  }, [fetchTemplates, fetchFilterOptions]);

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

  const openSendModal = async () => {
    setShowSendModal(true);
    setStep('select');
    setSelectedTemplateId('');
    setCustomTemplate({ subject: '', body: '' });

    // Get contact count for selected businesses
    try {
      const res = await fetch('/api/businesses/contact-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: selectedIds }),
      });
      const data = await res.json();
      setContactCount(data.contactCount || 0);
    } catch {
      setContactCount(0);
    }
  };

  const handleProceedToConfirm = () => {
    if (step === 'select' && !selectedTemplateId) {
      alert('Please select a template');
      return;
    }
    if (step === 'custom' && (!customTemplate.subject || !customTemplate.body)) {
      alert('Please fill in subject and body');
      return;
    }
    setStep('confirm');
  };

  const handleSendEmails = async () => {
    if (selectedIds.length === 0) return;

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        businessIds: selectedIds,
      };

      if (step === 'confirm' && selectedTemplateId) {
        payload.templateId = selectedTemplateId;
      } else {
        payload.customSubject = customTemplate.subject;
        payload.customBody = customTemplate.body;
      }

      const res = await fetch('/api/businesses/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add to queue');
      }

      alert(`Successfully added ${data.queued} emails to queue!\n${data.skipped > 0 ? `Skipped ${data.skipped} (no contacts or suppressed)` : ''}`);
      setShowSendModal(false);
      setSelectedIds([]);
      setSelectAll(false);
      setSelectedTemplateId('');
      setStep('select');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add to queue');
    } finally {
      setSending(false);
    }
  };

  const closeSendModal = () => {
    setShowSendModal(false);
    setStep('select');
    setSelectedTemplateId('');
    setCustomTemplate({ subject: '', body: '' });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
        {selectedIds.length > 0 && (
          <button
            onClick={openSendModal}
            className="btn-primary flex items-center gap-2"
          >
            <ListPlus className="w-4 h-4" />
            Add to Queue ({selectAll ? totalCount : selectedIds.length} Selected)
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

      {/* Send Template Modal - Multi-step */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={closeSendModal} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
              {/* Step 1: Select Template or Create Custom */}
              {step === 'select' && (
                <>
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-2">Add Emails to Queue</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      {selectAll ? totalCount : selectedIds.length} businesses selected ({contactCount} contacts)
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Choose a template
                        </label>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">Select from saved templates...</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              [{template.category.replace('_', ' ')}] {template.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="text-center text-sm text-gray-500">or</div>

                      <button
                        onClick={() => setStep('custom')}
                        className="w-full btn-secondary"
                      >
                        Create Custom Email
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3">
                    <button onClick={closeSendModal} className="btn-secondary">Cancel</button>
                    <button
                      onClick={handleProceedToConfirm}
                      disabled={!selectedTemplateId}
                      className="btn-primary disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Custom Template */}
              {step === 'custom' && (
                <>
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-2">Create Custom Email</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Use {'{{name}}'}, {'{{company}}'}, {'{{industry}}'} for personalization
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                        <input
                          type="text"
                          value={customTemplate.subject}
                          onChange={(e) => setCustomTemplate({ ...customTemplate, subject: e.target.value })}
                          placeholder="e.g., Quick question about {{company}}"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                        <textarea
                          value={customTemplate.body}
                          onChange={(e) => setCustomTemplate({ ...customTemplate, body: e.target.value })}
                          placeholder="Hi {{name}},&#10;&#10;I noticed that {{company}}..."
                          rows={8}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-6 py-3 flex justify-between">
                    <button onClick={() => setStep('select')} className="btn-secondary">Back</button>
                    <button
                      onClick={handleProceedToConfirm}
                      disabled={!customTemplate.subject || !customTemplate.body}
                      className="btn-primary disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Confirmation */}
              {step === 'confirm' && (
                <>
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <ListPlus className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Confirm Add to Queue</h3>
                        <p className="text-sm text-gray-500">Emails will be queued for sending</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Businesses</p>
                          <p className="font-semibold text-lg">{selectAll ? totalCount : selectedIds.length}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Contacts</p>
                          <p className="font-semibold text-lg">{contactCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <p className="text-blue-800">
                        <strong>Note:</strong> Emails will be queued and sent according to your daily quota.
                        Suppressed emails will be automatically skipped.
                      </p>
                    </div>

                    <p className="mt-4 text-center text-gray-700">
                      Add <strong>{contactCount}</strong> emails to queue?
                    </p>
                  </div>
                  <div className="bg-gray-50 px-6 py-3 flex justify-between">
                    <button onClick={() => setStep(selectedTemplateId ? 'select' : 'custom')} className="btn-secondary">
                      Back
                    </button>
                    <button
                      onClick={handleSendEmails}
                      disabled={sending}
                      className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700 border-green-600"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ListPlus className="w-4 h-4" />
                      )}
                      {sending ? 'Adding...' : 'Yes, Add to Queue'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
