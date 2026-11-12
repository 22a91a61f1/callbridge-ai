import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Volume2,
  ShieldCheck,
  Sparkles,
  X,
  ThumbsUp,
  RefreshCw,
  Building2,
  Lock,
  Trash2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { VoiceProfileRecord, TenantUser } from '../types/callbridge';

interface VoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTenant: TenantUser | null;
  selectedVoiceId?: string;
  onSelectVoice: (profile: VoiceProfileRecord) => void;
  onTenantUpdated?: () => void;
  eventType?: string;
  eventId?: string;
}

export function VoiceStudioModal({
  isOpen,
  onClose,
  currentTenant,
  selectedVoiceId,
  onSelectVoice,
  onTenantUpdated,
  eventType,
  eventId,
}: VoiceStudioModalProps) {
  const [profiles, setProfiles] = useState<VoiceProfileRecord[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);

  // ElevenLabs Upload & Review Workflow
  const [isUploading, setIsUploading] = useState(false);
  const [candidateProfile, setCandidateProfile] = useState<VoiceProfileRecord | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // Saved Voice Playback State
  const [playingSavedVoiceId, setPlayingSavedVoiceId] = useState<string | null>(null);

  // Voice Deletion State
  const [voiceToDelete, setVoiceToDelete] = useState<VoiceProfileRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const previewPlayerRef = useRef<HTMLAudioElement | null>(null);
  const savedVoicePlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordSectionRef = useRef<HTMLDivElement | null>(null);

  const formatEventTitle = (type?: string) => {
    if (!type) return '';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Authoritative approved voice profile for this user and event:
  const approvedProfileForEvent =
    profiles.find(
      (p) =>
        p.clientId === currentTenant?.id &&
        (!eventType || !p.eventType || p.eventType === eventType) &&
        (p.approvalStatus === 'approved' || p.isApproved) &&
        p.voiceStatus !== 'failed'
    ) ||
    (eventType && currentTenant?.eventVoiceProfiles?.[eventType]
      ? {
          id:
            currentTenant.eventVoiceProfiles[eventType].approvedVoiceProfileId ||
            currentTenant.eventVoiceProfiles[eventType].voiceProfileId ||
            '',
          name:
            currentTenant.eventVoiceProfiles[eventType].approvedVoiceName ||
            currentTenant.eventVoiceProfiles[eventType].voiceName ||
            '',
          voiceName:
            currentTenant.eventVoiceProfiles[eventType].approvedVoiceName ||
            currentTenant.eventVoiceProfiles[eventType].voiceName ||
            '',
          providerVoiceId: currentTenant.eventVoiceProfiles[eventType].providerVoiceId,
          elevenLabsVoiceId: currentTenant.eventVoiceProfiles[eventType].providerVoiceId,
          approvalStatus: 'approved' as const,
          isApproved: true,
        }
      : null);

  const displayApprovedVoiceName =
    approvedProfileForEvent?.name ||
    (approvedProfileForEvent as any)?.voiceName ||
    (eventType ? 'No approved voice for this event yet' : currentTenant?.approvedVoiceName || 'No approved voice for this event yet');

  const displayApprovedVoiceId =
    approvedProfileForEvent?.providerVoiceId ||
    (approvedProfileForEvent as any)?.elevenLabsVoiceId ||
    (eventType
      ? currentTenant?.eventVoiceProfiles?.[eventType]?.providerVoiceId || ''
      : currentTenant?.approvedVoiceProfileId || '');

  const hasApprovedVoice = Boolean(
    displayApprovedVoiceName &&
      displayApprovedVoiceName !== 'No approved voice for this event yet' &&
      displayApprovedVoiceId
  );

  const [isSelectingVoiceId, setIsSelectingVoiceId] = useState<string | null>(null);

  // Fetch saved voice profiles strictly scoped to current tenant AND eventType
  // Exclude any reference/system voices like Madhavi
  const fetchProfiles = async () => {
    if (!currentTenant) return;
    setIsLoadingProfiles(true);
    try {
      const eventTypeParam = eventType ? `&eventType=${encodeURIComponent(eventType)}` : '';
      const res = await fetch(
        `/api/callbridge/voice-profiles?clientId=${encodeURIComponent(currentTenant.id)}${eventTypeParam}`
      );
      const data = await res.json();
      if (data.profiles && Array.isArray(data.profiles)) {
        // Strictly filter out any Madhavi reference voice or foreign profiles
        const clientOnly = data.profiles.filter(
          (p: VoiceProfileRecord) =>
            p.clientId === currentTenant.id &&
            (!eventType || !p.eventType || p.eventType === eventType) &&
            !p.name?.toLowerCase().includes('madhavi') &&
            p.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg' &&
            p.id !== 'vp_madhavi_reference'
        );
        setProfiles(clientOnly);
      }
    } catch (e: any) {
      console.warn('Could not load voice profiles:', e.message);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      resetRecordingState();
      setCandidateProfile(null);
      setPreviewAudioUrl(null);
      setVoiceToDelete(null);
      setProfileName('');
    }
  }, [isOpen, currentTenant?.id, eventType, eventId]);

  const resetRecordingState = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
      previewPlayerRef.current = null;
    }
    if (savedVoicePlayerRef.current) {
      savedVoicePlayerRef.current.pause();
      savedVoicePlayerRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlayingRecorded(false);
    setIsPlayingPreview(false);
    setPlayingSavedVoiceId(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const startRecording = async () => {
    resetRecordingState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Detect supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 120) {
            stopRecording();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setErrorMessage('Microphone access denied. Please grant microphone permission in your browser.');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const togglePlayRecordedAudio = () => {
    if (!audioUrl) return;

    if (isPlayingRecorded) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setIsPlayingRecorded(false);
    } else {
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => setIsPlayingRecorded(false);
      audio.onerror = () => setIsPlayingRecorded(false);
      audio.play().catch(() => setIsPlayingRecorded(false));
      setIsPlayingRecorded(true);
    }
  };

  // Preview a saved voice profile directly from the list
  const togglePlaySavedVoice = async (profile: VoiceProfileRecord) => {
    const voiceId = profile.providerVoiceId || profile.id;
    if (playingSavedVoiceId === voiceId) {
      if (savedVoicePlayerRef.current) {
        savedVoicePlayerRef.current.pause();
        savedVoicePlayerRef.current = null;
      }
      setPlayingSavedVoiceId(null);
      return;
    }

    if (savedVoicePlayerRef.current) {
      savedVoicePlayerRef.current.pause();
      savedVoicePlayerRef.current = null;
    }

    setPlayingSavedVoiceId(voiceId);
    try {
      const sampleText =
        'నమస్కారం! ఇది నా స్వంత రికార్డ్ చేసిన వాయిస్ ప్రొఫైల్. కాల్‌బ్రిడ్జ్ ద్వారా అధికారికంగా ప్రసారం చేయడానికి సిద్ధంగా ఉంది.';

      const res = await fetch('/api/callbridge/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceProfileId: voiceId,
          language: 'te',
          clientId: currentTenant?.id,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to synthesize sample audio for saved voice.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      savedVoicePlayerRef.current = audio;
      audio.onended = () => setPlayingSavedVoiceId(null);
      audio.onerror = () => setPlayingSavedVoiceId(null);
      audio.play().catch(() => setPlayingSavedVoiceId(null));
    } catch (e: any) {
      console.warn('Playback error for saved voice:', e.message);
      setPlayingSavedVoiceId(null);
    }
  };

  // Step 2 & 3: Upload recording and create ElevenLabs voice clone
  const handleCreateVoiceClone = async () => {
    // 1. Validate Voice Name explicitly
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a Voice Name before creating a clone.');
      return;
    }

    // 2. Validate audio recording existence
    if (!audioBlob || audioBlob.size === 0) {
      setErrorMessage('Audio recording is missing. Please record your voice sample before creating a clone.');
      return;
    }

    // 3. Validate tenant
    if (!currentTenant) {
      setErrorMessage('No active client account selected.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      // Use standard field names recognized by backend
      const fileName =
        audioBlob.type.includes('mp4') ? 'voice_sample.mp4' : 'voice_sample.webm';
      formData.append('audio', audioBlob, fileName);
      formData.append('name', trimmedName);
      formData.append('voiceName', trimmedName);
      formData.append('voice_name', trimmedName);
      formData.append('clientId', currentTenant.id);
      formData.append('userId', currentTenant.id);
      formData.append('provider', 'elevenlabs');
      if (eventType) {
        formData.append('eventType', eventType);
      }
      if (eventId) {
        formData.append('eventId', eventId);
      }

      // Do NOT set manual multipart headers; fetch creates the proper boundary automatically
      const res = await fetch('/api/callbridge/voice-profiles/record-clone', {
        method: 'POST',
        body: formData,
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        data = { error: `Server returned HTTP ${res.status}: ${res.statusText}` };
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to create cloned voice profile (HTTP ${res.status})`);
      }

      setCandidateProfile(data.profile);
      setSuccessMessage('Voice clone created with ElevenLabs! Synthesizing preview sample...');

      // Step 4 & 5: Generate a sample using the newly cloned voice
      await generateVoicePreviewSample(data.profile.providerVoiceId || data.profile.id);
      await fetchProfiles();
    } catch (err: any) {
      const msg = err.message || 'Error generating cloned voice profile with ElevenLabs.';
      setErrorMessage(
        msg.includes('Failed to fetch')
          ? 'Network or server connection issue while uploading audio to voice service. Please check your connection and retry.'
          : msg
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Generate preview audio with the cloned voice
  const generateVoicePreviewSample = async (voiceId: string) => {
    setIsGeneratingPreview(true);
    try {
      const sampleText =
        'నమస్కారం! ఇది నా స్వంత రికార్డ్ చేసిన వాయిస్ ప్రొఫైల్. కాల్‌బ్రిడ్జ్ ద్వారా అధికారికంగా ప్రసారం చేయడానికి సిద్ధంగా ఉంది.';

      const res = await fetch('/api/callbridge/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceProfileId: voiceId,
          language: 'te',
          clientId: currentTenant?.id,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to synthesize sample audio with new voice ID.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewAudioUrl(url);

      // Play audio automatically
      const audio = new Audio(url);
      previewPlayerRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
      audio.onerror = () => setIsPlayingPreview(false);
      audio.play().then(() => setIsPlayingPreview(true)).catch(() => {});
    } catch (err: any) {
      console.warn('Sample generation error:', err);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const togglePlayPreview = () => {
    if (!previewAudioUrl) return;
    if (isPlayingPreview) {
      if (previewPlayerRef.current) previewPlayerRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      if (!previewPlayerRef.current) {
        previewPlayerRef.current = new Audio(previewAudioUrl);
        previewPlayerRef.current.onended = () => setIsPlayingPreview(false);
      }
      previewPlayerRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Step 7A: APPROVE VOICE
  const handleApproveVoice = async () => {
    if (!candidateProfile || !currentTenant) return;
    setIsProcessingApproval(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/voice-profile/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: currentTenant.id,
          voiceProfileId: candidateProfile.id,
          eventType: eventType || candidateProfile.eventType,
          eventId: eventId || candidateProfile.eventId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve voice profile.');
      }

      // Automatically select the newly approved voice for this event in database
      await fetch('/api/callbridge/voice-profiles/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: currentTenant.id,
          voiceProfileId: candidateProfile.id,
          eventType: eventType || candidateProfile.eventType,
          eventId: eventId || candidateProfile.eventId,
        }),
      }).catch(() => {});

      setSuccessMessage('Voice approved and locked as active authorized voice for this account!');
      onSelectVoice({
        ...candidateProfile,
        approvalStatus: 'approved',
        isApproved: true,
        selected: true,
        selectionStatus: 'selected',
      });
      await fetchProfiles();
      if (onTenantUpdated) onTenantUpdated();
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error approving voice profile.');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // User explicitly clicks [Select] on an approved saved voice card
  const handleSelectSavedVoice = async (profile: VoiceProfileRecord) => {
    if (!currentTenant) return;
    const isApproved = profile.approvalStatus === 'approved' || profile.isApproved;
    if (!isApproved) {
      setErrorMessage(`Voice "${profile.name || profile.voiceName}" has not been approved yet. Only approved voices can be selected.`);
      return;
    }

    setIsSelectingVoiceId(profile.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/callbridge/voice-profiles/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: currentTenant.id,
          voiceProfileId: profile.id,
          eventType,
          eventId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to select voice profile on server.');
      }

      onSelectVoice(data.profile || {
        ...profile,
        selected: true,
        selectionStatus: 'selected',
      });
      if (onTenantUpdated) onTenantUpdated();
      await fetchProfiles();
      setSuccessMessage(`Voice "${profile.name || profile.voiceName}" selected for ${formatEventTitle(eventType)}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error selecting voice profile.');
    } finally {
      setIsSelectingVoiceId(null);
    }
  };

  // Step 7B: RECORD AGAIN (Reject candidate)
  const handleRecordAgain = async () => {
    if (candidateProfile && currentTenant) {
      try {
        await fetch('/api/voice-profile/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: currentTenant.id,
            voiceProfileId: candidateProfile.id,
            eventType: eventType || candidateProfile.eventType,
          }),
        });
      } catch (e) {
        // Non-blocking
      }
    }

    setCandidateProfile(null);
    setPreviewAudioUrl(null);
    resetRecordingState();
    setSuccessMessage('Candidate cleared. Ready to record a replacement sample without overwriting approved voice.');
    await fetchProfiles();
  };

  // DELETE VOICE CONFIRMATION HANDLER
  const handleConfirmDeleteVoice = async () => {
    if (!voiceToDelete || !currentTenant) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/callbridge/voice-profiles/${encodeURIComponent(voiceToDelete.id)}?clientId=${encodeURIComponent(
          currentTenant.id
        )}`,
        {
          method: 'DELETE',
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete voice profile.');
      }

      // Remove immediately from UI state
      setProfiles((prev) => prev.filter((p) => p.id !== voiceToDelete.id));
      setSuccessMessage(`Voice "${voiceToDelete.name}" deleted successfully.`);

      // Refresh data
      await fetchProfiles();
      if (onTenantUpdated) onTenantUpdated();
      setVoiceToDelete(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error deleting voice profile.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Scroll to record section
  const handleScrollToRecord = () => {
    resetRecordingState();
    if (recordSectionRef.current) {
      recordSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Voice Profile Management & Studio</h2>
              <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  Account: <strong>{currentTenant?.organizationName || 'Current Client'}</strong>
                </span>
                <span>•</span>
                <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                  <Lock className="w-3 h-3" />
                  <span>Isolated Personal Profiles</span>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Active Approved Voice Banner */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-indigo-950 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  Currently Approved Voice {eventType ? `for ${formatEventTitle(eventType)}` : 'for Account'}:
                </span>
              </div>
              {hasApprovedVoice ? (
                <div className="space-y-0.5">
                  <div className="text-sm font-extrabold text-indigo-900">
                    Voice Name: <span className="text-slate-900 font-bold">{displayApprovedVoiceName}</span>
                  </div>
                  <div className="text-xs text-indigo-800 font-mono">
                    ElevenLabs Voice ID: <span className="font-bold text-indigo-950 bg-white/80 px-2 py-0.5 rounded border border-indigo-200">{displayApprovedVoiceId}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">
                  No approved voice for this event yet
                </div>
              )}
              <p className="text-[11px] text-slate-500 pt-0.5">
                {hasApprovedVoice
                  ? 'Authorized for live phone calling and voice synthesis for this event.'
                  : `Record and approve your voice below to authorize outbound ${
                      eventType ? formatEventTitle(eventType) : 'campaign'
                    } phone calling.`}
              </p>
            </div>
            {hasApprovedVoice ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow-xs">
                APPROVED
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                NOT APPROVED
              </span>
            )}
          </div>

          {/* Section 1: Choose Saved Profile */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Saved Voice Profiles for This Client
              </h3>
              <span className="text-[11px] text-slate-400">Reused across campaigns</span>
            </div>

            {isLoadingProfiles ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading client voice profiles...</div>
            ) : profiles.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed border-slate-300 text-center space-y-3 bg-slate-50/70">
                <p className="text-xs text-slate-600 font-medium">
                  No voice profile found. Record your voice to create a new AI voice.
                </p>
                <div>
                  <button
                    onClick={handleScrollToRecord}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Record New Voice</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {profiles.map((p) => {
                  const isFailed = p.voiceStatus === 'failed';
                  const isApproved = !isFailed && (p.approvalStatus === 'approved' || p.isApproved);
                  const isPendingVerification = p.voiceStatus === 'processing';
                  const isSelected =
                    selectedVoiceId === p.providerVoiceId ||
                    selectedVoiceId === p.id ||
                    (p as any).selected === true ||
                    (p as any).selectionStatus === 'selected';
                  const isPlaying = playingSavedVoiceId === (p.providerVoiceId || p.id);
                  const formattedDate = p.createdAt
                    ? new Date(p.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Saved';
                  const providerId = p.providerVoiceId || p.elevenLabsVoiceId || p.id;
                  const profileDisplayName = p.name || p.voiceName || 'Voice Profile';

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 shadow-sm ring-2 ring-indigo-500'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-[240px]">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-xs font-bold text-slate-500">Voice Name:</span>
                            <span className="font-extrabold text-slate-900 text-sm">{profileDisplayName}</span>

                            {/* Status Badge */}
                            {isFailed ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                Verification failed
                              </span>
                            ) : isApproved ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                APPROVED
                              </span>
                            ) : isPendingVerification ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Pending verification
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Pending review
                              </span>
                            )}

                            {/* Selection Status Badge */}
                            {isSelected ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white shadow-xs">
                                Selected: YES
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                Not selected
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 font-mono flex items-center space-x-1.5 flex-wrap">
                            <span className="text-slate-400 font-sans">ElevenLabs Voice ID:</span>
                            <span className="font-bold text-indigo-950 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{providerId}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-400 font-sans">Created: {formattedDate}</span>
                          </div>
                        </div>

                        {/* Actions for this voice profile */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => togglePlaySavedVoice(p)}
                            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                            title="Listen to preview of this voice"
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Preview</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleSelectSavedVoice(p)}
                            disabled={isSelectingVoiceId === p.id}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs cursor-default'
                                : isApproved
                                ? 'bg-slate-900 text-white hover:bg-indigo-700 shadow-xs'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 cursor-not-allowed'
                            }`}
                            title={
                              !isApproved
                                ? 'Voice must be approved before selection'
                                : isSelected
                                ? 'Currently selected'
                                : 'Select this voice profile'
                            }
                          >
                            {isSelectingVoiceId === p.id
                              ? 'Selecting...'
                              : isSelected
                              ? '✓ Selected'
                              : 'Select'}
                          </button>

                          <button
                            onClick={() => setVoiceToDelete(p)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete this voice profile"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-1 flex justify-end">
                  <button
                    onClick={handleScrollToRecord}
                    className="text-xs text-indigo-600 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record New Voice</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Recording & Review Workflow */}
          <div ref={recordSectionRef} className="border-t border-slate-100 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Record New Voice &amp; Create Clone
              </h3>
              <div className="flex items-center space-x-1 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Explicit Consent Required</span>
              </div>
            </div>

            {/* Step 2.1: Voice Name Input (Always clearly visible and connected) */}
            <div className="space-y-1.5">
              <label htmlFor="voice-profile-name" className="text-xs font-bold text-slate-700 block">
                Voice Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="voice-profile-name"
                type="text"
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  if (errorMessage?.includes('Voice Name')) {
                    setErrorMessage(null);
                  }
                }}
                placeholder="Enter voice name (e.g. MLA Official Voice)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              <p className="text-[11px] text-slate-400">
                Provide a descriptive name to easily identify your voice profile across campaigns.
              </p>
            </div>

            {/* Recording Console */}
            {!candidateProfile && (
              <div className="p-5 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center space-y-4 shadow-inner">
                <div className="text-2xl font-mono tracking-wider">
                  {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}{' '}
                  <span className="text-xs text-slate-400 font-sans">/ 02:00</span>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  {isRecording ? (
                    <span className="flex items-center text-red-400 animate-pulse font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                      Recording speech sample... Speak clearly in Telugu, Hindi, or English
                    </span>
                  ) : audioBlob ? (
                    <span className="text-emerald-400 font-medium flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Sample captured ({recordingSeconds}s)
                    </span>
                  ) : (
                    <span className="text-slate-400">Click Start Recording to read your voice sample</span>
                  )}
                </div>

                {/* Free-Form Natural Voice Prompt Guide */}
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300 max-w-lg text-center leading-relaxed">
                  <span className="font-semibold text-indigo-300 block mb-1">
                    🎙️ Free-Form Natural Voice Recording (No Fixed Script):
                  </span>
                  Speak naturally for 30–60 seconds in your preferred language (Telugu, Hindi, or English). Share your thoughts or speak freely without following a rigid script.
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-all shadow-md cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      <span>{audioBlob ? 'Start Over' : 'Start Recording'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-white text-slate-900 hover:bg-slate-100 font-medium text-xs transition-all shadow-md cursor-pointer"
                    >
                      <Square className="w-4 h-4 text-red-600 fill-red-600" />
                      <span>Stop Recording</span>
                    </button>
                  )}

                  {audioBlob && !isRecording && (
                    <>
                      <button
                        onClick={togglePlayRecordedAudio}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors border border-slate-700 cursor-pointer"
                      >
                        {isPlayingRecorded ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        <span>{isPlayingRecorded ? 'Pause' : 'Play My Sample'}</span>
                      </button>

                      <button
                        onClick={resetRecordingState}
                        className="flex items-center space-x-1.5 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Discard</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Create Clone Action Button */}
            {!candidateProfile && (
              <div className="pt-2">
                <button
                  id="create-clone-button"
                  onClick={handleCreateVoiceClone}
                  disabled={isUploading || isRecording}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>
                    {isUploading ? 'Creating Clone with ElevenLabs...' : 'Create Clone'}
                  </span>
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-1.5">
                  Sends audio to ElevenLabs Instant Voice Cloning. Takes approximately 5–10 seconds.
                </p>
              </div>
            )}

            {/* Generated Clone Review: "Approve Voice" and "Record Again" */}
            {candidateProfile && (
              <div className="p-5 rounded-2xl border-2 border-indigo-500 bg-indigo-50/80 space-y-4 shadow-sm animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Review Cloned Voice: {candidateProfile.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        ElevenLabs ID: {candidateProfile.providerVoiceId}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    PENDING APPROVAL
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-indigo-200 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800">Spoken Telugu Sample Preview</span>
                    <p className="text-[11px] text-slate-500">
                      Generated speech in your authentic cloned voice. Listen to verify tone and clarity.
                    </p>
                  </div>

                  <button
                    onClick={togglePlayPreview}
                    disabled={isGeneratingPreview || !previewAudioUrl}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{isPlayingPreview ? 'Pause Sample' : 'Listen to Cloned Voice'}</span>
                  </button>
                </div>

                {/* THE TWO REQUIRED EXPLICIT OPTIONS: APPROVE VOICE OR RECORD AGAIN */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
                  <button
                    onClick={handleRecordAgain}
                    disabled={isProcessingApproval}
                    className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                    <span>Record Again (Discard Clone)</span>
                  </button>

                  <button
                    onClick={handleApproveVoice}
                    disabled={isProcessingApproval}
                    className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 transition-all cursor-pointer"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>{isProcessingApproval ? 'Approving...' : 'Approve Voice'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-start space-x-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-start space-x-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-medium">{successMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL DIALOG */}
      {voiceToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4 animate-scaleUp my-auto">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Delete Voice Profile</h4>
                <p className="text-xs text-slate-500">
                  Voice: <strong>{voiceToDelete.name}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this voice? This action cannot be undone.
              {voiceToDelete.provider === 'elevenlabs' &&
                ' This will also permanently remove the cloned voice from your ElevenLabs voice library.'}
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                onClick={() => setVoiceToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteVoice}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting Voice...' : 'Delete Voice'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
