import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { callbridgeStorage, CallJobRecord, CampaignRecord } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — FINAL THREE PUBLIC SURVEY IMPROVEMENTS VERIFICATION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error('   Details:', details);
      failed++;
    }
  }

  const EXACT_ACK = 'సరే అండి, ధన్యవాదాలు.';
  const CLARIFICATION_Q = 'ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?';
  const CLOSING_MSG = 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.';

  // ==========================================================================
  // PART 1: CONVERSATION TESTS (SCENARIOS 1 to 6)
  // ==========================================================================
  console.log('--- PART 1: AI ACKNOWLEDGEMENT & CONVERSATION SCENARIOS ---');

  const testSessionId = `test_survey_${Date.now()}`;
  const questions = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
  assert(questions.length >= 5, `Active public survey questions loaded (${questions.length} questions)`);

  // Reset engine session
  SurveySequentialEngine.resetSession(testSessionId);

  // Scenario 1: Positive answer
  // Q1: మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?
  // Respondent: బాగుంది.
  // AI: సరే అండి, ధన్యవాదాలు. మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?
  const t1 = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'బాగుంది.',
    eventId: 'event_public_survey',
  });
  assert(
    t1.spokenResponse.startsWith(EXACT_ACK),
    `Scenario 1: Positive answer received exact ack "${EXACT_ACK}"`,
    t1.spokenResponse
  );
  assert(
    t1.currentQuestionIndex === 1,
    'Scenario 1: Advanced to next question (Q2)',
    `currentQuestionIndex=${t1.currentQuestionIndex}`
  );
  assert(
    t1.action === 'ASK_MAIN_QUESTION',
    'Scenario 1: Action is ASK_MAIN_QUESTION'
  );

  // Scenario 2: Detailed positive answer
  // Q2: మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?
  // Respondent: చాలా బాగుంది. ఎలాంటి సమస్య లేదు.
  // AI: సరే అండి, ధన్యవాదాలు. మరి...
  const t2 = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'చాలా బాగుంది. ఎలాంటి సమస్య లేదు.',
    eventId: 'event_public_survey',
  });
  assert(
    t2.spokenResponse.startsWith(EXACT_ACK),
    `Scenario 2: Detailed positive answer received exact ack "${EXACT_ACK}"`,
    t2.spokenResponse
  );
  assert(
    t2.currentQuestionIndex === 2,
    'Scenario 2: Advanced to next question (Q3)'
  );

  // Scenario 3: Respondent only says there is a problem (vague)
  // Q3: మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?
  // Respondent: సమస్య ఉంది.
  // AI: ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?
  // Rule: Ask only ONE clarification question. Do not say acknowledgement before obtaining clarification.
  const t3_vague = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'సమస్య ఉంది.',
    eventId: 'event_public_survey',
  });
  assert(
    t3_vague.action === 'ASK_FOLLOW_UP',
    'Scenario 3: Vague problem triggers ASK_FOLLOW_UP'
  );
  assert(
    t3_vague.spokenResponse.trim() === CLARIFICATION_Q,
    `Scenario 3: Spoke exact clarification "${CLARIFICATION_Q}" without premature ack`,
    t3_vague.spokenResponse
  );
  assert(
    !t3_vague.spokenResponse.includes(EXACT_ACK),
    'Scenario 3: Did NOT say acknowledgement before obtaining clarification'
  );

  // Scenario 4: Respondent explains the problem after clarification
  // Respondent: రోడ్లు చాలా గుంతలుగా ఉన్నాయి. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.
  // AI: సరే అండి, ధన్యవాదాలు. మరి...
  // Rule: Acknowledge and proceed to next survey question. Do not ask another clarification.
  const t3_explained = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'రోడ్లు చాలా గుంతలుగా ఉన్నాయి. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.',
    eventId: 'event_public_survey',
  });
  assert(
    t3_explained.spokenResponse.startsWith(EXACT_ACK),
    `Scenario 4: Clarification answered receives exact ack "${EXACT_ACK}"`,
    t3_explained.spokenResponse
  );
  assert(
    t3_explained.currentQuestionIndex === 3,
    'Scenario 4: Proceeded to next question without repeating clarification'
  );

  // Scenario 5: Respondent explains the problem immediately
  // Q4: మీ ప్రాంతంలో డ్రైనేజీ మరియు పారిశుధ్య వ్యవస్థ ఎలా ఉంది?
  // Respondent: రోజూ కరెంట్ పోతోంది. రాత్రి రెండు మూడు గంటలు విద్యుత్ ఉండడం లేదు.
  // AI: సరే అండి, ధన్యవాదాలు. మరి...
  // Rule: Do not ask clarification because respondent already explained it.
  const t4 = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'రోజూ కరెంట్ పోతోంది. రాత్రి రెండు మూడు గంటలు విద్యుత్ ఉండడం లేదు.',
    eventId: 'event_public_survey',
  });
  assert(
    t4.spokenResponse.startsWith(EXACT_ACK),
    `Scenario 5: Explained problem receives exact ack "${EXACT_ACK}" immediately`,
    t4.spokenResponse
  );
  assert(
    t4.action === 'ASK_MAIN_QUESTION',
    'Scenario 5: Advanced directly to next question without clarification'
  );
  assert(
    t4.currentQuestionIndex === 4,
    'Scenario 5: Advanced to Q5'
  );

  // Scenario 6: Short negative answer
  // Q5: మీ ప్రాంతంలో ఆరోగ్య కేంద్రం / ఆసుపత్రి సౌకర్యాలు ఎలా ఉన్నాయి?
  // Respondent: బాగోలేదు.
  // AI: సరే అండి, ధన్యవాదాలు. మరి...
  // Rule: Short negative answer accepted immediately. Do not force clarification.
  const t5 = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'బాగోలేదు.',
    eventId: 'event_public_survey',
  });
  assert(
    t5.spokenResponse.startsWith(EXACT_ACK),
    `Scenario 6: Short negative answer "బాగోలేదు." received exact ack "${EXACT_ACK}"`,
    t5.spokenResponse
  );
  assert(
    t5.currentQuestionIndex === 5,
    'Scenario 6: Proceeded to next question without forcing clarification'
  );

  // Final Answer: Q6
  // Respondent: బాగుంది.
  // AI speaks acknowledgement + closing message
  const t6_final = SurveySequentialEngine.processTurnSync({
    sessionId: testSessionId,
    userUtterance: 'బాగుంది.',
    eventId: 'event_public_survey',
  });
  assert(
    t6_final.isSurveyComplete,
    'Final Answer: isSurveyComplete is true'
  );
  assert(
    t6_final.spokenResponse === CLOSING_MSG,
    `Final Answer: Speaks complete approved closing message starting with "${EXACT_ACK}"`,
    t6_final.spokenResponse
  );

  // Verify answer recording
  const state = SurveySequentialEngine.getState(testSessionId);
  assert(Boolean(state), 'Engine session state exists');
  const answerKeys = Object.keys(state?.answers || {});
  assert(answerKeys.length >= 6, `All 6 questions recorded answers (count=${answerKeys.length})`);
  assert(!state?.answers['A1']?.combinedAnswer?.includes('undefined'), 'Answers contain clean text without undefined');

  // ==========================================================================
  // PART 2: CALL COMPLETION & SEQUENTIAL NEXT-CALL TIMING
  // ==========================================================================
  console.log('\n--- PART 2: CALL COMPLETION & SEQUENTIAL NEXT-CALL TIMING ---');

  const testCampId = `camp_seq_test_${Date.now()}`;
  const mockCampaign: CampaignRecord = {
    id: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    name: 'Test Sequential Public Survey',
    status: 'running',
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    activeCalls: 0,
    concurrencyLimit: 1,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCampaign(mockCampaign);

  const job1: CallJobRecord = {
    id: `job_seq_1_${Date.now()}`,
    campaignId: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c1',
    contactName: 'సురేష్ (Suresh)',
    contactPhone: '+919876543201',
    status: 'in_progress',
    providerCallId: `vapi_call_1_${Date.now()}`,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(Date.now() - 30000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const job2: CallJobRecord = {
    id: `job_seq_2_${Date.now()}`,
    campaignId: testCampId,
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c2',
    contactName: 'మహేష్ (Mahesh)',
    contactPhone: '+919876543202',
    status: 'pending',
    retryCount: 0,
    maxRetries: 3,
    metadata: { queueOrder: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(job1);
  callbridgeStorage.saveCallJob(job2);
  callbridgeStorage.mapProviderCallIdToJob(job1.providerCallId!, job1.id, testCampId, 'event_public_survey');

  // Test 2.1: Final answer received via Vapi tool call
  // Tool call arrives: recordSurveyAnswerAndGetNextAction for final question
  SurveySequentialEngine.aliasSession(job1.providerCallId!, testSessionId);
  const toolResult = VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: job1.providerCallId },
      toolCalls: [
        {
          id: 'tc_final_1',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: { questionId: 'A6', answerText: 'బాగుంది.' },
          },
        },
      ],
    },
  });

  // Verify that job status was NOT prematurely marked 'completed' while closing audio is still playing
  const job1AfterTool = callbridgeStorage.getCallJob(job1.id);
  assert(
    job1AfterTool?.status === 'in_progress',
    'Call status remains "in_progress" while closing audio plays (not prematurely marked completed)',
    job1AfterTool?.status
  );

  const pState = VapiService.getPublicSurveyCallState(job1.providerCallId!);
  assert(
    pState.closingSpoken === true,
    'Closing audio is tracked as spoken (closingSpoken=true)'
  );
  assert(
    pState.closingCompleted !== true,
    'Closing audio is NOT yet completed before audio finishes playback'
  );

  // Test 2.2: Premature speech-update: stopped arrives immediately (< 1 sec)
  // Must NOT prematurely terminate the call
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      status: 'stopped',
      call: { id: job1.providerCallId },
    },
  });
  assert(
    pState.closingCompleted !== true,
    'Immediate/spurious speech-update: stopped rejected; closing audio continues playing'
  );

  // Test 2.3: Audio playback starts (assistant speaks closing message)
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      status: 'started',
      role: 'assistant',
      call: { id: job1.providerCallId },
    },
  });
  assert(
    pState.closingStarted === true,
    'Assistant closing speech start tracked (closingStarted=true)'
  );

  // Test 2.4: Queue must NOT dispatch next contact while call 1 is still playing audio
  queueManager.processNext(testCampId);
  const job2DuringAudio = callbridgeStorage.getCallJob(job2.id);
  assert(
    job2DuringAudio?.status === 'pending',
    'Next contact (job2) remains pending while call 1 is still playing closing audio',
    job2DuringAudio?.status
  );

  // Test 2.5: Assistant closing audio completes playback
  // Simulate natural speech playback completion event
  VapiService.handleWebhook({
    message: {
      type: 'speech-update',
      status: 'stopped',
      role: 'assistant',
      call: { id: job1.providerCallId },
    },
  });
  assert(
    pState.closingCompleted === true,
    'Closing audio playback confirmed completed (closingCompleted=true)'
  );

  // Test 2.6: Provider confirms terminal status (end-of-call-report)
  const termRes = VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      call: {
        id: job1.providerCallId,
        startedAt: new Date(Date.now() - 45000).toISOString(),
        endedAt: new Date().toISOString(),
        endedReason: 'assistant-ended-call',
        durationSeconds: 45,
      },
    },
  });

  assert(
    termRes.isTerminal === true,
    'Provider confirmed call is terminal (isTerminal=true)'
  );
  const job1Final = callbridgeStorage.getCallJob(job1.id);
  assert(
    job1Final?.status === 'completed',
    'Call 1 status is COMPLETED (not interrupted or premature)',
    job1Final?.status
  );

  // Advance queue on confirmed terminal status
  queueManager.onJobTerminal(testCampId, job1.id, { isAnswered: true, status: 'completed' });

  // Test 2.7: Duplicate webhook does NOT trigger duplicate dispatch
  const prevTerminalHandledCount = (queueManager as any).terminalHandledJobs.size;
  queueManager.onJobTerminal(testCampId, job1.id, { isAnswered: true, status: 'completed' });
  assert(
    (queueManager as any).terminalHandledJobs.size === prevTerminalHandledCount,
    'Duplicate terminal event safely deduplicated'
  );

  // ==========================================================================
  // PART 3: SIMPLIFIED, READABLE PUBLIC SURVEY PDF
  // ==========================================================================
  console.log('\n--- PART 3: SIMPLIFIED PUBLIC SURVEY PDF GENERATION ---');

  // Prepare a realistic completed survey call job with all 6 answers
  const pdfTestJob: CallJobRecord = {
    id: `job_pdf_report_${Date.now()}`,
    campaignId: 'telugu-governance-2026',
    eventId: 'event_public_survey',
    clientId: 'client_001',
    contactId: 'c_pdf_1',
    contactName: 'రమేష్ బాబు (Ramesh Babu)',
    contactPhone: '+919876543210',
    status: 'completed',
    retryCount: 0,
    maxRetries: 3,
    durationSeconds: 98,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    surveyAnswers: {
      A1: {
        questionId: 'A1',
        questionOrder: 1,
        questionText: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
        answerText: 'బాగుంది. రోజుకి రెండు సార్లు నీళ్లు వస్తున్నాయి.',
        combinedAnswer: 'బాగుంది. రోజుకి రెండు సార్లు నీళ్లు వస్తున్నాయి.',
      },
      A2: {
        questionId: 'A2',
        questionOrder: 2,
        questionText: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
        answerText: 'రోడ్లు చాలా గుంతలుగా ఉన్నాయి. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.',
        combinedAnswer: 'రోడ్లు చాలా గుంతలుగా ఉన్నాయి. వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.',
      },
      A3: {
        questionId: 'A3',
        questionOrder: 3,
        questionText: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?',
        answerText: 'రోజూ కరెంట్ పోతోంది. రాత్రి రెండు మూడు గంటలు విద్యుత్ ఉండడం లేదు.',
        combinedAnswer: 'రోజూ కరెంట్ పోతోంది. రాత్రి రెండు మూడు గంటలు విద్యుత్ ఉండడం లేదు.',
      },
      A4: {
        questionId: 'A4',
        questionOrder: 4,
        questionText: 'మీ ప్రాంతంలో డ్రైనేజీ మరియు పారిశుధ్య వ్యవస్థ ఎలా ఉంది?',
        answerText: 'కాలువలు తరచూ పొంగిపొర్లుతున్నాయి. దోమల బెడద ఎక్కువగా ఉంది.',
        combinedAnswer: 'కాలువలు తరచూ పొంగిపొర్లుతున్నాయి. దోమల బెడద ఎక్కువగా ఉంది.',
      },
      A5: {
        questionId: 'A5',
        questionOrder: 5,
        questionText: 'మీ ప్రాంతంలో ప్రభుత్వ పాఠశాల మరియు విద్యా సదుపాయాలు ఎలా ఉన్నాయి?',
        answerText: 'ఉపాధ్యాయులు బాగా బోధిస్తున్నారు కానీ మౌలిక వసతులు ఇంకా మెరుగుపడాలి.',
        combinedAnswer: 'ఉపాధ్యాయులు బాగా బోధిస్తున్నారు కానీ మౌలిక వసతులు ఇంకా మెరుగుపడాలి.',
      },
      A6: {
        questionId: 'A6',
        questionOrder: 6,
        questionText: 'మీ ప్రాంతంలో ఆరోగ్య కేంద్రం / ఆసుపత్రి సౌకర్యాలు ఎలా ఉన్నాయి?',
        answerText: 'ప్రాథమిక ఆరోగ్య కేంద్రంలో మందులు అందుబాటులో ఉన్నాయి.',
        combinedAnswer: 'ప్రాథమిక ఆరోగ్య కేంద్రంలో మందులు అందుబాటులో ఉన్నాయి.',
      },
    },
    transcript: [
      { role: 'agent', text: 'నమస్కారం అండి! ప్రజా సర్వే నిర్వహిస్తున్నాము.' },
      { role: 'respondent', text: 'సరే అండి, అడగండి.' },
    ],
  };

  const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(pdfTestJob);
  assert(Buffer.isBuffer(pdfBuffer), 'PDF generated as a valid Buffer');
  assert(pdfBuffer.length > 5000, `PDF size is substantial (${pdfBuffer.length} bytes)`);
  assert(pdfBuffer.subarray(0, 4).toString('utf8') === '%PDF', 'PDF begins with valid %PDF magic header');

  const pdfPath = path.join(process.cwd(), 'test_public_survey_report.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`  Saved PDF to ${pdfPath}`);

  // Render PDF pages to PNG using Ghostscript for visual verification
  try {
    const pngPrefix = path.join(process.cwd(), 'test_survey_page_%d.png');
    execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -sOutputFile="${pngPrefix}" "${pdfPath}"`, {
      stdio: 'pipe',
    });
    console.log('  Rendered PDF pages to PNG using Ghostscript');

    const generatedPngs = fs.readdirSync(process.cwd()).filter((f) => f.startsWith('test_survey_page_') && f.endsWith('.png'));
    assert(generatedPngs.length > 0, `Rendered ${generatedPngs.length} PDF page image(s)`);
    for (const p of generatedPngs) {
      const stats = fs.statSync(path.join(process.cwd(), p));
      console.log(`    - ${p}: ${stats.size} bytes`);
    }
  } catch (err: any) {
    console.warn('Ghostscript rendering notice:', err?.message || err);
  }

  // Verify text content using pdf-parse if available
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const parsedPdf = await pdfParse(pdfBuffer);
    const pdfText = parsedPdf.text || '';

    assert(
      pdfText.includes('Public Survey Report') || pdfText.includes('ప్రజా సర్వే నివేదిక'),
      'PDF contains "Public Survey Report" heading'
    );
    assert(
      pdfText.includes('Respondent Details') || pdfText.includes('ప్రతిస్పందనకర్త వివరాలు'),
      'PDF contains "Respondent Details" section'
    );
    assert(
      pdfText.includes('Recorded Survey Questions and Answers') || pdfText.includes('నమోదైన సర్వే ప్రశ్నలు'),
      'PDF contains "Recorded Survey Questions and Answers" heading'
    );
    assert(
      !pdfText.includes('Full Chronological Dialogue') && !pdfText.includes('పూర్తి సంభాషణ వివరాలు'),
      'PDF EXCLUDES "Full Chronological Dialogue" section completely'
    );
    assert(
      !pdfText.includes('AI Voice Agent (కాల్‌బ్రిడ్జ్') && !pdfText.includes('Respondent (పౌరుడు'),
      'PDF EXCLUDES speaker badges and dialogue turn headers'
    );
  } catch (err: any) {
    console.warn('pdf-parse text check notice:', err?.message || err);
  }

  console.log('\n========================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
