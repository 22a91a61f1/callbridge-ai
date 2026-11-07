import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Settings,
  Mic,
  Users,
  PhoneCall,
  BarChart3,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  AlertCircle,
  HelpCircle,
  Volume2,
  X,
  FileQuestion,
  Edit2,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  Play,
  RefreshCw,
} from 'lucide-react';
import { EventRecord, SurveyQuestion, TenantUser } from '../types/callbridge';
import { ContactManager } from './ContactManager';
import { OutboundQueueView } from './OutboundQueueView';
import { AnalyticsView } from './AnalyticsView';
import { VoiceStudioModal } from './VoiceStudioModal';
import { VoiceAudioPlayer } from './VoiceAudioPlayer';
import { SURVEY_A_PUBLIC_FACILITIES } from '../presetSurveys';

// Exact canonical 10 questions from application preset surveys
export const CANONICAL_DEFAULT_10_QUESTIONS: SurveyQuestion[] = SURVEY_A_PUBLIC_FACILITIES.questions.map(
  (q, idx) => ({
    id: q.id || `A${idx + 1}`,
    questionId: q.id || `A${idx + 1}`,
    text: q.text,
    questionText: q.text,
    category: q.category || 'జనరల్',
    allowFollowUp: true,
    enabled: true,
    questionOrder: idx + 1,
    questionType: 'open_ended',
  })
);

interface PublicSurveyWorkspaceProps {
  event: EventRecord;
  currentTenant?: TenantUser | null;
  onBackToDashboard: () => void;
  onUpdateEvent: (updated: EventRecord) => void;
}

type TabType = 'setup' | 'voice' | 'contacts' | 'campaign' | 'analytics';

export function PublicSurveyWorkspace({
  event,
  currentTenant,
  onBackToDashboard,
  onUpdateEvent,
}: PublicSurveyWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabType>('setup');
  const [formData, setFormData] = useState<EventRecord>({ ...event });

  const [questions, setQuestions] = useState<SurveyQuestion[]>(() => {
    if (event.config.questions && event.config.questions.length > 0) {
      return event.config.questions.map((q, idx) => ({
        ...q,
        enabled: q.enabled !== false,
        questionOrder: q.questionOrder || idx + 1,
      }));
    }
    return [...CANONICAL_DEFAULT_10_QUESTIONS];
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isStartingSequence, setIsStartingSequence] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const [sequenceSuccess, setSequenceSuccess] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);

  const handleStartSequence = async () => {
    if (isStartingSequence) return;
    setIsStartingSequence(true);
    setSequenceError(null);
    setSequenceSuccess(null);
    try {
      await handleSaveQuestions();

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

  // Custom Question Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  // Delete Confirmation State
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);

  // Editing state per question
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Load questions from backend API
  const fetchQuestions = async () => {
    try {
      const res = await fetch(`/api/callbridge/events/${event.id}/questions`);
      const data = await res.json();
      if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(
          data.questions.map((q: any, idx: number) => ({
            id: q.questionId || q.id || `A${idx + 1}`,
            questionId: q.questionId || q.id || `A${idx + 1}`,
            text: q.questionText || q.text,
            questionText: q.questionText || q.text,
            category: q.category || 'జనరల్',
            enabled: q.enabled !== false,
            allowFollowUp: q.allowFollowUp !== false,
            questionType: q.questionType || 'open_ended',
            questionOrder: q.questionOrder || idx + 1,
          }))
        );
      }
    } catch (e) {
      console.warn('Error fetching questions from API:', e);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [event.id]);

  useEffect(() => {
    setFormData({ ...event });
  }, [event]);

  // Question Management Handlers
  const handleAddQuestion = () => {
    setValidationError(null);
    const newOrder = questions.length + 1;
    const newId = `A${newOrder}`;
    const defaultPlaceholderText =
      formData.language === 'te'
        ? 'మీ ప్రాంతంలో ఇతర సదుపాయాల గురించి మీ అభిప్రాయం ఏమిటి?'
        : formData.language === 'hi'
        ? 'आपके क्षेत्र में अन्य जन सुविधाओं के बारे में आपकी क्या राय है?'
        : 'What is your opinion regarding other civic amenities in your locality?';

    const newQ: SurveyQuestion = {
      id: newId,
      questionId: newId,
      text: defaultPlaceholderText,
      questionText: defaultPlaceholderText,
      category: formData.language === 'te' ? 'అదనపు అంశం' : 'General',
      allowFollowUp: true,
      enabled: true,
      questionOrder: newOrder,
      questionType: 'open_ended',
    };
    setQuestions([...questions, newQ]);
  };

  const handleAddCustomQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;

    const newOrder = questions.length + 1;
    const newId = `C${newOrder}`;
    const newQ: SurveyQuestion = {
      id: newId,
      questionId: newId,
      text: customText.trim(),
      questionText: customText.trim(),
      category: customCategory.trim() || (formData.language === 'te' ? 'కస్టమ్ ప్రశ్న' : 'Custom'),
      allowFollowUp: true,
      enabled: true,
      questionOrder: newOrder,
      questionType: 'open_ended',
    };

    setQuestions([...questions, newQ]);
    setCustomText('');
    setCustomCategory('');
    setShowCustomModal(false);
  };

  const handleUpdateQuestionText = (index: number, text: string) => {
    setValidationError(null);
    const updated = [...questions];
    updated[index] = { ...updated[index], text, questionText: text };
    setQuestions(updated);
  };

  const handleUpdateQuestionCategory = (index: number, category: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], category };
    setQuestions(updated);
  };

  const handleToggleEnable = (index: number) => {
    const updated = [...questions];
    const currentEnabled = updated[index].enabled !== false;
    updated[index] = {
      ...updated[index],
      enabled: !currentEnabled,
    };
    setQuestions(updated);
  };

  const handleToggleFollowUp = (index: number) => {
    const updated = [...questions];
    updated[index] = {
      ...updated[index],
      allowFollowUp: updated[index].allowFollowUp === false,
    };
    setQuestions(updated);
  };

  const confirmDeleteQuestion = (index: number) => {
    setDeleteTargetIndex(index);
  };

  const executeDeleteQuestion = () => {
    if (deleteTargetIndex === null) return;
    setValidationError(null);
    const updated = questions.filter((_, i) => i !== deleteTargetIndex);
    // Re-index questions
    const reindexed = updated.map((q, idx) => ({
      ...q,
      questionOrder: idx + 1,
    }));
    setQuestions(reindexed);
    setDeleteTargetIndex(null);
    setEditingIndex(null);
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    // Update order
    const reordered = updated.map((q, idx) => ({
      ...q,
      questionOrder: idx + 1,
    }));
    setQuestions(reordered);
  };

  const handleRestoreDefaultQuestions = () => {
    setValidationError(null);
    setQuestions([...CANONICAL_DEFAULT_10_QUESTIONS]);
  };

  const handleSaveQuestions = async () => {
    if (questions.length === 0) {
      setValidationError('Please configure at least one survey question before saving.');
      return;
    }

    const emptyIndex = questions.findIndex((q) => !q.text || !q.text.trim());
    if (emptyIndex !== -1) {
      setValidationError(`Question ${emptyIndex + 1} cannot be empty. Please enter question text or delete it.`);
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const formattedQuestions = questions.map((q, idx) => ({
        id: q.id || `A${idx + 1}`,
        questionId: q.questionId || q.id || `A${idx + 1}`,
        surveyId: event.id,
        questionText: q.text || q.questionText || '',
        text: q.text || q.questionText || '',
        category: q.category || 'జనరల్',
        questionType: q.questionType || 'open_ended',
        allowFollowUp: q.allowFollowUp !== false,
        enabled: q.enabled !== false,
        questionOrder: idx + 1,
      }));

      // 1. Bulk save to dedicated questions API
      await fetch(`/api/callbridge/events/${event.id}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: formattedQuestions }),
      });

      // 2. Sync to event config
      const payload: EventRecord = {
        ...formData,
        config: {
          ...formData.config,
          questions: formattedQuestions,
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
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.warn('Failed to save survey questions:', err);
      setValidationError('Failed to save questions to server. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = questions.filter((q) => q.enabled !== false).length;

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
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Public Survey Workspace
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {enabledCount} of {questions.length} Questions Enabled
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">{formData.name}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>Preview Survey Flow</span>
          </button>

          <button
            onClick={handleSaveQuestions}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Questions'}</span>
          </button>

          {saveSuccess && (
            <span className="flex items-center space-x-1 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </span>
          )}
        </div>
      </div>

      {/* Workspace Tabs Navigation (Live Test Call Completely Removed) */}
      <div className="flex overflow-x-auto space-x-1 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('setup')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'setup'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Survey Questions ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('voice')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'voice'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Voice Profile & Audio</span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'contacts'
              ? 'border-blue-600 text-blue-600 font-bold'
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
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Sequential Calling Queue</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analytics & Reports</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SURVEY QUESTIONS MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          {validationError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-bold text-rose-900">Validation Notice</div>
                <p className="text-xs text-rose-700">{validationError}</p>
              </div>
            </div>
          )}

          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-slate-900">Configured Survey Questions</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    {questions.length} Total ({enabledCount} Active)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  The voice agent asks these questions in configured sequence. Use checkboxes to enable or disable questions, reorder via Up/Down buttons, or add custom questions.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAddQuestion}
                  className="flex items-center space-x-1 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>

                <button
                  onClick={() => setShowCustomModal(true)}
                  className="flex items-center space-x-1 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <FileQuestion className="w-3.5 h-3.5" />
                  <span>Add Custom Question</span>
                </button>

                <button
                  onClick={handleRestoreDefaultQuestions}
                  className="flex items-center space-x-1 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  title="Restore the 10 canonical public survey questions"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Restore 10 Questions</span>
                </button>

                <button
                  onClick={handleSaveQuestions}
                  disabled={isSaving}
                  className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Questions'}</span>
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3.5 pt-2">
              {questions.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
                  <p className="text-sm font-semibold text-slate-600">No questions configured.</p>
                  <button
                    onClick={handleRestoreDefaultQuestions}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Restore 10 Canonical Questions
                  </button>
                </div>
              ) : (
                questions.map((q, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === questions.length - 1;
                  const isEnabled = q.enabled !== false;
                  const isEditing = editingIndex === idx;

                  return (
                    <div
                      key={q.id || `q_${idx}`}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isEnabled
                          ? 'border-slate-200 bg-white hover:border-blue-300 shadow-xs'
                          : 'border-slate-200 bg-slate-100/60 opacity-60'
                      }`}
                    >
                      {/* Top Header: Order, Enable Checkbox, Category, Controls */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-3">
                          {/* Enable/Disable Toggle */}
                          <label className="flex items-center space-x-1.5 cursor-pointer" title="Enable or disable this question">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handleToggleEnable(idx)}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-[11px] font-bold uppercase text-slate-600">
                              {isEnabled ? 'Active' : 'Disabled'}
                            </span>
                          </label>

                          <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Question {idx + 1} {q.id ? `(${q.id})` : ''}
                          </span>

                          {q.category && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {q.category}
                            </span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => setEditingIndex(isEditing ? null : idx)}
                            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer ${
                              isEditing
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                            }`}
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="text-[10px]">{isEditing ? 'Done' : 'Edit'}</span>
                          </button>

                          <button
                            onClick={() => handleMoveQuestion(idx, 'up')}
                            disabled={isFirst}
                            className={`p-1.5 rounded-lg border text-slate-600 transition-colors ${
                              isFirst
                                ? 'opacity-30 cursor-not-allowed border-slate-100'
                                : 'border-slate-200 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                            }`}
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleMoveQuestion(idx, 'down')}
                            disabled={isLast}
                            className={`p-1.5 rounded-lg border text-slate-600 transition-colors ${
                              isLast
                                ? 'opacity-30 cursor-not-allowed border-slate-100'
                                : 'border-slate-200 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                            }`}
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => confirmDeleteQuestion(idx)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer ml-1"
                            title="Delete Question"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Question Text Area */}
                      <div>
                        <textarea
                          rows={2}
                          value={q.text || q.questionText || ''}
                          onChange={(e) => handleUpdateQuestionText(idx, e.target.value)}
                          placeholder="Enter survey question text..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-sans leading-relaxed"
                        />
                      </div>

                      {/* Extended settings when editing */}
                      {isEditing && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] text-slate-500 font-semibold">Category Tag:</span>
                            <input
                              type="text"
                              value={q.category || ''}
                              onChange={(e) => handleUpdateQuestionCategory(idx, e.target.value)}
                              placeholder="e.g. తాగునీరు"
                              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 w-40"
                            />
                          </div>

                          <label className="flex items-center space-x-2 text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.allowFollowUp !== false}
                              onChange={() => handleToggleFollowUp(idx)}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-[11px] font-medium">Allow dynamic follow-up if answer is brief</span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                All enabled questions are automatically integrated into the voice agent telephone call script.
              </span>
              <button
                onClick={handleSaveQuestions}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Questions'}</span>
              </button>
            </div>
          </div>

          {/* Review Saved Configuration & Start Sequence Section */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Review Saved Configuration</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review your persisted questions configuration and launch the sequential survey calling sequence.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSaveQuestions}
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Questions'}</span>
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
                <div className="text-[10px] font-bold text-slate-400 uppercase">Survey Target</div>
                <div className="font-semibold text-slate-800 truncate mt-0.5">{formData.name}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Voice Delivery</div>
                <div className="font-semibold text-slate-800 truncate mt-0.5">
                  {currentTenant?.approvedVoiceName || 'ElevenLabs Cloned Voice'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Active Questions</div>
                <div className="font-semibold text-emerald-700 font-bold mt-0.5">
                  {enabledCount} of {questions.length} Enabled ✓
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
      {/* TAB 2: VOICE PROFILE & PREVIEW */}
      {/* ========================================================= */}
      {activeTab === 'voice' && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Authorized Spoken Voice Profile</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic ElevenLabs cloned voice configured for this public survey.
              </p>
            </div>

            <button
              onClick={() => setIsVoiceStudioOpen(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Voice Studio (Record / Clone)</span>
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 flex items-start space-x-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-blue-950">
                {currentTenant?.approvedVoiceName || formData.selectedVoiceProfileId || 'Approved Voice: rishi'}
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Your approved cloned voice conducts this survey over the telephone, asking enabled civic questions in natural conversational Telugu.
              </p>
              <div className="pt-2 flex items-center space-x-3">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Approved &amp; Ready
                </span>
                <span className="text-[11px] text-slate-500">Provider: ElevenLabs (eleven_v4_turbo)</span>
              </div>
            </div>
          </div>

          {/* Audio Preview Section */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">Preview Voice Speech</h3>
            <p className="text-[11px] text-slate-500">
              Listen to your approved cloned voice speaking question 1 in natural Telugu.
            </p>
            <VoiceAudioPlayer
              voiceProfileId={currentTenant?.eventVoiceProfiles?.['public_survey']?.providerVoiceId || formData.selectedVoiceProfileId || 'AZnzlk1XvdvUeBnXmlld'}
              scriptText={questions[0]?.text || 'నమస్కారం! మీ ప్రాంతంలో తాగునీటి సరఫరా ఎలా ఉంది?'}
              title="Play Survey Question 1"
              eventId={event.id}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setActiveTab('contacts')}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <span>Continue to Contacts</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: CONTACTS & IMPORT */}
      {/* ========================================================= */}
      {activeTab === 'contacts' && (
        <ContactManager
          eventId={event.id}
          eventName={formData.name}
          onSwitchToCalling={() => setActiveTab('campaign')}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 4: OUTBOUND CALLING QUEUE */}
      {/* ========================================================= */}
      {activeTab === 'campaign' && (
        <OutboundQueueView
          eventId={event.id}
          eventName={formData.name}
          voiceProfileId={formData.selectedVoiceProfileId}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 5: ANALYTICS & REPORTS */}
      {/* ========================================================= */}
      {activeTab === 'analytics' && (
        <AnalyticsView
          eventId={event.id}
          eventType="public_survey"
        />
      )}

      {/* ========================================================= */}
      {/* CUSTOM QUESTION MODAL */}
      {/* ========================================================= */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Custom Survey Question</h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomQuestionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Question Text (Telugu / English) *
                </label>
                <textarea
                  rows={3}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="e.g. మీ ప్రాంతంలో గ్రంథాలయ సౌకర్యం అందుబాటులో ఉందా?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category Tag
                </label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. విద్యా వసతులు"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Add Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {deleteTargetIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Confirm Delete Question</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete Question {deleteTargetIndex + 1}?
              <br />
              <strong className="text-slate-800">
                "{questions[deleteTargetIndex]?.text || questions[deleteTargetIndex]?.questionText}"
              </strong>
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteTargetIndex(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteQuestion}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Delete Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Studio Modal */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
        currentTenant={currentTenant || null}
        eventType="public_survey"
        eventId={event.id}
        onSelectVoice={(profile) => {
          setFormData((prev) => ({
            ...prev,
            selectedVoiceProfileId: profile.elevenLabsVoiceId || profile.providerVoiceId || profile.id,
          }));
          setIsVoiceStudioOpen(false);
        }}
      />
    </div>
  );
}
