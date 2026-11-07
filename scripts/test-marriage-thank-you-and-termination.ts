import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runTestSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: MARRIAGE THANK YOU MESSAGE & AUTOMATIC TERMINATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
      failed++;
      process.exitCode = 1;
    }
  }

  const runId = Date.now();
  const eventId = `evt_marr_term_${runId}`;
  const campaignId = `camp_marr_term_${runId}`;
  const tenantId = `tenant_${runId}`;

  callbridgeStorage.saveTenant({
    id: tenantId,
    name: 'Wedding Host',
    email: 'host@example.com',
    organization: 'Host Family',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const event = callbridgeStorage.saveEvent({
    id: eventId,
    name: 'వివాహ వేడుక - రాజేష్ & సుమలత',
    type: 'marriage_event',
    language: 'te',
    config: {
      approvedScript: 'మా ప్రియమైన రాజేష్ & సుమలత వివాహ మహోత్సవానికి మిమ్మల్ని సాదరంగా ఆహ్వానిస్తున్నాము.',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create 3 contacts for sequential queue testing
  const c1 = callbridgeStorage.saveContact({
    id: `cnt_term_1_${runId}`,
    userId: tenantId,
    eventId,
    name: 'Guest One',
    phone: '+919876543201',
    originalPhone: '+919876543201',
    consentStatus: 'granted',
    optOut: false,
    importSource: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const c2 = callbridgeStorage.saveContact({
    id: `cnt_term_2_${runId}`,
    userId: tenantId,
    eventId,
    name: 'Guest Two',
    phone: '+919876543202',
    originalPhone: '+919876543202',
    consentStatus: 'granted',
    optOut: false,
    importSource: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const c3 = callbridgeStorage.saveContact({
    id: `cnt_term_3_${runId}`,
    userId: tenantId,
    eventId,
    name: 'Guest Three',
    phone: '+919876543203',
    originalPhone: '+919876543203',
    consentStatus: 'granted',
    optOut: false,
    importSource: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const campaign = callbridgeStorage.saveCampaign({
    id: campaignId,
    eventId,
    clientId: tenantId,
    name: 'Wedding RSVP Campaign',
    status: 'running',
    optOutCount: 0,
    totalContacts: 3,
    processedCount: 0,
    callsInitiated: 0,
    answeredCount: 0,
    completedCount: 0,
    unansweredCount: 0,
    failedCount: 0,
    concurrencyLimit: 1,
    activeCalls: 0,
    activeCallId: null,
    activeCallProviderId: null,
    activeCallStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Track logs emitted
  const logsCaptured: { tag: string; data: any }[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    originalLog(...args);
    if (typeof args[0] === 'string' && args[0].startsWith('[MARRIAGE_')) {
      logsCaptured.push({ tag: args[0], data: args[1] });
    }
  };

  // -------------------------------------------------------------------------
  // TEST 1: Check Exact Thank-You Message Configuration
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Thank-You Message Configuration ---');
  const queueInstructions = (queueManager as any).getAssistantSystemPrompt('marriage_event', 'te', event);
  assert(
    queueInstructions.includes('"సరే, ధన్యవాదాలు."'),
    'Prompt contains exact thank-you phrase "సరే, ధన్యవాదాలు."'
  );
  assert(
    !queueInstructions.includes('మీ సమాధానాన్ని నమోదు చేసుకున్నాము'),
    'Prompt strictly does NOT contain old phrase "మీ సమాధానాన్ని నమోదు చేసుకున్నాము"'
  );

  // -------------------------------------------------------------------------
  // TEST 2: Case 1 - ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Case 1 - ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect ---');
  const call1Uuid = `01a1a6fd-0001-7000-8cc3-${runId.toString(16).slice(-12)}`;
  const job1Id = `job_term_1_${runId}`;

  callbridgeStorage.saveCallJob({
    id: job1Id,
    campaignId,
    eventId,
    contactId: c1.id,
    contactName: c1.name,
    contactPhone: c1.phone,
    status: 'calling',
    providerCallId: call1Uuid,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      controlUrl: 'https://api.vapi.ai/call/control/mock-test-1',
      controlAuthenticationEnabled: false,
    },
  });

  VapiService.activeCallControls.set(call1Uuid, {
    controlUrl: 'https://api.vapi.ai/call/control/mock-test-1',
    controlAuthenticationEnabled: false,
  });

  VapiService.registerTransientActiveCall(call1Uuid, {
    campaignId,
    jobId: job1Id,
    eventId,
    phone: c1.phone,
  });

  VapiService.initMarriageCallState(call1Uuid);
  let s1 = VapiService.getMarriageCallState(call1Uuid);
  assert(s1.state === 'STATE_1_INVITATION', 'Initial state is STATE_1_INVITATION');

  // Invitation finishes playback
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: call1Uuid },
    },
  });
  s1 = VapiService.getMarriageCallState(call1Uuid);
  assert(s1.state === 'STATE_2_WAITING_FOR_RSVP', 'Transitioned to STATE_2_WAITING_FOR_RSVP');

  // Guest responds: "హా, వస్తాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'హా, వస్తాను',
      call: { id: call1Uuid },
    },
  });
  s1 = VapiService.getMarriageCallState(call1Uuid);
  assert(s1.state === 'STATE_4_THANK_YOU', 'RSVP classified -> moved to STATE_4_THANK_YOU');
  assert(s1.rsvpCategory === 'ATTENDING', 'RSVP category is ATTENDING');

  // Verify aggregate saved exactly once
  const campMetrics1 = callbridgeStorage.getAggregateAnalytics(campaignId);
  assert(campMetrics1.marriageEvent?.attendingCount === 1, 'Attending count incremented to 1');

  // Assistant begins saying "సరే, ధన్యవాదాలు."
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
      call: { id: call1Uuid },
    },
  });

  const thankYouStartedLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_THANK_YOU_STARTED]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(thankYouStartedLog1), '[MARRIAGE_THANK_YOU_STARTED] logged');
  assert(thankYouStartedLog1?.data.status === 'started', 'Log contains status: started');
  assert(thankYouStartedLog1?.data.campaignId === campaignId, 'Log contains correct campaignId');

  // Audio playback finishes (speech-update: stopped)
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: call1Uuid },
    },
  });

  // Allow async termination microtask to execute
  await new Promise((resolve) => setTimeout(resolve, 80));

  const playbackCompletedLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(playbackCompletedLog1), '[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED] logged');
  assert(playbackCompletedLog1?.data.status === 'playback_completed', 'Log contains status: playback_completed');

  const endCallRequestedLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_END_CALL_REQUESTED]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(endCallRequestedLog1), '[MARRIAGE_END_CALL_REQUESTED] logged');

  const endCallSuccessLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_END_CALL_API_SUCCESS]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(endCallSuccessLog1), '[MARRIAGE_END_CALL_API_SUCCESS] logged');

  const providerTermLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_PROVIDER_CALL_TERMINATED]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(providerTermLog1), '[MARRIAGE_PROVIDER_CALL_TERMINATED] logged');

  // Terminal webhook arrives from provider
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      call: { id: call1Uuid, status: 'ended', durationSeconds: 22 },
    },
  });

  const termConfirmedLog1 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_CALL_TERMINATION_CONFIRMED]' && l.data.providerCallId === call1Uuid
  );
  assert(Boolean(termConfirmedLog1), '[MARRIAGE_CALL_TERMINATION_CONFIRMED] logged');
  assert(termConfirmedLog1?.data.status === 'confirmed_ended', 'Log status is confirmed_ended');

  const camp1After = callbridgeStorage.getCampaign(campaignId);
  assert((camp1After?.processedCount || 0) >= 1, 'Finished Calls incremented on campaign');

  // -------------------------------------------------------------------------
  // TEST 3: Case 2 - NOT_ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Case 2 - NOT_ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect ---');
  const call2Uuid = `01a1a6fd-0002-7000-8cc3-${runId.toString(16).slice(-12)}`;
  const job2Id = `job_term_2_${runId}`;

  callbridgeStorage.saveCallJob({
    id: job2Id,
    campaignId,
    eventId,
    contactId: c2.id,
    contactName: c2.name,
    contactPhone: c2.phone,
    status: 'calling',
    providerCallId: call2Uuid,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      controlUrl: 'https://api.vapi.ai/call/control/mock-test-2',
      controlAuthenticationEnabled: false,
    },
  });

  VapiService.activeCallControls.set(call2Uuid, {
    controlUrl: 'https://api.vapi.ai/call/control/mock-test-2',
    controlAuthenticationEnabled: false,
  });

  VapiService.registerTransientActiveCall(call2Uuid, {
    campaignId,
    jobId: job2Id,
    eventId,
    phone: c2.phone,
  });

  VapiService.initMarriageCallState(call2Uuid);

  // Guest responds: "లేదు, రాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'లేదు, రాను',
      call: { id: call2Uuid },
    },
  });

  let s2 = VapiService.getMarriageCallState(call2Uuid);
  assert(s2.state === 'STATE_4_THANK_YOU', 'RSVP NOT_ATTENDING classified -> moved to STATE_4_THANK_YOU');
  assert(s2.rsvpCategory === 'NOT_ATTENDING', 'RSVP category is NOT_ATTENDING');

  // Assistant speaks thank you
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
      call: { id: call2Uuid },
    },
  });

  // Assistant audio stopped
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: call2Uuid },
    },
  });

  // Allow async termination microtask to execute
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Terminal status-update
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      call: { id: call2Uuid, status: 'ended', durationSeconds: 20 },
    },
  });

  const termConfirmedLog2 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_CALL_TERMINATION_CONFIRMED]' && l.data.providerCallId === call2Uuid
  );
  assert(Boolean(termConfirmedLog2), 'Call 2 termination confirmed');

  const campMetrics2 = callbridgeStorage.getAggregateAnalytics(campaignId);
  assert(campMetrics2.marriageEvent?.attendingCount === 1, 'Attending count remains 1');
  assert(campMetrics2.marriageEvent?.notAttendingCount === 1, 'Not attending count incremented to 1');

  // -------------------------------------------------------------------------
  // TEST 4: Case 3 - MAYBE_ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Case 3 - MAYBE_ATTENDING -> "సరే, ధన్యవాదాలు." -> Automatic Disconnect ---');
  const call3Uuid = `01a1a6fd-0003-7000-8cc3-${runId.toString(16).slice(-12)}`;
  const job3Id = `job_term_3_${runId}`;

  callbridgeStorage.saveCallJob({
    id: job3Id,
    campaignId,
    eventId,
    contactId: c3.id,
    contactName: c3.name,
    contactPhone: c3.phone,
    status: 'calling',
    providerCallId: call3Uuid,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      controlUrl: 'https://api.vapi.ai/call/control/mock-test-3',
      controlAuthenticationEnabled: false,
    },
  });

  VapiService.activeCallControls.set(call3Uuid, {
    controlUrl: 'https://api.vapi.ai/call/control/mock-test-3',
    controlAuthenticationEnabled: false,
  });

  VapiService.registerTransientActiveCall(call3Uuid, {
    campaignId,
    jobId: job3Id,
    eventId,
    phone: c3.phone,
  });

  VapiService.initMarriageCallState(call3Uuid);

  // Guest responds: "చూస్తాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'చూస్తాను',
      call: { id: call3Uuid },
    },
  });

  let s3 = VapiService.getMarriageCallState(call3Uuid);
  assert(s3.state === 'STATE_4_THANK_YOU', 'RSVP MAYBE_ATTENDING classified -> moved to STATE_4_THANK_YOU');
  assert(s3.rsvpCategory === 'MAYBE_ATTENDING', 'RSVP category is MAYBE_ATTENDING');

  // Assistant speaks thank you
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
      call: { id: call3Uuid },
    },
  });

  // Assistant audio stopped
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: call3Uuid },
    },
  });

  // Allow async termination microtask to execute
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Terminal status-update
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      call: { id: call3Uuid, status: 'ended', durationSeconds: 21 },
    },
  });

  const termConfirmedLog3 = logsCaptured.find(
    (l) => l.tag === '[MARRIAGE_CALL_TERMINATION_CONFIRMED]' && l.data.providerCallId === call3Uuid
  );
  assert(Boolean(termConfirmedLog3), 'Call 3 termination confirmed');

  const campMetrics3 = callbridgeStorage.getAggregateAnalytics(campaignId);
  assert(campMetrics3.marriageEvent?.attendingCount === 1, 'Final Attending count is 1');
  assert(campMetrics3.marriageEvent?.notAttendingCount === 1, 'Final Not Attending count is 1');
  assert(campMetrics3.marriageEvent?.maybeAttendingCount === 1, 'Final Maybe Attending count is 1');

  // -------------------------------------------------------------------------
  // TEST 5: Verify Diagnostic Log Signatures & Zero PII
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Verify Diagnostic Log Signatures & Zero PII ---');
  const requiredTags = [
    '[MARRIAGE_THANK_YOU_STARTED]',
    '[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED]',
    '[MARRIAGE_END_CALL_REQUESTED]',
    '[MARRIAGE_END_CALL_API_SUCCESS]',
    '[MARRIAGE_PROVIDER_CALL_TERMINATED]',
    '[MARRIAGE_CALL_TERMINATION_CONFIRMED]',
  ];

  for (const tag of requiredTags) {
    const found = logsCaptured.filter((l) => l.tag === tag);
    assert(found.length > 0, `Log ${tag} was emitted`);
    for (const item of found) {
      assert(typeof item.data.campaignId === 'string', `${tag} contains campaignId`);
      assert(typeof item.data.providerCallId === 'string', `${tag} contains providerCallId`);
      assert(typeof item.data.status === 'string', `${tag} contains status`);
      assert(!('transcript' in item.data), `${tag} contains zero transcript`);
      assert(!('phone' in item.data), `${tag} contains zero phone number`);
      assert(!('name' in item.data), `${tag} contains zero contact name`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 6: Regression Check: Political Campaign DTMF remains untouched
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Regression Check - Political Campaign DTMF ---');
  const polEventId = `evt_pol_regr_${runId}`;
  const polCampId = `camp_pol_regr_${runId}`;
  const polCallId = `01a1a6fd-9999-7000-8cc3-${runId.toString(16).slice(-12)}`;
  const polJobId = `job_pol_regr_${runId}`;

  callbridgeStorage.saveEvent({
    id: polEventId,
    name: 'Election Campaign',
    type: 'political_campaign',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCampaign({
    id: polCampId,
    eventId: polEventId,
    clientId: tenantId,
    name: 'Political Wave 1',
    status: 'running',
    optOutCount: 0,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    concurrencyLimit: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCallJob({
    id: polJobId,
    campaignId: polCampId,
    eventId: polEventId,
    contactId: 'cnt_pol',
    contactName: 'Voter',
    contactPhone: '+919876543299',
    status: 'in_progress',
    providerCallId: polCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      controlUrl: 'https://api.vapi.ai/call/control/mock-pol',
    },
  });

  VapiService.activeCallControls.set(polCallId, {
    controlUrl: 'https://api.vapi.ai/call/control/mock-pol',
  });

  VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: polCallId },
      toolCalls: [{ function: { name: 'dtmf', arguments: { digit: '1' } } }],
    },
  });

  const polAgg = callbridgeStorage.getAggregateAnalytics(polCampId);
  assert(polAgg.politicalCampaign?.keypad1Count === 1, 'Political DTMF 1 counter incremented accurately');

  console.log = originalLog;
  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} / ${passed + failed} ASSERTIONS PASSED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error('Test script crashed:', e);
  process.exit(1);
});
