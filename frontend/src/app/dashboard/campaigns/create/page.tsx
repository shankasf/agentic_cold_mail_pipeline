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
} from 'lucide-react';

export default function CreateCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [creating, setCreating] = useState(false);

  // File import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);

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
        throw new Error(data.error || 'Failed to create campaign');
      }

      const campaignId = data.id;

      // If there's a file to import, do it now
      if (importFile) {
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
          alert(`Campaign created, but import failed: ${importData.error}`);
          router.push(`/dashboard/campaigns/${campaignId}`);
          return;
        }

        setImportResult({
          created: importData.created,
          skipped: importData.skipped,
        });
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
    }
    e.target.value = '';
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

          {/* Import Data Section */}
          <div className="pt-6 border-t">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Companies (Optional)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a file to import companies directly into this campaign. You can also import data later.
            </p>

            {!importFile ? (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">
                    <span className="font-medium text-primary-600">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-400 mt-1">CSV, Excel, JSON, TSV</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls,.json,.tsv,.txt"
                  onChange={handleFileSelect}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-primary-600" />
                  <div>
                    <p className="font-medium text-gray-900">{importFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(importFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setImportFile(null)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="mt-4 text-xs text-gray-500 space-y-1">
              <p><strong>Required columns:</strong> email, name (company name)</p>
              <p><strong>Optional columns:</strong> website, industry, location, contact_name, role</p>
            </div>
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
              {importing ? 'Importing...' : creating ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
