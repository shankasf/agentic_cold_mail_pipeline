'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import Link from 'next/link';
import { Building2, Mail, FileText, ExternalLink, Search, CheckSquare, Square, Loader2, Filter, X, ChevronDown, ChevronUp, Plus, Trash2, StopCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import CampaignFilter from '@/components/CampaignFilter';
import { useToast } from '@/components/Toast';

interface JobProgress {
  type: string;
  message?: string;
  stats?: {
    total: number;
    completed: number;
    successful: number;
    failed: number;
    currentEmail?: string;
    currentBusiness?: string;
  };
}

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

function BusinessesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const campaignId = searchParams.get('campaignId');
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

  // Email Generation state
  const [generatingEmails, setGeneratingEmails] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Create Company modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCompany, setNewCompany] = useState({
    name: '',
    website: '',
    industry: '',
    location: '',
  });
  const [newContacts, setNewContacts] = useState([{ email: '', name: '', role: '' }]);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== '' && key !== 'search'
  ).length;

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (campaignId) params.set('campaignId', campaignId);
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
  }, [page, filters, campaignId]);

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
        if (campaignId) params.set('campaignId', campaignId);
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

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Connect to SSE for job progress
  const connectToJobStream = (jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/businesses/generate-emails/${jobId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as JobProgress;
        setJobProgress(data);

        if (data.type === 'completed' || data.type === 'cancelled') {
          es.close();
          eventSourceRef.current = null;
          setGeneratingEmails(false);

          if (data.type === 'completed') {
            toast.success(
              'Email Generation Complete',
              `Generated ${data.stats?.successful || 0} emails successfully${data.stats?.failed ? `, ${data.stats.failed} failed` : ''}`
            );
          } else {
            toast.info(
              'Generation Stopped',
              `Stopped after generating ${data.stats?.successful || 0} emails. All progress has been saved.`
            );
          }
        }
      } catch (e) {
        console.error('Error parsing SSE message:', e);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  };

  // Cancel job handler
  const handleCancelJob = async () => {
    if (!currentJobId) return;

    try {
      const res = await fetch(`/api/businesses/generate-emails/${currentJobId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok) {
        toast.info('Cancellation Requested', 'Stopping after current email completes...');
      } else {
        toast.error('Cancel Failed', data.message || 'Failed to cancel job');
      }
    } catch (error) {
      toast.error('Cancel Failed', 'Failed to connect to server');
    }
  };

  // Generate Emails handler
  const handleGenerateEmails = async () => {
    if (selectedIds.length === 0) return;

    setGeneratingEmails(true);
    setJobProgress(null);
    setShowProgressModal(true);

    try {
      const res = await fetch('/api/businesses/generate-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessIds: selectedIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setShowProgressModal(false);
        setGeneratingEmails(false);

        // Parse error for better display
        const errorMsg = data.error?.message || data.error || 'Failed to generate emails';

        // Check for specific error types
        if (errorMsg.includes('No contacts found')) {
          const companyNames = errorMsg.match(/\(([^)]+)\)/)?.[1] || 'selected companies';
          toast.error(
            'No Contacts Found',
            `The following companies have no contacts: ${companyNames}`,
            ['Add contacts to these companies before generating emails', 'Go to the company details page to add contacts']
          );
        } else if (errorMsg.includes('No SES identity')) {
          toast.error(
            'Email Identity Required',
            'You need to set up an email sending identity first',
            ['Go to Settings → Email Identities to add your sending email address']
          );
        } else if (errorMsg.includes('AI service')) {
          toast.error(
            'AI Service Unavailable',
            'The email generation service is temporarily unavailable',
            ['Please try again in a few moments', 'If the issue persists, contact support']
          );
        } else {
          toast.error('Failed to Generate Emails', errorMsg);
        }
        return;
      }

      // Job started successfully - connect to SSE
      if (data.jobId) {
        setCurrentJobId(data.jobId);
        connectToJobStream(data.jobId);

        // Show confirmation that background generation started
        toast.info(
          'Email Generation Started',
          `Generating emails for ${data.totalContacts} contact(s) in background. You can continue working.`
        );

        if (data.warning) {
          toast.warning('Some Contacts Skipped', data.warning);
        }
      }
    } catch (error) {
      setShowProgressModal(false);
      setGeneratingEmails(false);
      toast.error(
        'Connection Error',
        'Failed to connect to the server. Please check your internet connection.',
        [error instanceof Error ? error.message : 'Unknown error']
      );
    }
  };

  // Delete companies handler
  const handleDeleteCompanies = async (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;

    const countToDelete = idsToDelete.length;
    const confirmMessage = countToDelete === 1
      ? 'Are you sure you want to delete this company? This will also delete all associated contacts, evidence, and email drafts.'
      : `Are you sure you want to delete ${countToDelete} companies? This will also delete all associated contacts, evidence, and email drafts.`;

    if (!confirm(confirmMessage)) return;

    // Optimistic update - remove from UI immediately
    setBusinesses((prev) => prev.filter((b) => !idsToDelete.includes(b.id)));
    setTotalCount((prev) => prev - countToDelete);
    setSelectedIds([]);
    setSelectAll(false);

    setDeleting(true);
    try {
      const res = await fetch('/api/businesses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Revert on error
        fetchBusinesses();
        toast.error(
          'Delete Failed',
          data.error?.message || data.error || 'Failed to delete companies'
        );
        return;
      }

      // Show detailed message
      if (data.deletedCount !== countToDelete) {
        toast.warning(
          'Partial Delete',
          `Deleted ${data.deletedCount} of ${countToDelete} companies`,
          ['Some companies may have already been deleted', 'Some may belong to another user']
        );
        // Refetch to sync actual state
        fetchBusinesses();
      } else {
        toast.success(
          'Companies Deleted',
          `Successfully deleted ${data.deletedCount} ${data.deletedCount === 1 ? 'company' : 'companies'}`
        );
      }
    } catch (error) {
      // Revert on error
      fetchBusinesses();
      toast.error(
        'Delete Failed',
        error instanceof Error ? error.message : 'Failed to delete companies'
      );
    } finally {
      setDeleting(false);
    }
  };

  // Create Company handler
  const handleCreateCompany = async () => {
    if (!newCompany.name.trim()) {
      toast.warning('Missing Information', 'Company name is required');
      return;
    }

    // Check if at least one contact has an email
    const validContacts = newContacts.filter(c => c.email.trim());
    if (validContacts.length === 0) {
      toast.warning('Missing Information', 'Please add at least one contact email');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompany.name,
          website: newCompany.website,
          industry: newCompany.industry,
          location: newCompany.location,
          contacts: validContacts,
          campaignId: campaignId || undefined, // Include campaign if filtering by one
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error?.message || data.error || 'Failed to create company';
        if (errorMsg.includes('already exists')) {
          toast.error('Company Already Exists', `A company with this name already exists in the system`);
        } else if (errorMsg.includes('Invalid email')) {
          toast.error('Invalid Email', errorMsg);
        } else {
          toast.error('Failed to Create Company', errorMsg);
        }
        return;
      }

      toast.success(
        'Company Created',
        `"${data.canonicalName}" with ${data.contacts?.length || 0} contact(s)`
      );

      // Optimistic update - add to list immediately
      setBusinesses((prev) => [{
        id: data.id,
        canonicalName: data.canonicalName,
        website: data.website,
        industryGuess: data.industryGuess,
        location: data.location,
        createdAt: data.createdAt || new Date().toISOString(),
        _count: {
          contacts: data.contacts?.length || 0,
          evidence: 0,
          emailDrafts: 0,
        },
      }, ...prev]);
      setTotalCount((prev) => prev + 1);

      setShowCreateModal(false);
      setNewCompany({ name: '', website: '', industry: '', location: '' });
      setNewContacts([{ email: '', name: '', role: '' }]);
    } catch (error) {
      toast.error(
        'Failed to Create Company',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setCreating(false);
    }
  };

  const addContact = () => {
    setNewContacts([...newContacts, { email: '', name: '', role: '' }]);
  };

  const removeContact = (index: number) => {
    if (newContacts.length > 1) {
      setNewContacts(newContacts.filter((_, i) => i !== index));
    }
  };

  const updateContact = (index: number, field: string, value: string) => {
    const updated = [...newContacts];
    updated[index] = { ...updated[index], [field]: value };
    setNewContacts(updated);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <CampaignFilter />
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={handleGenerateEmails}
                disabled={generatingEmails || deleting}
                className="btn-secondary flex items-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50"
              >
                {generatingEmails ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {generatingEmails ? 'Generating...' : `Generate Email (${selectAll ? totalCount : selectedIds.length} Selected)`}
              </button>
              <button
                onClick={() => handleDeleteCompanies(selectedIds)}
                disabled={deleting || generatingEmails}
                className="btn-secondary flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {deleting ? 'Deleting...' : `Delete (${selectAll ? totalCount : selectedIds.length})`}
              </button>
            </>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Company
          </button>
        </div>
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
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCompanies([business.id]);
                          }}
                          disabled={deleting}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete company"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {businesses.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
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

      {/* Email Generation Progress Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    {jobProgress?.type === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : jobProgress?.type === 'cancelled' ? (
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    )}
                    {jobProgress?.type === 'completed'
                      ? 'Generation Complete'
                      : jobProgress?.type === 'cancelled'
                      ? 'Generation Stopped'
                      : 'Generating Emails...'}
                  </h3>
                </div>

                {/* Progress Bar */}
                {jobProgress?.stats && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{jobProgress.stats.completed} of {jobProgress.stats.total}</span>
                      <span>{Math.round((jobProgress.stats.completed / jobProgress.stats.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${(jobProgress.stats.completed / jobProgress.stats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats */}
                {jobProgress?.stats && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{jobProgress.stats.total}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{jobProgress.stats.successful}</div>
                      <div className="text-xs text-gray-500">Success</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{jobProgress.stats.failed}</div>
                      <div className="text-xs text-gray-500">Failed</div>
                    </div>
                  </div>
                )}

                {/* Current Processing */}
                {jobProgress?.stats?.currentEmail && jobProgress.type === 'progress' && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <span className="font-medium">Processing:</span> {jobProgress.stats.currentEmail}
                    </div>
                    {jobProgress.stats.currentBusiness && (
                      <div className="text-xs text-blue-600 mt-1">
                        Company: {jobProgress.stats.currentBusiness}
                      </div>
                    )}
                  </div>
                )}

                {/* Message */}
                {jobProgress?.message && (
                  <p className="text-sm text-gray-600 mb-4">{jobProgress.message}</p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  {generatingEmails && jobProgress?.type !== 'completed' && jobProgress?.type !== 'cancelled' ? (
                    <>
                      <button
                        onClick={handleCancelJob}
                        className="btn-secondary flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <StopCircle className="w-4 h-4" />
                        Stop
                      </button>
                      <button
                        onClick={() => {
                          setShowProgressModal(false);
                          toast.info(
                            'Running in Background',
                            `Generating ${jobProgress?.stats?.total || 0} emails. You'll receive an email when complete.`
                          );
                        }}
                        className="btn-primary flex items-center gap-2"
                      >
                        <Mail className="w-4 h-4" />
                        Run in Background
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setShowProgressModal(false);
                          setJobProgress(null);
                          setCurrentJobId(null);
                        }}
                        className="btn-secondary"
                      >
                        Close
                      </button>
                      {(jobProgress?.stats?.successful || 0) > 0 && (
                        <button
                          onClick={() => router.push('/dashboard/emails')}
                          className="btn-primary flex items-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          View Emails
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Company Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                <h3 className="text-lg font-semibold">Create Company</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Company Details */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Company Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCompany.name}
                        onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                        className="input"
                        placeholder="e.g. Acme Corporation"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                      <input
                        type="text"
                        value={newCompany.website}
                        onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })}
                        className="input"
                        placeholder="e.g. www.acme.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                      <input
                        type="text"
                        value={newCompany.industry}
                        onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })}
                        className="input"
                        placeholder="e.g. Technology"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={newCompany.location}
                        onChange={(e) => setNewCompany({ ...newCompany, location: e.target.value })}
                        className="input"
                        placeholder="e.g. San Francisco, CA"
                      />
                    </div>
                  </div>
                </div>

                {/* Contacts */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">
                      Contacts <span className="text-red-500">*</span>
                    </h4>
                    <button
                      onClick={addContact}
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Contact
                    </button>
                  </div>

                  {newContacts.map((contact, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                      <div className="sm:col-span-4">
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(index, 'email', e.target.value)}
                          className="input"
                          placeholder="Email *"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={contact.name}
                          onChange={(e) => updateContact(index, 'name', e.target.value)}
                          className="input"
                          placeholder="Name"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={contact.role}
                          onChange={(e) => updateContact(index, 'role', e.target.value)}
                          className="input"
                          placeholder="Role"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        {newContacts.length > 1 && (
                          <button
                            onClick={() => removeContact(index)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 flex justify-end gap-3 sticky bottom-0">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCompany}
                  disabled={creating || !newCompany.name.trim()}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  {creating ? 'Creating...' : 'Create Company'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusinessesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    }>
      <BusinessesPageContent />
    </Suspense>
  );
}
