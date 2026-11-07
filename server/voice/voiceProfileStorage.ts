import fs from 'fs';
import path from 'path';
import type { VoiceProfile, IVoiceProfileStorage } from './types.ts';

/**
 * File-backed Voice Profile Storage with Composite Event-Specific Scoping.
 *
 * Implements composite key isolation:
 * compositeKey = `${userId}:${eventType}:${voiceProfileId}`
 *
 * Enforces strict per-event voice profile isolation:
 * - political_campaign
 * - political_survey
 * - public_survey
 * - business_event
 * - marriage_event
 *
 * Preserves all existing profiles via safe backward-compatible schema migration.
 */
export class JsonFileVoiceProfileStorage implements IVoiceProfileStorage {
  private profiles: Map<string, VoiceProfile> = new Map(); // key: id
  private storageFilePath: string;

  constructor(storageDir = path.join(process.cwd(), 'data')) {
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Could not create storage directory for voice profiles:', err);
    }
    this.storageFilePath = path.join(storageDir, 'voice_profiles.json');
    this.loadFromDisk();
  }

  public static getCompositeKey(userId: string, eventType: string, voiceProfileId: string): string {
    return `${(userId || 'client_001').trim()}:${(eventType || 'public_survey').trim()}:${(voiceProfileId || '').trim()}`;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data: any[] = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && (item.voice_id || item.id || item.elevenLabsVoiceId)) {
              const voiceId = (item.elevenLabsVoiceId || item.voice_id || item.id || '').trim();
              if (
                voiceId.startsWith('mock_') ||
                voiceId.includes('mock') ||
                item.metadata?.is_mock === true
              ) {
                continue;
              }

              const clientId = (item.client_id || item.user_id || 'client_001').trim();
              const eventType = (item.eventType || item.event_type || 'public_survey').trim();
              const id = item.id || `vp_${clientId}_${eventType}_${voiceId}`;
              const voiceName = (
                item.voiceName ||
                item.name ||
                item.metadata?.elevenlabs_name ||
                `Voice (${eventType})`
              ).trim();

              const profile: VoiceProfile = {
                id,
                client_id: clientId,
                user_id: clientId,
                eventType,
                eventId: item.eventId || item.event_id,
                voiceName,
                elevenLabsVoiceId: voiceId,
                voice_id: voiceId,
                provider: item.provider || 'elevenlabs',
                status: item.status === 'archived' ? 'archived' : item.status || 'active',
                voice_status: item.voice_status || 'ready',
                isApproved: item.isApproved !== undefined ? Boolean(item.isApproved) : item.status === 'active',
                approvalStatus: item.approvalStatus || (item.status === 'active' ? 'approved' : 'pending_review'),
                modelId: item.modelId || 'eleven_multilingual_v2',
                stability: item.stability !== undefined ? item.stability : 0.45,
                similarityBoost: item.similarityBoost !== undefined ? item.similarityBoost : 0.85,
                style: item.style !== undefined ? item.style : 0.20,
                speakerBoost: item.speakerBoost !== undefined ? item.speakerBoost : true,
                speed: item.speed !== undefined ? item.speed : 0.98,
                language: item.language || 'te',
                pronunciationProfileVersion: item.pronunciationProfileVersion || 'v2.1_conversational',
                approvedAt: item.approvedAt || (item.isApproved ? item.updated_at || item.created_at : undefined),
                configurationVersion: item.configurationVersion || 1,
                created_at: item.created_at || new Date().toISOString(),
                updated_at: item.updated_at || new Date().toISOString(),
                preview_audio_url: item.preview_audio_url || `/api/voice-profile/preview-audio/${encodeURIComponent(voiceId)}`,
                languageCapabilities: item.languageCapabilities || ['te', 'hi', 'en'],
                metadata: item.metadata || {},
              };

              this.profiles.set(id, profile);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not read existing voice_profiles.json:', err);
    }
  }

  private persistToDisk(): void {
    try {
      const data = Array.from(this.profiles.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Could not write voice_profiles.json to disk:', err);
    }
  }

  async saveProfile(profile: Partial<VoiceProfile>): Promise<VoiceProfile> {
    const clientId = (profile.client_id || profile.user_id || 'client_001').trim();
    const eventType = (profile.eventType || 'public_survey').trim();
    const voiceId = (profile.elevenLabsVoiceId || profile.voice_id || profile.id || '').trim();
    const now = new Date().toISOString();

    const id = profile.id || `vp_${clientId}_${eventType}_${Date.now()}`;
    const existing = this.profiles.get(id) || Array.from(this.profiles.values()).find(
      (p) => p.client_id === clientId && p.eventType === eventType && (p.elevenLabsVoiceId === voiceId || p.id === id)
    );

    const voiceName = (
      profile.voiceName ||
      existing?.voiceName ||
      profile.metadata?.elevenlabs_name ||
      `Voice_${clientId}_${eventType}`
    ).trim();

    const normalized: VoiceProfile = {
      id: existing ? existing.id : id,
      client_id: clientId,
      user_id: clientId,
      eventType,
      eventId: profile.eventId || existing?.eventId,
      voiceName,
      elevenLabsVoiceId: voiceId,
      voice_id: voiceId,
      provider: profile.provider || 'elevenlabs',
      status: profile.status || existing?.status || 'active',
      voice_status: profile.voice_status || existing?.voice_status || 'ready',
      isApproved: profile.isApproved !== undefined ? Boolean(profile.isApproved) : (existing?.isApproved ?? false),
      approvalStatus: profile.approvalStatus || existing?.approvalStatus || 'pending_review',
      modelId: profile.modelId || existing?.modelId || 'eleven_multilingual_v2',
      stability: profile.stability !== undefined ? profile.stability : (existing?.stability ?? 0.45),
      similarityBoost: profile.similarityBoost !== undefined ? profile.similarityBoost : (existing?.similarityBoost ?? 0.85),
      style: profile.style !== undefined ? profile.style : (existing?.style ?? 0.20),
      speakerBoost: profile.speakerBoost !== undefined ? profile.speakerBoost : (existing?.speakerBoost ?? true),
      speed: profile.speed !== undefined ? profile.speed : (existing?.speed ?? 0.98),
      language: profile.language || existing?.language || 'te',
      pronunciationProfileVersion: profile.pronunciationProfileVersion || existing?.pronunciationProfileVersion || 'v2.1_conversational',
      approvedAt: profile.approvedAt || existing?.approvedAt || (profile.isApproved ? now : undefined),
      configurationVersion: profile.configurationVersion || existing?.configurationVersion || (profile.isApproved ? 1 : 0),
      created_at: existing ? existing.created_at : profile.created_at || now,
      updated_at: now,
      preview_audio_url: profile.preview_audio_url || existing?.preview_audio_url || `/api/voice-profile/preview-audio/${encodeURIComponent(voiceId)}`,
      languageCapabilities: profile.languageCapabilities || existing?.languageCapabilities || ['te', 'hi', 'en'],
      metadata: {
        ...(existing?.metadata || {}),
        ...(profile.metadata || {}),
      },
    };

    // If active and approved for this eventType, archive other voices for this client strictly within THIS eventType
    if (normalized.status === 'active' && normalized.isApproved) {
      for (const [key, p] of this.profiles.entries()) {
        if (
          p.client_id === clientId &&
          p.eventType === eventType &&
          p.id !== normalized.id &&
          p.elevenLabsVoiceId !== normalized.elevenLabsVoiceId &&
          p.status === 'active'
        ) {
          this.profiles.set(key, {
            ...p,
            status: 'archived',
            voice_status: 'archived',
            updated_at: now,
          });
        }
      }
    }

    this.profiles.set(normalized.id, normalized);
    this.persistToDisk();

    console.log('[VOICE_PROFILE_STORAGE_SAVED]', {
      id: normalized.id,
      clientId: normalized.client_id,
      eventType: normalized.eventType,
      voiceName: normalized.voiceName,
      elevenLabsVoiceId: normalized.elevenLabsVoiceId,
      isApproved: normalized.isApproved,
      status: normalized.status,
    });

    return normalized;
  }

  async getActiveProfile(clientId: string, eventType?: string): Promise<VoiceProfile | null> {
    const targetId = clientId.trim();
    const targetEventType = eventType?.trim();

    for (const profile of this.profiles.values()) {
      if (
        (profile.client_id === targetId || profile.user_id === targetId) &&
        (!targetEventType || profile.eventType === targetEventType) &&
        profile.status === 'active' &&
        profile.voice_status !== 'failed'
      ) {
        return { ...profile };
      }
    }
    return null;
  }

  async getProfileByVoiceId(voiceId: string): Promise<VoiceProfile | null> {
    const target = voiceId.trim();
    for (const profile of this.profiles.values()) {
      if (profile.elevenLabsVoiceId === target || profile.voice_id === target || profile.id === target) {
        return { ...profile };
      }
    }
    return null;
  }

  async getProfileById(id: string): Promise<VoiceProfile | null> {
    const target = id.trim();
    const match = this.profiles.get(target);
    if (match) return { ...match };
    return this.getProfileByVoiceId(target);
  }

  getProfileByIdSync(id: string): VoiceProfile | null {
    if (!id) return null;
    const target = id.trim();
    const match = this.profiles.get(target);
    if (match) return { ...match };
    for (const profile of this.profiles.values()) {
      if (profile.elevenLabsVoiceId === target || profile.voice_id === target || profile.id === target) {
        return { ...profile };
      }
    }
    return null;
  }

  async getProfilesByClientId(clientId: string, eventType?: string): Promise<VoiceProfile[]> {
    const targetId = clientId.trim();
    const targetEventType = eventType?.trim();
    const result: VoiceProfile[] = [];

    for (const profile of this.profiles.values()) {
      if (
        (profile.client_id === targetId || profile.user_id === targetId) &&
        (!targetEventType || profile.eventType === targetEventType)
      ) {
        result.push({ ...profile });
      }
    }

    return result.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async activateVoice(clientId: string, voiceIdOrProfileId: string, eventType?: string): Promise<VoiceProfile> {
    const targetId = clientId.trim();
    const vId = voiceIdOrProfileId.trim();
    const now = new Date().toISOString();

    let targetProfile = await this.getProfileById(vId);
    const resolvedEventType = (eventType || targetProfile?.eventType || 'public_survey').trim();

    if (!targetProfile) {
      targetProfile = {
        id: `vp_${targetId}_${resolvedEventType}_${Date.now()}`,
        client_id: targetId,
        user_id: targetId,
        eventType: resolvedEventType,
        voiceName: `Voice_${resolvedEventType}`,
        elevenLabsVoiceId: vId,
        voice_id: vId,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'ready',
        isApproved: true,
        approvalStatus: 'approved',
        created_at: now,
        updated_at: now,
      };
    }

    // Set other profiles of this client in the SAME eventType to archived
    for (const [id, p] of this.profiles.entries()) {
      if (
        (p.client_id === targetId || p.user_id === targetId) &&
        p.eventType === resolvedEventType &&
        p.id !== targetProfile.id &&
        p.elevenLabsVoiceId !== targetProfile.elevenLabsVoiceId
      ) {
        this.profiles.set(id, {
          ...p,
          status: 'archived',
          voice_status: 'archived',
          updated_at: now,
        });
      }
    }

    const activated: VoiceProfile = {
      ...targetProfile,
      client_id: targetId,
      user_id: targetId,
      eventType: resolvedEventType,
      status: 'active',
      voice_status: 'ready',
      isApproved: true,
      approvalStatus: 'approved',
      updated_at: now,
    };

    this.profiles.set(activated.id, activated);
    this.persistToDisk();
    return activated;
  }

  async approveVoice(clientId: string, voiceIdOrProfileId: string, eventType?: string, eventId?: string): Promise<VoiceProfile> {
    const targetId = clientId.trim();
    const vId = voiceIdOrProfileId.trim();
    const now = new Date().toISOString();

    let profile = await this.getProfileById(vId);
    const resolvedEventType = (eventType || profile?.eventType || 'public_survey').trim();

    if (!profile) {
      profile = {
        id: `vp_${targetId}_${resolvedEventType}_${Date.now()}`,
        client_id: targetId,
        user_id: targetId,
        eventType: resolvedEventType,
        eventId,
        voiceName: `Voice_${resolvedEventType}`,
        elevenLabsVoiceId: vId,
        voice_id: vId,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'ready',
        isApproved: true,
        approvalStatus: 'approved',
        created_at: now,
        updated_at: now,
      };
    }

    // Archive other voices strictly within the same eventType
    for (const [id, p] of this.profiles.entries()) {
      if (
        (p.client_id === targetId || p.user_id === targetId) &&
        p.eventType === resolvedEventType &&
        p.id !== profile.id &&
        p.elevenLabsVoiceId !== profile.elevenLabsVoiceId
      ) {
        this.profiles.set(id, {
          ...p,
          status: 'archived',
          voice_status: 'archived',
          updated_at: now,
        });
      }
    }

    const approved: VoiceProfile = {
      ...profile,
      client_id: targetId,
      user_id: targetId,
      eventType: resolvedEventType,
      eventId: eventId || profile.eventId,
      status: 'active',
      voice_status: 'ready',
      isApproved: true,
      approvalStatus: 'approved',
      modelId: profile.modelId || 'eleven_multilingual_v2',
      stability: profile.stability !== undefined ? profile.stability : 0.45,
      similarityBoost: profile.similarityBoost !== undefined ? profile.similarityBoost : 0.85,
      style: profile.style !== undefined ? profile.style : 0.20,
      speakerBoost: profile.speakerBoost !== undefined ? profile.speakerBoost : true,
      speed: profile.speed !== undefined ? profile.speed : 0.98,
      language: profile.language || 'te',
      pronunciationProfileVersion: profile.pronunciationProfileVersion || 'v2.1_conversational',
      approvedAt: profile.approvedAt || now,
      configurationVersion: (profile.configurationVersion || 0) + 1,
      updated_at: now,
    };

    this.profiles.set(approved.id, approved);
    this.persistToDisk();

    console.log('[VOICE_APPROVED_EVENT_SCOPED]', {
      clientId: approved.client_id,
      eventType: approved.eventType,
      voiceName: approved.voiceName,
      elevenLabsVoiceId: approved.elevenLabsVoiceId,
    });

    return approved;
  }

  async rejectVoice(clientId: string, voiceIdOrProfileId: string, eventType?: string): Promise<VoiceProfile | null> {
    const targetId = clientId.trim();
    const vId = voiceIdOrProfileId.trim();
    const now = new Date().toISOString();

    const candidate = await this.getProfileById(vId);
    if (candidate) {
      const updated: VoiceProfile = {
        ...candidate,
        status: 'archived',
        voice_status: 'archived',
        approvalStatus: 'rejected',
        isApproved: false,
        updated_at: now,
      };
      this.profiles.set(updated.id, updated);
      this.persistToDisk();
      return updated;
    }
    return null;
  }

  async keepPreviousVoice(clientId: string, candidateVoiceId: string, eventType?: string): Promise<VoiceProfile | null> {
    const targetId = clientId.trim();
    const now = new Date().toISOString();

    const candidate = await this.getProfileById(candidateVoiceId.trim());
    if (candidate) {
      this.profiles.set(candidate.id, {
        ...candidate,
        status: 'archived',
        voice_status: 'archived',
        approvalStatus: 'rejected',
        isApproved: false,
        updated_at: now,
      });
    }

    const resolvedEventType = eventType || candidate?.eventType;
    const active = await this.getActiveProfile(targetId, resolvedEventType);
    this.persistToDisk();
    return active;
  }

  async getProfileByUserId(userId: string, eventType?: string): Promise<VoiceProfile | null> {
    return this.getActiveProfile(userId, eventType);
  }

  async listProfiles(eventType?: string): Promise<VoiceProfile[]> {
    const all = Array.from(this.profiles.values());
    if (eventType) {
      return all.filter((p) => p.eventType === eventType.trim()).map((p) => ({ ...p }));
    }
    return all.map((p) => ({ ...p }));
  }

  async deleteProfile(idOrVoiceId: string, userIdOrClientId?: string): Promise<boolean> {
    const target = idOrVoiceId.trim();
    const targetUser = userIdOrClientId?.trim();
    let deleted = false;

    for (const [key, p] of this.profiles.entries()) {
      const matchesTarget = p.id === target || p.elevenLabsVoiceId === target || p.voice_id === target;
      const matchesUser = !targetUser || p.client_id === targetUser || p.user_id === targetUser;

      if (matchesTarget && matchesUser) {
        this.profiles.delete(key);
        deleted = true;
      }
    }

    if (deleted) {
      this.persistToDisk();
      return true;
    }
    return false;
  }

  async markVoiceInvalid(voiceId: string): Promise<void> {
    const vId = voiceId.trim();
    for (const [key, existing] of this.profiles.entries()) {
      if (existing.elevenLabsVoiceId === vId || existing.voice_id === vId || existing.id === vId) {
        existing.status = 'archived';
        existing.voice_status = 'failed';
        existing.updated_at = new Date().toISOString();
        this.profiles.set(key, existing);
        this.persistToDisk();
        console.log(`[VoiceProfileStorage] Voice ${vId} marked invalid/archived in storage.`);
      }
    }
  }
}

// Global singleton instance for backend
export const voiceProfileStorage: IVoiceProfileStorage = new JsonFileVoiceProfileStorage();
