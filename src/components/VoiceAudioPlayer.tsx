import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Info,
} from 'lucide-react';

interface VoiceAudioPlayerProps {
  scriptText: string;
  voiceProfileId?: string;
  eventId?: string;
  language?: string;
  title?: string;
  subtitle?: string;
  onVoiceChangeRequested?: () => void;
  className?: string;
  autoPlayOnGenerate?: boolean;
}

export function VoiceAudioPlayer({
  scriptText,
  voiceProfileId,
  eventId,
  language = 'te',
  title = 'Test Voice Audio Preview',
  subtitle = 'Generate and listen to real AI speech with your saved authorized cloned voice',
  onVoiceChangeRequested,
  className = '',
  autoPlayOnGenerate = true,
}: VoiceAudioPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'playing' | 'paused' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedVoiceName, setResolvedVoiceName] = useState<string>('Authorized Cloned Voice');
  const [resolvedVoiceId, setResolvedVoiceId] = useState<string>(voiceProfileId || '');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [audioBlobSize, setAudioBlobSize] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isGeneratingRef = useRef<boolean>(false);

  // Clean up Object URL on unmount or when audioUrl changes
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setStatus('ready');
      setCurrentTime(0);
    };

    const handlePlay = () => {
      setStatus('playing');
      setAutoplayBlocked(false);
    };

    const handlePause = () => {
      if (status === 'playing') {
        setStatus('paused');
      }
    };

    const handleError = (e: any) => {
      // If audio element is empty or reset, ignore
      if (!audio.src) return;
      console.warn('Audio playback error event:', e);
      // Only set error state if audio was ready or playing
      if (status === 'playing' || status === 'ready') {
        setStatus('error');
        setErrorMessage('Audio playback encountered an issue in browser. Please click Play Audio or Retry.');
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl, status]);

  // Generate Real Voice Audio
  const handleGenerateVoice = async () => {
    if (isGeneratingRef.current) return;
    if (!scriptText || !scriptText.trim()) {
      setStatus('error');
      setErrorMessage('The campaign script is empty. Please enter or generate a script before testing voice.');
      return;
    }

    isGeneratingRef.current = true;
    setStatus('generating');
    setErrorMessage(null);
    setAutoplayBlocked(false);

    try {
      // Pause any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      // Revoke previous audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const response = await fetch('/api/callbridge/test-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg, audio/wav, application/json',
        },
        body: JSON.stringify({
          text: scriptText,
          voiceProfileId,
          eventId,
          language,
        }),
      });

      const contentType = response.headers.get('content-type') || '';

      // Check if backend returned JSON error
      if (!response.ok || contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Voice synthesis failed with HTTP ${response.status}: ${response.statusText}`
        );
      }

      // Extract resolved voice profile metadata from response headers
      const voiceIdHeader = response.headers.get('X-Voice-Id');
      const voiceNameHeader = response.headers.get('X-Profile-Name');
      if (voiceIdHeader) setResolvedVoiceId(voiceIdHeader);
      if (voiceNameHeader) {
        try {
          setResolvedVoiceName(decodeURIComponent(voiceNameHeader));
        } catch {
          setResolvedVoiceName(voiceNameHeader);
        }
      }

      // Read audio binary stream
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Received an empty audio response from voice synthesis provider.');
      }

      setAudioBlobSize(blob.size);
      const newAudioUrl = URL.createObjectURL(blob);
      setAudioUrl(newAudioUrl);
      setStatus('ready');

      // Attempt automatic playback if permitted
      if (autoPlayOnGenerate) {
        setTimeout(async () => {
          if (audioRef.current) {
            try {
              audioRef.current.currentTime = 0;
              await audioRef.current.play();
              setStatus('playing');
            } catch (playErr: any) {
              // Browser Autoplay Policy blocked direct playback
              console.warn('Autoplay restricted by browser policy:', playErr);
              setAutoplayBlocked(true);
              setStatus('ready');
            }
          }
        }, 150);
      }
    } catch (err: any) {
      console.error('handleGenerateVoice error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to generate voice audio. Please verify your ElevenLabs configuration.');
    } finally {
      isGeneratingRef.current = false;
    }
  };

  const handlePlay = async () => {
    if (!audioRef.current || !audioUrl) {
      await handleGenerateVoice();
      return;
    }
    try {
      await audioRef.current.play();
      setStatus('playing');
      setAutoplayBlocked(false);
    } catch (err: any) {
      console.warn('Play error:', err);
      setErrorMessage(`Cannot play audio: ${err?.message || 'Check audio permissions'}`);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setStatus('paused');
    }
  };

  const handleReplay = async () => {
    if (!audioRef.current || !audioUrl) {
      await handleGenerateVoice();
      return;
    }
    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setStatus('playing');
      setAutoplayBlocked(false);
    } catch (err) {
      console.warn('Replay error:', err);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className={`p-6 rounded-3xl bg-linear-to-br from-indigo-50/60 via-white to-slate-50 border border-indigo-100 shadow-sm space-y-5 ${className}`}
    >
      {/* Hidden native audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {/* Header with Title and Voice Profile Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span>{title}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200">
                ElevenLabs Voice
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Voice Badge */}
        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <div className="text-left">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spoken Voice</div>
            <div className="text-xs font-bold text-slate-800 truncate max-w-44 sm:max-w-56" title={resolvedVoiceName}>
              {resolvedVoiceName}
            </div>
          </div>
          {onVoiceChangeRequested && (
            <button
              onClick={onVoiceChangeRequested}
              className="ml-2 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
            >
              Change
            </button>
          )}
        </div>
      </div>

      {/* Spoken Script Box */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
            Spoken Script ({language.toUpperCase()})
          </span>
          <span className="text-[11px] font-medium text-slate-500">{scriptText.length} characters</span>
        </div>
        <div className="text-xs text-slate-800 leading-relaxed font-sans max-h-36 overflow-y-auto pr-1">
          {scriptText}
        </div>
      </div>

      {/* Error Alert */}
      {status === 'error' && errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-xs leading-relaxed">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-bold">Voice Generation Error</div>
            <p className="text-rose-700">{errorMessage}</p>
            <div className="pt-1">
              <button
                onClick={handleGenerateVoice}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold text-[11px] hover:bg-rose-700 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Generation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Autoplay blocked notice */}
      {autoplayBlocked && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Audio generated! Click <strong>Play Audio</strong> below to start browser playback.</span>
          </div>
          <button
            onClick={handlePlay}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs"
          >
            Play Audio
          </button>
        </div>
      )}

      {/* Main Playback / Controls Area */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        {/* Progress & Time */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-semibold">
              {status === 'generating'
                ? 'Synthesizing Audio via ElevenLabs...'
                : status === 'playing'
                ? 'Playing Cloned Speech'
                : status === 'paused'
                ? 'Paused'
                : audioUrl
                ? 'Ready to Play'
                : 'Click Test Voice to generate'}
            </span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="relative flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              disabled={!audioUrl || status === 'generating'}
              onChange={handleSeek}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-40"
            />
          </div>
        </div>

        {/* Buttons Control Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center space-x-2">
            {/* Primary Action Button */}
            {status === 'generating' ? (
              <button
                disabled
                className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-bold shadow-md opacity-85 cursor-wait"
              >
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Generating AI Speech...</span>
              </button>
            ) : status === 'playing' ? (
              <button
                onClick={handlePause}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-white" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={audioUrl ? handlePlay : handleGenerateVoice}
                className="flex items-center space-x-2 px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{audioUrl ? 'Play Audio' : 'Test Voice (Play Speech)'}</span>
              </button>
            )}

            {/* Replay Button (enabled when audio is loaded) */}
            <button
              onClick={handleReplay}
              disabled={!audioUrl || status === 'generating'}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="Replay from beginning"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Replay</span>
            </button>

            {/* Regenerate Fresh Speech */}
            {audioUrl && (
              <button
                onClick={handleGenerateVoice}
                disabled={status === 'generating'}
                className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold shadow-xs disabled:opacity-40 cursor-pointer transition-colors"
                title="Regenerate speech with ElevenLabs"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Regenerate</span>
              </button>
            )}
          </div>

          {/* Status & Size Info */}
          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
            {audioBlobSize > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px]">
                {(audioBlobSize / 1024).toFixed(1)} KB (audio/mpeg)
              </span>
            )}
            <span className="flex items-center space-x-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'playing'
                    ? 'bg-emerald-500 animate-ping'
                    : status === 'ready'
                    ? 'bg-emerald-500'
                    : status === 'generating'
                    ? 'bg-indigo-500 animate-pulse'
                    : 'bg-slate-300'
                }`}
              />
              <span className="capitalize">{status}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
