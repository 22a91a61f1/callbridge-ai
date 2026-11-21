import assert from 'assert';
import { ElevenLabsService, resolveVoiceId, ACTIVE_RISHI_CLONED_VOICE_ID } from '../server/voice/elevenLabsService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';

async function runPipelineFixTests() {
  console.log('================================================================');
  console.log('TESTING ELEVENLABS & VAPI PIPELINE ROOT-CAUSE FIX');
  console.log('================================================================');

  // Test 1: Voice ID resolution for all variations
  console.log('\n--- 1. Testing Voice ID Resolution ---');
  
  // Stale/legacy IDs
  const r1 = ElevenLabsService.resolveVoiceId('WKyArUrP6hdAVp2kHYkw');
  assert.strictEqual(r1, ACTIVE_RISHI_CLONED_VOICE_ID, 'Legacy WKyArUrP6hdAVp2kHYkw must map to active Rishi cloned voice');

  const r2 = ElevenLabsService.resolveVoiceId('AZnzlk1XvdvUeBnXmlld');
  assert.strictEqual(r2, ACTIVE_RISHI_CLONED_VOICE_ID, 'Legacy AZnzlk1XvdvUeBnXmlld must map to active Rishi cloned voice');

  const r3 = ElevenLabsService.resolveVoiceId('5IASxvpUK3p2EFjhO3pn');
  assert.strictEqual(r3, ACTIVE_RISHI_CLONED_VOICE_ID, 'Legacy 5IASxvpUK3p2EFjhO3pn must map to active Rishi cloned voice');

  // Internal profile IDs (vp_...)
  const r4 = ElevenLabsService.resolveVoiceId('vp_rishi_candidate');
  assert.strictEqual(r4, ACTIVE_RISHI_CLONED_VOICE_ID, 'Internal profile ID vp_rishi_candidate must resolve to active cloned voice');

  const r5 = ElevenLabsService.resolveVoiceId('vp_survey_candidate');
  assert.strictEqual(r5, ACTIVE_RISHI_CLONED_VOICE_ID, 'Internal profile ID vp_survey_candidate must resolve to active cloned voice');

  // Mock / dummy IDs
  const r6 = ElevenLabsService.resolveVoiceId('mock_voice_123');
  assert.strictEqual(r6, ACTIVE_RISHI_CLONED_VOICE_ID, 'Mock voice ID must resolve to active cloned voice');

  // Real, distinct ElevenLabs voice ID (e.g. 20-char ID that is not blocked)
  const validCustomId = 'EXAVITQu4vr4xnSDxMaL';
  const r7 = ElevenLabsService.resolveVoiceId(validCustomId);
  assert.strictEqual(r7, validCustomId, 'Valid custom cloned ElevenLabs voice ID must be preserved');

  console.log('[PASS] All voice ID variants resolve to valid ElevenLabs voice IDs without 404 database strings');

  // Test 2: Vapi Assistant Voice Config & Model Verification
  console.log('\n--- 2. Testing Vapi Assistant Voice Config ---');
  
  // Set runtime credentials
  VapiService.setRuntimeConfig(
    'vapi_test_dummy_key_12345678',
    'phone_test_dummy_id_12345678',
    undefined,
    'cred_elevenlabs_linked_98765432'
  );

  const status = VapiService.getConfigStatus();
  assert.strictEqual(status.hasElevenlabsCredential, true, 'Vapi ElevenLabs credential ID must be recognized');
  assert.strictEqual(status.source, 'runtime', 'Config source must be runtime');

  // Verify resolveVapiElevenLabsCredential returns the credential
  const cred = await VapiService.resolveVapiElevenLabsCredential();
  assert.strictEqual(cred, 'cred_elevenlabs_linked_98765432', 'resolveVapiElevenLabsCredential must return configured credentialId');

  console.log('[PASS] Vapi ElevenLabs Credential resolution verified');

  // Test 3: Status Normalization (Early disconnect & pipeline error handling)
  console.log('\n--- 3. Testing Call Status Normalization & Error Capture ---');

  // Create a test call job in storage
  const testJobId = `job_test_failure_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: testJobId,
    clientId: 'client_001',
    campaignId: 'test_camp',
    eventId: 'event_public_survey',
    contactId: 'c_fail_1',
    contactName: 'Ravi',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: 'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc',
    startedAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Simulate Vapi webhook: early disconnection with pipeline error
  const webhookRes = VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      call: {
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc',
        endedReason: 'pipeline-error-elevenlabs-voice-not-found',
        durationSeconds: 1,
      },
    },
  });

  assert.strictEqual(webhookRes.isTerminal, true, 'Webhook must be terminal');
  assert.strictEqual(webhookRes.job.status, 'failed', 'Call with pipeline error must be marked failed, NEVER completed');
  assert(webhookRes.job.failureReason.includes('ElevenLabs pipeline error'), 'Failure reason must mention ElevenLabs pipeline error');

  console.log('[PASS] Pipeline failure correctly classified as failed with technical reason');

  // Simulate Vapi webhook: immediate carrier hangup (< 5s duration and no speech)
  const testJobId2 = `job_test_early_hangup_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: testJobId2,
    clientId: 'client_001',
    campaignId: 'test_camp',
    eventId: 'event_public_survey',
    contactId: 'c_fail_2',
    contactName: 'Suresh',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: 'b2c3d4e5-f6a1-4b2c-9d3e-23456789abcd',
    startedAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const webhookRes2 = VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      call: {
        id: 'b2c3d4e5-f6a1-4b2c-9d3e-23456789abcd',
        endedReason: 'customer-hung-up',
        durationSeconds: 2,
      },
    },
  });

  assert.strictEqual(webhookRes2.job.status, 'failed', 'Immediate hangup with no speech must be marked failed, NOT completed');
  assert(webhookRes2.job.failureReason.includes('immediately after answer'), 'Failure reason must state call disconnected immediately');

  console.log('[PASS] Immediate answer disconnect correctly classified as failed');

  // Test 4: Genuine completed call
  const testJobId3 = `job_test_completed_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: testJobId3,
    clientId: 'client_001',
    campaignId: 'test_camp',
    eventId: 'event_public_survey',
    contactId: 'c_complete',
    contactName: 'Narayana',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: 'c3d4e5f6-a1b2-4c3d-ae4f-3456789abcde',
    startedAt: new Date().toISOString(),
    transcript: [{ role: 'agent', text: 'నమస్కారం! ప్రజా సర్వే కోసం మాట్లాడుతున్నాం.', timestamp: new Date().toISOString() }],
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const webhookRes3 = VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      call: {
        id: 'c3d4e5f6-a1b2-4c3d-ae4f-3456789abcde',
        endedReason: 'assistant-ended-call',
        durationSeconds: 45,
      },
    },
  });

  assert.strictEqual(webhookRes3.job.status, 'completed', 'Genuine completed call must be completed');
  assert.strictEqual(webhookRes3.job.failureReason, undefined, 'Successful call must have no failureReason');

  console.log('[PASS] Genuine completed call with speech correctly classified as completed');

  console.log('\n================================================================');
  console.log('ALL PIPELINE ROOT-CAUSE FIX TESTS PASSED 100%!');
  console.log('================================================================');
}

runPipelineFixTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
