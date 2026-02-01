'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  MoreHorizontal,
  Trash2,
  Plus,
  Eye,
  Sparkles,
  FileText,
  Zap,
  Type,
  Link as LinkIcon,
  Settings,
  Code,
  Pin,
  ChevronDown,
  Save,
  GripVertical,
  Copy,
  Clock,
  BarChart3,
  Users,
  Mail,
} from 'lucide-react';

interface EmailStep {
  id: string;
  order: number;
  subject: string;
  body: string;
  delayDays: number;
  variants: EmailVariant[];
}

interface EmailVariant {
  id: string;
  subject: string;
  body: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

const TABS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '' },
  { id: 'leads', label: 'Leads', icon: Users, href: '/leads' },
  { id: 'sequences', label: 'Sequences', icon: Mail, href: '/sequences' },
  { id: 'schedule', label: 'Schedule', icon: Clock, href: '/schedule' },
  { id: 'options', label: 'Options', icon: Settings, href: '/options' },
];

// Available variables for email templates
const AVAILABLE_VARIABLES = [
  { key: 'firstName', label: 'First Name', example: 'John' },
  { key: 'lastName', label: 'Last Name', example: 'Doe' },
  { key: 'email', label: 'Email', example: 'john@example.com' },
  { key: 'company', label: 'Company', example: 'Acme Inc' },
  { key: 'title', label: 'Job Title', example: 'CEO' },
  { key: 'industry', label: 'Industry', example: 'Technology' },
  { key: 'website', label: 'Website', example: 'www.example.com' },
  { key: 'accountSignature', label: 'Your Signature', example: 'Best regards,\nYour Name' },
];

export default function CampaignSequencesPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<EmailStep[]>([
    {
      id: '1',
      order: 1,
      subject: '',
      body: '{{accountSignature}}',
      delayDays: 1,
      variants: [],
    },
  ]);
  const [selectedStepId, setSelectedStepId] = useState<string>('1');
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [showAITools, setShowAITools] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const selectedStep = steps.find((s) => s.id === selectedStepId);
  const selectedVariant = selectedVariantId
    ? selectedStep?.variants.find((v) => v.id === selectedVariantId)
    : null;

  // Fetch campaign details
  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign');
      const data = await res.json();
      setCampaign(data);
    } catch (err) {
      console.error('Failed to fetch campaign:', err);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Add a new step
  const addStep = () => {
    const newStep: EmailStep = {
      id: `${Date.now()}`,
      order: steps.length + 1,
      subject: '',
      body: '{{accountSignature}}',
      delayDays: 1,
      variants: [],
    };
    setSteps([...steps, newStep]);
    setSelectedStepId(newStep.id);
    setSelectedVariantId(null);
  };

  // Delete a step
  const deleteStep = (stepId: string) => {
    if (steps.length <= 1) return;
    const newSteps = steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(newSteps);
    if (selectedStepId === stepId) {
      setSelectedStepId(newSteps[0]?.id || '');
      setSelectedVariantId(null);
    }
  };

  // Add a variant to a step
  const addVariant = (stepId: string) => {
    setSteps(
      steps.map((s) => {
        if (s.id === stepId) {
          const newVariant: EmailVariant = {
            id: `${Date.now()}`,
            subject: s.subject || '',
            body: s.body || '{{accountSignature}}',
          };
          return { ...s, variants: [...s.variants, newVariant] };
        }
        return s;
      })
    );
  };

  // Update step properties
  const updateStep = (stepId: string, updates: Partial<EmailStep>) => {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)));
  };

  // Update the current editor content (step or variant)
  const updateCurrentContent = (updates: { subject?: string; body?: string }) => {
    if (selectedVariantId && selectedStep) {
      // Update variant
      setSteps(
        steps.map((s) => {
          if (s.id === selectedStepId) {
            return {
              ...s,
              variants: s.variants.map((v) =>
                v.id === selectedVariantId ? { ...v, ...updates } : v
              ),
            };
          }
          return s;
        })
      );
    } else if (selectedStep) {
      // Update step
      updateStep(selectedStepId, updates);
    }
  };

  // Get current subject and body
  const currentSubject = selectedVariant?.subject || selectedStep?.subject || '';
  const currentBody = selectedVariant?.body || selectedStep?.body || '';

  // Insert variable at cursor
  const insertVariable = (varKey: string) => {
    const variable = `{{${varKey}}}`;
    updateCurrentContent({ body: currentBody + variable });
    setShowVariables(false);
  };

  // Save sequence
  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Save to API
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log('Saved steps:', steps);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-40 shadow-sm">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/dashboard/campaigns/${campaignId}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 text-lg">
                  {campaign?.name || 'Loading...'}
                </h1>
                <p className="text-xs text-gray-500">Email Sequences</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-lg border border-green-200 transition-colors">
                <Play className="w-4 h-4" />
                Resume campaign
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <MoreHorizontal className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 lg:px-6 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/dashboard/campaigns/${campaignId}${tab.href}`}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab.id === 'sequences'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Steps */}
        <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`bg-white rounded-xl border-2 transition-all ${
                  selectedStepId === step.id && !selectedVariantId
                    ? 'border-blue-500 shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Step Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                    <span className="text-sm font-semibold text-gray-900">Step {step.order}</span>
                  </div>
                  <button
                    onClick={() => deleteStep(step.id)}
                    disabled={steps.length <= 1}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                {/* Main Subject */}
                <button
                  onClick={() => {
                    setSelectedStepId(step.id);
                    setSelectedVariantId(null);
                  }}
                  className={`w-full p-3 text-left transition-colors ${
                    selectedStepId === step.id && !selectedVariantId ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="text-sm text-gray-600">
                    {step.subject || '<Empty subject>'}
                  </span>
                </button>

                {/* Variants */}
                {step.variants.map((variant, vIndex) => (
                  <button
                    key={variant.id}
                    onClick={() => {
                      setSelectedStepId(step.id);
                      setSelectedVariantId(variant.id);
                    }}
                    className={`w-full p-3 text-left border-t border-gray-100 transition-colors ${
                      selectedVariantId === variant.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs text-gray-400 block mb-1">Variant {vIndex + 1}</span>
                    <span className="text-sm text-gray-600">
                      {variant.subject || '<Empty subject>'}
                    </span>
                  </button>
                ))}

                {/* Add Variant Button */}
                <button
                  onClick={() => addVariant(step.id)}
                  className="w-full p-3 text-left border-t border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-blue-600 font-medium flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    Add variant
                  </span>
                </button>

                {/* Delay Setting */}
                <div className="p-3 border-t border-gray-100 flex items-center gap-2 bg-gray-50 rounded-b-xl">
                  <span className="text-sm text-gray-600">Send next message in</span>
                  <input
                    type="number"
                    min="1"
                    value={step.delayDays}
                    onChange={(e) => updateStep(step.id, { delayDays: parseInt(e.target.value) || 1 })}
                    className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Days</span>
                </div>
              </div>
            ))}

            {/* Add Step Button */}
            <button
              onClick={addStep}
              className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add step
            </button>
          </div>
        </div>

        {/* Right Panel - Email Editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Editor Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-500 mb-1 block">Subject</label>
              <input
                type="text"
                value={currentSubject}
                onChange={(e) => updateCurrentContent({ subject: e.target.value })}
                placeholder="Your subject"
                className="w-full text-lg text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Pin className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Email Body Editor */}
          <div className="flex-1 overflow-y-auto p-6">
            <textarea
              value={currentBody}
              onChange={(e) => updateCurrentContent({ body: e.target.value })}
              placeholder="Write your email content here..."
              className="w-full h-full min-h-[300px] text-gray-900 placeholder-gray-400 focus:outline-none resize-none text-base leading-relaxed"
            />
          </div>

          {/* Bottom Toolbar */}
          <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2 bg-gray-50">
            {/* Save Button */}
            <div className="relative">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
                <ChevronDown className="w-3 h-3 ml-1" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-300 mx-2" />

            {/* AI Tools */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowAITools(!showAITools);
                  setShowTemplates(false);
                  setShowVariables(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  showAITools ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                AI Tools
              </button>
              {showAITools && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Generate email with AI
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    Improve writing
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                    <Copy className="w-4 h-4 text-blue-500" />
                    Generate subject lines
                  </button>
                </div>
              )}
            </div>

            {/* Templates */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowTemplates(!showTemplates);
                  setShowAITools(false);
                  setShowVariables(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  showTemplates ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                Templates
              </button>
              {showTemplates && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
                  <p className="px-3 py-2 text-xs text-gray-500">No templates saved yet</p>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Plus className="w-4 h-4" />
                    Save as template
                  </button>
                </div>
              )}
            </div>

            {/* Variables */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowVariables(!showVariables);
                  setShowAITools(false);
                  setShowTemplates(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  showVariables ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Zap className="w-4 h-4" />
                Variables
              </button>
              {showVariables && (
                <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50 max-h-64 overflow-y-auto">
                  {AVAILABLE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 rounded-lg"
                    >
                      <span className="text-gray-900">{v.label}</span>
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                        {`{{${v.key}}}`}
                      </code>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-gray-300 mx-2" />

            {/* Formatting Tools */}
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Type className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <LinkIcon className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Code className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
