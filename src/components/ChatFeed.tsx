import React, { useEffect, useRef } from 'react';
import { ChatMessage, SupportedLanguage } from '../types';
import { Volume2, CheckCircle2, HelpCircle, StopCircle, RefreshCw, User, Bot, AlertCircle } from 'lucide-react';

interface ChatFeedProps {
  messages: ChatMessage[];
  isLoading: boolean;
  language: SupportedLanguage;
  surveyComplete: boolean;
  surveyStopped: boolean;
  hasQuestions: boolean;
  onOpenData: () => void;
  onRestart: () => void;
  onOpenConfig: () => void;
  onPlayMessageAudio?: (text: string) => void;
  activeVoiceId?: string | null;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  isLoading,
  language,
  surveyComplete,
  surveyStopped,
  hasQuestions,
  onOpenData,
  onRestart,
  onOpenConfig,
  onPlayMessageAudio,
  activeVoiceId,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5 max-w-4xl mx-auto w-full">
      {/* Dev Phase alert if no questions configured */}
      {!hasQuestions && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950">
                డెవలప్‌మెంట్ దశ: సర్వే ప్రశ్నలు ఇంకా కాన్ఫిగర్ చేయబడలేదు
              </p>
              <p className="text-amber-800 text-xs mt-0.5">
                ఏజెంట్ ఎటువంటి ప్రశ్నను సొంతంగా సృష్టించదు. ప్రశ్నలను సెటప్ చేయడానికి లేదా ముందే సిద్ధం చేసిన పబ్లిక్ సర్వేను ఎంచుకోవడానికి కాన్ఫిగరేషన్‌ను తెరవండి.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenConfig}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-800 text-white hover:bg-amber-900 transition-colors text-xs font-medium"
          >
            ప్రశ్నలను కాన్ఫిగర్ చేయండి
          </button>
        </div>
      )}

      {/* Messages */}
      {messages.map((message) => {
        const isAgent = message.role === 'agent';
        return (
          <div
            key={message.id}
            id={`message-${message.id}`}
            className={`flex items-start gap-3 ${isAgent ? 'justify-start' : 'justify-end'}`}
          >
            {isAgent && (
              <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs font-semibold text-xs">
                ఏజెంట్
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                isAgent
                  ? 'bg-white border border-zinc-200/90 text-zinc-900 shadow-xs'
                  : 'bg-zinc-900 text-white shadow-xs'
              }`}
            >
              {/* Header inside bubble */}
              <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-zinc-100/30">
                <span
                  className={`text-xs font-semibold ${
                    isAgent ? 'text-emerald-900' : 'text-zinc-300'
                  }`}
                >
                  {isAgent ? 'తెలుగు పబ్లిక్ సర్వే ఏజెంట్' : 'పౌరుడు / ప్రతిస్పందకుడు'}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400">
                    {message.timestamp}
                  </span>

                  {isAgent && onPlayMessageAudio && (
                    <button
                      onClick={() => {
                        onPlayMessageAudio(message.text);
                      }}
                      className="text-zinc-400 hover:text-emerald-800 p-0.5 transition-colors"
                      title={activeVoiceId ? `క్లోన్ చేసిన వాయిస్ (${activeVoiceId}) వినండి` : 'తెలుగు వాయిస్ ఆడియో వినండి (Play audio)'}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Message text in authentic Telugu script */}
              <div className="whitespace-pre-wrap font-sans text-sm sm:text-[15px] leading-relaxed">
                {message.text}
              </div>

              {/* Status tags */}
              {message.statusTag && (
                <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center gap-1.5 text-[11px]">
                  {message.statusTag === 'clarification' && (
                    <span className="text-amber-800 flex items-center gap-1 font-medium">
                      <HelpCircle className="w-3 h-3" /> వివరణ కోరబడింది (Clarification)
                    </span>
                  )}
                  {message.statusTag === 'follow-up' && (
                    <span className="text-indigo-800 flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3 h-3" /> తదుపరి ప్రశ్న (Follow-up)
                    </span>
                  )}
                  {message.statusTag === 'refusal-handled' && (
                    <span className="text-zinc-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> నిరాకరణ గౌరవించబడింది (Refusal Respected)
                    </span>
                  )}
                  {message.statusTag === 'completed' && (
                    <span className="text-emerald-800 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> సర్వే ముగిసింది (Survey Completed)
                    </span>
                  )}
                  {message.statusTag === 'stopped' && (
                    <span className="text-rose-800 flex items-center gap-1 font-medium">
                      <StopCircle className="w-3 h-3" /> అభ్యర్థన మేరకు ఆపబడింది (Stopped)
                    </span>
                  )}
                </div>
              )}
            </div>

            {!isAgent && (
              <div className="w-8 h-8 rounded-lg bg-zinc-200 text-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        );
      })}

      {/* Loading state indicator */}
      {isLoading && (
        <div className="flex items-start gap-3 justify-start animate-fade-in">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center shrink-0 mt-0.5 font-semibold text-xs">
            ఏజెంట్
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"></span>
            <span
              className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"
              style={{ animationDelay: '0.15s' }}
            ></span>
            <span
              className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"
              style={{ animationDelay: '0.3s' }}
            ></span>
            <span className="text-xs text-zinc-600 ml-1">స్పందనను విశ్లేషించి తెలుగులో సమాధానమిస్తోంది...</span>
          </div>
        </div>
      )}

      {/* Survey Finished Banner */}
      {(surveyComplete || surveyStopped) && (
        <div className="my-6 p-5 rounded-xl border border-zinc-200 bg-white shadow-xs max-w-2xl mx-auto text-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2.5 ${
              surveyComplete
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            {surveyComplete ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <StopCircle className="w-5 h-5" />
            )}
          </div>
          <h4 className="text-base font-semibold text-zinc-900 mb-1">
            {surveyComplete
              ? 'సర్వే విజయవంతంగా పూర్తయింది (Survey Completed)'
              : 'సర్వే సంభాషణ ముగిసింది (Survey Stopped)'}
          </h4>
          <p className="text-xs text-zinc-600 mb-4 max-w-md mx-auto">
            {surveyComplete
              ? 'అన్ని ప్రశ్నల సమాధానాలు నమోదు చేయబడ్డాయి. సారాంశం ప్రదర్శించబడింది.'
              : 'ప్రతిస్పందకుడి కోరిక మేరకు సంభాషణను గౌరవపూర్వకంగా ముగించడం జరిగింది.'}
          </p>
          <div className="flex items-center justify-center gap-2.5">
            {hasQuestions && (
              <button
                onClick={onOpenData}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition-colors shadow-xs"
              >
                నమోదైన సమాధానాలు చూడండి
              </button>
            )}
            <button
              onClick={onRestart}
              className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              కొత్త సంభాషణ ప్రారంభించండి
            </button>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
