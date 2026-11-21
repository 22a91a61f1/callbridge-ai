import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.js';
import { VapiService } from '../server/telephony/vapiService.js';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';

async function runLiveCallTurnTakingTests() {
  console.log('========================================================');
  console.log('🧪 RUNNING PRODUCTION BUG FIX VERIFICATION: PUBLIC SURVEY');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: any) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      if (extra) console.error('     Details:', extra);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: BUG 1 ROOT CAUSE FIX — Positive Answer Moves Immediately to Question 2
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Positive Answer ("బాగానే ఉంది.") Accepted on First Attempt ---');
  const session1 = 'test_live_call_turn_1_' + Date.now();
  const initRes1 = SurveySequentialEngine.getOrCreateState(
    session1,
    'camp_test_live',
    'event_public_survey',
    undefined,
    '+919876543210',
    'Citizen One'
  );

  const turn1 = SurveySequentialEngine.processTurnSync({
    sessionId: session1,
    userUtterance: 'బాగానే ఉంది.',
  });

  console.log('   Agent Question 1 asked in greeting');
  console.log('   Respondent answered: "బాగానే ఉంది."');
  console.log('   Agent reply:', turn1.spokenResponse);
  console.log('   Current Question ID:', turn1.currentQuestionId);
  console.log('   Current Question Index:', turn1.currentQuestionIndex);

  assert(
    'Positive answer accepted immediately without asking water follow-up',
    turn1.action === 'ASK_MAIN_QUESTION' || turn1.action === 'ACCEPT_ANSWER'
  );
  assert(
    'Agent moves to Question 2 (roads) and does NOT repeat Question 1',
    turn1.currentQuestionIndex === 1 && !turn1.spokenResponse.includes('తాగునీటి సౌకర్యం ఎలా ఉంది')
  );
  assert(
    'Question 2 mentions roads in Telugu (రోడ్లు / రోడ్ల పరిస్థితి)',
    turn1.spokenResponse.includes('రోడ్ల') || turn1.spokenResponse.includes('రోడ్డు')
  );

  // --------------------------------------------------------------------------
  // TEST 2: BUG 3 ROOT CAUSE FIX — Detailed Road Answer Moves to Question 3
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Detailed Road Answer ("గుంతలు, వర్షాలు పడడం వల్ల హోల్స్ అయిపోయాయి") ---');
  const turn2 = SurveySequentialEngine.processTurnSync({
    sessionId: session1,
    userUtterance: 'గుంతలు, వర్షాలు పడడం వల్ల హోల్స్ అయిపోయాయి',
  });

  console.log('   Respondent answered: "గుంతలు, వర్షాలు పడడం వల్ల హోల్స్ అయిపోయాయి"');
  console.log('   Agent reply:', turn2.spokenResponse);
  console.log('   Current Question ID:', turn2.currentQuestionId);
  console.log('   Current Question Index:', turn2.currentQuestionIndex);

  assert(
    'Detailed road answer accepted without asking road follow-up',
    turn2.currentQuestionIndex === 2
  );
  assert(
    'Agent moves to Question 3 and does NOT repeat the road question',
    !turn2.spokenResponse.includes('రోడ్ల పరిస్థితి ఎలా ఉంది')
  );

  // --------------------------------------------------------------------------
  // TEST 3: DUAL WEBHOOK RACE CONDITION (Transcript + Tool Call on Same Turn)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Dual Webhook Race Condition (Transcript arrives first, then Tool Call) ---');
  const vapiCallId = 'vapi_call_race_' + Date.now();
  const testJobId = 'job_call_race_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: testJobId,
    campaignId: 'camp_live_race',
    contactId: 'contact_race',
    contactName: 'Race Test Citizen',
    contactPhone: '+919999988888',
    status: 'in_progress',
    providerCallId: vapiCallId,
    eventId: 'event_public_survey',
    durationSeconds: 0,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.mapProviderCallIdToJob(vapiCallId, testJobId, 'camp_live_race', 'event_public_survey', '+919999988888');
  SurveySequentialEngine.aliasSession(vapiCallId, testJobId);
  SurveySequentialEngine.getOrCreateState(testJobId, 'camp_live_race', 'event_public_survey');
  VapiService.initPublicSurveyCallState(vapiCallId);

  // Step 3a: Transcript webhook arrives with final text "బాగానే ఉంది."
  await VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcriptType: 'final',
      transcript: 'బాగానే ఉంది.',
      call: { id: vapiCallId },
    },
  });

  const stateAfterTranscript = SurveySequentialEngine.getState(vapiCallId);
  const qIdxAfterTranscript = stateAfterTranscript?.currentQuestionIndex;
  const pState = VapiService.getPublicSurveyCallState(vapiCallId);

  console.log('   Transcript processed. Question index:', qIdxAfterTranscript);
  console.log('   Cached agent reply for tool-call:', pState.lastGeneratedAgentReply?.slice(0, 50));

  assert('Transcript advances state to Question 2 (index 1)', qIdxAfterTranscript === 1);
  assert('Cached agent reply contains Question 2', Boolean(pState.lastGeneratedAgentReply?.includes('రోడ్ల')));

  // Step 3b: Tool-call webhook arrives 30ms later with the same utterance
  const toolCallWebhookRes = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: vapiCallId },
      toolCalls: [
        {
          id: 'tool_call_race_1',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ answerText: 'బాగానే ఉంది.' }),
          },
        },
      ],
    },
  });

  const stateAfterToolCall = SurveySequentialEngine.getState(vapiCallId);
  console.log('   Tool call processed. Question index:', stateAfterToolCall?.currentQuestionIndex);
  console.log('   Tool call result returned to Vapi:', (toolCallWebhookRes as any)?.results?.[0]?.result);

  assert(
    'Tool call returns Question 2 and does NOT return Question 1 (greeting)',
    (toolCallWebhookRes as any)?.results?.[0]?.result?.includes('రోడ్ల') &&
    !(toolCallWebhookRes as any)?.results?.[0]?.result?.includes('తాగునీటి సౌకర్యం')
  );
  assert(
    'Question index remains at 1 (does not double-advance to Question 3)',
    stateAfterToolCall?.currentQuestionIndex === 1
  );

  // --------------------------------------------------------------------------
  // TEST 4: PREVENT PREMATURE TERMINATION ON "ధన్యవాదాలు"
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Prevent Premature Termination on Mid-Call "ధన్యవాదాలు" ---');
  await VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      role: 'assistant',
      status: 'started',
      text: 'ధన్యవాదాలు. ఇక మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?',
      call: { id: vapiCallId },
    },
  });

  assert(
    'Safety termination timer is NOT started on mid-survey "ధన్యవాదాలు" transition',
    pState.safetyTimer === undefined || pState.safetyTimer === null
  );

  // --------------------------------------------------------------------------
  // TEST 5: OUTBOUND ASSISTANT CONFIG VALIDATION (Endpointing, Backchanneling, EndCallPhrases)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Outbound Call Payload Anti-Interruption Configuration ---');
  let interceptedPayload: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init?: any) => {
    if (String(url).includes('api.vapi.ai/call')) {
      interceptedPayload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ id: 'mock_vapi_call_config_test', status: 'queued' }),
      } as any;
    }
    return originalFetch(url, init);
  };

  const origVapiKey = process.env.VAPI_PRIVATE_API_KEY;
  const origVapiPhone = process.env.VAPI_PHONE_NUMBER_ID;
  process.env.VAPI_PRIVATE_API_KEY = 'mock_vapi_key_test';
  process.env.VAPI_PHONE_NUMBER_ID = 'mock_vapi_phone_id_test';

  try {
    await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      campaignId: 'camp_anti_interrupt',
      contactName: 'Test Contact',
      moduleType: 'public_survey',
      script: 'నమస్కారం! ప్రజా సర్వే విభాగం నుండి మాట్లాడుతున్నాం.',
      voiceId: 'eleven_test_voice_id',
      language: 'te',
    });

    const assistant = interceptedPayload?.assistant || interceptedPayload?.assistantOverrides;
    const transcriber = assistant?.transcriber;
    const endPhrases: string[] = assistant?.endCallPhrases || [];

    console.log('   Transcriber endpointing:', transcriber?.endpointing);
    console.log('   Backchanneling enabled:', assistant?.backchannelingEnabled);
    console.log('   Stop speaking plan:', assistant?.stopSpeakingPlan);
    console.log('   End call phrases count:', endPhrases.length);

    assert(
      'Deepgram Nova-2 configured with 500ms endpointing (Vapi maximum allowed limit)',
      transcriber?.endpointing === 500
    );
    assert(
      'Vapi backchanneling explicitly disabled to stop premature "అర్థమైంది" interruption',
      assistant?.backchannelingEnabled === false
    );
    assert(
      'Vapi stop speaking plan configured with 1 word threshold and 0.2s voice pause',
      assistant?.stopSpeakingPlan?.numWords === 1 && assistant?.stopSpeakingPlan?.voiceSeconds === 0.2
    );
    assert(
      '"నమస్కారం." removed from endCallPhrases to prevent accidental disconnection',
      !endPhrases.includes('నమస్కారం.')
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (origVapiKey !== undefined) process.env.VAPI_PRIVATE_API_KEY = origVapiKey;
    else delete process.env.VAPI_PRIVATE_API_KEY;
    if (origVapiPhone !== undefined) process.env.VAPI_PHONE_NUMBER_ID = origVapiPhone;
    else delete process.env.VAPI_PHONE_NUMBER_ID;
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveCallTurnTakingTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
