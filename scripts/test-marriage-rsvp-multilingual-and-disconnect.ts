/**
 * Comprehensive verification suite for Marriage Event RSVP Understanding,
 * 5-State Conversation Machine, Audio Completion Disconnect, and Aggregate Analytics.
 * Also verifies zero regression on Political Campaign DTMF.
 */
import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService, isValidUuid } from '../server/telephony/vapiService.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runMarriageVerificationSuite() {
  console.log('======================================================================');
  console.log('MARRIAGE EVENT RSVP UNDERSTANDING, ANALYTICS & DISCONNECT VERIFICATION');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}${detail ? ` - ${detail}` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: 14 SPECIFIC TEST CASES FROM SECTION 8 VERIFICATION MATRIX
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Multilingual RSVP Semantic Classification Matrix ---');

  const testMatrix = [
    { input: 'హా వస్తాను', expected: 'ATTENDING' },
    { input: 'హా అవును', expected: 'ATTENDING' },
    { input: 'అవును నేను వస్తాను', expected: 'ATTENDING' },
    { input: 'Yes, I will attend', expected: 'ATTENDING' },
    { input: 'Haan', expected: 'ATTENDING' },
    { input: 'లేదు నేను రాను', expected: 'NOT_ATTENDING' },
    { input: 'రావట్లేదు', expected: 'NOT_ATTENDING' },
    { input: 'No', expected: 'NOT_ATTENDING' },
    { input: 'Nahi aaunga', expected: 'NOT_ATTENDING' },
    { input: 'చూస్తాను', expected: 'MAYBE_ATTENDING' },
    { input: 'కుదిరితే వస్తాను', expected: 'MAYBE_ATTENDING' },
    { input: 'టైం బట్టి', expected: 'MAYBE_ATTENDING' },
    { input: 'Maybe', expected: 'MAYBE_ATTENDING' },
    { input: 'I am not sure', expected: 'MAYBE_ATTENDING' },
  ];

  testMatrix.forEach((tc, idx) => {
    const result = classifyMarriageRsvp(tc.input);
    assert(
      result === tc.expected,
      `Case ${idx + 1}: "${tc.input}"`,
      `Got ${result}, expected ${tc.expected}`
    );
  });

  // Additional variations (Hindi, English, Telugu)
  console.log('\n--- Section 1.1: Additional Multilingual & Phonetic Variations ---');
  assert(classifyMarriageRsvp('Ji haan') === 'ATTENDING', 'Hindi: "Ji haan" -> ATTENDING');
  assert(classifyMarriageRsvp('Pakka aaunga') === 'ATTENDING', 'Hindi: "Pakka aaunga" -> ATTENDING');
  assert(classifyMarriageRsvp('నేను అటెండ్ అవుతాను') === 'ATTENDING', 'Telugu: "నేను అటెండ్ అవుతాను" -> ATTENDING');
  assert(classifyMarriageRsvp('నేను అటెండ్ అవ్వను') === 'NOT_ATTENDING', 'Telugu: "నేను అటెండ్ అవ్వను" -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('Nahi aaungi') === 'NOT_ATTENDING', 'Hindi: "Nahi aaungi" -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('Dekhenge') === 'MAYBE_ATTENDING', 'Hindi: "Dekhenge" -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('Shayad') === 'MAYBE_ATTENDING', 'Hindi: "Shayad" -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('Depends on time') === 'MAYBE_ATTENDING', 'English: "Depends on time" -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('I will try') === 'MAYBE_ATTENDING', 'English: "I will try" -> MAYBE_ATTENDING');

  // Ambiguous & Greeting checks (must remain UNCLEAR, never invent category)
  console.log('\n--- Section 1.2: Ambiguous & Greeting Responses (Must be UNCLEAR) ---');
  assert(classifyMarriageRsvp('హలో') === 'UNCLEAR', 'Telugu greeting: "హలో" -> UNCLEAR');
  assert(classifyMarriageRsvp('నమస్కారం') === 'UNCLEAR', 'Telugu greeting: "నమస్కారం" -> UNCLEAR');
  assert(classifyMarriageRsvp('Hello') === 'UNCLEAR', 'English greeting: "Hello" -> UNCLEAR');
  assert(classifyMarriageRsvp('ఏమిటి') === 'UNCLEAR', 'Clarification query: "ఏమిటి" -> UNCLEAR');
  assert(classifyMarriageRsvp('') === 'UNCLEAR', 'Empty response -> UNCLEAR');
  assert(classifyMarriageRsvp(null) === 'UNCLEAR', 'Null response -> UNCLEAR');

  // --------------------------------------------------------------------------
  // SECTION 2: 5-STATE CONVERSATION MACHINE & EVENT-DRIVEN DISCONNECT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Strict 5-State Conversation Machine & Disconnect ---');

  const testEventId = `evt_marr_${Date.now()}`;
  const testCampaignId = `camp_marr_${Date.now()}`;
  const providerCallId = `44444444-4444-4444-8888-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const jobId = `job_marr_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: testEventId,
    name: 'వంశీ & లావణ్య శుభ వివాహం',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      approvedScript: 'శ్రీమతి మరియు శ్రీ శర్మ గారి వివాహ ఆహ్వాన పత్రిక.',
    },
  });

  const camp = callbridgeStorage.saveCampaign({
    id: testCampaignId,
    clientId: 'client_marriage_test',
    eventId: testEventId,
    name: 'Marriage RSVP Calling Batch',
    status: 'running',
    concurrencyLimit: 1,
    optOutCount: 0,
    failedCount: 0,
    totalContacts: 10,
    processedCount: 0,
    answeredCount: 0,
    completedCount: 0,
    attendingCount: 0,
    notAttendingCount: 0,
    maybeAttendingCount: 0,
    activeCalls: 1,
    activeCallId: jobId,
    activeCallProviderId: providerCallId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCallJob({
    id: jobId,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'contact_guest_1',
    contactName: 'Guest One',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      controlUrl: 'https://api.vapi.ai/call/control/mock-marr',
      controlAuthenticationEnabled: true,
    },
  });

  VapiService.mapProviderCallIdToJob(providerCallId, jobId, testCampaignId, testEventId, '+919876543210');
  VapiService.setActiveCallControl(providerCallId, 'https://api.vapi.ai/call/control/mock-marr', true);

  // Initial State: STATE_1_INVITATION
  VapiService.initMarriageCallState(providerCallId);
  const state1 = VapiService.getMarriageCallState(providerCallId);
  assert(state1.state === 'STATE_1_INVITATION', 'State Machine Step 1', 'Initialized in STATE_1_INVITATION');

  // Webhook: Assistant stops speaking opening message -> transitions to STATE_2_WAITING_FOR_RSVP
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: providerCallId },
    },
  });

  const state2 = VapiService.getMarriageCallState(providerCallId);
  assert(state2.state === 'STATE_2_WAITING_FOR_RSVP', 'State Machine Step 2', 'Transitioned to STATE_2_WAITING_FOR_RSVP after audio stop');

  // Webhook: User responds with Telugu RSVP "హా, వస్తాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'హా, వస్తాను',
      call: { id: providerCallId },
    },
  });

  const state3 = VapiService.getMarriageCallState(providerCallId);
  assert(
    state3.state === 'STATE_4_THANK_YOU',
    'State Machine Step 3 -> Step 4',
    'RSVP classified into ATTENDING and moved to STATE_4_THANK_YOU'
  );
  assert(state3.rsvpCategory === 'ATTENDING', 'Category Check', 'Recorded as ATTENDING');

  // Duplicate webhook delivery test (lock test)
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'హా, వస్తాను',
      call: { id: providerCallId },
    },
  });
  const stateLockedTest = VapiService.getMarriageCallState(providerCallId);
  assert(stateLockedTest.state === 'STATE_4_THANK_YOU', 'State Machine Locked', 'State remained locked in STATE_4_THANK_YOU');

  // Verify immediate dashboard metrics update BEFORE call termination
  const campImmediate = callbridgeStorage.getCampaign(testCampaignId);
  assert(
    (campImmediate?.attendingCount || 0) === 1,
    'Immediate Dashboard Metrics Sync',
    'Campaign attendingCount updated immediately to 1 while call is in progress'
  );

  // Webhook: Assistant speaks thank-you transcript
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
      call: { id: providerCallId },
    },
  });

  // Webhook: Assistant audio playback completion event (speech-update status: stopped)
  // This must immediately trigger call disconnect without arbitrary 3000ms delay!
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'stopped',
      call: { id: providerCallId },
    },
  });

  const state5 = VapiService.getMarriageCallState(providerCallId);
  assert(state5.state === 'STATE_5_CALL_END', 'State Machine Step 5', 'Moved to STATE_5_CALL_END upon audio stopped event');
  assert(state5.thankYouCompleted === true, 'Audio Playback Finished', 'thankYouCompleted marked true');

  // Provider terminal event confirmation
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      call: { id: providerCallId, endedReason: 'assistant-ended-call', duration: 32 },
    },
  });

  assert(state5.terminationConfirmed === true, 'Call Termination Confirmed', 'Provider termination event confirmed');

  // --------------------------------------------------------------------------
  // SECTION 3: AGGREGATE METRICS & DENOMINATOR VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Aggregate Metrics & Answered Calls Denominator ---');

  const analytics = ExportService.exportAnalyticsJson(testEventId, testCampaignId);
  const mMetrics = analytics.moduleSpecificMetrics.marriageRsvp;

  assert(mMetrics.attendingCount === 1, 'Attending Count', 'Expected 1 attending');
  assert(mMetrics.answeredCalls >= 1, 'Answered Calls >= 1', `Answered calls: ${mMetrics.answeredCalls}`);
  assert(mMetrics.attendingPercent === 100, 'Attending %', `Attending percent: ${mMetrics.attendingPercent}% (Denominator = answeredCalls)`);
  assert(mMetrics.notAttendingPercent === 0, 'Not Attending %', 'Not attending percent: 0%');
  assert(mMetrics.maybePercent === 0, 'Maybe %', 'Maybe percent: 0%');

  // Test zero answered calls denominator rule
  const emptyEventId = `evt_empty_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: emptyEventId,
    name: 'Empty Wedding',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
  });
  const emptyAnalytics = ExportService.exportAnalyticsJson(emptyEventId);
  assert(emptyAnalytics.moduleSpecificMetrics.marriageRsvp.attendingPercent === 0, 'Zero Answered Denominator', 'Attending percent is 0% when answeredCalls is 0');

  // --------------------------------------------------------------------------
  // SECTION 4: ZERO REGRESSION ON POLITICAL CAMPAIGN DTMF
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Zero Regression on Political Campaign DTMF ---');

  const polEventId = `evt_pol_regr_${Date.now()}`;
  const polCampId = `camp_pol_regr_${Date.now()}`;
  const polCallId = `55555555-5555-4444-8888-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const polJobId = `job_pol_regr_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: polEventId,
    name: 'Assembly Election Campaign',
    type: 'political_campaign',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate', spokenPrompt: { te: '1 నొక్కండి', hi: '1 dabayein', en: 'Press 1' } },
        { digit: '2', labelEn: 'Request Callback', spokenPrompt: { te: '2 నొక్కండి', hi: '2 dabayein', en: 'Press 2' } },
      ],
    },
  });

  callbridgeStorage.saveCampaign({
    id: polCampId,
    clientId: 'client_pol',
    eventId: polEventId,
    name: 'Ward Voter Outreach',
    status: 'running',
    concurrencyLimit: 1,
    optOutCount: 0,
    failedCount: 0,
    totalContacts: 1,
    processedCount: 0,
    answeredCount: 0,
    completedCount: 0,
    keypad1Count: 0,
    keypad2Count: 0,
    activeCalls: 1,
    activeCallId: polJobId,
    activeCallProviderId: polCallId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCallJob({
    id: polJobId,
    campaignId: polCampId,
    eventId: polEventId,
    contactId: 'c_voter_1',
    contactName: 'Voter 1',
    contactPhone: '+919111111111',
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

  VapiService.mapProviderCallIdToJob(polCallId, polJobId, polCampId, polEventId);

  // Send DTMF Keypad 1
  const polResult = VapiService.handleWebhook({
    type: 'transcript',
    call: { id: polCallId },
    digits: '1',
  });

  assert(polResult.terminationTriggered === true, 'Political DTMF Termination', 'Keypad 1 triggered instant hangup');
  const polCampRec = callbridgeStorage.getCampaign(polCampId);
  assert((polCampRec?.keypad1Count || 0) === 1, 'Political Keypad 1 Count', 'Keypad 1 counter incremented accurately');

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('======================================================================\n');

  if (passed === total) {
    console.log('ALL MARRIAGE EVENT & ZERO-REGRESSION TESTS PASSED PERFECTLY!\n');
  } else {
    process.exit(1);
  }
}

runMarriageVerificationSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
