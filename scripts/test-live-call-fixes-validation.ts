import { VapiService } from '../server/telephony/vapiService';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine';

async function runLiveCallFixesValidation() {
  console.log('========================================================================');
  console.log('TESTING LIVE CALL FIXES — 12 MANDATORY VERIFICATION SCENARIOS');
  console.log('========================================================================\n');

  let passedTests = 0;
  const totalTests = 12;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`[PASS] ${msg}`);
  }

  // -------------------------------------------------------------------------
  // SCENARIO 1: AI intro spoken with multiple partial transcripts + 1 final
  // Exactly 1 complete AI transcript entry must result.
  // -------------------------------------------------------------------------
  console.log('--- Scenario 1: AI Intro Streaming Transcript Aggregation ---');
  {
    const jobId = `job_test_sc1_${Date.now()}`;
    const testJob: any = {
      id: jobId,
      eventType: 'public_survey',
      campaignId: 'camp_test_sc1',
      surveyResponses: [],
      transcript: [],
      surveyState: {
        currentQuestionIndex: 0,
        currentQuestionId: 'q1',
        clarificationCount: 0,
      },
    };
    callbridgeStorage.saveCallJob(testJob);

    // Simulate 6 streaming partial updates followed by 1 final update for the intro
    const partials = [
      'నమస్కారమండి. మీ ప్రాంతంలోని',
      'నమస్కారం అండి మీ ప్రాంతంలోని ప్రజా సదుపాయాల',
      'నమస్కారమండి, మీ ప్రాంతం',
      'ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి',
      'లోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాము.',
      'ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
    ];

    for (const partial of partials) {
      VapiService.appendSurveyTranscriptTurn(testJob, 'agent', partial, undefined, undefined, undefined, true);
    }

    // Final authoritative event
    const finalIntro = 'నమస్కారమండి, ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. మొదటిగా, మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?';
    VapiService.appendSurveyTranscriptTurn(testJob, 'agent', finalIntro, undefined, undefined, undefined, false);

    assert(testJob.transcript.length === 1, `Expected exactly 1 AI transcript entry, got ${testJob.transcript.length}`);
    assert(testJob.transcript[0].speakerRole === 'assistant' || testJob.transcript[0].role === 'assistant', `Expected speaker assistant, got ${testJob.transcript[0].role}`);
    assert(testJob.transcript[0].text === finalIntro, `Expected final text to match authoritative intro`);
    assert(testJob.transcript[0].isFinal === true, `Expected transcript turn to be marked isFinal: true`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 2: Respondent answer arrives with cumulative partials + 1 final
  // Exactly 1 complete respondent transcript entry must result.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Respondent Cumulative Partials Aggregation ---');
  {
    const jobId = `job_test_sc2_${Date.now()}`;
    const testJob: any = {
      id: jobId,
      eventType: 'public_survey',
      campaignId: 'camp_test_sc2',
      surveyResponses: [],
      transcript: [
        {
          role: 'assistant',
          speakerRole: 'assistant',
          text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
          isFinal: true,
          timestamp: new Date().toISOString(),
        },
      ],
      surveyState: {
        currentQuestionIndex: 0,
        currentQuestionId: 'q1',
        clarificationCount: 0,
      },
    };
    callbridgeStorage.saveCallJob(testJob);

    // Simulate cumulative partials
    const userPartials = [
      'తాగునీరు',
      'తాగునీరు రోజూ రావడం లేదు',
      'తాగునీరు రోజూ రావడం లేదు వారానికి',
      'తాగునీరు రోజూ రావడం లేదు వారానికి రెండు రోజులే వస్తోంది',
    ];

    for (const partial of userPartials) {
      VapiService.appendSurveyTranscriptTurn(testJob, 'respondent', partial, undefined, 0.95, undefined, true);
    }

    // Final event
    const finalAnswer = 'తాగునీరు రోజూ రావడం లేదు వారానికి రెండు రోజులే వస్తోంది.';
    VapiService.appendSurveyTranscriptTurn(testJob, 'respondent', finalAnswer, undefined, 0.98, undefined, false);

    const respondentTurns = testJob.transcript.filter((t: any) => t.role === 'respondent' || t.speakerRole === 'respondent');
    assert(respondentTurns.length === 1, `Expected exactly 1 respondent turn, got ${respondentTurns.length}`);
    assert(respondentTurns[0].text === finalAnswer, `Expected turn text to equal finalAnswer`);
    assert(respondentTurns[0].isFinal === true, `Expected respondent turn to be marked isFinal: true`);
    assert(testJob.transcript.length === 2, `Total turns in transcript should be 2 (1 agent, 1 respondent)`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 3: Respondent says "బాగానే ఉంది."
  // Exactly 1 ack + next question, no waiting speech, exactly 1 assistant dispatch.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Positive Answer Progression Without Waiting Speech ---');
  {
    const sess3 = `sess_sc3_${Date.now()}`;
    // Greeting
    const init = await SurveySequentialEngine.processTurn({ sessionId: sess3, eventId: 'event_public_survey' });
    assert(init.currentQuestionIndex === 0, `Initial question index should be 0`);

    // Respondent answers "బాగానే ఉంది."
    const turn = await SurveySequentialEngine.processTurn({
      sessionId: sess3,
      eventId: 'event_public_survey',
      userUtterance: 'బాగానే ఉంది.',
    });

    assert(turn.currentQuestionIndex === 1, `Question must advance to Q2 (index 1), got index ${turn.currentQuestionIndex}`);
    assert(turn.reply.startsWith('సరే అండి, ధన్యవాదాలు.'), `Must start with approved acknowledgement 'సరే అండి, ధన్యవాదాలు.'`);
    assert(turn.reply.includes('రోడ్ల పరిస్థితి'), `Must ask Q2 (roads), reply: ${turn.reply}`);
    assert(!VapiService.isWaitingPhrase(turn.reply), `Reply must not contain waiting phrases`);
    assert(!turn.reply.includes('నాకు ఒక క్షణం ఇవ్వు'), `Must NOT contain 'నాకు ఒక క్షణం ఇవ్వు'`);
    assert(!turn.reply.includes('వేచి ఉండండి'), `Must NOT contain 'వేచి ఉండండి'`);
    assert(!turn.reply.includes('ఏ సమస్య ఉందో'), `Must NOT ask clarification on positive answer`);

    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 4: Respondent says "రోడ్లు బాగోలేవు. గుంతలు ఉన్నాయి."
  // Specific problem: exactly 1 ack + next question, NO clarification question, no filler.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Specific Problem Statement Progression ---');
  {
    const sess4 = `sess_sc4_${Date.now()}`;
    await SurveySequentialEngine.processTurn({ sessionId: sess4, eventId: 'event_public_survey' });
    // Advance to Q2
    await SurveySequentialEngine.processTurn({ sessionId: sess4, eventId: 'event_public_survey', userUtterance: 'బాగుంది.' });

    // Respondent gives specific problem on Q2
    const turn = await SurveySequentialEngine.processTurn({
      sessionId: sess4,
      eventId: 'event_public_survey',
      userUtterance: 'రోడ్లు బాగోలేవు. గుంతలు ఉన్నాయి.',
    });

    assert(turn.currentQuestionIndex === 2, `Specific problem should advance to Q3 (index 2), got index ${turn.currentQuestionIndex}`);
    assert(turn.reply.startsWith('సరే అండి, ధన్యవాదాలు.'), `Must start with approved acknowledgement`);
    assert(turn.reply.includes('విద్యుత్'), `Must ask Q3 (electricity), reply: ${turn.reply}`);
    assert(!turn.reply.includes('ఏ సమస్య ఉందో కొంచెం వివరంగా'), `Must NOT ask clarification for specific problem`);
    assert(!VapiService.isWaitingPhrase(turn.reply), `Must not contain filler phrases`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 5: Respondent says "సమస్య ఉంది."
  // Vague problem: exactly 1 clarification question, no progression, no filler speech.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Vague Problem Needs Clarification ---');
  {
    const sess5 = `sess_sc5_${Date.now()}`;
    await SurveySequentialEngine.processTurn({ sessionId: sess5, eventId: 'event_public_survey' });

    // Respondent gives vague problem
    const turn = await SurveySequentialEngine.processTurn({
      sessionId: sess5,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది.',
    });

    assert(turn.currentQuestionIndex === 0, `Question must NOT advance; should remain at index 0, got ${turn.currentQuestionIndex}`);
    assert(turn.reply.includes('ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?'), `Must ask approved clarification question, reply: ${turn.reply}`);
    assert(!VapiService.isWaitingPhrase(turn.reply), `Clarification must not be a waiting phrase`);
    assert(!turn.reply.includes('నాకు ఒక క్షణం ఇవ్వు'), `Must NOT contain 'నాకు ఒక క్షణం ఇవ్వు'`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 6: Respondent explains problem after clarification
  // Exactly 1 ack + next question, no waiting speech.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Explanation After Clarification Advances Question ---');
  {
    const sess6 = `sess_sc6_${Date.now()}`;
    await SurveySequentialEngine.processTurn({ sessionId: sess6, eventId: 'event_public_survey' });
    // Trigger clarification
    await SurveySequentialEngine.processTurn({ sessionId: sess6, eventId: 'event_public_survey', userUtterance: 'సమస్య ఉంది.' });

    // Respondent explains after clarification
    const turn = await SurveySequentialEngine.processTurn({
      sessionId: sess6,
      eventId: 'event_public_survey',
      userUtterance: 'పైపులు పగిలిపోయి మురుగు నీరు కలుస్తోంది.',
    });

    assert(turn.currentQuestionIndex === 1, `Must advance to Q2 (index 1) after explanation, got ${turn.currentQuestionIndex}`);
    assert(turn.reply.startsWith('సరే అండి, ధన్యవాదాలు.'), `Must start with approved acknowledgement`);
    assert(turn.reply.includes('రోడ్ల పరిస్థితి'), `Must ask Q2 (roads), reply: ${turn.reply}`);
    assert(!turn.reply.includes('ఏ సమస్య ఉందో కొంచెం వివరంగా'), `Must NOT repeat clarification`);
    assert(!VapiService.isWaitingPhrase(turn.reply), `Must not contain waiting phrases`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 7: Duplicate webhook event delivery for the same turn
  // Exactly 1 state advancement, 1 saved answer, 1 response dispatch.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Webhook Idempotency & Duplicate Delivery Guard ---');
  {
    const sess7JobId = `job_test_sc7_${Date.now()}`;
    const sess7ProviderId = `vapi_call_sc7_${Date.now()}`;
    
    // Register alias and state
    SurveySequentialEngine.aliasSession(sess7ProviderId, sess7JobId);
    const state = SurveySequentialEngine.getOrCreateState(sess7JobId, 'camp_test_sc7', 'event_public_survey');
    
    // First delivery (tool call or transcript)
    const turn1 = SurveySequentialEngine.processTurnSync({
      sessionId: sess7ProviderId,
      questionId: state.currentQuestionId,
      userUtterance: 'నీరు బాగుంది.',
    });
    const stateAfter1 = SurveySequentialEngine.getState(sess7ProviderId);
    assert(turn1.currentQuestionIndex === 1, `First delivery advances question to index 1`);
    assert(stateAfter1?.answeredQuestionIds.length === 1, `Exactly 1 answered question ID`);

    // Duplicate delivery with the same questionId and utterance
    const turn2 = SurveySequentialEngine.processTurnSync({
      sessionId: sess7ProviderId,
      questionId: 'A1', // Old question ID that was already answered
      userUtterance: 'నీరు బాగుంది.',
    });
    const stateAfter2 = SurveySequentialEngine.getState(sess7ProviderId);
    assert(stateAfter2?.currentQuestionIndex === 1, `Duplicate delivery must NOT advance index again (remains 1, got ${stateAfter2?.currentQuestionIndex})`);
    assert(stateAfter2?.answeredQuestionIds.length === 1, `Duplicate delivery must NOT append a duplicate answer`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 8: Two distinct genuine respondent turns with similar text
  // e.g. "బాగానే ఉంది" on Q1 and "బాగానే ఉంది" on Q2 -> both genuine turns preserved.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Preserving Identical Answers Across Distinct Turns ---');
  {
    const jobId = `job_test_sc8_${Date.now()}`;
    const testJob: any = {
      id: jobId,
      eventType: 'public_survey',
      campaignId: 'camp_test_sc8',
      surveyResponses: [],
      transcript: [],
      surveyState: {
        currentQuestionIndex: 0,
        currentQuestionId: 'q1',
        clarificationCount: 0,
      },
    };
    callbridgeStorage.saveCallJob(testJob);

    // Turn 1: Agent asks Q1
    VapiService.appendSurveyTranscriptTurn(testJob, 'agent', 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', undefined, undefined, undefined, false);

    // Turn 2: Respondent answers "బాగానే ఉంది" for Q1
    VapiService.appendSurveyTranscriptTurn(testJob, 'respondent', 'బాగానే ఉంది', undefined, 0.99, undefined, false);

    // Turn 3: Agent acknowledges and asks Q2
    VapiService.appendSurveyTranscriptTurn(testJob, 'agent', 'సరే అండి, ధన్యవాదాలు. మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', undefined, undefined, undefined, false);

    // Turn 4: Respondent answers "బాగానే ఉంది" for Q2 (identical wording, different question turn!)
    VapiService.appendSurveyTranscriptTurn(testJob, 'respondent', 'బాగానే ఉంది', undefined, 0.99, undefined, false);

    const respondentTurns = testJob.transcript.filter((t: any) => t.role === 'respondent' || t.speakerRole === 'respondent');
    assert(respondentTurns.length === 2, `Expected both genuine respondent turns to be preserved, found ${respondentTurns.length}`);
    assert(respondentTurns[0].text === 'బాగానే ఉంది', `Turn 1 text correct`);
    assert(respondentTurns[1].text === 'బాగానే ఉంది', `Turn 2 text correct`);
    assert(testJob.transcript.length === 4, `Expected exactly 4 total turns in transcript, found ${testJob.transcript.length}`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 9: Assistant transcript and actual generated response idempotency
  // No duplicate entries created for the same assistant turn.
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Assistant Transcript Deduplication ---');
  {
    const jobId = `job_test_sc9_${Date.now()}`;
    const testJob: any = {
      id: jobId,
      eventType: 'public_survey',
      campaignId: 'camp_test_sc9',
      surveyResponses: [],
      transcript: [
        {
          role: 'respondent',
          speakerRole: 'respondent',
          text: 'బాగానే ఉంది.',
          isFinal: true,
        },
      ],
      surveyState: {
        currentQuestionIndex: 1,
        currentQuestionId: 'q2',
        clarificationCount: 0,
      },
    };
    callbridgeStorage.saveCallJob(testJob);

    const agentResponse = 'సరే అండి, ధన్యవాదాలు. మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?';
    
    // First: Tool or assistant dispatches response
    VapiService.appendSurveyTranscriptTurn(testJob, 'agent', agentResponse, undefined, undefined, undefined, false);

    // Second: Vapi transcript webhook reports the same spoken text (authoritative final)
    VapiService.appendSurveyTranscriptTurn(testJob, 'agent', agentResponse, undefined, undefined, undefined, false);

    const agentTurns = testJob.transcript.filter((t: any) => t.role === 'assistant' || t.speakerRole === 'assistant');
    assert(agentTurns.length === 1, `Duplicate assistant report must not create second turn, found ${agentTurns.length}`);
    assert(agentTurns[0].text === agentResponse, `Text preserved correctly`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 10: No additional assistant message dispatched after ack + next question
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Single Turn Finality (No Second Dispatch) ---');
  {
    const vapiCallId = 'vapi_call_sc10_' + Date.now();
    const jobId = `job_test_sc10_${Date.now()}`;
    const initialJob: any = {
      id: jobId,
      providerCallId: vapiCallId,
      eventType: 'public_survey',
      campaignId: 'camp_test_sc10',
      eventId: 'event_public_survey',
      surveyResponses: [],
      transcript: [],
      surveyState: {
        currentQuestionIndex: 0,
        currentQuestionId: 'A1',
        clarificationCount: 0,
      },
    };
    callbridgeStorage.saveCallJob(initialJob);
    callbridgeStorage.mapProviderCallIdToJob(vapiCallId, jobId, 'camp_test_sc10', 'event_public_survey');

    // Execute tool action via authoritative Vapi webhook tool-calls
    const toolCallId = 'call_tool_test_sc10';
    const webhookPayload = {
      message: {
        type: 'tool-calls',
        call: { id: vapiCallId },
        toolCallList: [
          {
            id: toolCallId,
            type: 'function',
            function: {
              name: 'recordSurveyAnswerAndGetNextAction',
              arguments: {
                questionId: 'A1',
                answerText: 'నీరు బాగుంది.',
              },
            },
          },
        ],
      },
    };

    const webhookResult: any = await VapiService.handleWebhook(webhookPayload);

    assert(Array.isArray(webhookResult.results), `webhookResult must have results array`);
    assert(webhookResult.results.length === 1, `Expected exactly 1 tool result, got ${webhookResult.results.length}`);
    assert(webhookResult.results[0].toolCallId === toolCallId, `toolCallId must match`);
    
    const spokenReply = webhookResult.results[0].result;
    assert(spokenReply.includes('ధన్యవాదాలు'), `Spoken reply includes acknowledgement: ${spokenReply}`);
    assert(spokenReply.includes('రోడ్ల పరిస్థితి'), `Spoken reply includes next question directly: ${spokenReply}`);
    assert(!VapiService.isWaitingPhrase(spokenReply), `Spoken reply must never contain waiting phrases`);
    assert(!spokenReply.includes('నాకు ఒక క్షణం ఇవ్వు'), `Must NOT contain 'నాకు ఒక క్షణం ఇవ్వు'`);

    // Verify outbound call payload contains empty request-start message to suppress Vapi filler speech
    let capturedBody: any = null;
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string, init?: any) => {
      if (url.includes('/call/phone')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'vapi_test_call_99', status: 'queued' }),
        } as any;
      }
      return origFetch(url, init);
    };

    try {
      VapiService.setRuntimeConfig('test-vapi-key-12345', 'phone-id-test-123', '');
      await VapiService.createOutboundCall({
        phoneNumber: '+919999988888',
        contactName: 'Test Citizen',
        campaignId: 'camp_test_sc10',
        moduleType: 'public_survey',
        voiceId: 'Txde0pZ5tVhXE6HUspcf',
        script: 'నమస్కారమండి, ప్రజా సదుపాయాల గురించి మాట్లాడటానికి కాల్ చేశాము. మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
      });
      assert(capturedBody !== null, `Outbound call payload should be generated`);
      const tools = capturedBody.assistant?.model?.tools || [];
      const recordTool = tools.find((t: any) => t.function?.name === 'recordSurveyAnswerAndGetNextAction');
      assert(recordTool !== undefined, `recordSurveyAnswerAndGetNextAction tool must be registered in model.tools`);
      assert(Array.isArray(recordTool.messages), `Tool must have messages array`);
      const startMsg = recordTool.messages.find((m: any) => m.type === 'request-start');
      assert(startMsg && startMsg.content === '', `Tool request-start message must be empty string to disable Vapi filler speech`);
    } finally {
      global.fetch = origFetch;
    }

    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 11: Sequential progression across all 6 saved survey questions
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 11: All 6 Saved Questions Sequential Execution ---');
  {
    const sess11 = `sess_sc11_${Date.now()}`;
    const activeQuestions = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
    assert(activeQuestions.length === 6, `Expected exactly 6 active survey questions, got ${activeQuestions.length}`);
    assert(activeQuestions[0].text === 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', `Q1 text must match exact drinking water question`);
    assert(activeQuestions[1].text === 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', `Q2 text must match exact roads question`);
    assert(activeQuestions[2].text === 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?', `Q3 text must match exact electricity question`);
    assert(activeQuestions[3].text === 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?', `Q4 text must match exact drainage question`);
    assert(activeQuestions[4].text === 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?', `Q5 text must match exact waste collection question`);
    assert(activeQuestions[5].text === 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?', `Q6 text must match exact healthcare services question`);

    const init = await SurveySequentialEngine.processTurn({ sessionId: sess11, eventId: 'event_public_survey' });
    assert(init.currentQuestionIndex === 0, `Initial question index is 0`);
    assert(init.reply.includes(activeQuestions[0].text), `Initial reply asks Q1 (water)`);

    const answers = [
      'నీటి సమస్య ఏమీ లేదు, బాగానే ఉంది.',                         // Q1: Drinking Water
      'రోడ్లపై గుంతలు ఉన్నాయి, బాగు చేయాలి.',                       // Q2: Roads
      'కరెంట్ రోజూ ఉంటుంది, బాగుంది.',                             // Q3: Electricity
      'డ్రైనేజీ సరిగ్గా లేదు, మురుగు నీరు నిలుస్తోంది.',             // Q4: Drainage
      'చెత్త సేకరణ రోజూ జరుగుతోంది, పారిశుధ్యం బాగుంది.',            // Q5: Waste Collection & Sanitation
      'స్థానిక ఆరోగ్య కేంద్రంలో డాక్టర్లు, మందులు అందుబాటులో ఉన్నాయి.', // Q6: Healthcare Services
    ];

    const expectedNextQuestions = [
      'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
      'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?',
      'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?',
      'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?',
      'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?',
    ];

    for (let i = 0; i < answers.length; i++) {
      const turn = await SurveySequentialEngine.processTurn({
        sessionId: sess11,
        eventId: 'event_public_survey',
        userUtterance: answers[i],
      });

      if (i < 5) {
        assert(turn.currentQuestionIndex === i + 1, `Question ${i + 1} should advance to index ${i + 1}, got ${turn.currentQuestionIndex}`);
        assert(turn.reply.startsWith('సరే అండి, ధన్యవాదాలు.'), `Must start with approved acknowledgement`);
        assert(turn.reply.includes(expectedNextQuestions[i]), `Must deliver Q${i + 2} text: ${expectedNextQuestions[i]}`);
      } else {
        // Last question (Q6)
        assert(turn.isCompleted === true, `isCompleted should be true after Q6`);
        const exactApprovedClosing = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';
        assert(turn.reply === exactApprovedClosing, `Final response must match exact approved closing message:\nExpected: "${exactApprovedClosing}"\nReceived: "${turn.reply}"`);
      }
    }

    const finalState = SurveySequentialEngine.getState(sess11);
    assert(finalState?.answeredQuestionIds.length === 6, `All 6 responses should be recorded in engine, got ${finalState?.answeredQuestionIds.length}`);
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // SCENARIO 12: Q6 response triggers warm Telugu closing & single call termination
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Q6 Warm Closing and Clean Termination ---');
  {
    const sess12 = `sess_sc12_${Date.now()}`;
    await SurveySequentialEngine.processTurn({ sessionId: sess12, eventId: 'event_public_survey' });
    
    const answers = [
      'నీరు బాగుంది.',
      'రోడ్లు బాగున్నాయి.',
      'విద్యుత్ బాగుంది.',
      'డ్రైనేజీ బాగుంది.',
      'చెత్త సేకరణ బాగుంది.',
    ];

    // Progress through Q1 to Q5
    for (const ans of answers) {
      await SurveySequentialEngine.processTurn({
        sessionId: sess12,
        eventId: 'event_public_survey',
        userUtterance: ans,
      });
    }

    // Now answer Q6 (Healthcare services question)
    const turn6 = await SurveySequentialEngine.processTurn({
      sessionId: sess12,
      eventId: 'event_public_survey',
      userUtterance: 'ఆరోగ్య సేవలు మా అవసరాలకు సరిపోతున్నాయి.',
    });

    assert(turn6.isCompleted === true, `Expected isCompleted: true`);
    const exactApprovedClosing = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';
    assert(turn6.reply === exactApprovedClosing, `Closing message must match exact approved closing text`);
    assert(!VapiService.isWaitingPhrase(turn6.reply), `Closing text must never be classified as waiting phrase`);

    passedTests++;
  }

  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} MANDATORY VERIFICATION SCENARIOS PASSED WITH ZERO ERRORS!`);
  console.log('========================================================================');
}

runLiveCallFixesValidation().catch((err) => {
  console.error('[TEST_RUNNER_ERROR]', err);
  process.exit(1);
});
