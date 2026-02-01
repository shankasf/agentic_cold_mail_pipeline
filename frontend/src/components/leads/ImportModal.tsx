'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, Check, AlertCircle, Download } from 'lucide-react';

interface ImportModalProps {
  campaignId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModal({ campaignId, onClose, onSuccess }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    created: number;
    skipped: number;
    total: number;
    errors?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['.csv', '.xlsx', '.xls', '.json', '.tsv', '.txt'];
      const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(ext)) {
        setError('Invalid file type. Please upload CSV, Excel, JSON, or TSV files.');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validTypes = ['.csv', '.xlsx', '.xls', '.json', '.tsv', '.txt'];
      const ext = '.' + droppedFile.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(ext)) {
        setError('Invalid file type. Please upload CSV, Excel, JSON, or TSV files.');
        return;
      }
      setFile(droppedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import file');
      }

      setResult({
        success: true,
        created: data.created,
        skipped: data.skipped,
        total: data.total,
        errors: data.errors,
      });

      // Auto-close after success
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['email', 'first_name', 'last_name', 'company', 'title', 'phone', 'linkedin_url', 'website', 'location', 'industry'];
    const example = ['john@example.com', 'John', 'Doe', 'Acme Inc', 'CEO', '+1 555 123 4567', 'https://linkedin.com/in/johndoe', 'https://acme.com', 'New York, USA', 'Technology'];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Import Leads
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload Area */}
          {!result && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.tsv,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="mt-3 text-sm text-red-600 hover:text-red-700"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="font-medium text-gray-900">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports CSV, Excel, JSON, TSV
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`p-6 rounded-xl ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3 mb-4">
                {result.success ? (
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                )}
                <div>
                  <h3 className="font-medium text-gray-900">
                    {result.success ? 'Import Complete!' : 'Import Failed'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {result.created} leads created, {result.skipped} skipped
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-white rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{result.total}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{result.created}</p>
                  <p className="text-xs text-gray-500">Created</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
              </div>

              {/* Errors */}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                  <ul className="text-xs text-red-700 list-disc list-inside">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* Template Download */}
          {!result && (
            <div className="mt-4 flex items-center justify-center">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <Download className="w-4 h-4" />
                Download template CSV
              </button>
            </div>
          )}

          {/* Instructions */}
          {!result && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Column Mapping</h4>
              <p className="text-xs text-gray-600 mb-2">
                The system will automatically detect and map these columns:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['email', 'first_name', 'last_name', 'company', 'title', 'phone', 'linkedin', 'website', 'location', 'industry'].map((col) => (
                  <span
                    key={col}
                    className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Any additional columns will be added as custom fields.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? 'Importing...' : 'Import Leads'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
