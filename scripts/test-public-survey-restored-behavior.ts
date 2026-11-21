import { VapiService } from '../server/telephony/vapiService.ts';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { callbridgeStorage, CallJobRecord } from '../server/storage/callbridgeStorage.ts';

async function testRestoredPublicSurveyBehavior() {
  console.log('================================================================');
  console.log('TEST: RESTORED PUBLIC SURVEY CONVERSATION BEHAVIOR IN LIVE CALLS');
  console.log('================================================================\n');

  let totalPassed = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ [PASS ${totalTests}] ${testName}${detail ? ` (${detail})` : ''}`);
      totalPassed++;
    } else {
      console.error(`  ✗ [FAIL ${totalTests}] ${testName}${detail ? ` (${detail})` : ''}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  const campaignId = 'camp_restored_test_' + Date.now();
  const providerCallId = 'vapi_call_restored_' + Date.now();
  const eventId = 'event_public_survey';

  // 1. Setup Active Call Job
  const job: CallJobRecord = {
    id: `job_${providerCallId}`,
    campaignId,
    eventId,
    contactId: 'contact_citizen_1',
    contactName: 'Ravi Kumar',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { moduleType: 'public_survey' },
  };

  callbridgeStorage.mapProviderCallIdToJob(providerCallId, job.id, campaignId, eventId);
  callbridgeStorage.saveCallJob(job);

  // 2. TURN 1: Citizen says "బాగానే ఉంది."
  console.log('--- TURN 1: Respondent answers "బాగానే ఉంది." to Question 1 ---');

  const webhookPayloadTurn1 = {
    type: 'tool-calls',
    call: {
      id: providerCallId,
      status: 'in-progress',
    },
    message: {
      type: 'tool-calls',
      call: { id: providerCallId },
      toolCalls: [
        {
          id: 'tc_turn1_' + Date.now(),
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({
              questionId: 'A1',
              answerText: 'బాగానే ఉంది.',
            }),
          },
        },
      ],
    },
  };

  const webhookResult1 = VapiService.handleWebhook(webhookPayloadTurn1);

  assert(webhookResult1.success === true, 'Webhook returns success = true');
  assert(Array.isArray(webhookResult1.results), 'Webhook returns clean results array');
  assert(webhookResult1.results!.length === 1, 'Single tool-call result returned');

  const turn1Reply = webhookResult1.results![0].result;
  console.log(`Spoken Reply from Turn 1: "${turn1Reply}"`);

  // Verify: NO technical error message
  assert(!turn1Reply.includes('సాంకేతిక సమస్య'), 'Does NOT contain "సాంకేతిక సమస్య"');
  assert(!turn1Reply.includes('నమోదు కాలేదు'), 'Does NOT contain "నమోదు కాలేదు"');
  assert(!turn1Reply.includes('అర్థం చేసుకోలేకపోయాను'), 'Does NOT contain "అర్థం చేసుకోలేకపోయాను"');

  // Verify: Positive acknowledgment and smooth progression to Question 2
  assert(turn1Reply.includes('ధన్యవాదాలు') || turn1Reply.includes('సరే'), 'Contains positive acknowledgment ("సరే, ధన్యవాదాలు.")');
  assert(turn1Reply.includes('రోడ్ల') || turn1Reply.includes('రోడ్డు'), 'Smoothly asks Question 2 regarding roads');

  // Verify: Database persistence
  const savedJobAfterTurn1 = callbridgeStorage.getCallJob(job.id);
  assert(Boolean(savedJobAfterTurn1?.surveyAnswers?.A1), 'Question 1 answer persisted in database');
  assert(savedJobAfterTurn1?.surveyAnswers?.A1?.answerText === 'బాగానే ఉంది.', 'Answer text recorded correctly: "బాగానే ఉంది."');
  assert(savedJobAfterTurn1?.surveyState?.answeredQuestionIds?.includes('A1'), 'A1 marked in answeredQuestionIds');
  assert(savedJobAfterTurn1?.surveyState?.currentQuestionIndex === 1, 'Current question index advanced to 1 (Question 2)');

  // 3. TURN 2: Citizen gives bare negative "బాలేదు." to Question 2
  console.log('\n--- TURN 2: Respondent answers "బాలేదు." to Question 2 (Roads) ---');

  const webhookPayloadTurn2 = {
    type: 'tool-calls',
    call: {
      id: providerCallId,
      status: 'in-progress',
    },
    message: {
      type: 'tool-calls',
      call: { id: providerCallId },
      toolCalls: [
        {
          id: 'tc_turn2_' + Date.now(),
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({
              questionId: 'A2',
              answerText: 'బాలేదు.',
            }),
          },
        },
      ],
    },
  };

  const webhookResult2 = VapiService.handleWebhook(webhookPayloadTurn2);
  const turn2Reply = webhookResult2.results![0].result;
  console.log(`Spoken Reply from Turn 2: "${turn2Reply}"`);

  // Verify: Dynamic follow-up question triggered
  assert(!turn2Reply.includes('సాంకేతిక సమస్య'), 'Turn 2 does NOT contain technical error phrase');
  assert(turn2Reply.includes('సమస్య') && (turn2Reply.includes('వివరాలు') || turn2Reply.includes('గుంతలు')), 'Asks targeted dynamic follow-up for bare negative');

  // 4. TURN 3: Citizen answers follow-up with details: "రోడ్లలో పెద్ద పెద్ద గుంతలు ఉన్నాయి."
  console.log('\n--- TURN 3: Respondent answers follow-up with specific details ---');

  const webhookPayloadTurn3 = {
    type: 'tool-calls',
    call: {
      id: providerCallId,
      status: 'in-progress',
    },
    message: {
      type: 'tool-calls',
      call: { id: providerCallId },
      toolCalls: [
        {
          id: 'tc_turn3_' + Date.now(),
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({
              questionId: 'A2',
              answerText: 'రోడ్లలో పెద్ద పెద్ద గుంతలు ఉన్నాయి.',
            }),
          },
        },
      ],
    },
  };

  const webhookResult3 = VapiService.handleWebhook(webhookPayloadTurn3);
  const turn3Reply = webhookResult3.results![0].result;
  console.log(`Spoken Reply from Turn 3: "${turn3Reply}"`);

  // Verify: Follow-up answered, question completed, advances to Question 3
  assert(turn3Reply.includes('ధన్యవాదాలు') || turn3Reply.includes('అర్థమైంది'), 'Acknowledges detailed problem');
  assert(turn3Reply.includes('విద్యుత్') || turn3Reply.includes('కరెంట్'), 'Smoothly advances to Question 3 (Electricity)');

  const savedJobAfterTurn3 = callbridgeStorage.getCallJob(job.id);
  assert(savedJobAfterTurn3?.surveyState?.answeredQuestionIds?.includes('A2'), 'A2 marked in answeredQuestionIds');
  assert(savedJobAfterTurn3?.surveyAnswers?.A2?.combinedAnswer?.includes('గుంతలు'), 'Combined answer preserved in database');

  console.log('\n================================================================');
  console.log(`ALL ${totalPassed}/${totalTests} RESTORED BEHAVIOR VERIFICATIONS PASSED 100%!`);
  console.log('================================================================\n');
}

testRestoredPublicSurveyBehavior().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
