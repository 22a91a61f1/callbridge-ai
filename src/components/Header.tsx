import React from 'react';
import { Volume2, VolumeX, FileText, RotateCcw, BookOpen, CheckCircle, PauseCircle, Radio } from 'lucide-react';

interface HeaderProps {
  surveyTitle: string;
  status: 'configuring' | 'active' | 'completed' | 'stopped';
  onOpenConfig: () => void;
  onOpenData: () => void;
  onReset: () => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  totalQuestions: number;
  addressedQuestionsCount: number;
  hasQuestions: boolean;
  activeVoiceId?: string | null;
  onJumpToVoiceSection?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  surveyTitle,
  status,
  onOpenConfig,
  onOpenData,
  onReset,
  autoSpeak,
  onToggleAutoSpeak,
  totalQuestions,
  addressedQuestionsCount,
  hasQuestions,
  activeVoiceId,
  onJumpToVoiceSection,
}) => {
  return (
    <header className="border-b border-zinc-200 bg-white/95 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Left: Branding & Current Survey */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
            తె
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold tracking-tight text-zinc-900">
                తెలుగు పబ్లిక్ సర్వే AI వాయిస్ ఏజెంట్
              </h1>
              
              {!hasQuestions && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                  డెవలప్‌మెంట్ దశ (ప్రశ్నలు లేవు)
                </span>
              )}

              {hasQuestions && status === 'active' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  సర్వే అమలులో ఉంది
                </span>
              )}

              {status === 'completed' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
                  <CheckCircle className="w-3 h-3 mr-1 text-blue-600" />
                  సర్వే పూర్తయింది
                </span>
              )}

              {status === 'stopped' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                  <PauseCircle className="w-3 h-3 mr-1 text-zinc-600" />
                  ఆపబడింది
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 truncate max-w-xs sm:max-w-md mt-0.5" title={surveyTitle}>
              {surveyTitle}
            </p>
          </div>
        </div>

        {/* Right: Controls & Language indicator */}
        <div className="flex items-center flex-wrap gap-2 justify-end">
          {/* Strictly Telugu Language Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>భాష: తెలుగు (Telugu Only)</span>
          </div>

          {/* Client Voice Active Badge */}
          {activeVoiceId && (
            <button
              onClick={onJumpToVoiceSection}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 transition-colors shadow-2xs"
              title={`క్లయింట్ వాయిస్ యాక్టివ్: ${activeVoiceId} (ElevenLabs)`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              <span>క్లయింట్ వాయిస్: Active</span>
            </button>
          )}

          {/* Progress badge if questions configured */}
          {hasQuestions && (
            <button
              onClick={onOpenData}
              id="view-progress-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
              title="సేకరించిన సమాధానాలు చూడండి (View recorded answers)"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                {addressedQuestionsCount}/{totalQuestions} నమోదు
              </span>
            </button>
          )}

          {/* Voice Speech Toggle */}
          <button
            onClick={onToggleAutoSpeak}
            id="speech-toggle-btn"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              autoSpeak
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
            }`}
            title={autoSpeak ? 'వాయిస్ ప్లేబ్యాక్: ఆన్ (క్లిక్ చేసి మ్యూట్ చేయవచ్చు)' : 'వాయిస్ ప్లేబ్యాక్: ఆఫ్ (ఆడియో వినడానికి క్లిక్ చేయండి)'}
          >
            {autoSpeak ? <Volume2 className="w-3.5 h-3.5 text-emerald-700" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{autoSpeak ? 'వాయిస్ ఆన్' : 'వాయిస్ ఆఫ్'}</span>
          </button>

          {/* Survey Knowledge & Questions Drawer trigger */}
          <button
            onClick={onOpenConfig}
            id="open-survey-config-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-xs"
            title="సర్వే ప్రశ్నలు మరియు సమాచారాన్ని కాన్ఫిగర్ చేయండి"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>సర్వే సెటప్ & ప్రశ్నలు</span>
          </button>

          {/* Reset session button */}
          <button
            onClick={onReset}
            id="reset-survey-btn"
            className="p-1.5 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
            title="సంభాషణను మొదటి నుండి ప్రారంభించండి"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
