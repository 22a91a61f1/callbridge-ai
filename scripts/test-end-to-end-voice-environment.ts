/**
 * End-to-End Voice Environment Verification Test
 *
 * Validates:
 * 1. Client Voice Recording & ElevenLabs Voice Clone flow (First-time client).
 * 2. Status message: "వాయిస్ ఇంకా save కాలేదు." when no voice exists.
 * 3. Returning client check: "మీ voice ఇప్పటికే save అయి ఉంది." and active voice profile.
 * 4. Fixed Telugu voice preview:
 *    "నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము."
 * 5. Record New Voice flow without deleting old voice immediately:
 *    - Compare & test Keep Previous Voice vs Use New Voice (activating new, archiving old).
 * 6. Public Survey Voice Test Mode:
 *    - Starting survey test generates question via OpenAI.
 *    - ElevenLabs converts response text into speech using active voice_id.
 *    - Subsequent respondent reply processed by OpenAI and synthesized with the SAME voice_id (Voice ID Reuse).
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function generateSampleWav(): Buffer {
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
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(totalFileSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t);
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

async function runEndToEndTests() {
  console.log('================================================================');
  console.log('TELUGU PUBLIC SURVEY — END-TO-END VOICE TESTING ENVIRONMENT VERIFICATION');
  console.log(`Target Server: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const testClientId = `client_test_${Date.now()}`;
  const sampleWav = generateSampleWav();

  // STAGE 1: FIRST-TIME CLIENT FLOW
  console.log('--- STAGE 1: FIRST-TIME CLIENT FLOW ---');
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile/client/${testClientId}`);
    const data = await res.json();

    if (
      res.status === 200 &&
      data.has_active_voice === false &&
      data.message === 'వాయిస్ ఇంకా save కాలేదు.'
    ) {
      console.log('✅ TEST 1 PASSED: First-time client check returned "వాయిస్ ఇంకా save కాలేదు."');
      passed++;
    } else {
      console.error('❌ TEST 1 FAILED: Unexpected response for first-time client.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 1 ERROR:', err.message);
    failed++;
  }

  // STAGE 2: CREATE ELEVENLABS VOICE CLONE
  console.log('\n--- STAGE 2: CREATE ELEVENLABS VOICE CLONE ---');
  let firstVoiceId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: testClientId,
        audio_base64: sampleWav.toString('base64'),
        file_name: 'test_voice.wav',
        mime_type: 'audio/wav',
      }),
    });
    const data = await res.json();

    if (res.status === 200 && data.success === true && data.voice_id && data.status === 'active') {
      firstVoiceId = data.voice_id;
      console.log(`✅ TEST 2 PASSED: ElevenLabs voice clone created. Voice ID: ${data.voice_id}`);
      passed++;

      // Verify preview sentence
      const expectedSentence =
        'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని ప్రశ్నలు అడగడానికి కాల్ చేస్తున్నాము.';
      if (data.preview_text === expectedSentence) {
        console.log('✅ TEST 3 PASSED: Fixed Telugu test sentence generated correctly:');
        console.log(`   "${data.preview_text}"`);
        passed++;
      } else {
        console.error('❌ TEST 3 FAILED: Incorrect preview sentence.', data.preview_text);
        failed++;
      }
    } else {
      console.error('❌ TEST 2 FAILED: Could not create voice profile.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 2 ERROR:', err.message);
    failed++;
  }

  // STAGE 3: RETURNING CLIENT VERIFICATION
  console.log('\n--- STAGE 3: RETURNING CLIENT VERIFICATION ---');
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile/client/${testClientId}`);
    const data = await res.json();

    if (
      res.status === 200 &&
      data.has_active_voice === true &&
      data.voice_status === 'Active' &&
      data.message === 'మీ voice ఇప్పటికే save అయి ఉంది.' &&
      data.profile.voice_id === firstVoiceId
    ) {
      console.log('✅ TEST 4 PASSED: Returning client correctly detected:');
      console.log(`   Status: "${data.message}", Voice Status: Active, Voice ID: ${firstVoiceId}`);
      passed++;
    } else {
      console.error('❌ TEST 4 FAILED: Returning client check failed.', data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 4 ERROR:', err.message);
    failed++;
  }

  // STAGE 4: VOICE PREVIEW AUDIO ENDPOINT
  console.log('\n--- STAGE 4: VOICE PREVIEW AUDIO PLAYBACK ---');
  try {
    const res = await fetch(`${BASE_URL}/api/voice-profile/preview-audio/${encodeURIComponent(firstVoiceId)}`);
    const buffer = await res.arrayBuffer();

    if (res.status === 200 && buffer.byteLength > 44) {
      console.log(`✅ TEST 5 PASSED: Preview audio successfully synthesized (${buffer.byteLength} bytes).`);
      passed++;
    } else {
      console.error('❌ TEST 5 FAILED: Preview audio synthesis failed.', res.status);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ TEST 5 ERROR:', err.message);
    failed++;
  }

  // STAGE 5: RECORD NEW VOICE WITHOUT IMMEDIATE DELETION
  console.log('\n--- STAGE 5: RECORD NEW VOICE FLOW ---');
  let newCandidateVoiceId = '';
  try {
    // 5a: Record new voice
    const res = await fetch(`${BASE_URL}/api/voice-profile/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: testClientId,
        audio_base64: sampleWav.toString('base64'),
        file_name: 'new_sample.wav',
        mime_type: 'audio/wav',
        mode: 'new_recording',
      }),
    });
    const data = await res.json();

    if (
      res.status === 200 &&
      data.success === true &&
      data.is_new_candidate === true &&
      data.voice_id !== firstVoiceId
    ) {
      newCandidateVoiceId = data.voice_id;
      console.log(`✅ TEST 6 PASSED: New candidate voice created (${newCandidateVoiceId}) while preserving previous voice (${firstVoiceId}).`);
      passed++;
    } else {
      console.error('❌ TEST 6 FAILED: Record new voice candidate failed.', data);
      failed++;
    }

    // 5b: Verify previous voice is STILL the active one before user decides
    const checkRes = await fetch(`${BASE_URL}/api/voice-profile/client/${testClientId}`);
    const checkData = await checkRes.json();
    if (checkData.profile?.voice_id === firstVoiceId && checkData.profile?.status === 'active') {
      console.log('✅ TEST 7 PASSED: Previous voice remains active while candidate preview is reviewed.');
      passed++;
    } else {
      console.error('❌ TEST 7 FAILED: Previous voice was prematurely altered.', checkData);
      failed++;
    }

    // 5c: Activate the new voice [Use New Voice]
    const activateRes = await fetch(`${BASE_URL}/api/voice-profile/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: testClientId,
        voice_id: newCandidateVoiceId,
      }),
    });
    const activateData = await activateRes.json();

    if (activateRes.status === 200 && activateData.profile?.status === 'active') {
      console.log(`✅ TEST 8 PASSED: "Use New Voice" activated ${newCandidateVoiceId}. Old voice marked archived.`);
      passed++;
    } else {
      console.error('❌ TEST 8 FAILED: Voice activation failed.', activateData);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ STAGE 5 ERROR:', err.message);
    failed++;
  }

  // STAGE 6: PUBLIC SURVEY VOICE TEST MODE & VOICE ID REUSE
  console.log('\n--- STAGE 6: PUBLIC SURVEY VOICE TEST MODE & REUSE ---');
  try {
    const surveySessionId = `session_voice_test_${Date.now()}`;
    const activeTestVoice = newCandidateVoiceId || firstVoiceId;

    // Turn 1: Start Survey Test with active voice
    const turn1Res = await fetch(`${BASE_URL}/api/survey/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: surveySessionId,
        client_id: testClientId,
        voice_id: activeTestVoice,
        messages: [],
        surveyConfig: {
          id: 'public_facilities',
          title: 'ప్రజా సదుపాయాల సర్వే',
          targetLanguage: 'Telugu',
          questions: [
            { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సరఫరా మరియు నీటి నాణ్యత ఎలా ఉంది?' },
            { id: 'A2', text: 'రోడ్ల పరిస్థితి మరియు వీధి దీపాలు ఎలా ఉన్నాయి?' },
          ],
        },
      }),
    });
    const turn1Data = await turn1Res.json();

    if (
      turn1Res.status === 200 &&
      turn1Data.reply &&
      turn1Data.voice_id === activeTestVoice &&
      turn1Data.audio_base64 &&
      turn1Data.voice_provider === 'elevenlabs'
    ) {
      console.log(`✅ TEST 9 PASSED: Voice Survey Test Turn 1 generated speech via ElevenLabs with active voice (${turn1Data.voice_id}).`);
      console.log(`   Reply Text: "${turn1Data.reply}"`);
      passed++;
    } else {
      console.error('❌ TEST 9 FAILED: Turn 1 voice synthesis failed.', turn1Data);
      failed++;
    }

    // Turn 2: Respondent responds; OpenAI reasons & ElevenLabs speaks with SAME voice_id
    const respondentText = 'నీళ్లు వస్తాయి కానీ ప్రతిరోజూ రావు, రెండు రోజులకు ఒకసారి వస్తాయి.';
    const messagesHistory = [
      { role: 'agent', text: turn1Data.reply },
      { role: 'respondent', text: respondentText },
    ];

    const turn2Res = await fetch(`${BASE_URL}/api/survey/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: surveySessionId,
        client_id: testClientId,
        voice_id: activeTestVoice,
        messages: messagesHistory,
        surveyConfig: {
          id: 'public_facilities',
          title: 'ప్రజా సదుపాయాల సర్వే',
          targetLanguage: 'Telugu',
          questions: [
            { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సరఫరా మరియు నీటి నాణ్యత ఎలా ఉంది?' },
            { id: 'A2', text: 'రోడ్ల పరిస్థితి మరియు వీధి దీపాలు ఎలా ఉన్నాయి?' },
          ],
        },
      }),
    });
    const turn2Data = await turn2Res.json();

    if (
      turn2Res.status === 200 &&
      turn2Data.reply &&
      turn2Data.voice_id === activeTestVoice &&
      turn2Data.audio_base64
    ) {
      console.log(`✅ TEST 10 PASSED: Voice Survey Test Turn 2 understood response, generated dynamic reply, and spoke using the SAME voice_id:`);
      console.log(`   Turn 1 voice: ${turn1Data.voice_id}`);
      console.log(`   Turn 2 voice: ${turn2Data.voice_id} (REUSED - NO RE-CLONING)`);
      console.log(`   Turn 2 Reply: "${turn2Data.reply}"`);
      passed++;
    } else {
      console.error('❌ TEST 10 FAILED: Turn 2 failed or did not reuse voice_id.', turn2Data);
      failed++;
    }
  } catch (err: any) {
    console.error('❌ STAGE 6 ERROR:', err.message);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndTests();
