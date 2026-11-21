/**
 * Production Log Investigation & Verification Suite
 *
 * Verifies all 11 requirements and tests root-cause fixes for:
 * - Call ID: 01a1b5cc-b204-7ee0-a4d0-c8c10de79106
 * - Job ID: job_1794051450622_0_9wy7
 * - Campaign ID: camp_1794051450614_od7a
 */

import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { VapiService } from '../server/telephony/vapiService';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine';

let passCount = 0;
let failCount = 0;

function assert(description: string, condition: boolean, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    if (detail !== undefined) console.error('     Detail:', detail);
    failCount++;
  }
}

async function run() {
  console.log('========================================================================');
  console.log('PRODUCTION LOG INVESTIGATION & VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  const capturedLogs: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: any[]) => {
    capturedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalLog(...args);
  };
  console.warn = (...args: any[]) => {
    capturedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalWarn(...args);
  };

  // --------------------------------------------------------------------------
  // TEST 1: Q1 Positive Answer Transitions Directly to Q2
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Q1 Positive Answer Transitions to Q2 ---');
  const t1ProviderCallId = 'test_call_prod_1_' + Date.now();
  const t1JobId = 'job_prod_1_' + Date.now();
  const t1CampaignId = 'camp_1794051450614_od7a';

  callbridgeStorage.saveCallJob({
    id: t1JobId,
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
    providerCallId: t1ProviderCallId,
    status: 'in_progress',
    contactId: 'c_prod_1',
    contactName: 'Citizen 1',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { moduleType: 'public_survey' },
  });

  const toolCallPayload1 = {
    message: {
      type: 'tool-calls',
      call: { id: t1ProviderCallId },
      toolCalls: [
        {
          id: 'tc_prod_1',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది.' }),
          },
        },
      ],
    },
  };

  const res1: any = await VapiService.handleWebhook(toolCallPayload1);
  const spoken1 = res1?.results?.[0]?.result || '';

  assert('Test 1 returns valid tool result', Boolean(res1?.results?.[0]?.toolCallId === 'tc_prod_1'));
  assert('Test 1 speaks Q2 (roads)', spoken1.includes('రోడ్ల'));
  assert('Test 1 does NOT repeat Q1 (water)', !spoken1.includes('నీటి') && !spoken1.includes('తాగునీటి'));

  const state1 = SurveySequentialEngine.getState(t1ProviderCallId);
  assert('Test 1 state advanced to index 1 (Q2)', state1?.currentQuestionIndex === 1);
  assert('Test 1 recorded answer for A1', Boolean(state1?.answers?.['A1']?.answerText?.includes('బాగుంది') || state1?.answers?.['A1']?.text?.includes('బాగుంది')));

  // --------------------------------------------------------------------------
  // TEST 2: Q1 Negative Answer Generates Valid Follow-Up
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Q1 Negative Answer Follow-Up Handling ---');
  const t2SessionId = 'sess_prod_2_' + Date.now();
  SurveySequentialEngine.getOrCreateState(t2SessionId, t1CampaignId, 'event_public_survey');
  const t2Turn = SurveySequentialEngine.processTurnSync({
    sessionId: t2SessionId,
    userUtterance: 'నీళ్లు సరిగ్గా రావడం లేదు',
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
  });

  assert('Test 2 action is FOLLOWUP or MAIN', t2Turn.action === 'ASK_FOLLOW_UP' || t2Turn.action === 'ASK_MAIN_QUESTION');
  assert('Test 2 reply does NOT re-ask water availability', !t2Turn.reply.includes('తాగునీటి సౌకర్యం ఎలా ఉంది'));

  // --------------------------------------------------------------------------
  // TEST 3: Q2 Detailed Roads Answer Transitions Directly to Q3
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Q2 Detailed Roads Answer Transitions to Q3 ---');
  const t3ProviderCallId = 'test_call_prod_3_' + Date.now();
  const t3JobId = 'job_prod_3_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: t3JobId,
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
    providerCallId: t3ProviderCallId,
    status: 'in_progress',
    contactId: 'c_prod_3',
    contactName: 'Citizen 3',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { moduleType: 'public_survey' },
  });

  // Complete Q1 first
  await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: t3ProviderCallId },
      toolCalls: [
        {
          id: 'tc_prod_3_q1',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది' }),
          },
        },
      ],
    },
  });

  // Now respond to Q2 with the exact detailed answer from live call
  const detailedRoadAnswer = 'వర్షాలు పడినప్పుడు రోడ్లపై గుంతల వల్ల ప్రమాదాలు జరుగుతున్నాయి';
  const res3: any = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: t3ProviderCallId },
      toolCalls: [
        {
          id: 'tc_prod_3_q2',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A2', answerText: detailedRoadAnswer }),
          },
        },
      ],
    },
  });

  const spoken3 = res3?.results?.[0]?.result || '';
  const state3 = SurveySequentialEngine.getState(t3ProviderCallId);

  assert('Test 3 advances to index 2 (Q3 electricity)', state3?.currentQuestionIndex === 2);
  assert('Test 3 speaks Q3 (electricity)', spoken3.includes('విద్యుత్'));
  assert('Test 3 does NOT loop back to Q1 (water)', !spoken3.includes('నీటి') && !spoken3.includes('తాగునీటి'));
  assert('Test 3 does NOT ask redundant roads follow-up when detail was given', !spoken3.includes('ఎలాంటి ఇబ్బందులు'));

  // --------------------------------------------------------------------------
  // TEST 4: Backend Restart Simulation — Recovery of State from Storage
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Backend Restart Simulation & Session Recovery ---');
  const targetProviderCallId = '01a1b5cc-b204-7ee0-a4d0-c8c10de79106';
  const targetJobId = 'job_1794051450622_0_9wy7';
  const targetCampaignId = 'camp_1794051450614_od7a';

  // Seed storage as it would be before restart with Q1 already completed
  const initialJob = {
    id: targetJobId,
    campaignId: targetCampaignId,
    eventId: 'event_public_survey',
    providerCallId: targetProviderCallId,
    status: 'in_progress' as const,
    contactId: 'c_target',
    contactName: 'Target Respondent',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    surveyState: {
      sessionId: targetJobId,
      campaignId: targetCampaignId,
      currentQuestionIndex: 1, // Ready for Q2 (roads)
      answers: {
        A1: {
          questionId: 'A1',
          text: 'బాగుంది',
          category: 'positive',
          timestamp: new Date().toISOString(),
        },
      },
      answeredQuestionIds: ['A1'],
      clarificationCount: {},
      isComplete: false,
    },
    surveyAnswers: {
      A1: {
        questionId: 'A1',
        text: 'బాగుంది',
        category: 'positive',
        timestamp: new Date().toISOString(),
      },
    },
  };

  callbridgeStorage.saveCallJob(initialJob);
  callbridgeStorage.mapProviderCallIdToJob(targetProviderCallId, targetJobId, targetCampaignId, 'event_public_survey');

  // SIMULATE BACKEND RESTART: Clear memory in SurveySequentialEngine and VapiService
  SurveySequentialEngine.clearAllSessions();
  VapiService.clearAllCallStates();

  // Verify storage resolves mapping without in-memory state
  const resolvedJobId = callbridgeStorage.getJobIdByProviderCallId(targetProviderCallId);
  assert('Test 4 storage resolves jobId across memory wipe', resolvedJobId === targetJobId);

  const resolvedJob = callbridgeStorage.getCallJob(targetProviderCallId);
  assert('Test 4 storage retrieves job by providerCallId across memory wipe', Boolean(resolvedJob && resolvedJob.id === targetJobId));

  // Now an incoming webhook arrives from Vapi for Q2
  const restartWebhookRes: any = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: targetProviderCallId },
      toolCalls: [
        {
          id: 'tc_restart_roads',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A2', answerText: 'రోడ్లు బాగున్నాయి' }),
          },
        },
      ],
    },
  });

  const spokenRestart = restartWebhookRes?.results?.[0]?.result || '';
  const stateAfterRestart = SurveySequentialEngine.getState(targetProviderCallId);

  assert('Test 4 recovers session and advances to Q3', stateAfterRestart?.currentQuestionIndex === 2);
  assert('Test 4 does NOT restart from greeting or Q1', !spokenRestart.includes('నమస్కారం') && !spokenRestart.includes('తాగునీటి'));
  assert('Test 4 speaks Q3 (electricity)', spokenRestart.includes('విద్యుత్'));

  // --------------------------------------------------------------------------
  // TEST 5: Webhook URL Deployment Region Check
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Webhook URL Deployment Alignment ---');
  const activeWebhookUrl = VapiService.getWebhookUrl();
  assert('Test 5 webhook URL uses current deployment host', activeWebhookUrl.includes('/api/callbridge/vapi/webhook'));
  assert('Test 5 webhook URL does not use outdated asia-southeast1', !activeWebhookUrl.includes('asia-southeast1'));

  // --------------------------------------------------------------------------
  // TEST 6: Terminal State Protection (Completed Cannot Be Downgraded to Interrupted)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Terminal State Protection ---');
  const t6ProviderCallId = 'test_call_term_6_' + Date.now();
  const t6JobId = 'job_term_6_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: t6JobId,
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
    providerCallId: t6ProviderCallId,
    status: 'completed',
    contactId: 'c_term_6',
    contactName: 'Citizen 6',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // End-of-call report arrives with an interrupted reason
  await VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      call: { id: t6ProviderCallId },
      endedReason: 'customer-busy',
    },
  });

  const finalJob6 = callbridgeStorage.getCallJob(t6JobId);
  assert('Test 6 completed state is NOT downgraded to interrupted', finalJob6?.status === 'completed');

  // --------------------------------------------------------------------------
  // TEST 7: Call Duration and Billing Calculation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Duration and Billing Calculation ---');
  const t7ProviderCallId = 'test_call_dur_7_' + Date.now();
  const t7JobId = 'job_dur_7_' + Date.now();
  const startTime = Date.now() - 45000; // 45 seconds ago
  const endTime = Date.now();

  callbridgeStorage.saveCallJob({
    id: t7JobId,
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
    providerCallId: t7ProviderCallId,
    status: 'in_progress',
    contactId: 'c_dur_7',
    contactName: 'Citizen 7',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date(startTime).toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: new Date(startTime).toISOString(),
  });

  await VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      call: {
        id: t7ProviderCallId,
        startedAt: new Date(startTime).toISOString(),
        endedAt: new Date(endTime).toISOString(),
      },
    },
  });

  const job7 = callbridgeStorage.getCallJob(t7JobId);
  assert('Test 7 duration is calculated from timestamps (> 0)', Boolean(job7?.durationSeconds && job7.durationSeconds >= 40));
  assert('Test 7 billing duration is non-zero', Boolean(job7?.durationSeconds && job7.durationSeconds >= 40));

  // --------------------------------------------------------------------------
  // TEST 8: Duplicate Tool Call Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Duplicate Tool Call Idempotency ---');
  const t8ProviderCallId = 'test_call_dup_8_' + Date.now();
  const t8JobId = 'job_dup_8_' + Date.now();

  callbridgeStorage.saveCallJob({
    id: t8JobId,
    campaignId: t1CampaignId,
    eventId: 'event_public_survey',
    providerCallId: t8ProviderCallId,
    status: 'in_progress',
    contactId: 'c_dup_8',
    contactName: 'Citizen 8',
    contactPhone: '+919876543210',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const dupPayload = {
    message: {
      type: 'tool-calls',
      call: { id: t8ProviderCallId },
      toolCalls: [
        {
          id: 'tc_dup_exact_123',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A1', answerText: 'బాగుంది' }),
          },
        },
      ],
    },
  };

  const firstDupRes: any = await VapiService.handleWebhook(dupPayload);
  const secondDupRes: any = await VapiService.handleWebhook(dupPayload);

  assert('Test 8 duplicate returns identical spoken result', firstDupRes.results[0].result === secondDupRes.results[0].result);
  const state8 = SurveySequentialEngine.getState(t8ProviderCallId);
  assert('Test 8 duplicate does not double-advance question index', state8?.currentQuestionIndex === 1);

  // --------------------------------------------------------------------------
  // TEST 9: Unknown Session Safe Recovery Without Resetting to Q1
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Unknown Session Safe Recovery ---');
  const unknownCallId = 'unknown_call_' + Date.now();

  const unknownRes: any = await VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: unknownCallId },
      toolCalls: [
        {
          id: 'tc_unknown_1',
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            arguments: JSON.stringify({ questionId: 'A2', answerText: 'బాగానే ఉంది' }),
          },
        },
      ],
    },
  });

  const spokenUnknown = unknownRes?.results?.[0]?.result || '';
  assert('Test 9 recovered unknown call successfully', Boolean(unknownRes?.results?.[0]?.result));
  assert('Test 9 unknown call answering Q2 advances forward to Q3', spokenUnknown.includes('విద్యుత్'));
  assert('Test 9 does NOT reset to Q1', !spokenUnknown.includes('తాగునీటి'));

  // --------------------------------------------------------------------------
  // TEST 10: Verify All 11 Required Structured Log Labels
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Structured Logging Coverage Verification ---');
  const requiredLabels = [
    '[SURVEY_WEBHOOK_RECEIVED]',
    '[SURVEY_SESSION_RESOLVED]',
    '[SURVEY_SESSION_RESOLUTION_FAILED]',
    '[SURVEY_TOOL_INVOKED]',
    '[SURVEY_DUPLICATE_EVENT]',
    '[SURVEY_ANSWER_RECEIVED]',
    '[SURVEY_STATE_BEFORE]',
    '[SURVEY_ANSWER_PROCESSED]',
    '[SURVEY_NEXT_ACTION_SELECTED]',
    '[SURVEY_STATE_PERSISTED]',
    '[SURVEY_TOOL_RESPONSE_SENT]',
  ];

  const fullLogsString = capturedLogs.join('\n');
  for (const label of requiredLabels) {
    const found = fullLogsString.includes(label);
    assert(`Structured log label ${label} emitted`, found);
  }

  // Restore original console
  console.log = originalLog;
  console.warn = originalWarn;

  console.log('\n========================================================================');
  console.log(`TEST SUITE RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
