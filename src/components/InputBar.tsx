import React, { useState } from 'react';
import { Send, Mic, MicOff, Sparkles } from 'lucide-react';

interface InputBarProps {
  onSendMessage: (
    text: string,
    timestamps?: { speech_end?: number; transcription_start?: number; transcription_end?: number }
  ) => void;
  isLoading: boolean;
  disabled: boolean;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSendMessage,
  isLoading,
  disabled,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Curated Telugu test cases matching human conversation scenarios and high-priority intents
  const suggestions = [
    { label: 'సరే, సర్వే చేయండి (Agree to participate)', text: 'సరే, సర్వే చేయండి.' },
    { label: 'ఎవరికి ఓటు వేయాలి? (Who to vote for inquiry)', text: 'నేను ఎవరికి ఓటు వేయాలి?' },
    { label: 'నీటి సమస్య (Irregular water follow-up)', text: 'నీళ్లు వస్తాయి కానీ ప్రతిరోజూ రావు.' },
    { label: 'నాకు ఇప్పుడు టైమ్ లేదు (Busy - No time)', text: 'నాకు ఇప్పుడు టైమ్ లేదు.' },
    { label: 'ఇప్పుడు బిజీగా ఉన్నాను (Busy)', text: 'ఇప్పుడు బిజీగా ఉన్నాను.' },
    { label: 'ఆపండి (Stop / Explicitly end)', text: 'ఆపండి.' },
    { label: 'సమాధానం చెప్పను (Refusal)', text: 'ఈ ప్రశ్నకు నేను సమాధానం చెప్పను.' },
    { label: 'ఎందుకు కాల్ చేస్తున్నారు? (Why are you calling me?)', text: 'ఎందుకు కాల్ చేస్తున్నారు?' },
    { label: 'నువ్వు ఎవరు? (Who are you?)', text: 'నువ్వు ఎవరు?' },
    { label: 'నా పేరు రవి (Name introduction)', text: 'నా పేరు రవి.' },
    { label: 'ఇప్పటికే చెప్పాను (Already told you)', text: 'నేను ఇప్పటికే చెప్పాను కదా.' },
    { label: 'కాదు, నా పేరు రాజు (Correction)', text: 'కాదు, నా పేరు రవి కాదు. రాజు.' },
  ];

  const [notification, setNotification] = useState<string | null>(null);

  // Speech recognition handler with Telugu language locale (te-IN)
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setNotification('ఈ బ్రౌజర్‌లో స్పీచ్ రికగ్నిషన్ సపోర్ట్ లేదు. దయచేసి టైప్ చేయండి.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'te-IN'; // Authentic Telugu voice recognition

      let t_transcription_start = 0;
      let t_speech_end = 0;

      recognition.onstart = () => {
        setIsListening(true);
        t_transcription_start = Date.now();
      };

      recognition.onspeechend = () => {
        t_speech_end = Date.now();
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          setNotification('మైక్రోఫోన్ అనుమతి లభించలేదు. దయచేసి టైప్ చేయండి లేదా పర్మిషన్ చెక్ చేయండి.');
          setTimeout(() => setNotification(null), 4000);
        }
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        const t_transcription_end = Date.now();
        if (transcript) {
          setInputText(transcript);
          // Auto-send immediately on voice speech completion for minimum latency
          onSendMessage(transcript, {
            speech_end: t_speech_end || t_transcription_end - 200,
            transcription_start: t_transcription_start,
            transcription_end: t_transcription_end,
          });
          setInputText('');
        }
      };

      recognition.start();
    } catch (e: any) {
      console.warn('Speech recognition initialization error:', e?.message || e);
      setIsListening(false);
      setNotification('వాయిస్ ఇన్‌పుట్ ప్రారంభించడంలో సమస్య ఏర్పడింది. దయచేసి టైప్ చేయండి.');
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isLoading || disabled) return;
    const now = Date.now();
    onSendMessage(inputText.trim(), { speech_end: now });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 sm:px-6 sticky bottom-0 z-20">
      <div className="max-w-4xl mx-auto space-y-2.5">
        {/* Quick helper pills for testing behavioral compliance */}
        {!disabled && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-zinc-500 font-medium flex items-center gap-1 mr-1 shrink-0 text-[11px]">
              <Sparkles className="w-3 h-3 text-emerald-600" /> పరీక్షా ప్రతిస్పందనలు:
            </span>
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                onClick={() => onSendMessage(item.text)}
                disabled={isLoading}
                className="shrink-0 px-2.5 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900 transition-colors text-[11px] disabled:opacity-50"
                title={item.text}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Notification toast if voice recognition not supported */}
        {notification && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-center animate-fadeIn">
            {notification}
          </div>
        )}

        {/* Input box */}
        <div className="relative flex items-center">
          <input
            type="text"
            id="respondent-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isLoading}
            placeholder={
              disabled
                ? 'సర్వే సంభాషణ ముగిసింది.'
                : 'మీ సమాధానం లేదా ప్రశ్నను తెలుగులో టైప్ చేయండి... (Enter నొక్కండి)'
            }
            className="w-full bg-zinc-50/80 border border-zinc-300 rounded-xl px-4 py-3 pr-24 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:bg-white disabled:bg-zinc-100 disabled:text-zinc-400 transition-all shadow-inner"
          />

          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              id="mic-button"
              onClick={startSpeechRecognition}
              disabled={disabled || isLoading}
              className={`p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors disabled:opacity-40 ${
                isListening ? 'bg-red-100 text-red-600 animate-pulse' : ''
              }`}
              title="తెలుగు వాయిస్ ఇన్‌పుట్ (Telugu Speech Recognition)"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="button"
              id="send-message-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading || disabled}
              className="p-2 rounded-lg bg-emerald-800 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-800 transition-colors shadow-xs"
              title="సందేశం పంపండి"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 text-center">
          ప్రత్యేకంగా తెలుగులోనే ప్రతిస్పందించే పబ్లిక్ సర్వే వాయిస్ ఏజెంట్ • ప్రామాణిక తెలుగు లిపి (100% Authentic Telugu Voice & Text)
        </p>
      </div>
    </div>
  );
};
