'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, FileText, Edit2, Trash2, RefreshCw, Eye, Copy, Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface Template {
  id: string;
  category: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { uploads: number };
}

const CATEGORIES = [
  'SALES',
  'DEMO',
  'PARTNERSHIP',
  'SUPPORT',
  'WEBINAR',
  'PRODUCT_LAUNCH',
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    category: 'SALES',
    name: '',
    description: '',
    subjectTemplate: '',
    bodyTemplate: '',
    isActive: true,
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSeedTemplates = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/templates', { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to seed templates');
      await fetchTemplates();
    } catch (error) {
      console.error('Error seeding templates:', error);
      alert('Failed to seed default templates');
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      category: 'SALES',
      name: '',
      description: '',
      subjectTemplate: '',
      bodyTemplate: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      category: template.category,
      name: template.name,
      description: template.description || '',
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      isActive: template.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingTemplate
        ? `/api/templates/${editingTemplate.id}`
        : '/api/templates';
      const method = editingTemplate ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setShowModal(false);
      await fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save template');
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;

    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete template');
    }
  };

  const handleToggleActive = async (template: Template) => {
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });

      if (!res.ok) throw new Error('Failed to update template');
      await fetchTemplates();
    } catch (error) {
      alert('Failed to update template status');
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      SALES: 'bg-blue-100 text-blue-800',
      DEMO: 'bg-purple-100 text-purple-800',
      PARTNERSHIP: 'bg-green-100 text-green-800',
      SUPPORT: 'bg-yellow-100 text-yellow-800',
      WEBINAR: 'bg-pink-100 text-pink-800',
      PRODUCT_LAUNCH: 'bg-orange-100 text-orange-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
        <div className="flex gap-3">
          <button onClick={fetchTemplates} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {templates.length === 0 && (
            <button
              onClick={handleSeedTemplates}
              disabled={seeding}
              className="btn-secondary flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {seeding ? 'Loading...' : 'Load Defaults'}
            </button>
          )}
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-gray-500 mb-4">
          Manage email templates for the Template Pipeline. Use {'{{variable}}'} syntax for dynamic content.
          Available variables: email, name, company, role, industry, calendly_url.
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variables</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploads</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <div>
                        <span className="font-medium text-gray-900">{template.name}</span>
                        {template.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">
                            {template.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryBadgeColor(template.category)}`}>
                      {template.category.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div className="flex flex-wrap gap-1">
                      {template.variables.slice(0, 3).map((v) => (
                        <code key={v} className="text-xs bg-gray-100 px-1 rounded">
                          {v}
                        </code>
                      ))}
                      {template.variables.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{template.variables.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {template._count.uploads}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(template)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        template.isActive
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {template.isActive ? (
                        <>
                          <Check className="w-3 h-3" /> Active
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" /> Inactive
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(template)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No templates yet. Click &quot;Load Defaults&quot; to get started with pre-made templates.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowModal(false)} />
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
              <form onSubmit={handleSubmit}>
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {editingTemplate ? 'Edit Template' : 'Create New Template'}
                  </h3>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category
                        </label>
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Template Name
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., Sales Outreach v1"
                          required
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (optional)
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brief description of this template"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subject Template
                      </label>
                      <input
                        type="text"
                        value={formData.subjectTemplate}
                        onChange={(e) => setFormData({ ...formData, subjectTemplate: e.target.value })}
                        placeholder="e.g., {{company}} - Quick question about your {{industry}} operations"
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Body Template
                      </label>
                      <textarea
                        value={formData.bodyTemplate}
                        onChange={(e) => setFormData({ ...formData, bodyTemplate: e.target.value })}
                        placeholder="Hi {{name}},&#10;&#10;I noticed that {{company}} is..."
                        required
                        rows={10}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Variables: {'{{name}}'}, {'{{company}}'}, {'{{role}}'}, {'{{industry}}'}, {'{{calendly_url}}'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <label htmlFor="isActive" className="text-sm text-gray-700">
                        Template is active and available for use
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
                  <button type="submit" className="btn-primary">
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setPreviewTemplate(null)} />
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Template Preview
                  </h3>
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryBadgeColor(previewTemplate.category)}`}>
                      {previewTemplate.category.replace('_', ' ')}
                    </span>
                    <span className="ml-2 text-sm text-gray-600">{previewTemplate.name}</span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1 uppercase font-medium">Subject</p>
                    <p className="text-sm font-medium text-gray-900">
                      {previewTemplate.subjectTemplate}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1 uppercase font-medium">Body</p>
                    <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans">
                      {previewTemplate.bodyTemplate}
                    </pre>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2 uppercase font-medium">Variables Used</p>
                    <div className="flex flex-wrap gap-2">
                      {previewTemplate.variables.map((v) => (
                        <code key={v} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
