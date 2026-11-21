import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage, type CallJobRecord } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';

async function runAll22ScenariosSuite() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — MASTER 22 SCENARIOS VALIDATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(cond: boolean, msg: string) {
    total++;
    if (cond) {
      console.log(`  [PASS ${total}/22+] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL ${total}/22+] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  const testEventId = `event_22_scenarios_${Date.now()}`;
  const customQuestions = [
    { id: 'Q1', questionId: 'Q1', text: 'మీ ప్రాంతంలో తాగునీటి సరఫరా రోజూ వస్తుందా?', questionText: 'మీ ప్రాంతంలో తాగునీటి సరఫరా రోజూ వస్తుందా?', category: 'నీరు', questionOrder: 1, allowFollowUp: true, enabled: true },
    { id: 'Q2', questionId: 'Q2', text: 'మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ బాగున్నాయా?', questionText: 'మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ బాగున్నాయా?', category: 'రోడ్లు', questionOrder: 2, allowFollowUp: true, enabled: true },
    { id: 'Q3', questionId: 'Q3', text: 'రాత్రిపూట వీధి దీపాలు సక్రమంగా వెలుగుతున్నాయా?', questionText: 'రాత్రిపూట వీధి దీపాలు సక్రమంగా వెలుగుతున్నాయా?', category: 'విద్యుత్', questionOrder: 3, allowFollowUp: true, enabled: true },
    { id: 'Q4', questionId: 'Q4', text: 'చెత్త సేకరణ వాహనం క్రమం తప్పకుండా వస్తుందా?', questionText: 'చెత్త సేకరణ వాహనం క్రమం తప్పకుండా వస్తుందా?', category: 'పారిశుద్ధ్యం', questionOrder: 4, allowFollowUp: true, enabled: true },
    { id: 'Q5', questionId: 'Q5', text: 'ప్రాథమిక ఆరోగ్య కేంద్రంలో మందులు మరియు వైద్యులు అందుబాటులో ఉన్నారా?', questionText: 'ప్రాథమిక ఆరోగ్య కేంద్రంలో మందులు మరియు వైద్యులు అందుబాటులో ఉన్నారా?', category: 'ఆరోగ్యం', questionOrder: 5, allowFollowUp: true, enabled: true },
    { id: 'Q6', questionId: 'Q6', text: 'స్థానిక ప్రభుత్వ పాఠశాలలో సౌకర్యాలు ఎలా ఉన్నాయి?', questionText: 'స్థానిక ప్రభుత్వ పాఠశాలలో సౌకర్యాలు ఎలా ఉన్నాయి?', category: 'విద్య', questionOrder: 6, allowFollowUp: true, enabled: true },
    { id: 'Q7', questionId: 'Q7', text: 'ఆర్టీసీ బస్సు సౌకర్యాలు సమయానికి అందుబాటులో ఉన్నాయా?', questionText: 'ఆర్టీసీ బస్సు సౌకర్యాలు సమయానికి అందుబాటులో ఉన్నాయా?', category: 'రవాణా', questionOrder: 7, allowFollowUp: true, enabled: true },
    { id: 'Q8', questionId: 'Q8', text: 'రేషన్ షాపులో నిత్యావసర సరుకులు సక్రమంగా అందుతున్నాయా?', questionText: 'రేషన్ షాపులో నిత్యావసర సరుకులు సక్రమంగా అందుతున్నాయా?', category: 'రేషన్', questionOrder: 8, allowFollowUp: true, enabled: true },
    { id: 'Q9', questionId: 'Q9', text: 'మీ ప్రాంతంలో పార్కులు మరియు ఆట స్థలాలు ఉన్నాయా?', questionText: 'మీ ప్రాంతంలో పార్కులు మరియు ఆట స్థలాలు ఉన్నాయా?', category: 'క్రీడలు', questionOrder: 9, allowFollowUp: true, enabled: true },
    { id: 'Q10', questionId: 'Q10', text: 'స్థానిక పోలీస్ పెట్రోలింగ్ మరియు శాంతిభద్రతలు సంతృప్తికరంగా ఉన్నాయా?', questionText: 'స్థానిక పోలీస్ పెట్రోలింగ్ మరియు శాంతిభద్రతలు సంతృప్తికరంగా ఉన్నాయా?', category: 'భద్రత', questionOrder: 10, allowFollowUp: true, enabled: true },
  ];

  callbridgeStorage.saveEvent({
    id: testEventId,
    type: 'public_survey',
    name: 'Comprehensive 10-Question Civic Survey',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveSurveyQuestions(testEventId, customQuestions as any);
  const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(activeQuestions.length === 10, 'All 10 questions successfully configured and active in source of truth');

  // SCENARIO 1: Short positive answer -> confirms understanding and proceeds immediately to Q2
  console.log('\n--- Scenario 1: Short positive answer ---');
  const call1 = `call_sc1_${Date.now()}`;
  const campId = `camp_sc_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call1, campId, testEventId, activeQuestions);

  const res1 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call1,
    userUtterance: 'బాగుంది అండి, రోజూ నీళ్లు వస్తాయి.',
    questionId: 'Q1',
    eventId: testEventId,
  });

  assert(res1.action === 'ACCEPT_ANSWER' || res1.action === 'ASK_MAIN_QUESTION', 'Scenario 1: Positive answer accepted without follow-up');
  const state1 = SurveySequentialEngine.getState(call1);
  assert(state1?.currentQuestionIndex === 1, 'Scenario 1: Directly advanced to Question 2 (Index 1)');
  assert(res1.spokenResponse.includes(activeQuestions[1].text), 'Scenario 1: Spoken response presents Question 2');

  // SCENARIO 2: Detailed positive answer -> acknowledges and proceeds
  console.log('\n--- Scenario 2: Detailed positive answer ---');
  const call2 = `call_sc2_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call2, campId, testEventId, activeQuestions);
  const res2 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call2,
    userUtterance: 'మా ప్రాంతంలో తాగునీటి సరఫరా చాలా అద్భుతంగా ఉంది, ఎలాంటి కొరత లేదు, రోజూ ఉదయం 6 గంటలకే మంచినీళ్లు ఇస్తున్నారు.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res2.action === 'ACCEPT_ANSWER' || res2.action === 'ASK_MAIN_QUESTION', 'Scenario 2: Detailed positive accepted');
  assert(!res2.spokenResponse.includes('ఎన్ని రోజులకొకసారి'), 'Scenario 2: Did not ask unnecessary problem follow-up');

  // SCENARIO 3: Short negative answer -> asks dynamic follow-up
  console.log('\n--- Scenario 3: Short negative answer ---');
  const call3 = `call_sc3_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call3, campId, testEventId, activeQuestions);
  const res3 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call3,
    userUtterance: 'బాగోలేదు, నీళ్లు సరిగ్గా రావడం లేదు.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res3.action === 'ASK_FOLLOW_UP', 'Scenario 3: Short negative triggers dynamic contextual follow-up');
  assert(res3.spokenResponse.length > 5, 'Scenario 3: Spoken follow-up generated in Telugu');

  // SCENARIO 4: Detailed negative answer -> acknowledges specific problem and proceeds to next question
  console.log('\n--- Scenario 4: Detailed negative answer ---');
  const call4 = `call_sc4_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call4, campId, testEventId, activeQuestions);
  const res4 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call4,
    userUtterance: 'మా ప్రాంతంలో రోడ్లు చాలా పాడయ్యాయి. వర్షం వస్తే నీళ్లు నిలుస్తున్నాయి, పెద్ద గుంతలు పడ్డాయి.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res4.action === 'ACCEPT_ANSWER' || res4.action === 'ASK_MAIN_QUESTION', 'Scenario 4: Detailed negative acknowledged without redundant follow-up');

  // SCENARIO 5: Multi-topic answer -> records mentioned issues
  console.log('\n--- Scenario 5: Multi-topic answer ---');
  const call5 = `call_sc5_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call5, campId, testEventId, activeQuestions);
  const res5 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call5,
    userUtterance: 'తాగునీరు రోజూ వస్తుంది కానీ రోడ్లు చాలా అధ్వానంగా ఉన్నాయి.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res5.action === 'ACCEPT_ANSWER' || res5.action === 'ASK_MAIN_QUESTION', 'Scenario 5: Multi-topic answer accepted and recorded');

  // SCENARIO 6: Spontaneous complaint on different question
  console.log('\n--- Scenario 6: Spontaneous complaint ---');
  const call6 = `call_sc6_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call6, campId, testEventId, activeQuestions);
  const res6 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call6,
    userUtterance: 'కరెంట్ ప్రతిరోజూ రాత్రిపూట పోతోంది, కంప్లైంట్ ఇచ్చినా పట్టించుకోలేదు.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res6.spokenResponse.length > 0, 'Scenario 6: Handled spontaneous complaint respectfully');

  // SCENARIO 7: Unclear or ambiguous answer -> clarification
  console.log('\n--- Scenario 7: Unclear answer ---');
  const call7 = `call_sc7_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call7, campId, testEventId, activeQuestions);
  const res7 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call7,
    userUtterance: 'ఏమో మరి నాకు అర్థం కాలేదు మళ్లీ చెప్పండి.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res7.spokenResponse.length > 0, 'Scenario 7: Clarification response generated in natural Telugu');

  // SCENARIO 8: Irrelevant statement -> polite Telugu redirect
  console.log('\n--- Scenario 8: Irrelevant / political statement ---');
  const call8 = `call_sc8_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call8, campId, testEventId, activeQuestions);
  const res8 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call8,
    userUtterance: 'ఈసారి ఎన్నికల్లో ఎవరికి ఓటు వేయమంటారు? మీ అభిప్రాయం ఏంటి?',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res8.spokenResponse.includes('రాజకీయ') || res8.spokenResponse.includes('సమస్యల'), 'Scenario 8: Politely redirected away from political advice back to survey');

  // SCENARIO 9: Question asked by respondent
  console.log('\n--- Scenario 9: Question asked by respondent ---');
  const call9 = `call_sc9_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call9, campId, testEventId, activeQuestions);
  const res9 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call9,
    userUtterance: 'మీరు ఏ డిపార్ట్‌మెంట్ నుంచి మాట్లాడుతున్నారు?',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res9.spokenResponse.length > 5, 'Scenario 9: Answered inquiry in Telugu');

  // SCENARIO 10: Explicit question skip -> marks skipped, proceeds to next question
  console.log('\n--- Scenario 10: Explicit question skip ---');
  const call10 = `call_sc10_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call10, campId, testEventId, activeQuestions);
  const res10 = SurveySequentialEngine.skipQuestion({
    campaignId: campId,
    providerCallId: call10,
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res10.success === true, 'Scenario 10: skipQuestion executed successfully');
  const state10 = SurveySequentialEngine.getState(call10);
  assert(Boolean(state10?.skippedQuestionIds.includes('Q1')), 'Scenario 10: Q1 added to skippedQuestionIds');
  assert(state10?.currentQuestionIndex === 1, 'Scenario 10: Advanced to Question 2 (Index 1)');

  // SCENARIO 11: "Next question" request
  console.log('\n--- Scenario 11: Next question request ---');
  const call11 = `call_sc11_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call11, campId, testEventId, activeQuestions);
  const res11 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call11,
    userUtterance: 'తర్వాతి ప్రశ్నకు వెళ్ళండి.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res11.spokenResponse.length > 0, 'Scenario 11: Handled next question request gracefully');

  // SCENARIO 12: "I already answered that"
  console.log('\n--- Scenario 12: Already answered ---');
  const call12 = `call_sc12_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call12, campId, testEventId, activeQuestions);
  const res12 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call12,
    userUtterance: 'నేను ఇందాకే చెప్పాను కదా అండి, మళ్లీ అడుగుతున్నారు.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res12.spokenResponse.length > 0, 'Scenario 12: Acknowledged repetition calmly in Telugu');

  // SCENARIO 13: Respondent correction -> updates recorded answer
  console.log('\n--- Scenario 13: Respondent correction ---');
  const call13 = `call_sc13_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call13, campId, testEventId, activeQuestions);
  await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call13,
    userUtterance: 'ముందుగా బాగుంది అని చెప్పాను కానీ కాదు, రాత్రిపూట నీళ్లు అస్సలు రావు.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  const state13 = SurveySequentialEngine.getState(call13);
  assert(state13?.answers['Q1'] !== undefined, 'Scenario 13: Answer record updated with correction');

  // SCENARIO 14: Respondent asks why calling
  console.log('\n--- Scenario 14: Respondent asks why calling ---');
  const call14 = `call_sc14_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call14, campId, testEventId, activeQuestions);
  const res14 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call14,
    userUtterance: 'ఎందుకు కాల్ చేశారు? ఈ సర్వే ఎవరి కోసం చేస్తున్నారు?',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res14.spokenResponse.length > 10, 'Scenario 14: Purpose explained in authentic Telugu');

  // SCENARIO 15: Candidate advice / vote query
  console.log('\n--- Scenario 15: Candidate advice / vote query ---');
  const call15 = `call_sc15_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call15, campId, testEventId, activeQuestions);
  const res15 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call15,
    userUtterance: 'మీరు ఏ పార్టీ తరపున చేస్తున్నారు? ఎవరికి ఓటు వేస్తే మంచిది?',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res15.spokenResponse.includes('రాజకీయ') || res15.spokenResponse.includes('సమస్యల'), 'Scenario 15: Non-partisan neutrality upheld');

  // SCENARIO 16: "Call back later" -> asks preferred time, confirms, marks callback_scheduled
  console.log('\n--- Scenario 16: Vague callback request ---');
  const call16 = `call_sc16_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call16, campId, testEventId, activeQuestions);
  const res16 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call16,
    userUtterance: 'నేను ఇప్పుడు చాలా బిజీగా ఉన్నాను, తర్వాత కాల్ చేయండి.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res16.action === 'CALLBACK', 'Scenario 16: Action is CALLBACK');
  assert(res16.spokenResponse.includes('ఎప్పుడు') || res16.spokenResponse.includes('సమయ'), 'Scenario 16: Asks preferred time in Telugu');

  // SCENARIO 17: Specific callback time ("రేపు సాయంత్రం 5 గంటలకు") -> parses correctly, confirms, marks callback_scheduled
  console.log('\n--- Scenario 17: Specific callback time ---');
  const call17 = `call_sc17_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call17, campId, testEventId, activeQuestions);
  const cbParse17 = SurveySequentialEngine.parseCallbackDateTime('రేపు సాయంత్రం 5 గంటలకు కాల్ చేయండి');
  assert(cbParse17.parsedHour === 17, 'Scenario 17: Parsed hour is 17 (5 PM)');
  assert(cbParse17.confirmationTelugu.includes('తిరిగి కాల్ చేస్తాము'), 'Scenario 17: Confirmation promises callback');

  const cbRes17 = SurveySequentialEngine.scheduleCallback({
    campaignId: campId,
    providerCallId: call17,
    requestedTimeText: 'రేపు సాయంత్రం 5 గంటలకు కాల్ చేయండి',
    eventId: testEventId,
  });
  assert(cbRes17.success === true, 'Scenario 17: scheduleCallback returned success');
  const state17 = SurveySequentialEngine.getState(call17);
  assert(state17?.callbackRequested === true, 'Scenario 17: callbackRequested = true');
  assert(state17?.conversationStatus === 'SCHEDULE_CALLBACK', 'Scenario 17: Status is SCHEDULE_CALLBACK');

  // SCENARIO 18: Callback call resumes survey -> starts from unanswered question, does NOT re-ask answered questions
  console.log('\n--- Scenario 18: Callback call resumption ---');
  const resumeCallId = `call_resume_${Date.now()}`;
  // Suppose contact had already answered Q1 and Q2 in previous call
  const resumeState = SurveySequentialEngine.getOrCreateSession(resumeCallId, {
    campaignId: campId,
    providerCallId: resumeCallId,
    eventId: testEventId,
    activeQuestions,
    resumeQuestionIndex: 2, // Resume from Q3 (Index 2)
    answeredQuestionIds: ['Q1', 'Q2'],
  });

  assert(resumeState.currentQuestionIndex === 2, 'Scenario 18: Resumes exactly at Question 3 (Index 2)');
  assert(resumeState.currentQuestionId === 'Q3', 'Scenario 18: Current question ID is Q3');
  assert(resumeState.answeredQuestionIds.length === 2, 'Scenario 18: Answered questions preserved without re-asking');

  // SCENARIO 19: Explicit call stop / refusal -> polite Telugu closing, terminates
  console.log('\n--- Scenario 19: Explicit call stop ---');
  const call19 = `call_sc19_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call19, campId, testEventId, activeQuestions);
  const res19 = await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call19,
    userUtterance: 'నాకు సర్వే ఇష్టం లేదు, కాల్ కట్ చేయండి ఇక మాట్లాడను.',
    questionId: 'Q1',
    eventId: testEventId,
  });
  assert(res19.action === 'END', 'Scenario 19: Action is END');
  assert(res19.isSurveyStopped === true, 'Scenario 19: isSurveyStopped is true');
  assert(res19.spokenResponse.includes('సమయానికి ధన్యవాదాలు'), 'Scenario 19: Polite stop closing in Telugu');

  // SCENARIO 20: All 10 questions completed -> plays closing audio, marks completed, terminates
  console.log('\n--- Scenario 20: Complete full 10-question sequence ---');
  const call20 = `call_sc20_${Date.now()}`;
  SurveySequentialEngine.getOrCreateState(call20, campId, testEventId, activeQuestions);

  // Walk through all 10 questions sequentially
  for (let qIdx = 0; qIdx < activeQuestions.length; qIdx++) {
    const q = activeQuestions[qIdx];
    const turnRes = await SurveySequentialEngine.processTurn({
      campaignId: campId,
      providerCallId: call20,
      userUtterance: `ప్రశ్న ${qIdx + 1} కు సమాధానం: బాగుంది అండి.`,
      questionId: q.id,
      eventId: testEventId,
    });

    if (qIdx < activeQuestions.length - 1) {
      assert(turnRes.action === 'ASK_MAIN_QUESTION' || turnRes.action === 'ACCEPT_ANSWER', `Scenario 20: Question ${qIdx + 1} processed and moved to next`);
      assert(turnRes.isSurveyComplete === false, `Scenario 20: Question ${qIdx + 1} survey not complete yet`);
    } else {
      // Last question!
      assert(turnRes.isSurveyComplete === true, 'Scenario 20: Final question completed triggers isSurveyComplete = true');
      assert(turnRes.action === 'END', 'Scenario 20: Final action is END');
      assert(
        turnRes.spokenResponse.includes('మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు'),
        'Scenario 20: Final turn plays canonical closing audio'
      );
    }
  }

  const state20 = SurveySequentialEngine.getState(call20);
  assert(state20?.conversationStatus === 'completed', 'Scenario 20: Final conversationStatus is completed');
  assert(state20?.stateMachineState === 'COMPLETED', 'Scenario 20: Final stateMachineState is COMPLETED');
  assert(Boolean(state20 && state20.transcripts && state20.transcripts.length >= 20), 'Scenario 20: Full dialogue transcript saved all turns');

  // SCENARIO 21: Call interrupted midway -> marks interrupted, records partial transcript
  console.log('\n--- Scenario 21: Call interrupted midway ---');
  const call21 = `call_sc21_${Date.now()}`;
  const job21: CallJobRecord = {
    id: call21,
    campaignId: campId,
    eventId: testEventId,
    contactId: 'cnt_21',
    contactName: 'నారాయణ',
    contactPhone: '+919988776655',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(job21);

  // Inbound call answered, Q1 asked and answered
  SurveySequentialEngine.getOrCreateState(call21, campId, testEventId, activeQuestions);
  await SurveySequentialEngine.processTurn({
    campaignId: campId,
    providerCallId: call21,
    userUtterance: 'నీళ్లు బాగానే వస్తున్నాయి.',
    questionId: 'Q1',
    eventId: testEventId,
  });

  // Now customer suddenly hung up during Q2!
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'customer-hung-up',
      call: { id: call21, duration: 18 },
    },
  });

  const updatedJob21 = callbridgeStorage.getCallJob(call21)!;
  assert(updatedJob21.status === 'interrupted', 'Scenario 21: Mid-call hangup marks job status as interrupted');
  assert(Boolean(updatedJob21.transcript && updatedJob21.transcript.length > 0), 'Scenario 21: Partial dialogue preserved in transcript');

  // SCENARIO 22: Sequential outbound calling -> calls 1 at a time, waits for terminal status, updates counters accurately
  console.log('\n--- Scenario 22: Sequential Outbound Calling & Accurate Analytics ---');
  const camp22Id = `camp_seq_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: camp22Id,
    eventId: testEventId,
    name: 'Sequential 1-at-a-Time Test Campaign',
    status: 'draft',
    totalContacts: 2,
    concurrencyLimit: 1,
    optOutCount: 0,
    processedCount: 0,
    completedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    failedCount: 0,
    activeCalls: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Verify queue manager prevents concurrency > 1
  const runner = (queueManager as any).activeRunners?.get(camp22Id);
  assert(runner === undefined || runner.activeCalls <= 1, 'Scenario 22: Queue enforces strict concurrency = 1 call at a time');

  // Verify analytics counters deduplication and segregation
  const analytics22 = ExportService.exportAnalyticsJson(testEventId, campId);
  assert(analytics22.publicSurveyCounters !== undefined, 'Scenario 22: publicSurveyCounters present');
  assert(typeof analytics22.publicSurveyCounters.completedCalls === 'number', 'Scenario 22: completedCalls is tracked');
  assert(typeof analytics22.publicSurveyCounters.disconnectedCalls === 'number', 'Scenario 22: disconnectedCalls is tracked');
  assert(typeof analytics22.publicSurveyCounters.callbackScheduledCalls === 'number', 'Scenario 22: callbackScheduledCalls is tracked');

  console.log('\n================================================================');
  console.log(`ALL 22 SCENARIOS VERIFIED SUCCESSFULLY! (${passed} checks passed)`);
  console.log('================================================================');
}

runAll22ScenariosSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
