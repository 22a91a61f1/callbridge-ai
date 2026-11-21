import { VapiService } from '../server/telephony/vapiService';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { SurveySequentialEngine, TELUGU_STRINGS } from '../server/survey/surveySequentialEngine';

async function runShortTeluguAnswersRegression() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — SHORT TELUGU ANSWERS COMPREHENSIVE REGRESSION TESTS');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    passed++;
    console.log(`[PASS] ${msg}`);
  }

  // -------------------------------------------------------------------------
  // SCENARIO A: Short positive answer "బాగుంది" -> immediate ack + Q2
  // -------------------------------------------------------------------------
  console.log('--- Scenario A: Short answer "బాగుంది" ---');
  {
    const sess = `scen_a_${Date.now()}`;
    const t0 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
    });
    assert(t0.currentQuestionIndex === 0, 'Initial question is Q1');

    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగుంది',
      toolCallId: `call_a_${Date.now()}`,
    });

    assert(t1.currentQuestionIndex === 1, 'Advanced to Q2');
    assert(t1.action === 'ASK_MAIN_QUESTION', 'Action is ASK_MAIN_QUESTION');
    assert(t1.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'Immediate approved acknowledgement present');
    assert(t1.reply.includes('రోడ్ల పరిస్థితి'), 'Question 2 (Roads) asked together in same utterance');
    assert(t1.extractedAnswers.length === 1, 'Exactly 1 answer recorded');
    assert(t1.extractedAnswers[0].answerSummary === 'బాగుంది', 'Recorded answer is "బాగుంది"');
  }

  // -------------------------------------------------------------------------
  // SCENARIO B: Acoustic variants "బాగానే ఉంది" and "లాగా ఉంది" -> immediate ack + Q2
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario B: Acoustic variants "బాగానే ఉంది" and "లాగా ఉంది" ---');
  {
    // B1: "బాగానే ఉంది"
    const sessB1 = `scen_b1_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sessB1, eventId: 'event_public_survey' });
    const tB1 = SurveySequentialEngine.processTurnSync({
      sessionId: sessB1,
      eventId: 'event_public_survey',
      userUtterance: 'బాగానే ఉంది',
      toolCallId: `call_b1_${Date.now()}`,
    });
    assert(tB1.currentQuestionIndex === 1, 'B1 advanced to Q2');
    assert(tB1.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'B1 ack present');
    assert(tB1.reply.includes('రోడ్ల పరిస్థితి'), 'B1 Q2 asked');

    // B2: "లాగా ఉంది" (Deepgram acoustic variant of "బాగానే ఉంది" / "బాగుంది")
    const sessB2 = `scen_b2_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sessB2, eventId: 'event_public_survey' });
    const tB2 = SurveySequentialEngine.processTurnSync({
      sessionId: sessB2,
      eventId: 'event_public_survey',
      userUtterance: 'లాగా ఉంది',
      toolCallId: `call_b2_${Date.now()}`,
    });
    assert(tB2.currentQuestionIndex === 1, 'B2 ("లాగా ఉంది") recognized as valid positive and advanced to Q2');
    assert(tB2.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'B2 ack present');
    assert(tB2.reply.includes('రోడ్ల పరిస్థితి'), 'B2 Q2 asked together');

    // Additional short affirmative checks: "మంచిగా ఉంది", "పరవాలేదు", "ఓకే", "ఉంది", "బాగున్నాయి"
    const additionalAffirmatives = ['మంచిగా ఉంది', 'పరవాలేదు', 'ఓకే', 'ఉంది', 'బాగున్నాయి', 'బాగుంది అండి'];
    for (const aff of additionalAffirmatives) {
      const s = `scen_aff_${aff}_${Date.now()}`;
      SurveySequentialEngine.processTurnSync({ sessionId: s, eventId: 'event_public_survey' });
      const t = SurveySequentialEngine.processTurnSync({
        sessionId: s,
        eventId: 'event_public_survey',
        userUtterance: aff,
        toolCallId: `call_${aff}_${Date.now()}`,
      });
      assert(t.currentQuestionIndex === 1, `Short affirmative "${aff}" advanced to Q2`);
      assert(t.reply.includes('సరే అండి, ధన్యవాదాలు.'), `Short affirmative "${aff}" got immediate ack`);
    }
  }

  // -------------------------------------------------------------------------
  // SCENARIO C: Simple negative "బాగోలేదు" -> immediate ack + Q2 (NO clarification!)
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario C: Simple negative "బాగోలేదు" -> immediate ack (no clarification) ---');
  {
    const sess = `scen_c_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగోలేదు',
      toolCallId: `call_c_${Date.now()}`,
    });

    assert(t1.currentQuestionIndex === 1, 'Simple negative "బాగోలేదు" accepted directly without clarification, advanced to Q2');
    assert(t1.action === 'ASK_MAIN_QUESTION', 'Action is ASK_MAIN_QUESTION (not ASK_FOLLOW_UP)');
    assert(t1.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'Approved acknowledgement present');
    assert(t1.reply.includes('రోడ్ల పరిస్థితి'), 'Question 2 asked directly');
    assert(!t1.reply.includes('ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?'), 'Clarification question MUST NOT be asked for simple negative answer');
  }

  // -------------------------------------------------------------------------
  // SCENARIO D: Detailed negative "రోడ్లు బాగోలేవు. గుంతలు ఉన్నాయి." -> immediate ack + Q3
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario D: Detailed negative "రోడ్లు బాగోలేవు. గుంతలు ఉన్నాయి." ---');
  {
    const sess = `scen_d_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    // Answer Q1
    SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగుంది',
      toolCallId: `call_d1_${Date.now()}`,
    });
    // Answer Q2 with details
    const t2 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'రోడ్లు బాగోలేవు. గుంతలు ఉన్నాయి.',
      toolCallId: `call_d2_${Date.now()}`,
    });

    assert(t2.currentQuestionIndex === 2, 'Advanced to Q3 (Electricity)');
    assert(t2.action === 'ASK_MAIN_QUESTION', 'Action is ASK_MAIN_QUESTION without clarification');
    assert(t2.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'Ack present');
    assert(t2.reply.includes('విద్యుత్ సరఫరా'), 'Q3 (Electricity) asked directly');
    assert(!t2.reply.includes('వివరంగా చెప్తారా'), 'No clarification asked when details already given');
  }

  // -------------------------------------------------------------------------
  // SCENARIO E: Vague problem "సమస్య ఉంది" -> exactly 1 clarification
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario E: Vague problem "సమస్య ఉంది" -> 1 clarification ---');
  {
    const sess = `scen_e_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది',
      toolCallId: `call_e1_${Date.now()}`,
    });

    assert(t1.currentQuestionIndex === 0, 'Still on Q1 awaiting clarification');
    assert(t1.action === 'ASK_FOLLOW_UP', 'Action is ASK_FOLLOW_UP');
    assert(t1.reply === TELUGU_STRINGS.CASE_B_FOLLOW_UP, `Clarification matches approved: "${TELUGU_STRINGS.CASE_B_FOLLOW_UP}"`);
  }

  // -------------------------------------------------------------------------
  // SCENARIO F: Short answer after clarification -> ack + next question
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario F: Short answer after clarification ---');
  {
    const sess = `scen_f_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    // Turn 1: Vague problem
    SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది',
      toolCallId: `call_f1_${Date.now()}`,
    });
    // Turn 2: Respondent clarifies with short answer
    const t2 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'నీళ్లు సరిగా రావు',
      toolCallId: `call_f2_${Date.now()}`,
    });

    assert(t2.currentQuestionIndex === 1, 'Advanced to Q2 after clarification answered');
    assert(t2.action === 'ASK_MAIN_QUESTION', 'Action is ASK_MAIN_QUESTION');
    assert(t2.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'Ack present after clarification');
    assert(t2.reply.includes('రోడ్ల పరిస్థితి'), 'Q2 asked');
  }

  // -------------------------------------------------------------------------
  // SCENARIO G: Short answer followed by pause / silence -> finalization and progression
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario G: Short answer followed by pause / silence ---');
  {
    const sess = `scen_g_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగుంది',
      toolCallId: `call_g1_${Date.now()}`,
    });
    assert(t1.currentQuestionIndex === 1, 'Finalized and advanced to Q2');
    assert(t1.reply.includes('సరే అండి, ధన్యవాదాలు.'), 'Ack provided');
    assert(t1.reply.includes('రోడ్ల పరిస్థితి'), 'Next question provided');
  }

  // -------------------------------------------------------------------------
  // SCENARIO H: Duplicate partial/final webhook events -> exactly 1 answer saved, 1 tool dispatch
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario H: Duplicate webhook protection ---');
  {
    const sess = `scen_h_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    const toolCallId = `idempotent_tool_call_${Date.now()}`;

    // First delivery
    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగానే ఉంది',
      toolCallId,
    });

    // Duplicate webhook delivery with identical toolCallId
    const t2 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'బాగానే ఉంది',
      toolCallId,
    });

    assert(t1.currentQuestionIndex === 1, 'First dispatch advanced to Q2');
    assert(t2.currentQuestionIndex === 1, 'Duplicate dispatch did not double advance');
    assert(t1.reply === t2.reply, 'Identical cached response returned');
    assert(t2.extractedAnswers.length === 1, 'Exactly 1 answer saved, no duplicate entries');
  }

  // -------------------------------------------------------------------------
  // SCENARIO I: Unclear speech -> no fake answer invented
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario I: Unclear speech -> clarification without invented answer ---');
  {
    const sess = `scen_i_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });
    const t1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess,
      eventId: 'event_public_survey',
      userUtterance: 'అర్థం కాలేదు మళ్లీ చెప్పండి',
      toolCallId: `call_i1_${Date.now()}`,
    });

    assert(t1.currentQuestionIndex === 0, 'Still on Q1');
    assert(t1.action === 'CLARIFY', 'Action is CLARIFY');
    assert(t1.extractedAnswers.length === 0, 'No fake answer recorded for unclear speech');
    assert(t1.reply.includes('క్షమించండి'), 'Polite repeat clarification returned');
  }

  // -------------------------------------------------------------------------
  // SCENARIO J: Full survey completion to Q6 with exact approved closing
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario J: Full 6-question completion with exact approved closing ---');
  {
    const sess = `scen_j_${Date.now()}`;
    SurveySequentialEngine.processTurnSync({ sessionId: sess, eventId: 'event_public_survey' });

    const surveyAnswers = [
      'బాగుంది',                         // Q1 Water
      'బాగానే ఉంది',                    // Q2 Roads
      'కరెంట్ రోజూ ఉంటుంది',             // Q3 Electricity
      'డ్రైనేజీ బాగుంది',                // Q4 Drainage
      'చెత్త సేకరణ బాగానే ఉంది',         // Q5 Sanitation
      'ఆరోగ్య సేవలు సరిపోతున్నాయి అండి', // Q6 Healthcare
    ];

    let currentTurn: any = null;
    for (let i = 0; i < surveyAnswers.length; i++) {
      currentTurn = SurveySequentialEngine.processTurnSync({
        sessionId: sess,
        eventId: 'event_public_survey',
        userUtterance: surveyAnswers[i],
        toolCallId: `call_j_${i}_${Date.now()}`,
      });
    }

    assert(currentTurn.isSurveyComplete === true, 'Survey marked complete after Q6');
    const expectedClosing = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';
    assert(currentTurn.reply === expectedClosing, `Closing message matches approved verbatim:\nExpected: ${expectedClosing}\nGot: ${currentTurn.reply}`);
    assert(currentTurn.extractedAnswers.length === 6, 'All 6 answers persisted');
  }

  // -------------------------------------------------------------------------
  // 4. VERIFY VAPI WIRE CONFIGURATION INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n--- Step 4: Verify Outbound Vapi Wire Configuration ---');
  let capturedPayload: any = null;
  const originalFetch = global.fetch;

  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/call/phone')) {
      capturedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `call_test_wire_${Date.now()}`,
          phoneCallProviderId: 'CA_test_123',
          status: 'queued',
        }),
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    VapiService.setRuntimeConfig('vapi-key-123', 'phone-id-456', '');
    await VapiService.createOutboundCall({
      phoneNumber: '+919988776655',
      contactName: 'Suresh Kumar',
      campaignId: 'camp_short_telugu_test',
      eventId: 'event_public_survey',
      moduleType: 'public_survey',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారమండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. మొదటిగా, మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
    });

    assert(capturedPayload !== null, 'Vapi payload was captured');
    const asst = capturedPayload.assistant;

    // Check voice profile
    assert(asst.voice.provider === '11labs', 'Voice provider is 11labs');
    assert(asst.voice.voiceId === 'Txde0pZ5tVhXE6HUspcf', 'Voice ID is Txde0pZ5tVhXE6HUspcf');
    assert(asst.voice.model === 'eleven_v4_turbo', 'Voice model is eleven_v4_turbo');
    assert(asst.voice.speed === 1.0, 'Voice speed is 1.0');
    assert(asst.voice.stability === 0.50, 'Voice stability is 0.50');
    assert(asst.voice.similarityBoost === 0.85, 'Voice similarityBoost is 0.85');
    assert(asst.voice.style === 0.15, 'Voice style is 0.15');
    assert(asst.voice.useSpeakerBoost === true, 'Voice speakerBoost is true');

    // Check stopSpeakingPlan
    assert(asst.stopSpeakingPlan.numWords === 2, 'stopSpeakingPlan numWords is 2');
    assert(asst.stopSpeakingPlan.voiceSeconds === 0.5, 'stopSpeakingPlan voiceSeconds is 0.5');
    assert(asst.stopSpeakingPlan.backoffSeconds === 1, 'stopSpeakingPlan backoffSeconds is 1');

    // Check transcriber
    assert(asst.transcriber.provider === 'deepgram', 'Transcriber provider is deepgram');
    assert(asst.transcriber.model === 'nova-3', 'Transcriber model is nova-3');
    assert(asst.transcriber.language === 'te', 'Transcriber language is native Telugu "te"');
    assert(asst.transcriber.endpointing === 350, 'Transcriber endpointing is 350ms for snappy turn-taking');

    // Check prompt guidance contains short Telugu answers instruction
    const sysPrompt = asst.model.messages[0].content;
    assert(sysPrompt.includes('CRITICAL FOR SHORT TELUGU ANSWERS'), 'System prompt contains explicit short Telugu answers rule');
    assert(sysPrompt.includes('బాగుంది'), 'System prompt lists "బాగుంది"');
    assert(sysPrompt.includes('లాగా ఉంది'), 'System prompt lists "లాగా ఉంది"');
    assert(sysPrompt.includes('బాగోలేదు'), 'System prompt lists "బాగోలేదు"');

    // Check tool description
    const surveyTool = asst.model.tools.find((t: any) => t.function?.name === 'recordSurveyAnswerAndGetNextAction');
    assert(surveyTool !== undefined, 'recordSurveyAnswerAndGetNextAction tool present');
    assert(surveyTool.function.description.includes('short 1-to-2 word answers'), 'Tool description emphasizes short answers');
    assert(surveyTool.messages[0].content === '', 'Tool request-start message content is empty (prevents filler speech)');

  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n========================================================================');
  console.log(`ALL TESTS PASSED! (${passed}/${total} assertions passed cleanly)`);
  console.log('========================================================================');
}

runShortTeluguAnswersRegression().catch((err) => {
  console.error('\n[REGRESSION_FAILURE]', err);
  process.exit(1);
});
