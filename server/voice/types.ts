export type VoiceStatus = 'active' | 'archived' | 'ready' | 'processing' | 'failed' | 'pending_review';

export interface VoiceProfile {
  id: string; // composite or unique ID: vp_${userId}_${eventType}_${timestamp}
  client_id: string;
  user_id: string; // alias for client_id
  eventType: string; // 'political_campaign' | 'political_survey' | 'public_survey' | 'business_event' | 'marriage_event'
  eventId?: string;
  voiceName: string;
  elevenLabsVoiceId: string;
  voice_id: string; // alias for elevenLabsVoiceId for backward compatibility
  provider: 'elevenlabs';
  status: 'active' | 'archived';
  voice_status?: VoiceStatus;
  isApproved: boolean;
  approvalStatus: 'approved' | 'pending_review' | 'rejected';
  created_at: string;
  updated_at: string;
  preview_audio_url?: string;
  languageCapabilities?: string[];
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  speed?: number;
  language?: string;
  pronunciationProfileVersion?: string;
  approvedAt?: string;
  configurationVersion?: number;
  metadata?: {
    original_filename?: string;
    file_size_bytes?: number;
    mime_type?: string;
    description?: string;
    elevenlabs_name?: string;
    is_mock?: boolean;
    [key: string]: any;
  };
}

export interface VoiceCloneInput {
  clientId?: string;
  userId?: string;
  eventType?: string;
  eventId?: string;
  voiceName?: string;
  audioBuffer: Buffer;
  fileName: string;
  mimeType: string;
  additionalSamples?: Array<{
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
  }>;
  description?: string;
  allowSimulation?: boolean;
}

export interface VoiceCloneResult {
  success: boolean;
  client_id: string;
  user_id?: string;
  eventType?: string;
  eventId?: string;
  voice_id?: string;
  elevenLabsVoiceId?: string;
  provider: 'elevenlabs';
  status: 'active' | 'archived';
  error?: string;
  is_mock?: boolean;
}

export interface IVoiceProfileStorage {
  saveProfile(profile: Partial<VoiceProfile>): Promise<VoiceProfile>;
  getActiveProfile(clientId: string, eventType?: string): Promise<VoiceProfile | null>;
  getProfileByVoiceId(voiceId: string): Promise<VoiceProfile | null>;
  getProfileById(id: string): Promise<VoiceProfile | null>;
  getProfileByIdSync?(id: string): VoiceProfile | null;
  getProfilesByClientId(clientId: string, eventType?: string): Promise<VoiceProfile[]>;
  activateVoice(clientId: string, voiceId: string, eventType?: string): Promise<VoiceProfile>;
  approveVoice(clientId: string, voiceId: string, eventType?: string, eventId?: string): Promise<VoiceProfile>;
  rejectVoice(clientId: string, voiceId: string, eventType?: string): Promise<VoiceProfile | null>;
  keepPreviousVoice(clientId: string, candidateVoiceId: string, eventType?: string): Promise<VoiceProfile | null>;
  getProfileByUserId(userId: string, eventType?: string): Promise<VoiceProfile | null>;
  listProfiles(eventType?: string): Promise<VoiceProfile[]>;
  deleteProfile(idOrVoiceId: string, userIdOrClientId?: string): Promise<boolean>;
  markVoiceInvalid(voiceId: string): Promise<void>;
}

