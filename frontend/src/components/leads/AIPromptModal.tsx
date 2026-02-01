'use client';

import { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
  Check,
  AlertCircle,
  PanelRightClose,
} from 'lucide-react';

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  customColumns: Record<string, unknown>;
}

interface LeadColumn {
  id: string;
  name: string;
  key: string;
  type: string;
  isEnriched: boolean;
}

interface AIPromptSidebarProps {
  campaignId: string;
  selectedLeadIds: string[];
  columns: LeadColumn[];
  leads: Lead[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PROMPT_TEMPLATES = [
  {
    id: 'company_research',
    name: 'Company Research',
    prompt: 'Research the company {{company}} and provide a brief summary of what they do, their industry, and any recent news.',
  },
  {
    id: 'linkedin_summary',
    name: 'LinkedIn Summary',
    prompt: 'Based on the LinkedIn profile at {{linkedinUrl}}, summarize the person\'s role, experience, and key skills.',
  },
  {
    id: 'pain_points',
    name: 'Pain Points',
    prompt: 'Based on the company {{company}} in the {{industry}} industry, identify 3 common pain points they might have.',
  },
  {
    id: 'personalization',
    name: 'Personalization Hook',
    prompt: 'Create a personalized opening line for {{firstName}} at {{company}} that would be relevant for a cold email.',
  },
  {
    id: 'competitors',
    name: 'Competitor Analysis',
    prompt: 'Identify the main competitors of {{company}} and briefly describe how they differ.',
  },
];

// Available AI models grouped by provider (Updated January 2026)
const AI_MODELS = {
  openai: [
    { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Latest flagship, xhigh reasoning', badge: 'Latest', provider: 'openai' },
    { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Flagship reasoning model', badge: null, provider: 'openai' },
    { id: 'gpt-5', name: 'GPT-5', description: 'Coding, reasoning & agentic tasks', badge: null, provider: 'openai' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Faster, more affordable GPT-5', badge: 'Fast', provider: 'openai' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: 'Fastest & most affordable', badge: 'Budget', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Excels at coding tasks', badge: 'Coding', provider: 'openai' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Balanced speed & quality', badge: null, provider: 'openai' },
  ],
  anthropic: [
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', description: 'Best for coding, agents & computer use', badge: 'Latest', provider: 'anthropic' },
    { id: 'claude-sonnet-4-5-20251101', name: 'Claude Sonnet 4.5', description: 'Best balance of intelligence & speed', badge: 'Recommended', provider: 'anthropic' },
    { id: 'claude-haiku-4-5-20251015', name: 'Claude Haiku 4.5', description: 'Fast & low latency', badge: 'Fast', provider: 'anthropic' },
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', description: 'Agentic tasks & real-world coding', badge: null, provider: 'anthropic' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Reliable & capable', badge: null, provider: 'anthropic' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Powerful reasoning', badge: null, provider: 'anthropic' },
  ],
};

// Flatten all models for easy lookup
const ALL_MODELS = [...AI_MODELS.openai, ...AI_MODELS.anthropic];

// Available variables for prompts
const AVAILABLE_VARIABLES = [
  { key: 'email', label: 'Email' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Job Title' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedinUrl', label: 'LinkedIn URL' },
  { key: 'website', label: 'Website' },
  { key: 'location', label: 'Location' },
  { key: 'industry', label: 'Industry' },
];

export function AIPromptSidebar({
  campaignId,
  selectedLeadIds,
  columns,
  leads,
  isOpen,
  onClose,
  onSuccess,
}: AIPromptSidebarProps) {
  const [activeTab, setActiveTab] = useState<'write' | 'templates' | 'settings'>('write');
  const [prompt, setPrompt] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [createNewColumn, setCreateNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5-20251101');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [testingPreview, setTestingPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Get leads to process
  const leadsToProcess = selectedLeadIds.length > 0
    ? leads.filter((l) => selectedLeadIds.includes(l.id))
    : leads;

  // All available columns (core + custom)
  const allColumns = [
    ...AVAILABLE_VARIABLES,
    ...columns.map((c) => ({ key: c.key, label: c.name })),
  ];

  // Handle template selection
  const handleTemplateSelect = (template: typeof PROMPT_TEMPLATES[0]) => {
    setPrompt(template.prompt);
    setActiveTab('write');
  };

  // Insert variable into prompt
  const insertVariable = (varKey: string) => {
    setPrompt((prev) => prev + `{{${varKey}}}`);
  };

  // Generate test output
  const handleTestOutput = async () => {
    if (!prompt || leadsToProcess.length === 0) return;

    setTestingPreview(true);
    setError(null);
    setPreviewResult(null);

    try {
      const testLeadId = leadsToProcess[0].id;
      const params = new URLSearchParams({
        leadId: testLeadId,
        prompt,
        sourceColumns: sourceColumns.join(','),
        model: selectedModel,
      });

      const res = await fetch(`/api/campaigns/${campaignId}/leads/enrich?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate preview');
      }

      setPreviewResult(data.preview.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setTestingPreview(false);
    }
  };

  // Generate for all leads
  const handleGenerate = async () => {
    if (!prompt) {
      setError('Please enter a prompt');
      return;
    }

    if (!outputColumn && !createNewColumn) {
      setError('Please select an output column or create a new one');
      return;
    }

    if (createNewColumn && !newColumnName) {
      setError('Please enter a name for the new column');
      return;
    }

    setProcessing(true);
    setError(null);
    setProgress({ current: 0, total: leadsToProcess.length });

    try {
      const finalOutputColumn = createNewColumn
        ? newColumnName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        : outputColumn;

      const res = await fetch(`/api/campaigns/${campaignId}/leads/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: leadsToProcess.map((l) => l.id),
          prompt,
          sourceColumns,
          outputColumn: finalOutputColumn,
          createNewColumn,
          newColumnName: createNewColumn ? newColumnName : undefined,
          model: selectedModel,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to enrich leads');
      }

      setProgress({ current: data.successful, total: data.processed });

      if (data.failed > 0) {
        setError(`Completed with ${data.failed} failures`);
      }

      // Small delay to show completion
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enrich leads');
      setProcessing(false);
    }
  };

  const currentModel = ALL_MODELS.find(m => m.id === selectedModel) || ALL_MODELS[0];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '420px', maxWidth: '100vw' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-purple-50 to-blue-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Prompts
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/80 rounded-lg transition-colors"
            title="Close sidebar"
          >
            <PanelRightClose className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('write')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'write'
                ? 'border-purple-600 text-purple-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Write AI Prompt
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-purple-600 text-purple-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-purple-600 text-purple-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'write' && (
            <div className="space-y-5">
              {/* Write AI Prompt Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900">Write AI Prompt</h3>
                <button className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Save
                </button>
              </div>

              {/* Prompt Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Prompt <span className="text-red-500">*</span>
                  </label>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <Zap className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Write your prompt here. Use {{ to insert personalized variables."
                  className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                {/* Variable insertion buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {allColumns.slice(0, 6).map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-purple-100 hover:text-purple-700 text-gray-600 rounded transition-colors"
                    >
                      {`{{${v.label}}}`}
                    </button>
                  ))}
                  {allColumns.length > 6 && (
                    <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors">
                      +{allColumns.length - 6} more
                    </button>
                  )}
                </div>
              </div>

              {/* Output Column */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Output Column
                </label>
                <div className="relative">
                  <select
                    value={createNewColumn ? '__new__' : outputColumn}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setCreateNewColumn(true);
                        setOutputColumn('');
                      } else {
                        setCreateNewColumn(false);
                        setOutputColumn(e.target.value);
                      }
                    }}
                    className="w-full appearance-none px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="">Select column...</option>
                    <option value="__new__">+ Create column New Column</option>
                    {columns.map((col) => (
                      <option key={col.key} value={col.key}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {createNewColumn && (
                  <input
                    type="text"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="New column name..."
                    className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                )}
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full appearance-none px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    <optgroup label="🟢 OpenAI Models">
                      {AI_MODELS.openai.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🟠 Anthropic Claude Models">
                      {AI_MODELS.anthropic.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {/* Selected model info */}
                <div className="mt-2 flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    currentModel.provider === 'anthropic'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500'
                      : 'bg-gradient-to-r from-green-500 to-teal-500'
                  }`}>
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm text-gray-600">{currentModel.name}</span>
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                    currentModel.provider === 'anthropic'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {currentModel.provider === 'anthropic' ? 'Claude' : 'GPT'}
                  </span>
                  {currentModel.badge && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      currentModel.badge === 'Recommended' ? 'bg-green-100 text-green-700' :
                      currentModel.badge === 'Fast' ? 'bg-blue-100 text-blue-700' :
                      currentModel.badge === 'New' ? 'bg-purple-100 text-purple-700' :
                      currentModel.badge === 'Budget' ? 'bg-yellow-100 text-yellow-700' :
                      currentModel.badge === 'Powerful' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {currentModel.badge}
                    </span>
                  )}
                </div>
              </div>

              {/* Advanced Options */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Source Columns (optional)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select which columns to include as context. Leave empty to use all.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allColumns.map((col) => (
                        <button
                          key={col.key}
                          onClick={() => {
                            setSourceColumns((prev) =>
                              prev.includes(col.key)
                                ? prev.filter((k) => k !== col.key)
                                : [...prev, col.key]
                            );
                          }}
                          className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                            sourceColumns.includes(col.key)
                              ? 'bg-purple-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Test Output */}
              <button
                onClick={handleTestOutput}
                disabled={testingPreview || !prompt || leadsToProcess.length === 0}
                className="text-purple-600 hover:text-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {testingPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Generate test output
              </button>

              {/* Preview Result */}
              {previewResult && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">Preview Result</span>
                  </div>
                  <p className="text-sm text-green-700">{previewResult}</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                </div>
              )}

              {/* Progress */}
              {processing && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-800">Processing leads...</span>
                    <span className="text-sm text-purple-600">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-purple-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Choose a template to get started quickly.
              </p>
              {PROMPT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="w-full p-4 text-left bg-gray-50 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-xl transition-colors"
                >
                  <h4 className="font-medium text-gray-900 mb-1">{template.name}</h4>
                  <p className="text-sm text-gray-500 line-clamp-2">{template.prompt}</p>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Configure AI enrichment settings for this campaign.
              </p>

              {/* OpenAI Models */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h4 className="font-medium text-gray-900">OpenAI Models</h4>
                </div>
                <div className="space-y-2">
                  {AI_MODELS.openai.map((model) => (
                    <div key={model.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{model.name}</span>
                        <p className="text-xs text-gray-500">{model.description}</p>
                      </div>
                      {model.badge && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          model.badge === 'Recommended' ? 'bg-green-100 text-green-700' :
                          model.badge === 'Fast' ? 'bg-blue-100 text-blue-700' :
                          model.badge === 'New' ? 'bg-purple-100 text-purple-700' :
                          model.badge === 'Budget' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {model.badge}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Anthropic Claude Models */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h4 className="font-medium text-gray-900">Anthropic Claude Models</h4>
                </div>
                <div className="space-y-2">
                  {AI_MODELS.anthropic.map((model) => (
                    <div key={model.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{model.name}</span>
                        <p className="text-xs text-gray-500">{model.description}</p>
                      </div>
                      {model.badge && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          model.badge === 'Recommended' ? 'bg-green-100 text-green-700' :
                          model.badge === 'Fast' ? 'bg-blue-100 text-blue-700' :
                          model.badge === 'Powerful' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {model.badge}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl">
                <h4 className="font-medium text-gray-900 mb-2">Rate Limiting</h4>
                <p className="text-sm text-gray-500">
                  AI enrichment is processed in batches to ensure quality results.
                  Large datasets may take several minutes to complete.
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl">
                <h4 className="font-medium text-gray-900 mb-2">Data Sources</h4>
                <p className="text-sm text-gray-500">
                  The AI will use available data to research leads.
                  Results are based on the model's training data and provided context.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">
              {leadsToProcess.length} lead{leadsToProcess.length !== 1 ? 's' : ''} selected
            </span>
            <span className="text-xs text-gray-400">
              Using {currentModel.name}
            </span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={processing || !prompt}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-medium rounded-xl transition-colors disabled:cursor-not-allowed"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate
          </button>
        </div>
      </div>
    </>
  );
}

// Keep the old name as an alias for backwards compatibility
export const AIPromptModal = AIPromptSidebar;
