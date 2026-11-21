import { callbridgeStorage, type ContactRecord } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runPoliticalQueueAndDtmfTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — POLITICAL CAMPAIGN QUEUE, DTMF & ZERO-PII TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error('       Details:', details);
    }
  }

  // 1. SETUP TEST EVENT & CAMPAIGN
  const eventId = `test_evt_political_${Date.now()}`;
  const campaignId = `test_camp_political_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: eventId,
    name: 'Jana Sena 2026 Campaign',
    type: 'political_campaign',
    language: 'te',
    config: {
      approvedScript: 'నమస్కారం! జనసేన పార్టీ అభ్యర్థికి మద్దతు తెలపడానికి కీప్యాడ్ 1 నొక్కండి.',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate', spokenPrompt: { te: 'మద్దతు', hi: 'समर्थन', en: 'Support' } },
        { digit: '2', labelEn: 'Request Callback', spokenPrompt: { te: 'కాల్ బ్యాక్', hi: 'कॉल बैक', en: 'Callback' } },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const contacts: ContactRecord[] = [
    {
      id: `cnt_p1_${Date.now()}`,
      userId: 'client_001',
      eventId,
      name: 'Voter One',
      phone: '+919876543210',
      originalPhone: '+919876543210',
      consentStatus: 'granted' as const,
      optOut: false,
      importSource: 'manual' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: `cnt_p2_${Date.now()}`,
      userId: 'client_001',
      eventId,
      name: 'Voter Two',
      phone: '+919876543211',
      originalPhone: '+919876543211',
      consentStatus: 'granted' as const,
      optOut: false,
      importSource: 'manual' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  callbridgeStorage.saveContactsBulk(contacts);

  callbridgeStorage.saveCampaign({
    id: campaignId,
    clientId: 'client_001',
    eventId,
    name: 'Constituency Outreach Batch',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: contacts.length,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const jobs = queueManager.createCampaignJobs(campaignId, eventId, contacts.map((c) => c.id));
  assert(jobs.length === 2, 'QueueManager enqueues 2 contacts in draft campaign', { jobsCount: jobs.length });

  // 2. TEST DTMF KEYPAD DIGIT EXTRACTION
  const directDtmfEvent = { message: { type: 'conversation-update', dtmf: '1' } };
  const transcriptDigitEvent = { message: { type: 'transcript', transcript: '1', role: 'user' } };
  const shortSpokenEvent = { message: { type: 'transcript', transcript: '2', role: 'user' } };
  const nonDigitEvent = { message: { type: 'transcript', transcript: 'నమస్కారం అండి', role: 'user' } };

  assert(VapiService.extractKeypadDigit(directDtmfEvent) === '1', 'extractKeypadDigit extracts direct DTMF "1"');
  assert(VapiService.extractKeypadDigit(transcriptDigitEvent) === '1', 'extractKeypadDigit extracts single-digit transcript "1"');
  assert(VapiService.extractKeypadDigit(shortSpokenEvent) === '2', 'extractKeypadDigit extracts digit "2"');
  assert(VapiService.extractKeypadDigit(nonDigitEvent) === null, 'extractKeypadDigit returns null for non-digit conversational speech');

  // 3. SEED ACTIVE CALL JOBS WITH VAPI PROVIDER IDS
  const testCallId = `vapi_call_sim_${Date.now()}`;
  const mockControlUrl = 'https://api.vapi.ai/call/vapi_call_sim_123/control';

  const job1 = jobs[0];
  job1.status = 'calling';
  job1.providerCallId = testCallId;
  callbridgeStorage.saveCallJob(job1);

  // Set active call control with authentication enabled
  VapiService.setActiveCallControl(testCallId, mockControlUrl, true);
  const controlInfo = VapiService.getActiveCallControl(testCallId);
  assert(
    controlInfo !== undefined && controlInfo.controlUrl === mockControlUrl && controlInfo.controlAuthenticationEnabled === true,
    'VapiService tracks active call control URL and auth requirement',
    controlInfo
  );

  // Mark call initiated and answered (using job1.id to ensure consistent deduplication)
  callbridgeStorage.recordCallInitiated(eventId, job1.id);
  callbridgeStorage.recordCallAnswered(eventId, job1.id);

  // Receive keypad 1 event via webhook
  const keypad1Webhook = {
    message: {
      type: 'conversation-update',
      call: {
        id: testCallId,
        status: 'in-progress',
        monitor: { controlUrl: mockControlUrl },
        monitorPlan: { controlAuthenticationEnabled: true },
      },
      dtmf: '1',
    },
  };

  const dtmfWebhookResult = await VapiService.handleWebhook(keypad1Webhook);
  assert(dtmfWebhookResult.receivedDigit === '1', 'Webhook handler recognizes Keypad 1');
  assert(dtmfWebhookResult.terminationTriggered === true, 'Webhook handler triggers live call termination command for Keypad 1');

  // Check anonymous aggregate counters
  let analytics = callbridgeStorage.getAggregateAnalytics(eventId);
  assert(analytics.politicalCampaign?.keypad1Count === 1, 'Keypad 1 counter incremented to 1', analytics.politicalCampaign);
  assert(analytics.politicalCampaign?.keypad2Count === 0, 'Keypad 2 counter remains 0', analytics.politicalCampaign);

  // 4. TEST IDEMPOTENCY: DUPLICATE WEBHOOK SHOULD NOT DOUBLE-COUNT
  const duplicateKeypadWebhook = {
    message: {
      type: 'transcript',
      call: { id: testCallId, status: 'in-progress' },
      transcript: '1',
      role: 'user',
    },
  };
  await VapiService.handleWebhook(duplicateKeypadWebhook);
  analytics = callbridgeStorage.getAggregateAnalytics(eventId);
  assert(analytics.politicalCampaign?.keypad1Count === 1, 'Duplicate keypad event does not double-count (Idempotent)', analytics.politicalCampaign);

  // 5. TEST INVALID DIGITS: DIGITS OTHER THAN 1 AND 2 MUST NOT INCREMENT OR TERMINATE
  const call2Id = `vapi_call_sim2_${Date.now()}`;
  const job2 = jobs[1];
  job2.status = 'calling';
  job2.providerCallId = call2Id;
  callbridgeStorage.saveCallJob(job2);

  VapiService.setActiveCallControl(call2Id, mockControlUrl, true);
  callbridgeStorage.recordCallInitiated(eventId, job2.id);
  callbridgeStorage.recordCallAnswered(eventId, job2.id);

  const invalidDigitWebhook = {
    message: {
      type: 'conversation-update',
      call: { id: call2Id, status: 'in-progress', monitor: { controlUrl: mockControlUrl } },
      dtmf: '9',
    },
  };
  const invalidResult = await VapiService.handleWebhook(invalidDigitWebhook);
  assert(invalidResult.receivedDigit === '9', 'Webhook recognizes digit 9');
  assert(invalidResult.terminationTriggered === false, 'Digit 9 does NOT trigger termination command');
  analytics = callbridgeStorage.getAggregateAnalytics(eventId);
  assert(analytics.politicalCampaign?.keypad1Count === 1 && analytics.politicalCampaign?.keypad2Count === 0, 'Digit 9 does not increment 1 or 2 counters');

  // 6. TEST KEYPAD 2: INCREMENTS KEYPAD 2 COUNTER
  const keypad2Webhook = {
    message: {
      type: 'conversation-update',
      call: { id: call2Id, status: 'in-progress', monitor: { controlUrl: mockControlUrl } },
      dtmf: '2',
    },
  };
  const keypad2Result = await VapiService.handleWebhook(keypad2Webhook);
  assert(keypad2Result.receivedDigit === '2' && keypad2Result.terminationTriggered === true, 'Keypad 2 triggers termination');
  analytics = callbridgeStorage.getAggregateAnalytics(eventId);
  assert(analytics.politicalCampaign?.keypad2Count === 1, 'Keypad 2 counter incremented to 1');

  // 7. TEST ZERO-PII: CALL JOB ROW IS PURGED UPON CALL TERMINATION FOR POLITICAL CAMPAIGN
  const callEndedWebhook = {
    message: {
      type: 'status-update',
      status: 'ended',
      call: { id: testCallId, status: 'ended', duration: 14 },
    },
  };
  await VapiService.handleWebhook(callEndedWebhook);

  const politicalJobs = callbridgeStorage.getCallJobsByEvent(eventId);
  const leakedJob = politicalJobs.find((j) => j.providerCallId === testCallId || j.id === testCallId);
  assert(leakedJob === undefined, 'Zero-PII: Completed political campaign call job is purged from storage');

  // 8. TEST MATHEMATICALLY ACCURATE DENOMINATORS IN ANALYTICS
  // Answered calls = 2, Keypad 1 = 1 (50%), Keypad 2 = 1 (50%)
  const exportReport = ExportService.exportAnalyticsJson(eventId);
  const polExport = exportReport.moduleSpecificMetrics?.politicalCampaign;
  assert(polExport.totalCallsInitiated === 2, 'Total calls initiated count is 2', polExport);
  assert(polExport.answeredCalls === 2, 'Total answered calls count is 2', polExport);
  assert(polExport.answeredPercent === 100, 'Answered % is 100% (2 / 2)', polExport);
  assert(polExport.pressed1Percent === 50, 'Pressed 1 % is 50% (Denominator: 2 Answered Calls)', polExport);
  assert(polExport.pressed2Percent === 50, 'Pressed 2 % is 50% (Denominator: 2 Answered Calls)', polExport);

  // Zero-denominator test on fresh event
  const emptyEventId = `test_evt_empty_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: emptyEventId,
    name: 'Empty Campaign',
    type: 'political_campaign',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const emptyReport = ExportService.exportAnalyticsJson(emptyEventId);
  const emptyPol = emptyReport.moduleSpecificMetrics?.politicalCampaign;
  assert(
    emptyPol.answeredPercent === 0 && emptyPol.pressed1Percent === 0 && emptyPol.pressed2Percent === 0,
    'Zero denominator yields 0% (never NaN or Infinity)',
    emptyPol
  );

  // 9. TEST QUEUE MANAGER COMMANDS (START, PAUSE, CONTINUE, STOP, CANCEL)
  const qCampId = `test_camp_queue_${Date.now()}`;
  const qContacts: ContactRecord[] = [
    {
      id: `cnt_q_${Date.now()}`,
      userId: 'client_001',
      eventId,
      name: 'Queue Test Voter',
      phone: '+919988776655',
      originalPhone: '+919988776655',
      consentStatus: 'granted' as const,
      optOut: false,
      importSource: 'manual' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  callbridgeStorage.saveContactsBulk(qContacts);

  callbridgeStorage.saveCampaign({
    id: qCampId,
    clientId: 'client_001',
    eventId,
    name: 'Queue Control Validation Batch',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  queueManager.createCampaignJobs(qCampId, eventId, [qContacts[0].id]);

  // Start
  const startRes = queueManager.startCampaign(qCampId);
  assert(startRes.success && (startRes.campaign?.status === 'running' || callbridgeStorage.getCampaign(qCampId)?.status === 'running'), 'queueManager.startCampaign sets status to running');

  // Pause
  const pauseRes = queueManager.pauseCampaign(qCampId);
  assert(pauseRes.success && pauseRes.campaign?.status === 'paused', 'queueManager.pauseCampaign sets status to paused');

  // Continue (Resume)
  const resumeRes = queueManager.resumeCampaign(qCampId);
  assert(resumeRes.success && (resumeRes.campaign?.status === 'running' || callbridgeStorage.getCampaign(qCampId)?.status === 'running'), 'queueManager.resumeCampaign continues queue in running state');

  // Stop timing test (< 50ms)
  const stopStart = Date.now();
  const stopRes = queueManager.stopCampaign(qCampId);
  const stopDuration = Date.now() - stopStart;
  assert(stopRes.success && stopRes.campaign?.status === 'stopped', 'queueManager.stopCampaign sets status to stopped');
  assert(stopDuration < 100, 'queueManager.stopCampaign responds immediately (< 100ms)', { stopDuration });

  // Cancel timing test (< 50ms)
  const cancelStart = Date.now();
  const cancelRes = await queueManager.cancelCampaign(qCampId);
  const cancelDuration = Date.now() - cancelStart;
  assert(cancelRes.success && cancelRes.campaign?.status === 'cancelled', 'queueManager.cancelCampaign cancels remaining queue and sets cancelled state');
  assert(cancelDuration < 100, 'queueManager.cancelCampaign responds immediately (< 100ms)', { cancelDuration });
  assert(callbridgeStorage.getContacts(eventId).length >= 2, 'Original uploaded contacts list preserved after cancel');

  // 10. TEST ISSUE 1 TARGETED: COMPLETED CALLS AND ANALYTICS UPDATE AFTER TERMINAL EVENT
  const e2eEventId = `test_evt_e2e_political_${Date.now()}`;
  const e2eCampaignId = `test_camp_e2e_political_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: e2eEventId,
    name: 'E2E Real Scenario Campaign',
    type: 'political_campaign',
    language: 'te',
    config: {
      approvedScript: 'నమస్కారం! అభ్యర్థికి మద్దతు తెలుపండి.',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate', spokenPrompt: { te: 'మద్దతు', hi: 'समर्थन', en: 'Support' } },
        { digit: '2', labelEn: 'Callback Requested', spokenPrompt: { te: 'కాల్ బ్యాక్', hi: 'कॉल बैक', en: 'Callback' } },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const e2eContact: ContactRecord = {
    id: `cnt_e2e_${Date.now()}`,
    userId: 'client_001',
    eventId: e2eEventId,
    name: 'Constituent John',
    phone: '+919876501234',
    originalPhone: '+919876501234',
    consentStatus: 'granted' as const,
    optOut: false,
    importSource: 'manual' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveContactsBulk([e2eContact]);

  const e2eCampRecord = {
    id: e2eCampaignId,
    clientId: 'client_001',
    eventId: e2eEventId,
    name: 'E2E Sequential Batch',
    status: 'running' as const,
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    activeCalls: 1,
    activeCallId: `job_e2e_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCampaign(e2eCampRecord);

  const e2eJobId = e2eCampRecord.activeCallId;
  const e2eProviderCallId = `vapi_real_call_${Date.now()}`;

  // Register in transient active state
  VapiService.registerTransientActiveCall(e2eProviderCallId, {
    campaignId: e2eCampaignId,
    jobId: e2eJobId,
    eventId: e2eEventId,
    phone: e2eContact.phone,
  });

  // Step 1: Respondent presses Keypad 1
  const keypadWebhook = {
    message: {
      type: 'tool-calls',
      call: { id: e2eProviderCallId, status: 'in-progress' },
      toolCalls: [{ function: { name: 'dtmf', arguments: JSON.stringify({ digit: '1' }) } }],
    },
  };
  const kpRes = VapiService.handleWebhook(keypadWebhook);
  assert(kpRes.receivedDigit === '1', 'DTMF 1 received and processed during active call');

  // Step 2: Vapi sends authoritative status-update: ended webhook
  const vapiEndedWebhook = {
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-ended-call',
      call: {
        id: e2eProviderCallId,
        status: 'ended',
        endedReason: 'assistant-ended-call',
        duration: 15,
      },
    },
  };
  const termRes = VapiService.handleWebhook(vapiEndedWebhook);
  assert(termRes.isTerminal === true, 'Vapi status-update ended identified as terminal event');

  // Step 3: Verify campaign Finished / Processed calls updated
  const updatedE2eCamp = callbridgeStorage.getCampaign(e2eCampaignId);
  assert(updatedE2eCamp?.completedCount === 1, 'Campaign completedCount incremented from 0 to 1', updatedE2eCamp);
  assert(updatedE2eCamp?.processedCount === 1, 'Campaign processedCount incremented from 0 to 1', updatedE2eCamp);
  assert(updatedE2eCamp?.activeCalls === 0, 'Campaign activeCalls cleared to 0', updatedE2eCamp);

  // Step 4: Verify Analytics metrics updated to non-zero
  const e2eAnalytics = ExportService.exportAnalyticsJson(e2eEventId);
  const polM = e2eAnalytics.moduleSpecificMetrics?.politicalCampaign;
  assert(polM.totalCallsInitiated === 1, 'Analytics totalCallsInitiated is 1', polM);
  assert(polM.answeredCalls === 1, 'Analytics answeredCalls is 1', polM);
  assert(polM.answeredPercent === 100, 'Analytics answeredPercent is 100%', polM);
  assert(polM.unansweredPercent === 0, 'Analytics unansweredPercent is 0%', polM);
  assert(polM.failedOrBusyPercent === 0, 'Analytics failedOrBusyPercent is 0%', polM);
  assert(polM.pressed1Percent === 100, 'Analytics pressed1Percent is 100% (1 / 1 answered calls)', polM);
  assert(polM.pressed2Percent === 0, 'Analytics pressed2Percent is 0%', polM);

  // 11. TEST MODULE ISOLATION: PUBLIC SURVEY & MARRIAGE EVENT UNAFFECTED
  const surveyEvtId = `test_evt_survey_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: surveyEvtId,
    name: 'Civic Sanitation Survey',
    type: 'public_survey',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  callbridgeStorage.recordEventCallOutcome(surveyEvtId, {
    callId: 'call_survey_1',
    eventType: 'public_survey',
    surveyQuestionId: 'q1',
    surveyAnswer: 'Clean water is available in ward 4',
  });
  const surveyAnalytics = callbridgeStorage.getAggregateAnalytics(surveyEvtId);
  assert(
    surveyAnalytics.eventType === 'public_survey',
    'Public Survey module maintains its independent question and answer tracking'
  );

  const marriageEvtId = `test_evt_marriage_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: marriageEvtId,
    name: 'Kalyanam Invitation',
    type: 'marriage_event',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  callbridgeStorage.recordEventCallOutcome(marriageEvtId, {
    callId: 'call_marr_1',
    eventType: 'marriage_event',
    marriageRsvp: 'YES',
  });
  const marriageAnalytics = callbridgeStorage.getAggregateAnalytics(marriageEvtId);
  assert(
    marriageAnalytics.marriageEvent?.attendingCount === 1,
    'Marriage Event RSVP maintains spoken Telugu RSVP classification (attendingCount = 1)'
  );

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPoliticalQueueAndDtmfTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
