async function runHttpTest() {
  console.log('Testing HTTP Voice Endpoints on http://localhost:3000...');

  // 1. Check active voice for new client
  const testClient = `client_http_${Date.now()}`;
  const res1 = await fetch(`http://localhost:3000/api/voice-profile/active/${testClient}`);
  const data1 = await res1.json();
  console.log('1. Active voice check (new client):', data1.has_active_voice, data1.message);

  if (data1.has_active_voice !== false || !data1.message.includes('వాయిస్ ఇంకా save కాలేదు')) {
    throw new Error('Expected has_active_voice: false');
  }

  // 2. Create voice with base64 audio
  // Minimal valid 1-second WAV base64
  const sampleRate = 8000;
  const numSamples = 8000;
  const wavBuffer = Buffer.alloc(44 + numSamples * 2);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + numSamples * 2, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(1, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 2, 28);
  wavBuffer.writeUInt16LE(2, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(numSamples * 2, 40);

  const res2 = await fetch('http://localhost:3000/api/voice-profile/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: testClient,
      audio_base64: `data:audio/wav;base64,${wavBuffer.toString('base64')}`,
      file_name: 'test_voice.wav',
      mime_type: 'audio/wav',
    }),
  });
  const data2 = await res2.json();
  console.log('2. Created voice profile:', data2.success, data2.voice_id, data2.status);

  if (!data2.success || !data2.voice_id || data2.status !== 'active') {
    throw new Error('Failed to create voice profile');
  }

  // 3. Check active voice for returning client
  const res3 = await fetch(`http://localhost:3000/api/voice-profile/active/${testClient}`);
  const data3 = await res3.json();
  console.log('3. Active voice check (returning client):', data3.has_active_voice, data3.message);
  if (!data3.has_active_voice || !data3.message.includes('మీ voice ఇప్పటికే save అయి ఉంది')) {
    throw new Error('Expected returning client has_active_voice: true');
  }

  // 4. TTS endpoint with cloned voice
  const res4 = await fetch('http://localhost:3000/api/voice-profile/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: testClient,
      voice_id: data2.voice_id,
      text: 'నమస్కారం! ప్రజా సమస్యల సర్వేకు స్వాగతం.',
    }),
  });
  const audioBlob = await res4.arrayBuffer();
  console.log('4. TTS generated audio size:', audioBlob.byteLength, 'Content-Type:', res4.headers.get('content-type'));
  if (audioBlob.byteLength === 0) {
    throw new Error('TTS returned empty audio');
  }

  // 5. Test survey interaction endpoint with client_id
  const res5 = await fetch('http://localhost:3000/api/survey/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: `sess_${Date.now()}`,
      client_id: testClient,
      messages: [],
      surveyConfig: {
        id: 'public_facilities',
        title: 'ప్రజా సదుపాయాల సర్వే',
        questions: [{ id: 'Q1', text: 'మీ ప్రాంతంలో రోడ్లు ఎలా ఉన్నాయి?' }],
      },
    }),
  });
  const data5 = await res5.json();
  console.log('5. Survey interact with cloned voice:', {
    reply: data5.reply,
    voice_id: data5.voice_id,
    has_audio: Boolean(data5.audio_base64 || data5.audio_url),
  });

  if (!data5.reply) {
    throw new Error('Survey interact did not return reply');
  }

  console.log('\n✅ ALL HTTP VOICE TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runHttpTest().catch((e) => {
  console.error('HTTP test failed:', e);
  process.exit(1);
});
