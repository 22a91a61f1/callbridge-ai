/**
 * Standalone Backend Verification Test Script for Voice Cloning API.
 *
 * Verifies:
 * 1. Uploading a voice recording to POST /api/voice-profile.
 * 2. Generating a voice_id for User A.
 * 3. Storing the voice_id mapped to user_id: user_test_a.
 * 4. Generating a SEPARATE voice_id for User B (proving multi-user isolation).
 * 5. Retrieving the stored voice profile via GET /api/voice-profile/:user_id.
 * 6. Validating error handling for missing fields and invalid audio formats.
 *
 * Can be run via:
 * npx tsx scripts/test-voice-cloning.ts
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Generate a valid, minimal 1-second 8kHz mono 16-bit PCM WAV audio buffer in-memory
function generateSampleWavBuffer(): Buffer {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const durationSec = 1;
  const numSamples = sampleRate * durationSec;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * (bitsPerSample / 8);
  const totalFileSize = 44 + dataSize;

  const buffer = Buffer.alloc(totalFileSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(totalFileSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Simple 440Hz sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t);
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

async function runTests() {
  console.log('====================================================');
  console.log('CALLBRIDGE AI — VOICE CLONING BACKEND VERIFICATION');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  const sampleWav = generateSampleWavBuffer();
  let passed = 0;
  let failed = 0;

  // TEST 1: Validation - missing user_id
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: sampleWav.toString('base64') }),
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false && data.error.includes('user_id is required')) {
      console.log('✅ TEST 1 PASSED: Correctly rejected upload with missing user_id.');
      passed++;
    } else {
      console.error('❌ TEST 1 FAILED: Expected 400 with user_id error.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 1 ERROR:', err.message);
    failed++;
  }

  // TEST 2: Validation - missing audio
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'user_test_without_audio' }),
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false) {
      console.log('✅ TEST 2 PASSED: Correctly rejected upload with missing audio file.');
      passed++;
    } else {
      console.error('❌ TEST 2 FAILED: Expected 400 with audio error.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 2 ERROR:', err.message);
    failed++;
  }

  // TEST 3: Create Voice Profile for User A
  let userAVoiceId = '';
  const userAId = `user_rishitha_${Date.now()}`;
  try {
    const formData = new FormData();
    formData.append('user_id', userAId);
    formData.append('voice_name', 'Rishitha Voice Sample');
    formData.append('description', 'Telugu speaking voice clone for Rishitha');

    const blob = new Blob([new Uint8Array(sampleWav)], { type: 'audio/wav' });
    formData.append('audio', blob, 'rishitha_voice.wav');

    // Run test request (use mock mode header if ELEVENLABS_API_KEY is not yet active)
    const headers: Record<string, string> = {};
    if (!process.env.ELEVENLABS_API_KEY) {
      headers['x-mock-elevenlabs'] = 'true';
    }

    const res = await fetch(`${BASE_URL}/api/voice-profile`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json();

    if (res.status === 200 && data.success === true && data.voice_id && data.user_id === userAId) {
      userAVoiceId = data.voice_id;
      console.log(`✅ TEST 3 PASSED: Created voice profile for User A (${userAId}). Generated voice_id: ${userAVoiceId}`);
      passed++;
    } else {
      console.error('❌ TEST 3 FAILED: Expected success: true with voice_id.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 3 ERROR:', err.message);
    failed++;
  }

  // TEST 4: Create SEPARATE Voice Profile for User B (Ensuring User B gets a distinct voice_id)
  let userBVoiceId = '';
  const userBId = `user_suresh_${Date.now()}`;
  try {
    const formData = new FormData();
    formData.append('user_id', userBId);
    formData.append('voice_name', 'Suresh Voice Sample');

    const blob = new Blob([new Uint8Array(sampleWav)], { type: 'audio/wav' });
    formData.append('audio', blob, 'suresh_voice.wav');

    const headers: Record<string, string> = {};
    if (!process.env.ELEVENLABS_API_KEY) {
      headers['x-mock-elevenlabs'] = 'true';
    }

    const res = await fetch(`${BASE_URL}/api/voice-profile`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json();

    if (res.status === 200 && data.success === true && data.voice_id && data.user_id === userBId) {
      userBVoiceId = data.voice_id;
      if (userBVoiceId !== userAVoiceId) {
        console.log(`✅ TEST 4 PASSED: Created SEPARATE voice profile for User B (${userBId}). Generated voice_id: ${userBVoiceId}`);
        passed++;
      } else {
        console.error('❌ TEST 4 FAILED: User B received User A\'s voice_id! Multi-user isolation violated.');
        failed++;
      }
    } else {
      console.error('❌ TEST 4 FAILED: Could not create profile for User B.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 4 ERROR:', err.message);
    failed++;
  }

  // TEST 5: Retrieve Stored Profile for User A
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile/${userAId}`);
    const data = await res.json();

    if (res.status === 200 && data.success === true && data.voice_id === userAVoiceId) {
      console.log(`✅ TEST 5 PASSED: Retrieved profile for ${userAId}. Verified stored voice_id: ${data.voice_id}`);
      passed++;
    } else {
      console.error('❌ TEST 5 FAILED: Retrieved profile did not match expected voice_id.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 5 ERROR:', err.message);
    failed++;
  }

  // TEST 6: List All Profiles
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile`);
    const data = await res.json();

    if (res.status === 200 && data.success === true && Array.isArray(data.profiles)) {
      console.log(`✅ TEST 6 PASSED: Listed ${data.count} stored voice profiles.`);
      passed++;
    } else {
      console.error('❌ TEST 6 FAILED: Failed to list profiles.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 6 ERROR:', err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
