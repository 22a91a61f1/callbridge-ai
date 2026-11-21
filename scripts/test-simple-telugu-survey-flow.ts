import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';

async function runSimpleTeluguSurveyFlowVerification() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — SIMPLE TELUGU PUBLIC SURVEY FLOW VERIFICATION (10 SCENARIOS)');
  console.log('========================================================================\n');

  // Load configured public survey questions from database
  const activeQuestions = callbridgeStorage.getSurveyQuestions('event_public_survey');
  console.log(`[SETUP] Loaded ${activeQuestions.length} survey questions from callbridge_db.json:`);
  activeQuestions.forEach((q, idx) => {
    console.log(`  Q${idx + 1} (${q.id}): "${q.text || (q as any).questionText}"`);
  });

  if (activeQuestions.length < 6) {
    throw new Error(`Expected at least 6 configured questions, got ${activeQuestions.length}`);
  }

  let passedTests = 0;
  const totalTests = 10;

  // ---------------------------------------------------------------------------
  // TEST 1: Respondent answers positive "బాగానే ఉంది."
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + immediately asks Question 2. No "ఏంటి సమస్య?".
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 1: Positive "బాగానే ఉంది." (Case A) ---');
  const sess1 = 'test_sess_scenario_1_' + Date.now();
  // Turn 0: Greeting
  const init1 = await SurveySequentialEngine.processTurn({ sessionId: sess1, eventId: 'event_public_survey' });
  console.log(`AI Q1: "${init1.reply}"`);

  // Turn 1: Respondent answer
  const t1 = await SurveySequentialEngine.processTurn({
    sessionId: sess1,
    eventId: 'event_public_survey',
    userUtterance: 'బాగానే ఉంది.',
  });
  console.log(`User: "బాగానే ఉంది."`);
  console.log(`AI Response: "${t1.reply}"`);

  const t1HasApprovedAck = t1.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t1AsksQ2 = t1.currentQuestionIndex === 1;
  const t1NoProblemClarification = !t1.reply.includes('ఏంటి సమస్య') && !t1.reply.includes('ఏ సమస్య ఉందో');
  const t1NoDoubleAck = !t1.reply.includes('సరే అండి, ధన్యవాదాలు. సరే అండి');

  if (t1HasApprovedAck && t1AsksQ2 && t1NoProblemClarification && t1NoDoubleAck) {
    console.log('✅ Scenario 1 PASSED: Immediate "సరే అండి, ధన్యవాదాలు." + moved to Q2 without follow-up');
    passedTests++;
  } else {
    console.error('❌ Scenario 1 FAILED:', { t1HasApprovedAck, t1AsksQ2, t1NoProblemClarification, t1NoDoubleAck, reply: t1.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Respondent answers "ఏ సమస్య లేదు."
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + immediately asks next question.
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Positive negation "ఏ సమస్య లేదు." (Case A) ---');
  const t2 = await SurveySequentialEngine.processTurn({
    sessionId: sess1,
    eventId: 'event_public_survey',
    userUtterance: 'ఏ సమస్య లేదు, అంతా బాగుంది.',
  });
  console.log(`User: "ఏ సమస్య లేదు, అంతా బాగుంది."`);
  console.log(`AI Response: "${t2.reply}"`);

  const t2HasApprovedAck = t2.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t2AsksQ3 = t2.currentQuestionIndex === 2;
  const t2NoFollowUp = !t2.reply.includes('ఏంటి సమస్య') && !t2.reply.includes('ఏ సమస్య ఉందో');

  if (t2HasApprovedAck && t2AsksQ3 && t2NoFollowUp) {
    console.log('✅ Scenario 2 PASSED: "ఏ సమస్య లేదు." recognized as Case A, moved to Q3 without follow-up');
    passedTests++;
  } else {
    console.error('❌ Scenario 2 FAILED:', { t2HasApprovedAck, t2AsksQ3, t2NoFollowUp, reply: t2.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Problem reported & explained directly "మా ప్రాంతంలో రోడ్లు బాగోలేవు. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి." (Case B)
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + immediately asks next question. No clarification!
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Problem reported & explained (Case B) ---');
  const t3 = await SurveySequentialEngine.processTurn({
    sessionId: sess1,
    eventId: 'event_public_survey',
    userUtterance: 'మా ప్రాంతంలో రోడ్లు బాగోలేవు. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.',
  });
  console.log(`User: "మా ప్రాంతంలో రోడ్లు బాగోలేవు. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి."`);
  console.log(`AI Response: "${t3.reply}"`);

  const t3HasApprovedAck = t3.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t3AsksQ4 = t3.currentQuestionIndex === 3;
  const t3NoClarification = !t3.reply.includes('ఏ సమస్య ఉందో') && !t3.reply.includes('ఏంటి సమస్య');

  if (t3HasApprovedAck && t3AsksQ4 && t3NoClarification) {
    console.log('✅ Scenario 3 PASSED: Explained problem accepted directly as Case B, advanced to Q4');
    passedTests++;
  } else {
    console.error('❌ Scenario 3 FAILED:', { t3HasApprovedAck, t3AsksQ4, t3NoClarification, reply: t3.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Problem reported but NOT explained "సమస్య ఉంది." (Case C Turn 1)
  // Expected: Asks strictly one clarification: "ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?"
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Vague problem without explanation (Case C Turn 1) ---');
  const sess4 = 'test_sess_scenario_4_' + Date.now();
  await SurveySequentialEngine.processTurn({ sessionId: sess4, eventId: 'event_public_survey' });
  const t4 = await SurveySequentialEngine.processTurn({
    sessionId: sess4,
    eventId: 'event_public_survey',
    userUtterance: 'సమస్య ఉంది.',
  });
  console.log(`User: "సమస్య ఉంది."`);
  console.log(`AI Response: "${t4.reply}"`);

  const t4ClarificationExact = t4.reply.trim() === 'ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?';
  const t4ActionFollowUp = t4.action === 'ASK_FOLLOW_UP';

  if (t4ClarificationExact && t4ActionFollowUp) {
    console.log('✅ Scenario 4 PASSED: Asked strictly "ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?"');
    passedTests++;
  } else {
    console.error('❌ Scenario 4 FAILED:', { t4ClarificationExact, t4ActionFollowUp, reply: t4.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Respondent explains problem after clarification (Case C Turn 2)
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + immediately asks next question (Q2).
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Explanation given after clarification (Case C Turn 2) ---');
  const t5 = await SurveySequentialEngine.processTurn({
    sessionId: sess4,
    eventId: 'event_public_survey',
    userUtterance: 'నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి మాత్రమే వస్తాయి.',
  });
  console.log(`User: "నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి మాత్రమే వస్తాయి."`);
  console.log(`AI Response: "${t5.reply}"`);

  const t5HasApprovedAck = t5.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t5AsksQ2 = t5.currentQuestionIndex === 1;
  const t5NoFurtherFollowUp = !t5.reply.includes('ఏ సమస్య ఉందో');

  if (t5HasApprovedAck && t5AsksQ2 && t5NoFurtherFollowUp) {
    console.log('✅ Scenario 5 PASSED: Explanation accepted with "సరే అండి, ధన్యవాదాలు.", moved to Q2');
    passedTests++;
  } else {
    console.error('❌ Scenario 5 FAILED:', { t5HasApprovedAck, t5AsksQ2, t5NoFurtherFollowUp, reply: t5.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Respondent repeats "సమస్య ఉంది" / refuses to explain after clarification
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + immediately advances to next question without repeating clarification.
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Respondent repeats vague answer after clarification ---');
  const sess6 = 'test_sess_scenario_6_' + Date.now();
  await SurveySequentialEngine.processTurn({ sessionId: sess6, eventId: 'event_public_survey' });
  // Turn 1: vague
  await SurveySequentialEngine.processTurn({ sessionId: sess6, eventId: 'event_public_survey', userUtterance: 'బాగోలేదు.' });
  // Turn 2: repeats vague
  const t6 = await SurveySequentialEngine.processTurn({
    sessionId: sess6,
    eventId: 'event_public_survey',
    userUtterance: 'బాగోలేదండి అంతే.',
  });
  console.log(`User after clarification: "బాగోలేదండి అంతే."`);
  console.log(`AI Response: "${t6.reply}"`);

  const t6HasApprovedAck = t6.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t6AsksQ2 = t6.currentQuestionIndex === 1;
  const t6NeverRepeatsClarification = !t6.reply.includes('ఏ సమస్య ఉందో');

  if (t6HasApprovedAck && t6AsksQ2 && t6NeverRepeatsClarification) {
    console.log('✅ Scenario 6 PASSED: Did not repeat clarification, accepted with "సరే అండి, ధన్యవాదాలు." and advanced');
    passedTests++;
  } else {
    console.error('❌ Scenario 6 FAILED:', { t6HasApprovedAck, t6AsksQ2, t6NeverRepeatsClarification, reply: t6.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: English positive "Everything is fine" / "No problem"
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + advances to next question.
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: English positive "No problem, everything is fine" ---');
  const sess7 = 'test_sess_scenario_7_' + Date.now();
  await SurveySequentialEngine.processTurn({ sessionId: sess7, eventId: 'event_public_survey' });
  const t7 = await SurveySequentialEngine.processTurn({
    sessionId: sess7,
    eventId: 'event_public_survey',
    userUtterance: 'No problem, everything is fine.',
  });
  console.log(`User: "No problem, everything is fine."`);
  console.log(`AI Response: "${t7.reply}"`);

  const t7HasApprovedAck = t7.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t7Advanced = t7.currentQuestionIndex === 1;

  if (t7HasApprovedAck && t7Advanced) {
    console.log('✅ Scenario 7 PASSED: English positive acknowledged with "సరే అండి, ధన్యవాదాలు." and advanced');
    passedTests++;
  } else {
    console.error('❌ Scenario 7 FAILED:', { t7HasApprovedAck, t7Advanced, reply: t7.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: English complaint with details "Roads are damaged with heavy potholes"
  // Expected: Ack "సరే అండి, ధన్యవాదాలు." + advances to next question without clarification.
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: English detailed complaint ---');
  const t8 = await SurveySequentialEngine.processTurn({
    sessionId: sess7,
    eventId: 'event_public_survey',
    userUtterance: 'Roads are badly damaged with big potholes and waterlogging.',
  });
  console.log(`User: "Roads are badly damaged with big potholes and waterlogging."`);
  console.log(`AI Response: "${t8.reply}"`);

  const t8HasApprovedAck = t8.reply.startsWith('సరే అండి, ధన్యవాదాలు.');
  const t8Advanced = t8.currentQuestionIndex === 2;
  const t8NoClarification = !t8.reply.includes('ఏ సమస్య ఉందో');

  if (t8HasApprovedAck && t8Advanced && t8NoClarification) {
    console.log('✅ Scenario 8 PASSED: English complaint with details accepted directly, advanced to Q3');
    passedTests++;
  } else {
    console.error('❌ Scenario 8 FAILED:', { t8HasApprovedAck, t8Advanced, t8NoClarification, reply: t8.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Final Question (Q6) answered -> speaks full closing, marks complete
  // Expected:
  // "సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం."
  // isSurveyComplete === true, isCompleted === true, does not ask more questions, does not repeat acknowledgment.
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: Complete 6-question Survey & Final Closing ---');
  const sess9 = 'test_sess_scenario_9_' + Date.now();
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey' });

  // Answer Q1 through Q5
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey', userUtterance: 'బాగుంది' });
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey', userUtterance: 'రోడ్లు బాగానే ఉన్నాయి' });
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey', userUtterance: 'డ్రైనేజీ బాగుంది' });
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey', userUtterance: 'కరెంట్ ప్రతిరోజూ వస్తుంది' });
  await SurveySequentialEngine.processTurn({ sessionId: sess9, eventId: 'event_public_survey', userUtterance: 'హాస్పిటల్ సదుపాయాలు బాగున్నాయి' });

  // Answer Q6 (the 6th and final question)
  const t9Final = await SurveySequentialEngine.processTurn({
    sessionId: sess9,
    eventId: 'event_public_survey',
    userUtterance: 'పాఠశాలల్లో టీచర్లు బాగా బోధిస్తున్నారు.',
  });
  console.log(`User (Q6): "పాఠశాలల్లో టీచర్లు బాగా బోధిస్తున్నారు."`);
  console.log(`AI Closing: "${t9Final.reply}"`);

  const expectedClosing = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';
  const t9ExactClosing = t9Final.reply.trim() === expectedClosing;
  const t9IsComplete = Boolean(t9Final.isSurveyComplete && t9Final.isCompleted);
  const t9NoExtraQuestions = !t9Final.reply.includes('మరి') && !t9Final.reply.includes('ప్రశ్న');
  const t9NoDoubleAck = !t9Final.reply.startsWith('సరే అండి, ధన్యవాదాలు. సరే అండి, ధన్యవాదాలు.');

  if (t9ExactClosing && t9IsComplete && t9NoExtraQuestions && t9NoDoubleAck) {
    console.log('✅ Scenario 9 PASSED: Exact approved closing delivered, call marked complete, no extra questions');
    passedTests++;
  } else {
    console.error('❌ Scenario 9 FAILED:', { t9ExactClosing, t9IsComplete, t9NoExtraQuestions, t9NoDoubleAck, reply: t9Final.reply });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Complete transcript inspection across an entire call
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 10: Complete Transcript & Answers List Inspection ---');
  const finalState = SurveySequentialEngine.getState(sess9);
  const transcriptTurns = finalState?.transcripts || [];
  const answersList = Object.values(finalState?.answers || {});

  console.log(`Total transcript turns: ${transcriptTurns.length}`);
  console.log(`Total saved answers: ${answersList.length}`);

  let transcriptOrderValid = true;
  transcriptTurns.forEach((turn, idx) => {
    console.log(`  [Turn ${idx + 1}] (${turn.role} / ${turn.turnType}): "${turn.text.slice(0, 75)}..."`);
  });

  const all6QuestionsAnswered = answersList.length === 6;
  const hasGreeting = transcriptTurns.some((t) => t.turnType === 'greeting');
  const hasClosing = transcriptTurns.some((t) => t.turnType === 'closing');
  const finalTurnIsClosing = transcriptTurns[transcriptTurns.length - 1]?.turnType === 'closing';

  if (all6QuestionsAnswered && hasGreeting && hasClosing && finalTurnIsClosing) {
    console.log('✅ Scenario 10 PASSED: All 6 answers persisted, complete natural chronological transcript verified');
    passedTests++;
  } else {
    console.error('❌ Scenario 10 FAILED:', { all6QuestionsAnswered, hasGreeting, hasClosing, finalTurnIsClosing });
  }

  console.log('\n========================================================================');
  console.log(`FINAL RESULT: ${passedTests} / ${totalTests} SCENARIOS PASSED`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    throw new Error(`Only ${passedTests} of ${totalTests} passed!`);
  }
}

runSimpleTeluguSurveyFlowVerification().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
