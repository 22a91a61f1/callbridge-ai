import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { VapiService } from '../server/telephony/vapiService';

async function runTests() {
  console.log('=== TEST SUITE: TELUGU MARRIAGE RSVP CLASSIFICATION & BACKEND VALIDATION ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: ALL 12 MANDATORY PHRASES FROM USER SPECIFICATION TABLE
  // -------------------------------------------------------------
  console.log('--- Test 1: Mandatory Phrases from User Specification Table ---');

  const tablePhrases = [
    { text: 'వస్తున్నాను', expected: 'ATTENDING' },
    { text: 'వస్తున్నా', expected: 'ATTENDING' },
    { text: 'వస్తాను', expected: 'ATTENDING' },
    { text: 'వస్తున్నాము', expected: 'ATTENDING' },
    { text: 'అవును, వస్తాను', expected: 'ATTENDING' },
    { text: 'హా వస్తున్నాను', expected: 'ATTENDING' },
    { text: 'రాను', expected: 'NOT_ATTENDING' },
    { text: 'రాలేను', expected: 'NOT_ATTENDING' },
    { text: 'రావట్లేదు', expected: 'NOT_ATTENDING' },
    { text: 'రావడం లేదు', expected: 'NOT_ATTENDING' },
    { text: 'లేదు, రావడం కుదరదు', expected: 'NOT_ATTENDING' },
    { text: 'చూస్తాను', expected: 'MAYBE_ATTENDING' },
    { text: 'కుదిరితే వస్తాను', expected: 'MAYBE_ATTENDING' },
  ];

  for (const tc of tablePhrases) {
    const actual = classifyMarriageRsvp(tc.text);
    assert(actual === tc.expected, `Input: "${tc.text}" => expected ${tc.expected}, got ${actual}`);
  }

  // -------------------------------------------------------------
  // TEST 2: EXTENDED TELUGU, ENGLISH, HINDI, AND ROMANIZED PHRASES
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Extended Multilingual and Conversational Phrases ---');

  const extendedPhrases = [
    // Telugu
    { text: 'వస్తాం', expected: 'ATTENDING' },
    { text: 'వస్తున్నాం', expected: 'ATTENDING' },
    { text: 'తప్పకుండా వస్తాను', expected: 'ATTENDING' },
    { text: 'తప్పకుండా వస్తాము', expected: 'ATTENDING' },
    { text: 'పెళ్లికి వస్తాను', expected: 'ATTENDING' },
    { text: 'నేను వస్తాను', expected: 'ATTENDING' },
    { text: 'మేము వస్తున్నాము', expected: 'ATTENDING' },
    { text: 'కుదరదు', expected: 'NOT_ATTENDING' },
    { text: 'వీలుకాదు', expected: 'NOT_ATTENDING' },
    { text: 'నేను రాను', expected: 'NOT_ATTENDING' },
    { text: 'లేదు, రాలేను', expected: 'NOT_ATTENDING' },
    { text: 'ప్రయత్నిస్తాను', expected: 'MAYBE_ATTENDING' },
    { text: 'ఇంకా తెలియదు', expected: 'MAYBE_ATTENDING' },
    { text: 'చూద్దాం', expected: 'MAYBE_ATTENDING' },
    // Romanized Telugu (Deepgram nova-2 multi)
    { text: 'vastunnanu', expected: 'ATTENDING' },
    { text: 'vasthunnanu', expected: 'ATTENDING' },
    { text: 'vastunna', expected: 'ATTENDING' },
    { text: 'vasthunna', expected: 'ATTENDING' },
    { text: 'raanu', expected: 'NOT_ATTENDING' },
    { text: 'ravadam ledu', expected: 'NOT_ATTENDING' },
    { text: 'kudirithe vastanu', expected: 'MAYBE_ATTENDING' },
    // English
    { text: 'Yes', expected: 'ATTENDING' },
    { text: 'I am coming', expected: 'ATTENDING' },
    { text: 'We are coming', expected: 'ATTENDING' },
    { text: 'No', expected: 'NOT_ATTENDING' },
    { text: 'I cannot come', expected: 'NOT_ATTENDING' },
    { text: 'Maybe', expected: 'MAYBE_ATTENDING' },
    { text: 'I will try', expected: 'MAYBE_ATTENDING' },
    // Hindi
    { text: 'Haan', expected: 'ATTENDING' },
    { text: 'Main aaunga', expected: 'ATTENDING' },
    { text: 'Nahi aaunga', expected: 'NOT_ATTENDING' },
    { text: 'Dekhenge', expected: 'MAYBE_ATTENDING' },
  ];

  for (const tc of extendedPhrases) {
    const actual = classifyMarriageRsvp(tc.text);
    assert(actual === tc.expected, `Extended: "${tc.text}" => expected ${tc.expected}, got ${actual}`);
  }

  // -------------------------------------------------------------
  // TEST 3: LIVE BUG REPRODUCTION & BACKEND OVERRIDE CORRECTION
  // Respondent says "వస్తున్నాను", but LLM sends NOT_ATTENDING tool arg
  // -------------------------------------------------------------
  console.log('\n--- Test 3: LLM Misclassification Override & Correction ---');

  const testCampId = `camp_marr_test_${Date.now()}`;
  const testEventId = `event_marr_test_${Date.now()}`;
  const testCallId1 = `call_override_${Date.now()}_1`;
  const providerCallId1 = `01a1a6fd-c45f-7000-8cc3-11${Date.now().toString().slice(-10)}`;

  // Create test marriage campaign
  callbridgeStorage.saveCampaign({
    id: testCampId,
    name: 'Test Marriage Event Campaign',
    moduleType: 'marriage_event' as any,
    eventType: 'marriage_event' as any,
    eventId: testEventId,
    status: 'in_progress',
    totalContacts: 3,
    concurrencyLimit: 1,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  callbridgeStorage.saveEvent({
    id: testEventId,
    name: 'Sharma Wedding',
    type: 'marriage_event',
    clientId: 'client_001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Setup active call job
  callbridgeStorage.saveCallJob({
    id: testCallId1,
    campaignId: testCampId,
    eventId: testEventId,
    providerCallId: providerCallId1,
    phoneNumber: '+919876543210',
    status: 'in_progress',
    attempts: 1,
    maxAttempts: 1,
    moduleType: 'marriage_event',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
  VapiService.mapProviderCallIdToJob(providerCallId1, testCallId1, testCampId, testEventId);
  callbridgeStorage.mapProviderCallIdToJob(providerCallId1, testCallId1, testCampId, testEventId);

  // Simulate Vapi Webhook sending tool-calls where:
  // - User actually said "వస్తున్నాను"
  // - But LLM hallucinated category: "NOT_ATTENDING"
  const webhookPayload = {
    message: {
      type: 'tool-calls',
      call: {
        id: providerCallId1,
      },
      toolCalls: [
        {
          id: 'call_tool_123',
          type: 'function',
          function: {
            name: 'recordMarriageRsvp',
            arguments: JSON.stringify({
              category: 'NOT_ATTENDING', // Bug: LLM hallucinated NOT_ATTENDING!
              userSpeech: 'వస్తున్నాను',   // Respondent actually said వస్తున్నాను!
            }),
          },
        },
      ],
    },
  };

  const webhookResult = await VapiService.handleWebhook(webhookPayload);
  assert(webhookResult.success === true, 'Webhook processed tool call successfully');

  // Verify that the backend OVERRODE the LLM hallucination:
  const aggAfterOverride = callbridgeStorage.getAggregateAnalytics(testCampId);
  assert(
    aggAfterOverride.marriageEvent?.attendingCount === 1,
    `Attending count must be 1 (got ${aggAfterOverride.marriageEvent?.attendingCount})`
  );
  assert(
    aggAfterOverride.marriageEvent?.notAttendingCount === 0,
    `Not attending count must be 0 (got ${aggAfterOverride.marriageEvent?.notAttendingCount})`
  );

  // Verify idempotency: duplicate webhook does not double count
  const duplicateWebhookResult = await VapiService.handleWebhook(webhookPayload);
  assert(duplicateWebhookResult.success === true, 'Duplicate webhook handled idempotently');
  const aggAfterDuplicate = callbridgeStorage.getAggregateAnalytics(testCampId);
  assert(
    aggAfterDuplicate.marriageEvent?.attendingCount === 1,
    'Duplicate webhook did not double-increment attending count'
  );

  // -------------------------------------------------------------
  // TEST 4: NEGATIVE CONFIRMATION: "రాను" MUST REMAIN NOT_ATTENDING
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Definite Negative Answer "రాను" ---');

  const testCallId2 = `call_neg_${Date.now()}_2`;
  const providerCallId2 = `01a1a6fd-c45f-7000-8cc3-22${Date.now().toString().slice(-10)}`;

  callbridgeStorage.saveCallJob({
    id: testCallId2,
    campaignId: testCampId,
    eventId: testEventId,
    providerCallId: providerCallId2,
    phoneNumber: '+919876543211',
    status: 'in_progress',
    attempts: 1,
    maxAttempts: 1,
    moduleType: 'marriage_event',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
  VapiService.mapProviderCallIdToJob(providerCallId2, testCallId2, testCampId, testEventId);
  callbridgeStorage.mapProviderCallIdToJob(providerCallId2, testCallId2, testCampId, testEventId);

  const negWebhookPayload = {
    message: {
      type: 'tool-calls',
      call: {
        id: providerCallId2,
      },
      toolCalls: [
        {
          id: 'call_tool_456',
          type: 'function',
          function: {
            name: 'recordMarriageRsvp',
            arguments: JSON.stringify({
              category: 'NOT_ATTENDING',
              userSpeech: 'రాను',
            }),
          },
        },
      ],
    },
  };

  await VapiService.handleWebhook(negWebhookPayload);
  const aggAfterNeg = callbridgeStorage.getAggregateAnalytics(testCampId);
  assert(
    aggAfterNeg.marriageEvent?.notAttendingCount === 1,
    `Not attending count must be 1 (got ${aggAfterNeg.marriageEvent?.notAttendingCount})`
  );

  // -------------------------------------------------------------
  // TEST 5: TENTATIVE ANSWER: "కుదిరితే వస్తాను" MUST BE MAYBE_ATTENDING
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Tentative Answer "కుదిరితే వస్తాను" ---');

  const testCallId3 = `call_maybe_${Date.now()}_3`;
  const providerCallId3 = `01a1a6fd-c45f-7000-8cc3-33${Date.now().toString().slice(-10)}`;

  callbridgeStorage.saveCallJob({
    id: testCallId3,
    campaignId: testCampId,
    eventId: testEventId,
    providerCallId: providerCallId3,
    phoneNumber: '+919876543212',
    status: 'in_progress',
    attempts: 1,
    maxAttempts: 1,
    moduleType: 'marriage_event',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
  VapiService.mapProviderCallIdToJob(providerCallId3, testCallId3, testCampId, testEventId);
  callbridgeStorage.mapProviderCallIdToJob(providerCallId3, testCallId3, testCampId, testEventId);

  const maybeWebhookPayload = {
    message: {
      type: 'tool-calls',
      call: {
        id: providerCallId3,
      },
      toolCalls: [
        {
          id: 'call_tool_789',
          type: 'function',
          function: {
            name: 'recordMarriageRsvp',
            arguments: JSON.stringify({
              category: 'MAYBE_ATTENDING',
              userSpeech: 'కుదిరితే వస్తాను',
            }),
          },
        },
      ],
    },
  };

  await VapiService.handleWebhook(maybeWebhookPayload);
  const aggAfterMaybe = callbridgeStorage.getAggregateAnalytics(testCampId);
  assert(
    aggAfterMaybe.marriageEvent?.maybeAttendingCount === 1,
    `Maybe count must be 1 (got ${aggAfterMaybe.marriageEvent?.maybeAttendingCount})`
  );
  assert(
    aggAfterMaybe.marriageEvent?.attendingCount === 1,
    `Attending count remains 1 (got ${aggAfterMaybe.marriageEvent?.attendingCount})`
  );
  assert(
    aggAfterMaybe.marriageEvent?.notAttendingCount === 1,
    `Not attending count remains 1 (got ${aggAfterMaybe.marriageEvent?.notAttendingCount})`
  );

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed}/${total} assertions passed`);
  console.log(`========================================`);

  if (passed === total) {
    console.log('ALL TELUGU RSVP VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
