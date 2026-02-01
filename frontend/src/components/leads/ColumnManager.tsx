'use client';

import { useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  GripVertical,
  Sparkles,
  Plus,
  Trash2,
  Settings,
  Check,
} from 'lucide-react';

interface LeadColumn {
  id: string;
  name: string;
  key: string;
  type: string;
  isEnriched: boolean;
  orderIndex: number;
}

interface ColumnManagerProps {
  columns: LeadColumn[];
  visibleColumns: string[];
  onVisibilityChange: (columns: string[]) => void;
  onClose: () => void;
}

// Core columns that are always available
const CORE_COLUMNS = [
  { key: 'email', name: 'Email', required: true },
  { key: 'emailProvider', name: 'Provider', required: false },
  { key: 'emailSecurity', name: 'Security', required: false },
  { key: 'status', name: 'Status', required: true },
  { key: 'firstName', name: 'First Name', required: false },
  { key: 'lastName', name: 'Last Name', required: false },
  { key: 'company', name: 'Company', required: false },
  { key: 'title', name: 'Job Title', required: false },
  { key: 'phone', name: 'Phone', required: false },
  { key: 'linkedinUrl', name: 'LinkedIn', required: false },
  { key: 'website', name: 'Website', required: false },
  { key: 'location', name: 'Location', required: false },
  { key: 'industry', name: 'Industry', required: false },
  { key: 'tags', name: 'Tags', required: false },
  { key: 'lastContactedAt', name: 'Last Contacted', required: false },
  { key: 'createdAt', name: 'Created', required: false },
];

export function ColumnManager({
  columns,
  visibleColumns,
  onVisibilityChange,
  onClose,
}: ColumnManagerProps) {
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);

  // Combine core and custom columns
  const allColumns = [
    ...CORE_COLUMNS.map(c => ({ ...c, isEnriched: false, isCustom: false })),
    ...columns.map(c => ({ key: c.key, name: c.name, required: false, isEnriched: c.isEnriched, isCustom: true })),
  ];

  const toggleColumn = (key: string) => {
    const column = allColumns.find(c => c.key === key);
    if (column?.required) return;

    setLocalVisible(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSelectAll = () => {
    setLocalVisible(allColumns.map(c => c.key));
  };

  const handleSelectNone = () => {
    setLocalVisible(allColumns.filter(c => c.required).map(c => c.key));
  };

  const handleApply = () => {
    onVisibilityChange(localVisible);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            Manage Columns
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3">
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleSelectNone}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select None
          </button>
          <span className="text-sm text-gray-500 ml-auto">
            {localVisible.length} columns selected
          </span>
        </div>

        {/* Column List */}
        <div className="max-h-96 overflow-y-auto">
          {/* Core Columns */}
          <div className="px-6 py-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Core Columns
            </h3>
            <div className="space-y-1">
              {CORE_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    col.required
                      ? 'bg-gray-100 cursor-not-allowed'
                      : localVisible.includes(col.key)
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={localVisible.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    disabled={col.required}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span className="flex-1 text-sm text-gray-900">{col.name}</span>
                  {col.required && (
                    <span className="text-xs text-gray-400">Required</span>
                  )}
                  {localVisible.includes(col.key) ? (
                    <Eye className="w-4 h-4 text-blue-500" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-gray-300" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Custom Columns */}
          {columns.length > 0 && (
            <div className="px-6 py-3 border-t">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-purple-500" />
                Custom & Enriched Columns
              </h3>
              <div className="space-y-1">
                {columns.map((col) => (
                  <label
                    key={col.key}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      localVisible.includes(col.key)
                        ? 'bg-purple-50 hover:bg-purple-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={localVisible.includes(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="flex-1 text-sm text-gray-900 flex items-center gap-1.5">
                      {col.isEnriched && <Sparkles className="w-3 h-3 text-purple-500" />}
                      {col.name}
                    </span>
                    {localVisible.includes(col.key) ? (
                      <Eye className="w-4 h-4 text-purple-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-300" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
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
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
