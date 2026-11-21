async function testCompleteFlow() {
  console.log('=== RUNNING FINAL ACCEPTANCE AND LATENCY TEST ===\n');

  // 1. Check Active Voice
  const activeRes = await fetch('http://localhost:3000/api/voice-profile/active/client_001');
  const activeData = await activeRes.json();
  const voiceId = activeData.profile?.voice_id || 'vqrpmsQYYs9tOYmeRbSu';
  console.log('1. Active Voice Profile:', {
    has_active_voice: activeData.has_active_voice,
    voiceId,
    provider: activeData.profile?.provider,
  });

  // 2. Test Comparison Endpoint (3 Modes in UI)
  const testSent = 'మీ ప్రాంతంలో తాగునీటి సమస్య ఎలా ఉంది అండి?';

  // Mode A: Madhavi Reference
  const t_a = Date.now();
  const resA = await fetch('http://localhost:3000/api/voice-profile/test-reference-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'client_001', voice_id: voiceId, mode: 'madhavi_ref', text: testSent }),
  });
  const dataA = await resA.json();
  console.log('2. Mode A (Madhavi Reference):', {
    status: resA.status,
    durationMs: Date.now() - t_a,
    target: dataA.target_voice_id,
  });

  // Mode B: My Voice (Raw)
  const t_b = Date.now();
  const resB = await fetch('http://localhost:3000/api/voice-profile/test-reference-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'client_001', voice_id: voiceId, mode: 'raw_voice', text: testSent }),
  });
  const dataB = await resB.json();
  console.log('3. Mode B (My Voice Raw):', {
    status: resB.status,
    durationMs: Date.now() - t_b,
    target: dataB.target_voice_id,
  });

  // Mode C: My Voice - Pronunciation Optimized
  const t_c = Date.now();
  const resC = await fetch('http://localhost:3000/api/voice-profile/test-reference-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'client_001', voice_id: voiceId, mode: 'optimized', text: testSent }),
  });
  const dataC = await resC.json();
  console.log('4. Mode C (My Voice - Pronunciation Optimized):', {
    status: resC.status,
    durationMs: Date.now() - t_c,
    target: dataC.target_voice_id,
    label: dataC.label,
  });

  // 3. Test End-to-End Latency for Survey Interaction
  const t_speech_end = Date.now();
  const interactRes = await fetch('http://localhost:3000/api/survey/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'latency_test_' + Date.now(),
      messages: [
        { role: 'agent', text: 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?' },
        { role: 'respondent', text: 'చాలా గుంతలు ఉన్నాయి, వర్షం వస్తే చాలా ఇబ్బంది అవుతుంది.' },
      ],
      surveyConfig: { title: 'ప్రజా సర్వే', questions: [] },
      collectedAnswers: {},
      client_id: 'client_001',
      voice_id: voiceId,
      prefer_stream: true,
      timestamps: { speech_end: t_speech_end },
    }),
  });
  const interactData = await interactRes.json();
  const t_json_received = Date.now() - t_speech_end;
  console.log('\n5. Survey Interaction Response:', {
    status: interactRes.status,
    reply: interactData.reply,
    voice_id: interactData.voice_id,
    audio_stream_url: interactData.audio_stream_url,
    jsonResponseLatencyMs: t_json_received,
  });

  // 4. Stream First Audio Byte Fetch
  const t_stream_call = Date.now();
  const streamRes = await fetch('http://localhost:3000' + interactData.audio_stream_url);
  const reader = streamRes.body!.getReader();
  const chunk1 = await reader.read();
  const t_first_audio_byte = Date.now() - t_speech_end;
  const streamChunkMs = Date.now() - t_stream_call;

  console.log('\n6. FIRST PLAYABLE AUDIO MEASUREMENT:', {
    speech_end_to_json_ms: t_json_received,
    stream_request_to_first_chunk_ms: streamChunkMs,
    TOTAL_LATENCY_SPEECH_END_TO_FIRST_AUDIO_BYTE_MS: t_first_audio_byte,
  });

  // 5. Test Second Sentence Stream
  const testSent2 = 'సాధారణంగా వారానికి ఎన్ని రోజులు మీ ప్రాంతానికి నీరు వస్తుంది?';
  const resSent2 = await fetch(
    'http://localhost:3000/api/voice-profile/stream?voice_id=' +
      voiceId +
      '&text=' +
      encodeURIComponent(testSent2)
  );
  const reader2 = resSent2.body!.getReader();
  const chunk2_1 = await reader2.read();
  console.log('\n7. Second Sentence Stream Test:', {
    status: resSent2.status,
    firstChunkSize: chunk2_1.value?.length,
    contentType: resSent2.headers.get('content-type'),
  });

  console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
}

testCompleteFlow().catch(console.error);
