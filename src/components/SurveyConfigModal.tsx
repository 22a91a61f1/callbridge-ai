import React, { useState } from 'react';
import { SurveyConfig, SurveyQuestion } from '../types';
import { PRESET_SURVEYS } from '../presetSurveys';
import { X, Plus, Trash2, BookOpen, Layers, Check, AlertTriangle } from 'lucide-react';

interface SurveyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: SurveyConfig;
  onApplyConfig: (config: SurveyConfig) => void;
}

export const SurveyConfigModal: React.FC<SurveyConfigModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onApplyConfig,
}) => {
  const [title, setTitle] = useState(currentConfig.title);
  const [description, setDescription] = useState(currentConfig.description);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(currentConfig.questions);
  const [knowledgeBase, setKnowledgeBase] = useState(currentConfig.knowledgeBase);
  const [newQuestionText, setNewQuestionText] = useState('');

  if (!isOpen) return null;

  const handleLoadPreset = (preset: SurveyConfig) => {
    setTitle(preset.title);
    setDescription(preset.description);
    setQuestions(preset.questions);
    setKnowledgeBase(preset.knowledgeBase);
  };

  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) return;
    const newQ: SurveyQuestion = {
      id: `q${questions.length + 1}`,
      text: newQuestionText.trim(),
      category: 'ప్రజా ప్రశ్న',
    };
    setQuestions([...questions, newQ]);
    setNewQuestionText('');
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleClearAllQuestions = () => {
    setQuestions([]);
    setTitle('డెవలప్‌మెంట్ దశ (ప్రశ్నలు కాన్ఫిగర్ చేయబడలేదు)');
    setDescription('సర్వే ప్రశ్నలు ఇంకా అందించబడని ప్రారంభ దశ');
    setKnowledgeBase('');
  };

  const handleSaveAndStart = () => {
    const updatedConfig: SurveyConfig = {
      id: `config-${Date.now()}`,
      title: title.trim() || 'ప్రజా సర్వే',
      description: description.trim(),
      targetLanguage: 'Telugu',
      questions,
      knowledgeBase,
    };

    onApplyConfig(updatedConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-zinc-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-sm">
              తె
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                సర్వే ప్రశ్నలు & సమాచార నిధి (Knowledge Base)
              </h2>
              <p className="text-xs text-zinc-500">
                తెలుగు పబ్లిక్ సర్వే ఏజెంట్‌కు ప్రశ్నలు మరియు అధికారిక సమాచారాన్ని అందించండి.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Quick presets */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider block mb-2">
              సిద్ధంగా ఉన్న సర్వే టెంప్లేట్‌లు (Presets):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_SURVEYS.map((preset) => {
                const isSelected = title === preset.title;
                const isUnconfigured = preset.questions.length === 0;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset)}
                    className={`text-left p-3 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? 'border-emerald-700 bg-emerald-50/60 font-medium ring-1 ring-emerald-700'
                        : 'border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-zinc-900 truncate">
                        {preset.title}
                      </span>
                      {isUnconfigured && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                          ప్రశ్నలు లేవు
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Survey Title */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider block mb-1.5">
              సర్వే శీర్షిక (Survey Title):
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ఉదాహరణ: ప్రజా రవాణా సర్వే 2026"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3.5 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {/* Questions list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                కాన్ఫిగర్ చేసిన సర్వే ప్రశ్నలు ({questions.length}):
              </label>
              <button
                type="button"
                onClick={handleClearAllQuestions}
                className="text-xs text-rose-600 hover:text-rose-700 hover:underline"
              >
                అన్ని ప్రశ్నలను తొలగించు (ప్రశ్నలు లేని స్థితిని పరీక్షించండి)
              </button>
            </div>

            {questions.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  ప్రస్తుతం ఎటువంటి సర్వే ప్రశ్నలు లేవు (Development Phase)
                </div>
                ఇప్పుడు ఏజెంట్ ఎటువంటి ప్రశ్నను సొంతంగా సృష్టించదు. "ప్రస్తుతం సర్వే ప్రశ్నలు ఇంకా కాన్ఫిగర్ చేయబడలేదు" అని స్వచ్ఛమైన తెలుగులో సమాధానమిస్తుంది.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 text-xs"
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-emerald-800 shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="text-zinc-800">{q.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(q.id)}
                      className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                      title="తొలగించు"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add question */}
            <div className="flex items-center gap-2 mt-2.5">
              <input
                type="text"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddQuestion();
                  }
                }}
                placeholder="కొత్త సర్వే ప్రశ్నను తెలుగులో టైప్ చేయండి..."
                className="flex-1 bg-white border border-zinc-300 rounded-lg px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={!newQuestionText.trim()}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 text-xs font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                చేర్చు
              </button>
            </div>
          </div>

          {/* Official Survey Knowledge Base */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                అధికారిక సర్వే సమాచార నిధి (Knowledge Base):
              </label>
              <span className="text-[11px] text-zinc-500">
                సర్వేకు సంబంధించిన వాస్తవాలు, హెల్ప్‌లైన్లు, సంస్థ వివరాలు
              </span>
            </div>
            <textarea
              rows={5}
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              placeholder="ఇక్కడ సర్వే అధికారిక వివరాలను నమోదు చేయండి (నిర్వహణ సంస్థ, హెల్ప్‌లైన్, గోప్యతా నియమాలు మొదలైనవి)..."
              className="w-full bg-zinc-50 border border-zinc-300 rounded-lg p-3 text-xs text-zinc-900 font-sans focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              ఏజెంట్ ఈ సమాచార నిధిలో ఉన్న వివరాలను మాత్రమే ప్రతిస్పందకుడికి తెలియజేస్తుంది. ఎటువంటి సమాచారాన్ని ఊహించి చెప్పదు.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            రద్దు చేయి
          </button>
          <button
            type="button"
            onClick={handleSaveAndStart}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-colors shadow-xs"
          >
            కాన్ఫిగరేషన్‌ను వర్తింపజేసి సంభాషణ ప్రారంభించండి
          </button>
        </div>
      </div>
    </div>
  );
};
