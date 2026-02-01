'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban,
  ArrowLeft,
  Upload,
  Loader2,
  Building2,
  X,
  Database,
  Check,
  AlertCircle,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import CompanySelectorModal from '@/components/CompanySelectorModal';
import Papa from 'papaparse';
import { useToast } from '@/components/Toast';

type ImportMethod = 'none' | 'file' | 'existing';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  sampleValues: string[];
  isCustom: boolean;
}

interface FilePreview {
  filename: string;
  fileType: string;
  rowCount: number;
  columnCount: number;
  columnMappings: ColumnMapping[];
  unmappedColumns: string[];
  missingRequired: string[];
  previewRows: Record<string, string>[];
}

// Quick client-side row count for CSV/TSV files
async function getQuickRowCount(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        resolve(0);
        return;
      }
      // Quick line count (subtract 1 for header)
      const lines = text.split('\n').filter(line => line.trim()).length;
      resolve(Math.max(0, lines - 1));
    };
    reader.onerror = () => resolve(0);
    reader.readAsText(file);
  });
}

export default function CreateCampaignPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [creating, setCreating] = useState(false);

  // Import method selection
  const [importMethod, setImportMethod] = useState<ImportMethod>('none');

  // File import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showColumnDetails, setShowColumnDetails] = useState(false);
  const [quickRowCount, setQuickRowCount] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Existing companies selection state
  const [showCompanySelector, setShowCompanySelector] = useState(false);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.warning('Missing Information', 'Campaign name is required');
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
          // Campaign created but import failed - redirect anyway with error toast
          const errorMsg = importData.error?.message || importData.error || 'Unknown error';
          toast.error(
            'Import Failed',
            `Campaign created, but file import failed`,
            [errorMsg, 'You can try importing again from the campaign page']
          );
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
          // Campaign created but assignment failed - redirect anyway with error toast
          toast.error(
            'Assignment Failed',
            `Campaign created, but company assignment failed`,
            [assignData.error?.message || assignData.error || 'Unknown error']
          );
          router.push(`/dashboard/campaigns/${campaignId}`);
          return;
        }
      }

      // Redirect to campaign detail
      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch (error) {
      toast.error(
        'Failed to Create Campaign',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setCreating(false);
      setImporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportMethod('file');
      setSelectedBusinessIds([]); // Clear existing selection
      setFilePreview(null);
      setQuickRowCount(null);

      // Get quick row count immediately for CSV/TSV files
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const count = await getQuickRowCount(file);
        setQuickRowCount(count);
      }

      // Get column mapping preview (use a temporary campaign ID for preview)
      setLoadingPreview(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Create a temporary preview request (we'll use a placeholder ID)
        const res = await fetch('/api/campaigns/preview-import', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const preview = await res.json();
          setFilePreview(preview);
          // Update quick row count with accurate parsed count
          setQuickRowCount(preview.rowCount);
        }
      } catch (err) {
        console.error('Failed to get preview:', err);
      } finally {
        setLoadingPreview(false);
      }
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
    setFilePreview(null);
    setShowColumnDetails(false);
    setQuickRowCount(null);
    setImportProgress(null);
  };

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Get display row count (prefer preview, fallback to quick count)
  const displayRowCount = filePreview?.rowCount ?? quickRowCount ?? 0;

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
              <div className="mb-4">
                {/* File/Selection Status - changes color based on validity */}
                {importMethod === 'file' && importFile && (
                  <div className={`p-4 rounded-lg flex items-center justify-between ${
                    loadingPreview
                      ? 'bg-blue-50 border border-blue-200'
                      : filePreview?.missingRequired?.length
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-green-50 border border-green-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        loadingPreview
                          ? 'bg-blue-100'
                          : filePreview?.missingRequired?.length
                            ? 'bg-red-100'
                            : 'bg-green-100'
                      }`}>
                        {loadingPreview ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : filePreview?.missingRequired?.length ? (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <Check className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        {loadingPreview ? (
                          <>
                            <p className="font-medium text-blue-900">Analyzing file...</p>
                            <p className="text-sm text-blue-700">
                              {importFile.name} • {quickRowCount !== null ? `${quickRowCount} rows detected` : 'Counting rows...'} • Mapping columns with AI
                            </p>
                          </>
                        ) : filePreview?.missingRequired?.length ? (
                          <>
                            <p className="font-medium text-red-900">Cannot import file</p>
                            <p className="text-sm text-red-700">
                              {importFile.name} • Missing required columns: {filePreview.missingRequired.join(' and ')}
                            </p>
                          </>
                        ) : importProgress ? (
                          <>
                            <p className="font-medium text-green-900">Importing...</p>
                            <p className="text-sm text-green-700">
                              {importFile.name} • {importProgress.imported} of {importProgress.total} companies imported
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-green-900">Ready to import</p>
                            <p className="text-sm text-green-700">
                              {importFile.name} • {displayRowCount > 0 ? `${displayRowCount} companies` : 'Counting rows...'} will be imported
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={clearSelection}
                      className={`p-2 rounded-lg transition-colors ${
                        loadingPreview
                          ? 'text-blue-700 hover:bg-blue-100'
                          : filePreview?.missingRequired?.length
                            ? 'text-red-700 hover:bg-red-100'
                            : 'text-green-700 hover:bg-green-100'
                      }`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Existing companies selection */}
                {importMethod === 'existing' && selectedBusinessIds.length > 0 && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-green-900">
                          {selectedBusinessIds.length} {selectedBusinessIds.length === 1 ? 'company' : 'companies'} selected
                        </p>
                        <p className="text-sm text-green-700">From your existing companies</p>
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

                {/* Column Mapping Preview - Only show when file has no critical errors */}
                {importMethod === 'file' && filePreview && (
                  <div className="mt-3 border rounded-lg overflow-hidden">
                    {/* Import Summary */}
                    <div className={`px-4 py-3 ${
                      filePreview.missingRequired.length > 0
                        ? 'bg-red-50 border-b border-red-200'
                        : 'bg-blue-50 border-b border-blue-200'
                    }`}>
                      {filePreview.missingRequired.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Import will fail - Required columns not found
                          </p>
                          <p className="text-sm text-red-700">
                            Your CSV must have columns for <strong>Email</strong> and <strong>Business Name</strong> (or similar names like &quot;company&quot;, &quot;email_address&quot;, etc.)
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            Found columns: {filePreview.columnMappings.slice(0, 5).map(c => c.sourceColumn).join(', ')}
                            {filePreview.columnMappings.length > 5 && ` and ${filePreview.columnMappings.length - 5} more`}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-800">Import Preview</p>
                            <p className="text-sm text-blue-700">
                              {displayRowCount} rows × {filePreview.columnCount} columns
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="text-blue-800">
                              <span className="font-medium">{displayRowCount}</span> companies
                            </p>
                            <p className="text-blue-700">
                              <span className="font-medium">{displayRowCount}</span> contacts (1 per company)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Column Mapping Toggle */}
                    <button
                      onClick={() => setShowColumnDetails(!showColumnDetails)}
                      className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Column Mapping Details</span>
                        {filePreview.missingRequired.length === 0 ? (
                          <>
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                              {filePreview.columnMappings.filter(m => m.targetField).length} recognized
                            </span>
                            {filePreview.unmappedColumns.length > 0 && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                {filePreview.unmappedColumns.length} extra for AI
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                            0 required columns found
                          </span>
                        )}
                      </div>
                      {showColumnDetails ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    {/* Column Details */}
                    {showColumnDetails && (
                      <div className="px-4 py-3 max-h-64 overflow-y-auto">
                        <div className="space-y-2">
                          {filePreview.columnMappings.map((col, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-sm">
                              <div className="flex-1 truncate font-mono text-gray-600">
                                {col.sourceColumn}
                              </div>
                              <div className="text-gray-400">→</div>
                              <div className="flex-1">
                                {col.targetField ? (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    col.isCustom
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}>
                                    {col.targetField}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    Custom Data (AI will use)
                                  </span>
                                )}
                              </div>
                              {col.sampleValues.length > 0 && (
                                <div className="text-xs text-gray-400 truncate max-w-[120px]" title={col.sampleValues[0]}>
                                  e.g. {col.sampleValues[0]}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                          <p className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                            Standard fields are mapped to database columns
                          </p>
                          <p className="flex items-center gap-1 mt-1">
                            <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                            Custom data is stored and used by AI for personalization
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
