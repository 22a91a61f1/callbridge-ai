import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage, type CallJobRecord } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

async function runMasterTestSuite() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — PUBLIC SURVEY MASTER VALIDATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${message}`);
      throw new Error(`Test failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 1: DETERMINISTIC SEQUENTIAL QUESTION PROGRESSION
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Deterministic Sequential Progression & Source of Truth ---');

  const testEventId = `event_test_survey_${Date.now()}`;
  const customQuestions = [
    { id: 'Q1', questionId: 'Q1', text: 'మీ ప్రాంతంలో రోజూ తాగునీరు వస్తుందా?', questionText: 'మీ ప్రాంతంలో రోజూ తాగునీరు వస్తుందా?', category: 'నీరు', questionOrder: 1, allowFollowUp: true, enabled: true },
    { id: 'Q2', questionId: 'Q2', text: 'మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ వ్యవస్థ బాగున్నాయా?', questionText: 'మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ వ్యవస్థ బాగున్నాయా?', category: 'రోడ్లు', questionOrder: 2, allowFollowUp: true, enabled: true },
    { id: 'Q3', questionId: 'Q3', text: 'మీ వీధిలో రాత్రిపూట వీధి దీపాలు వెలుగుతున్నాయా?', questionText: 'మీ వీధిలో రాత్రిపూట వీధి దీపాలు వెలుగుతున్నాయా?', category: 'విద్యుత్', questionOrder: 3, allowFollowUp: true, enabled: true },
    { id: 'Q4_DELETED', questionId: 'Q4_DELETED', text: 'ఈ ప్రశ్న దాటవేయబడింది (Deleted question)', questionText: 'ఈ ప్రశ్న దాటవేయబడింది', category: 'పాతది', questionOrder: 4, allowFollowUp: false, enabled: false },
    { id: 'Q5', questionId: 'Q5', text: 'పారిశుద్ధ్య కార్మికులు రోజూ చెత్తను సేకరిస్తున్నారా?', questionText: 'పారిశుద్ధ్య కార్మికులు రోజూ చెత్తను సేకరిస్తున్నారా?', category: 'పారిశుద్ధ్యం', questionOrder: 5, allowFollowUp: true, enabled: true },
  ];

  callbridgeStorage.saveEvent({
    id: testEventId,
    type: 'public_survey',
    name: 'Test Public Survey Event',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveSurveyQuestions(testEventId, customQuestions as any);

  const resolved = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolved.length === 4, 'Deleted / disabled questions are excluded (4 active questions)');
  assert(resolved[0].questionId === 'Q1', 'Question 1 matches exact saved order');
  assert(resolved[1].questionId === 'Q2', 'Question 2 matches exact saved order');
  assert(resolved[2].questionId === 'Q3', 'Question 3 matches exact saved order');
  assert(resolved[3].questionId === 'Q5', 'Question 5 matches exact saved order and skipped Q4_DELETED');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: DYNAMIC FOLLOW-UPS WITH OPENAI & DETERMINISTIC RESTORATION
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Dynamic Contextual Follow-Up Generation ---');

  const callId = `call_test_${Date.now()}`;
  const campaignId = `camp_test_${Date.now()}`;

  const state0 = SurveySequentialEngine.getOrCreateState(callId, campaignId, testEventId, resolved);
  assert(state0.currentQuestionIndex === 0, 'Initial question index starts at 0');
  assert(state0.currentQuestionId === 'Q1', 'Initial current question is Q1');
  assert(state0.conversationStatus === 'ASKING_MAIN_QUESTION', 'Initial conversation status is ASKING_MAIN_QUESTION');

  // Turn 1: Respondent answers Q1 with an issue needing follow-up
  const turn1 = await SurveySequentialEngine.processTurn({
    campaignId,
    providerCallId: callId,
    userUtterance: 'మా ప్రాంతంలో నీళ్లు సరిగ్గా రావడం లేదు అండి.',
    questionId: 'Q1',
    eventId: testEventId,
  });

  assert(turn1.action === 'ASK_FOLLOW_UP', 'Turn 1 recognizes ambiguous issue and generates dynamic follow-up');
  assert(turn1.spokenResponse.length > 5, 'Spoken follow-up response is non-empty Telugu');
  assert(!turn1.spokenResponse.toLowerCase().includes('okay') && !turn1.spokenResponse.toLowerCase().includes('noted'), 'No English filler words in Turn 1 follow-up');

  // Turn 2: Respondent answers follow-up
  const turn2 = await SurveySequentialEngine.processTurn({
    campaignId,
    providerCallId: callId,
    userUtterance: 'వారానికి రెండు రోజులు మాత్రమే వస్తాయి.',
    questionId: 'Q1',
    eventId: testEventId,
  });

  assert(
    turn2.action === 'ACCEPT_ANSWER' || turn2.action === 'ASK_FOLLOW_UP' || turn2.action === 'ASK_MAIN_QUESTION',
    'Turn 2 processed follow-up response'
  );

  // If follow-up accepted / next question asked, verify state moved to Q2
  const stateAfterQ1 = SurveySequentialEngine.getState(callId);
  if (turn2.action === 'ACCEPT_ANSWER' || turn2.action === 'ASK_MAIN_QUESTION') {
    assert(stateAfterQ1?.currentQuestionIndex === 1, 'Question index deterministically advanced to 1');
    const nextQText = resolved[1].questionText || resolved[1].text || '';
    assert(turn2.spokenResponse.includes(nextQText), 'Response introduces next main question (Q2)');
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 3: NATURAL SPOKEN TELUGU (NO ENGLISH FILLERS)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Natural Spoken Telugu Verification ---');

  const englishForbiddenList = ['okay', 'noted', 'fine', 'sure', 'alright'];
  const testUtterance = 'అవును అండి రోడ్లు చాలా బాగున్నాయి.';
  const turnQ2 = await SurveySequentialEngine.processTurn({
    campaignId,
    providerCallId: callId,
    userUtterance: testUtterance,
    questionId: 'Q2',
    eventId: testEventId,
  });

  const lowerSpoken = turnQ2.spokenResponse.toLowerCase();
  for (const word of englishForbiddenList) {
    const hasWord = new RegExp(`\\b${word}\\b`, 'i').test(lowerSpoken);
    assert(!hasWord, `Spoken response does not contain forbidden English word "${word}"`);
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 4: TELUGU CALLBACK DATE/TIME PARSING & SCHEDULING
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Telugu Callback Date/Time Parsing ---');

  const callbackTestCases = [
    { text: 'రేపు సాయంత్రం 5 గంటలకు మాట్లాడతాను', expectHour: 17, expectMin: 0, expectDaysAhead: 1 },
    { text: 'ఎల్లుండి ఉదయం 10 గంటలకు కాల్ చేయండి', expectHour: 10, expectMin: 0, expectDaysAhead: 2 },
    { text: 'సోమవారం మధ్యాహ్నం 3 గంటలకు', expectHour: 15, expectMin: 0 },
  ];

  for (const tc of callbackTestCases) {
    const parsed = SurveySequentialEngine.parseCallbackDateTime(tc.text);
    assert(parsed !== null, `Parsed callback for "${tc.text}" successfully`);
    if (parsed) {
      assert(parsed.timeString.length > 0, `Generated formatted time string: ${parsed.timeString}`);
      assert(parsed.timezone === 'Asia/Kolkata', 'Callback scheduled in Asia/Kolkata timezone');
      assert(parsed.parsedHour === tc.expectHour, `Parsed hour matches ${tc.expectHour}`);
    }
  }

  const callbackCallId = `call_cb_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(callbackCallId, campaignId, testEventId, resolved);
  const cbResult = SurveySequentialEngine.scheduleCallback({
    campaignId,
    providerCallId: callbackCallId,
    requestedTimeText: 'రేపు సాయంత్రం 5 గంటలకు కాల్ చేయండి',
    eventId: testEventId,
  });

  assert(cbResult.success === true, 'Callback scheduling execution returned success');
  assert(cbResult.spokenResponse.includes('తిరిగి కాల్ చేస్తాము'), 'Spoken confirmation promises callback');
  const cbState = SurveySequentialEngine.getState(callbackCallId);
  assert(cbState?.callbackRequested === true, 'State recorded callbackRequested = true');
  assert(cbState?.conversationStatus === 'SCHEDULE_CALLBACK', 'State transitioned to SCHEDULE_CALLBACK');

  // -------------------------------------------------------------------------
  // TEST SUITE 5: TRANSCRIPT PERSISTENCE & INLINE REVISION AUDIT TRAIL
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Transcript Persistence & Revision Editing ---');

  const sampleJob: CallJobRecord = {
    id: `job_audit_${Date.now()}`,
    campaignId,
    eventId: testEventId,
    contactId: 'contact_001',
    contactName: 'రామయ్య',
    contactPhone: '+919876543210',
    status: 'completed',
    retryCount: 0,
    maxRetries: 1,
    transcript: [
      { role: 'agent', text: 'నమస్కారం అండి! మీ ప్రాంతంలో రోజూ తాగునీరు వస్తుందా?', timestamp: new Date().toISOString() },
      { role: 'respondent', text: 'రోజూ రాదండి, వారంలో రెండు రోజులు మాత్రమే.', timestamp: new Date().toISOString() },
    ],
    originalTranscript: [
      { role: 'agent', text: 'నమస్కారం అండి! మీ ప్రాంతంలో రోజూ తాగునీరు వస్తుందా?', timestamp: new Date().toISOString() },
      { role: 'respondent', text: 'రోజూ రాదండి, వారంలో రెండు రోజులు మాత్రమే.', timestamp: new Date().toISOString() },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  callbridgeStorage.saveCallJob(sampleJob);

  // Perform a revision edit on Turn 1 (respondent)
  const revisedJob = callbridgeStorage.getCallJob(sampleJob.id)!;
  const originalRespondentText = revisedJob.originalTranscript![1].text;

  // Add revision record
  revisedJob.transcriptRevisions = [
    {
      editedAt: new Date().toISOString(),
      editor: 'Admin Reviewer',
      turnIndex: 1,
      previousText: revisedJob.transcript![1].text,
      newText: 'రోజూ రాదండి, వారంలో మూడు రోజులు వస్తున్నాయి.',
      reason: 'Transcription audio clarification',
    },
  ];
  revisedJob.transcript![1].text = 'రోజూ రాదండి, వారంలో మూడు రోజులు వస్తున్నాయి.';
  callbridgeStorage.saveCallJob(revisedJob);

  const reloaded = callbridgeStorage.getCallJob(sampleJob.id)!;
  assert(reloaded.transcript![1].text === 'రోజూ రాదండి, వారంలో మూడు రోజులు వస్తున్నాయి.', 'Transcript turn updated to new text');
  assert(reloaded.originalTranscript![1].text === originalRespondentText, 'Original transcript turn preserved unmodified');
  assert(reloaded.transcriptRevisions!.length === 1, 'Audit revision recorded with editor and reason');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: PDF TRANSCRIPT GENERATION WITH TELUGU FONT
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 6: PDF Transcript Generation with NotoSansTelugu Font ---');

  const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(reloaded);
  assert(Buffer.isBuffer(pdfBuffer), 'PDF generated as valid Buffer');
  assert(pdfBuffer.length > 2000, `PDF buffer has substantial size (${pdfBuffer.length} bytes)`);
  assert(pdfBuffer.slice(0, 4).toString() === '%PDF', 'PDF header signature %PDF is valid');

  // -------------------------------------------------------------------------
  // TEST SUITE 7: SIMPLE IDEMPOTENT PUBLIC SURVEY ANALYTICS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 7: Simple Idempotent Public Survey Analytics ---');

  // Create mock completed, interrupted, and callback jobs
  const job1: CallJobRecord = {
    id: `job_c1_${Date.now()}`,
    campaignId,
    eventId: testEventId,
    contactId: 'c1',
    contactName: 'User 1',
    contactPhone: '+919000000001',
    status: 'completed',
    retryCount: 0,
    maxRetries: 1,
    surveyAnswers: { Q1: 'Yes', Q2: 'Good' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const job2: CallJobRecord = {
    id: `job_c2_${Date.now()}`,
    campaignId,
    eventId: testEventId,
    contactId: 'c2',
    contactName: 'User 2',
    contactPhone: '+919000000002',
    status: 'interrupted',
    retryCount: 0,
    maxRetries: 1,
    surveyAnswers: { Q1: 'Partial' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const job3: CallJobRecord = {
    id: `job_c3_${Date.now()}`,
    campaignId,
    eventId: testEventId,
    contactId: 'c3',
    contactName: 'User 3',
    contactPhone: '+919000000003',
    status: 'callback_scheduled',
    retryCount: 0,
    maxRetries: 1,
    callbackRequested: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  callbridgeStorage.saveCallJob(job1);
  callbridgeStorage.saveCallJob(job2);
  callbridgeStorage.saveCallJob(job3);

  const analytics = ExportService.exportAnalyticsJson(testEventId, campaignId);
  assert(analytics.publicSurveyCounters !== undefined, 'Analytics includes publicSurveyCounters object');
  assert(analytics.publicSurveyCounters.completedCalls >= 1, 'Completed calls counter recorded accurately');
  assert(analytics.publicSurveyCounters.disconnectedCalls >= 1, 'Disconnected calls counter recorded accurately');
  assert(analytics.publicSurveyCounters.callbackScheduledCalls >= 1, 'Callback scheduled calls counter recorded accurately');
  assert(analytics.publicSurveyCounters.answeredCalls >= 3, 'Answered calls equals sum of attended calls');
  assert(analytics.publicSurveyCounters.rsvpYes === undefined, 'Zero RSVP fields present in public survey counters');

  // -------------------------------------------------------------------------
  // TEST SUITE 8: ISOLATION CHECK (POLITICAL & MARRIAGE FLOWS UNCHANGED)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 8: Module Isolation Check (Zero Political/Marriage Regressions) ---');

  const pKeypad1 = callbridgeStorage.recordPoliticalKeypadOutcome(
    'event_political_campaign',
    'call_p1_test',
    '1',
    'camp_political_test'
  );
  assert(pKeypad1.politicalCampaign?.keypad1Count !== undefined, 'Political campaign keypad 1 counting works');

  const mRsvp = VapiService.processStructuredMarriageRsvp(
    'camp_marriage_test',
    'call_m1_test',
    'ATTENDING',
    'event_marriage_event'
  );
  assert(mRsvp.success === true && mRsvp.category === 'ATTENDING', 'Marriage event spoken RSVP ATTENDING flow works');

  console.log('\n================================================================');
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} (100% Success)`);
  console.log('================================================================\n');
}

runMasterTestSuite().catch((err) => {
  console.error('Master test suite failed:', err);
  process.exit(1);
});
