import { VapiService } from '../server/telephony/vapiService';
import { callbridgeStorage, CANONICAL_PUBLIC_SURVEY_QUESTIONS } from '../server/storage/callbridgeStorage';
import { SurveySequentialEngine, TELUGU_STRINGS } from '../server/survey/surveySequentialEngine';

async function runContentRegressionTests() {
  console.log('========================================================================');
  console.log('PUBLIC SURVEY CONTENT REGRESSION & VAPI OUTBOUND PAYLOAD VERIFICATION');
  console.log('========================================================================\n');

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`[PASS] ${msg}`);
  }

  // -------------------------------------------------------------------------
  // 1. VERIFY EXACT 6 QUESTIONS IN EXACT ORDER
  // -------------------------------------------------------------------------
  console.log('--- Step 1: Verify Exact 6 Questions & Canonical Ordering ---');
  const expectedQuestions = [
    { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
    { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?' },
    { id: 'A3', text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?' },
    { id: 'A4', text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?' },
    { id: 'A5', text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?' },
    { id: 'A6', text: 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?' },
  ];

  const canonical = CANONICAL_PUBLIC_SURVEY_QUESTIONS;
  assert(canonical.length === 6, `Canonical question list length must be 6, got ${canonical.length}`);
  for (let i = 0; i < expectedQuestions.length; i++) {
    assert(canonical[i].text === expectedQuestions[i].text, `Canonical Q${i + 1} mismatch:\nExpected: ${expectedQuestions[i].text}\nGot: ${canonical[i].text}`);
    assert(canonical[i].id === expectedQuestions[i].id, `Canonical Q${i + 1} ID mismatch: expected ${expectedQuestions[i].id}, got ${canonical[i].id}`);
  }

  const resolved = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
  assert(resolved.length === 6, `Resolved active questions length must be 6, got ${resolved.length}`);
  for (let i = 0; i < expectedQuestions.length; i++) {
    assert(resolved[i].text === expectedQuestions[i].text, `Resolved Q${i + 1} mismatch:\nExpected: ${expectedQuestions[i].text}\nGot: ${resolved[i].text}`);
  }

  // Confirm Q6 is Healthcare, NOT Government Schemes
  assert(resolved[5].text.includes('ఆరోగ్య సేవలు'), `Q6 MUST be healthcare services question, got: ${resolved[5].text}`);
  assert(!resolved[5].text.includes('పథకాలు'), `Q6 must NOT be government schemes question`);

  // -------------------------------------------------------------------------
  // 2. VERIFY EXACT APPROVED CLOSING MESSAGE
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Verify Exact Approved Closing Message ---');
  const expectedClosing = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';
  assert(TELUGU_STRINGS.CLOSING_MESSAGE === expectedClosing, `TELUGU_STRINGS.CLOSING_MESSAGE mismatch:\nExpected: ${expectedClosing}\nGot: ${TELUGU_STRINGS.CLOSING_MESSAGE}`);

  // Test full sequential execution to Q6 completion
  const sess = `reg_sess_${Date.now()}`;
  await SurveySequentialEngine.processTurn({ sessionId: sess, eventId: 'event_public_survey' });

  const answers = [
    'నీటి సమస్య లేదు.',
    'రోడ్లు బాగున్నాయి.',
    'కరెంట్ ఉంటుంది.',
    'డ్రైనేజీ బాగుంది.',
    'చెత్త రోజూ తీస్తున్నారు.',
    'ఆరోగ్య సేవలు సరిపోతున్నాయి.',
  ];

  let lastTurn: any = null;
  for (const ans of answers) {
    lastTurn = await SurveySequentialEngine.processTurn({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: ans,
    });
  }

  assert(lastTurn.isCompleted === true, `Survey must complete after Q6`);
  assert(lastTurn.reply === expectedClosing, `Turn reply after Q6 must match exact approved closing:\nExpected: ${expectedClosing}\nGot: ${lastTurn.reply}`);

  // -------------------------------------------------------------------------
  // 3. INSPECT ACTUAL APPLICATION-GENERATED VAPI OUTBOUND CALL PAYLOAD
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Inspect Actual Outbound Vapi Payload Sent Over Wire ---');
  let capturedPayload: any = null;
  let capturedUrl: string = '';
  const originalFetch = global.fetch;

  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/call/phone')) {
      capturedUrl = url;
      capturedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `vapi_call_inspect_${Date.now()}`,
          phoneCallProviderId: 'CA_inspect_12345',
          status: 'queued',
        }),
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    VapiService.setRuntimeConfig(
      'vapi-secret-key-12345',
      'phone-number-id-99999',
      ''
    );

    await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      contactName: 'Narayana Murthy',
      campaignId: 'camp_content_reg',
      eventId: 'event_public_survey',
      moduleType: 'public_survey',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారమండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. మొదటిగా, మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
    });

    assert(capturedPayload !== null, `Vapi outbound payload was captured via fetch`);
    console.log('[CAPTURED_VAPI_URL]', capturedUrl);

    // Root keys verification
    assert(capturedPayload.phoneNumberId === 'phone-number-id-99999', `Root phoneNumberId populated`);
    assert(capturedPayload.customer.number === '+919876543210', `Root customer.number populated`);

    const asst = capturedPayload.assistant;
    assert(asst !== undefined, `body.assistant is present in outbound payload`);

    // Voice verification
    assert(asst.voice.provider === '11labs', `Voice provider must be '11labs'`);
    assert(asst.voice.voiceId === 'Txde0pZ5tVhXE6HUspcf', `Voice ID must be Rishi 'Txde0pZ5tVhXE6HUspcf'`);
    assert(asst.voice.model === 'eleven_v4_turbo', `Voice model must be 'eleven_v4_turbo'`);
    assert(asst.voice.stability === 0.50, `Voice stability must be 0.50`);
    assert(asst.voice.similarityBoost === 0.85, `Voice similarityBoost must be 0.85`);
    assert(asst.voice.style === 0.15, `Voice style must be 0.15`);
    assert(asst.voice.useSpeakerBoost === true, `Voice speakerBoost must be true`);
    assert(asst.voice.speed === 1.0, `Voice speed must be 1.0`);

    // Stop speaking plan verification
    assert(asst.stopSpeakingPlan.numWords === 2, `stopSpeakingPlan.numWords must be 2`);
    assert(asst.stopSpeakingPlan.voiceSeconds === 0.5, `stopSpeakingPlan.voiceSeconds must be 0.5`);
    assert(asst.stopSpeakingPlan.backoffSeconds === 1, `stopSpeakingPlan.backoffSeconds must be 1`);

    // Tools and message suppression inspection
    const tools = asst.model.tools;
    assert(Array.isArray(tools) && tools.length >= 3, `Assistant has at least 3 configured tools`);
    
    const recordTool = tools.find((t: any) => t.function?.name === 'recordSurveyAnswerAndGetNextAction');
    assert(recordTool !== undefined, `recordSurveyAnswerAndGetNextAction tool exists`);
    assert(Array.isArray(recordTool.messages), `recordSurveyAnswerAndGetNextAction has messages array`);
    
    const reqStartMsg = recordTool.messages.find((m: any) => m.type === 'request-start');
    assert(reqStartMsg !== undefined, `Tool has 'request-start' message configured`);
    assert(reqStartMsg.content === '', `Tool 'request-start' content must be EMPTY STRING ("") to disable Vapi filler speech`);

    const reqDelayedMsg = recordTool.messages.find((m: any) => m.type === 'request-response-delayed');
    assert(reqDelayedMsg !== undefined, `Tool has 'request-response-delayed' message configured`);
    assert(reqDelayedMsg.content === '', `Tool 'request-response-delayed' content must be EMPTY STRING ("") to prevent waiting speech`);

    // First message verification: Greetings + Q1
    assert(asst.firstMessage.includes('మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?'), `First message asks Question 1 (drinking water)`);

    // System prompt verification: contains all 6 questions in exact order
    const systemPrompt = asst.model.messages[0].content;
    for (let i = 0; i < expectedQuestions.length; i++) {
      assert(systemPrompt.includes(expectedQuestions[i].text), `System prompt must contain Q${i + 1}: ${expectedQuestions[i].text}`);
    }

    // Turn finality instructions present
    assert(systemPrompt.includes('CRITICAL TURN FINALITY & IMMEDIATE STOPPING'), `System prompt contains turn finality instructions`);
    assert(systemPrompt.includes('YOU MUST STOP SPEAKING IMMEDIATELY'), `System prompt orders immediate silence after question`);
    assert(systemPrompt.includes('DO NOT speak any waiting phrase'), `System prompt forbids waiting phrases`);
  } finally {
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // 4. VERIFY DYNAMIC SUPPORT FOR ADDITIONAL USER-CREATED QUESTIONS
  // -------------------------------------------------------------------------
  console.log('\n--- Step 4: Verify Dynamic Support for Additional User-Created Questions ---');
  const customConfig = {
    id: 'survey_dynamic_test',
    title: 'Dynamic Test Survey',
    questions: [
      ...expectedQuestions,
      {
        id: 'A7',
        questionId: 'A7',
        text: 'మీ ప్రాంతంలో పార్కులు మరియు ఆట స్థలాలు ఉన్నాయా?',
        questionText: 'మీ ప్రాంతంలో పార్కులు మరియు ఆట స్థలాలు ఉన్నాయా?',
        category: 'పార్కులు',
        questionOrder: 7,
        enabled: true,
      },
    ],
  };

  const dynSess = `dyn_sess_${Date.now()}`;
  const dynInit = await SurveySequentialEngine.processTurn({
    sessionId: dynSess,
    surveyConfig: customConfig as any,
  });

  assert(dynInit.totalActiveQuestions === 7, `Dynamic survey must support 7 questions`);
  
  // Progress through all 7 questions
  for (let q = 1; q <= 6; q++) {
    const turn = await SurveySequentialEngine.processTurn({
      sessionId: dynSess,
      surveyConfig: customConfig as any,
      userUtterance: `ప్రశ్న ${q} సమాధానం బాగుంది.`,
    });
    if (q === 6) {
      // After answering Q6 in a 7-question survey, it should ask Q7 (not complete early!)
      assert(turn.isCompleted === false, `7-question survey must NOT complete after Q6`);
      assert(turn.reply.includes('పార్కులు మరియు ఆట స్థలాలు'), `Must ask custom Q7 (parks)`);
    }
  }

  // Now answer Q7
  const dynFinal = await SurveySequentialEngine.processTurn({
    sessionId: dynSess,
    surveyConfig: customConfig as any,
    userUtterance: 'పార్కులు లేవు.',
  });

  assert(dynFinal.isCompleted === true, `7-question survey must complete after Q7`);
  assert(dynFinal.reply === expectedClosing, `7-question survey returns exact approved closing after Q7`);

  console.log('\n========================================================================');
  console.log('ALL REGRESSION & PAYLOAD INSPECTION TESTS PASSED WITH 100% SUCCESS!');
  console.log('========================================================================');
}

runContentRegressionTests().catch((err) => {
  console.error('[REGRESSION_TEST_ERROR]', err);
  process.exit(1);
});
