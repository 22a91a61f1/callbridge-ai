import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';

async function runComprehensivePublicSurveyBugFixTests() {
  console.log('========================================================================');
  console.log('🧪 COMPREHENSIVE 20-SCENARIO VERIFICATION: PUBLIC SURVEY REPEATED QUESTION BUG FIX');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: any) {
    if (condition) {
      console.log(`  ✅ PASS [${passed + 1}]: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      if (extra) console.error('     Details:', extra);
      failed++;
    }
  }

  const q1TeluguTopic = 'తాగునీటి సౌకర్యం';
  const q2TeluguTopic = 'రోడ్ల';

  // --------------------------------------------------------------------------
  // SCENARIO 1: "బాగుంది" -> Advances to Q2, does NOT repeat Q1
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: "బాగుంది" -> Advances to Q2, does NOT repeat Q1 ---');
  const sess1 = 'test_scen_1_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess1, 'camp_s1', 'event_public_survey');
  const turnS1 = SurveySequentialEngine.processTurnSync({
    sessionId: sess1,
    questionId: 'A1',
    userUtterance: 'బాగుంది',
  });
  assert('Scenario 1 advances to Question index 1 (Q2)', turnS1.currentQuestionIndex === 1);
  assert('Scenario 1 does NOT repeat Question 1', !turnS1.spokenResponse.includes(q1TeluguTopic));
  assert('Scenario 1 mentions roads (రోడ్ల) in reply', turnS1.spokenResponse.includes(q2TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 2: "బాగానే ఉంది" -> Advances to Q2, does NOT repeat Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: "బాగానే ఉంది" -> Advances to Q2, does NOT repeat Q1 ---');
  const sess2 = 'test_scen_2_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess2, 'camp_s2', 'event_public_survey');
  const turnS2 = SurveySequentialEngine.processTurnSync({
    sessionId: sess2,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది.',
  });
  assert('Scenario 2 advances to Question index 1 (Q2)', turnS2.currentQuestionIndex === 1);
  assert('Scenario 2 does NOT repeat Question 1', !turnS2.spokenResponse.includes(q1TeluguTopic));
  assert('Scenario 2 mentions roads in reply', turnS2.spokenResponse.includes(q2TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 3: "చాలా బాగుంది" -> Advances to Q2, does NOT repeat Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: "చాలా బాగుంది" -> Advances to Q2, does NOT repeat Q1 ---');
  const sess3 = 'test_scen_3_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess3, 'camp_s3', 'event_public_survey');
  const turnS3 = SurveySequentialEngine.processTurnSync({
    sessionId: sess3,
    questionId: 'A1',
    userUtterance: 'చాలా బాగుంది',
  });
  assert('Scenario 3 advances to Question index 1 (Q2)', turnS3.currentQuestionIndex === 1);
  assert('Scenario 3 does NOT repeat Question 1', !turnS3.spokenResponse.includes(q1TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 4: "ఎలాంటి సమస్య లేదు" -> Advances to Q2, does NOT repeat Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: "ఎలాంటి సమస్య లేదు" -> Advances to Q2, does NOT repeat Q1 ---');
  const sess4 = 'test_scen_4_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess4, 'camp_s4', 'event_public_survey');
  const turnS4 = SurveySequentialEngine.processTurnSync({
    sessionId: sess4,
    questionId: 'A1',
    userUtterance: 'ఎలాంటి సమస్య లేదు',
  });
  assert('Scenario 4 advances to Question index 1 (Q2)', turnS4.currentQuestionIndex === 1);
  assert('Scenario 4 does NOT repeat Question 1', !turnS4.spokenResponse.includes(q1TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 5: Detailed Negative -> Advances to Q2, does NOT repeat Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Detailed Negative ("నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి వస్తాయి") ---');
  const sess5 = 'test_scen_5_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess5, 'camp_s5', 'event_public_survey');
  const turnS5 = SurveySequentialEngine.processTurnSync({
    sessionId: sess5,
    questionId: 'A1',
    userUtterance: 'నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి వస్తాయి',
  });
  assert('Scenario 5 accepts detailed negative answer', turnS5.currentQuestionIndex === 1);
  assert('Scenario 5 does NOT repeat Question 1', !turnS5.spokenResponse.includes(q1TeluguTopic));
  assert('Scenario 5 asks Question 2 (roads)', turnS5.spokenResponse.includes(q2TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 6: Short Negative ("బాగాలేదు") -> Follow-Up -> Q2
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Short Negative ("బాగాలేదు") -> Follow-up -> Then Q2 ---');
  const sess6 = 'test_scen_6_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess6, 'camp_s6', 'event_public_survey');
  const turnS6_fu = SurveySequentialEngine.processTurnSync({
    sessionId: sess6,
    questionId: 'A1',
    userUtterance: 'బాగాలేదు',
  });
  assert('Scenario 6 asks dynamic follow-up on short negative', turnS6_fu.action === 'ASK_FOLLOW_UP');
  assert('Scenario 6 follow-up asks relevant detail', turnS6_fu.spokenResponse.includes('ఎన్ని రోజులకొకసారి') || turnS6_fu.spokenResponse.includes('వివరాలు') || turnS6_fu.spokenResponse.includes('ఏంటి సమస్య?'));

  const turnS6_adv = SurveySequentialEngine.processTurnSync({
    sessionId: sess6,
    questionId: 'A1',
    userUtterance: 'రెండు రోజులకు ఒకసారి వస్తున్నాయి',
  });
  assert('Scenario 6 advances to Q2 after follow-up answer', turnS6_adv.currentQuestionIndex === 1);
  assert('Scenario 6 does not repeat Q1 after follow-up', !turnS6_adv.spokenResponse.includes(q1TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 7: Dual Webhook Delivery (Transcript + Tool-Call) -> No Double-Advance
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Dual Webhook Delivery (Transcript then Tool-Call) ---');
  const sess7ProviderId = 'vapi_call_s7_' + Date.now();
  const sess7JobId = 'job_call_s7_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: sess7JobId,
    campaignId: 'camp_s7',
    eventId: 'event_public_survey',
    providerCallId: sess7ProviderId,
    status: 'in_progress',
    contactId: 'c7',
    contactName: 'Respondent 7',
    contactPhone: '+919999900007',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.mapProviderCallIdToJob(sess7ProviderId, sess7JobId, 'camp_s7', 'event_public_survey', '+919999900007');
  SurveySequentialEngine.aliasSession(sess7ProviderId, sess7JobId);
  SurveySequentialEngine.getOrCreateState(sess7JobId, 'camp_s7', 'event_public_survey');
  VapiService.initPublicSurveyCallState(sess7ProviderId);

  // Transcript arrives first
  await VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcriptType: 'final',
      transcript: 'బాగుంది.',
      call: { id: sess7ProviderId },
    },
  });

  const stateAfterTr7 = SurveySequentialEngine.getState(sess7ProviderId);
  assert('Scenario 7 transcript records turn safely without premature question desync', stateAfterTr7 !== undefined);

  // Tool call arrives 30ms later
  const toolCallRes7 = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: sess7ProviderId },
      toolCalls: [
        {
          id: 'tool_call_s7_1',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది' }),
          },
        },
      ],
    },
  });

  const stateAfterTc7 = SurveySequentialEngine.getState(sess7ProviderId);
  assert('Scenario 7 tool-call does NOT double-advance to Q3 (index remains 1)', stateAfterTc7?.currentQuestionIndex === 1);
  assert('Scenario 7 tool response contains Q2 (roads)', (toolCallRes7 as any).results?.[0]?.result?.includes('రోడ్ల'));
  assert('Scenario 7 tool response does NOT contain Q1', !(toolCallRes7 as any).results?.[0]?.result?.includes(q1TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 8: Duplicate Tool-Call ID -> Returns Cached Next Question Idempotently
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Duplicate Tool-Call ID Retransmission ---');
  const toolCallRes8 = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: sess7ProviderId },
      toolCalls: [
        {
          id: 'tool_call_s7_1', // SAME ID
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది' }),
          },
        },
      ],
    },
  });
  assert('Scenario 8 returns cached response with same toolCallId', (toolCallRes8 as any).results?.[0]?.toolCallId === 'tool_call_s7_1');
  assert('Scenario 8 does not double advance index', SurveySequentialEngine.getState(sess7ProviderId)?.currentQuestionIndex === 1);

  // --------------------------------------------------------------------------
  // SCENARIO 9: Out-of-Order Webhook Delivery (Tool-Call arrives BEFORE Transcript)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Out-of-Order (Tool-Call Arrives BEFORE Transcript) ---');
  const sess9ProviderId = 'vapi_call_s9_' + Date.now();
  const sess9JobId = 'job_call_s9_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: sess9JobId,
    campaignId: 'camp_s9',
    eventId: 'event_public_survey',
    providerCallId: sess9ProviderId,
    status: 'in_progress',
    contactId: 'c9',
    contactName: 'Respondent 9',
    contactPhone: '+919999900009',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.mapProviderCallIdToJob(sess9ProviderId, sess9JobId, 'camp_s9', 'event_public_survey', '+919999900009');
  SurveySequentialEngine.aliasSession(sess9ProviderId, sess9JobId);
  SurveySequentialEngine.getOrCreateState(sess9JobId, 'camp_s9', 'event_public_survey');
  VapiService.initPublicSurveyCallState(sess9ProviderId);

  // Tool-call arrives FIRST
  const toolCallRes9 = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: sess9ProviderId },
      toolCalls: [
        {
          id: 'tool_call_s9_first',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగానే ఉంది' }),
          },
        },
      ],
    },
  });

  const stateAfterTc9 = SurveySequentialEngine.getState(sess9ProviderId);
  assert('Scenario 9 tool call advances to Q2 (index 1)', stateAfterTc9?.currentQuestionIndex === 1);
  assert('Scenario 9 tool call returned Q2', (toolCallRes9 as any).results?.[0]?.result?.includes('రోడ్ల'));

  // Transcript arrives SECOND
  await VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcriptType: 'final',
      transcript: 'బాగానే ఉంది.',
      call: { id: sess9ProviderId },
    },
  });

  const stateAfterTr9 = SurveySequentialEngine.getState(sess9ProviderId);
  assert('Scenario 9 trailing transcript does not double advance to Q3', stateAfterTr9?.currentQuestionIndex === 1);

  // --------------------------------------------------------------------------
  // SCENARIO 10: Rapid Successive Answers across All 10 Questions to Completion
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Rapid Successive Answers across All 10 Questions ---');
  const sess10 = 'test_scen_10_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess10, 'camp_s10', 'event_public_survey');
  const answers10 = [
    'బాగుంది', // A1
    'రోడ్లు బాగున్నాయి', // A2
    'కరెంట్ బాగానే ఉంది', // A3
    'డ్రైనేజీ బాగుంది', // A4
    'చెత్త రోజూ తీస్తున్నారు', // A5
    'లైట్లు వెలుగుతున్నాయి', // A6
    'హాస్పిటల్ బాగుంది', // A7
    'స్కూల్స్ బాగున్నాయి', // A8
    'బస్సు సౌకర్యం ఉంది', // A9
    'అన్నీ బాగున్నాయి ధన్యవాదాలు', // A10
  ];

  let lastTurn10: any = null;
  for (let idx = 0; idx < answers10.length; idx++) {
    lastTurn10 = SurveySequentialEngine.processTurnSync({
      sessionId: sess10,
      questionId: `A${idx + 1}`,
      userUtterance: answers10[idx],
    });
  }
  assert('Scenario 10 completes all 10 questions', lastTurn10.isCompleted === true);
  assert('Scenario 10 final response contains closing message', lastTurn10.spokenResponse.includes('ధన్యవాదాలు'));

  // --------------------------------------------------------------------------
  // SCENARIO 11: Callback Request Handling Preserves Unanswered State
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Callback Request Handling Preserves Unanswered State ---');
  const sess11 = 'test_scen_11_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess11, 'camp_s11', 'event_public_survey');
  const turn11 = SurveySequentialEngine.processTurnSync({
    sessionId: sess11,
    questionId: 'A1',
    userUtterance: 'నేను బిజీగా ఉన్నాను రేపు సాయంత్రం 5 గంటలకు కాల్ చేయండి',
  });
  assert('Scenario 11 classifies callback action', turn11.action === 'CALLBACK');
  assert('Scenario 11 records callback scheduled timestamp', Boolean(turn11.callbackScheduledAt));
  assert('Scenario 11 does not mark Question 1 as answered', !turn11.conversationState.answeredQuestionIds.includes('A1'));

  // --------------------------------------------------------------------------
  // SCENARIO 12: Skip Question Handling Advances to Next Question
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Skip Question Handling Advances to Next Question ---');
  const sess12 = 'test_scen_12_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess12, 'camp_s12', 'event_public_survey');
  const skipTurn12 = SurveySequentialEngine.skipQuestion({
    providerCallId: sess12,
    questionId: 'A1',
    eventId: 'event_public_survey',
  });
  assert('Scenario 12 skips Question 1 and advances to Q2', SurveySequentialEngine.getState(sess12)?.currentQuestionIndex === 1);
  assert('Scenario 12 reply asks Question 2', skipTurn12.spokenResponse.includes('రోడ్ల'));

  // --------------------------------------------------------------------------
  // SCENARIO 13: Stop / Refuse Call Terminates Gracefully
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 13: Stop / Refuse Call Terminates Gracefully ---');
  const sess13 = 'test_scen_13_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess13, 'camp_s13', 'event_public_survey');
  const turn13 = SurveySequentialEngine.processTurnSync({
    sessionId: sess13,
    questionId: 'A1',
    userUtterance: 'నాకు సర్వే ఇష్టం లేదు కాల్ ఆపండి',
  });
  assert('Scenario 13 ends survey gracefully on refusal', turn13.action === 'END');
  assert('Scenario 13 stops survey without repeating question', !turn13.spokenResponse.includes(q1TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 14: Unknown or Newly Restored Session Does NOT Restart at Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 14: Restored Session Resumes at Unanswered Question ---');
  const sess14JobId = 'job_call_s14_' + Date.now();
  const sess14ProviderId = 'vapi_call_s14_' + Date.now();

  // Job already answered A1 and A2 in storage
  callbridgeStorage.saveCallJob({
    id: sess14JobId,
    campaignId: 'camp_s14',
    eventId: 'event_public_survey',
    providerCallId: sess14ProviderId,
    status: 'in_progress',
    contactId: 'c14',
    contactName: 'Respondent 14',
    contactPhone: '+919999900014',
    retryCount: 0,
    maxRetries: 1,
    surveyState: {
      sessionId: sess14JobId,
      eventId: 'event_public_survey',
      currentQuestionId: 'A3',
      currentQuestionIndex: 2,
      totalActiveQuestions: 10,
      answeredQuestionIds: ['A1', 'A2'],
      skippedQuestionIds: [],
      pendingQuestionId: 'A3',
      conversationStatus: 'in_progress',
      stateMachineState: 'WAITING_FOR_RESPONSE',
      followUpCountForCurrentQuestion: 0,
      maxFollowUpsPerQuestion: 2,
      callbackRequested: false,
      callbackScheduledAt: null,
      callbackTimezone: 'Asia/Kolkata',
      callbackDetails: null,
      answers: {
        A1: { answerText: 'బాగుంది' },
        A2: { answerText: 'రోడ్లు బాగున్నాయి' },
      },
      transcripts: [],
      originalTranscript: [],
    } as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const restoredState14 = SurveySequentialEngine.getOrCreateSession(sess14JobId);
  assert('Scenario 14 restored session resume index is 2 (Q3)', restoredState14.currentQuestionIndex === 2);
  assert('Scenario 14 current question is A3', restoredState14.currentQuestionId === 'A3');

  // --------------------------------------------------------------------------
  // SCENARIO 15: Exact Vapi Tool Response Schema { results: [{ toolCallId, result }] }
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 15: Exact Vapi Tool Response Schema Verification ---');
  const sess15ProviderId = 'vapi_call_s15_' + Date.now();
  const sess15JobId = 'job_call_s15_' + Date.now();
  callbridgeStorage.saveCallJob({
    id: sess15JobId,
    campaignId: 'camp_s15',
    eventId: 'event_public_survey',
    providerCallId: sess15ProviderId,
    status: 'in_progress',
    contactId: 'c15',
    contactName: 'Respondent 15',
    contactPhone: '+919999900015',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.mapProviderCallIdToJob(sess15ProviderId, sess15JobId, 'camp_s15', 'event_public_survey', '+919999900015');
  SurveySequentialEngine.aliasSession(sess15ProviderId, sess15JobId);
  SurveySequentialEngine.getOrCreateState(sess15JobId, 'camp_s15', 'event_public_survey');
  VapiService.initPublicSurveyCallState(sess15ProviderId);

  const webhookResult15 = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: sess15ProviderId },
      toolCalls: [
        {
          id: 'tool_call_spec_check',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది' }),
          },
        },
      ],
    },
  });
  assert('Scenario 15 webhook return contains results array', Array.isArray((webhookResult15 as any).results));
  assert('Scenario 15 results array contains matching toolCallId', (webhookResult15 as any).results?.[0]?.toolCallId === 'tool_call_spec_check');
  assert('Scenario 15 result string is clean spoken Telugu', typeof (webhookResult15 as any).results?.[0]?.result === 'string' && (webhookResult15 as any).results?.[0]?.result?.length > 10);

  // --------------------------------------------------------------------------
  // SCENARIO 16: Strict Invariant Check: Q1 Text NEVER Returned After Turn 1
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 16: Strict Invariant: Q1 Text NEVER Returned After Turn 1 ---');
  const sess16 = 'test_scen_16_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess16, 'camp_s16', 'event_public_survey');
  // Answer A1
  SurveySequentialEngine.processTurnSync({
    sessionId: sess16,
    questionId: 'A1',
    userUtterance: 'బాగుంది',
  });
  // Simulate errant repeat of A1
  const repeatTurn16 = SurveySequentialEngine.processTurnSync({
    sessionId: sess16,
    questionId: 'A1',
    userUtterance: 'బాగానే ఉంది',
  });
  assert('Scenario 16 invariant guard prevents Q1 text from ever returning', !repeatTurn16.spokenResponse.includes(q1TeluguTopic));
  assert('Scenario 16 returns Q2 roads question', repeatTurn16.spokenResponse.includes(q2TeluguTopic));

  // --------------------------------------------------------------------------
  // SCENARIO 17: Multi-Turn Conversation across at least 5 Questions
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 17: Multi-Turn Conversation Across 5 Questions ---');
  const sess17 = 'test_scen_17_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess17, 'camp_s17', 'event_public_survey');
  const utterances17 = ['బాగుంది', 'రోడ్లు బాగున్నాయి', 'విద్యుత్ సమస్య లేదు', 'డ్రైనేజీ బాగుంది', 'చెత్త సేకరణ బాగుంది'];
  let currentTurn17: any = null;
  for (let i = 0; i < 5; i++) {
    currentTurn17 = SurveySequentialEngine.processTurnSync({
      sessionId: sess17,
      questionId: `A${i + 1}`,
      userUtterance: utterances17[i],
    });
  }
  assert('Scenario 17 reached Question index 5 (Q6 street lights)', currentTurn17.currentQuestionIndex === 5);
  assert('Scenario 17 has 5 answered questions in state', currentTurn17.conversationState.answeredQuestionIds.length === 5);

  // --------------------------------------------------------------------------
  // SCENARIO 18: Concurrent Calls on Separate Sessions Do Not Cross-Contaminate
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 18: Concurrent Calls Isolation ---');
  const sess18_A = 'test_s18_A_' + Date.now();
  const sess18_B = 'test_s18_B_' + Date.now();
  SurveySequentialEngine.getOrCreateState(sess18_A, 'camp_s18', 'event_public_survey');
  SurveySequentialEngine.getOrCreateState(sess18_B, 'camp_s18', 'event_public_survey');

  // Session A answers 3 questions
  SurveySequentialEngine.processTurnSync({ sessionId: sess18_A, questionId: 'A1', userUtterance: 'బాగుంది' });
  SurveySequentialEngine.processTurnSync({ sessionId: sess18_A, questionId: 'A2', userUtterance: 'బాగుంది' });
  SurveySequentialEngine.processTurnSync({ sessionId: sess18_A, questionId: 'A3', userUtterance: 'బాగుంది' });

  // Session B answers only 1 question
  SurveySequentialEngine.processTurnSync({ sessionId: sess18_B, questionId: 'A1', userUtterance: 'బాగుంది' });

  const stateA = SurveySequentialEngine.getState(sess18_A);
  const stateB = SurveySequentialEngine.getState(sess18_B);
  assert('Scenario 18 Session A is at index 3', stateA?.currentQuestionIndex === 3);
  assert('Scenario 18 Session B is at index 1', stateB?.currentQuestionIndex === 1);
  assert('Scenario 18 Session A has 3 answers and Session B has 1', stateA?.answeredQuestionIds.length === 3 && stateB?.answeredQuestionIds.length === 1);

  // --------------------------------------------------------------------------
  // SCENARIO 19: Storage Persistence Check (State Persisted and Retrievable)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 19: Storage Persistence Check ---');
  const sess19JobId = 'job_call_s19_' + Date.now();
  callbridgeStorage.saveCallJob({
    id: sess19JobId,
    campaignId: 'camp_s19',
    eventId: 'event_public_survey',
    providerCallId: sess19JobId,
    status: 'in_progress',
    contactId: 'c19',
    contactName: 'Respondent 19',
    contactPhone: '+919999900019',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  SurveySequentialEngine.getOrCreateState(sess19JobId, 'camp_s19', 'event_public_survey');
  SurveySequentialEngine.processTurnSync({
    sessionId: sess19JobId,
    questionId: 'A1',
    userUtterance: 'బాగుంది',
  });

  const persistedJob19 = callbridgeStorage.getCallJob(sess19JobId);
  assert('Scenario 19 job surveyState is persisted in storage', Boolean(persistedJob19?.surveyState));
  assert('Scenario 19 job surveyAnswers contains A1', Boolean(persistedJob19?.surveyAnswers?.['A1']));

  // --------------------------------------------------------------------------
  // SCENARIO 20: Telephony Sanity Check (Outbound Call Assistant Config)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 20: Telephony Sanity Check ---');
  let interceptedPayload: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('api.vapi.ai/call')) {
      if (init?.body) {
        try { interceptedPayload = JSON.parse(init.body); } catch { /* ignore */ }
      }
      return new Response(
        JSON.stringify({
          id: 'vapi_call_sanity_mock',
          status: 'queued',
          phoneCallProviderDetails: { twilioCallSid: 'CA_sanity_mock' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  const origVapiKey = process.env.VAPI_PRIVATE_API_KEY;
  const origVapiPhone = process.env.VAPI_PHONE_NUMBER_ID;
  process.env.VAPI_PRIVATE_API_KEY = 'mock_vapi_key_test';
  process.env.VAPI_PHONE_NUMBER_ID = 'mock_vapi_phone_id_test';

  try {
    const dispatchRes = await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      campaignId: 'camp_sanity_20',
      eventId: 'event_public_survey',
      moduleType: 'public_survey',
      voiceId: 'eleven_test_voice_id',
      script: 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.',
      language: 'te',
    });

    assert('Scenario 20 outbound call created successfully', Boolean(dispatchRes.callId));
    assert('Scenario 20 mapped provider call ID to internal job', Boolean(dispatchRes.providerCallId));

    const assistant = interceptedPayload?.assistant || interceptedPayload?.assistantOverrides;
    const tools = assistant?.model?.tools || [];
    const surveyTool = tools.find((t: any) => t?.function?.name === 'recordSurveyAnswerAndGetNextAction');

    assert('Scenario 20 payload registers recordSurveyAnswerAndGetNextAction tool', Boolean(surveyTool));
    assert('Scenario 20 tool schema requires questionId and answerText', Boolean(surveyTool?.function?.parameters?.properties?.questionId && surveyTool?.function?.parameters?.properties?.answerText));
    assert('Scenario 20 system prompt instructs not to repeat Question 1', Boolean(assistant?.model?.messages?.[0]?.content?.includes('NEVER repeat Question 1')));
  } finally {
    globalThis.fetch = originalFetch;
    if (origVapiKey !== undefined) process.env.VAPI_PRIVATE_API_KEY = origVapiKey;
    else delete process.env.VAPI_PRIVATE_API_KEY;
    if (origVapiPhone !== undefined) process.env.VAPI_PHONE_NUMBER_ID = origVapiPhone;
    else delete process.env.VAPI_PHONE_NUMBER_ID;
  }

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensivePublicSurveyBugFixTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
