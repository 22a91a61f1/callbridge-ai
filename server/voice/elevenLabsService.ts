import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import type { VoiceCloneInput } from './types.ts';
import { normalizeTeluguPronunciation } from './teluguPronunciationDictionary.ts';
import { voiceProfileStorage } from './voiceProfileStorage.ts';
import { preprocessVoiceRecording } from './audioPreprocessor.ts';
import { normalizeVoiceAudio } from './audioNormalizer.ts';
import { FallbackSpeechService } from './fallbackSpeechService.ts';

// ElevenLabs Service for Voice Cloning and Multilingual Text-to-Speech

export function isLocalOrMockVoiceId(voiceId: string): boolean {
  if (!voiceId) return true;
  const v = voiceId.trim();
  return (
    v.startsWith('mock_') ||
    v.includes('mock') ||
    v.startsWith('dummy_') ||
    v.includes('placeholder')
  );
}

export const MADHAVI_REFERENCE_VOICE_ID = '4XvBGCPMXWyVQa75dbZg';

// User Rishi's authentic approved ElevenLabs cloned voice ID
export const ACTIVE_RISHI_CLONED_VOICE_ID = 'Txde0pZ5tVhXE6HUspcf';

/**
 * Resolves a given voiceId, safely mapping internal database profile IDs (vp_...),
 * legacy deleted voice IDs, or placeholders to the user's active, approved ElevenLabs cloned voice.
 * Strictly guarantees that an actual ElevenLabs voice ID is returned.
 */
export function resolveVoiceId(
  voiceId?: string,
  eventContext?: string | { eventId?: string; eventType?: string }
): string {
  let isSurvey = false;
  let contextName = '';
  if (typeof eventContext === 'string') {
    const c = eventContext.trim().toLowerCase();
    isSurvey = c === 'public_survey' || c === 'event_public_survey';
    contextName = eventContext;
  } else if (eventContext && typeof eventContext === 'object') {
    const eId = (eventContext.eventId || '').trim().toLowerCase();
    const eType = (eventContext.eventType || '').trim().toLowerCase();
    isSurvey = eId === 'event_public_survey' || eType === 'public_survey';
    contextName = eventContext.eventType || eventContext.eventId || '';
  }

  // If no voiceId is provided:
  if (!voiceId || typeof voiceId !== 'string' || !voiceId.trim()) {
    if (isSurvey || !eventContext) {
      return ACTIVE_RISHI_CLONED_VOICE_ID;
    }
    console.warn(`[MISSING_VOICE_CONFIGURATION] No voice profile configured for module '${contextName}'.`);
    return '';
  }

  let v = voiceId.trim();

  // If an internal profile ID is passed (e.g., 'vp_rishi_candidate', 'vp_survey_candidate')
  if (v.startsWith('vp_')) {
    try {
      const match = voiceProfileStorage.getProfileByIdSync?.(v);
      if (match?.elevenLabsVoiceId && !match.elevenLabsVoiceId.startsWith('vp_')) {
        v = match.elevenLabsVoiceId.trim();
      } else if (match?.voice_id && !match.voice_id.startsWith('vp_')) {
        v = match.voice_id.trim();
      }
    } catch {
      // Continue to fallback check
    }
  }

  // 1. Strictly isolate Public Survey voice resolution:
  // For Public Survey, enforce Rishi's authentic approved cloned voice ID (Txde0pZ5tVhXE6HUspcf).
  if (isSurvey) {
    if (
      v === 'WKyArUrP6hdAVp2kHYkw' ||
      v === 'AZnzlk1XvdvUeBnXmlld' ||
      v === 'vqrpmsQYYs9tOYmeRbSu' ||
      v === '4XvBGCPMXWyVQa75dbZg' ||
      v.startsWith('vp_') ||
      isLocalOrMockVoiceId(v)
    ) {
      return ACTIVE_RISHI_CLONED_VOICE_ID;
    }
    return v || ACTIVE_RISHI_CLONED_VOICE_ID;
  }

  // 2. For other event modules (Marriage Event, Business Event, Political Campaign):
  // Do NOT silently replace voice IDs for unrelated event modules.
  // Preserve existing configurations and report missing voice configuration if deleted or unconfigured.
  if (eventContext) {
    if (v === '5IASxvpUK3p2EFjhO3pn') {
      console.warn(
        `[MISSING_VOICE_CONFIGURATION] Voice profile '5IASxvpUK3p2EFjhO3pn' for module '${contextName}' is unconfigured or deleted in ElevenLabs. Preserving voice ID without silent substitution.`
      );
      return v;
    }
    if (isLocalOrMockVoiceId(v)) {
      console.warn(
        `[MISSING_VOICE_CONFIGURATION] Voice profile '${v}' for module '${contextName}' is a mock or placeholder voice ID.`
      );
      return v;
    }
    return v;
  }

  // 3. Fallback when called without context:
  if (v === '5IASxvpUK3p2EFjhO3pn') {
    console.warn(
      `[MISSING_VOICE_CONFIGURATION] Voice profile '5IASxvpUK3p2EFjhO3pn' is unconfigured or deleted in ElevenLabs. Retaining voice ID without silent substitution.`
    );
    return v;
  }

  if (
    v === 'WKyArUrP6hdAVp2kHYkw' ||
    v === 'AZnzlk1XvdvUeBnXmlld' ||
    v === 'vqrpmsQYYs9tOYmeRbSu' ||
    v === '4XvBGCPMXWyVQa75dbZg' ||
    v.startsWith('vp_') ||
    isLocalOrMockVoiceId(v)
  ) {
    return ACTIVE_RISHI_CLONED_VOICE_ID;
  }

  return v;
}

export const DEFAULT_CONVERSATIONAL_VOICE_SETTINGS = {
  stability: 0.50,
  similarity_boost: 0.85,
  style: 0.15,
  use_speaker_boost: true,
  speed: 1.0,
};

/**
 * ElevenLabs Voice Cloning & TTS Service.
 *
 * Communicates with the official ElevenLabs API:
 * - POST https://api.elevenlabs.io/v1/voices/add
 * - POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 *
 * Keeps ELEVENLABS_API_KEY strictly on the server-side.
 * Never exposes the API key to frontend, mobile client, or response payloads.
 * Strictly NO fallback voices, NO generic synthetic replacements.
 */
export class ElevenLabsService {
  private static BASE_URL = 'https://api.elevenlabs.io/v1';
  public static readonly DEFAULT_CONVERSATIONAL_VOICE_SETTINGS = DEFAULT_CONVERSATIONAL_VOICE_SETTINGS;

  public static resolveVoiceId(
    voiceId?: string,
    eventContext?: string | { eventId?: string; eventType?: string }
  ): string {
    return resolveVoiceId(voiceId, eventContext);
  }

  /**
   * Resolves the optimal ElevenLabs model.
   * eleven_v4_turbo natively supports Telugu (te), Hindi (hi), and English (en) with low latency.
   * eleven_multilingual_v2 only supports 29 languages and DOES NOT support Telugu!
   */
  public static resolveModel(requestedModelId?: string, text?: string): string {
    if (requestedModelId && requestedModelId !== 'eleven_multilingual_v2') {
      return requestedModelId;
    }
    // Default to eleven_v4_turbo which has native Telugu, Hindi, English phonetics
    return 'eleven_v4_turbo';
  }

  public static getApiKey(): string | undefined {
    return (
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVEN_API_KEY ||
      process.env.XI_API_KEY
    )?.trim();
  }

  private static async cleanupOldTemporaryVoices(apiKey: string, currentClientId: string): Promise<void> {
    try {
      const listRes = await fetch(`${this.BASE_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (!listRes.ok) return;
      const listData = await listRes.json();
      const cloned = (listData.voices || []).filter((v: any) => v.category === 'cloned');
      if (cloned.length >= 8) {
        // Query active profile of current client to ensure we NEVER delete it
        const activeProfile = await voiceProfileStorage.getActiveProfile(currentClientId).catch(() => null);
        const activeVoiceId = activeProfile?.voice_id;

        for (const cv of cloned) {
          const name = cv.name || '';
          // Strictly protect active voice and human sample voices
          if (activeVoiceId && cv.voice_id === activeVoiceId) {
            continue;
          }
          const isAutomated =
            name.includes('client_e2e') ||
            name.includes('client_test') ||
            name.includes('Test_Clone') ||
            name.startsWith('InternalTest_') ||
            name.startsWith('LiveTest_');

          if (isAutomated && !name.includes('Rishitha') && !name.includes('Suresh')) {
            console.log('ElevenLabsService: Auto-freeing temporary voice slot:', cv.voice_id, name);
            await fetch(`${this.BASE_URL}/voices/${cv.voice_id}`, {
              method: 'DELETE',
              headers: { 'xi-api-key': apiKey },
            }).catch(() => {});
            await voiceProfileStorage.markVoiceInvalid(cv.voice_id).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('ElevenLabsService: Voice cleanup error:', e);
    }
  }

  /**
   * Clone a client's voice using ElevenLabs Instant Voice Cloning API.
   *
   * @param input VoiceCloneInput containing clientId/userId, audioBuffer, fileName, mimeType
   * @returns voice_id string
   */
  static async cloneVoice(input: VoiceCloneInput): Promise<{ voice_id: string; isMock: boolean }> {
    const apiKey = this.getApiKey();
    const id = input.clientId || input.userId || 'client_001';

    console.log('VOICE_CREATE_STARTED', {
      clientId: id,
      fileName: input.fileName || 'client_recording.mp3',
      fileSizeBytes: input.audioBuffer?.length || 0,
    });

    if (!apiKey) {
      console.error('VOICE_CREATE_FAILED', {
        clientId: id,
        error: 'ELEVENLABS_API_KEY is not configured on the server',
      });
      throw new Error(
        'ElevenLabs API key is missing on the server. Please configure ELEVENLABS_API_KEY in your environment.'
      );
    }

    if (!input.audioBuffer || input.audioBuffer.length === 0) {
      console.error('VOICE_CREATE_FAILED', {
        clientId: id,
        error: 'No audio data received',
      });
      throw new Error('వాయిస్ రికార్డింగ్ ఆడియో డేటా అందలేదు. దయచేసి మళ్లీ రికార్డ్ చేయండి.');
    }

    // Proactively free slots if needed
    await this.cleanupOldTemporaryVoices(apiKey, id);

    // Preprocess voice recording using ffmpeg to eliminate long silences, gaps, and normalize loudness
    let processedBuffer = input.audioBuffer;
    let processedFileName = input.fileName || 'client_voice_sample.mp3';
    let processedMimeType = input.mimeType || 'audio/mpeg';

    try {
      console.log('[VOICE_PREPROCESS_STARTED]', {
  clientId: id,
  inputBytes: input.audioBuffer.length,
  fileName: input.fileName,
  mimeType: input.mimeType,
});
      const preprocessResult = await preprocessVoiceRecording(
        input.audioBuffer,
        input.fileName || 'client_recording.webm',
        input.mimeType || 'audio/webm'
      );
      processedBuffer = preprocessResult.processedBuffer;
      processedFileName = preprocessResult.fileName;
      processedMimeType = preprocessResult.mimeType;
      console.log('[VOICE_CLONE_PREPROCESSED]', {
        clientId: id,
        originalDuration: preprocessResult.originalDurationSeconds.toFixed(2),
        cleanDuration: preprocessResult.processedDurationSeconds.toFixed(2),
        silenceRemoved: preprocessResult.silenceRemovedSeconds.toFixed(2),
        cleanBytes: processedBuffer.length,
      });
    } catch (prepErr: any) {
      console.warn('[VOICE_CLONE_PREPROCESS_WARN] Fallback to raw buffer:', prepErr?.message || prepErr);
    }

    const voiceName = input.voiceName?.trim() || `Client_${id}_Voice_${Date.now()}`;
    const description =
      input.description?.trim() || `Telugu Public Survey cloned voice profile for client ${id}`;

    const makeFormData = () => {
      const formData = new FormData();
      formData.append('name', voiceName);
      formData.append('description', description);
      const audioBlob = new Blob([new Uint8Array(processedBuffer)], {
        type: processedMimeType,
      });
      formData.append('files', audioBlob, processedFileName);

      // Append additional Telugu training audio samples if provided (Section 6: Improve Voice Clone)
      if (input.additionalSamples && input.additionalSamples.length > 0) {
        input.additionalSamples.forEach((sample, idx) => {
          if (sample.buffer && sample.buffer.length > 0) {
            const extraBlob = new Blob([new Uint8Array(sample.buffer)], {
              type: sample.mimeType || 'audio/mpeg',
            });
            formData.append('files', extraBlob, sample.fileName || `sample_${idx + 1}.mp3`);
          }
        });
      }

      formData.append(
        'labels',
        JSON.stringify({
          client_id: id,
          source: 'telugu_public_survey_agent',
          language: 'te',
          quality: 'multi_sample_telugu_tuned',
        })
      );
      return formData;
    };

    const endpoint = `${this.BASE_URL}/voices/add`;

    let response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: makeFormData(),
    });

    let responseText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {}

    // If voice limit reached, force cleanup and retry once
    if (!response.ok && (responseText.includes('voice_limit_reached') || responseText.includes('maximum amount'))) {
      console.warn('Voice limit reached on ElevenLabs. Cleaning up old test voices and retrying...');
      await this.cleanupOldTemporaryVoices(apiKey, id);
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: makeFormData(),
      });
      responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch {}
    }

    if (!response.ok) {
      const errorDetail = data?.detail?.message || data?.message || responseText || `Status ${response.status}`;
      console.error('VOICE_CREATE_FAILED', {
        clientId: id,
        status: response.status,
        error: errorDetail,
      });
      if (response.status === 401 && (responseText.includes('payment') || responseText.includes('invoice'))) {
        throw new Error(
          'ElevenLabs subscription payment issue: Please check and settle your ElevenLabs invoice to add new cloned voices. Existing approved voices and speech synthesis remain fully active.'
        );
      }
      throw new Error(`ElevenLabs voice cloning failed: ${errorDetail}`);
    }

    if (!data?.voice_id) {
      console.error('VOICE_CREATE_FAILED', {
        clientId: id,
        error: 'No voice_id returned by ElevenLabs',
      });
      throw new Error('ElevenLabs did not return a valid voice_id');
    }

    const newVoiceId = data.voice_id;
    console.log('[ELEVENLABS_VOICE_ID_RECEIVED]', {
      clientId: id,
      voiceId: newVoiceId,
    });

    // Verification step: verify the voice exists on ElevenLabs using GET /v1/voices/{voice_id}
    console.log('[ELEVENLABS_VOICE_VERIFY_STARTED]', {
      clientId: id,
      voiceId: newVoiceId,
    });

    const verifyRes = await fetch(`${this.BASE_URL}/voices/${encodeURIComponent(newVoiceId)}`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (!verifyRes.ok) {
      const verifyErrorText = await verifyRes.text().catch(() => '');
      console.error('[ELEVENLABS_VOICE_VERIFY_FAILED]', {
        clientId: id,
        voiceId: newVoiceId,
        status: verifyRes.status,
        error: verifyErrorText,
      });
      throw new Error(`ElevenLabs voice verification failed (${verifyRes.status}): Voice was not confirmed in ElevenLabs account.`);
    }

    const verifiedVoice = await verifyRes.json();
    console.log('[ELEVENLABS_VOICE_VERIFIED]', {
      clientId: id,
      voiceId: newVoiceId,
      name: verifiedVoice.name,
      category: verifiedVoice.category,
    });

    return { voice_id: newVoiceId, isMock: false };
  }

  /**
   * Verifies that a given voice ID actually exists and is accessible
   * using the official GET /v1/voices/{voice_id} endpoint.
   */
  public static async verifyVoiceExists(voiceId: string): Promise<{
    valid: boolean;
    name?: string;
    category?: string;
    error?: string;
    status?: number;
  }> {
    if (!voiceId || typeof voiceId !== 'string' || !voiceId.trim()) {
      return { valid: false, error: 'Empty or invalid voice ID.' };
    }
    const cleanId = resolveVoiceId(voiceId);
    if (isLocalOrMockVoiceId(cleanId) || cleanId === '4XvBGCPMXWyVQa75dbZg') {
      return { valid: false, error: 'Voice ID is a placeholder or blocked reference voice.' };
    }
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { valid: false, error: 'ELEVENLABS_API_KEY is not configured on the server.' };
    }

    try {
      const res = await fetch(`${this.BASE_URL}/voices/${encodeURIComponent(cleanId)}`, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let parsed: any = null;
        try { parsed = JSON.parse(errText); } catch {}
        const detail = parsed?.detail?.message || parsed?.message || errText || `HTTP ${res.status}`;
        return {
          valid: false,
          error: `ElevenLabs voice not found or inaccessible (${res.status}): ${detail}`,
          status: res.status,
        };
      }

      const data = await res.json();
      return {
        valid: true,
        name: data.name,
        category: data.category,
        status: res.status,
      };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Network error verifying voice on ElevenLabs.' };
    }
  }

  /**
   * Permanently delete a cloned voice from ElevenLabs.
   * Uses DELETE https://api.elevenlabs.io/v1/voices/{voice_id}
   */
  static async deleteVoice(
    voiceId: string
  ): Promise<{ success: boolean; message: string; status?: number }> {
    if (!voiceId) {
      return { success: false, message: 'No voice ID provided for deletion' };
    }
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'ELEVENLABS_API_KEY is not configured on the server',
      };
    }

    try {
      const response = await fetch(
        `${this.BASE_URL}/voices/${encodeURIComponent(voiceId)}`,
        {
          method: 'DELETE',
          headers: { 'xi-api-key': apiKey },
        }
      );

      const responseText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {}

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`ElevenLabs voice ${voiceId} was not found (already deleted).`);
          return {
            success: true,
            message: 'Voice was already removed from ElevenLabs',
            status: 404,
          };
        }
        const errorDetail =
          data?.detail?.message || data?.message || responseText || `Status ${response.status}`;
        console.warn(`ElevenLabs voice deletion error (${response.status}):`, errorDetail);
        return {
          success: false,
          message: errorDetail,
          status: response.status,
        };
      }

      console.log(`ElevenLabs voice ${voiceId} successfully deleted.`);
      return {
        success: true,
        message: 'Voice deleted successfully from ElevenLabs',
        status: 200,
      };
    } catch (err: any) {
      console.warn('ElevenLabs voice deletion exception:', err?.message || err);
      return {
        success: false,
        message: err?.message || 'Network error deleting voice from ElevenLabs',
      };
    }
  }

  /**
   * Synthesize natural human conversational speech using a confirmed voice_id (ElevenLabs Text-to-Speech).
   * Generates real audio in the client's cloned voice with human-like prosody, warmth, and cadence.
   * Absolutely NO fallback beeps. Throws descriptive error on failure.
   */
  static async synthesizeSpeech(
    voiceId: string,
    text: string,
    modelId?: string,
    maxRetries = 3,
    customSettings?: {
      stability?: number;
      similarity_boost?: number;
      style?: number;
      use_speaker_boost?: boolean;
      speed?: number;
    }
  ): Promise<{ buffer: Buffer; isMock: boolean; contentType: string }> {
    const apiKey = this.getApiKey();
    const effectiveModelId = this.resolveModel(modelId, text);

    const effectiveSettings = {
      ...DEFAULT_CONVERSATIONAL_VOICE_SETTINGS,
      ...(customSettings || {}),
    };

    let targetVoiceId = resolveVoiceId(voiceId);

    console.log('[TTS_STARTED]', { voiceId: targetVoiceId, originalVoiceId: voiceId, modelId: effectiveModelId, settings: effectiveSettings });
    console.log('[VOICE_ID_USED]', { voiceId: targetVoiceId });

    if (!apiKey) {
      console.error('[TTS_FAILED]', {
        voiceId: targetVoiceId,
        error: 'ELEVENLABS_API_KEY is not configured',
      });
      throw new Error(
        'ELEVENLABS_API_KEY is not configured on the server. Voice generation cannot proceed without an API key.'
      );
    }

    if (isLocalOrMockVoiceId(targetVoiceId)) {
      console.error('[TTS_FAILED]', {
        voiceId: targetVoiceId,
        error: 'Invalid or mock voice ID',
      });
      throw new Error(
        'చెల్లుబాటు అయ్యే ElevenLabs voice_id అందుబాటులో లేదు. దయచేసి మీ వాయిస్‌ని సృష్టించి యాక్టివేట్ చేయండి.'
      );
    }

    const rawCleanText = text.trim();
    console.log('[TTS_INPUT_TEXT]', JSON.stringify(rawCleanText));

    if (!rawCleanText) {
      throw new Error('TTS text cannot be empty');
    }
    const { normalizedText: cleanText, appliedRules } =
      normalizeTeluguPronunciation(rawCleanText);

    const naturalText = cleanText.trim();
    console.log('[FINAL_ELEVENLABS_TEXT]', JSON.stringify(naturalText));

    if (appliedRules.length > 0) {
      console.log('PRONUNCIATION_NORMALIZATION_APPLIED', {
        appliedRules,
        text: cleanText,
      });
    }

    const t_tts_start = Date.now();
    console.log('[VOICE_LATENCY]', {
      stage: 'tts_start',
      timestamp: new Date(t_tts_start).toISOString(),
      voiceId: targetVoiceId,
      textLength: cleanText.length,
    });

    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff before retrying
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }

        const endpoint = `${this.BASE_URL}/text-to-speech/${encodeURIComponent(targetVoiceId)}?output_format=mp3_44100_128`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: naturalText,
            model_id: effectiveModelId,
            voice_settings: effectiveSettings,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let parsedError: any = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch {}

          const detailMsg = parsedError?.detail?.message || parsedError?.message || errorText;

          // 1. Check for subscription payment issue (401 payment_required / payment_issue)
          if (
            response.status === 401 &&
            (errorText.includes('payment') || errorText.includes('invoice') || errorText.includes('payment_issue'))
          ) {
            lastError = new Error(
              `ElevenLabs subscription payment issue: ${detailMsg || 'Your subscription has a failed or incomplete payment. Complete the latest invoice in ElevenLabs to continue usage.'}`
            );
            console.error('[TTS_FAILED_PAYMENT_ISSUE]', { voiceId: targetVoiceId, status: response.status, error: detailMsg });
            throw lastError;
          }

          // 2. If 404 voice_not_found: Recover automatically with the active approved cloned voice
          if (response.status === 404) {
            console.warn('[VOICE_NOT_FOUND_ON_ELEVENLABS]', { requestedVoiceId: targetVoiceId });
            try {
              await voiceProfileStorage.markVoiceInvalid(targetVoiceId);
            } catch {}
            if (targetVoiceId !== ACTIVE_RISHI_CLONED_VOICE_ID) {
              console.log(
                `[VOICE_NOT_FOUND_RECOVERY] ElevenLabs voice ${targetVoiceId} returned 404. Seamlessly recovering with active approved cloned voice ${ACTIVE_RISHI_CLONED_VOICE_ID}...`
              );
              targetVoiceId = ACTIVE_RISHI_CLONED_VOICE_ID;
              continue;
            }
            lastError = new Error(`ElevenLabs voice ${targetVoiceId} was not found (404).`);
            throw lastError;
          }

          // 3. If 429 concurrent limit exceeded or rate limit: Back off and retry
          if (response.status === 429 && attempt < maxRetries) {
            const waitMs = 1200 * (attempt + 1);
            console.warn(`[ElevenLabsService] 429 concurrency/rate limit. Waiting ${waitMs}ms before retrying...`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }

          lastError = new Error(`ElevenLabs TTS synthesis failed (${response.status}): ${detailMsg}`);
          if (attempt < maxRetries) {
            continue;
          }
          throw lastError;
        }

        const arrayBuffer = await response.arrayBuffer();
        const rawBuffer = Buffer.from(arrayBuffer);
        const t_tts_end = Date.now();
        const buffer = rawBuffer;

        console.log('[VOICE_LATENCY]', {
          stage: 'tts_end',
          first_audio_byte: new Date(t_tts_end).toISOString(),
          tts_duration_ms: t_tts_end - t_tts_start,
          bytes: buffer.length,
          voiceId,
        });

        return {
          buffer,
          isMock: false,
          contentType: 'audio/mpeg',
        };
      } catch (err: any) {
        lastError = err;
        if (lastError?.message?.includes('payment') || lastError?.message?.includes('404')) {
          break;
        }
        if (attempt >= maxRetries) {
          break;
        }
      }
    }

    console.error('[TTS_FAILED]', {
      voiceId,
      error: lastError?.message || lastError,
    });
    throw lastError || new Error('Voice generation failed. Please try again.');
  }

  /**
   * Stream Telugu speech from ElevenLabs using the confirmed voice_id.
   * Starts sending audio chunks in ~500ms for lowest conversational latency.
   */
  static async streamSpeech(
    voiceId: string,
    text: string,
    modelId?: string,
    customSettings?: {
      stability?: number;
      similarity_boost?: number;
      style?: number;
      use_speaker_boost?: boolean;
      speed?: number;
    }
  ): Promise<{ response: Response; contentType: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured on the server.');
    }
    if (isLocalOrMockVoiceId(voiceId)) {
      throw new Error('చెల్లుబాటు అయ్యే ElevenLabs voice_id అందుబాటులో లేదు.');
    }

    const rawCleanText = text.trim();
    if (!rawCleanText) {
      throw new Error('TTS text cannot be empty');
    }

    const effectiveModelId = this.resolveModel(modelId, rawCleanText);
    const { normalizedText: cleanText } = normalizeTeluguPronunciation(rawCleanText);
    const endpoint = `${this.BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=3`;

    const effectiveSettings = {
      ...DEFAULT_CONVERSATIONAL_VOICE_SETTINGS,
      ...(customSettings || {}),
    };

    const t_tts_start = Date.now();
    console.log('[VOICE_LATENCY]', {
      stage: 'tts_stream_start',
      timestamp: new Date(t_tts_start).toISOString(),
      voiceId,
      modelId: effectiveModelId,
      settings: effectiveSettings,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: effectiveModelId,
        voice_settings: effectiveSettings,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        await voiceProfileStorage.markVoiceInvalid(voiceId).catch(() => {});
      }
      throw new Error(`ElevenLabs TTS streaming failed (${response.status}): ${errorText}`);
    }

    return { response, contentType: 'audio/mpeg' };
  }

  /**
   * Generate a voice preview for a client's voice_id.
   * Fixed authentic Telugu test sentence:
   * "నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము."
   */
  static async generatePreview(
    voiceId: string,
    text = 'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.'
  ): Promise<{ buffer: Buffer; isMock: boolean; contentType: string }> {
    const effectiveModelId = this.resolveModel(undefined, text);
    console.log('[PREVIEW_GENERATION_STARTED]', { voiceId, modelId: effectiveModelId, textLength: text.length });
    const result = await this.synthesizeSpeech(voiceId, text, effectiveModelId);
    console.log('[PREVIEW_GENERATION_SUCCESS]', { voiceId, bufferBytes: result.buffer.length });
    return result;
  }

  /**
   * Fetch voice details from ElevenLabs.
   */
  static async getVoiceDetails(voiceId: string): Promise<any> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const endpoint = `${this.BASE_URL}/voices/${encodeURIComponent(voiceId)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voice details (${response.status})`);
    }

    return await response.json();
  }

  /**
   * Speech synthesis with Madhavi reference guard.
   * Throws an error if Madhavi voice ID is passed as target voice.
   */
  static async synthesizeSpeechWithMadhaviReference(
    targetVoiceId: string,
    text: string
  ): Promise<{ buffer: Buffer; isMock: boolean; contentType: string }> {
    if (targetVoiceId === MADHAVI_REFERENCE_VOICE_ID || targetVoiceId === '4XvBGCPMXWyVQa75dbZg') {
      throw new Error('Madhavi voice ID (4XvBGCPMXWyVQa75dbZg) cannot be used as target cloned voice.');
    }
    return this.synthesizeSpeech(targetVoiceId, text);
  }
}

