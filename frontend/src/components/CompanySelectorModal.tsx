'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Search,
  Building2,
  Check,
  Loader2,
  Users,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Business {
  id: string;
  canonicalName: string;
  industryGuess: string | null;
  website: string | null;
  _count: {
    contacts: number;
    emailDrafts: number;
  };
}

interface CompanySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (businessIds: string[]) => void;
  excludeCampaignId?: string; // Exclude businesses already in this campaign
  title?: string;
}

export default function CompanySelectorModal({
  isOpen,
  onClose,
  onSelect,
  excludeCampaignId,
  title = 'Select Companies',
}: CompanySelectorModalProps) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    if (isOpen) {
      fetchBusinesses();
    }
  }, [isOpen, page, search]);

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (search) {
        params.set('search', search);
      }

      // Only fetch businesses without a campaign (available to assign)
      // Or if excludeCampaignId is not set, show all

      const res = await fetch(`/api/businesses?${params}`);
      const data = await res.json();

      if (res.ok) {
        // Filter out businesses already in a campaign if needed
        let filteredBusinesses = data.businesses || [];

        setBusinesses(filteredBusinesses);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    const newSelected = new Set(selectedIds);
    businesses.forEach((b) => newSelected.add(b.id));
    setSelectedIds(newSelected);
  };

  const deselectAll = () => {
    const currentPageIds = businesses.map((b) => b.id);
    const newSelected = new Set(selectedIds);
    currentPageIds.forEach((id) => newSelected.delete(id));
    setSelectedIds(newSelected);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSearch('');
    setPage(1);
    onClose();
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSearch('');
    setPage(1);
    onClose();
  };

  if (!isOpen) return null;

  const allOnPageSelected = businesses.length > 0 && businesses.every((b) => selectedIds.has(b.id));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary-600" />
                {title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select companies from your existing list to add to this campaign
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search & Selection Info */}
          <div className="px-6 py-3 border-b bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search companies..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium text-primary-600">{selectedIds.size}</span> selected
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : businesses.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  {search ? 'No companies found matching your search' : 'No companies available'}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {!search && 'Import companies first from the Companies section'}
                </p>
              </div>
            ) : (
              <>
                {/* Select All Toggle */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={allOnPageSelected ? deselectAll : selectAll}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {allOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
                  </button>
                  <span className="text-sm text-gray-500">
                    Showing {businesses.length} of {total} companies
                  </span>
                </div>

                {/* Company List */}
                <div className="space-y-2">
                  {businesses.map((business) => {
                    const isSelected = selectedIds.has(business.id);
                    return (
                      <div
                        key={business.id}
                        onClick={() => toggleSelect(business.id)}
                        className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? 'bg-primary-600 border-primary-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>

                        {/* Company Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {business.canonicalName}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            {business.industryGuess && (
                              <span>{business.industryGuess}</span>
                            )}
                            {business.website && (
                              <span className="truncate">{business.website}</span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {business._count.contacts}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {business._count.emailDrafts}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Add {selectedIds.size} {selectedIds.size === 1 ? 'Company' : 'Companies'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
