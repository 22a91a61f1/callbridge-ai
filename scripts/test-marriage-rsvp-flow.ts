/**
 * Verification test suite for Marriage Event RSVP Spoken Flow,
 * Aggregate Analytics, Zero-PII Data Retention, and Zero-Regression on Political Campaign.
 */
import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { VapiService } from '../server/telephony/vapiService';
import { ExportService } from '../server/reporting/exportService';

async function runTests() {
  console.log('=== TEST SUITE: MARRIAGE EVENT RSVP & AGGREGATE ANALYTICS ===\n');
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
  // TEST 1: SPOKEN RSVP CLASSIFICATION (TELUGU & ENGLISH)
  // -------------------------------------------------------------
  console.log('--- Test 1: Spoken RSVP Semantic Classification ---');

  // YES / ATTENDING
  assert(classifyMarriageRsvp('వస్తాను') === 'ATTENDING', 'Telugu: వస్తాను -> ATTENDING');
  assert(classifyMarriageRsvp('వస్తాం') === 'ATTENDING', 'Telugu: వస్తాం -> ATTENDING');
  assert(classifyMarriageRsvp('తప్పకుండా వస్తాను') === 'ATTENDING', 'Telugu: తప్పకుండా వస్తాను -> ATTENDING');
  assert(classifyMarriageRsvp('హాజరవుతాను') === 'ATTENDING', 'Telugu: హాజరవుతాను -> ATTENDING');
  assert(classifyMarriageRsvp('ఖచ్చితంగా వస్తాను') === 'ATTENDING', 'Telugu: ఖచ్చితంగా వస్తాను -> ATTENDING');
  assert(classifyMarriageRsvp('మేమందరం వస్తున్నాం') === 'ATTENDING', 'Telugu: మేమందరం వస్తున్నాం -> ATTENDING');
  assert(classifyMarriageRsvp('Yes, I am attending') === 'ATTENDING', 'English: Yes, I am attending -> ATTENDING');
  assert(classifyMarriageRsvp('I will come') === 'ATTENDING', 'English: I will come -> ATTENDING');
  assert(classifyMarriageRsvp('We will attend') === 'ATTENDING', 'English: We will attend -> ATTENDING');

  // NO / NOT ATTENDING
  assert(classifyMarriageRsvp('రాలేను') === 'NOT_ATTENDING', 'Telugu: రాలేను -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('రాలేము') === 'NOT_ATTENDING', 'Telugu: రాలేము -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('కుదరదు') === 'NOT_ATTENDING', 'Telugu: కుదరదు -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('రావడం కుదరదు') === 'NOT_ATTENDING', 'Telugu: రావడం కుదరదు -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('వీలుకాదు') === 'NOT_ATTENDING', 'Telugu: వీలుకాదు -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('No, I am not attending') === 'NOT_ATTENDING', 'English: No, I am not attending -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('I cannot come') === 'NOT_ATTENDING', 'English: I cannot come -> NOT_ATTENDING');
  assert(classifyMarriageRsvp('Unable to attend') === 'NOT_ATTENDING', 'English: Unable to attend -> NOT_ATTENDING');

  // MAYBE / TENTATIVE
  assert(classifyMarriageRsvp('రావచ్చు') === 'MAYBE_ATTENDING', 'Telugu: రావచ్చు -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('ఇంకా తెలియదు') === 'MAYBE_ATTENDING', 'Telugu: ఇంకా తెలియదు -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('తెలియదు') === 'MAYBE_ATTENDING', 'Telugu: తెలియదు -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('చెప్పలేను') === 'MAYBE_ATTENDING', 'Telugu: చెప్పలేను -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('చూద్దాం') === 'MAYBE_ATTENDING', 'Telugu: చూద్దాం -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('వీలైతే వస్తాను') === 'MAYBE_ATTENDING', 'Telugu: వీలైతే వస్తాను -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('Maybe I will attend') === 'MAYBE_ATTENDING', 'English: Maybe I will attend -> MAYBE_ATTENDING');
  assert(classifyMarriageRsvp('I am not sure yet') === 'MAYBE_ATTENDING', 'English: I am not sure yet -> MAYBE_ATTENDING');

  // UNCLEAR / GREETINGS
  assert(classifyMarriageRsvp('హలో') === 'UNCLEAR', 'Telugu greeting: హలో -> UNCLEAR');
  assert(classifyMarriageRsvp('నమస్కారం') === 'UNCLEAR', 'Telugu greeting: నమస్కారం -> UNCLEAR');
  assert(classifyMarriageRsvp('ఏమిటి') === 'UNCLEAR', 'Telugu clarification request: ఏమిటి -> UNCLEAR');
  assert(classifyMarriageRsvp('hello') === 'UNCLEAR', 'English greeting: hello -> UNCLEAR');
  assert(classifyMarriageRsvp('') === 'UNCLEAR', 'Empty string -> UNCLEAR');
  assert(classifyMarriageRsvp(null) === 'UNCLEAR', 'null -> UNCLEAR');

  // -------------------------------------------------------------
  // TEST 2: MARRIAGE EVENT PROMPT & CALL SETUP
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Marriage Event Prompt & Voice Flow Verification ---');

  const testEventId = `evt_marriage_${Date.now()}`;
  const testCampaignId = `camp_marriage_${Date.now()}`;

  const marriageEvent = callbridgeStorage.saveEvent({
    id: testEventId,
    name: 'శ్రీనివాస్ & పద్మావతి వివాహ మహోత్సవం',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      brideName: 'పద్మావతి',
      groomName: 'శ్రీనివాస్',
      weddingDate: '25 నవంబర్ 2026',
      weddingTime: 'ఉదయం 10:30 గంటలకు',
      venueName: 'రాయల్ ప్యాలెస్ కళ్యాణ మండపం, హైదరాబాద్',
      familyNames: 'శ్రీమతి మరియు శ్రీ రావుల కుటుంబం',
      approvedScript: 'శ్రీమతి మరియు శ్రీ రావుల కుటుంబం ఆహ్వానిస్తున్న వివాహ మహోత్సవం. వరుడు శ్రీనివాస్, వధువు పద్మావతి. తేది 25 నవంబర్ 2026, ఉదయం 10:30 గంటలకు, రాయల్ ప్యాలెస్ కళ్యాణ మండపం, హైదరాబాద్.',
    },
  });

  const marriageCampaign = callbridgeStorage.saveCampaign({
    id: testCampaignId,
    clientId: 'client_marriage_test',
    eventId: testEventId,
    name: 'Marriage Invitation Calling Batch',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 4,
    callsInitiated: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert(marriageEvent.id === testEventId, 'Marriage event created successfully');
  assert(marriageCampaign.id === testCampaignId, 'Marriage campaign created successfully');

  // -------------------------------------------------------------
  // TEST 3: SPOKEN RSVP FLOW SIMULATION (Attending, Not Attending, Maybe, Unanswered)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Spoken RSVP Call Lifecycle & Aggregate Analytics ---');

  // Call 1: Respondent says "తప్పకుండా వస్తాను" (Attending)
  const call1Id = `call_marriage_1_${Date.now()}`;
  const prov1Id = '01a1a6fd-c45f-7000-8cc3-111111111111';
  VapiService.mapProviderCallIdToJob(prov1Id, call1Id, testCampaignId, testEventId);

  const job1 = callbridgeStorage.saveCallJob({
    id: call1Id,
    providerCallId: prov1Id,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'c1',
    contactName: 'రాజేష్ గారు',
    contactPhone: '+919876543210',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 1a. Call Answered
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: { id: prov1Id },
    },
  });

  // 1b. Spoken Transcript received: User says "తప్పకుండా వస్తాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'తప్పకుండా వస్తాను',
      call: { id: prov1Id },
    },
  });

  // 1c. Assistant speaks closing phrase
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
      call: { id: prov1Id },
    },
  });

  // 1d. Terminal status-update ended
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      durationSeconds: 38,
      call: { id: prov1Id },
    },
  });

  // 1e. End of call report arrives (duplicate terminal check)
  VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      duration: 38,
      endedReason: 'assistant-said-end-call-phrase',
      call: { id: prov1Id },
    },
  });

  let agg = callbridgeStorage.getAggregateAnalytics(testEventId);
  assert(agg.totalCalls === 1, 'Total calls initiated: 1');
  assert(agg.answeredCalls === 1, 'Answered calls: 1');
  assert(agg.marriageEvent?.attendingCount === 1, 'Attending count: 1');
  assert(agg.marriageEvent?.notAttendingCount === 0, 'Not attending count: 0');
  assert(agg.marriageEvent?.maybeAttendingCount === 0, 'Maybe attending count: 0');
  assert(agg.marriageEvent?.attendingPercent === 100, 'Attending %: 100%');

  // Verify Zero-PII: job1 is purged from storage
  assert(!callbridgeStorage.getCallJob(call1Id), 'Zero-PII: Call job purged from permanent storage upon completion');

  // Call 2: Respondent says "రాలేను కుదరదు" (Not Attending)
  const call2Id = `call_marriage_2_${Date.now()}`;
  const prov2Id = '01a1a6fd-c45f-7000-8cc3-222222222222';
  VapiService.mapProviderCallIdToJob(prov2Id, call2Id, testCampaignId, testEventId);

  callbridgeStorage.saveCallJob({
    id: call2Id,
    providerCallId: prov2Id,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'c2',
    contactName: 'సురేష్ గారు',
    contactPhone: '+919876543211',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    message: { type: 'status-update', status: 'in-progress', call: { id: prov2Id } },
  });
  VapiService.handleWebhook({
    message: { type: 'transcript', role: 'user', transcript: 'రాలేను కుదరదు', call: { id: prov2Id } },
  });
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      durationSeconds: 32,
      call: { id: prov2Id },
    },
  });

  agg = callbridgeStorage.getAggregateAnalytics(testEventId);
  assert(agg.totalCalls === 2, 'Total calls initiated: 2');
  assert(agg.answeredCalls === 2, 'Answered calls: 2');
  assert(agg.marriageEvent?.attendingCount === 1, 'Attending count: 1');
  assert(agg.marriageEvent?.notAttendingCount === 1, 'Not attending count: 1');
  assert(agg.marriageEvent?.maybeAttendingCount === 0, 'Maybe attending count: 0');
  assert(agg.marriageEvent?.attendingPercent === 50, 'Attending %: 50%');
  assert(agg.marriageEvent?.notAttendingPercent === 50, 'Not attending %: 50%');

  // Call 3: Respondent says "వీలైతే వస్తాం ఇంకా తెలియదు" (Maybe Attending)
  const call3Id = `call_marriage_3_${Date.now()}`;
  const prov3Id = '01a1a6fd-c45f-7000-8cc3-333333333333';
  VapiService.mapProviderCallIdToJob(prov3Id, call3Id, testCampaignId, testEventId);

  callbridgeStorage.saveCallJob({
    id: call3Id,
    providerCallId: prov3Id,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'c3',
    contactName: 'వెంకట్ గారు',
    contactPhone: '+919876543212',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    message: { type: 'status-update', status: 'in-progress', call: { id: prov3Id } },
  });
  VapiService.handleWebhook({
    message: { type: 'transcript', role: 'user', transcript: 'వీలైతే వస్తాం ఇంకా తెలియదు', call: { id: prov3Id } },
  });
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'assistant-said-end-call-phrase',
      durationSeconds: 35,
      call: { id: prov3Id },
    },
  });

  agg = callbridgeStorage.getAggregateAnalytics(testEventId);
  assert(agg.totalCalls === 3, 'Total calls initiated: 3');
  assert(agg.answeredCalls === 3, 'Answered calls: 3');
  assert(agg.marriageEvent?.attendingCount === 1, 'Attending count: 1');
  assert(agg.marriageEvent?.notAttendingCount === 1, 'Not attending count: 1');
  assert(agg.marriageEvent?.maybeAttendingCount === 1, 'Maybe attending count: 1');
  assert(agg.marriageEvent?.attendingPercent === 33, 'Attending %: 33% (1/3)');
  assert(agg.marriageEvent?.notAttendingPercent === 33, 'Not attending %: 33% (1/3)');
  assert(agg.marriageEvent?.maybeAttendingPercent === 33, 'Maybe attending %: 33% (1/3)');

  // Call 4: Unanswered / Busy Call
  const call4Id = `call_marriage_4_${Date.now()}`;
  const prov4Id = '01a1a6fd-c45f-7000-8cc3-444444444444';
  VapiService.mapProviderCallIdToJob(prov4Id, call4Id, testCampaignId, testEventId);

  callbridgeStorage.saveCallJob({
    id: call4Id,
    providerCallId: prov4Id,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'c4',
    contactName: 'రమేష్ గారు',
    contactPhone: '+919876543213',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'busy',
      endedReason: 'customer-busy',
      durationSeconds: 0,
      call: { id: prov4Id },
    },
  });

  agg = callbridgeStorage.getAggregateAnalytics(testEventId);
  assert(agg.totalCalls === 4, 'Total calls initiated: 4');
  assert(agg.answeredCalls === 3, 'Answered calls: 3');
  assert(agg.unansweredCalls + agg.failedCalls >= 1, 'Unanswered or failed calls count: at least 1');

  // Verify Mathematical Rule: Attending + Not Attending + Maybe <= Answered Calls
  const totalRsvp = (agg.marriageEvent?.attendingCount || 0) +
                    (agg.marriageEvent?.notAttendingCount || 0) +
                    (agg.marriageEvent?.maybeAttendingCount || 0);
  assert(totalRsvp <= agg.answeredCalls, `Mathematical Rule: ${totalRsvp} <= ${agg.answeredCalls} (Total RSVP <= Answered Calls)`);

  // Verify Export Service output for marriage event
  const exported = ExportService.exportAnalyticsJson(testEventId, testCampaignId);
  assert(exported.essentialMetrics.attendingCount === 1, 'Exported attendingCount: 1');
  assert(exported.essentialMetrics.notAttendingCount === 1, 'Exported notAttendingCount: 1');
  assert(exported.essentialMetrics.maybeCount === 1, 'Exported maybeCount: 1');
  assert(exported.moduleSpecificMetrics.marriageRsvp?.totalCallsInitiated === 4, 'Exported totalCallsInitiated: 4');
  assert(exported.moduleSpecificMetrics.marriageRsvp?.answeredCalls === 3, 'Exported answeredCalls: 3');

  // -------------------------------------------------------------
  // TEST 4: REGRESSION TEST ON POLITICAL CAMPAIGN (ZERO REGRESSION)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Regression Test on Political Campaign (ZERO REGRESSION) ---');

  const polEventId = `evt_pol_regress_${Date.now()}`;
  const polCampId = `camp_pol_regress_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: polEventId,
    name: 'Constituency Voter Outreach',
    type: 'political_campaign',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      candidateName: 'శ్రీ రాము గారు',
      partyName: 'ప్రజా పార్టీ',
      constituency: 'సికింద్రాబాద్',
      approvedScript: 'నమస్కారం! రాము గారి తరఫున మాట్లాడుతున్నాము.',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate', spokenPrompt: { te: 'మద్దతు తెలపండి', hi: 'समर्थन दें', en: 'Press 1 to support' } },
        { digit: '2', labelEn: 'Request Callback', spokenPrompt: { te: 'సమాధానం తెలియజేయండి', hi: 'कॉलबैक का अनुरोध करें', en: 'Press 2 for callback' } },
      ],
    },
  });

  const polCallId = `call_pol_${Date.now()}`;
  const polProvId = '01a1a6fd-c45f-7000-8cc3-999999999999';
  VapiService.mapProviderCallIdToJob(polProvId, polCallId, polCampId, polEventId);

  callbridgeStorage.saveCallJob({
    id: polCallId,
    providerCallId: polProvId,
    campaignId: polCampId,
    eventId: polEventId,
    contactId: 'pc1',
    contactName: 'ఓటర్ గారు',
    contactPhone: '+919876543299',
    status: 'calling',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Political call connects
  VapiService.handleWebhook({
    message: { type: 'status-update', status: 'in-progress', call: { id: polProvId } },
  });

  // Political call receives DTMF Keypad 1
  VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      toolCallList: [{ function: { name: 'dtmf_received', arguments: { digit: '1' } } }],
      call: { id: polProvId },
    },
  });

  // Political call ends
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'customer-ended-call',
      durationSeconds: 20,
      call: { id: polProvId },
    },
  });

  const polAgg = callbridgeStorage.getAggregateAnalytics(polEventId);
  assert(polAgg.totalCalls === 1, 'Political: totalCalls = 1');
  assert(polAgg.answeredCalls === 1, 'Political: answeredCalls = 1');
  assert(polAgg.politicalCampaign?.keypad1Count === 1, 'Political: keypad1Count = 1');
  assert(polAgg.politicalCampaign?.keypad1Percent === 100, 'Political: keypad1Percent = 100%');
  assert(polAgg.marriageEvent === undefined, 'Political: marriageEvent is undefined (clean event isolation)');

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed}/${total} assertions passed`);
  console.log(`========================================\n`);

  if (passed === total) {
    console.log('ALL MARRIAGE EVENT RSVP & REGRESSION TESTS PASSED SUCCESSFULLY!');
  } else {
    throw new Error(`${total - passed} tests failed`);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
