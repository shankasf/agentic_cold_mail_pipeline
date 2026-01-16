'use client';

import { useEffect, useState, useCallback } from 'react';
import { Upload, FileText, Trash2, RefreshCw, Eye, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';

interface TemplateFile {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  content: string;
  status: string;
  errorText: string | null;
  uploadedAt: string;
  createdTemplateId: string | null;
  createdTemplate?: {
    id: string;
    name: string;
    category: string;
  } | null;
}

const CATEGORIES = [
  'SALES',
  'DEMO',
  'PARTNERSHIP',
  'SUPPORT',
  'WEBINAR',
  'PRODUCT_LAUNCH',
];

export default function TemplateUploadsPage() {
  const [uploads, setUploads] = useState<TemplateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState<TemplateFile | null>(null);
  const [formData, setFormData] = useState({
    category: 'SALES',
    name: '',
    description: '',
    subjectTemplate: '',
  });

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/template-uploads');
      const data = await res.json();
      setUploads(data);
    } catch (error) {
      console.error('Error fetching uploads:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/template-uploads', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      await fetchUploads();
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (uploadId: string) => {
    if (!confirm('Are you sure you want to delete this upload?')) return;

    try {
      await fetch(`/api/template-uploads/${uploadId}`, { method: 'DELETE' });
      await fetchUploads();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete upload');
    }
  };

  const openCreateModal = (upload: TemplateFile) => {
    setSelectedUpload(upload);
    setFormData({
      category: 'SALES',
      name: upload.filename.replace(/\.[^/.]+$/, ''),
      description: '',
      subjectTemplate: '',
    });
    setShowCreateModal(true);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUpload) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          bodyTemplate: selectedUpload.content,
          sourceUploadId: selectedUpload.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create template');
      }

      setShowCreateModal(false);
      await fetchUploads();
      alert('Template created successfully!');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create template');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PARSED':
        return <span className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Ready</span>;
      case 'FAILED':
        return <span className="badge-danger"><AlertCircle className="w-3 h-3 mr-1" />Failed</span>;
      default:
        return <span className="badge-gray">{status}</span>;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Template Uploads</h1>
        <div className="flex gap-3">
          <button onClick={fetchUploads} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Upload Form */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Email Template File</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload an email template file. The file content will be extracted and can be used to create a new email template.
          Use {'{{variable}}'} syntax for dynamic content like {'{{name}}'}, {'{{company}}'}, etc.
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Supported formats: TXT, PDF, DOCX
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <label className={`btn-primary flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Template File'}
            <input
              type="file"
              className="hidden"
              accept=".txt,.pdf,.docx"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Uploads Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {uploads.map((upload) => (
                <tr key={upload.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{upload.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 uppercase">
                    {upload.fileType}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatBytes(upload.sizeBytes)}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(upload.status)}
                    {upload.errorText && (
                      <p className="text-xs text-red-600 mt-1">{upload.errorText}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {upload.createdTemplate ? (
                      <span className="text-green-600">{upload.createdTemplate.name}</span>
                    ) : (
                      <span className="text-gray-400">Not created</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {format(new Date(upload.uploadedAt), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewContent(upload.content)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {upload.status === 'PARSED' && !upload.createdTemplate && (
                        <button
                          onClick={() => openCreateModal(upload)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                        >
                          Create Template
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(upload.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No template files uploaded yet. Upload a TXT, PDF, or DOCX file to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewContent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setPreviewContent(null)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Template Content Preview</h3>
                <button onClick={() => setPreviewContent(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-auto max-h-[60vh]">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 p-4 rounded">
                  {previewContent}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && selectedUpload && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
              <form onSubmit={handleCreateTemplate}>
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Create Template from File</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Create an email template using the content from "{selectedUpload.filename}"
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject Template</label>
                      <input
                        type="text"
                        value={formData.subjectTemplate}
                        onChange={(e) => setFormData({ ...formData, subjectTemplate: e.target.value })}
                        placeholder="e.g., Quick question for {{company}}"
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
