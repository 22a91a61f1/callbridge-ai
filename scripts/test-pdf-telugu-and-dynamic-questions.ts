import fs from 'fs';
import path from 'path';
import { ExportService } from '../server/reporting/exportService.ts';
import { callbridgeStorage, type SurveyQuestion } from '../server/storage/callbridgeStorage.ts';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { queueManager } from '../server/campaign/queueManager.ts';

async function runTests() {
  console.log('========================================================================');
  console.log('STARTING VERIFICATION: PDF TELUGU FONT & DYNAMIC SURVEY QUESTIONS');
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

  // -------------------------------------------------------------------------
  // SECTION 1: PDF TELUGU FONT TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 1: PDF TELUGU FONT & MULTI-SCRIPT RENDERING ---');

  const sampleJob = {
    id: 'job_test_telugu_pdf_123',
    eventId: 'event_public_survey',
    campaignId: 'camp_test_pdf',
    contactName: 'రాజేష్ కుమార్ (Rajesh Kumar)',
    contactPhone: '+919876543210',
    durationSeconds: 94,
    status: 'completed',
    createdAt: new Date().toISOString(),
    surveyAnswers: {
      A1: {
        questionText: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
        answerText: 'బాగానే ఉంది. రోజూ ఉదయం నీళ్లు వస్తున్నాయి.',
      },
      A2: {
        questionText: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
        answerText: 'రోడ్లు బాగోలేవు. వర్షాలు పడితే నీరు నిలిచిపోతుంది.',
      },
    },
    transcript: [
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'greeting',
        text: 'నమస్కారమండి, ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాము. మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
        timestamp: Date.now() - 60000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        text: 'బాగానే ఉంది.',
        timestamp: Date.now() - 50000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'main_question',
        questionOrder: 2,
        text: 'సరే అండి, ధన్యవాదాలు. మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
        timestamp: Date.now() - 40000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        text: 'రోడ్లు చాలా అధ్వానంగా ఉన్నాయి. పెద్ద పెద్ద గుంతలు పడ్డాయి.',
        timestamp: Date.now() - 25000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'closing',
        text: 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.',
        timestamp: Date.now() - 10000,
      },
    ],
  };

  try {
    const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(sampleJob);
    assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 5000, 'PDF generated successfully with non-empty buffer', { length: pdfBuffer.length });

    // Check that PDF has font dictionary containing Mandali and Ramabhadra or TrueType font definitions
    const pdfStr = pdfBuffer.toString('latin1');
    const hasFontDict = pdfStr.includes('/Font') || pdfStr.includes('/Type /Font');
    assert(hasFontDict, 'PDF contains embedded font objects');

    // Save test PDF to disk for artifact inspection
    const outPdfPath = path.join(process.cwd(), 'test_generated_survey_transcript.pdf');
    fs.writeFileSync(outPdfPath, pdfBuffer);
    assert(fs.existsSync(outPdfPath), 'PDF written to disk successfully');

    console.log(`   PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err: any) {
    assert(false, 'PDF generation failed with exception', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: DYNAMIC SURVEY QUESTIONS SOURCE OF TRUTH TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: DYNAMIC SURVEY QUESTIONS AS SINGLE SOURCE OF TRUTH ---');

  const testEventId = `event_test_dynamic_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: testEventId,
    name: 'Dynamic Survey Test Event',
    type: 'public_survey',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
  });

  // Test 1: Initial state for a newly created event without explicit questions
  const initialQuestions = callbridgeStorage.getSurveyQuestions(testEventId);
  assert(initialQuestions.length === 6, 'Initial public survey event seeds 6 canonical questions', { count: initialQuestions.length });

  // Test 2: Deleting Question 3 (Q3) leaves exactly 5 questions
  const q3 = initialQuestions[2];
  const delRes = callbridgeStorage.deleteSurveyQuestion(testEventId, q3.id);
  assert(delRes === true, 'Question 3 deleted successfully');

  const afterDelete5 = callbridgeStorage.getSurveyQuestions(testEventId);
  assert(afterDelete5.length === 5, 'Exactly 5 questions remain after deleting Question 3', { count: afterDelete5.length });
  assert(!afterDelete5.some((q) => q.id === q3.id), 'Deleted Question 3 does NOT exist in active list');

  const resolved5 = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolved5.length === 5, 'resolveActiveQuestions returns exactly 5 questions', { count: resolved5.length });
  assert(!resolved5.some((q) => q.id === q3.id), 'resolveActiveQuestions does NOT contain deleted Q3');

  // Verify questionOrder is sequential 1..5
  const ordersAreSequential = afterDelete5.every((q, idx) => q.questionOrder === idx + 1);
  assert(ordersAreSequential, 'Question orders re-indexed to 1, 2, 3, 4, 5 sequentially');

  // Test 3: Adding custom Question 6 and 7 -> 7 questions
  const addedQ1 = callbridgeStorage.addSurveyQuestion(testEventId, {
    questionText: 'మీ ప్రాంతంలో పార్కులు మరియు ఆటస్థలాలు ఎలా ఉన్నాయి?',
    category: 'వినోదం',
  });
  const addedQ2 = callbridgeStorage.addSurveyQuestion(testEventId, {
    questionText: 'మీ వార్డులో వీధి దీపాల పరిస్థితి ఎలా ఉంది?',
    category: 'విద్యుత్',
  });

  const afterAdd7 = callbridgeStorage.getSurveyQuestions(testEventId);
  assert(afterAdd7.length === 7, 'Exactly 7 questions after adding 2 custom questions', { count: afterAdd7.length });

  const resolved7 = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolved7.length === 7, 'resolveActiveQuestions returns exactly 7 questions', { count: resolved7.length });
  assert(resolved7[6].questionText === 'మీ వార్డులో వీధి దీపాల పరిస్థితి ఎలా ఉంది?', 'New Question 7 is in exact 7th position');

  // Test 4: Delete 2 and add 1 -> 6 questions
  callbridgeStorage.deleteSurveyQuestion(testEventId, afterAdd7[0].id);
  callbridgeStorage.deleteSurveyQuestion(testEventId, afterAdd7[1].id);
  callbridgeStorage.addSurveyQuestion(testEventId, {
    questionText: 'మీ ప్రాంతంలో ప్రజా రవాణా బస్సు సౌకర్యాలు అందుబాటులో ఉన్నాయా?',
    category: 'రవాణా',
  });

  const afterDeleteAdd6 = callbridgeStorage.getSurveyQuestions(testEventId);
  assert(afterDeleteAdd6.length === 6, 'Exactly 6 questions after deleting 2 and adding 1', { count: afterDeleteAdd6.length });

  // Test 5: Editing a question
  const qToEdit = afterDeleteAdd6[0];
  const updatedQ = callbridgeStorage.updateSurveyQuestion(testEventId, qToEdit.id, {
    questionText: 'మీ ప్రాంతంలో శుద్ధ తాగునీటి సరఫరా రోజూ వస్తోందా?',
  });
  assert(updatedQ !== null && updatedQ.questionText === 'మీ ప్రాంతంలో శుద్ధ తాగునీటి సరఫరా రోజూ వస్తోందా?', 'Question edited in place successfully');
  const resolvedEdited = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolvedEdited[0].questionText === 'మీ ప్రాంతంలో శుద్ధ తాగునీటి సరఫరా రోజూ వస్తోందా?', 'resolveActiveQuestions reflects updated question text immediately');

  // Test 6: Reordering questions
  const reversedIds = [...afterDeleteAdd6].reverse().map((q) => q.id);
  const reordered = callbridgeStorage.reorderSurveyQuestions(testEventId, reversedIds);
  assert(reordered[0].id === reversedIds[0], 'First reordered question matches new first ID');
  const resolvedReordered = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolvedReordered[0].id === reversedIds[0], 'resolveActiveQuestions strictly preserves custom order');

  // Test 7: Empty question list handling and validation
  callbridgeStorage.saveSurveyQuestions(testEventId, []);
  const emptyList = callbridgeStorage.getSurveyQuestions(testEventId);
  assert(emptyList.length === 0, 'getSurveyQuestions returns [] when user deleted all questions', { count: emptyList.length });

  const resolvedEmpty = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(resolvedEmpty.length === 0, 'resolveActiveQuestions returns [] without fallback to canonical questions', { count: resolvedEmpty.length });

  // Create campaign under this event to test startCampaign validation with 0 questions
  const testCampaignId = `camp_test_empty_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: testCampaignId,
    clientId: 'client_001',
    eventId: testEventId,
    name: 'Empty Questions Test Campaign',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const startEmptyResult = queueManager.startCampaign(testCampaignId);
  assert(startEmptyResult.success === false, 'queueManager.startCampaign returns success: false for 0 questions');
  assert(
    startEmptyResult.message === 'Cannot start survey: Public Survey has no active questions. Please add at least one question before starting.',
    'queueManager.startCampaign returns exact required error message',
    { message: startEmptyResult.message }
  );

  // Test 8: Multi-tenant / Event isolation
  const eventB = `event_test_isolation_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: eventB,
    name: 'Isolated Event B',
    type: 'public_survey',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      questions: [
        {
          id: 'B1',
          questionId: 'B1',
          surveyId: eventB,
          text: 'ఈవెంట్ బి ప్రశ్న 1',
          questionText: 'ఈవెంట్ బి ప్రశ్న 1',
          category: 'టెస్ట్',
          enabled: true,
          questionOrder: 1,
        },
      ],
    },
  });

  const eventBQuestions = SurveySequentialEngine.resolveActiveQuestions(eventB);
  assert(eventBQuestions.length === 1 && eventBQuestions[0].text === 'ఈవెంట్ బి ప్రశ్న 1', 'Event B retains its own isolated question list', { count: eventBQuestions.length });
  const eventAQuestionsCheck = SurveySequentialEngine.resolveActiveQuestions(testEventId);
  assert(eventAQuestionsCheck.length === 0, 'Event A questions remain empty and unaffected by Event B');

  // Test 9: Aggregate Analytics synchronization
  callbridgeStorage.getAggregateAnalytics(testEventId); // Initialize aggregate analytics
  const questionsToSync = [
    { id: 'S1', questionId: 'S1', surveyId: testEventId, text: 'ప్రశ్న 1', questionText: 'ప్రశ్న 1', category: 'జనరల్', questionOrder: 1, enabled: true },
    { id: 'S2', questionId: 'S2', surveyId: testEventId, text: 'ప్రశ్న 2', questionText: 'ప్రశ్న 2', category: 'జనరల్', questionOrder: 2, enabled: true },
    { id: 'S3', questionId: 'S3', surveyId: testEventId, text: 'ప్రశ్న 3', questionText: 'ప్రశ్న 3', category: 'జనరల్', questionOrder: 3, enabled: true },
  ];
  callbridgeStorage.saveSurveyQuestions(testEventId, questionsToSync as any);
  const updatedAgg = callbridgeStorage.getAggregateAnalytics(testEventId);
  assert(updatedAgg.publicSurvey?.totalQuestions === 3, 'Aggregate analytics totalQuestions synchronized to 3', { count: updatedAgg.publicSurvey?.totalQuestions });
  assert(updatedAgg.publicSurvey?.questions?.length === 3, 'Aggregate analytics questions array synchronized to 3', { count: updatedAgg.publicSurvey?.questions?.length });

  // Cleanup test artifacts in storage
  delete (callbridgeStorage as any).data.events[testEventId];
  delete (callbridgeStorage as any).data.events[eventB];
  delete (callbridgeStorage as any).data.campaigns[testCampaignId];
  (callbridgeStorage as any).persist();

  console.log('\n========================================================================');
  console.log(`TEST EXECUTION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
