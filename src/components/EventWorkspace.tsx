import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Settings,
  Mic,
  Users,
  PhoneCall,
  BarChart3,
  Sparkles,
  Save,
  CheckCircle2,
  Volume2,
  Plus,
  Trash2,
  Hash,
  Layers,
  AlertTriangle,
  Eye,
  Code2,
  ArrowUp,
  ArrowDown,
  BookmarkPlus,
  ShieldAlert,
  Info,
  Calendar,
  MapPin,
  Clock,
  RotateCcw,
  ArrowRight,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  EventRecord,
  VoiceProfileRecord,
  CustomPlaceholderField,
  SurveyQuestion,
  DtmfOption,
  TenantUser,
} from '../types/callbridge';
import {
  EventTemplateRecord,
  DEFAULT_TEMPLATES,
  renderTemplateScript,
  validateRequiredFields,
  sanitizeScriptForSpeech,
} from '../utils/templateEngine';
import { ContactManager } from './ContactManager';
import { OutboundQueueView } from './OutboundQueueView';
import { AnalyticsView } from './AnalyticsView';
import { VoiceStudioModal } from './VoiceStudioModal';
import { PublicSurveyWorkspace } from './PublicSurveyWorkspace';
import { VoiceAudioPlayer } from './VoiceAudioPlayer';

interface EventWorkspaceProps {
  event: EventRecord;
  currentTenant?: TenantUser | null;
  onBackToDashboard: () => void;
  onUpdateEvent: (updated: EventRecord) => void;
}

type TabType = 'setup' | 'voice' | 'contacts' | 'campaign' | 'analytics';

export function EventWorkspace({
  event,
  currentTenant,
  onBackToDashboard,
  onUpdateEvent,
}: EventWorkspaceProps) {
  // 1. PUBLIC SURVEY — QUESTIONS ONLY WORKSPACE
  if (event.type === 'public_survey') {
    return (
      <PublicSurveyWorkspace
        event={event}
        currentTenant={currentTenant}
        onBackToDashboard={onBackToDashboard}
        onUpdateEvent={onUpdateEvent}
      />
    );
  }

  const [activeTab, setActiveTab] = useState<TabType>('setup');
  const [formData, setFormData] = useState<EventRecord>({ ...event });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isStartingSequence, setIsStartingSequence] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const [sequenceSuccess, setSequenceSuccess] = useState<string | null>(null);

  // Template State
  const [availableTemplates, setAvailableTemplates] = useState<EventTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    event.selectedTemplateId || ''
  );
  const [previewMode, setPreviewMode] = useState<'resolved' | 'template'>('resolved');

  // "Save as Template" Modal State
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Custom Field Form State
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [customLabelInput, setCustomLabelInput] = useState('');
  const [customValueInput, setCustomValueInput] = useState('');

  // Voice Studio Modal
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);

  const handleStartSequence = async () => {
    if (isStartingSequence) return;
    setIsStartingSequence(true);
    setSequenceError(null);
    setSequenceSuccess(null);
    try {
      // First save configuration to ensure persisted data
      await handleSaveConfig();

      const res = await fetch(`/api/callbridge/events/${event.id}/sequence/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: currentTenant?.id || 'client_001',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start calling sequence');
      }

      setSequenceSuccess(data.message || 'Sequence started successfully.');
      setTimeout(() => {
        setActiveTab('campaign');
      }, 400);
    } catch (err: any) {
      console.warn('Start sequence error:', err);
      setSequenceError(err.message || 'Failed to start calling sequence');
    } finally {
      setIsStartingSequence(false);
    }
  };

  // 1. Fetch Templates matching this category
  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/callbridge/templates?category=${event.type}`);
      const data = await res.json();
      if (data.templates && Array.isArray(data.templates) && data.templates.length > 0) {
        setAvailableTemplates(data.templates);
      } else {
        // Fallback to local default templates for this category
        const filtered = DEFAULT_TEMPLATES.filter((t) => t.category === event.type);
        setAvailableTemplates(filtered);
      }
    } catch (err) {
      const filtered = DEFAULT_TEMPLATES.filter((t) => t.category === event.type);
      setAvailableTemplates(filtered);
    }
  };

  useEffect(() => {
    setFormData({ ...event });
    fetchTemplates();
  }, [event.id]);

  // Current active template definition
  const currentTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const found = availableTemplates.find((t) => t.id === selectedTemplateId);
      if (found) return found;
    }
    return availableTemplates[0] || DEFAULT_TEMPLATES[0];
  }, [availableTemplates, selectedTemplateId]);

  // Current script string in event language
  const activeScriptTemplate = useMemo(() => {
    const lang = formData.language || 'te';
    if (formData.type === 'political_campaign' && formData.config?.approvedScript) {
      return formData.config.approvedScript;
    }
    if (formData.type === 'marriage_event' && formData.config?.generatedScript) {
      return formData.config.generatedScript;
    }
    if (formData.type === 'public_survey' && formData.config?.surveyIntro) {
      return formData.config.surveyIntro;
    }
    return currentTemplate?.scriptTemplate?.[lang] || currentTemplate?.scriptTemplate?.te || '';
  }, [formData, currentTemplate]);

  // Live Render computation with unresolved placeholder tracking
  const { renderedText, unresolvedPlaceholders, isValid, highlightedPreviewHtml } = useMemo(() => {
    const values = formData.config?.placeholderValues || {};
    const customFields = formData.config?.customPlaceholders || [];
    return renderTemplateScript(activeScriptTemplate, values, customFields);
  }, [activeScriptTemplate, formData.config?.placeholderValues, formData.config?.customPlaceholders]);

  // Handle template selection switch
  const handleSelectTemplate = (templateId: string) => {
    const target = availableTemplates.find((t) => t.id === templateId);
    if (!target) return;

    setSelectedTemplateId(templateId);

    // Merge default values
    const currentValues = { ...(formData.config?.placeholderValues || {}) };
    target.fields.forEach((f) => {
      if (currentValues[f.key] === undefined) {
        currentValues[f.key] = target.defaultValues?.[f.key] || '';
      }
    });

    const lang = formData.language || 'te';
    const newScript = target.scriptTemplate?.[lang] || target.scriptTemplate?.te || '';

    setFormData((prev) => ({
      ...prev,
      selectedTemplateId: templateId,
      config: {
        ...prev.config,
        placeholderValues: currentValues,
        ...(prev.type === 'public_survey' ? { surveyIntro: newScript, questions: target.questions || prev.config.questions } : {}),
        ...(prev.type === 'political_campaign' ? { approvedScript: newScript, dtmfOptions: target.dtmfOptions || prev.config.dtmfOptions } : {}),
        ...(prev.type === 'marriage_event' ? { generatedScript: newScript } : {}),
      },
    }));
  };

  // Update a placeholder value
  const handlePlaceholderChange = (key: string, val: string) => {
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        placeholderValues: {
          ...(prev.config.placeholderValues || {}),
          [key]: val,
        },
      },
    }));
  };

  // Add custom placeholder field
  const handleAddCustomField = () => {
    if (!customKeyInput.trim()) return;
    const cleanKey = customKeyInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const newField: CustomPlaceholderField = {
      key: cleanKey,
      label: customLabelInput.trim() || cleanKey,
      value: customValueInput.trim(),
    };

    const updatedCustom = [...(formData.config.customPlaceholders || []), newField];
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        customPlaceholders: updatedCustom,
      },
    }));

    setCustomKeyInput('');
    setCustomLabelInput('');
    setCustomValueInput('');
    setShowAddCustomField(false);
  };

  // Remove custom field
  const handleRemoveCustomField = async (key: string) => {
    // 1. Optimistic UI update
    const updatedCustom = (formData.config.customPlaceholders || []).filter((f) => f.key !== key);
    const updatedValues = { ...(formData.config.placeholderValues || {}) };
    delete updatedValues[key];

    const updatedEvent: EventRecord = {
      ...formData,
      config: {
        ...formData.config,
        customPlaceholders: updatedCustom,
        placeholderValues: updatedValues,
      },
    };

    setFormData(updatedEvent);
    if (onUpdateEvent) {
      onUpdateEvent(updatedEvent);
    }

    // 2. Persist to backend storage so it does not reappear on refresh
    try {
      const res = await fetch(`/api/callbridge/events/${formData.id}/custom-placeholders/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        await fetch(`/api/callbridge/events/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedEvent),
        });
      }
    } catch (err) {
      console.warn('Failed to delete custom field from backend:', err);
    }
  };

  // Save as Template
  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/callbridge/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          category: formData.type,
          description: newTemplateDesc.trim() || `User-saved template for ${formData.name}`,
          scriptTemplate: {
            te: activeScriptTemplate,
            hi: activeScriptTemplate,
            en: activeScriptTemplate,
          },
          fields: currentTemplate?.fields || [],
          defaultValues: formData.config.placeholderValues || {},
          questions: formData.config.questions,
          dtmfOptions: formData.config.dtmfOptions,
        }),
      });
      const data = await res.json();
      if (data.template) {
        setAvailableTemplates((prev) => [...prev, data.template]);
        setSelectedTemplateId(data.template.id);
        setShowSaveTemplateModal(false);
        setNewTemplateName('');
        setNewTemplateDesc('');
      }
    } catch (err) {
      console.warn('Failed to save template:', err);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Save Event Configuration
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const payload: EventRecord = {
        ...formData,
        config: {
          ...formData.config,
          renderedScript: renderedText,
        },
      };

      const res = await fetch(`/api/callbridge/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.event) {
        onUpdateEvent(data.event);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.warn('Save event error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Question Management: Move Up / Move Down / Add / Delete
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const questions = [...(formData.config.questions || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const temp = questions[index];
    questions[index] = questions[targetIndex];
    questions[targetIndex] = temp;
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, questions },
    }));
  };


  return (
    <div className="space-y-6">
      {/* Top Workspace Header */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToDashboard}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                {formData.name}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Language: {formData.language === 'te' ? 'Telugu (తెలుగు)' : formData.language === 'hi' ? 'Hindi' : 'English'}
              </span>
              <span className="text-xs text-emerald-600 font-semibold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Isolated Workspace</span>
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">{formData.name} Studio</h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSaveTemplateModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            title="Save this configuration as a reusable template"
          >
            <BookmarkPlus className="w-4 h-4 text-slate-600" />
            <span>Save as Template</span>
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>

          {saveSuccess && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved!</span>
            </span>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-1 border-b border-slate-200 overflow-x-auto pb-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('setup')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'setup'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Template & Setup</span>
        </button>

        <button
          onClick={() => setActiveTab('voice')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'voice'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Voice Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'contacts'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Contacts & Import</span>
        </button>

        <button
          onClick={() => setActiveTab('campaign')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'campaign'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Outbound Calling Queue</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analytics & Reports</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: TEMPLATE & SETUP WORKFLOW */}
      {/* ========================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          {/* 1. Reusable Template Selection Bar */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">Reusable Template Selection</h3>
                <span className="text-[11px] font-medium text-slate-400">
                  ({availableTemplates.length} templates available)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {availableTemplates.map((t) => {
                const isSelected = (selectedTemplateId || currentTemplate?.id) === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTemplate(t.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{t.name}</span>
                        {t.isCustom && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-medium">{t.fields?.length || 0} Placeholders</span>
                      <span className={`font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {isSelected ? 'Active Template' : 'Click to Load'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Unresolved Placeholders Warning Banner */}
          {unresolvedPlaceholders.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-bold text-amber-800">
                  Unresolved Placeholders Detected ({unresolvedPlaceholders.length})
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  The following placeholders have not been filled in:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {unresolvedPlaceholders.map((key) => (
                    <span
                      key={key}
                      className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-amber-100 border border-amber-300 text-amber-900"
                    >
                      {`{{${key}}}`}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-amber-600 italic pt-1">
                  Compliance Rule: All placeholders must be resolved or safely sanitized before launching calls. Raw brackets like "{`{{key}}`}" are never spoken aloud over the phone.
                </p>
              </div>
            </div>
          )}

          {/* 3. Placeholder Form Fields */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Configurable Template Placeholders</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Populate each placeholder to customize the speech for your organization, campaign, or event.
                </p>
              </div>

              <button
                onClick={() => setShowAddCustomField(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Field</span>
              </button>
            </div>

            {/* Standard Template Placeholders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(currentTemplate?.fields || []).map((f) => {
                const currentVal = formData.config.placeholderValues?.[f.key] || '';
                const isMissing = f.required && !currentVal.trim();

                return (
                  <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                        <span>{f.label}</span>
                        {f.required ? (
                          <span className="text-rose-500 font-bold text-[10px]">*required</span>
                        ) : (
                          <span className="text-slate-400 font-normal text-[10px]">(optional)</span>
                        )}
                      </label>
                      <code className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {`{{${f.key}}}`}
                      </code>
                    </div>

                    {f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={currentVal}
                        onChange={(e) => handlePlaceholderChange(f.key, e.target.value)}
                        placeholder={f.placeholderText}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:ring-indigo-500 bg-white ${
                          isMissing ? 'border-amber-300 bg-amber-50/20' : 'border-slate-300'
                        }`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => handlePlaceholderChange(f.key, e.target.value)}
                        placeholder={f.placeholderText}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:ring-indigo-500 bg-white ${
                          isMissing ? 'border-amber-300 bg-amber-50/20' : 'border-slate-300'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom User-Defined Placeholders */}
            {(formData.config.customPlaceholders || []).length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Custom User-Defined Fields
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(formData.config.customPlaceholders || []).map((cf) => (
                    <div key={cf.key} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{cf.label}</span>
                        <div className="flex items-center space-x-2">
                          <code className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                            {`{{${cf.key}}}`}
                          </code>
                          <button
                            onClick={() => handleRemoveCustomField(cf.key)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remove field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={cf.value}
                        onChange={(e) => {
                          const updated = (formData.config.customPlaceholders || []).map((item) =>
                            item.key === cf.key ? { ...item, value: e.target.value } : item
                          );
                          setFormData((prev) => ({
                            ...prev,
                            config: { ...prev.config, customPlaceholders: updated },
                          }));
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        placeholder={`Enter value for {{${cf.key}}}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Live Script Preview & Editor (Dual View) */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Spoken Campaign Script</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review the exact words spoken by the voice agent in {formData.language === 'te' ? 'Telugu' : formData.language === 'hi' ? 'Hindi' : 'English'}.
                </p>
              </div>

              <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setPreviewMode('resolved')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    previewMode === 'resolved' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Resolved Live Preview</span>
                </button>
                <button
                  onClick={() => setPreviewMode('template')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    previewMode === 'template' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Template Source</span>
                </button>
              </div>
            </div>

            {previewMode === 'resolved' ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>What the Call Recipient Hears</span>
                  <span className={`text-[11px] ${isValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isValid ? '✓ All placeholders filled' : '⚠️ Unresolved tokens highlighted in red'}
                  </span>
                </div>
                <div
                  className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans"
                  dangerouslySetInnerHTML={{ __html: highlightedPreviewHtml }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={5}
                  value={activeScriptTemplate}
                  onChange={(e) => {
                    const text = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      config: {
                        ...prev.config,
                        ...(prev.type === 'public_survey' ? { surveyIntro: text } : {}),
                        ...(prev.type === 'political_campaign' ? { approvedScript: text } : {}),
                        ...(prev.type === 'marriage_event' ? { generatedScript: text } : {}),
                      },
                    }));
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed bg-white"
                  placeholder="Enter script with {{placeholders}}..."
                />
                <span className="text-[11px] text-slate-400">
                  Tip: Insert placeholders like <code className="text-indigo-600">{`{{organization_name}}`}</code>, <code className="text-indigo-600">{`{{candidate_name}}`}</code>, or custom fields.
                </span>
              </div>
            )}
          </div>

          {/* 5. Module-Specific Dynamic Controls */}
          {/* Public Survey Questions */}
          {formData.type === 'public_survey' && (
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Configurable Survey Questions
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add, edit, reorder questions and enable intelligent dynamic follow-ups based on citizen responses.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const qs = formData.config.questions || [];
                    const newQ: SurveyQuestion = {
                      id: `Q${qs.length + 1}`,
                      text: formData.language === 'te' ? 'మీ ప్రాంతంలో సమస్యల గురించి స్పందన...' : 'Please share your thoughts on...',
                      category: 'general',
                      allowFollowUp: true,
                    };
                    setFormData((prev) => ({
                      ...prev,
                      config: { ...prev.config, questions: [...qs, newQ] },
                    }));
                  }}
                  className="flex items-center space-x-1 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
              </div>

              <div className="space-y-3">
                {(formData.config.questions || []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No questions added yet. Click "Add Question" above.
                  </div>
                ) : (
                  (formData.config.questions || []).map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-start space-x-3.5"
                    >
                      <span className="font-mono text-xs font-bold text-indigo-600 mt-2">{idx + 1}.</span>
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => {
                            const updated = [...(formData.config.questions || [])];
                            updated[idx] = { ...updated[idx], text: e.target.value };
                            setFormData((prev) => ({
                              ...prev,
                              config: { ...prev.config, questions: updated },
                            }));
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex items-center space-x-3 text-xs">
                          <label className="flex items-center space-x-1.5 text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.allowFollowUp !== false}
                              onChange={(e) => {
                                const updated = [...(formData.config.questions || [])];
                                updated[idx] = { ...updated[idx], allowFollowUp: e.target.checked };
                                setFormData((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, questions: updated },
                                }));
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Dynamic Follow-up enabled</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 mt-1">
                        <button
                          onClick={() => handleMoveQuestion(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveQuestion(idx, 'down')}
                          disabled={idx === (formData.config.questions || []).length - 1}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const updated = (formData.config.questions || []).filter((_, i) => i !== idx);
                            setFormData((prev) => ({
                              ...prev,
                              config: { ...prev.config, questions: updated },
                            }));
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Political Campaign Keypad & Compliance */}
          {formData.type === 'political_campaign' && (
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center space-x-2">
                <Hash className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Interactive Keypad (DTMF) Response Prompts
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(formData.config.dtmfOptions || []).map((opt, i) => (
                  <div key={opt.digit} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-purple-700">Phone Keypad [{opt.digit}]</span>
                      <span className="text-[11px] text-slate-400 font-mono">Tone DTMF_{opt.digit}</span>
                    </div>
                    <input
                      type="text"
                      value={opt.labelEn}
                      onChange={(e) => {
                        const copy = [...(formData.config.dtmfOptions || [])];
                        copy[i].labelEn = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, dtmfOptions: copy },
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                      placeholder="Response action label"
                    />
                  </div>
                ))}
              </div>

              {/* Compliance & Safeguards Badge */}
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start space-x-3 text-indigo-950">
                <ShieldAlert className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold">Electoral & Telecom Compliance Enforcement</div>
                  <ul className="list-disc list-inside text-indigo-800 space-y-0.5 text-[11px]">
                    <li>Strict preservation of user-authored speech (Zero unsolicited AI-generated political persuasion)</li>
                    <li>Automated DND / National Opt-Out Registry filter prior to outbound calling</li>
                    <li>Express consent status verified on every imported constituent record</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Review Saved Configuration & Start Sequence Section */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Review Saved Configuration</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review your saved template settings and launch the sequential outbound calling sequence.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('contacts')}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Go to Contacts &amp; Calls</span>
                </button>
              </div>
            </div>

            {/* Sequence Error or Success feedback */}
            {sequenceError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                <span>{sequenceError}</span>
                <button onClick={() => setSequenceError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
                  Dismiss
                </button>
              </div>
            )}
            {sequenceSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                {sequenceSuccess}
              </div>
            )}

            {/* Configuration Summary Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Event Target</div>
                <div className="font-semibold text-slate-800 truncate mt-0.5">{formData.name}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Voice Delivery</div>
                <div className="font-semibold text-slate-800 truncate mt-0.5">
                  {currentTenant?.approvedVoiceName || 'ElevenLabs Cloned Voice'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Placeholders</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {unresolvedPlaceholders.length === 0 ? (
                    <span className="text-emerald-600 font-bold">All Resolved ✓</span>
                  ) : (
                    <span className="text-amber-600 font-bold">{unresolvedPlaceholders.length} Missing</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Calling Queue</div>
                <div className="font-semibold text-slate-800 mt-0.5">Strict Sequential (1/time)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: VOICE PROFILE ASSIGNMENT */}
      {/* ========================================================= */}
      {activeTab === 'voice' && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Voice Profile Assignment</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign an authorized cloned voice to speak for this campaign, or open the studio to record a new sample.
              </p>
            </div>

            <button
              onClick={() => setIsVoiceStudioOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Open Voice Studio & Profiles</span>
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-700">
                <Volume2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase">Currently Assigned Voice</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  {currentTenant?.eventVoiceProfiles?.[formData.type]?.voiceName ||
                  currentTenant?.eventVoiceProfiles?.[formData.type]?.approvedVoiceName
                    ? `${currentTenant?.eventVoiceProfiles?.[formData.type]?.voiceName || currentTenant?.eventVoiceProfiles?.[formData.type]?.approvedVoiceName} (Approved for ${formData.type.replace(/_/g, ' ')})`
                    : formData.selectedVoiceProfileId
                    ? `Profile ID: ${formData.selectedVoiceProfileId}`
                    : currentTenant?.approvedVoiceName
                    ? `${currentTenant.approvedVoiceName} (Approved Account Voice)`
                    : 'No voice profile assigned yet (Open Voice Studio to record or assign)'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Language capabilities: Telugu (te), Hindi (hi), English (en)
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsVoiceStudioOpen(true)}
              className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer"
            >
              Change Voice Profile
            </button>
          </div>

          {/* Audio Preview Section */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">Preview Cloned Voice Speech</h3>
            <p className="text-[11px] text-slate-500">
              Listen to your approved cloned voice speaking your event invitation script in natural conversational Telugu.
            </p>
            <VoiceAudioPlayer
              voiceProfileId={
                currentTenant?.eventVoiceProfiles?.[formData.type]?.providerVoiceId ||
                formData.selectedVoiceProfileId ||
                currentTenant?.approvedVoiceProfileId ||
                currentTenant?.approvedVoiceId ||
                (formData.type === 'marriage_event' ? '5IASxvpUK3p2EFjhO3pn' : 'WKyArUrP6hdAVp2kHYkw')
              }
              scriptText={renderedText || formData.config.approvedScript || formData.config.generatedScript || 'నమస్కారం! ఇది కాల్‌బ్రిడ్జ్ వాయిస్ ప్రివ్యూ.'}
              title="Play Cloned Voice Preview"
              eventId={event.id}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setActiveTab('contacts')}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <span>Continue to Contacts</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: CONTACTS & IMPORT DIRECTORY */}
      {/* ========================================================= */}
      {activeTab === 'contacts' && (
        <ContactManager
          eventId={event.id}
          eventName={formData.name}
          onSwitchToCalling={() => setActiveTab('campaign')}
        />
      )}



      {/* ========================================================= */}
      {/* TAB 5: OUTBOUND QUEUE */}
      {/* ========================================================= */}
      {activeTab === 'campaign' && (
        <OutboundQueueView
          eventId={event.id}
          eventName={formData.name}
          eventType={formData.type}
          voiceProfileId={formData.selectedVoiceProfileId}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 6: ANALYTICS & REPORTS */}
      {/* ========================================================= */}
      {activeTab === 'analytics' && (
        <AnalyticsView
          eventId={event.id}
          eventName={formData.name}
          eventType={formData.type}
          clientId={currentTenant?.id}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM FIELD */}
      {/* ========================================================= */}
      {showAddCustomField && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
            <h3 className="text-sm font-bold text-slate-900">Add Custom Field Placeholder</h3>
            <p className="text-xs text-slate-500">
              Define a new custom placeholder to use in your script (e.g., {`{{dignitary_name}}`}).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Field Label</label>
                <input
                  type="text"
                  value={customLabelInput}
                  onChange={(e) => {
                    setCustomLabelInput(e.target.value);
                    if (!customKeyInput) {
                      setCustomKeyInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                    }
                  }}
                  placeholder="e.g. Chief Guest"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Placeholder Key (will become {`{{key}}`})
                </label>
                <input
                  type="text"
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="e.g. chief_guest"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Value</label>
                <input
                  type="text"
                  value={customValueInput}
                  onChange={(e) => setCustomValueInput(e.target.value)}
                  placeholder="e.g. Sri Rama Krishna Garu"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowAddCustomField(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomField}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SAVE AS REUSABLE TEMPLATE */}
      {/* ========================================================= */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
            <h3 className="text-sm font-bold text-slate-900">Save Configuration as Template</h3>
            <p className="text-xs text-slate-500">
              Save your current script, placeholders, and questions so you can reuse them in future events.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Ward 12 Civic Feedback Template"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="Brief summary of when to use this template"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={isSavingTemplate || !newTemplateName.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {isSavingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Shared Voice Studio Modal */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
        currentTenant={currentTenant || null}
        selectedVoiceId={formData.selectedVoiceProfileId}
        eventType={formData.type}
        eventId={formData.id}
        onSelectVoice={(profile) => {
          setFormData((prev) => ({
            ...prev,
            selectedVoiceProfileId: profile.providerVoiceId || profile.id,
          }));
        }}
      />
    </div>
  );
}
