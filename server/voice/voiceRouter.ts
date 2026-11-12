import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { voiceProfileStorage } from './voiceProfileStorage.ts';
import { ElevenLabsService } from './elevenLabsService.ts';
import type { VoiceProfile } from './types.ts';
import { sanitizeScriptForSpeech } from '../templates/templateEngine.ts';
import { callbridgeStorage } from '../storage/callbridgeStorage.ts';

export const voiceRouter = express.Router();

// Supported audio MIME types and extensions
const SUPPORTED_BASE_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.webm',
  '.flac',
]);

// 15MB file size limit for voice samples
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function getBaseMime(mimeType: string): string {
  if (!mimeType) return 'audio/mpeg';
  return mimeType.toLowerCase().split(';')[0].trim();
}

export function isValidAudioFormat(mimeType: string, fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const baseMime = getBaseMime(mimeType);
  return (
    SUPPORTED_BASE_MIMES.has(baseMime) ||
    SUPPORTED_EXTENSIONS.has(ext) ||
    baseMime.startsWith('audio/')
  );
}

export function normalizeAudioFilename(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (SUPPORTED_EXTENSIONS.has(ext)) return fileName;
  const baseMime = getBaseMime(mimeType);
  if (baseMime.includes('webm')) return `${fileName || 'sample'}.webm`;
  if (baseMime.includes('wav')) return `${fileName || 'sample'}.wav`;
  if (baseMime.includes('ogg')) return `${fileName || 'sample'}.ogg`;
  if (baseMime.includes('mp4') || baseMime.includes('m4a')) return `${fileName || 'sample'}.m4a`;
  if (baseMime.includes('flac')) return `${fileName || 'sample'}.flac`;
  return `${fileName || 'sample'}.mp3`;
}

// Configure multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseMime = getBaseMime(file.mimetype);

    if (
      SUPPORTED_BASE_MIMES.has(baseMime) ||
      SUPPORTED_EXTENSIONS.has(ext) ||
      baseMime.startsWith('audio/')
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported audio format (${file.mimetype || ext}). Supported formats: mp3, wav, m4a, ogg, webm, flac, aac.`
        )
      );
    }
  },
});

/**
 * GET /api/voice-profile/active/:client_id
 * or GET /api/voice-profile/client/:client_id
 *
 * Check whether an active voice already exists for this client.
 * Returns:
 * If active voice exists:
 *   "మీ voice ఇప్పటికే save అయి ఉంది."
 *   status: "active"
 * If no active voice exists:
 *   "వాయిస్ ఇంకా save కాలేదు."
 */
const handleGetActiveVoice = async (req: Request, res: Response) => {
  try {
    const clientId = (req.params.client_id || (req.query?.client_id as string) || 'client_001').trim();
    const eventType = (req.query?.eventType as string) || (req.query?.event_type as string) || undefined;
    const activeProfile = await voiceProfileStorage.getActiveProfile(clientId, eventType);
    const allProfiles = await voiceProfileStorage.getProfilesByClientId(clientId, eventType);

    if (activeProfile && activeProfile.status === 'active') {
      return res.status(200).json({
        success: true,
        has_active_voice: true,
        message: 'మీ voice ఇప్పటికే save అయి ఉంది.',
        voice_status: 'Active',
        profile: {
          id: activeProfile.id,
          client_id: activeProfile.client_id,
          user_id: activeProfile.user_id,
          eventType: activeProfile.eventType,
          eventId: activeProfile.eventId,
          voiceName: activeProfile.voiceName,
          elevenLabsVoiceId: activeProfile.elevenLabsVoiceId,
          voice_id: activeProfile.voice_id,
          provider: 'elevenlabs',
          status: 'active',
          isApproved: activeProfile.isApproved,
          approvalStatus: activeProfile.approvalStatus,
          created_at: activeProfile.created_at,
          updated_at: activeProfile.updated_at,
          metadata: activeProfile.metadata,
        },
        all_voices: allProfiles,
      });
    }

    return res.status(200).json({
      success: true,
      has_active_voice: false,
      message: 'వాయిస్ ఇంకా save కాలేదు.',
      voice_status: 'Not Saved',
      profile: null,
      all_voices: allProfiles,
    });
  } catch (err: any) {
    console.error('Error in GET active voice profile:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to check active voice profile',
    });
  }
};


voiceRouter.get('/active/:client_id', handleGetActiveVoice);
voiceRouter.get('/client/:client_id', handleGetActiveVoice);

// GET /api/voice-profile/sample-audio
// Serves ready-to-use audio sample for quick voice cloning when microphone is unavailable/blocked
voiceRouter.get('/sample-audio', (_req: Request, res: Response) => {
  const fixturePath = path.join(process.cwd(), 'test-fixtures', 'sample_voice_sample.wav');
  if (fs.existsSync(fixturePath)) {
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', 'inline; filename="telugu_sample_voice.wav"');
    return res.sendFile(fixturePath);
  }
  return res.status(404).json({
    success: false,
    error: 'నమూనా ఆడియో ఫైల్ అందుబాటులో లేదు. దయచేసి మైక్రోఫోన్ ఉపయోగించండి లేదా ఆడియో ఫైల్‌ను అప్‌లోడ్ చేయండి.',
  });
});

/**
 * POST /api/voice-profile/create
 *
 * Receives client audio recording, calls ElevenLabs Instant Voice Cloning,
 * saves profile with:
 * client_id, voice_id, provider: 'elevenlabs', status: 'active' (or candidate),
 * generates short preview and returns safe status information.
 */
voiceRouter.post(
  '/create',
  (req, res, next) => {
    (upload.fields([
      { name: 'audio', maxCount: 10 },
      { name: 'file', maxCount: 10 },
      { name: 'samples', maxCount: 10 },
    ]) as any)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: `Audio file is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
          });
        }
        return res.status(400).json({
          success: false,
          error: `Upload error: ${err.message}`,
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      // 1. Validate client_id
      const clientId = (req.body?.client_id || req.body?.user_id || req.query?.client_id || 'client_001').toString().trim();
      const isRecordNewVoiceMode = req.body?.mode === 'new_recording' || req.query?.mode === 'new_recording';

      console.log('VOICE_CREATE_STARTED', {
        clientId,
        timestamp: new Date().toISOString(),
      });

      let audioBuffer: Buffer | null = null;
      let fileName = 'client_recording.webm';
      let mimeType = 'audio/webm';
      const additionalSamples: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];

      // Check if files were uploaded via multipart/form-data
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const allFiles: Express.Multer.File[] = [
        ...(files?.audio || []),
        ...(files?.file || []),
        ...(files?.samples || []),
      ];

      if (allFiles.length > 0) {
        const primaryFile = allFiles[0];
        audioBuffer = primaryFile.buffer;
        fileName = primaryFile.originalname || 'client_recording.webm';
        mimeType = primaryFile.mimetype || 'audio/webm';

        for (let i = 1; i < allFiles.length; i++) {
          const extra = allFiles[i];
          if (extra.buffer && extra.buffer.length > 0) {
            additionalSamples.push({
              buffer: extra.buffer,
              fileName: extra.originalname || `sample_${i + 1}.webm`,
              mimeType: extra.mimetype || 'audio/webm',
            });
          }
        }
      } else if (req.body?.audio_base64) {
        const base64Data = req.body.audio_base64.replace(/^data:audio\/[a-z0-9\-+;=]+;base64,/, '');
        audioBuffer = Buffer.from(base64Data, 'base64');
        fileName = req.body.file_name || 'client_recording.webm';
        mimeType = req.body.mime_type || 'audio/webm';

        if (Array.isArray(req.body.additional_samples_base64)) {
          req.body.additional_samples_base64.forEach((s: any, idx: number) => {
            const rawB64 = (s.audio_base64 || s).replace(/^data:audio\/[a-z0-9\-+;=]+;base64,/, '');
            additionalSamples.push({
              buffer: Buffer.from(rawB64, 'base64'),
              fileName: s.file_name || `sample_${idx + 2}.webm`,
              mimeType: s.mime_type || 'audio/webm',
            });
          });
        }
      }

      console.log('VOICE_AUDIO_RECEIVED', {
        clientId,
        fileName,
        fileSizeBytes: audioBuffer?.length || 0,
        mimeType,
      });

      // 2. Validate audio exists and size > 0
      if (!audioBuffer || audioBuffer.length === 0) {
        console.error('VOICE_CREATE_FAILED', {
          clientId,
          status: 400,
          error: 'Audio recording file is required. Record via microphone or upload an audio file.',
        });
        return res.status(400).json({
          success: false,
          status: 'voice_creation_failed',
          error: 'Audio recording file is required. Record via microphone or upload an audio file.',
        });
      }

      // Validate supported audio type
      if (!isValidAudioFormat(mimeType, fileName)) {
        console.error('VOICE_CREATE_FAILED', {
          clientId,
          status: 400,
          error: `Unsupported audio format (${mimeType}). Supported formats: mp3, wav, m4a, ogg, webm, flac, aac.`,
        });
        return res.status(400).json({
          success: false,
          status: 'voice_creation_failed',
          error: `Unsupported audio format (${mimeType}). Supported formats: mp3, wav, m4a, ogg, webm, flac, aac.`,
        });
      }

      console.log('VOICE_AUDIO_VALIDATED', {
        clientId,
        fileName,
        fileSizeBytes: audioBuffer.length,
        mimeType,
      });

      // Validate API key existence
      const apiKey = ElevenLabsService.getApiKey();
      if (!apiKey) {
        console.error('VOICE_CREATE_FAILED', {
          clientId,
          status: 500,
          error: 'ELEVENLABS_API_KEY is not configured on the server',
        });
        return res.status(500).json({
          success: false,
          status: 'voice_creation_failed',
          error: 'ElevenLabs API key is missing on the server. Please configure ELEVENLABS_API_KEY in your environment.',
        });
      }

      const eventType = (req.body?.eventType || req.body?.event_type || req.query?.eventType || 'public_survey').toString().trim();
      const eventId = (req.body?.eventId || req.body?.event_id || req.query?.eventId || '').toString().trim();
      const voiceName = (req.body?.voice_name || req.body?.voiceName || req.body?.name || `Client_${clientId}_Voice_${Date.now()}`).toString().trim();
      const description = req.body?.description || `Voice clone for ${clientId} [${eventType}]`;
      const normalizedFileName = normalizeAudioFilename(fileName, mimeType);
      const baseMime = getBaseMime(mimeType);

      console.log('ELEVENLABS_REQUEST_STARTED', {
        clientId,
        eventType,
        eventId: eventId || null,
        endpoint: '/voices/add',
        voiceName,
        fileName: normalizedFileName,
      });

      // 3. Call ElevenLabs Voice Cloning with server-side key
      const cloneResult = await ElevenLabsService.cloneVoice({
        clientId,
        userId: clientId,
        eventType,
        eventId,
        voiceName,
        audioBuffer,
        fileName: normalizedFileName,
        mimeType: baseMime,
        additionalSamples,
        description,
      });

      console.log('ELEVENLABS_RESPONSE_RECEIVED', {
        clientId,
        status: 200,
      });

      const newVoiceId = cloneResult.voice_id;

      console.log('VOICE_ID_RECEIVED', {
        clientId,
        voiceId: newVoiceId,
        eventType,
      });

      // Check if client currently has an active voice for this eventType
      const existingActive = await voiceProfileStorage.getActiveProfile(clientId, eventType);

      // Save voice profile with composite eventType scoping
      const now = new Date().toISOString();
      const profileId = `vp_${clientId}_${eventType}_${Date.now()}`;
      const profile: VoiceProfile = {
        id: profileId,
        client_id: clientId,
        user_id: clientId,
        eventType,
        eventId: eventId || undefined,
        voiceName,
        elevenLabsVoiceId: newVoiceId,
        voice_id: newVoiceId,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'ready',
        isApproved: false, // Candidate until explicitly approved
        approvalStatus: 'pending_review',
        created_at: now,
        updated_at: now,
        preview_audio_url: `/api/voice-profile/preview-audio/${encodeURIComponent(newVoiceId)}`,
        languageCapabilities: ['te', 'hi', 'en'],
        metadata: {
          original_filename: fileName,
          file_size_bytes: audioBuffer.length,
          mime_type: baseMime,
          description,
          elevenlabs_name: voiceName,
          is_mock: false,
        },
      };

      await voiceProfileStorage.saveProfile(profile);

      // Mirror to callbridgeStorage with eventType and eventId
      callbridgeStorage.saveVoiceProfile({
        id: profile.id,
        clientId,
        eventType: eventType as any,
        eventId: eventId || undefined,
        name: voiceName,
        voiceName,
        provider: 'elevenlabs',
        providerVoiceId: newVoiceId,
        elevenLabsVoiceId: newVoiceId,
        status: 'active',
        voiceStatus: 'ready',
        approvalStatus: 'pending_review',
        isApproved: false,
        languageCapabilities: ['te', 'hi', 'en'],
        createdAt: now,
        updatedAt: now,
        previewAudioUrl: profile.preview_audio_url,
      });

      console.log('VOICE_PROFILE_SAVED', {
        id: profile.id,
        clientId,
        eventType,
        voiceId: newVoiceId,
        status: 'pending_review',
      });

      // Immediately generate real TTS preview using the newly created voice_id
      const previewText =
        eventType === 'political_campaign'
          ? 'నమస్కారం! నేను మీ ప్రాంత అభివృద్ధికి కట్టుబడి ఉన్నాను. మీ విలువైన మద్దతు తెలియజేయండి.'
          : eventType === 'marriage_event'
          ? 'నమస్కారం అండి! మా వివాహ ఆహ్వానాన్ని మన్నించి మీ కుటుంబ సమేతంగా విచ్చేయగలరు.'
          : 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.';

      let previewBase64: string | null = null;
      try {
        const previewRes = await ElevenLabsService.generatePreview(newVoiceId, previewText);
        if (!previewRes.buffer || previewRes.buffer.length === 0) {
          throw new Error('ElevenLabs returned empty audio buffer for preview');
        }
        previewBase64 = `data:${previewRes.contentType};base64,${previewRes.buffer.toString('base64')}`;
      } catch (err: any) {
        console.error('Initial TTS preview synthesis error:', err?.message || err);
        throw new Error(
          `వాయిస్ సృష్టించబడింది కానీ ప్రివ్యూ ఆడియో సిద్ధం కాలేదు (${err?.message || 'TTS Error'}). దయచేసి మళ్లీ ప్రయత్నించండి.`
        );
      }

      console.log('VOICE_CREATE_SUCCESS', {
        clientId,
        voiceId: newVoiceId,
        eventType,
      });

      return res.status(200).json({
        success: true,
        status: 'voice_created',
        voice_status: 'ready',
        client_id: clientId,
        user_id: clientId,
        eventType,
        eventId: eventId || null,
        voiceName,
        voice_id: newVoiceId,
        active_voice_id: newVoiceId,
        is_new_candidate: true,
        previous_voice_id: existingActive?.voice_id || null,
        preview_url: `/api/voice-profile/preview-audio/${encodeURIComponent(newVoiceId)}`,
        preview_audio_base64: previewBase64,
        preview_text: previewText,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        message: 'Voice created successfully.',
      });
    } catch (err: any) {
      const clientId = (req.body?.client_id || req.body?.user_id || req.query?.client_id || 'client_001').toString().trim();
      console.error('VOICE_CREATE_FAILED', {
        clientId,
        status: err?.status || 500,
        error: err?.message || 'వాయిస్ సృష్టి విఫలమైంది',
      });
      return res.status(500).json({
        success: false,
        status: 'voice_creation_failed',
        error: err?.message || 'వాయిస్ సృష్టి విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.',
      });
    }
  }
);

/**
 * POST /api/voice-profile/activate
 *
 * When user selects [Use New Voice] or [Use This Voice]:
 * old voice = archived
 * new voice = active
 */
voiceRouter.post('/activate', async (req: Request, res: Response) => {
  try {
    const clientId = (req.body?.client_id || req.body?.user_id || 'client_001').trim();
    const voiceId = (req.body?.voice_id || '').trim();

    if (!voiceId) {
      return res.status(400).json({
        success: false,
        error: 'voice_id is required to activate a voice',
      });
    }
    const activated = await voiceProfileStorage.activateVoice(clientId, voiceId);

    return res.status(200).json({
      success: true,
      message: 'వాయిస్ విజయవంతంగా యాక్టివేట్ చేయబడింది.',
      profile: {
        client_id: activated.client_id,
        voice_id: activated.voice_id,
        provider: 'elevenlabs',
        status: 'active',
        created_at: activated.created_at,
        updated_at: activated.updated_at,
      },
    });
  } catch (err: any) {
    console.error('Error in POST /api/voice-profile/activate:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to activate voice',
    });
  }
});

/**
 * POST /api/voice-profile/keep-previous
 *
 * When user selects [Keep Previous Voice]:
 * old voice remains active.
 * candidate voice is archived.
 */
voiceRouter.post('/keep-previous', async (req: Request, res: Response) => {
  try {
    const clientId = (req.body?.client_id || req.body?.user_id || 'client_001').trim();
    const candidateVoiceId = (req.body?.candidate_voice_id || req.body?.new_voice_id || '').trim();

    const activeProfile = await voiceProfileStorage.keepPreviousVoice(clientId, candidateVoiceId);

    return res.status(200).json({
      success: true,
      message: 'మునుపటి వాయిస్ యాక్టివ్‌గా కొనసాగించబడింది.',
      active_voice_id: activeProfile?.voice_id || null,
      profile: activeProfile,
    });
  } catch (err: any) {
    console.error('Error in POST /api/voice-profile/keep-previous:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to keep previous voice',
    });
  }
});

/**
 * POST /api/voice-profile/approve
 *
 * User explicitly clicks [Approve Voice]:
 * - Validates ownership and eventType match
 * - Sets approval status to APPROVED for this specific eventType
 * - Updates tenant's eventVoiceProfiles[eventType]
 * - Updates ONLY the active event/eventType in callbridgeStorage
 */
voiceRouter.post('/approve', async (req: Request, res: Response) => {
  try {
    const clientId = (
      req.body?.clientId ||
      req.body?.client_id ||
      req.body?.userId ||
      req.body?.user_id ||
      'client_001'
    ).trim();
    const voiceId = (
      req.body?.voiceProfileId ||
      req.body?.voice_id ||
      req.body?.voiceId ||
      req.body?.id ||
      ''
    ).trim();
    const eventType = (req.body?.eventType || req.body?.event_type || '').toString().trim();
    const eventId = (req.body?.eventId || req.body?.event_id || '').toString().trim();

    if (!voiceId) {
      return res.status(400).json({ success: false, error: 'voice_id is required to approve voice' });
    }

    // Guard: Prevent approving invalid, mock, or Madhavi reference voices
    if (voiceId === '4XvBGCPMXWyVQa75dbZg' || voiceId === '6wa317UxpFQae2t7ZA0Y' || voiceId.startsWith('mock_')) {
      return res.status(400).json({
        success: false,
        error: 'Cannot approve a mock or reference voice. Please record and clone a valid voice sample.',
      });
    }

    // Verify existing profile ownership and event match
    const existing = (await voiceProfileStorage.getProfileById(voiceId)) || callbridgeStorage.getVoiceProfile(voiceId);
    if (existing) {
      const ownerId = (existing as any).client_id || (existing as any).clientId || (existing as any).user_id;
      if (ownerId && ownerId !== clientId) {
        return res.status(403).json({ success: false, error: "Unauthorized: Voice profile does not belong to this user" });
      }
      if (eventType && existing.eventType && existing.eventType !== eventType) {
        return res.status(400).json({
          success: false,
          error: `Event mismatch: Voice profile belongs to ${existing.eventType}, cannot approve for ${eventType}`,
        });
      }
    }

    const resolvedEventType = eventType || existing?.eventType || 'public_survey';

    // Activate voice in voiceProfileStorage strictly for this eventType
    const activated = await voiceProfileStorage.approveVoice(clientId, voiceId, resolvedEventType, eventId).catch(() => null);

    // Update in callbridgeStorage strictly for this eventType & eventId
    const updatedTenant = callbridgeStorage.setTenantApprovedVoice(clientId, voiceId, resolvedEventType, eventId);

    console.log('[VOICE_APPROVAL_COMPLETED]', {
      clientId,
      eventType: resolvedEventType,
      eventId: eventId || null,
      voiceId,
      approvedVoiceName: updatedTenant?.approvedVoiceName || activated?.voiceName || voiceId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      approval_status: 'approved',
      message: 'Voice approved successfully and ready for outbound calls.',
      client_id: clientId,
      voice_id: voiceId,
      eventType: resolvedEventType,
      eventId: eventId || null,
      profile: activated,
      tenant: updatedTenant,
    });
  } catch (err: any) {
    console.error('Error approving voice:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to approve voice' });
  }
});

/**
 * POST /api/voice-profile/reject
 *
 * User clicks [Record Again]:
 * - Keeps currently approved voice untouched
 * - Archives candidate voice for this specific eventType
 */
voiceRouter.post('/reject', async (req: Request, res: Response) => {
  try {
    const clientId = (
      req.body?.clientId ||
      req.body?.client_id ||
      req.body?.userId ||
      req.body?.user_id ||
      'client_001'
    ).trim();
    const candidateVoiceId = (
      req.body?.voiceProfileId ||
      req.body?.candidate_voice_id ||
      req.body?.voice_id ||
      req.body?.voiceId ||
      ''
    ).trim();
    const eventType = (req.body?.eventType || req.body?.event_type || '').toString().trim();

    const activeProfile = await voiceProfileStorage.keepPreviousVoice(clientId, candidateVoiceId, eventType).catch(() => null);

    return res.status(200).json({
      success: true,
      approval_status: 'rejected',
      message: 'Candidate voice rejected. Previous approved voice preserved.',
      active_voice_id: activeProfile?.voice_id || null,
      profile: activeProfile,
    });
  } catch (err: any) {
    console.error('Error rejecting voice:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to reject voice' });
  }
});

/**
 * GET /api/voice-profile/preview-audio/:voice_id
 *
 * Streams short preview audio in Telugu for direct browser <audio> playback.
 */
voiceRouter.get('/preview-audio/:voice_id', async (req: Request, res: Response) => {
  try {
    const voiceId = req.params.voice_id.trim();
    const text =
      (req.query?.text as string) ||
      'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.';

    const { buffer, contentType, isMock } = await ElevenLabsService.generatePreview(voiceId, text);

    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'X-Voice-Id': voiceId,
      'X-Is-Mock': isMock ? 'true' : 'false',
      'Cache-Control': 'no-cache',
    });

    return res.send(buffer);
  } catch (err: any) {
    console.error('Error generating preview audio:', err);
    return res.status(502).json({
      success: false,
      error: 'Voice preview generation failed. ' + (err?.message || 'Please try again.'),
    });
  }
});

/**
 * POST /api/voice-profile/preview
 *
 * Generates speech preview for a given voice_id.
 */
voiceRouter.post('/preview', async (req: Request, res: Response) => {
  try {
    const voiceId = (req.body?.voice_id || '').trim();
    const text =
      req.body?.text?.trim() ||
      'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.';

    if (!voiceId) {
      return res.status(400).json({ success: false, error: 'voice_id is required' });
    }

    const { buffer, contentType, isMock } = await ElevenLabsService.generatePreview(voiceId, text);

    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'X-Voice-Id': voiceId,
      'X-Is-Mock': isMock ? 'true' : 'false',
    });

    return res.send(buffer);
  } catch (err: any) {
    console.error('Error in /api/voice-profile/preview:', err);
    return res.status(502).json({
      success: false,
      error: 'Voice preview generation failed: ' + (err?.message || 'Please try again.'),
    });
  }
});

/**
 * POST /api/voice-profile/tts
 * and GET /api/voice-profile/tts-audio
 *
 * Core ElevenLabs TTS endpoint for the Public Survey Agent:
 * Takes Telugu response text and converts it into speech using the Madhavi reference approach,
 * with the TARGET VOICE strictly set to the client's cloned voice.
 */
const handleTtsPlayback = async (req: Request, res: Response) => {
  let voiceId = '';
  try {
    const clientId = (req.body?.client_id || req.query?.client_id || 'client_001').toString().trim();
    voiceId = (req.body?.voice_id || req.query?.voice_id || '').toString().trim();
    const text = (req.body?.text || req.query?.text || '').toString().trim();

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required for speech synthesis' });
    }

    // If voice_id not directly provided, retrieve active voice for this client
if (!voiceId) {
  const active = await voiceProfileStorage.getActiveProfile(clientId);

  if (active) {
    voiceId = active.voice_id;
  }
}

// DEBUG: Verify which voice the app is actually using
console.log('[ACTIVE_VOICE_CHECK]', {
  clientId,
  requestedVoiceId:
    req.body?.voice_id ||
    req.query?.voice_id ||
    null,
  activeVoiceId: voiceId,
  expectedVoiceId: 'K1QBvMiZJPKFiKyZwAxM',
});

if (!voiceId) {
  return res.status(400).json({
    success: false,
    error:
      'Active voice profile not found. Please create and confirm a voice profile first.',
  });
}

    if (!voiceId) {
      return res.status(400).json({
        success: false,
        error: 'Active voice profile not found. Please create and confirm a voice profile first.',
      });
    }

    // Synthesize using the Madhavi delivery reference + Speech-to-Speech pipeline
    const cleanText = sanitizeScriptForSpeech(text);
    const result = await ElevenLabsService.synthesizeSpeech(voiceId, cleanText);

res.set({
  'Content-Type': result.contentType,
  'Content-Length': result.buffer.length,
  'X-Voice-Id': voiceId,
  'X-Target-Voice-Id': voiceId,
  'X-Pipeline': 'direct_cloned_tts',
  'X-Client-Id': clientId,
  'X-Is-Mock': result.isMock ? 'true' : 'false',
  'Cache-Control': 'no-cache',
});

    return res.send(result.buffer);
  } catch (err: any) {
    console.error('Error in TTS playback:', err);
    if (voiceId && (err?.message?.includes('404') || err?.message?.includes('voice_not_found'))) {
      await voiceProfileStorage.markVoiceInvalid(voiceId).catch(() => {});
      return res.status(404).json({
        success: false,
        has_active_voice: false,
        error: 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.',
      });
    }
    return res.status(502).json({
      success: false,
      error: 'Voice synthesis failed: ' + (err?.message || 'Please try again.'),
    });
  }
};

voiceRouter.post('/tts', handleTtsPlayback);
voiceRouter.get('/tts-audio', handleTtsPlayback);

/**
 * GET and POST /api/voice-profile/stream
 *
 * Real-time streaming ElevenLabs TTS for ultra low-latency response delivery (~500ms first byte).
 */
const handleTtsStream = async (req: Request, res: Response) => {
  let voiceId = '';
  try {
    const clientId = (req.body?.client_id || req.query?.client_id || 'client_001').toString().trim();
    voiceId = (req.body?.voice_id || req.query?.voice_id || '').toString().trim();
    const text = (req.body?.text || req.query?.text || '').toString().trim();

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required for speech synthesis' });
    }

    if (!voiceId) {
      const active = await voiceProfileStorage.getActiveProfile(clientId);
      if (active) voiceId = active.voice_id;
    }

    if (!voiceId) {
      return res.status(400).json({
        success: false,
        error: 'Active voice profile not found. Please create and confirm a voice profile first.',
      });
    }

    const cleanText = sanitizeScriptForSpeech(text);
    const { response, contentType } = await ElevenLabsService.streamSpeech(voiceId, cleanText);

    res.set({
      'Content-Type': contentType,
      'Transfer-Encoding': 'chunked',
      'X-Voice-Id': voiceId,
      'Cache-Control': 'no-cache',
    });

    if (response.body) {
      const reader = response.body.getReader();
      let firstChunkLogged = false;
      const t_stream_init = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.log('[VOICE_LATENCY]', {
            stage: 'first_audio_byte',
            timestamp: new Date().toISOString(),
            stream_first_chunk_ms: Date.now() - t_stream_init,
            voiceId,
          });
        }
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('Error in TTS streaming:', err);
    if (!res.headersSent) {
      return res.status(502).json({
        success: false,
        error: 'Voice streaming failed: ' + (err?.message || 'Please try again.'),
      });
    }
    res.end();
  }
};

voiceRouter.get('/stream', handleTtsStream);
voiceRouter.post('/stream', handleTtsStream);

/**
 * POST /api/voice-profile/test-reference-pipeline
 *
 * Dedicated endpoint for testing the Madhavi delivery reference + Speech-to-Speech
 * pipeline with the active cloned voice.
 */
voiceRouter.post('/test-reference-pipeline', async (req: Request, res: Response) => {
  try {
    const clientId = (req.body?.client_id || 'client_001').toString().trim();
    let voiceId = (req.body?.voice_id || '').toString().trim();
    const mode = (req.body?.mode || 'optimized').toString().trim(); // 'madhavi_ref' | 'raw_voice' | 'optimized'
    const text = (
      req.body?.text ||
      'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.'
    ).toString().trim();

    if (!voiceId) {
      const active = await voiceProfileStorage.getActiveProfile(clientId);
      if (active && active.status === 'active') {
        voiceId = active.voice_id;
      }
    }

    if (!voiceId && mode !== 'madhavi_ref') {
      return res.status(400).json({
        success: false,
        has_active_voice: false,
        error: 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.',
        message: 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.',
      });
    }

    // Section 14 Comparison Mode:
    // A: 'madhavi_ref' -> Pure Madhavi pronunciation reference for comparison
    // B: 'raw_voice' -> My Voice (direct TTS)
    // C: 'optimized' -> My Voice + Madhavi Pronunciation Optimized Pipeline (STS / Normalized)
    if (mode === 'raw_voice') {
      const rawResult = await ElevenLabsService.synthesizeSpeech(voiceId, text);
      return res.status(200).json({
        success: true,
        mode: 'raw_voice',
        audio_base64: `data:${rawResult.contentType};base64,${rawResult.buffer.toString('base64')}`,
        pipeline: 'raw_cloned_voice',
        target_voice_id: voiceId,
        label: 'My Voice (మీ క్లోన్డ్ వాయిస్ - డైరెక్ట్)',
        text,
      });
    }
    // Default: 'optimized' (My Cloned Voice with Madhavi pronunciation reference and normalization)
    const result = await ElevenLabsService.synthesizeSpeech(voiceId, text);

    return res.status(200).json({
      success: true,
      mode: 'optimized',
      audio_base64: `data:${result.contentType};base64,${result.buffer.toString('base64')}`,
      pipeline: 'direct_cloned_tts',
target_voice_id: voiceId,
      label: 'My Voice — Pronunciation Optimized (మీ వాయిస్ + మాధవి ఉచ్ఛారణ శైలి)',
      text,
      message: 'మీ క్లోన్డ్ వాయిస్‌తో మాధవి శైలిలో తెలుగు స్పీచ్ విజయవంతంగా రూపొందించబడింది.',
    });
  } catch (err: any) {
    console.error('Error in /api/voice-profile/test-reference-pipeline:', err);
    const voiceId = (req.body?.voice_id || '').toString().trim();
    if (voiceId && (err?.message?.includes('404') || err?.message?.includes('voice_not_found'))) {
      await voiceProfileStorage.markVoiceInvalid(voiceId).catch(() => {});
      return res.status(404).json({
        success: false,
        has_active_voice: false,
        error: 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.',
      });
    }
    return res.status(502).json({
      success: false,
      error: err?.message || 'Voice pipeline test failed.',
    });
  }
});

// =========================================================================
// BACKWARD COMPATIBILITY ENDPOINTS (Existing suite tests & endpoints)
// =========================================================================

/**
 * POST /api/voice-profile
 * Standard multipart or json voice creation endpoint
 */
voiceRouter.post(
  '/',
  (req, res, next) => {
    (upload.fields([
      { name: 'audio', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ]) as any)(req, res, (err: any) => {
      if (err) return res.status(400).json({ success: false, error: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const rawId = req.body?.user_id || req.body?.client_id || req.query?.user_id;
      if (!rawId || !rawId.toString().trim()) {
        return res.status(400).json({ success: false, error: 'user_id is required' });
      }
      const userId = rawId.toString().trim();
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const uploadedFile = files?.audio?.[0] || files?.file?.[0];

      let audioBuffer: Buffer | null = null;
      let fileName = 'recording.mp3';
      let mimeType = 'audio/mpeg';

      if (uploadedFile) {
        audioBuffer = uploadedFile.buffer;
        fileName = uploadedFile.originalname || 'recording.mp3';
        mimeType = uploadedFile.mimetype || 'audio/mpeg';
      } else if (req.body?.audio_base64) {
        const base64Data = req.body.audio_base64.replace(/^data:audio\/[a-z0-9]+;base64,/, '');
        audioBuffer = Buffer.from(base64Data, 'base64');
        fileName = req.body.file_name || 'recording.mp3';
        mimeType = req.body.mime_type || 'audio/mpeg';
      }

      if (!audioBuffer) {
        return res.status(400).json({ success: false, error: 'Audio file required' });
      }

      const cloneResult = await ElevenLabsService.cloneVoice({
        userId,
        clientId: userId,
        voiceName: req.body?.voice_name || `User_${userId}_Voice`,
        audioBuffer,
        fileName,
        mimeType,
        description: req.body?.description || `Voice clone for ${userId}`,
      });

      const eventType = req.body?.eventType || req.body?.event_type || 'public_survey';
      const eventId = req.body?.eventId || req.body?.event_id;
      const voiceName = req.body?.voice_name || req.body?.voiceName || `User_${userId}_Voice`;

      const profile: VoiceProfile = {
        id: `vp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        client_id: userId,
        user_id: userId,
        eventType,
        eventId,
        voice_id: cloneResult.voice_id,
        voiceName,
        elevenLabsVoiceId: cloneResult.voice_id,
        provider: 'elevenlabs',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        voice_status: 'ready',
        isApproved: false,
        approvalStatus: 'pending_review',
        metadata: {
          original_filename: fileName,
          file_size_bytes: audioBuffer.length,
          mime_type: mimeType,
          is_mock: cloneResult.isMock || false,
        },
      };

      await voiceProfileStorage.saveProfile(profile);

      return res.status(200).json({
        success: true,
        user_id: userId,
        client_id: userId,
        voice_id: cloneResult.voice_id,
        status: 'voice_profile_created',
        voice_status: profile.voice_status,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Cloning failed' });
    }
  }
);

voiceRouter.get('/:user_id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.user_id.trim();
    const eventType = (req.query?.eventType as string) || (req.query?.event_type as string) || undefined;
    const profile = await voiceProfileStorage.getActiveProfile(userId, eventType);
    if (!profile) {
      return res.status(404).json({ success: false, error: `Voice profile not found for: ${userId}` });
    }
    return res.status(200).json({
      success: true,
      id: profile.id,
      user_id: profile.user_id,
      client_id: profile.client_id,
      eventType: profile.eventType,
      eventId: profile.eventId,
      voiceName: profile.voiceName,
      elevenLabsVoiceId: profile.elevenLabsVoiceId,
      voice_id: profile.voice_id,
      provider: profile.provider,
      status: profile.status,
      isApproved: profile.isApproved,
      approvalStatus: profile.approvalStatus,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      metadata: profile.metadata,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

voiceRouter.get('/', async (req: Request, res: Response) => {
  try {
    const eventType = (req.query?.eventType as string) || (req.query?.event_type as string) || undefined;
    const clientId = (req.query?.clientId as string) || (req.query?.user_id as string) || (req.query?.client_id as string) || undefined;
    let profiles: VoiceProfile[] = [];
    if (clientId) {
      profiles = await voiceProfileStorage.getProfilesByClientId(clientId, eventType);
    } else {
      profiles = await voiceProfileStorage.listProfiles(eventType);
    }
    return res.status(200).json({
      success: true,
      count: profiles.length,
      profiles,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

voiceRouter.post('/:user_id/test-tts', async (req: Request, res: Response) => {
  try {
    const userId = req.params.user_id.trim();
    const text = req.body?.text?.trim() || 'నమస్కారం! మీ అభిప్రాయం తెలుసుకోవడానికి ఈ సర్వే చేస్తున్నాము.';
    const profile = await voiceProfileStorage.getActiveProfile(userId);
    if (!profile) {
      return res.status(404).json({ success: false, error: `Voice profile not found for ${userId}` });
    }
    const { buffer, contentType } = await ElevenLabsService.synthesizeSpeech(profile.voice_id, text);
    res.set({ 'Content-Type': contentType, 'Content-Length': buffer.length });
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

voiceRouter.delete('/:user_id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.user_id.trim();
    const deleted = await voiceProfileStorage.deleteProfile(userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: `Voice profile not found for: ${userId}` });
    }
    return res.status(200).json({ success: true, message: `Voice profile deleted for ${userId}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

voiceRouter.post('/internal-test', async (req: Request, res: Response) => {
  const fixturePath = path.join(process.cwd(), 'test-fixtures', 'sample_voice_sample.wav');
  if (!fs.existsSync(fixturePath)) {
    return res.status(500).json({ status: 'FAILED', error: 'Fixture not found' });
  }
  const audioBuffer = fs.readFileSync(fixturePath);
  const testUserId = `test_live_user_${Date.now()}`;
  try {
    const cloneResult = await ElevenLabsService.cloneVoice({
      userId: testUserId,
      voiceName: `InternalTest_${testUserId}`,
      audioBuffer,
      fileName: 'sample_voice_sample.wav',
      mimeType: 'audio/wav',
      allowSimulation: false,
    });
    return res.status(200).json({
      status: 'SUCCESS',
      voice_id: cloneResult.voice_id,
      user_id: testUserId,
    });
  } catch (err: any) {
    return res.status(200).json({ status: 'FAILED', exact_elevenlabs_error: err?.message });
  }
});
