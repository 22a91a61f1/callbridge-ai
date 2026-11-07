import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Upload,
  Check,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileAudio,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ClientVoiceProfile } from '../types';

// Madhavi ElevenLabs Voice ID used exclusively as delivery & pronunciation reference
export const MADHAVI_REFERENCE_VOICE_ID = '4XvBGCPMXWyVQa75dbZg';

// Section 8, 16 & 21: Full Suite of Required Telugu Test Sentences
export const TEST_SENTENCES = [
  'నమస్కారం అండి.',
  'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది అండి?',
  'మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది అండి?',
  'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?',
  'డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?',
  'మీ ప్రాంతంలో చెత్త సేకరణ ఎలా జరుగుతోంది?',
  'మీ ప్రాంతంలో ఆరోగ్య సదుపాయాలు ఎలా ఉన్నాయి?',
  'మీ ప్రాంతంలోని ప్రభుత్వ పాఠశాలల పరిస్థితి ఎలా ఉంది?',
  'మీ ప్రాంతంలో ప్రజా రవాణా సౌకర్యం ఎలా ఉంది?',
  'ప్రభుత్వ సేవలు పొందడంలో మీకు ఏమైనా సమస్యలు ఎదురవుతున్నాయా?',
  'మీ ప్రాంతంలో వెంటనే మెరుగుపరచాల్సిన విషయం ఏది అని మీరు భావిస్తున్నారు?',
  'అవునా అండి, అర్థమైంది.',
  'ఎందుకు ఫోన్ చేస్తున్నారు అని అడిగారు కదా. మీ ప్రాంతంలో ప్రజా సదుపాయాలు ఎలా ఉన్నాయో తెలుసుకోవడానికి ఈ సర్వే చేస్తున్నాం.',
  'సమయం ఉన్నప్పుడు చెప్పండి.',
];

// Section 6: Guided Telugu Training Scripts for High-Fidelity Voice Cloning
export interface TeluguTrainingScript {
  id: number;
  title: string;
  script: string;
  focus: string;
}

export const GUIDED_TELUGU_TRAINING_SCRIPTS: TeluguTrainingScript[] = [
  {
    id: 1,
    title: 'శాంపిల్ 1: స్వాగతం & అచ్చులు (Vowels & Greetings)',
    script: 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాలు మరియు తాగునీటి సౌకర్యం గురించి మాట్లాడటానికి కాల్ చేస్తున్నాను.',
    focus: 'క్లియర్ పలకడం (Clear vowels: అ, ఆ, ఇ, ఈ, ఉ, ఊ, ఎ, ఏ, ఒ, ఓ)',
  },
  {
    id: 2,
    title: 'శాంపిల్ 2: మూర్ధన్య హల్లులు & సంయుక్తాక్షరాలు (Retroflex Consonants & Conjuncts)',
    script: 'మా ప్రాంతంలో రోడ్లపై పెద్ద పెద్ద గుంతలు పడి, వర్షం వచ్చినప్పుడు నీళ్లు నిలిచిపోయి చాలా ప్రమాదాలు, రాకపోకల ఇబ్బందులు కలుగుతున్నాయి.',
    focus: 'స్పష్టమైన ఉచ్ఛారణ: ళ, ల, ఱ, ర, ట, త, డ, ద, న, ణ మరియు సంయుక్తాక్షరాలు',
  },
  {
    id: 3,
    title: 'శాంపిల్ 3: విద్యుత్, డ్రైనేజీ & ప్రశ్నల శైలి (Questions & Pacing)',
    script: 'మీ వీధిలో విద్యుత్ సరఫరా సక్రమంగా ఉంటోందా? మురుగు కాల్వలు, డ్రైనేజీ సమస్యలు ఏమైనా ఉన్నాయా?',
    focus: 'సహజ ప్రశ్నల ఆరోహణ, అవరోహణ & విరామాలు (Conversational pitch rise)',
  },
  {
    id: 4,
    title: 'శాంపిల్ 4: పారిశుధ్యం & ప్రభుత్వ సేవలు (Sanitation & Government Services)',
    script: 'పారిశుధ్య కార్మికులు చెత్త సేకరణ పనులను క్రమం తప్పకుండా చేస్తున్నారా? ప్రభుత్వ కార్యాలయాల్లో సేవలు సులభంగా అందుతున్నాయా?',
    focus: 'సంస్కృత-తెలుగు పదాల ఉచ్ఛారణ (పారిశుధ్యం, ప్రభుత్వ, సౌకర్యం)',
  },
  {
    id: 5,
    title: 'శాంపిల్ 5: ప్రాధాన్యత & సారాంశం (Priorities & Conversational Close)',
    script: 'స్థానిక ప్రాథమిక ఆరోగ్య కేంద్రాలు మరియు పాఠశాలల్లో వెంటనే మెరుగుపరచాల్సిన అత్యంత ముఖ్యమైన సమస్య ఏది అని మీరు భావిస్తున్నారు?',
    focus: 'సహజ వేగం, సహజ శ్వాస విరామాలు & స్పష్టమైన సమాప్తి (Natural cadence & ending)',
  },
];

// Section 7 & 9: Telugu Survey Terminology & Pronunciation Words
export const TELUGU_VOCABULARY_LIST = [
  { word: 'తాగునీటి', breakdown: 'thaagu-neeti', meaning: 'Drinking water' },
  { word: 'ప్రాంతంలో', breakdown: 'praantham-lo', meaning: 'In the area' },
  { word: 'సౌకర్యం', breakdown: 'sau-karyam', meaning: 'Facility / Convenience' },
  { word: 'ప్రజా', breakdown: 'pra-jaa', meaning: 'Public / Citizens' },
  { word: 'సదుపాయాలు', breakdown: 'sadu-paayaalu', meaning: 'Amenities / Services' },
  { word: 'రోడ్లు', breakdown: 'rod-lu', meaning: 'Roads' },
  { word: 'విద్యుత్', breakdown: 'vidyut', meaning: 'Electricity' },
  { word: 'డ్రైనేజీ', breakdown: 'drai-neejee', meaning: 'Drainage system' },
  { word: 'చెత్త', breakdown: 'chetta', meaning: 'Garbage' },
  { word: 'పారిశుధ్యం', breakdown: 'paari-shudhyam', meaning: 'Sanitation' },
  { word: 'ఆరోగ్య', breakdown: 'aa-rogya', meaning: 'Health' },
  { word: 'విద్య', breakdown: 'vidya', meaning: 'Education' },
  { word: 'రవాణా', breakdown: 'ravaanaa', meaning: 'Transportation' },
  { word: 'ప్రభుత్వ', breakdown: 'prabhutva', meaning: 'Government' },
  { word: 'సేవలు', breakdown: 'sevalu', meaning: 'Services' },
  { word: 'సమస్య', breakdown: 'samasya', meaning: 'Problem / Issue' },
  { word: 'మెరుగుపరచాలి', breakdown: 'merugu-parachaali', meaning: 'Must improve' },
  { word: 'అభిప్రాయం', breakdown: 'abhi-praayam', meaning: 'Opinion / Feedback' },
];

interface ClientVoiceSectionProps {
  clientId?: string;
  activeProfile: ClientVoiceProfile | null;
  onVoiceActivated: (profile: ClientVoiceProfile) => void;
  onVoiceReset?: () => void;
  useClonedVoiceForSurvey: boolean;
  onToggleUseClonedVoice: (enabled: boolean) => void;
  isAgentSpeaking: boolean;
  onStartSurveyTest?: () => void;
}

export const ClientVoiceSection: React.FC<ClientVoiceSectionProps> = ({
  clientId = 'client_001',
  activeProfile,
  onVoiceActivated,
  onVoiceReset,
  useClonedVoiceForSurvey,
  onToggleUseClonedVoice,
  isAgentSpeaking,
  onStartSurveyTest,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Audio recorded/uploaded
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('client_voice_sample.webm');

  // Playback state for user's recorded audio
  const [isPlayingRecording, setIsPlayingRecording] = useState<boolean>(false);
  const recordedAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Playback state for saved/existing voice preview
  const [isPlayingExistingVoice, setIsPlayingExistingVoice] = useState<boolean>(false);
  const existingAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Flow mode: 'normal' (first time or viewing) | 'recording_new' (client chose "Record New Voice")
  const [flowMode, setFlowMode] = useState<'normal' | 'recording_new'>('normal');

  // Candidate new voice for "Record New Voice" comparison
  const [candidateVoice, setCandidateVoice] = useState<{
    voice_id: string;
    preview_url: string;
    preview_audio_base64?: string | null;
    preview_text?: string;
    created_at: string;
  } | null>(null);
  const [isPlayingCandidatePreview, setIsPlayingCandidatePreview] = useState<boolean>(false);
  const candidateAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Section 16 & 28: Testing Telugu Sentences with Madhavi Reference + STS
  const [testingSentenceIndex, setTestingSentenceIndex] = useState<number | null>(null);
  const [sentenceTestStatus, setSentenceTestStatus] = useState<string | null>(null);
  const testAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Section 24: Pronunciation Verification State
  const [isPronunciationVerified, setIsPronunciationVerified] = useState<boolean>(false);

  // Problem 1: Explicit Voice Creation Step States
  // idle -> recording -> recorded -> uploading -> cloning -> voice_created -> preview_generating -> preview_ready -> confirmed -> failed
  const [creationStep, setCreationStep] = useState<
    | 'idle'
    | 'recording'
    | 'recorded'
    | 'uploading'
    | 'cloning'
    | 'voice_created'
    | 'preview_generating'
    | 'preview_ready'
    | 'confirmed'
    | 'failed'
  >('idle');

  // Section 6: Multi-sample Guided Telugu Training State (Improve Voice Clone)
  const [isImproveVoiceExpanded, setIsImproveVoiceExpanded] = useState<boolean>(false);
  const [multiSamples, setMultiSamples] = useState<Record<number, { blob: Blob; url: string; duration: number }>>({});
  const [recordingScriptId, setRecordingScriptId] = useState<number | null>(null);
  const [scriptTimer, setScriptTimer] = useState<number>(0);
  const scriptRecorderRef = useRef<MediaRecorder | null>(null);
  const scriptChunksRef = useRef<Blob[]>([]);
  const scriptTimerIntervalRef = useRef<any>(null);
  const [playingScriptAudioId, setPlayingScriptAudioId] = useState<number | null>(null);
  const scriptAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // File input ref for upload audio
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);

  // Format seconds to mm:ss (e.g. 00:01, 00:02...)
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check backend active voice on mount or when clientId changes
  const checkActiveVoice = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetch(`/api/voice-profile/active/${encodeURIComponent(clientId)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (data.has_active_voice && data.profile) {
        onVoiceActivated(data.profile);
        setStatusMessage('మీ voice ఇప్పటికే save అయి ఉంది.');
      } else {
        setStatusMessage('వాయిస్ ఇంకా save కాలేదు.');
      }
    } catch (err: any) {
      console.warn('Failed to fetch active voice profile:', err?.message);
      setStatusMessage('వాయిస్ ఇంకా save కాలేదు.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkActiveVoice();
  }, [clientId]);

  // Clean up timers and audio on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (scriptTimerIntervalRef.current) clearInterval(scriptTimerIntervalRef.current);
      if (recordedAudioPlayerRef.current) {
        recordedAudioPlayerRef.current.pause();
        recordedAudioPlayerRef.current = null;
      }
      if (existingAudioPlayerRef.current) {
        existingAudioPlayerRef.current.pause();
        existingAudioPlayerRef.current = null;
      }
      if (candidateAudioPlayerRef.current) {
        candidateAudioPlayerRef.current.pause();
        candidateAudioPlayerRef.current = null;
      }
      if (testAudioPlayerRef.current) {
        testAudioPlayerRef.current.pause();
        testAudioPlayerRef.current = null;
      }
      if (scriptAudioPlayerRef.current) {
        scriptAudioPlayerRef.current.pause();
        scriptAudioPlayerRef.current = null;
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      Object.values(multiSamples).forEach((s) => {
        if (s.url) URL.revokeObjectURL(s.url);
      });
    };
  }, []);

  // START RECORDING
  const handleStartRecording = async () => {
    setErrorMessage(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('మీ బ్రౌజర్ మైక్రోఫోన్ రికార్డింగ్‌కు సపోర్ట్ చేయడం లేదు. దయచేసి ఆడియో ఫైల్‌ను అప్‌లోడ్ చేయండి.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(finalBlob);
        const url = URL.createObjectURL(finalBlob);
        setRecordedUrl(url);
        setAudioFileName(`voice_sample_${Date.now()}.webm`);

        // Stop all tracks to release mic
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250); // Slice chunks every 250ms
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start recording timer: 00:01, 00:02...
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone recording error / permission not granted:', err?.name || err?.message || err);
      const isPermissionDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /permission/i.test(err?.message || '') ||
        /denied/i.test(err?.message || '');

      if (isPermissionDenied) {
        setErrorMessage(
          'మైక్రోఫోన్ యాక్సెస్ అనుమతి లభించలేదు (Microphone permission denied). మీ బ్రౌజర్ సెట్టింగ్స్‌లో మైక్ పర్మిషన్ Allow చేయండి లేదా కింద ఉన్న "నమూనా ఆడియో వాడండి" లేదా "ఆడియో ఫైల్ అప్‌లోడ్" ఎంపికలను ఉపయోగించండి.'
        );
      } else {
        setErrorMessage(
          err?.message || 'మైక్రోఫోన్ యాక్సెస్ అనుమతి లభించలేదు. దయచేసి మైక్ పర్మిషన్ చెక్ చేయండి లేదా ఆడియో ఫైల్ అప్‌లోడ్ చేయండి.'
        );
      }
      setIsRecording(false);
    }
  };

  // STOP RECORDING
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Stop all active audio elements safely
  const stopAllAudio = () => {
    if (recordedAudioPlayerRef.current) {
      recordedAudioPlayerRef.current.pause();
      recordedAudioPlayerRef.current = null;
    }
    if (existingAudioPlayerRef.current) {
      existingAudioPlayerRef.current.pause();
      existingAudioPlayerRef.current = null;
    }
    if (candidateAudioPlayerRef.current) {
      candidateAudioPlayerRef.current.pause();
      candidateAudioPlayerRef.current = null;
    }
    if (testAudioPlayerRef.current) {
      testAudioPlayerRef.current.pause();
      testAudioPlayerRef.current = null;
    }
    if (scriptAudioPlayerRef.current) {
      scriptAudioPlayerRef.current.pause();
      scriptAudioPlayerRef.current = null;
    }
    setIsPlayingRecording(false);
    setIsPlayingExistingVoice(false);
    setIsPlayingCandidatePreview(false);
    setTestingSentenceIndex(null);
    setPlayingScriptAudioId(null);
  };

  // Section 6: Script Recording for Guided Telugu Samples
  const handleStartScriptRecording = async (scriptId: number) => {
    stopAllAudio();
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('మీ బ్రౌజర్ మైక్రోఫోన్ రికార్డింగ్‌కు సపోర్ట్ చేయడం లేదు.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      scriptChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      scriptRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          scriptChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(scriptChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(finalBlob);
        setMultiSamples((prev) => {
          if (prev[scriptId]?.url) URL.revokeObjectURL(prev[scriptId].url);
          return {
            ...prev,
            [scriptId]: { blob: finalBlob, url, duration: scriptTimer },
          };
        });
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setRecordingScriptId(scriptId);
      setScriptTimer(0);

      if (scriptTimerIntervalRef.current) clearInterval(scriptTimerIntervalRef.current);
      scriptTimerIntervalRef.current = setInterval(() => {
        setScriptTimer((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Script sample recording error:', err);
      setErrorMessage(
        err?.message || 'మైక్రోఫోన్ యాక్సెస్ అనుమతి లభించలేదు. దయచేసి మైక్ పర్మిషన్ చెక్ చేయండి.'
      );
      setRecordingScriptId(null);
    }
  };

  const handleStopScriptRecording = () => {
    if (scriptTimerIntervalRef.current) {
      clearInterval(scriptTimerIntervalRef.current);
      scriptTimerIntervalRef.current = null;
    }
    if (scriptRecorderRef.current && scriptRecorderRef.current.state === 'recording') {
      scriptRecorderRef.current.stop();
    }
    setRecordingScriptId(null);
  };

  const handlePlayScriptSample = (scriptId: number) => {
    const sample = multiSamples[scriptId];
    if (!sample) return;

    if (playingScriptAudioId === scriptId) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    setPlayingScriptAudioId(scriptId);

    const audio = new Audio(sample.url);
    scriptAudioPlayerRef.current = audio;
    audio.onended = () => {
      setPlayingScriptAudioId(null);
    };
    audio.onerror = () => {
      setPlayingScriptAudioId(null);
    };
    audio.play();
  };

  const handleDeleteScriptSample = (scriptId: number) => {
    setMultiSamples((prev) => {
      const next = { ...prev };
      if (next[scriptId]?.url) {
        URL.revokeObjectURL(next[scriptId].url);
      }
      delete next[scriptId];
      return next;
    });
  };

  // Submit Multi-Sample Voice Clone to ElevenLabs (Section 6)
  const handleSubmitMultiSampleVoiceClone = async () => {
    const recordedIds = Object.keys(multiSamples).map(Number);
    if (recordedIds.length === 0) {
      setErrorMessage('దయచేసి కనీసం ఒక తెలుగు శాంపిల్ రికార్డ్ చేయండి లేదా ఆడియో ఫైళ్ళను అప్‌లోడ్ చేయండి.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    stopAllAudio();

    try {
      const primaryId = recordedIds[0];
      const primaryBlob = multiSamples[primaryId].blob;
      const primaryB64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(primaryBlob);
      });

      const additionalSamplesB64: Array<{ audio_base64: string; file_name: string; mime_type: string }> = [];
      for (let i = 1; i < recordedIds.length; i++) {
        const id = recordedIds[i];
        const blob = multiSamples[id].blob;
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        additionalSamplesB64.push({
          audio_base64: b64,
          file_name: `telugu_sample_${id}.webm`,
          mime_type: blob.type || 'audio/webm',
        });
      }

      const res = await fetch('/api/voice-profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          mode: 'new_recording',
          audio_base64: primaryB64,
          file_name: `telugu_sample_${primaryId}.webm`,
          mime_type: primaryBlob.type || 'audio/webm',
          voice_name: `Client_${clientId}_TeluguMultiSample_${Date.now()}`,
          description: `Trained with ${recordedIds.length} guided Telugu phonetic samples (IVC Multi-Sample)`,
          additional_samples_base64: additionalSamplesB64,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `క్లోనింగ్ విఫలమైంది (${res.status})`);
      }

      const data = await res.json();
      if (data.profile) {
        setCandidateVoice({
          voice_id: data.profile.voice_id,
          preview_url: data.profile.preview_audio_url || `/api/voice-profile/preview-audio/${data.profile.voice_id}`,
          preview_audio_base64: data.preview_audio_base64 || null,
          preview_text: data.preview_text || 'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.',
          created_at: data.profile.created_at,
        });
        setStatusMessage(`బహుళ శాంపిల్స్‌తో (${recordedIds.length} Telugu Samples) కొత్త వాయిస్ విజయవంతంగా క్లోన్ చేయబడింది!`);
      }
    } catch (err: any) {
      console.error('Multi-sample voice clone error:', err);
      setErrorMessage(err?.message || 'బహుళ శాంపిల్స్ క్లోనింగ్ విఫలమైంది.');
    } finally {
      setIsLoading(false);
    }
  };

  // Multi-file upload handler
  const handleMultiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, index) => {
      if (index >= 5) return;
      const scriptId = index + 1;
      const url = URL.createObjectURL(file);
      setMultiSamples((prev) => {
        if (prev[scriptId]?.url) URL.revokeObjectURL(prev[scriptId].url);
        return {
          ...prev,
          [scriptId]: { blob: file, url, duration: 0 },
        };
      });
    });
  };

  // PLAY RECORDING (User listens to their own recorded sample)
  const handleTogglePlayRecording = () => {
    if (!recordedUrl) return;

    if (isPlayingRecording) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    const audio = new Audio(recordedUrl);
    audio.onended = () => setIsPlayingRecording(false);
    audio.onerror = () => setIsPlayingRecording(false);
    recordedAudioPlayerRef.current = audio;
    setIsPlayingRecording(true);

    audio.play().catch((e) => {
      console.warn('Playback error for original recording:', e);
      setIsPlayingRecording(false);
    });
  };

  // RECORD AGAIN (Re-record)
  const handleRecordAgain = () => {
    stopAllAudio();
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    setRecordingSeconds(0);
    setCandidateVoice(null);
    handleStartRecording();
  };

  // HANDLE FILE UPLOAD
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setRecordedBlob(file);
    setAudioFileName(file.name);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    const url = URL.createObjectURL(file);
    setRecordedUrl(url);
    setRecordingSeconds(15); // Nominal indicator for uploaded clip
  };

  // LOAD READY-MADE TELUGU DEMO SAMPLE AUDIO (Immediate testing when microphone is unavailable or blocked)
  const handleUseSampleAudio = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/voice-profile/sample-audio');
      if (!res.ok) throw new Error('Sample audio could not be retrieved');
      const blob = await res.blob();
      setRecordedBlob(blob);
      setAudioFileName('telugu_sample_voice.wav');
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      setRecordingSeconds(12);
      setStatusMessage('నమూనా తెలుగు ఆడియో లోడ్ చేయబడింది. మీరు ఇప్పుడు ప్లే చేయవచ్చు లేదా Create Voice క్లిక్ చేయవచ్చు.');
    } catch (err: any) {
      console.warn('Error loading demo audio sample:', err);
      setErrorMessage('నమూనా ఆడియో లోడ్ చేయడంలో సమస్య ఏర్పడింది. దయచేసి ఆడియో ఫైల్‌ను అప్‌లోడ్ చేయండి.');
    } finally {
      setIsLoading(false);
    }
  };

  // SEND RECORDING TO ELEVENLABS (Create Voice)
  const handleCreateVoice = async () => {
    if (!recordedBlob) {
      setErrorMessage('దయచేసి ముందుగా మీ వాయిస్‌ను రికార్డ్ చేయండి లేదా ఆడియో ఫైల్‌ను అప్‌లోడ్ చేయండి.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setCreationStep('uploading');
    setStatusMessage('Uploading audio...');

    try {
      const formData = new FormData();
      formData.append('client_id', clientId);
      formData.append('audio', recordedBlob, audioFileName);
      formData.append('voice_name', `Client_${clientId}_Voice`);
      formData.append(
        'mode',
        flowMode === 'recording_new' && activeProfile ? 'new_recording' : 'first_time'
      );

      setCreationStep('cloning');
      setStatusMessage('Creating your voice in ElevenLabs...');

      const res = await fetch('/api/voice-profile/create', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setCreationStep('failed');
        throw new Error(errorData?.error || `సర్వర్‌తో కనెక్ట్ కాలేదు (${res.status})`);
      }

      const data = await res.json();

      if (!data.success || !data.voice_id) {
        setCreationStep('failed');
        throw new Error(data.error || 'వాయిస్ క్లోనింగ్ విఫలమైంది. ElevenLabs voice_id రాలేదు.');
      }

      setCreationStep('voice_created');
      setCreationStep('preview_generating');
      setStatusMessage('Generating voice preview...');

      const previewText = data.preview_text || 'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.';
      // Step 4 & 5: Save candidate voice & immediately play actual cloned voice preview
      const newCandidate = {
        voice_id: data.voice_id,
        preview_url: data.preview_url,
        preview_audio_base64: data.preview_audio_base64,
        preview_text: previewText,
        created_at: data.created_at || new Date().toISOString(),
      };

      setCandidateVoice(newCandidate);

      // Play actual cloned voice preview immediately (NO BEEP!)
      stopAllAudio();
      const previewSrc = data.preview_audio_base64 || data.preview_url;
      if (previewSrc) {
        try {
          const audio = new Audio(previewSrc);
          candidateAudioPlayerRef.current = audio;
          setIsPlayingCandidatePreview(true);
          audio.onended = () => {
            setIsPlayingCandidatePreview(false);
            setCreationStep('preview_ready');
            setStatusMessage('Voice ready. Voice created successfully.');
          };
          audio.onerror = () => {
            setIsPlayingCandidatePreview(false);
            setCreationStep('preview_ready');
            setStatusMessage('Voice ready. Voice created successfully.');
          };
          await audio.play();
        } catch (playErr) {
          console.warn('Auto play preview error:', playErr);
          setIsPlayingCandidatePreview(false);
          setCreationStep('preview_ready');
          setStatusMessage('Voice ready. Voice created successfully.');
        }
      } else {
        setCreationStep('preview_ready');
        setStatusMessage('Voice ready. Voice created successfully.');
      }

      // Immediately activate newly created voice in parent state
      const newProfile: ClientVoiceProfile = {
        client_id: clientId,
        voice_id: data.voice_id,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'Active',
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        preview_audio_url: data.preview_url,
      };
      onVoiceActivated(newProfile);

      // Reset local recording state
      setRecordedBlob(null);
    } catch (err: any) {
      console.warn('Create voice error:', err?.message || err);
      setCreationStep('failed');
      setErrorMessage(err?.message || 'వాయిస్ క్లోన్ చేయడంలో సమస్య ఏర్పడింది. దయచేసి మళ్లీ ప్రయత్నించండి.');
    } finally {
      setIsLoading(false);
    }
  };

  // PLAY EXISTING ACTIVE VOICE
  const handleTogglePlayExistingVoice = () => {
    if (!activeProfile?.voice_id) return;

    if (isPlayingExistingVoice) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    const audioUrl = `/api/voice-profile/preview-audio/${encodeURIComponent(
      activeProfile.voice_id
    )}?t=${Date.now()}`;
    const audio = new Audio(audioUrl);
    existingAudioPlayerRef.current = audio;
    setIsPlayingExistingVoice(true);

    audio.onended = () => setIsPlayingExistingVoice(false);
    audio.onerror = () => setIsPlayingExistingVoice(false);
    audio.play().catch((e) => {
      console.warn('Playback error for active voice:', e);
      setIsPlayingExistingVoice(false);
    });
  };

  // PLAY CANDIDATE NEW VOICE PREVIEW
  const handleTogglePlayCandidatePreview = () => {
    if (!candidateVoice?.voice_id) return;

    if (isPlayingCandidatePreview) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    const audioUrl = candidateVoice.preview_audio_base64 || `/api/voice-profile/preview-audio/${encodeURIComponent(
      candidateVoice.voice_id
    )}?t=${Date.now()}`;
    const audio = new Audio(audioUrl);
    candidateAudioPlayerRef.current = audio;
    setIsPlayingCandidatePreview(true);

    audio.onended = () => setIsPlayingCandidatePreview(false);
    audio.onerror = () => setIsPlayingCandidatePreview(false);
    audio.play().catch((e) => {
      console.warn('Playback error for candidate voice:', e);
      setIsPlayingCandidatePreview(false);
    });
  };

  // USE THIS VOICE (User confirms candidate voice -> marks ACTIVE -> enables survey test)
  const handleUseNewVoice = async () => {
    if (!candidateVoice) return;
    setIsLoading(true);
    setErrorMessage(null);
    stopAllAudio();

    try {
      const res = await fetch('/api/voice-profile/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          voice_id: candidateVoice.voice_id,
        }),
      });

      if (!res.ok) throw new Error('వాయిస్ యాక్టివేషన్ విఫలమైంది');
      const data = await res.json();

      const newProfile: ClientVoiceProfile = {
        client_id: clientId,
        voice_id: candidateVoice.voice_id,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'Active',
        created_at: candidateVoice.created_at,
        updated_at: new Date().toISOString(),
        preview_audio_url: candidateVoice.preview_url,
      };

      onVoiceActivated(newProfile);
      setCandidateVoice(null);
      setFlowMode('normal');
      setStatusMessage('Voice Status: Active. మీ వాయిస్ సర్వేకు సిద్ధంగా ఉంది.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'కొత్త వాయిస్ యాక్టివేట్ చేయడంలో లోపం ఏర్పడింది.');
    } finally {
      setIsLoading(false);
    }
  };

  // RECORD AGAIN (User chooses not to use candidate voice)
  const handleKeepPreviousVoice = async () => {
    stopAllAudio();
    if (candidateVoice) {
      try {
        await fetch('/api/voice-profile/keep-previous', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            candidate_voice_id: candidateVoice.voice_id,
          }),
        });
      } catch (err) {
        console.warn('Keep-previous call error:', err);
      }
    }

    setCandidateVoice(null);
    setRecordedBlob(null);
    setFlowMode('normal');
    setStatusMessage(activeProfile?.voice_id ? 'మునుపటి వాయిస్ కొనసాగించబడుతోంది.' : 'వాయిస్ ఇంకా save కాలేదు.');
    handleStartRecording();
  };

  // RECORD NEW VOICE (Starts new recording flow while keeping existing active voice safe)
  const handleStartRecordNewVoiceFlow = () => {
    stopAllAudio();
    setFlowMode('recording_new');
    setRecordedBlob(null);
    setCandidateVoice(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    handleStartRecording();
  };

  // USE THIS VOICE FOR SURVEY (With strict Section 2 & 24 validation)
  const handleUseThisVoiceForSurvey = () => {
    setErrorMessage(null);
    stopAllAudio();

    // Section 2 & 24 Validation:
    // If active_voice_id does not exist or is not valid:
    // Show: "ముందుగా మీ వాయిస్ని సృష్టించి, పరీక్షించండి."
    if (
      !activeProfile?.voice_id ||
      activeProfile.status !== 'active' ||
      activeProfile.voice_id.includes('mock') ||
      activeProfile.voice_id.startsWith('dummy_')
    ) {
      setErrorMessage('ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.');
      return;
    }

    // Section 24: Require pronunciation verification test before launching survey
    if (!isPronunciationVerified) {
      setErrorMessage(
        'సెక్షన్ 24 నియమం: వాయిస్ సర్వే టెస్ట్ ప్రారంభించే ముందు, దయచేసి ఉచ్ఛారణ పోలిక పరీక్ష (Pronunciation Quality Comparison Test) లో కనీసం ఒక వాక్యాన్ని విని ఉచ్ఛారణను సరిచూసుకోండి.'
      );
      return;
    }

    onToggleUseClonedVoice(true);
    if (onStartSurveyTest) {
      onStartSurveyTest();
    }
  };

  // Section 14: Pronunciation Quality Test comparing A (Madhavi Reference), B (My Voice), C (My Voice - Pronunciation Optimized)
  const [activeCompareMode, setActiveCompareMode] = useState<'madhavi_ref' | 'raw_voice' | 'optimized' | null>(null);

  const handlePlayPronunciationComparison = async (index: number, mode: 'madhavi_ref' | 'raw_voice' | 'optimized') => {
    if (mode !== 'madhavi_ref' && (!activeProfile?.voice_id || activeProfile.status !== 'active')) {
      setErrorMessage('ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.');
      return;
    }

    stopAllAudio();
    setTestingSentenceIndex(index);
    setActiveCompareMode(mode);

    const modeLabels: Record<string, string> = {
      madhavi_ref: 'మాధవి తెలుగు ఉచ్ఛారణ & డెలివరీ రిఫరెన్స్ ఆడియో ప్లే అవుతోంది (ప్రమాణం)...',
      raw_voice: 'మీ క్లోన్డ్ వాయిస్ (డైరెక్ట్ TTS) ప్లే అవుతోంది...',
      optimized: 'మీ క్లోన్డ్ వాయిస్ — మాధవి ఉచ్ఛారణ & డెలివరీ ఆప్టిమైజ్డ్ పైప్‌లైన్ ద్వారా ప్రాసెస్ చేయబడుతోంది...',
    };
    setSentenceTestStatus(modeLabels[mode] || 'ప్రాసెస్ చేయబడుతోంది...');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/voice-profile/test-reference-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeProfile?.client_id || clientId,
          voice_id: activeProfile?.voice_id,
          text: TEST_SENTENCES[index],
          mode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 404 || errData?.has_active_voice === false) {
          onVoiceReset?.();
        }
        throw new Error(errData?.error || `ఆడియో తయారీ విఫలమైంది (${res.status})`);
      }

      const data = await res.json();
      if (!data.audio_base64) {
        throw new Error('ఆడియో డేటా రాలేదు');
      }

      setSentenceTestStatus(`${data.label || 'ఆడియో'}: విజయవంతంగా ప్లే అవుతోంది.`);
      setIsPronunciationVerified(true); // Marked verified upon hearing actual audio!

      const audio = new Audio(data.audio_base64);
      testAudioPlayerRef.current = audio;
      audio.onended = () => {
        setTestingSentenceIndex(null);
        setActiveCompareMode(null);
      };
      audio.onerror = () => {
        setTestingSentenceIndex(null);
        setActiveCompareMode(null);
        setSentenceTestStatus('ఆడియో ప్లేబ్యాక్ లోపం');
      };
      await audio.play();
    } catch (err: any) {
      console.warn('Pronunciation comparison playback error:', err);
      setErrorMessage(err?.message || 'టెస్ట్ ఆడియో ప్లే చేయడంలో సమస్య ఏర్పడింది.');
      setTestingSentenceIndex(null);
      setActiveCompareMode(null);
      setSentenceTestStatus(null);
    }
  };

  const hasSavedVoice = Boolean(activeProfile && activeProfile.voice_id);

  return (
    <div className="bg-white border-b border-zinc-200 shadow-xs transition-all">
      {/* Top Header Row of the Section */}
      <div className="px-4 py-3 sm:px-6 flex items-center justify-between bg-zinc-50/80 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold tracking-tight text-zinc-900 flex items-center gap-1.5">
                <span>క్లయింట్ వాయిస్</span>
                <span className="text-zinc-400 font-normal text-xs">/ Client Voice</span>
              </h2>

              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
                ElevenLabs Voice Clone
              </span>

              {/* Status Badge */}
              {hasSavedVoice ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  Voice Status: Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertCircle className="w-3 h-3 mr-1 text-amber-600" />
                  వాయిస్ ఇంకా save కాలేదు
                </span>
              )}

              {/* Active Cloned Voice In Survey Badge */}
              {hasSavedVoice && useClonedVoiceForSurvey && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Radio className="w-2.5 h-2.5 mr-1 text-indigo-600 animate-pulse" />
                  సర్వేలో యాక్టివ్
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              క్లయింట్ గొంతును రికార్డ్ చేసి ElevenLabs ద్వారా క్లోన్ చేయండి • సర్వేలో ప్రత్యక్షంగా పరీక్షించండి
            </p>
          </div>
        </div>

        {/* Right Header Controls: Expand/Collapse & Cloned Voice Toggle */}
        <div className="flex items-center gap-2">
          {hasSavedVoice && (
            <button
              onClick={() => onToggleUseClonedVoice(!useClonedVoiceForSurvey)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                useClonedVoiceForSurvey
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
              }`}
              title="సర్వేలో క్లోన్ చేసిన వాయిస్‌ను ఆన్/ఆఫ్ చేయండి"
            >
              {useClonedVoiceForSurvey ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>క్లోన్ వాయిస్: ఆన్</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>క్లోన్ వాయిస్: ఆఫ్</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-md hover:bg-zinc-200 text-zinc-600 transition-colors"
            title={isExpanded ? 'కుదించు (Collapse)' : 'విస్తరించు (Expand)'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Agent Speaking Banner Indicator */}
      {isAgentSpeaking && (
        <div className="bg-emerald-900 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-emerald-800 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-300"></span>
            </span>
            <span className="font-semibold">
              {useClonedVoiceForSurvey && activeProfile
                ? `🎙️ క్లయింట్ క్లోన్ చేసిన వాయిస్‌తో ఏజెంట్ మాట్లాడుతోంది (${activeProfile.voice_id})`
                : '🗣️ AI ఏజెంట్ సమాధానం చెబుతోంది (Speaking)...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] opacity-90">
            <span className="inline-block w-1.5 h-3 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="inline-block w-1.5 h-4 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="inline-block w-1.5 h-2.5 bg-white rounded-full animate-bounce"></span>
          </div>
        </div>
      )}

      {/* Main Section Content Area */}
      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-4 bg-white">
          {/* Error alert banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-6 flex-wrap">
                <button
                  type="button"
                  onClick={handleUseSampleAudio}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>నమూనా ఆడియోతో కొనసాగించండి (Use Sample Voice)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-zinc-700 border border-zinc-300 font-medium hover:bg-zinc-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-600" />
                  <span>ఆడియో ఫైల్ అప్‌లోడ్ (Upload Audio)</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FLOW A: CANDIDATE CLONED VOICE PREVIEW & USER CONFIRMATION               */}
          {/* ========================================================================= */}
          {candidateVoice && (
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-300 space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Cloned Voice Preview (క్లోన్ వాయిస్ ప్రివ్యూ)
                  </span>
                </div>
                <span className="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-amber-300 text-zinc-700">
                  Voice ID: {candidateVoice.voice_id}
                </span>
              </div>

              {/* Fixed Test Telugu Sentence */}
              <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1.5">
                <span className="text-[10px] font-bold text-amber-900 tracking-wide uppercase">
                  Telugu TTS Preview Sentence:
                </span>
                <p className="text-xs text-zinc-900 font-medium italic">
                  "{candidateVoice.preview_text || 'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.'}"
                </p>
              </div>

              {/* Question: ఈ వాయిస్ మీకు నచ్చిందా? */}
              <div className="pt-1">
                <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <span>ఈ వాయిస్ మీకు నచ్చిందా?</span>
                  <span className="text-xs font-normal text-zinc-500">(Do you like this voice?)</span>
                </h4>
                <p className="text-xs text-zinc-600 mt-0.5">
                  ప్రివ్యూ విని సరిచూసుకోండి. నచ్చితే "Use This Voice" ఎంచుకోండి లేదా మళ్లీ రికార్డ్ చేయడానికి "Record Again" నొక్కండి.
                </p>
              </div>

              {/* Audio Playback & Decision Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap pt-1">
                <button
                  onClick={handleTogglePlayCandidatePreview}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-white hover:bg-zinc-900 transition-colors shadow-xs"
                >
                  {isPlayingCandidatePreview ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>ఆపు (Pause Preview)</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>▶ Play Cloned Voice Preview</span>
                    </>
                  )}
                </button>

                {/* [Use This Voice] */}
                <button
                  onClick={handleUseNewVoice}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Use This Voice</span>
                </button>

                {/* [Record Again] */}
                <button
                  onClick={handleKeepPreviousVoice}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4 text-zinc-600" />
                  <span>Record Again</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FLOW B: RETURNING CLIENT WITH ACTIVE SAVED VOICE                          */}
          {/* ========================================================================= */}
          {hasSavedVoice && !candidateVoice && flowMode === 'normal' && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping"></div>
                  <h3 className="text-sm font-bold text-emerald-950">
                    మీ voice ఇప్పటికే save అయి ఉంది.
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                    Voice Status: Active
                  </span>
                  <span className="text-[11px] font-mono text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                    {activeProfile?.voice_id}
                  </span>
                </div>
              </div>

              {/* Section 3 & 4 Architecture: Madhavi Telugu Pronunciation Reference + Final Cloned Voice Target */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/90 via-sky-50/60 to-white border border-indigo-200/90 text-indigo-950 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-700" />
                    <span className="text-xs font-bold text-indigo-950">
                      తెలుగు ఉచ్ఛారణ & డెలివరీ పైప్‌లైన్ (Pronunciation & Delivery Reference)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300">
                    Madhavi Delivery Ref (4XvBGCPMXWyVQa75dbZg)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-zinc-500 block text-[10px] font-medium uppercase tracking-wider">
                      1. Conversation Brain
                    </span>
                    <span className="font-semibold text-zinc-900 block mt-0.5">
                      OpenAI (Natural Spoken Telugu)
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-zinc-500 block text-[10px] font-medium uppercase tracking-wider">
                      2. Pronunciation & Cadence Ref
                    </span>
                    <span className="font-semibold text-indigo-900 block mt-0.5">
                      Madhavi (4XvBGCPMXWyVQa75dbZg)
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40 shadow-2xs">
                    <span className="text-emerald-800 block text-[10px] font-medium uppercase tracking-wider">
                      3. Target Voice (Final Speaker)
                    </span>
                    <span className="font-bold text-emerald-950 block mt-0.5">
                      మీ క్లోన్డ్ వాయిస్ ({activeProfile?.voice_id})
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-indigo-900/90 leading-relaxed bg-white/70 p-2 rounded-lg border border-indigo-100">
                  <strong>ముఖ్యమైన నియమం:</strong> మాధవి వాయిస్ కేవలం సహజ తెలుగు ఉచ్ఛారణ, వాక్య ప్రవాహం మరియు విరామాల (cadence/pauses) కోసం రిఫరెన్స్ గా మాత్రమే పనిచేస్తుంది. ElevenLabs స్పీచ్-టు-స్పీచ్ ద్వారా ఆ శైలిని మీ క్లోన్డ్ వాయిస్‌లోకి బదిలీ చేస్తాము. సర్వే వినేవారికి ఎల్లప్పుడూ <strong>మీ వాయిస్</strong> మాత్రమే వినిపిస్తుంది.
                </p>
              </div>

              {/* Section 14 & 16: Pronunciation Quality Test Suite (3-Way Listening & Telugu Vocabulary) */}
              <div className="p-3.5 bg-white rounded-xl border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-zinc-900">
                      ఉచ్ఛారణ పోలిక పరీక్ష (Pronunciation Quality Comparison Test)
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    3-Way Comparison: Madhavi Reference vs My Voice vs Optimized
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-sky-50/80 border border-sky-200 text-[11px] text-sky-950 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>సెక్షన్ 14 & 15 ఉచ్ఛారణ నియమం:</strong>
                    కింది వాక్యాలను మూడు రూపాల్లో వినండి:
                    <span className="font-semibold text-purple-700"> [A] Madhavi Reference</span> (ఉచ్ఛారణ ప్రమాణం),
                    <span className="font-semibold text-zinc-700"> [B] My Voice</span> (డైరెక్ట్ TTS),
                    <span className="font-semibold text-emerald-700"> [C] My Voice — Pronunciation Optimized</span> (మాధవి శైలి ఉచ్ఛారణ & విరామాలతో కూడిన మీ వాయిస్).
                    తుది ఆడియోలో స్పీకర్ గుర్తింపు (Voice Identity) ఎల్లప్పుడూ <strong>మీ క్లోన్డ్ వాయిస్</strong> మాత్రమే!
                  </div>
                </div>

                {sentenceTestStatus && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
                    <span>{sentenceTestStatus}</span>
                  </div>
                )}

                {/* Sentences List with 3-Way Comparison Buttons */}
                <div className="space-y-3">
                  {TEST_SENTENCES.map((sentence, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-zinc-50/80 hover:bg-zinc-50 border border-zinc-200/90 space-y-2.5 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-xs text-zinc-900 font-semibold leading-relaxed">
                          "{sentence}"
                        </p>
                      </div>

                      {/* 3 Action Buttons for Comparison */}
                      <div className="flex items-center gap-2 flex-wrap pl-7">
                        {/* Button A: Madhavi Reference */}
                        <button
                          onClick={() => handlePlayPronunciationComparison(idx, 'madhavi_ref')}
                          disabled={isLoading || (testingSentenceIndex === idx && activeCompareMode === 'madhavi_ref')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition-colors disabled:opacity-50"
                          title="Madhavi Telugu Pronunciation Reference"
                        >
                          {testingSentenceIndex === idx && activeCompareMode === 'madhavi_ref' ? (
                            <span className="w-3 h-3 border-2 border-purple-700 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <Play className="w-3 h-3 text-purple-700 fill-current" />
                          )}
                          <span>Madhavi Reference</span>
                        </button>

                        {/* Button B: My Voice */}
                        <button
                          onClick={() => handlePlayPronunciationComparison(idx, 'raw_voice')}
                          disabled={isLoading || (testingSentenceIndex === idx && activeCompareMode === 'raw_voice')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 transition-colors disabled:opacity-50"
                          title="My Cloned Voice Direct"
                        >
                          {testingSentenceIndex === idx && activeCompareMode === 'raw_voice' ? (
                            <span className="w-3 h-3 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <Play className="w-3 h-3 text-zinc-700 fill-current" />
                          )}
                          <span>My Voice</span>
                        </button>

                        {/* Button C: My Voice — Pronunciation Optimized */}
                        <button
                          onClick={() => handlePlayPronunciationComparison(idx, 'optimized')}
                          disabled={isLoading || (testingSentenceIndex === idx && activeCompareMode === 'optimized')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors shadow-2xs disabled:opacity-50"
                          title="My Voice with Madhavi Pronunciation Transfer & Cadence"
                        >
                          {testingSentenceIndex === idx && activeCompareMode === 'optimized' ? (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <Play className="w-3 h-3 fill-current" />
                          )}
                          <span>My Voice — Pronunciation Optimized</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Section 7: Telugu Vocabulary & Pronunciation Dictionary Display */}
                <div className="mt-4 pt-3 border-t border-zinc-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      తెలుగు ఉచ్ఛారణ నిఘంటువు (Pronunciation Dictionary Memory)
                    </span>
                    <span className="text-[10px] text-zinc-400">18 Survey Terms Normalized</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto p-1 bg-zinc-50/60 rounded-lg border border-zinc-200/80">
                    {TELUGU_VOCABULARY_LIST.map((item, vIdx) => (
                      <div
                        key={vIdx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-zinc-200 text-[11px] shadow-2xs"
                      >
                        <span className="font-semibold text-zinc-900">{item.word}</span>
                        <span className="text-[10px] font-mono text-indigo-600">[{item.breakdown}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 6: Improve Voice Clone Quality (Multi-Sample Guided Telugu Training) */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/60 border border-indigo-200/90 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-700" />
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950">
                        వాయిస్ నాణ్యతను మెరుగుపరచండి (Improve Voice Clone Quality)
                      </h4>
                      <span className="text-[10px] text-zinc-500">
                        Multi-Sample Telugu Training for Accurate Pronunciation & Cadence
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImproveVoiceExpanded((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-indigo-200 text-indigo-900 hover:bg-indigo-50 transition-colors shadow-2xs"
                  >
                    <span>{isImproveVoiceExpanded ? 'దాచు (Hide Training)' : '5 తెలుగు శాంపిల్స్ రికార్డ్ చేయండి (Open Training)'}</span>
                    {isImproveVoiceExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Always-visible summary info */}
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  ElevenLabs క్లోనింగ్ గైడ్‌లైన్స్ ప్రకారం, ఒకే ఒక్క చిన్న ఆడియో కంటే వివిధ అచ్చులు, మూర్ధన్య హల్లులు (ళ, ల, ఱ, ర, ట, త, డ, ద, న, ణ) మరియు ప్రశ్నలతో కూడిన <strong>5 ప్రత్యేక శాంపిల్స్</strong> రికార్డ్ చేయడం ద్వారా మీ క్లోన్ వాయిస్ సహజ తెలుగు ఉచ్ఛారణను సంపూర్ణంగా గ్రహిస్తుంది.
                </p>

                {isImproveVoiceExpanded && (
                  <div className="space-y-3 pt-2 border-t border-indigo-100 animate-fadeIn">
                    {/* Professional Voice Cloning Note */}
                    <div className="p-2.5 rounded-lg bg-indigo-100/60 border border-indigo-200 text-[11px] text-indigo-900 leading-relaxed">
                      <strong>గమనిక (Cloning Fidelity):</strong> ప్రస్తుత సిస్టమ్ ElevenLabs <em>Instant Voice Cloning (IVC)</em> ద్వారా 1 నుండి 25 శాంపిల్స్‌తో శిక్షణ ఇస్తుంది. భవిష్యత్తులో స్టూడియో స్థాయిలో 100% మానవ సహజత్వంతో కూడిన ఉచ్ఛారణ కోసం ElevenLabs <em>Professional Voice Cloning (PVC)</em> ను సపోర్ట్ చేస్తుంది (దీనికి 30+ నిమిషాల ప్రొఫెషనల్ ఆడియో అవసరం).
                    </div>

                    {/* 5 Guided Telugu Scripts */}
                    <div className="space-y-2.5">
                      {GUIDED_TELUGU_TRAINING_SCRIPTS.map((item) => {
                        const sample = multiSamples[item.id];
                        const isThisRecording = recordingScriptId === item.id;
                        const isThisPlaying = playingScriptAudioId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-all ${
                              sample
                                ? 'bg-emerald-50/70 border-emerald-300'
                                : isThisRecording
                                ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
                                : 'bg-white border-zinc-200'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                              <span className="text-[11px] font-bold text-zinc-900 flex items-center gap-1.5">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  sample ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700'
                                }`}>
                                  {item.id}
                                </span>
                                {item.title}
                              </span>
                              <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                ఫోకస్: {item.focus}
                              </span>
                            </div>

                            {/* Script to read out loud */}
                            <p className="text-xs text-zinc-900 font-semibold bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/80 leading-relaxed">
                              "{item.script}"
                            </p>

                            {/* Controls for this sample */}
                            <div className="flex items-center justify-between flex-wrap gap-2 mt-2 pt-1">
                              <div className="flex items-center gap-2">
                                {isThisRecording ? (
                                  <button
                                    type="button"
                                    onClick={handleStopScriptRecording}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-xs animate-pulse"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                    <span>రికార్డింగ్ ఆపు ({formatTimer(scriptTimer)})</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleStartScriptRecording(item.id)}
                                    disabled={isLoading || recordingScriptId !== null}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-2xs ${
                                      sample
                                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
                                        : 'bg-indigo-700 hover:bg-indigo-800 text-white'
                                    }`}
                                  >
                                    <Mic className="w-3.5 h-3.5" />
                                    <span>{sample ? 'మళ్లీ రికార్డ్ చేయి' : 'ఈ శాంపిల్ రికార్డ్ చేయండి'}</span>
                                  </button>
                                )}

                                {sample && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handlePlayScriptSample(item.id)}
                                      disabled={isThisRecording}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-900 transition-colors"
                                    >
                                      {isThisPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                                      <span>{isThisPlaying ? 'ఆపు' : 'ప్లే'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteScriptSample(item.id)}
                                      className="text-xs text-zinc-400 hover:text-red-600 transition-colors"
                                      title="తొలగించు"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>

                              <span className="text-[11px] font-medium text-zinc-500">
                                {sample ? '✓ శాంపిల్ సిద్ధంగా ఉంది' : 'ఇంకా రికార్డ్ కాలేదు'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Multi-sample Action Footer */}
                    <div className="p-3 bg-white rounded-xl border border-indigo-200 flex items-center justify-between flex-wrap gap-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-950">
                          రికార్డ్ అయిన శాంపిల్స్: {Object.keys(multiSamples).length} / 5
                        </span>
                        <input
                          type="file"
                          ref={multiFileInputRef}
                          onChange={handleMultiFileUpload}
                          multiple
                          accept="audio/*"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => multiFileInputRef.current?.click()}
                          className="text-xs text-indigo-700 hover:underline inline-flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" />
                          <span>లేదా బహుళ ఆడియో ఫైళ్ళను అప్‌లోడ్ చేయండి</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleSubmitMultiSampleVoiceClone}
                        disabled={isLoading || Object.keys(multiSamples).length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white transition-all shadow-xs disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>ఈ శాంపిల్స్‌తో హై-ఫిడిలిటీ వాయిస్ క్లోన్ చేయండి ({Object.keys(multiSamples).length} Samples)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons as specified in User Section 6 */}
              <div className="flex items-center gap-2.5 flex-wrap pt-1">
                {/* [▶ Play Existing Voice] */}
                <button
                  onClick={handleTogglePlayExistingVoice}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-800 text-white hover:bg-emerald-900 transition-colors shadow-xs"
                >
                  {isPlayingExistingVoice ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>ఆపు (Pause Voice)</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>▶ Play Existing Voice</span>
                    </>
                  )}
                </button>

                {/* [Improve Voice Clone Button] */}
                <button
                  onClick={() => setIsImproveVoiceExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Improve Voice Clone (బహుళ శాంపిల్స్)</span>
                </button>

                {/* [Use This Voice] */}
                <button
                  onClick={handleUseThisVoiceForSurvey}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Use This Voice</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </button>

                {/* [Record New Voice] */}
                <button
                  onClick={handleStartRecordNewVoiceFlow}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-100 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Record New Voice</span>
                </button>
              </div>

              {/* Section 10, 13 & 24: Dedicated LOCAL VOICE SURVEY TEST Area */}
              <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-950 text-white border border-emerald-800/60 shadow-sm space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <h4 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                      <span>Local Voice Survey Test</span>
                      <span className="text-emerald-400 font-normal text-xs">/ స్థానిక వాయిస్ సర్వే పరీక్ష</span>
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isPronunciationVerified ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
                        ఉచ్ఛారణ ధృవీకరించబడింది (Verified)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <AlertCircle className="w-3 h-3 mr-1 text-amber-400" />
                        ఉచ్ఛారణ సరిచూడాలి (Test Required)
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      Target: My Cloned Voice
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-400">Target Speaker: </span>
                    <span className="font-semibold text-white">
                      {activeProfile?.metadata?.elevenlabs_name || `My Cloned Voice (${activeProfile?.voice_id || 'Active'})`}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Cadence Reference: </span>
                    <span className="font-semibold text-emerald-400">Madhavi (4XvBGCPMXWyVQa75dbZg)</span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  ఈ బటన్ నొక్కినప్పుడు లైవ్ ఫోన్ ప్రొవైడర్ లేకుండానే మీ బ్రౌజర్‌లో లోకల్ వాయిస్ సర్వే టెస్ట్ ప్రారంభమవుతుంది:
                  ఏజెంట్ గ్రీటింగ్ → రెస్పాండెంట్ సమాధానం → OpenAI బ్రెయిన్ → మాధవి రిఫరెన్స్ + STS → మీ క్లోన్డ్ వాయిస్ లో ఆడియో ప్లేబ్యాక్!
                </p>

                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  <button
                    onClick={handleUseThisVoiceForSurvey}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all shadow-md hover:scale-[1.01]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Voice Survey Test</span>
                    <span className="text-[11px] font-normal opacity-80">(వాయిస్ సర్వే టెస్ట్ ప్రారంభించండి)</span>
                  </button>

                  {!isPronunciationVerified && (
                    <button
                      type="button"
                      onClick={() => setIsPronunciationVerified(true)}
                      className="text-xs text-emerald-300 hover:text-emerald-200 underline"
                    >
                      ఉచ్ఛారణ సరిచూశాను (I have verified pronunciation)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FLOW C: FIRST TIME OR RECORDING IN PROGRESS OR RECORDED PENDING CREATION  */}
          {/* ========================================================================= */}
          {(!hasSavedVoice || flowMode === 'recording_new') && !candidateVoice && (
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4">
              {!hasSavedVoice && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-bold text-zinc-800">
                      వాయిస్ ఇంకా save కాలేదు.
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    మొదటిసారి వాయిస్ నమోదు (First-time recording)
                  </span>
                </div>
              )}

              {flowMode === 'recording_new' && (
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-200 pb-2">
                  <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-emerald-700" />
                    కొత్త వాయిస్ రికార్డింగ్ (Recording New Voice)
                  </span>
                  <button
                    onClick={() => {
                      setFlowMode('normal');
                      setRecordedBlob(null);
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-800 underline"
                  >
                    రద్దు చేయి (Cancel)
                  </button>
                </div>
              )}

              {/* State 1: Active Microphone Recording in Progress */}
              {isRecording && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-center space-y-3 animate-pulse">
                  <div className="flex items-center justify-center gap-2 text-red-700 font-bold text-sm">
                    <span className="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                    <span>Recording...</span>
                  </div>

                  {/* Formatted Timer: 00:01, 00:02, 00:03... */}
                  <div className="text-3xl font-mono font-bold tracking-widest text-red-900">
                    {formatTimer(recordingSeconds)}
                  </div>

                  <p className="text-xs text-red-700">
                    మీరు తెలుగులో ఏదైనా ఒక వాక్యం స్పష్టంగా మాట్లాడండి (ఉదా: "నమస్కారం, నా పేరు రాజు. నేను ప్రజా సమస్యల గురించి మాట్లాడాలనుకుంటున్నాను.")
                  </p>

                  <div>
                    {/* [Stop Recording] button */}
                    <button
                      onClick={handleStopRecording}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-800 transition-colors shadow-md"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Stop Recording</span>
                    </button>
                  </div>
                </div>
              )}

              {/* State 2: Stopped Recording -> Ready for Play Recording, Record Again, Create Voice */}
              {!isRecording && recordedBlob && (
                <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-semibold text-emerald-950">
                        ఆడియో రికార్డింగ్ పూర్తయింది ({formatTimer(recordingSeconds)})
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {(recordedBlob.size / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600">
                    మీ రికార్డింగ్‌ను ప్లే చేసి సరిచూసుకోండి. నచ్చితే "Create Voice" క్లిక్ చేసి ElevenLabs ద్వారా క్లోన్ చేయండి.
                  </p>

                  {/* Three required action buttons after stopping */}
                  <div className="flex items-center gap-2.5 flex-wrap pt-1">
                    {/* [Play Recording] */}
                    <button
                      onClick={handleTogglePlayRecording}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-white hover:bg-zinc-900 transition-colors shadow-xs"
                    >
                      {isPlayingRecording ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>ఆపు (Pause)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Play Recording</span>
                        </>
                      )}
                    </button>

                    {/* [Record Again] */}
                    <button
                      onClick={handleRecordAgain}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Record Again</span>
                    </button>

                    {/* [Create Voice] */}
                    <button
                      onClick={handleCreateVoice}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>క్లోనింగ్ జరుగుతోంది...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-emerald-300" />
                          <span>Create Voice</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: Idle (Not recording, no pending recorded blob yet) */}
              {!isRecording && !recordedBlob && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-zinc-600 space-y-1">
                    <p className="font-medium text-zinc-900">
                      మీ వాయిస్ రికార్డ్ చేయడానికి సిద్ధంగా ఉండండి:
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      కనీసం 5-15 సెకన్ల పాటు స్పష్టంగా మాట్లాడండి లేదా సిద్ధంగా ఉన్న ఆడియో ఫైల్‌ను అప్‌లోడ్ చేయండి.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                    {/* [Record Voice] button */}
                    <button
                      onClick={handleStartRecording}
                      disabled={isLoading}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Record Voice</span>
                    </button>

                    {/* [Use Sample Audio] demo option */}
                    <button
                      onClick={handleUseSampleAudio}
                      disabled={isLoading}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      title="మైక్రోఫోన్ లేకుండానే పరీక్షించడానికి సిద్ధంగా ఉన్న నమూనా ఆడియోను ఉపయోగించండి"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>నమూనా ఆడియో (Demo Sample)</span>
                    </button>

                    {/* [Upload Audio] option */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                      title="కంప్యూటర్ నుండి ఆడియో ఫైల్ అప్‌లోడ్ చేయండి"
                    >
                      <Upload className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Upload Audio</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION FOOTER: VOICE TEST STATUS & SURVEY INTEGRATION GUIDE              */}
          {/* ========================================================================= */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                రక్షణ: ElevenLabs API కీ సర్వర్ వద్ద మాత్రమే సురక్షితంగా ఉంటుంది (Client-safe).
              </span>
            </div>
            {hasSavedVoice && (
              <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  సర్వేలో సమాధానం ఇచ్చేటప్పుడు ఈ సేవ్ చేసిన వాయిస్ ఉపయోగించబడుతుంది.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
