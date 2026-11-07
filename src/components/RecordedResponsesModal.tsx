import React, { useState } from 'react';
import { SurveyConfig, CapturedAnswer, ChatMessage } from '../types';
import { X, Copy, Check, Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface RecordedResponsesModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveyConfig: SurveyConfig;
  capturedAnswers: Record<string, CapturedAnswer>;
  messages: ChatMessage[];
  overallSummary?: string;
}

export const RecordedResponsesModal: React.FC<RecordedResponsesModalProps> = ({
  isOpen,
  onClose,
  surveyConfig,
  capturedAnswers,
  messages,
  overallSummary,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'responses' | 'transcript'>('responses');

  if (!isOpen) return null;

  const answeredCount = Object.values(capturedAnswers).filter((a) => a.status === 'answered').length;
  const refusedCount = Object.values(capturedAnswers).filter((a) => a.status === 'refused').length;
  const totalCount = surveyConfig.questions.length;

  const exportPayload = {
    surveyId: surveyConfig.id,
    surveyTitle: surveyConfig.title,
    language: 'Telugu (తెలుగు)',
    exportedAt: new Date().toISOString(),
    metrics: {
      totalQuestions: totalCount,
      answered: answeredCount,
      refused: refusedCount,
      pending: totalCount - (answeredCount + refusedCount),
    },
    overallSummary: overallSummary || 'సర్వే కొనసాగుతోంది',
    responses: surveyConfig.questions.map((q) => {
      const recorded = capturedAnswers[q.id];
      return {
        questionId: q.id,
        questionText: q.text,
        category: q.category || 'సాధారణ',
        status: recorded?.status || 'pending',
        answerSummary: recorded?.answerSummary || 'ఇంకా నమోదు కాలేదు',
      };
    }),
    transcript: messages.map((m) => ({
      role: m.role,
      speaker: m.role === 'agent' ? 'తెలుగు పబ్లిక్ సర్వే ఏజెంట్' : 'ప్రతిస్పందకుడు',
      text: m.text,
      time: m.timestamp,
    })),
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telugu-survey-record-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-sm">
              తె
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                నమోదైన సర్వే సమాచారం & సంభాషణ రికార్డు
              </h2>
              <p className="text-xs text-zinc-500">
                {surveyConfig.title} • {answeredCount} సమాధానాలు, {refusedCount} నిరాకరించబడ్డాయి (మొత్తం: {totalCount})
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

        {/* Tab switcher */}
        <div className="flex items-center gap-4 px-6 pt-3 border-b border-zinc-200 text-xs font-medium">
          <button
            onClick={() => setActiveTab('responses')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'responses'
                ? 'border-emerald-800 text-emerald-900 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            సేకరించిన సమాధానాలు ({answeredCount}/{totalCount})
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'transcript'
                ? 'border-emerald-800 text-emerald-900 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            పూర్తి సంభాషణ ట్రాన్స్‌క్రిప్ట్ ({messages.length} సందేశాలు)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
          {activeTab === 'responses' && (
            <div className="space-y-3">
              {overallSummary && (
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-950 leading-relaxed">
                  <span className="font-semibold block text-emerald-900 mb-1">
                    ఏజెంట్ అందించిన సర్వే సారాంశం (Agent Summary):
                  </span>
                  {overallSummary}
                </div>
              )}

              {totalCount === 0 ? (
                <p className="text-center py-8 text-zinc-400 text-xs">
                  ప్రస్తుతం ప్రశ్నలు కాన్ఫిగర్ చేయబడలేదు.
                </p>
              ) : (
                surveyConfig.questions.map((q, idx) => {
                  const item = capturedAnswers[q.id];
                  const isAnswered = item?.status === 'answered';
                  const isRefused = item?.status === 'refused';

                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-medium text-zinc-900">
                          <span className="text-emerald-800 font-bold mr-1.5">{idx + 1}.</span>
                          {q.text}
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                            isAnswered
                              ? 'bg-emerald-100 text-emerald-800'
                              : isRefused
                              ? 'bg-zinc-200 text-zinc-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isAnswered ? 'నమోదైంది' : isRefused ? 'నిరాకరణ' : 'వేచి ఉంది'}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-700 bg-white p-2.5 rounded-lg border border-zinc-200">
                        <span className="text-zinc-400 block text-[10px] mb-0.5">సారాంశం:</span>
                        {item ? item.answerSummary : 'ఇంకా నమోదు కాలేదు'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-lg border text-xs leading-relaxed ${
                    m.role === 'agent'
                      ? 'bg-emerald-50/40 border-emerald-200 text-zinc-900'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold mb-1 text-[11px]">
                    <span className={m.role === 'agent' ? 'text-emerald-800' : 'text-zinc-700'}>
                      {m.role === 'agent' ? 'తెలుగు పబ్లిక్ సర్వే ఏజెంట్' : 'ప్రతిస్పందకుడు'}
                    </span>
                    <span className="text-zinc-400 font-normal">{m.timestamp}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 bg-zinc-50">
          <div className="text-[11px] text-zinc-500">
            మొత్తం రికార్డుల ఎగుమతి అందుబాటులో ఉంది (JSON format)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJSON}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'కాపీ అయింది' : 'JSON కాపీ'}</span>
            </button>
            <button
              onClick={handleDownloadJSON}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>డౌన్‌లోడ్</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
