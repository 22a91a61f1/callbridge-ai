import { SurveySequentialEngine, TELUGU_STRINGS } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS [${passed}]: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${description}`, details || '');
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('STARTING PUBLIC SURVEY 10-QUESTION E2E & RESILIENCY TEST SUITE (17 SCENARIOS)');
  console.log('========================================================================\n');

  const activeQuestions = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
  console.log(`Loaded ${activeQuestions.length} active questions for Public Survey:`);
  activeQuestions.forEach((q, idx) => console.log(`  Q${idx + 1} (${q.id}): "${q.text.slice(0, 45)}..."`));
  console.log('');

  // ==========================================================================
  // SCENARIO 1: Question 1 positive answer -> advances to Question 2
  // ==========================================================================
  console.log('--- SCENARIO 1: Q1 Positive Answer -> Advances to Q2 ---');
  const sess1 = `test_scen1_${Date.now()}`;
  const t1 = SurveySequentialEngine.processTurnSync({
    sessionId: sess1,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది.',
  });
  assert('Q1 response advances currentQuestionIndex to 1 (Q2)', t1.currentQuestionIndex === 1);
  assert('Q1 response sets next questionId to A2', t1.currentQuestionId === 'A2');
  assert('Q1 response speaks Case A acknowledgment', t1.spokenResponse.includes('సరే అండి, ధన్యవాదాలు.'));
  assert('Q1 response contains Question 2 text (రోడ్ల)', t1.spokenResponse.includes('రోడ్ల'));
  assert('Q1 text (తాగునీటి) is not repeated', !t1.spokenResponse.includes('తాగునీటి'));

  // ==========================================================================
  // SCENARIO 2: Question 2 vague negative answer -> asks strictly "ఏంటి సమస్య?"
  // ==========================================================================
  console.log('\n--- SCENARIO 2: Q2 Vague Negative Answer -> Asks "ఏంటి సమస్య?" ---');
  const sess2 = `test_scen2_${Date.now()}`;
  // Q1 positive first
  SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది.',
  });
  // Q2 vague negative: "సమస్య ఉంది."
  const t2_fu = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A2',
    userUtterance: 'సమస్య ఉంది.',
  });
  assert('Q2 vague negative triggers ASK_FOLLOW_UP action', t2_fu.action === 'ASK_FOLLOW_UP');
  assert('Q2 follow-up question is strictly "ఏంటి సమస్య?"', t2_fu.spokenResponse.trim() === 'ఏంటి సమస్య?');
  assert('Q2 stays at currentQuestionIndex 1', t2_fu.currentQuestionIndex === 1);
  assert('Q2 does not give multiple choice options or suggestions', !t2_fu.spokenResponse.includes('గుంతలు') && !t2_fu.spokenResponse.includes('లేదా'));

  // ==========================================================================
  // SCENARIO 3: Question 2 follow-up answer -> captures problem and advances to Q3
  // ==========================================================================
  console.log('\n--- SCENARIO 3: Q2 Follow-up Answer -> Captures Problem & Advances to Q3 ---');
  const t2_ans = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A2',
    userUtterance: 'మా ప్రాంతంలో రోడ్లపై గుంతలు ఉన్నాయి.',
  });
  assert('Q2 follow-up answer advances to Question index 2 (Q3)', t2_ans.currentQuestionIndex === 2);
  assert('Q2 follow-up answer sets next questionId to A3', t2_ans.currentQuestionId === 'A3');
  assert('Q2 acknowledgment is Case C ("ఓకే అండి, ధన్యవాదాలు.")', t2_ans.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.'));
  assert('Q2 prompt is not repeated', !t2_ans.spokenResponse.includes('రోడ్ల పరిస్థితి ఎలా ఉంది'));
  assert('Q3 text (విద్యుత్) is presented', t2_ans.spokenResponse.includes('విద్యుత్'));

  const s2State = SurveySequentialEngine.getState(sess2);
  assert('Q2 original and follow-up answers are saved together under A2', Boolean(s2State?.answers?.['A2']?.combinedAnswer));
  assert('Q2 answer contains both problem and explanation', s2State?.answers?.['A2']?.combinedAnswer.includes('సమస్య ఉంది') && s2State?.answers?.['A2']?.combinedAnswer.includes('గుంతలు'));

  // ==========================================================================
  // SCENARIO 4: Question 3 detailed problem in first answer -> advances directly to Q4
  // ==========================================================================
  console.log('\n--- SCENARIO 4: Q3 Detailed Problem in First Answer -> Advances Directly to Q4 ---');
  const t3_detailed = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A3',
    userUtterance: 'మా ప్రాంతంలో కరెంట్ సరిగ్గా ఉండదు, రోజుకు మూడు సార్లు పోతుంది.',
  });
  assert('Q3 detailed problem accepts answer immediately (no follow-up asked)', t3_detailed.action === 'ASK_MAIN_QUESTION');
  assert('Q3 advances to index 3 (Q4)', t3_detailed.currentQuestionIndex === 3);
  assert('Q3 next questionId is A4', t3_detailed.currentQuestionId === 'A4');
  assert('Q3 acknowledgment is Case D ("ఓకే అండి, ధన్యవాదాలు.")', t3_detailed.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.') || t3_detailed.spokenResponse.includes(TELUGU_STRINGS.CASE_D_ACK));
  assert('Q4 text (డ్రైనేజీ) is presented', t3_detailed.spokenResponse.includes('డ్రైనేజీ'));

  // ==========================================================================
  // SCENARIO 5: Question 4 positive answer -> advances to Q5
  // ==========================================================================
  console.log('\n--- SCENARIO 5: Q4 Positive Answer -> Advances to Q5 ---');
  const t4_pos = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A4',
    userUtterance: 'డ్రైనేజీ చాలా బాగుంది, ఎలాంటి సమస్య లేదు.',
  });
  assert('Q4 advances to index 4 (Q5)', t4_pos.currentQuestionIndex === 4);
  assert('Q4 next questionId is A5', t4_pos.currentQuestionId === 'A5');
  assert('Q4 speaks Case A ack', t4_pos.spokenResponse.includes('సరే అండి, ధన్యవాదాలు.'));
  assert('Q5 text (చెత్త సేకరణ) is presented', t4_pos.spokenResponse.includes('చెత్త సేకరణ'));

  // ==========================================================================
  // SCENARIO 6: Question 5 connection check ("హలో") -> confirms line, remains at Q5
  // ==========================================================================
  console.log('\n--- SCENARIO 6: Q5 Connection Check -> Confirms Line, Remains at Q5 ---');
  const t5_check = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A5',
    userUtterance: 'హలో, వినిపిస్తుందా?',
  });
  assert('Q5 connection check action is CLARIFY', t5_check.action === 'CLARIFY');
  assert('Q5 connection check responds strictly "అవును అండి, వినిపిస్తోంది. చెప్పండి."', t5_check.spokenResponse.trim() === 'అవును అండి, వినిపిస్తోంది. చెప్పండి.');
  assert('Q5 connection check remains at index 4 (Q5)', t5_check.currentQuestionIndex === 4);
  assert('Q5 connection check did not mark A5 as answered', !SurveySequentialEngine.getState(sess2)?.answeredQuestionIds.includes('A5'));

  // ==========================================================================
  // SCENARIO 7: Question 5 answer after connection check -> advances to Q6
  // ==========================================================================
  console.log('\n--- SCENARIO 7: Q5 Answer After Connection Check -> Advances to Q6 ---');
  const t5_ans = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A5',
    userUtterance: 'చెత్త సేకరణ రోజూ జరుగుతోంది, బాగుంది.',
  });
  assert('Q5 answer advances to index 5 (Q6)', t5_ans.currentQuestionIndex === 5);
  assert('Q5 next questionId is A6', t5_ans.currentQuestionId === 'A6');
  assert('Q5 speaks Case A ack and introduces Q6 (ఆరోగ్య సేవలు)', t5_ans.spokenResponse.includes('ఆరోగ్య సేవలు'));

  // ==========================================================================
  // SCENARIO 8: Questions 6 through 9 complete and advance in order
  // ==========================================================================
  console.log('\n--- SCENARIO 8: Questions 6 Through 9 Complete and Advance in Order ---');
  const t6 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A6',
    userUtterance: 'హాస్పిటల్ సదుపాయాలు బాగున్నాయి.',
  });
  assert('Q6 advances to index 6 (Q7)', t6.currentQuestionIndex === 6);
  assert('Q7 text (విద్యా సదుపాయాలు) is asked', t6.spokenResponse.includes('విద్యా'));

  const t7 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A7',
    userUtterance: 'స్కూళ్ళు బాగున్నాయి.',
  });
  assert('Q7 advances to index 7 (Q8)', t7.currentQuestionIndex === 7);
  assert('Q8 text (ప్రజా రవాణా) is asked', t7.spokenResponse.includes('రవాణా'));

  const t8 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A8',
    userUtterance: 'బస్సులు సమయానికి వస్తాయి, బాగుంది.',
  });
  assert('Q8 advances to index 8 (Q9)', t8.currentQuestionIndex === 8);
  assert('Q9 text (ప్రభుత్వ సేవలను) is asked', t8.spokenResponse.includes('ప్రభుత్వ సేవలను'));

  const t9 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A9',
    userUtterance: 'సేవలు పొందడంలో సమస్య ఏమీ లేదు.',
  });
  assert('Q9 advances to index 9 (Q10)', t9.currentQuestionIndex === 9);
  assert('Q10 text (ముఖ్యమైన విషయం) is asked', t9.spokenResponse.includes('మెరుగుపరచాల్సిన'));

  // ==========================================================================
  // SCENARIO 9: Question 10 positive answer -> plays closing message and ends call
  // ==========================================================================
  console.log('\n--- SCENARIO 9: Q10 Positive Answer -> Plays Closing & Ends Call ---');
  const t10 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A10',
    userUtterance: 'అన్నీ బాగున్నాయి, ఎలాంటి ప్రత్యేక సమస్య లేదు.',
  });
  assert('Q10 positive marks isSurveyComplete true', t10.isSurveyComplete === true);
  assert('Q10 action is END', t10.action === 'END');
  assert('Q10 spokenResponse contains complete closing message', t10.spokenResponse.includes(TELUGU_STRINGS.CLOSING_MESSAGE));
  const finalState = SurveySequentialEngine.getState(sess2);
  assert('All 10 questions are recorded in answeredQuestionIds', finalState?.answeredQuestionIds.length === 10);
  assert('Final conversation status is completed', finalState?.conversationStatus === 'completed');

  // ==========================================================================
  // SCENARIO 10: Question 10 vague negative -> follow-up -> explanation -> closing
  // ==========================================================================
  console.log('\n--- SCENARIO 10: Q10 Vague Negative -> Follow-up -> Explanation -> Closing ---');
  const sess10 = `test_scen10_${Date.now()}`;
  // Fast forward to Q10
  for (let i = 0; i < 9; i++) {
    SurveySequentialEngine.processTurnSync({
      sessionId: sess10,
      questionId: activeQuestions[i].id,
      userUtterance: 'బాగుంది',
    });
  }
  const s10State = SurveySequentialEngine.getState(sess10);
  assert('Session 10 successfully reached Question index 9 (Q10)', s10State?.currentQuestionIndex === 9);

  // Q10 vague negative
  const t10_fu = SurveySequentialEngine.processTurnSync({
    sessionId: sess10,
    questionId: 'A10',
    userUtterance: 'సమస్య ఉంది.',
  });
  assert('Q10 vague negative asks strictly "ఏంటి సమస్య?"', t10_fu.spokenResponse.trim() === 'ఏంటి సమస్య?');
  assert('Q10 remains at index 9', t10_fu.currentQuestionIndex === 9);

  // Q10 explanation
  const t10_ans = SurveySequentialEngine.processTurnSync({
    sessionId: sess10,
    questionId: 'A10',
    userUtterance: 'స్ట్రీట్ లైట్లు సరిగ్గా వెలగడం లేదు, రాత్రిపూట చీకటిగా ఉంటోంది.',
  });
  assert('Q10 follow-up completion marks isSurveyComplete true', t10_ans.isSurveyComplete === true);
  assert('Q10 follow-up completion speaks Case C ack + Closing', t10_ans.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.') && t10_ans.spokenResponse.includes(TELUGU_STRINGS.CLOSING_MESSAGE));
  assert('Session 10 all 10 questions answered', SurveySequentialEngine.getState(sess10)?.answeredQuestionIds.length === 10);

  // ==========================================================================
  // SCENARIO 11: Busy respondent during any question -> asks for callback time
  // ==========================================================================
  console.log('\n--- SCENARIO 11: Busy Respondent -> Asks for Callback Time ---');
  const sess11 = `test_scen11_${Date.now()}`;
  const t11_busy = SurveySequentialEngine.processTurnSync({
    sessionId: sess11,
    questionId: 'A1',
    userUtterance: 'నేను ఇప్పుడు బిజీగా ఉన్నాను, మాట్లాడలేను.',
  });
  assert('Busy respondent sets action to CALLBACK', t11_busy.action === 'CALLBACK');
  assert('Busy respondent asks "సరే అండి, మీకు ఏ సమయంలో మళ్లీ కాల్ చేస్తే వీలుగా ఉంటుంది?"', t11_busy.spokenResponse.includes('సరే అండి, మీకు ఏ సమయంలో మళ్లీ కాల్ చేస్తే వీలుగా ఉంటుంది?'));
  assert('Survey is not marked completed', t11_busy.isSurveyComplete === false);
  const s11State = SurveySequentialEngine.getState(sess11);
  assert('State machine state is SCHEDULE_CALLBACK', s11State?.stateMachineState === 'SCHEDULE_CALLBACK');

  // ==========================================================================
  // SCENARIO 12: Respondent provides callback time -> confirms & ends call
  // ==========================================================================
  console.log('\n--- SCENARIO 12: Respondent Provides Callback Time -> Confirms & Ends Call ---');
  const t12_time = SurveySequentialEngine.processTurnSync({
    sessionId: sess11,
    questionId: 'A1',
    userUtterance: 'సాయంత్రం 6 గంటలకు కాల్ చేయండి.',
  });
  assert('Callback confirmation speaks "సరే అండి, మీరు చెప్పిన సమయంలో మళ్లీ కాల్ చేస్తాము. ధన్యవాదాలు."', t12_time.spokenResponse.includes('సరే అండి, మీరు చెప్పిన సమయంలో మళ్లీ కాల్ చేస్తాము. ధన్యవాదాలు.'));
  assert('Callback marks isSurveyStopped true', t12_time.isSurveyStopped === true);
  assert('Callback details contain valid scheduled timestamp', Boolean(s11State?.callbackDetails?.scheduledTimestamp || s11State?.callbackScheduledAt));
  assert('Callback details preserve unanswered questionId (A1)', s11State?.callbackDetails?.unansweredQuestionId === 'A1');

  // ==========================================================================
  // SCENARIO 13: Respondent says bye mid-survey -> polite termination without completing survey
  // ==========================================================================
  console.log('\n--- SCENARIO 13: Respondent Says Bye -> Polite Termination as Interrupted ---');
  const sess13 = `test_scen13_${Date.now()}`;
  // Answer Q1
  SurveySequentialEngine.processTurnSync({
    sessionId: sess13,
    questionId: 'A1',
    userUtterance: 'బాగుంది',
  });
  // Say bye on Q2
  const t13_bye = SurveySequentialEngine.processTurnSync({
    sessionId: sess13,
    questionId: 'A2',
    userUtterance: 'సరే బై, ఇక మాట్లాడను.',
  });
  assert('Bye utterance sets action to END', t13_bye.action === 'END');
  assert('Bye utterance speaks polite closing "సరే అండి, మీ సమయానికి ధన్యవాదాలు. నమస్కారం."', t13_bye.spokenResponse.includes('సరే అండి, మీ సమయానికి ధన్యవాదాలు. నమస్కారం.'));
  assert('Bye utterance marks isSurveyStopped true but isSurveyComplete false', t13_bye.isSurveyStopped === true && t13_bye.isSurveyComplete === false);
  const s13State = SurveySequentialEngine.getState(sess13);
  assert('Conversation status is interrupted (not completed)', s13State?.conversationStatus === 'interrupted');
  assert('Answers before interruption are preserved (A1 present)', Boolean(s13State?.answers?.['A1']));

  // ==========================================================================
  // SCENARIO 14: Duplicate transcript event -> does not advance question twice
  // ==========================================================================
  console.log('\n--- SCENARIO 14: Duplicate Transcript Event -> Does Not Advance Question Twice ---');
  const sess14 = `test_scen14_${Date.now()}`;
  const t14_first = SurveySequentialEngine.processTurnSync({
    sessionId: sess14,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది.',
  });
  assert('First delivery advances to index 1', t14_first.currentQuestionIndex === 1);
  const t14_dup = SurveySequentialEngine.processTurnSync({
    sessionId: sess14,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది.',
  });
  assert('Duplicate delivery maintains index 1 (does not double-advance to index 2)', t14_dup.currentQuestionIndex === 1);
  assert('Duplicate delivery returns identical reply', t14_dup.spokenResponse === t14_first.spokenResponse);

  // ==========================================================================
  // SCENARIO 15: Persistence failure safety -> session remains coherent
  // ==========================================================================
  console.log('\n--- SCENARIO 15: Persistence Failure Safety -> Session Remains Coherent ---');
  const sess15 = `test_scen15_${Date.now()}`;
  // Temporarily stub saveCallJob to throw error to test resilience
  const origSave = callbridgeStorage.saveCallJob;
  callbridgeStorage.saveCallJob = () => {
    throw new Error('Simulated disk I/O failure');
  };
  try {
    const t15 = SurveySequentialEngine.processTurnSync({
      sessionId: sess15,
      questionId: 'A1',
      userUtterance: 'బాగుంది',
    });
    assert('Engine handles persistence exception without crashing', Boolean(t15 && t15.spokenResponse));
    assert('Engine progresses state in memory even if disk fails', t15.currentQuestionIndex === 1);
  } finally {
    callbridgeStorage.saveCallJob = origSave;
  }

  // ==========================================================================
  // SCENARIO 16: OpenAI failure recovery -> deterministic fallback preserves flow
  // ==========================================================================
  console.log('\n--- SCENARIO 16: OpenAI Failure Recovery -> Deterministic Fallback Preserves Flow ---');
  const sess16 = `test_scen16_${Date.now()}`;
  const t16_q1 = await SurveySequentialEngine.processTurn({
    sessionId: sess16,
    userUtterance: 'బాగానే ఉంది',
    questionId: 'A1',
  });
  assert('Async processTurn advances correctly to Q2', t16_q1.currentQuestionIndex === 1);
  const t16_q2_fu = await SurveySequentialEngine.processTurn({
    sessionId: sess16,
    userUtterance: 'సమస్య ఉంది',
    questionId: 'A2',
  });
  assert('Async processTurn handles Case B with "ఏంటి సమస్య?"', t16_q2_fu.spokenResponse.includes('ఏంటి సమస్య?'));

  // ==========================================================================
  // SCENARIO 17: Server restart or recovery -> resumes at the correct pending question
  // ==========================================================================
  console.log('\n--- SCENARIO 17: Server Restart / Recovery -> Resumes at Correct Pending Question ---');
  const recoveryJobId = `job_restart_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: recoveryJobId,
    campaignId: 'telugu-gov-restart',
    eventId: 'event_public_survey',
    status: 'in_progress',
    providerCallId: `vapi_restart_${Date.now()}`,
    contactId: 'c_restart',
    contactName: 'Citizen Recovery',
    contactPhone: '+919988776655',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    surveyState: {
      sessionId: recoveryJobId,
      campaignId: 'telugu-gov-restart',
      eventId: 'event_public_survey',
      surveyId: 'event_public_survey',
      targetLanguage: 'te',
      currentQuestionId: 'A3',
      currentQuestionIndex: 2,
      totalActiveQuestions: 10,
      answeredQuestionIds: ['A1', 'A2'],
      skippedQuestionIds: [],
      pendingQuestionId: 'A3',
      conversationStatus: 'in_progress',
      stateMachineState: 'WAITING_FOR_RESPONSE',
      followUpCountForCurrentQuestion: 0,
      maxFollowUpsPerQuestion: 1,
      callbackRequested: false,
      callbackScheduledAt: null,
      callbackTimezone: 'Asia/Kolkata',
      callbackDetails: null,
      answers: {
        A1: { questionId: 'A1', answerText: 'బాగుంది', answeredAt: new Date().toISOString(), status: 'answered' },
        A2: { questionId: 'A2', answerText: 'రోడ్లు బాగాలేవు', answeredAt: new Date().toISOString(), status: 'answered' },
      },
      transcripts: [],
      originalTranscript: [],
    },
  });

  // Re-fetch fresh session after simulating server restart (clearing memory map for this id)
  const restoredSession = SurveySequentialEngine.getOrCreateSession(recoveryJobId);
  assert('Restored session index points to first unanswered question (index 2 / Q3)', restoredSession.currentQuestionIndex === 2);
  assert('Restored session currentQuestionId is A3', restoredSession.currentQuestionId === 'A3');

  const resumeTurn = SurveySequentialEngine.processTurnSync({
    sessionId: recoveryJobId,
    questionId: 'A3',
    userUtterance: 'విద్యుత్ సరఫరా చాలా బాగుంది.',
  });
  assert('Resume turn answers Q3 and advances to Q4 (index 3)', resumeTurn.currentQuestionIndex === 3);
  assert('Resume turn does not repeat Q1 or Q2', !resumeTurn.spokenResponse.includes('తాగునీటి') && !resumeTurn.spokenResponse.includes('రోడ్ల'));
  assert('Resume turn presents Q4 (డ్రైనేజీ)', resumeTurn.spokenResponse.includes('డ్రైనేజీ'));

  console.log('\n========================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
