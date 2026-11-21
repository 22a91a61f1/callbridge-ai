import assert from 'assert';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

async function runDynamicFollowupLogicTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — PUBLIC SURVEY DYNAMIC CONVERSATION & FOLLOW-UP LOGIC');
  console.log('================================================================');

  const timestamp = Date.now();
  const eventId = `event_test_dynamic_${timestamp}`;
  const campaignId = `camp_dynamic_${timestamp}`;

  // 1. Create a test event with active survey questions
  const questions = [
    {
      id: 'Q1',
      questionId: 'Q1',
      text: 'ఈ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
      questionText: 'ఈ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
      category: 'drinking_water',
      enabled: true,
      order: 1,
    },
    {
      id: 'Q2',
      questionId: 'Q2',
      text: 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?',
      questionText: 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?',
      category: 'roads',
      enabled: true,
      order: 2,
    },
    {
      id: 'Q3',
      questionId: 'Q3',
      text: 'డ్రైనేజీ వ్యవస్థ ఎలా ఉంది?',
      questionText: 'డ్రైనేజీ వ్యవస్థ ఎలా ఉంది?',
      category: 'drainage',
      enabled: true,
      order: 3,
    },
  ];

  callbridgeStorage.saveEvent({
    id: eventId,
    clientId: 'client_dynamic_test',
    name: 'Dynamic Survey Test Event',
    type: 'public_survey',
    language: 'te',
    surveyQuestions: questions as any,
    status: 'active',
    selectedVoiceProfileId: 'voice_madhavi_01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Positive response "బాగుంది" -> Accept immediately and advance
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Positive response "బాగుంది" ---');
  const session1 = `sess_s1_${timestamp}`;
  SurveySequentialEngine.resetSession(session1);

  // Turn 0: Greeting
  const s1Turn0 = SurveySequentialEngine.processTurnSync({
    sessionId: session1,
    eventId,
    messages: [],
  });
  assert.strictEqual(s1Turn0.currentQuestionId, 'Q1');
  assert.ok(s1Turn0.reply.includes('తాగునీటి సౌకర్యం'), 'Initial greeting must include Q1');

  // Turn 1: Respondent says "బాగుంది"
  const s1Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session1,
    eventId,
    userUtterance: 'బాగుంది.',
  });
  assert.strictEqual(s1Turn1.action, 'ASK_MAIN_QUESTION');
  assert.strictEqual(s1Turn1.currentQuestionId, 'Q2', 'Must advance to Q2 without problem follow-up');
  assert.ok(s1Turn1.reply.includes('రోడ్ల పరిస్థితి'), 'Must ask Q2 about roads');
  assert.ok(!s1Turn1.reply.includes('మొదటి ప్రశ్న') && !s1Turn1.reply.includes('రెండవ ప్రశ్న'), 'No robotic question numbering');
  console.log('  ✓ [PASS] "బాగుంది" -> Accepted immediately, saved, advanced to Q2');

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Positive response "ఎలాంటి సమస్య లేదు" -> Accept and advance
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Positive response "ఎలాంటి సమస్య లేదు" ---');
  const session2 = `sess_s2_${timestamp}`;
  SurveySequentialEngine.resetSession(session2);
  SurveySequentialEngine.processTurnSync({ sessionId: session2, eventId, messages: [] });

  const s2Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session2,
    eventId,
    userUtterance: 'బాగానే ఉంది. ఎలాంటి సమస్య లేదు.',
  });
  assert.strictEqual(s2Turn1.action, 'ASK_MAIN_QUESTION');
  assert.strictEqual(s2Turn1.currentQuestionId, 'Q2');
  assert.ok(s2Turn1.reply.includes('రోడ్ల పరిస్థితి'));
  console.log('  ✓ [PASS] "ఎలాంటి సమస్య లేదు" -> Accepted immediately, advanced to Q2');

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Positive response "ప్రతిరోజూ నీళ్లు వస్తున్నాయి" -> Accept & advance
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Positive response "ప్రతిరోజూ నీళ్లు వస్తున్నాయి" ---');
  const session3 = `sess_s3_${timestamp}`;
  SurveySequentialEngine.resetSession(session3);
  SurveySequentialEngine.processTurnSync({ sessionId: session3, eventId, messages: [] });

  const s3Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session3,
    eventId,
    userUtterance: 'ప్రతిరోజూ నీళ్లు వస్తున్నాయి.',
  });
  assert.strictEqual(s3Turn1.action, 'ASK_MAIN_QUESTION');
  assert.strictEqual(s3Turn1.currentQuestionId, 'Q2');
  console.log('  ✓ [PASS] "ప్రతిరోజూ నీళ్లు వస్తున్నాయి" -> Accepted immediately, advanced to Q2');

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Short Negative response "నీళ్లు సరిగ్గా రావడం లేదు" -> Trained follow-up
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Short Negative "నీళ్లు సరిగ్గా రావడం లేదు" ---');
  const session4 = `sess_s4_${timestamp}`;
  SurveySequentialEngine.resetSession(session4);
  SurveySequentialEngine.processTurnSync({ sessionId: session4, eventId, messages: [] });

  const s4Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session4,
    eventId,
    userUtterance: 'నీళ్లు సరిగ్గా రావడం లేదు.',
  });
  assert.strictEqual(s4Turn1.action, 'ASK_FOLLOW_UP', 'Action must be ASK_FOLLOW_UP');
  assert.strictEqual(s4Turn1.currentQuestionId, 'Q1', 'Question ID must remain Q1 during follow-up');
  assert.ok(
    s4Turn1.reply.includes('ఎన్ని రోజులకొకసారి') || s4Turn1.reply.includes('వివరాలు'),
    `Follow-up must probe for frequency: "${s4Turn1.reply}"`
  );
  console.log(`  ✓ [PASS] "నీళ్లు సరిగ్గా రావడం లేదు" -> Targeted dynamic follow-up: "${s4Turn1.reply}"`);

  // ---------------------------------------------------------------------------
  // SCENARIO 5 & 6: Follow-up answered -> Save details and advance to Q2
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 5 & 6: Follow-up answered -> Advance to next question ---');
  const s4Turn2 = SurveySequentialEngine.processTurnSync({
    sessionId: session4,
    eventId,
    userUtterance: 'మూడు రోజులకొకసారి మాత్రమే వస్తున్నాయి.',
  });
  assert.strictEqual(s4Turn2.action, 'ASK_MAIN_QUESTION', 'Action must be ASK_MAIN_QUESTION after follow-up answered');
  assert.strictEqual(s4Turn2.currentQuestionId, 'Q2', 'Must advance to Q2');
  assert.ok(s4Turn2.reply.includes('రోడ్ల పరిస్థితి'), 'Must ask Q2');

  const s4State = SurveySequentialEngine.getState(session4)!;
  assert.ok(s4State.answers['Q1'].answerText.includes('మూడు రోజులకొకసారి'), 'Answer must store detailed frequency');
  console.log('  ✓ [PASS] Follow-up answered -> Details saved in Q1 answer, advanced to Q2');

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Detailed Negative answer provided initially -> NO follow-up!
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Detailed Negative initially -> No redundant follow-up ---');
  const session7 = `sess_s7_${timestamp}`;
  SurveySequentialEngine.resetSession(session7);
  SurveySequentialEngine.processTurnSync({ sessionId: session7, eventId, messages: [] });

  const s7Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session7,
    eventId,
    userUtterance: 'నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి మాత్రమే వస్తున్నాయి.',
  });
  assert.strictEqual(s7Turn1.action, 'ASK_MAIN_QUESTION', 'Should advance without follow-up when details provided');
  assert.strictEqual(s7Turn1.currentQuestionId, 'Q2', 'Must advance to Q2 directly');
  console.log('  ✓ [PASS] Detailed negative initial answer -> No redundant follow-up, advanced to Q2');

  // ---------------------------------------------------------------------------
  // SCENARIO 8: "ఇప్పుడు బిజీగా ఉన్నాను" -> Ask preferred callback time
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 8: "ఇప్పుడు బిజీగా ఉన్నాను" -> Ask preferred callback time ---');
  const session8 = `sess_s8_${timestamp}`;
  SurveySequentialEngine.resetSession(session8);
  SurveySequentialEngine.processTurnSync({ sessionId: session8, eventId, messages: [] });

  const s8Turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session8,
    eventId,
    userUtterance: 'ఇప్పుడు బిజీగా ఉన్నాను.',
  });
  assert.strictEqual(s8Turn1.action, 'CALLBACK');
  assert.strictEqual(s8Turn1.isCallback, true);
  assert.strictEqual(s8Turn1.isSurveyStopped, false, 'Survey not yet stopped while clarifying time');
  assert.ok(
    s8Turn1.reply.includes('ఏ సమయంలో మాట్లాడటానికి వీలవుతుంది') || s8Turn1.reply.includes('సమయం'),
    `Must prompt for callback time: "${s8Turn1.reply}"`
  );
  console.log(`  ✓ [PASS] "ఇప్పుడు బిజీగా ఉన్నాను" -> Prompted: "${s8Turn1.reply}"`);

  // ---------------------------------------------------------------------------
  // SCENARIO 9: "సాయంత్రం 6 గంటలకు కాల్ చేయండి" -> Save and schedule in Asia/Kolkata
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 9: "సాయంత్రం 6 గంటలకు కాల్ చేయండి" -> Schedule in Asia/Kolkata ---');
  const s8Turn2 = SurveySequentialEngine.processTurnSync({
    sessionId: session8,
    eventId,
    userUtterance: 'సాయంత్రం 6 గంటలకు కాల్ చేయండి.',
  });
  assert.strictEqual(s8Turn2.action, 'CALLBACK');
  assert.strictEqual(s8Turn2.isCallback, true);
  assert.strictEqual(s8Turn2.isSurveyStopped, true, 'Survey stopped and callback confirmed');
  assert.ok(s8Turn2.callbackScheduledAt, 'Must have scheduled timestamp');
  assert.ok(s8Turn2.reply.includes('సాయంత్రం 6 గంటలకు'), `Confirmation must contain evening 6 PM: "${s8Turn2.reply}"`);
  assert.ok(
    s8Turn2.reply.includes('తిరిగి కాల్ చేస్తాము') || s8Turn2.reply.includes('మళ్లీ కాల్ చేస్తాము'),
    'Confirmation must contain polite Telugu closing'
  );

  const s8State = SurveySequentialEngine.getState(session8)!;
  assert.strictEqual(s8State.callbackDetails?.requestedTime, '18:00');
  assert.strictEqual(s8State.callbackDetails?.timezone, 'Asia/Kolkata');
  assert.strictEqual(s8State.callbackDetails?.unansweredQuestionId, 'Q1');
  console.log(`  ✓ [PASS] Scheduled callback at 18:00 Asia/Kolkata, saved unansweredQuestionId: Q1`);

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Callback Resumption -> Resume from first unanswered question
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Callback Resumption -> Resume from first unanswered question ---');
  // Job that answered Q1, then stopped on Q2:
  const callbackJobId = `job_cb_resume_${timestamp}`;
  callbridgeStorage.saveCallJob({
    id: callbackJobId,
    campaignId,
    eventId,
    contactId: 'contact_cb_1',
    contactName: 'Narayana',
    contactPhone: '+919848011223',
    status: 'callback_scheduled',
    providerCallId: `call_cb_${timestamp}`,
    retryCount: 0,
    maxRetries: 1,
    surveyAnswers: {
      Q1: {
        questionId: 'Q1',
        questionText: 'ఈ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
        questionOrder: 1,
        answerText: 'బాగుంది',
        answeredAt: new Date().toISOString(),
        status: 'answered',
      },
    },
    surveyState: {
      sessionId: callbackJobId,
      currentQuestionId: 'Q2',
      currentQuestionIndex: 1,
      totalActiveQuestions: 3,
      answeredQuestionIds: ['Q1'],
      skippedQuestionIds: [],
      pendingQuestionId: 'Q2',
      conversationStatus: 'callback_scheduled',
      stateMachineState: 'COMPLETED',
      followUpCountForCurrentQuestion: 0,
      maxFollowUpsPerQuestion: 2,
      callbackRequested: true,
      callbackScheduledAt: new Date().toISOString(),
      callbackTimezone: 'Asia/Kolkata',
      callbackDetails: {
        requestedDate: '2026-11-07',
        requestedTime: '18:00',
        unansweredQuestionId: 'Q2',
        unansweredQuestionIndex: 1,
      },
      answers: {
        Q1: { questionId: 'Q1', answerText: 'బాగుంది', status: 'answered' },
      },
      transcripts: [],
      originalTranscript: [],
    } as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Re-dialing callback: session should resume from Q2 directly, NOT re-asking Q1!
  const cbResumeSession = `sess_cb_res_${timestamp}`;
  const cbState = SurveySequentialEngine.getOrCreateSession(cbResumeSession, {
    eventId,
    resumeQuestionIndex: 1,
    answeredQuestionIds: ['Q1'],
  });
  assert.strictEqual(cbState.currentQuestionIndex, 1, 'Resume index must be 1 (Q2)');
  assert.strictEqual(cbState.currentQuestionId, 'Q2', 'Current question must be Q2');

  const cbGreeting = SurveySequentialEngine.processTurnSync({
    sessionId: cbResumeSession,
    eventId,
    messages: [],
  });
  assert.strictEqual(cbGreeting.currentQuestionId, 'Q2');
  assert.ok(cbGreeting.reply.includes('రోడ్ల పరిస్థితి'), 'Resumed greeting must directly ask Q2 (roads)');
  assert.ok(!cbGreeting.reply.includes('తాగునీటి సౌకర్యం'), 'Must NOT re-ask answered Q1 (drinking water)');
  console.log(`  ✓ [PASS] Callback resumed cleanly at Q2 (first unanswered question) without re-asking Q1`);

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Duplicate transcription event -> Idempotent, no duplicate question
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Duplicate transcription event ---');
  const session11 = `sess_s11_${timestamp}`;
  SurveySequentialEngine.resetSession(session11);
  SurveySequentialEngine.processTurnSync({ sessionId: session11, eventId, messages: [] });

  const s11First = SurveySequentialEngine.processTurnSync({
    sessionId: session11,
    eventId,
    userUtterance: 'బాగానే ఉంది.',
  });
  assert.strictEqual(s11First.currentQuestionId, 'Q2');

  // Exact duplicate packet arrives
  const s11Dup = SurveySequentialEngine.processTurnSync({
    sessionId: session11,
    eventId,
    userUtterance: 'బాగానే ఉంది.',
  });
  assert.strictEqual(s11Dup.currentQuestionId, 'Q2', 'Duplicate event must NOT advance to Q3!');
  assert.strictEqual(s11Dup.reply, s11First.reply, 'Duplicate event must return the same reply');
  console.log('  ✓ [PASS] Duplicate speech utterance handled idempotently without duplicate progression');

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Server restart / Session reload -> Restore correct state
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Server restart / Session reload ---');
  // Clear in-memory session
  SurveySequentialEngine.resetSession(callbackJobId);

  // Reload session using the stored job ID
  const reloadedSession = SurveySequentialEngine.getOrCreateSession(callbackJobId, { eventId });
  assert.deepStrictEqual(reloadedSession.answeredQuestionIds, ['Q1'], 'Answered questions restored');
  assert.strictEqual(reloadedSession.currentQuestionIndex, 1, 'First unanswered index restored');
  assert.strictEqual(reloadedSession.currentQuestionId, 'Q2', 'Pending question restored to Q2');
  assert.ok(reloadedSession.answers['Q1'], 'Stored answers restored');
  console.log('  ✓ [PASS] Session reloaded from storage successfully after simulated server restart');

  console.log('\n================================================================');
  console.log('ALL 12 DYNAMIC CONVERSATION & FOLLOW-UP SCENARIOS PASSED 100%!');
  console.log('================================================================');
}

runDynamicFollowupLogicTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
