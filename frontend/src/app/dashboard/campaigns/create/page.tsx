'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban,
  ArrowLeft,
  Upload,
  Loader2,
  Building2,
  X,
  FileText,
  Database,
  Check,
} from 'lucide-react';
import CompanySelectorModal from '@/components/CompanySelectorModal';

type ImportMethod = 'none' | 'file' | 'existing';

export default function CreateCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [creating, setCreating] = useState(false);

  // Import method selection
  const [importMethod, setImportMethod] = useState<ImportMethod>('none');

  // File import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Existing companies selection state
  const [showCompanySelector, setShowCompanySelector] = useState(false);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('Campaign name is required');
      return;
    }

    setCreating(true);
    try {
      // Create the campaign first
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to create campaign');
      }

      const campaignId = data.id;

      // If there's a file to import, do it
      if (importMethod === 'file' && importFile) {
        setImporting(true);
        const formData = new FormData();
        formData.append('file', importFile);

        const importRes = await fetch(`/api/campaigns/${campaignId}/import`, {
          method: 'POST',
          body: formData,
        });

        const importData = await importRes.json();

        if (!importRes.ok) {
          // Campaign created but import failed - redirect anyway
          alert(`Campaign created, but file import failed: ${importData.error?.message || importData.error}`);
          router.push(`/dashboard/campaigns/${campaignId}`);
          return;
        }
      }

      // If there are existing companies to assign, do it
      if (importMethod === 'existing' && selectedBusinessIds.length > 0) {
        setImporting(true);
        const assignRes = await fetch(`/api/campaigns/${campaignId}/assign-businesses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessIds: selectedBusinessIds,
          }),
        });

        const assignData = await assignRes.json();

        if (!assignRes.ok) {
          // Campaign created but assignment failed - redirect anyway
          alert(`Campaign created, but company assignment failed: ${assignData.error?.message || assignData.error}`);
          router.push(`/dashboard/campaigns/${campaignId}`);
          return;
        }
      }

      // Redirect to campaign detail
      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
      setImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportMethod('file');
      setSelectedBusinessIds([]); // Clear existing selection
    }
    e.target.value = '';
  };

  const handleCompaniesSelected = (businessIds: string[]) => {
    setSelectedBusinessIds(businessIds);
    setImportMethod('existing');
    setImportFile(null); // Clear file selection
  };

  const clearSelection = () => {
    setImportMethod('none');
    setImportFile(null);
    setSelectedBusinessIds([]);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/campaigns"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
      </div>

      <div className="card">
        <div className="space-y-6">
          {/* Campaign Details */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Campaign Details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Q1 2024 Outreach"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Describe the goals and target audience for this campaign..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input"
                >
                  <option value="DRAFT">Draft - Not active yet</option>
                  <option value="ACTIVE">Active - Ready for outreach</option>
                </select>
              </div>
            </div>
          </div>

          {/* Import Companies Section */}
          <div className="pt-6 border-t">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Add Companies (Optional)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Add companies to this campaign now, or do it later.
            </p>

            {/* Selection Summary */}
            {importMethod !== 'none' && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    {importMethod === 'file' && importFile && (
                      <>
                        <p className="font-medium text-green-900">File selected</p>
                        <p className="text-sm text-green-700">{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>
                      </>
                    )}
                    {importMethod === 'existing' && selectedBusinessIds.length > 0 && (
                      <>
                        <p className="font-medium text-green-900">
                          {selectedBusinessIds.length} {selectedBusinessIds.length === 1 ? 'company' : 'companies'} selected
                        </p>
                        <p className="text-sm text-green-700">From your existing companies</p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={clearSelection}
                  className="p-2 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Import Options */}
            {importMethod === 'none' && (
              <div className="grid grid-cols-2 gap-4">
                {/* Option 1: Upload File */}
                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="font-medium text-gray-900 text-center">Upload File</p>
                  <p className="text-xs text-gray-500 mt-1 text-center">CSV, Excel, JSON, TSV</p>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.json,.tsv,.txt"
                    onChange={handleFileSelect}
                  />
                </label>

                {/* Option 2: Select Existing */}
                <button
                  onClick={() => setShowCompanySelector(true)}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <Database className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="font-medium text-gray-900 text-center">Select Existing</p>
                  <p className="text-xs text-gray-500 mt-1 text-center">From your companies</p>
                </button>
              </div>
            )}

            {/* Change Selection Buttons */}
            {importMethod !== 'none' && (
              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <Upload className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Change to file upload</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.json,.tsv,.txt"
                    onChange={handleFileSelect}
                  />
                </label>
                <button
                  onClick={() => setShowCompanySelector(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Database className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {importMethod === 'existing' ? 'Change selection' : 'Select existing companies'}
                  </span>
                </button>
              </div>
            )}

            {/* Help Text */}
            {importMethod === 'none' && (
              <div className="mt-4 text-xs text-gray-500 space-y-1">
                <p><strong>Upload File:</strong> Import from CSV, Excel with columns: email, name (company name), website, industry, location, contact_name, role</p>
                <p><strong>Select Existing:</strong> Choose companies you&apos;ve already imported in the Companies section</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-6 border-t flex justify-end gap-3">
            <Link href="/dashboard/campaigns" className="btn-secondary">
              Cancel
            </Link>
            <button
              onClick={handleCreate}
              disabled={creating || importing || !name.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {creating || importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderKanban className="w-4 h-4" />
              )}
              {importing ? 'Adding Companies...' : creating ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </div>

      {/* Company Selector Modal */}
      <CompanySelectorModal
        isOpen={showCompanySelector}
        onClose={() => setShowCompanySelector(false)}
        onSelect={handleCompaniesSelected}
        title="Select Companies for Campaign"
      />
    </div>
  );
}
