import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Volume2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AdditionalVoiceOption, EventRecord } from '../types/callbridge';

export const ADDITIONAL_VOICE_ID_LIST = [
  'XbJsWNHKtG2BgaDeeCX3',
  'AX6NBB0ZEKsGATpe5g5a',
  'AfGQOwNTk8JotVVaad3o',
  '9dQiWzuJKan0MNO2wA8U',
] as const;

export function isAdditionalVoiceIdClient(voiceId?: string | null): boolean {
  if (!voiceId) return false;
  return (ADDITIONAL_VOICE_ID_LIST as readonly string[]).includes(voiceId.trim());
}

interface AdditionalVoicesSectionProps {
  eventId?: string;
  clientId?: string;
  language?: string;
  selectedVoiceProfileId?: string;
  voiceSelectionType?: 'cloned' | 'additional';
  clonedVoiceName?: string;
  previewText?: string;
  accentColor?: 'blue' | 'indigo';
  onEventVoiceUpdated?: (updatedEvent: EventRecord) => void;
}

export function AdditionalVoicesSection({
  eventId,
  clientId = 'client_001',
  language = 'te',
  selectedVoiceProfileId,
  voiceSelectionType,
  clonedVoiceName = 'Cloned Voice',
  previewText,
  accentColor = 'indigo',
  onEventVoiceUpdated,
}: AdditionalVoicesSectionProps) {
  const [voices, setVoices] = useState<AdditionalVoiceOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [selectingVoiceId, setSelectingVoiceId] = useState<string | null>(null);
  const [isRestoringCloned, setIsRestoringCloned] = useState<boolean>(false);

  // Audio preview state (independent of selection)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const isAdditionalActive =
    voiceSelectionType === 'additional' || isAdditionalVoiceIdClient(selectedVoiceProfileId);

  const stopPreviewAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingVoiceId(null);
  };

  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/callbridge/additional-voices');
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.voices)) {
          throw new Error(data.error || 'Failed to load additional voices catalog');
        }
        if (!cancelled) {
          setVoices(data.voices);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.message || 'Could not verify additional voices with ElevenLabs.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    loadCatalog();
    return () => {
      cancelled = true;
      stopPreviewAudio();
    };
  }, []);

  const getDefaultPreviewSample = () => {
    if (previewText && previewText.trim()) return previewText.trim();
    if (language === 'hi') {
      return 'नमस्ते! यह कॉलब्रिज वॉयस प्रीव्यू है। आपकी अभियान स्क्रिप्ट इसी आवाज में बोली जाएगी।';
    }
    if (language === 'en') {
      return 'Hello! This is a CallBridge AI voice preview. Your campaign script will be spoken in this voice.';
    }
    return 'నమస్కారం అండి! ఇది కాల్‌బ్రిడ్జ్ వాయిస్ ప్రివ్యూ. మీ ప్రచార సందేశం ఈ వాయిస్‌లో వినిపించబడుతుంది.';
  };

  const handlePreviewVoice = async (voice: AdditionalVoiceOption) => {
    setActionError(null);

    if (playingVoiceId === voice.voiceId) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();
    setPreviewLoadingId(voice.voiceId);

    try {
      const sample = getDefaultPreviewSample();
      const res = await fetch('/api/callbridge/test-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg, audio/wav, application/json',
        },
        body: JSON.stringify({
          text: sample,
          voiceProfileId: voice.voiceId,
          language,
          clientId,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error ||
            `${voice.slotLabel} could not generate preview audio for the current campaign language or configuration.`
        );
      }

      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error(`Received empty audio stream for ${voice.slotLabel}.`);
      }

      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoiceId(null);
      };
      audio.onerror = () => {
        setPlayingVoiceId(null);
        setActionError(`Browser failed to play preview audio for ${voice.slotLabel}.`);
      };
      setPlayingVoiceId(voice.voiceId);
      await audio.play();
    } catch (err: any) {
      setPlayingVoiceId(null);
      setActionError(
        err?.message ||
          `${voice.slotLabel} does not support the current campaign language or generation configuration.`
      );
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleSelectAdditionalVoice = async (voice: AdditionalVoiceOption) => {
    if (!eventId) {
      setActionError('Open a campaign or event workspace to assign an additional voice.');
      return;
    }
    if (!voice.accessible) {
      setActionError(
        voice.error || `${voice.slotLabel} is currently unavailable on ElevenLabs and cannot be selected.`
      );
      return;
    }

    setSelectingVoiceId(voice.voiceId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/callbridge/events/${encodeURIComponent(eventId)}/voice-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          voiceSelectionType: 'additional',
          voiceId: voice.voiceId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.event) {
        throw new Error(data.error || `Failed to select ${voice.slotLabel}.`);
      }

      if (onEventVoiceUpdated) {
        onEventVoiceUpdated(data.event);
      }
      setActionSuccess(
        `${voice.name} selected for this campaign. Your cloned voice remains preserved and untouched.`
      );
    } catch (err: any) {
      setActionError(err?.message || `Failed to select ${voice.slotLabel}.`);
    } finally {
      setSelectingVoiceId(null);
    }
  };

  const handleRestoreClonedVoice = async () => {
    if (!eventId) return;
    setIsRestoringCloned(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/callbridge/events/${encodeURIComponent(eventId)}/voice-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          voiceSelectionType: 'cloned',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.event) {
        throw new Error(data.error || 'Failed to restore cloned voice.');
      }

      if (onEventVoiceUpdated) {
        onEventVoiceUpdated(data.event);
      }
      setActionSuccess('Switched back to your preserved cloned voice for this campaign.');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to restore cloned voice.');
    } finally {
      setIsRestoringCloned(false);
    }
  };

  const activeBorder =
    accentColor === 'blue'
      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/30'
      : 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/30';
  const primaryButton =
    accentColor === 'blue'
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className={`w-4 h-4 ${accentColor === 'blue' ? 'text-blue-600' : 'text-indigo-600'}`} />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Additional Voices
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select one of these verified ElevenLabs voices for this campaign. Switching voices keeps your cloned voice and script text untouched.
          </p>
        </div>

        {isAdditionalActive && eventId && (
          <button
            type="button"
            onClick={handleRestoreClonedVoice}
            disabled={isRestoringCloned}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isRestoringCloned ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            <span>Use Cloned Voice ({clonedVoiceName})</span>
          </button>
        )}
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-6 rounded-xl bg-white border border-slate-200 flex items-center justify-center space-x-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Verifying ElevenLabs additional voices...</span>
        </div>
      ) : loadError ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {voices.map((voice) => {
            const isSelected =
              isAdditionalActive && selectedVoiceProfileId?.trim() === voice.voiceId;
            const isPreviewLoading = previewLoadingId === voice.voiceId;
            const isPlaying = playingVoiceId === voice.voiceId;
            const isSelecting = selectingVoiceId === voice.voiceId;
            const genderLabel = voice.labels?.gender
              ? voice.labels.gender.charAt(0).toUpperCase() + voice.labels.gender.slice(1)
              : null;
            const styleLabel = voice.labels?.descriptive
              ? voice.labels.descriptive.charAt(0).toUpperCase() + voice.labels.descriptive.slice(1)
              : null;

            return (
              <div
                key={voice.voiceId}
                data-voice-id={voice.voiceId}
                className={`p-4 rounded-2xl border bg-white transition-all flex flex-col justify-between gap-3 ${
                  isSelected ? activeBorder : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {voice.slotLabel}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Selected</span>
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-1.5 truncate" title={voice.providerName || voice.slotLabel}>
                        {voice.providerName || voice.slotLabel}
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {voice.voiceId}
                    </span>
                    {genderLabel && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {genderLabel}
                      </span>
                    )}
                    {styleLabel && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {styleLabel}
                      </span>
                    )}
                    {voice.accessible ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {voice.recommendedModelId}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        Unavailable
                      </span>
                    )}
                  </div>

                  {!voice.accessible && voice.error && (
                    <p className="text-[11px] text-rose-600 leading-snug">{voice.error}</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handlePreviewVoice(voice)}
                    disabled={!voice.accessible || isPreviewLoading}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {isPreviewLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Synthesizing...</span>
                      </>
                    ) : isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause Preview</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdditionalVoice(voice)}
                    disabled={!voice.accessible || isSelecting || isSelected}
                    className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:cursor-default ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : !voice.accessible
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : `${primaryButton} shadow-xs`
                    }`}
                  >
                    {isSelecting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Selecting...</span>
                      </>
                    ) : isSelected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Selected</span>
                      </>
                    ) : (
                      <span>Select Voice</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
