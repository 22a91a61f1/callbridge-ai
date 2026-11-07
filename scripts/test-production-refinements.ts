import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';

async function runRefinementTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — PRODUCTION REFINEMENT TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // --- 1. TASK 1: EXACT CLONED VOICE INTEGRITY ---
  console.log('\n--- 1. Testing Exact Cloned Voice in Outbound Calling ---');
  const activeVoiceId = ElevenLabsService.resolveVoiceId('vp_rishi_candidate');
  assert(Boolean(activeVoiceId && activeVoiceId.length > 5), `Cloned voice ID resolved: ${activeVoiceId}`);

  // Pre-flight check: ensure no robotic fallback happens if voice is missing
  let threwExpected = false;
  try {
    await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      contactName: 'Test',
      voiceId: '',
      moduleType: 'political_campaign',
      script: 'Test script',
    });
  } catch (err: any) {
    threwExpected = true;
    assert(err.message.includes('voice profile is required'), `Strict no-fallback error triggered: "${err.message}"`);
  }
  assert(threwExpected, 'Strict NO-FALLBACK: Rejects missing/invalid voice without falling back to robotic voice');

  // --- 2. TASK 2: STOP QUEUE & CANCEL QUEUE BEHAVIOR ---
  console.log('\n--- 2. Testing Stop Queue & Cancel Queue ---');
  const now = new Date().toISOString();
  const testCampId = `camp_test_refine_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: testCampId,
    clientId: 'client_001',
    eventId: 'event_public_survey',
    name: 'Refinement Queue Test',
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

  // Create two jobs
  const job1Id = `job_test_stop_1`;
  const job2Id = `job_test_stop_2`;
  callbridgeStorage.saveCallJob({
    id: job1Id,
    campaignId: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c1',
    contactName: 'Active Respondent',
    contactPhone: '+919999999901',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  });
  callbridgeStorage.saveCallJob({
    id: job2Id,
    campaignId: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c2',
    contactName: 'Pending Respondent',
    contactPhone: '+919999999902',
    status: 'pending',
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  });

  // Stop campaign
  const stopRes = queueManager.stopCampaign(testCampId);
  const campAfterStop = callbridgeStorage.getCampaign(testCampId);
  assert(campAfterStop?.status === 'stopped', `Stop Queue sets campaign status to 'stopped' (got '${campAfterStop?.status}')`);

  const job1AfterStop = callbridgeStorage.getCallJob(job1Id);
  const job2AfterStop = callbridgeStorage.getCallJob(job2Id);
  assert(job1AfterStop?.status === 'in_progress', 'Stop Queue preserves in-flight active call in progress');
  assert(job2AfterStop?.status === 'pending', 'Stop Queue preserves pending jobs as pending');

  // Cancel campaign
  const cancelRes = await queueManager.cancelCampaign(testCampId);
  const campAfterCancel = callbridgeStorage.getCampaign(testCampId);
  const job1AfterCancel = callbridgeStorage.getCallJob(job1Id);
  const job2AfterCancel = callbridgeStorage.getCallJob(job2Id);
  assert(campAfterCancel?.status === 'stopped', `Cancel Queue marks campaign as stopped`);
  assert(job1AfterCancel?.status === 'cancelled', 'Cancel Queue terminates in-flight active call and marks cancelled');
  assert(job2AfterCancel?.status === 'cancelled', 'Cancel Queue cancels remaining pending jobs');

  // --- 3. PART B TASK 1: INSTANT DTMF HANGUP ---
  console.log('\n--- 3. Testing Instant DTMF Hangup & Event Isolation ---');
  const mockSurveyJobId = `job_mock_dtmf_survey_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: mockSurveyJobId,
    providerCallId: `vapi_${mockSurveyJobId}`,
    campaignId: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c_dtmf',
    contactName: 'Survey Respondent',
    contactPhone: '+919999999903',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  });

  // Simulate DTMF 1 webhook for Public Survey
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: `vapi_${mockSurveyJobId}` },
      digit: '1',
    },
  });

  const updatedSurveyJob = callbridgeStorage.getCallJob(mockSurveyJobId);
  assert(updatedSurveyJob?.dtmfDigitReceived === '1', 'Public Survey captures digit 1');
  assert(updatedSurveyJob?.dtmfOptionLabel === 'Issue Reported', 'Public Survey maps digit 1 to Issue Reported');
  assert(updatedSurveyJob?.metadata?.instantHangupTriggered === true, 'Public Survey triggers instant hangup immediately');

  // Simulate DTMF 1 webhook for Marriage Event
  const mockMarriageJobId = `job_mock_dtmf_marriage_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: mockMarriageJobId,
    providerCallId: `vapi_${mockMarriageJobId}`,
    campaignId: testCampId,
    eventId: 'event_marriage_event',
    clientId: 'client_001',
    contactId: 'c_mrg',
    contactName: 'Wedding Guest',
    contactPhone: '+919999999904',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  });

  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: `vapi_${mockMarriageJobId}` },
      digit: '1',
    },
  });

  const updatedMarriageJob = callbridgeStorage.getCallJob(mockMarriageJobId);
  assert(updatedMarriageJob?.rsvpStatus === 'attending', 'Marriage Event maps digit 1 to RSVP attending');
  assert(updatedMarriageJob?.metadata?.instantHangupTriggered === true, 'Marriage Event triggers instant hangup immediately');

  // Simulate DTMF 1 webhook for Political Campaign (MUST NOT hang up instantly)
  const mockPoliticalJobId = `job_mock_dtmf_political_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: mockPoliticalJobId,
    providerCallId: `vapi_${mockPoliticalJobId}`,
    campaignId: testCampId,
    eventId: 'event_political_campaign',
    clientId: 'client_001',
    contactId: 'c_pol',
    contactName: 'Voter',
    contactPhone: '+919999999905',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  });

  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: `vapi_${mockPoliticalJobId}` },
      digit: '1',
    },
  });

  const updatedPoliticalJob = callbridgeStorage.getCallJob(mockPoliticalJobId);
  assert(updatedPoliticalJob?.dtmfDigitReceived === '1', 'Political Campaign captures digit 1');
  assert(updatedPoliticalJob?.metadata?.instantHangupTriggered !== true, 'Political Campaign DOES NOT hang up instantly on DTMF (speech continues)');

  // --- 4. TASK 3 & PART B TASK 2/3: COMPLETE CALL ANALYTICS ---
  console.log('\n--- 4. Testing Complete Call Analytics & Event Separation ---');
  const surveyAnalytics = ExportService.exportAnalyticsJson('event_public_survey');
  assert(typeof surveyAnalytics.metrics?.totalCalls === 'number', 'Analytics contains totalCalls');
  assert(typeof surveyAnalytics.metrics?.completedCalls === 'number', 'Analytics contains completedCalls');
  assert(typeof surveyAnalytics.metrics?.answeredCalls === 'number', 'Analytics contains answeredCalls');
  assert(typeof surveyAnalytics.metrics?.noAnswerCalls === 'number', 'Analytics contains noAnswerCalls');
  assert(typeof surveyAnalytics.metrics?.rejectedCalls === 'number', 'Analytics contains rejectedCalls');
  assert(typeof surveyAnalytics.metrics?.failedCalls === 'number', 'Analytics contains failedCalls');
  assert(typeof surveyAnalytics.metrics?.answerRatePercentage === 'number', 'Analytics contains answerRatePercentage');
  assert(typeof surveyAnalytics.metrics?.completionRatePercentage === 'number', 'Analytics contains completionRatePercentage');
  assert(Array.isArray(surveyAnalytics.publicSurvey?.questions), 'Public Survey analytics dynamically includes configured questions');
  assert(surveyAnalytics.publicSurvey.questions.length >= 10, `Loaded ${surveyAnalytics.publicSurvey.questions.length} configured questions`);

  const marriageAnalytics = ExportService.exportAnalyticsJson('event_marriage_event');
  assert(typeof marriageAnalytics.marriageEvent?.attendingCount === 'number', 'Marriage analytics contains attendingCount');
  assert(typeof marriageAnalytics.marriageEvent?.maybeCount === 'number', 'Marriage analytics contains maybeCount');
  assert(typeof marriageAnalytics.marriageEvent?.notAttendingCount === 'number', 'Marriage analytics contains notAttendingCount');
  assert(Array.isArray(marriageAnalytics.marriageEvent?.rsvpReasons), 'Marriage analytics includes RSVP reasons table');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRefinementTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
