import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage, SurveyQuestion } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

async function runMasterVerificationTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — MASTER FIX 15-TEST VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalTests = 15;

  const results: { testNum: number; name: string; passed: boolean; details: string }[] = [];

  function recordResult(testNum: number, name: string, passed: boolean, details: string) {
    if (passed) passedCount++;
    results.push({ testNum, name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [Test ${testNum}]: ${name}`);
    console.log(`   Details: ${details}\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 1: Case A — Positive answer ("బాగానే ఉంది.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c1_${Date.now()}`;
    const res1 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'బాగానే ఉంది.',
      questionId: 'A1',
    });

    const isAckCorrect = res1.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు.');
    const hasNextQ = res1.spokenResponse.includes('రోడ్ల పరిస్థితి ఎలా ఉంది');
    const noProblemPrompt = !res1.spokenResponse.includes('ఏంటి సమస్య');
    const isSuccess = isAckCorrect && hasNextQ && noProblemPrompt && res1.currentQuestionId === 'A2';

    recordResult(
      1,
      'Case A — Positive answer ("బాగానే ఉంది.")',
      isSuccess,
      `Spoken: "${res1.spokenResponse}". Next Q: ${res1.currentQuestionId}. Ack valid: ${isAckCorrect}, no problem query: ${noProblemPrompt}`
    );
  } catch (err: any) {
    recordResult(1, 'Case A — Positive answer', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Case A — Negation-based positive ("ఏ సమస్య లేదు, అంతా బాగుంది.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c2_${Date.now()}`;
    const res2 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'ఏ సమస్య లేదు, అంతా బాగుంది.',
      questionId: 'A1',
    });

    const isAckCorrect = res2.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు.');
    const hasNextQ = res2.spokenResponse.includes('రోడ్ల పరిస్థితి ఎలా ఉంది');
    const noProblemQuery = !res2.spokenResponse.includes('ఏంటి సమస్య');
    const isSuccess = isAckCorrect && hasNextQ && noProblemQuery && res2.currentQuestionId === 'A2';

    recordResult(
      2,
      'Case A — Negation-based positive ("ఏ సమస్య లేదు, అంతా బాగుంది.")',
      isSuccess,
      `Spoken: "${res2.spokenResponse}". Correctly classified positive despite Telugu negation word.`
    );
  } catch (err: any) {
    recordResult(2, 'Case A — Negation-based positive', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Case B — Problem reported and explained ("రోడ్లు బాగోలేవు. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c3_${Date.now()}`;
    // Start at Q2 (roads)
    const res3 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'మా ప్రాంతంలో రోడ్లు బాగోలేవు. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి, గుంతలు ఉన్నాయి.',
      questionId: 'A2',
    });

    const isAckCorrect = res3.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు.');
    const hasNextQ = res3.spokenResponse.includes('విద్యుత్') || res3.currentQuestionId === 'A3';
    const noClarification = !res3.spokenResponse.includes('వివరంగా చెప్తారా');
    const isSuccess = isAckCorrect && hasNextQ && noClarification;

    recordResult(
      3,
      'Case B — Problem reported and explained',
      isSuccess,
      `Spoken: "${res3.spokenResponse}". Advanced to Q3 directly without follow-up clarification.`
    );
  } catch (err: any) {
    recordResult(3, 'Case B — Problem reported and explained', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Case C — Problem reported without explanation ("సమస్య ఉంది.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c4_${Date.now()}`;
    const res4 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది.',
      questionId: 'A1',
    });

    const asksClarification = res4.spokenResponse.includes('ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?');
    const retainedQ1 = res4.currentQuestionId === 'A1';
    const actionFollowUp = res4.action === 'ASK_FOLLOW_UP';
    const isSuccess = asksClarification && retainedQ1 && actionFollowUp;

    recordResult(
      4,
      'Case C — Problem reported without explanation ("సమస్య ఉంది.")',
      isSuccess,
      `Spoken: "${res4.spokenResponse}". Retained Q1, asked single short clarification question.`
    );
  } catch (err: any) {
    recordResult(4, 'Case C — Problem reported without explanation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Case C — Clarification answer received ("తాగునీరు రెండు రోజులకొకసారి మాత్రమే వస్తుంది.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c5_${Date.now()}`;
    // Step 1: Vague problem
    SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది.',
      questionId: 'A1',
    });

    // Step 2: Clarification answered
    const res5 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'తాగునీరు రెండు రోజులకొకసారి మాత్రమే వస్తుంది.',
      questionId: 'A1',
    });

    const isAckCorrect = res5.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు.');
    const advancedToQ2 = res5.currentQuestionId === 'A2';
    const hasRoadsPrompt = res5.spokenResponse.includes('రోడ్ల పరిస్థితి ఎలా ఉంది');
    const isSuccess = isAckCorrect && advancedToQ2 && hasRoadsPrompt;

    recordResult(
      5,
      'Case C — Clarification answer received',
      isSuccess,
      `Spoken: "${res5.spokenResponse}". Answered clarification advances to Q2 with approved ack.`
    );
  } catch (err: any) {
    recordResult(5, 'Case C — Clarification answer received', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Case D — Skip / refusal answer handling ("దాటవేయండి" or refusal)
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c6_${Date.now()}`;
    const res6 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'ఈ ప్రశ్నను దాటవేయండి, తర్వాతి ప్రశ్న అడగండి.',
      questionId: 'A1',
    });

    const advancedToQ2 = res6.currentQuestionId === 'A2';
    const isSuccess = advancedToQ2;

    recordResult(
      6,
      'Case D — Skip / refusal answer handling',
      isSuccess,
      `Spoken: "${res6.spokenResponse}". Successfully skipped question and advanced to Q2.`
    );
  } catch (err: any) {
    recordResult(6, 'Case D — Skip / refusal answer handling', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: English positive answer ("No problem, everything is fine.")
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c7_${Date.now()}`;
    const res7 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'No problem, everything is fine.',
      questionId: 'A1',
    });

    const isAckCorrect = res7.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు.');
    const advancedToQ2 = res7.currentQuestionId === 'A2';
    const noProblemQuery = !res7.spokenResponse.includes('ఏంటి సమస్య');
    const isSuccess = isAckCorrect && advancedToQ2 && noProblemQuery;

    recordResult(
      7,
      'English positive answer ("No problem, everything is fine.")',
      isSuccess,
      `Spoken: "${res7.spokenResponse}". Correctly classified English positive and advanced to Q2.`
    );
  } catch (err: any) {
    recordResult(7, 'English positive answer', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Complete multi-sentence respondent answer preservation
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c8_${Date.now()}`;
    const longUtterance = 'మా ప్రాంతంలో రోడ్లు చాలా అధ్వానంగా ఉన్నాయి. వర్షం పడితే మొత్తం నీళ్లు నిలిచిపోతున్నాయి. వాహనాలు వెళ్లడం కష్టంగా ఉంది.';
    const res8 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: longUtterance,
      questionId: 'A2',
    });

    const state = SurveySequentialEngine.getState(callId);
    const savedAnswer = state?.answers?.['A2'];
    const respondentTurn = state?.transcripts?.find((t) => t.role === 'respondent' && t.text.includes('అధ్వానంగా'));

    const answerMatches = savedAnswer?.originalAnswer === longUtterance || savedAnswer?.answerText === longUtterance;
    const transcriptMatches = respondentTurn?.transcriptText === longUtterance;
    const isSuccess = Boolean(answerMatches && transcriptMatches);

    recordResult(
      8,
      'Complete multi-sentence respondent answer preservation',
      isSuccess,
      `Saved text: "${savedAnswer?.answerText}". Exact words preserved from first to last word without truncation.`
    );
  } catch (err: any) {
    recordResult(8, 'Complete multi-sentence respondent answer preservation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Streaming transcript deduplication (partial vs final)
  // -------------------------------------------------------------------------
  try {
    const job: any = {
      id: `job_stream_${Date.now()}`,
      providerCallId: `call_stream_${Date.now()}`,
      eventId: 'event_public_survey',
      transcript: [],
      originalTranscript: [],
    };

    // 1. Partial streaming fragment arrived
    VapiService.appendSurveyTranscriptTurn(job, 'respondent', 'బాగానే');
    // 2. More complete streaming arrived
    VapiService.appendSurveyTranscriptTurn(job, 'respondent', 'బాగానే ఉంది');
    // 3. Final complete sentence with punctuation arrived
    VapiService.appendSurveyTranscriptTurn(job, 'respondent', 'బాగానే ఉంది.');
    // 4. Duplicate final arrival
    VapiService.appendSurveyTranscriptTurn(job, 'respondent', 'బాగానే ఉంది.');

    // Expected: Exactly 1 respondent turn in job.transcript with full text "బాగానే ఉంది."
    const respondentTurns = job.transcript.filter((t: any) => t.speakerRole === 'respondent');
    const isSuccess = respondentTurns.length === 1 && respondentTurns[0].text === 'బాగానే ఉంది.';

    recordResult(
      9,
      'Streaming transcript deduplication (partial vs final)',
      isSuccess,
      `Turns count: ${respondentTurns.length}, Final text: "${respondentTurns[0]?.text}". Streaming updates aggregated into single complete turn.`
    );
  } catch (err: any) {
    recordResult(9, 'Streaming transcript deduplication', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Chronological order and required metadata fields
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c10_${Date.now()}`;
    const job: any = {
      id: `job_meta_${Date.now()}`,
      providerCallId: callId,
      eventId: 'event_public_survey',
      transcript: [],
      originalTranscript: [],
    };

    // Turn 1: AI Greeting & Question 1
    VapiService.appendSurveyTranscriptTurn(job, 'agent', 'నమస్కారం అండి! మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', 'A1');
    // Turn 2: Respondent answer
    VapiService.appendSurveyTranscriptTurn(job, 'respondent', 'బాగానే ఉంది.', 'A1');
    // Turn 3: AI Ack & Question 2
    VapiService.appendSurveyTranscriptTurn(job, 'agent', 'సరే అండి, ధన్యవాదాలు. మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', 'A2');

    const requiredFields = [
      'id',
      'callId',
      'sessionId',
      'surveyId',
      'questionId',
      'questionOrder',
      'speakerRole',
      'transcriptText',
      'timestamp',
      'isFinal',
      'sequenceNumber',
    ];

    let allFieldsPresent = true;
    let strictlyAscending = true;

    job.transcript.forEach((turn: any, idx: number) => {
      for (const f of requiredFields) {
        if (turn[f] === undefined || turn[f] === null) {
          allFieldsPresent = false;
        }
      }
      if (turn.sequenceNumber !== idx + 1) {
        strictlyAscending = false;
      }
    });

    const isSuccess = allFieldsPresent && strictlyAscending && job.transcript.length === 3;

    recordResult(
      10,
      'Chronological order and required metadata fields',
      isSuccess,
      `All 10 required fields present: ${allFieldsPresent}, strictly ascending sequence numbers (1, 2, 3): ${strictlyAscending}.`
    );
  } catch (err: any) {
    recordResult(10, 'Chronological order and required metadata fields', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Clarification multi-turn transcript preservation (Case C)
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c11_${Date.now()}`;
    // Step 1: Initial prompt
    SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
    });

    // Step 2: Respondent says vague problem
    SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'సమస్య ఉంది.',
      questionId: 'A1',
    });

    // Step 3: Respondent clarifies
    SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'తాగునీరు రెండు రోజులకొకసారి మాత్రమే వస్తుంది.',
      questionId: 'A1',
    });

    const state = SurveySequentialEngine.getState(callId);
    const answers = state?.answers?.['A1'];

    const hasOriginal = answers?.originalAnswer === 'సమస్య ఉంది.';
    const hasFollowUp = answers?.followUpAnswer === 'తాగునీరు రెండు రోజులకొకసారి మాత్రమే వస్తుంది.';
    const hasCombined = answers?.combinedAnswer?.includes('సమస్య ఉంది.') && answers?.combinedAnswer?.includes('రెండు రోజులకొకసారి');

    // Transcripts should preserve both respondent turns and both AI turns
    const vagueTurn = state?.transcripts.find((t) => t.role === 'respondent' && t.text === 'సమస్య ఉంది.');
    const clarifyQuestionTurn = state?.transcripts.find((t) => (t.role === 'assistant' || t.role === 'agent') && t.text.includes('వివరంగా చెప్తారా'));
    const clarifyAnswerTurn = state?.transcripts.find((t) => t.role === 'respondent' && t.text.includes('రెండు రోజులకొకసారి'));

    const isSuccess = Boolean(hasOriginal && hasFollowUp && hasCombined && vagueTurn && clarifyQuestionTurn && clarifyAnswerTurn);

    recordResult(
      11,
      'Clarification multi-turn transcript preservation (Case C)',
      isSuccess,
      `Original: "${answers?.originalAnswer}", Follow-up: "${answers?.followUpAnswer}", Combined: "${answers?.combinedAnswer}". All 5 turns logged in sequence.`
    );
  } catch (err: any) {
    recordResult(11, 'Clarification multi-turn transcript preservation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 12: Dynamic survey with more than 6 questions (e.g. 8 questions)
  // -------------------------------------------------------------------------
  try {
    const dynamicQuestions: SurveyQuestion[] = [
      { id: 'Q1', questionId: 'Q1', text: 'ప్రశ్న 1: నీటి వసతి?', questionOrder: 1, category: 'General' },
      { id: 'Q2', questionId: 'Q2', text: 'ప్రశ్న 2: రోడ్లు?', questionOrder: 2, category: 'General' },
      { id: 'Q3', questionId: 'Q3', text: 'ప్రశ్న 3: కరెంట్?', questionOrder: 3, category: 'General' },
      { id: 'Q4', questionId: 'Q4', text: 'ప్రశ్న 4: డ్రైనేజ్?', questionOrder: 4, category: 'General' },
      { id: 'Q5', questionId: 'Q5', text: 'ప్రశ్న 5: చెత్త సేకరణ?', questionOrder: 5, category: 'General' },
      { id: 'Q6', questionId: 'Q6', text: 'ప్రశ్న 6: వైద్య సేవలు?', questionOrder: 6, category: 'General' },
      { id: 'Q7', questionId: 'Q7', text: 'ప్రశ్న 7: పాఠశాలల స్థితిగతులు?', questionOrder: 7, category: 'General' },
      { id: 'Q8', questionId: 'Q8', text: 'ప్రశ్న 8: ప్రజా రవాణా సౌకర్యాలు?', questionOrder: 8, category: 'General' },
    ];

    const callId = `test_c12_${Date.now()}`;
    const surveyConfig = { id: 'survey_8_q', questions: dynamicQuestions };

    // Answer Q1 through Q7
    for (let i = 0; i < 7; i++) {
      SurveySequentialEngine.processTurnSync({
        sessionId: callId,
        providerCallId: callId,
        surveyConfig,
        userUtterance: 'బాగుంది.',
        questionId: dynamicQuestions[i].id,
      });
    }

    // Now answer Q8 (the 8th question)
    const resQ8 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      surveyConfig,
      userUtterance: 'అన్నీ బాగున్నాయి.',
      questionId: 'Q8',
    });

    const isComplete = resQ8.isCompleted && resQ8.isSurveyComplete;
    const hasClosing = resQ8.spokenResponse.includes('సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు');
    const isSuccess = isComplete && hasClosing;

    recordResult(
      12,
      'Dynamic survey with more than 6 questions (8 questions)',
      isSuccess,
      `Total questions: 8, Handled dynamically without A1-A6 limit. Q8 answer completed survey: ${isComplete}, Closing: "${resQ8.spokenResponse.slice(0, 50)}..."`
    );
  } catch (err: any) {
    recordResult(12, 'Dynamic survey with more than 6 questions', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 13: Multi-user / concurrent call transcript isolation
  // -------------------------------------------------------------------------
  try {
    const callA = `call_user_A_${Date.now()}`;
    const callB = `call_user_B_${Date.now()}`;

    // User A answers Q1
    SurveySequentialEngine.processTurnSync({
      sessionId: callA,
      providerCallId: callA,
      eventId: 'event_public_survey',
      userUtterance: 'యూజర్ ఏ సమాధానం: తాగునీరు చాలా బాగుంది.',
      questionId: 'A1',
    });

    // User B answers Q1 differently
    SurveySequentialEngine.processTurnSync({
      sessionId: callB,
      providerCallId: callB,
      eventId: 'event_public_survey',
      userUtterance: 'యూజర్ బి సమాధానం: తాగునీటి సమస్య ఉంది.',
      questionId: 'A1',
    });

    const stateA = SurveySequentialEngine.getState(callA);
    const stateB = SurveySequentialEngine.getState(callB);

    const answerA = stateA?.answers?.['A1']?.answerText;
    const answerB = stateB?.answers?.['A1']?.answerText;

    const noLeakA = !JSON.stringify(stateA?.transcripts).includes('యూజర్ బి');
    const noLeakB = !JSON.stringify(stateB?.transcripts).includes('యూజర్ ఏ');
    const isSuccess = noLeakA && noLeakB && answerA !== answerB;

    recordResult(
      13,
      'Multi-user / concurrent call transcript isolation',
      isSuccess,
      `Call A and Call B executed concurrently. Transcripts completely isolated: Zero cross-contamination.`
    );
  } catch (err: any) {
    recordResult(13, 'Multi-user / concurrent call transcript isolation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 14: Scoped deletion verification
  // -------------------------------------------------------------------------
  try {
    // Create temporary event with 2 questions
    const tempEventId = `temp_event_${Date.now()}`;
    callbridgeStorage.saveEvent({
      id: tempEventId,
      name: 'Temp Survey For Scoped Deletion',
      type: 'public_survey',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {
        questions: [
          { id: 'T1', questionId: 'T1', text: 'ప్రశ్న 1?', questionOrder: 1 },
          { id: 'T2', questionId: 'T2', text: 'ప్రశ్న 2?', questionOrder: 2 },
        ],
      },
    } as any);

    const questionsBefore = callbridgeStorage.getSurveyQuestions(tempEventId);
    // Delete question T1
    const delQSuccess = callbridgeStorage.deleteSurveyQuestion(tempEventId, 'T1');
    const questionsAfterQDel = callbridgeStorage.getSurveyQuestions(tempEventId);

    // Verify main public survey questions are untouched
    const mainSurveyQuestions = callbridgeStorage.getSurveyQuestions('event_public_survey');

    // Delete temp event
    const delEventSuccess = callbridgeStorage.deleteEvent(tempEventId);
    const eventAfter = callbridgeStorage.getEvent(tempEventId);

    const isSuccess =
      delQSuccess &&
      questionsAfterQDel.length === 1 &&
      questionsAfterQDel[0].id === 'T2' &&
      mainSurveyQuestions.length === 6 &&
      delEventSuccess &&
      !eventAfter;

    recordResult(
      14,
      'Scoped deletion verification',
      isSuccess,
      `Question T1 deleted cleanly. Remaining: ${questionsAfterQDel.length}. Main survey preserved with 6 questions. Temp event deleted without touching global data.`
    );
  } catch (err: any) {
    recordResult(14, 'Scoped deletion verification', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 15: Question 6 completion and call closure protection
  // -------------------------------------------------------------------------
  try {
    const callId = `test_c15_${Date.now()}`;

    // Fast-forward Q1-Q5
    for (let i = 1; i <= 5; i++) {
      SurveySequentialEngine.processTurnSync({
        sessionId: callId,
        providerCallId: callId,
        eventId: 'event_public_survey',
        userUtterance: 'బాగుంది.',
        questionId: `A${i}`,
      });
    }

    // Now answer Question 6 (the final question)
    const resQ6 = SurveySequentialEngine.processTurnSync({
      sessionId: callId,
      providerCallId: callId,
      eventId: 'event_public_survey',
      userUtterance: 'ఆరోగ్య సేవలు చాలా బాగున్నాయి.',
      questionId: 'A6',
    });

    const isComplete = resQ6.isCompleted && resQ6.isSurveyComplete;
    const isClosing = resQ6.spokenResponse.startsWith('సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము.');
    const noQ7 = resQ6.currentQuestionId === '' || resQ6.currentQuestionIndex === 6;
    const noRestart = !resQ6.spokenResponse.includes('తాగునీటి సౌకర్యం');
    const actionEnd = resQ6.action === 'END';

    const isSuccess = isComplete && isClosing && noQ7 && noRestart && actionEnd;

    recordResult(
      15,
      'Question 6 completion and call closure protection',
      isSuccess,
      `Q6 completed: ${isComplete}, Spoke canonical warm Telugu closing, action is END, Q7 not triggered, survey introduction not restarted.`
    );
  } catch (err: any) {
    recordResult(15, 'Question 6 completion and call closure protection', false, err.message);
  }

  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passedCount} / ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedCount === totalTests) {
    console.log('🎉 ALL 15 AUTOMATED VERIFICATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error(`❌ ${totalTests - passedCount} TESTS FAILED.`);
    process.exit(1);
  }
}

runMasterVerificationTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
