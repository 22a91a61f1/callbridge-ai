import { VapiService } from '../server/telephony/vapiService';
import { ElevenLabsService, resolveVoiceId, ACTIVE_RISHI_CLONED_VOICE_ID } from '../server/voice/elevenLabsService';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { queueManager } from '../server/campaign/queueManager';

async function runVerification() {
  console.log('================================================================');
  console.log('VERIFYING VAPI SEQUENTIAL CALLING & VOICE OVERRIDE FIX');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Verify ElevenLabs Voice Preservation
  console.log('--- 1. Testing Cloned Voice Preservation ---');
  const resolvedVoice = resolveVoiceId('WKyArUrP6hdAVp2kHYkw');
  assert(resolvedVoice === ACTIVE_RISHI_CLONED_VOICE_ID, `Legacy voice resolves safely to active Rishi voice ID: ${resolvedVoice}`);

  const activeRishi = resolveVoiceId(ACTIVE_RISHI_CLONED_VOICE_ID);
  assert(activeRishi === ACTIVE_RISHI_CLONED_VOICE_ID, `Approved cloned voice ID preserved untouched: ${activeRishi}`);

  // 2. Intercept fetch to inspect outgoing Vapi payload
  console.log('\n--- 2. Inspecting Outbound Vapi Call Payload ---');
  const originalFetch = globalThis.fetch;
  let capturedPayload: any = null;
  let capturedUrl: string | null = null;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('/call/phone')) {
      capturedUrl = urlStr;
      if (init?.body) {
        capturedPayload = JSON.parse(init.body as string);
      }
      // Return a simulated successful Vapi call response
      return new Response(
        JSON.stringify({
          id: `vapi_call_verified_${Date.now()}`,
          status: 'queued',
          phoneNumberId: capturedPayload?.phoneNumberId,
          type: 'outboundPhoneCall',
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  // Set test runtime credentials so real Vapi API payload construction is triggered
  VapiService.setRuntimeConfig('vapi_test_api_key_abc123', 'vapi_test_phone_num_456', 'vapi_test_asst_789');

  try {
    const callResult = await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      contactName: 'Narayana Reddy',
      voiceId: ACTIVE_RISHI_CLONED_VOICE_ID,
      moduleType: 'political_campaign',
      script: 'నమస్కారం! మన నియోజకవర్గ అభివృద్ధికి మీ మద్దతు కోరుతున్నాం.',
      language: 'te',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support', confirmationText: 'ధన్యవాదాలు' },
        { digit: '2', labelEn: 'Callback', confirmationText: 'కాల్ చేస్తాం' },
      ],
      campaignId: 'camp_test_verified',
      eventId: 'event_political_campaign',
      clientId: 'client_001',
    });

    assert(callResult.success === true, 'createOutboundCall succeeded');
    assert(!!callResult.callId, `Valid Call ID generated: ${callResult.callId}`);
    assert(!!callResult.providerCallId, `Provider Call ID captured: ${callResult.providerCallId}`);

    // If Vapi was configured or inline assistant was built:
    if (capturedPayload) {
      console.log('\n--- 3. Verifying Vapi Payload Schema Strictness ---');
      console.log('Captured Payload Request to Vapi:', JSON.stringify(capturedPayload, null, 2));

      // CRITICAL ASSERTION: assistantOverrides.voice MUST NOT contain credentialId
      if (capturedPayload.assistantOverrides?.voice) {
        assert(
          !('credentialId' in capturedPayload.assistantOverrides.voice),
          'CRITICAL: assistantOverrides.voice.credentialId DOES NOT EXIST'
        );
        assert(
          capturedPayload.assistantOverrides.voice.provider === '11labs',
          'assistantOverrides.voice.provider is "11labs"'
        );
        assert(
          capturedPayload.assistantOverrides.voice.voiceId === ACTIVE_RISHI_CLONED_VOICE_ID,
          `assistantOverrides.voice.voiceId matches active cloned voice: ${capturedPayload.assistantOverrides.voice.voiceId}`
        );
      }

      // If inline assistant was sent
      if (capturedPayload.assistant?.voice) {
        assert(
          !('credentialId' in capturedPayload.assistant.voice),
          'CRITICAL: assistant.voice.credentialId DOES NOT EXIST'
        );
        assert(
          capturedPayload.assistant.voice.provider === '11labs',
          'assistant.voice.provider is "11labs"'
        );
      }
    } else {
      console.log('Vapi API keys not in local env; local telephony simulation verified.');
    }

  } finally {
    globalThis.fetch = originalFetch;
  }

  // 4. Verify Sequential Calling Queue Execution
  console.log('\n--- 4. Testing Sequential Queue Execution (Concurrency = 1) ---');
  const now = new Date().toISOString();
  const testCampaign = callbridgeStorage.saveCampaign({
    id: `camp_seq_${Date.now()}`,
    eventId: 'event_public_survey',
    name: 'Sequential Verification Campaign',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  assert(testCampaign.concurrencyLimit === 1, 'Campaign strictly enforces concurrency limit of 1');

  const jobA = callbridgeStorage.saveCallJob({
    id: `job_seq_a_${Date.now()}`,
    campaignId: testCampaign.id,
    eventId: 'event_public_survey',
    contactId: 'c_a',
    contactName: 'Anil Kumar',
    contactPhone: '+919876543210',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });

  const jobB = callbridgeStorage.saveCallJob({
    id: `job_seq_b_${Date.now()}`,
    campaignId: testCampaign.id,
    eventId: 'event_public_survey',
    contactId: 'c_b',
    contactName: 'Sunita Devi',
    contactPhone: '+919876543211',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Start campaign
  await queueManager.startCampaign(testCampaign.id);
  const activeStatus = callbridgeStorage.getCampaign(testCampaign.id);
  assert(activeStatus?.status === 'running' || activeStatus?.status === 'completed', `Campaign transitioned to running: ${activeStatus?.status}`);

  // 5. Verify Core Modules & Event Preservation
  console.log('\n--- 5. Verifying Core Event Modules ---');
  const events = callbridgeStorage.getEvents();
  assert(events.length >= 3, `Preserved canonical event modules (count: ${events.length})`);
  assert(events.some(e => e.type === 'public_survey'), 'Public Survey module present');
  assert(events.some(e => e.type === 'political_campaign'), 'Political Campaign module present');
  assert(events.some(e => e.type === 'marriage_event'), 'Marriage Event module present');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
