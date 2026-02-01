'use client';

import { useState } from 'react';
import {
  X,
  Filter,
  Calendar,
  Tag,
  Building2,
  MapPin,
  Briefcase,
  Mail,
  CheckCircle,
  Clock,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

interface FilterState {
  tags: string[];
  companies: string[];
  industries: string[];
  locations: string[];
  emailProviders: string[];
  verificationStatus: string;
  dateFrom: string;
  dateTo: string;
  hasPhone: string;
  hasLinkedin: string;
  hasWebsite: string;
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClose: () => void;
  availableTags: string[];
  availableCompanies: string[];
  availableIndustries: string[];
}

const EMAIL_PROVIDERS = ['Google', 'Microsoft', 'Yahoo', 'Apple', 'ProtonMail', 'Other'];
const VERIFICATION_STATUSES = ['all', 'valid', 'invalid', 'unknown'];

export function AdvancedFilters({
  filters,
  onChange,
  onClose,
  availableTags,
  availableCompanies,
  availableIndustries,
}: AdvancedFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['status', 'tags', 'company'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key: keyof FilterState, value: string) => {
    const current = localFilters[key] as string[];
    if (current.includes(value)) {
      updateFilter(key, current.filter((v) => v !== value) as any);
    } else {
      updateFilter(key, [...current, value] as any);
    }
  };

  const handleApply = () => {
    onChange(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      tags: [],
      companies: [],
      industries: [],
      locations: [],
      emailProviders: [],
      verificationStatus: 'all',
      dateFrom: '',
      dateTo: '',
      hasPhone: 'all',
      hasLinkedin: 'all',
      hasWebsite: 'all',
    };
    setLocalFilters(resetFilters);
  };

  const activeFilterCount =
    localFilters.tags.length +
    localFilters.companies.length +
    localFilters.industries.length +
    localFilters.locations.length +
    localFilters.emailProviders.length +
    (localFilters.verificationStatus !== 'all' ? 1 : 0) +
    (localFilters.dateFrom ? 1 : 0) +
    (localFilters.dateTo ? 1 : 0) +
    (localFilters.hasPhone !== 'all' ? 1 : 0) +
    (localFilters.hasLinkedin !== 'all' ? 1 : 0) +
    (localFilters.hasWebsite !== 'all' ? 1 : 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            Advanced Filters
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                {activeFilterCount}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto">
          {/* Tags Section */}
          <FilterSection
            title="Tags"
            icon={Tag}
            isExpanded={expandedSections.has('tags')}
            onToggle={() => toggleSection('tags')}
          >
            <div className="flex flex-wrap gap-2">
              {availableTags.length > 0 ? (
                availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleArrayFilter('tags', tag)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      localFilters.tags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500">No tags available</p>
              )}
            </div>
          </FilterSection>

          {/* Company Section */}
          <FilterSection
            title="Company"
            icon={Building2}
            isExpanded={expandedSections.has('company')}
            onToggle={() => toggleSection('company')}
          >
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {availableCompanies.slice(0, 20).map((company) => (
                <label key={company} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localFilters.companies.includes(company)}
                    onChange={() => toggleArrayFilter('companies', company)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{company}</span>
                </label>
              ))}
              {availableCompanies.length === 0 && (
                <p className="text-sm text-gray-500">No companies available</p>
              )}
            </div>
          </FilterSection>

          {/* Industry Section */}
          <FilterSection
            title="Industry"
            icon={Briefcase}
            isExpanded={expandedSections.has('industry')}
            onToggle={() => toggleSection('industry')}
          >
            <div className="flex flex-wrap gap-2">
              {availableIndustries.map((industry) => (
                <button
                  key={industry}
                  onClick={() => toggleArrayFilter('industries', industry)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    localFilters.industries.includes(industry)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {industry}
                </button>
              ))}
              {availableIndustries.length === 0 && (
                <p className="text-sm text-gray-500">No industries available</p>
              )}
            </div>
          </FilterSection>

          {/* Email Provider Section */}
          <FilterSection
            title="Email Provider"
            icon={Mail}
            isExpanded={expandedSections.has('provider')}
            onToggle={() => toggleSection('provider')}
          >
            <div className="flex flex-wrap gap-2">
              {EMAIL_PROVIDERS.map((provider) => (
                <button
                  key={provider}
                  onClick={() => toggleArrayFilter('emailProviders', provider)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    localFilters.emailProviders.includes(provider)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {provider}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Verification Status Section */}
          <FilterSection
            title="Email Verification"
            icon={CheckCircle}
            isExpanded={expandedSections.has('verification')}
            onToggle={() => toggleSection('verification')}
          >
            <div className="flex flex-wrap gap-2">
              {VERIFICATION_STATUSES.map((status) => (
                <button
                  key={status}
                  onClick={() => updateFilter('verificationStatus', status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${
                    localFilters.verificationStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Date Range Section */}
          <FilterSection
            title="Date Added"
            icon={Calendar}
            isExpanded={expandedSections.has('date')}
            onToggle={() => toggleSection('date')}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  value={localFilters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={localFilters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </FilterSection>

          {/* Has Data Section */}
          <FilterSection
            title="Data Availability"
            icon={Clock}
            isExpanded={expandedSections.has('data')}
            onToggle={() => toggleSection('data')}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Has Phone</span>
                <select
                  value={localFilters.hasPhone}
                  onChange={(e) => updateFilter('hasPhone', e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Has LinkedIn</span>
                <select
                  value={localFilters.hasLinkedin}
                  onChange={(e) => updateFilter('hasLinkedin', e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Has Website</span>
                <select
                  value={localFilters.hasWebsite}
                  onChange={(e) => updateFilter('hasWebsite', e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Filter className="w-4 h-4" />
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Filter Section Component
function FilterSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Icon className="w-4 h-4 text-gray-500" />
          {title}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isExpanded && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

export default AdvancedFilters;
