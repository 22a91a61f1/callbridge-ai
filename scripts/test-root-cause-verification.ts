import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { normalizeTeluguPronunciation, classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary.ts';
import { callbridgeStorage, type CallJobRecord } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';

async function runRootCauseVerification() {
  console.log('====================================================');
  console.log('CALLBRIDGE AI — ROOT CAUSE VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  // -----------------------------------------------------------------
  // PRIORITY 1: EXACT SAME ELEVENLABS CLONED VOICE IN PREVIEW & CALLS
  // -----------------------------------------------------------------
  console.log('--- TEST GROUP 1: ELEVENLABS CLONED VOICE PIPELINE ALIGNMENT ---');

  const defaultVoiceId = ElevenLabsService.resolveVoiceId();
  assert(defaultVoiceId === 'Txde0pZ5tVhXE6HUspcf', `Default voice ID is ${defaultVoiceId}`);

  // Test resolution of model: eleven_v4_turbo
  const resolvedPreviewModel = ElevenLabsService.resolveModel('eleven_v4_turbo');
  assert(resolvedPreviewModel === 'eleven_v4_turbo', `Preview model resolves to eleven_v4_turbo (got: ${resolvedPreviewModel})`);

  // Ensure eleven_multilingual_v2 is converted to eleven_v4_turbo for authentic Telugu
  const autoUpgradedModel = ElevenLabsService.resolveModel('eleven_multilingual_v2');
  assert(autoUpgradedModel === 'eleven_v4_turbo', `Legacy eleven_multilingual_v2 automatically upgrades to eleven_v4_turbo (got: ${autoUpgradedModel})`);

  // Verify voice profile storage matches preview fidelity
  const savedProfile = callbridgeStorage.getVoiceProfile(defaultVoiceId);
  assert(Boolean(savedProfile), 'Voice profile Txde0pZ5tVhXE6HUspcf exists in storage');
  assert(savedProfile?.modelId === 'eleven_v4_turbo', `Voice profile modelId is eleven_v4_turbo (got: ${savedProfile?.modelId})`);
  assert(savedProfile?.speed === 1.0, `Voice profile speed is 1.0 (got: ${savedProfile?.speed})`);
  assert(savedProfile?.stability === 0.50, `Voice profile stability is 0.50 (got: ${savedProfile?.stability})`);
  assert(savedProfile?.similarityBoost === 0.85, `Voice profile similarityBoost is 0.85 (got: ${savedProfile?.similarityBoost})`);

  // Verify Telugu greeting pronunciation normalization without unnatural syllable stretching or pauses
  const rawGreeting = 'నమస్కారం! బాగున్నారా?';
  const normResult = normalizeTeluguPronunciation(rawGreeting);
  assert(!normResult.normalizedText.includes('నమ-స్కారం'), 'Greeting is not hyphenated or split');
  assert(normResult.normalizedText.includes('నమస్కారం'), 'Preserves authentic Telugu spelling');
  console.log(`[VERIFIED] Normalized Telugu greeting: "${normResult.normalizedText}"`);

  // -----------------------------------------------------------------
  // PRIORITY 2: POLITICAL CAMPAIGN IMMEDIATE DTMF TERMINATION
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: POLITICAL CAMPAIGN SEQUENTIAL CALLING & DTMF VERIFICATION (TESTS A-I) ---');

  const politicalEventId = 'test_political_event_' + Date.now();
  callbridgeStorage.saveEvent({
    id: politicalEventId,
    name: 'Test Political Campaign',
    type: 'political_campaign',
    language: 'te',
    selectedVoiceProfileId: defaultVoiceId,
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Mock controlUrl capture
  const mockCallId = 'test_call_pol_1_' + Date.now();
  const mockControlUrl = 'https://api.vapi.ai/call-control/mock-123';
  VapiService.activeCallControls.set(mockCallId, { controlUrl: mockControlUrl, controlAuthenticationEnabled: false });

  const polJob1: CallJobRecord = {
    id: mockCallId,
    campaignId: 'camp_pol_test',
    contactId: 'cnt_1',
    eventId: politicalEventId,
    contactName: 'Test Voter 1',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: mockCallId,
    retryCount: 0,
    maxRetries: 2,
    metadata: { controlUrl: mockControlUrl },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(polJob1);

  // TEST A: DTMF digit 1 triggers immediate backend call termination
  const webhookResult1 = VapiService.handleWebhook({
    type: 'status-update',
    call: { id: mockCallId, status: 'in-progress', monitor: { controlUrl: mockControlUrl } },
    digits: '1',
  });
  assert(webhookResult1.success === true, 'TEST A: Webhook handled DTMF 1');

  // Verify call completed and aggregate updated
  const polMetrics1 = callbridgeStorage.getAggregateAnalytics(politicalEventId);
  assert(polMetrics1.politicalCampaign?.keypad1Count === 1, `TEST A: keypad1Count incremented to 1 (got: ${polMetrics1.politicalCampaign?.keypad1Count})`);

  // TEST B: DTMF digit 2 triggers immediate backend call termination
  const mockCallId2 = 'test_call_pol_2_' + Date.now();
  const polJob2: CallJobRecord = {
    id: mockCallId2,
    campaignId: 'camp_pol_test',
    contactId: 'cnt_2',
    eventId: politicalEventId,
    contactName: 'Test Voter 2',
    contactPhone: '+919876543211',
    status: 'in_progress',
    providerCallId: mockCallId2,
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(polJob2);

  VapiService.handleWebhook({
    type: 'status-update',
    call: { id: mockCallId2, status: 'in-progress' },
    digits: '2',
  });

  const polMetrics2 = callbridgeStorage.getAggregateAnalytics(politicalEventId);
  assert(polMetrics2.politicalCampaign?.keypad2Count === 1, `TEST B: keypad2Count incremented to 1 (got: ${polMetrics2.politicalCampaign?.keypad2Count})`);

  // TEST C: Handset RFC2833 / provider telephone-event compatibility (Twilio Digits / Vapi message.dtmf)
  const mockCallIdC = 'test_call_pol_c_' + Date.now();
  const polJobC: CallJobRecord = {
    id: mockCallIdC,
    campaignId: 'camp_pol_test',
    contactId: 'cnt_c',
    eventId: politicalEventId,
    contactName: 'Test Voter C',
    contactPhone: '+919876543215',
    status: 'in_progress',
    providerCallId: mockCallIdC,
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(polJobC);

  // Twilio / RFC2833 telephone-event webhook format
  VapiService.handleWebhook({
    type: 'speech-update',
    call: { id: mockCallIdC, status: 'in-progress' },
    Digits: '1',
  });
  const polMetricsC = callbridgeStorage.getAggregateAnalytics(politicalEventId);
  assert(polMetricsC.politicalCampaign?.keypad1Count === 2, `TEST C: In-band/out-of-band RFC2833 Digits captured (got: ${polMetricsC.politicalCampaign?.keypad1Count})`);

  // TEST D: Non-terminating digits (digit 7) and silence do NOT terminate call
  const mockCallId3 = 'test_call_pol_3_' + Date.now();
  const polJob3: CallJobRecord = {
    id: mockCallId3,
    campaignId: 'camp_pol_test',
    contactId: 'cnt_3',
    eventId: politicalEventId,
    contactName: 'Test Voter 3',
    contactPhone: '+919876543212',
    status: 'in_progress',
    providerCallId: mockCallId3,
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(polJob3);

  VapiService.handleWebhook({
    type: 'status-update',
    call: { id: mockCallId3, status: 'in-progress' },
    digits: '7',
  });

  const checkJob3 = callbridgeStorage.getCallJob(mockCallId3);
  assert(checkJob3?.status === 'in_progress', 'TEST D: Call with digit 7 is NOT terminated and remains in_progress');

  // TEST E: Strict sequential calling: strictly 1 call at a time; when call ends, queue advances
  const seqCampId = 'camp_seq_test_' + Date.now();
  callbridgeStorage.saveCampaign({
    id: seqCampId,
    eventId: politicalEventId,
    clientId: 'client_001',
    name: 'Sequential Calling Test Campaign',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const seqJob1: CallJobRecord = {
    id: 'seq_job_1_' + Date.now(),
    campaignId: seqCampId,
    contactId: 'cnt_seq_1',
    eventId: politicalEventId,
    contactName: 'Sequential Contact 1',
    contactPhone: '+919876543291',
    status: 'in_progress',
    providerCallId: 'seq_job_1_' + Date.now(),
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date(Date.now() - 5000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const seqJob2: CallJobRecord = {
    id: 'seq_job_2_' + Date.now(),
    campaignId: seqCampId,
    contactId: 'cnt_seq_2',
    eventId: politicalEventId,
    contactName: 'Sequential Contact 2',
    contactPhone: '+919876543292',
    status: 'pending',
    providerCallId: 'seq_job_2_' + Date.now(),
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(seqJob1);
  callbridgeStorage.saveCallJob(seqJob2);

  // When job 1 is in_progress, processNext will not dispatch job 2 (strict concurrency = 1)
  queueManager.processNext(seqCampId);
  const checkSeqJob2Before = callbridgeStorage.getCallJob(seqJob2.id);
  assert(checkSeqJob2Before?.status === 'pending', 'TEST E: Strict concurrency limit: second contact remains pending while first call is in progress');

  // TEST F: Prevent duplicate calls when webhooks arrive multiple times (idempotency)
  // Simulate duplicate end-of-call webhook for seqJob1
  const dupWebhook1 = VapiService.handleWebhook({
    type: 'end-of-call-report',
    call: { id: seqJob1.id, status: 'ended' },
    endedReason: 'customer-ended-call',
  });
  assert(dupWebhook1.success === true, 'TEST F: Initial end-of-call webhook handled');

  const dupWebhook2 = VapiService.handleWebhook({
    type: 'end-of-call-report',
    call: { id: seqJob1.id, status: 'ended' },
    endedReason: 'customer-ended-call',
  });
  assert(dupWebhook2.success === true, 'TEST F: Duplicate webhook processed idempotently without error');

  // Also verify duplicate contact deduplication in queueManager
  const dupContact = {
    id: 'cnt_dup_1',
    eventId: politicalEventId,
    clientId: 'client_001',
    userId: 'client_001',
    name: 'Voter X',
    phone: '+919876543292',
    originalPhone: '+919876543292',
    importSource: 'manual' as const,
    optOut: false,
    consentStatus: 'granted' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveContact(dupContact);
  const createdJobs = queueManager.createCampaignJobs(seqCampId, politicalEventId, ['cnt_dup_1']);
  assert(createdJobs.length === 0, 'TEST F: createCampaignJobs prevented duplicate call to phone number already in queue');

  // Clean up test sequence jobs
  callbridgeStorage.deleteCallJob(seqJob2.id);

  // TEST G: Aggregate percentages calculation with accurate denominators
  // Total calls = 3 answered (mockCallId, mockCallId2, mockCallIdC)
  // Answered % = answered / total = 3/3 = 100%
  // Keypad 1 % = 2 / 3 answered = 67%
  // Keypad 2 % = 1 / 3 answered = 33%
  const exportAnalytics = ExportService.exportAnalyticsJson(politicalEventId);
  assert(exportAnalytics.essentialMetrics.callsAttended === 3, `TEST G: callsAttended is 3 (got: ${exportAnalytics.essentialMetrics.callsAttended})`);
  assert(exportAnalytics.moduleSpecificMetrics.politicalCampaign.pressed1Percent === 67, `TEST G: Keypad 1 % is 67% based on answered calls (got: ${exportAnalytics.moduleSpecificMetrics.politicalCampaign.pressed1Percent}%)`);
  assert(exportAnalytics.moduleSpecificMetrics.politicalCampaign.pressed2Percent === 33, `TEST G: Keypad 2 % is 33% based on answered calls (got: ${exportAnalytics.moduleSpecificMetrics.politicalCampaign.pressed2Percent}%)`);

  // TEST H: Zero-PII retention for Political Campaign: completed jobs are deleted
  const purgedJob1 = callbridgeStorage.getCallJob(mockCallId);
  assert(purgedJob1 === undefined, 'TEST H: Completed political campaign call job record is purged from storage');

  // Clean up test in-progress job 3
  callbridgeStorage.deleteCallJob(mockCallId3);

  // TEST I: Verify Public Survey & Marriage Event remain untouched
  const pubSurveyEventId = 'test_pub_survey_' + Date.now();
  callbridgeStorage.saveEvent({
    id: pubSurveyEventId,
    name: 'Public Citizen Survey',
    type: 'public_survey',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const pubJob1: CallJobRecord = {
    id: 'pub_job_1_' + Date.now(),
    campaignId: 'camp_pub_test',
    contactId: 'cnt_pub_1',
    eventId: pubSurveyEventId,
    contactName: 'Public Citizen 1',
    contactPhone: '+919876543299',
    status: 'in_progress',
    providerCallId: 'pub_job_1_' + Date.now(),
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(pubJob1);

  // Complete public survey job: non-political jobs MUST be retained in storage (anonymized for privacy, not deleted)
  pubJob1.status = 'completed';
  callbridgeStorage.saveCallJob(pubJob1);
  const preservedPubJob = callbridgeStorage.getCallJob(pubJob1.id);
  assert(preservedPubJob !== undefined, 'TEST I: Public survey completed call record is preserved in storage (not deleted)');
  assert(preservedPubJob?.status === 'completed', 'TEST I: Public survey completed status preserved');
  callbridgeStorage.deleteCallJob(pubJob1.id);

  // -----------------------------------------------------------------
  // PRIORITY 3: MARRIAGE EVENT SPOKEN RSVP CLASSIFICATION
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: MARRIAGE EVENT NATURAL SPOKEN RSVP ---');

  // Test Telugu spoken classification
  const spokenYes1 = classifyMarriageRsvp('తప్పకుండా వస్తాము అండి! పెళ్లికి వస్తున్నాం');
  assert(spokenYes1 === 'ATTENDING', `Correctly classified spoken ATTENDING (got: ${spokenYes1})`);

  const spokenNo1 = classifyMarriageRsvp('క్షమించండి, ఆ రోజు రాలేము కుదరదు');
  assert(spokenNo1 === 'NOT_ATTENDING', `Correctly classified spoken NOT_ATTENDING (got: ${spokenNo1})`);

  const spokenMaybe1 = classifyMarriageRsvp('చూద్దాం అండి, సమయం కుదిరితే ప్రయత్నిస్తాం');
  assert(spokenMaybe1 === 'MAYBE_ATTENDING', `Correctly classified spoken MAYBE_ATTENDING (got: ${spokenMaybe1})`);

  // Test Marriage Event webhook spoken transcript processing
  const marriageEventId = 'test_marriage_event_' + Date.now();
  callbridgeStorage.saveEvent({
    id: marriageEventId,
    name: 'Test Wedding Celebration',
    type: 'marriage_event',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const mrgCallId1 = 'test_mrg_call_1_' + Date.now();
  const mrgJob1: CallJobRecord = {
    id: mrgCallId1,
    campaignId: 'camp_mrg_test',
    contactId: 'cnt_mrg_1',
    eventId: marriageEventId,
    contactName: 'Family Friend 1',
    contactPhone: '+919876543220',
    status: 'in_progress',
    providerCallId: mrgCallId1,
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(mrgJob1);

  // Spoken YES webhook
  VapiService.handleWebhook({
    type: 'transcript',
    call: { id: mrgCallId1 },
    role: 'user',
    transcript: 'తప్పకుండా వస్తామండి కుటుంబంతో సహా వస్తాము',
  });

  // End call report
  VapiService.handleWebhook({
    type: 'end-of-call-report',
    call: { id: mrgCallId1, duration: 25, endedReason: 'completed' },
  });

  const mrgMetrics1 = callbridgeStorage.getAggregateAnalytics(marriageEventId);
  assert(mrgMetrics1.marriageEvent?.attendingCount === 1, `Marriage attendingCount is 1 (got: ${mrgMetrics1.marriageEvent?.attendingCount})`);
  assert(mrgMetrics1.marriageEvent?.attendingPercent === 100, `Marriage attendingPercent is 100% (got: ${mrgMetrics1.marriageEvent?.attendingPercent}%)`);

  // -----------------------------------------------------------------
  // PRIORITY 4: STRICT AGGREGATE-ONLY DATA RETENTION & PRIVACY WIPE
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: ZERO-PII DATA RETENTION & AGGREGATE ISOLATION ---');

  // Inspect mrgJob1 in storage: personal data MUST be sanitized
  const storedJob = callbridgeStorage.getCallJob(mrgCallId1);
  assert(storedJob !== undefined, 'Stored job exists');
  assert(storedJob?.contactName === 'Anonymized Respondent', `contactName is anonymized (got: "${storedJob?.contactName}")`);
  assert(storedJob?.contactPhone === '***', `contactPhone is masked (got: "${storedJob?.contactPhone}")`);
  assert(!storedJob?.transcript || storedJob.transcript.length === 0, 'No individual conversation transcript stored');

  // Verify export CSV contains NO personal names or numbers
  const exportCsv = ExportService.exportCallHistoryCsv(marriageEventId);
  assert(!exportCsv.includes('+919876543220'), 'CSV export does NOT contain respondent phone number');
  assert(!exportCsv.includes('Family Friend 1'), 'CSV export does NOT contain respondent name');
  assert(exportCsv.includes('Attending'), 'CSV export contains aggregate metrics');

  // Verify export JSON contains NO personal names or numbers
  const exportJson = ExportService.exportAnalyticsJson(marriageEventId);
  assert(exportJson.dataRetentionPolicy.individualDataRetained === false, 'Data retention policy confirms zero individual data retention');
  assert(exportJson.essentialMetrics.totalCallsMade === 1, 'Total calls made is 1');

  // Verify zero-division safety
  const emptyEventId = 'test_empty_event_' + Date.now();
  const emptyMetrics = callbridgeStorage.getAggregateAnalytics(emptyEventId);
  assert(emptyMetrics.answerRatePercent === 0, 'Zero-division safe: 0% for answer rate');
  assert(emptyMetrics.completionRatePercent === 0, 'Zero-division safe: 0% for completion rate');

  // Verify deduplication: calling recordEventCallOutcome twice for same call ID doesn't double count
  callbridgeStorage.recordEventCallOutcome(marriageEventId, {
    callId: mrgCallId1,
    eventType: 'marriage_event',
    marriageRsvp: 'YES',
    durationSeconds: 25,
    isAnswered: true,
  });
  const dedupMetrics = callbridgeStorage.getAggregateAnalytics(marriageEventId);
  assert(dedupMetrics.totalCalls === 1, 'Deduplication preserved: totalCalls remains 1 after duplicate call outcome');

  // -----------------------------------------------------------------
  // PRIORITY 5: TESTING MODE & UPGRADE PAGE ACCURACY
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: TESTING MODE & UPGRADE PLAN ISOLATION ---');

  const testUsage = callbridgeStorage.getTestingModeUsage('client_001');
  assert(testUsage.active === true, 'Testing mode is active for client_001');
  assert(testUsage.completedTestCalls >= 2, `Completed test calls accurately counted from records (got: ${testUsage.completedTestCalls})`);

  // Verify internal test call eligibility does not force paid upgrade
  const testEligibility = callbridgeStorage.checkCallEligibility('client_001', true);
  assert(testEligibility.allowed === true, 'Internal test call is allowed');
  assert(testEligibility.upgradeRequired === false, 'Internal test call does not require paid upgrade');

  // Verify internal test call billing does NOT deduct paid credits
  const subBefore = callbridgeStorage.getSubscription('client_001');
  const initialRemaining = subBefore.remainingSeconds;

  callbridgeStorage.recordCallBilling({
    userId: 'client_001',
    callId: 'test_phone_call_internal_check',
    eventId: politicalEventId,
    status: 'completed',
    durationSeconds: 45,
    isTestCall: true,
  });

  const subAfter = callbridgeStorage.getSubscription('client_001');
  assert(subAfter.remainingSeconds === initialRemaining, `Paid seconds NOT deducted for test call (${subAfter.remainingSeconds}s vs ${initialRemaining}s)`);
  assert(subAfter.planStatus === 'active', `Plan status remains active and unchanged (${subAfter.planStatus})`);
  assert(subAfter.planId === 'free', `Plan ID is unchanged without auto-activating Pro (${subAfter.planId})`);

  console.log(`\n====================================================`);
  console.log(`ALL TESTS PASSED: ${passed}/${total} assertions succeeded!`);
  console.log(`====================================================`);
}

runRootCauseVerification().catch((err) => {
  console.error('\n[FATAL ERROR IN TEST SUITE]', err);
  process.exit(1);
});
