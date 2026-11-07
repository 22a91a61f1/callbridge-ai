import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { ElevenLabsService } from '../server/voice/elevenLabsService';
import { voiceProfileStorage } from '../server/voice/voiceProfileStorage';

async function runLiveVerification() {
  console.log('====================================================');
  console.log('ELEVENLABS LIVE VOICE CLONING VERIFICATION TEST');
  console.log('====================================================');

  const rawKey = process.env.ELEVENLABS_API_KEY?.trim();
  console.log('1. Checking ELEVENLABS_API_KEY from environment...');
  if (!rawKey) {
    console.error('❌ FAILED: ELEVENLABS_API_KEY is not set in the server environment.');
    console.log('Category: API_KEY_MISSING');
    process.exit(1);
  }

  console.log(`   Key detected (Length: ${rawKey.length}, Starts with: "${rawKey.slice(0, 4)}...")`);

  // Load test audio fixture
  const fixturePath = path.join(process.cwd(), 'test-fixtures', 'sample_voice_sample.wav');
  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ FAILED: Test audio fixture not found at ${fixturePath}`);
    process.exit(1);
  }

  const audioBuffer = fs.readFileSync(fixturePath);
  console.log(`2. Loaded test audio fixture (${audioBuffer.length} bytes, WAV 16kHz mono).`);

  const testUserId = `test_live_user_${Date.now()}`;
  console.log(`3. Sending audio to ElevenLabs Voice Cloning API for user: ${testUserId}...`);

  try {
    const cloneResult = await ElevenLabsService.cloneVoice({
      userId: testUserId,
      voiceName: `LiveTest_${testUserId}`,
      audioBuffer,
      fileName: 'sample_voice_sample.wav',
      mimeType: 'audio/wav',
      description: 'Internal live backend verification test sample',
      allowSimulation: false, // Must be LIVE call to ElevenLabs
    });

    if (cloneResult.isMock) {
      console.error('❌ FAILED: Received mock voice_id instead of real ElevenLabs API response.');
      process.exit(1);
    }

    const actualVoiceId = cloneResult.voice_id;
    console.log(`4. ElevenLabs Voice Cloning SUCCEEDED!`);
    console.log(`   Actual ElevenLabs voice_id: ${actualVoiceId}`);

    // Store in storage
    const saved = await voiceProfileStorage.saveProfile({
      client_id: testUserId,
      user_id: testUserId,
      voice_id: actualVoiceId,
      provider: 'elevenlabs',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      voice_status: 'ready',
      metadata: {
        original_filename: 'sample_voice_sample.wav',
        file_size_bytes: audioBuffer.length,
        mime_type: 'audio/wav',
        is_mock: false,
        source: 'internal_live_test',
      },
    });

    console.log('5. Stored profile in backend storage successfully:');
    console.log(JSON.stringify(saved, null, 2));

    console.log('====================================================');
    console.log('FINAL RESULT: SUCCESS');
    console.log(`* ElevenLabs API connection succeeded`);
    console.log(`* Voice clone was created`);
    console.log(`* Actual voice_id returned: ${actualVoiceId}`);
    console.log('====================================================');
  } catch (err: any) {
    console.log('====================================================');
    console.log('FINAL RESULT: FAILED');
    console.log('====================================================');
    console.log('Exact error returned by ElevenLabs:');
    console.log(err.message);

    // Diagnostic categorization
    const msg = err.message.toLowerCase();
    let category = 'UNKNOWN_ERROR';
    let explanation = '';

    if (msg.includes('api key id used as api key') || msg.includes('api key must be') || msg.includes('invalid_api_key') || msg.includes('401') || msg.includes('unauthorized')) {
      category = 'API_KEY_ERROR';
      explanation = 'The ElevenLabs API rejected the API key. Specifically: the environment currently contains an "API Key ID" (a 64-char identifier) instead of the ElevenLabs "Secret API Key" (which is a 51-character secret string starting with "sk_").';
    } else if (msg.includes('quota') || msg.includes('subscription') || msg.includes('tier') || msg.includes('payment_required') || msg.includes('402') || msg.includes('403') || msg.includes('forbidden')) {
      category = 'PERMISSIONS_OR_SUBSCRIPTION_ERROR';
      explanation = 'The ElevenLabs account does not have permissions or active quota for Instant Voice Cloning (POST /v1/voices/add). Instant voice cloning typically requires a paid subscription tier (Starter or higher).';
    } else if (msg.includes('audio') || msg.includes('format') || msg.includes('sample') || msg.includes('too short') || msg.includes('silence')) {
      category = 'AUDIO_FORMAT_OR_QUALITY_ERROR';
      explanation = 'ElevenLabs rejected the audio payload due to format, duration, or silence issues.';
    } else if (msg.includes('enotfound') || msg.includes('timeout') || msg.includes('connection')) {
      category = 'NETWORK_OR_ENDPOINT_ERROR';
      explanation = 'Could not reach the ElevenLabs API endpoint.';
    }

    console.log(`Category: ${category}`);
    console.log(`Explanation: ${explanation}`);
    console.log('====================================================');
  }
}

runLiveVerification();
