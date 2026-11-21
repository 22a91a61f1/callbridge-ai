import assert from 'node:assert';
import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runVerification() {
  console.log('===============================================================');
  console.log('MARRIAGE EVENT RSVP CLASSIFICATION & ANALYTICS VERIFICATION');
  console.log('===============================================================');

  // -----------------------------------------------------------------
  // 1. VERIFY 14 MANDATORY TEST PHRASES + EXTENSIONS
  // -----------------------------------------------------------------
  console.log('\n--- 1. Mandatory RSVP Semantic Classification Phrases ---');
  const testPhrases: Array<{ phrase: string; expected: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING' }> = [
    { phrase: 'వస్తాను', expected: 'ATTENDING' },
    { phrase: 'వస్తున్నాను', expected: 'ATTENDING' },
    { phrase: 'హా వస్తాను', expected: 'ATTENDING' },
    { phrase: 'తప్పకుండా వస్తాము', expected: 'ATTENDING' },
    { phrase: 'ఖచ్చితంగా వస్తాను', expected: 'ATTENDING' },
    { phrase: 'రాను', expected: 'NOT_ATTENDING' },
    { phrase: 'రాలేను', expected: 'NOT_ATTENDING' },
    { phrase: 'రావడం కుదరదు', expected: 'NOT_ATTENDING' },
    { phrase: 'పెళ్లికి రాలేను', expected: 'NOT_ATTENDING' },
    { phrase: 'చూస్తాను', expected: 'MAYBE_ATTENDING' },
    { phrase: 'చూద్దాం', expected: 'MAYBE_ATTENDING' },
    { phrase: 'కుదిరితే వస్తాను', expected: 'MAYBE_ATTENDING' },
    { phrase: 'ప్రయత్నిస్తాను', expected: 'MAYBE_ATTENDING' },
    { phrase: 'ఇంకా తెలియదు', expected: 'MAYBE_ATTENDING' },
    // English
    { phrase: 'Yes', expected: 'ATTENDING' },
    { phrase: 'I will attend', expected: 'ATTENDING' },
    { phrase: 'No', expected: 'NOT_ATTENDING' },
    { phrase: 'Unable to attend', expected: 'NOT_ATTENDING' },
    { phrase: 'Maybe', expected: 'MAYBE_ATTENDING' },
    { phrase: 'Not sure', expected: 'MAYBE_ATTENDING' },
    // Hindi
    { phrase: 'Hum aayenge', expected: 'ATTENDING' },
    { phrase: 'Pakka aayenge', expected: 'ATTENDING' },
    { phrase: 'Nahi aa sakta', expected: 'NOT_ATTENDING' },
    { phrase: 'Dekhenge', expected: 'MAYBE_ATTENDING' },
    { phrase: 'Shayad', expected: 'MAYBE_ATTENDING' },
  ];

  for (const { phrase, expected } of testPhrases) {
    const actual = classifyMarriageRsvp(phrase);
    assert.strictEqual(actual, expected, `Phrase "${phrase}" expected ${expected} but got ${actual}`);
    console.log(`  ✓ [PASS] "${phrase}" -> ${actual}`);
  }

  // -----------------------------------------------------------------
  // 2. VERIFY NEGATION INTEGRITY & SILENCE/UNANSWERED HANDLING
  // -----------------------------------------------------------------
  console.log('\n--- 2. Negation Integrity & Silence/Greeting Handling ---');
  // Negation must never become ATTENDING
  assert.strictEqual(classifyMarriageRsvp('రాను'), 'NOT_ATTENDING');
  assert.strictEqual(classifyMarriageRsvp('రాలేను'), 'NOT_ATTENDING');
  assert.strictEqual(classifyMarriageRsvp('కుదరదు'), 'NOT_ATTENDING');
  assert.notStrictEqual(classifyMarriageRsvp('రాను'), 'ATTENDING');
  console.log('  ✓ [PASS] Negations like "రాను" never resolve to ATTENDING');

  // Genuinely unclear / greeting must return UNCLEAR (never default to MAYBE)
  assert.strictEqual(classifyMarriageRsvp('హలో'), 'UNCLEAR');
  assert.strictEqual(classifyMarriageRsvp('నమస్కారం'), 'UNCLEAR');
  assert.strictEqual(classifyMarriageRsvp(''), 'UNCLEAR');
  console.log('  ✓ [PASS] Greetings & empty speech return UNCLEAR (not classified as MAYBE)');

  // -----------------------------------------------------------------
  // 3. CAMPAIGN ISOLATION & DASHBOARD ANALYTICS PERSISTENCE
  // -----------------------------------------------------------------
  console.log('\n--- 3. Campaign Isolation & Backend Persistence ---');
  const now = Date.now();
  const eventId = `event_marriage_test_${now}`;
  const campaignA = `camp_marr_A_${now}`;
  const campaignB = `camp_marr_B_${now}`;

  // Seed Event and Two Separate Campaigns
  callbridgeStorage.saveEvent({
    id: eventId,
    name: 'Suresh & Kavya Wedding',
    type: 'marriage_event',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCampaign({
    id: campaignA,
    eventId,
    clientId: 'client_001',
    name: 'Campaign A (Groom Side)',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 5,
    callsInitiated: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCampaign({
    id: campaignB,
    eventId,
    clientId: 'client_001',
    name: 'Campaign B (Bride Side)',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 5,
    callsInitiated: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Call 1 on Campaign A: "వస్తాను" -> ATTENDING
  const callIdA1 = `01a1a6fd-7000-8cc3-aaaa-${now}`;
  VapiService.initMarriageCallState(callIdA1);
  VapiService.mapProviderCallIdToJob(callIdA1, `job_A1_${now}`, campaignA, eventId, '+919876543210');
  callbridgeStorage.saveCallJob({
    id: `job_A1_${now}`,
    campaignId: campaignA,
    eventId,
    contactId: 'c_A1',
    contactName: 'Groom Guest 1',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: callIdA1,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Answer call
  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'in-progress' },
    call: { id: callIdA1, status: 'in-progress' },
  });

  // Tool Call: recordMarriageRsvp ATTENDING
  const toolCallRes = VapiService.handleWebhook({
    type: 'tool-calls',
    message: {
      type: 'tool-calls',
      toolCalls: [
        {
          id: 'tc_1',
          function: {
            name: 'recordMarriageRsvp',
            arguments: JSON.stringify({ category: 'ATTENDING' }),
          },
        },
      ],
    },
    call: { id: callIdA1 },
  });
  assert.strictEqual(toolCallRes.success, true);
  console.log('  ✓ [PASS] Tool call recordMarriageRsvp successfully processed');

  // Verify Idempotency: Duplicate tool call webhook
  const dupRes = VapiService.handleWebhook({
    type: 'tool-calls',
    message: {
      type: 'tool-calls',
      toolCalls: [
        {
          id: 'tc_dup',
          function: {
            name: 'recordMarriageRsvp',
            arguments: JSON.stringify({ category: 'ATTENDING' }),
          },
        },
      ],
    },
    call: { id: callIdA1 },
  });
  assert.strictEqual(dupRes.success, true);
  console.log('  ✓ [PASS] Duplicate webhook ignored safely without double-counting');

  // Complete Call A1
  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call' },
    call: { id: callIdA1, status: 'ended', endedReason: 'assistant-ended-call', duration: 25 },
  });

  // Call 2 on Campaign A: "కుదరదు" -> NOT_ATTENDING via transcript
  const callIdA2 = `01a1a6fd-7000-8cc3-aaab-${now}`;
  VapiService.initMarriageCallState(callIdA2);
  VapiService.mapProviderCallIdToJob(callIdA2, `job_A2_${now}`, campaignA, eventId, '+919876543211');
  callbridgeStorage.saveCallJob({
    id: `job_A2_${now}`,
    campaignId: campaignA,
    eventId,
    contactId: 'c_A2',
    contactName: 'Groom Guest 2',
    contactPhone: '+919876543211',
    status: 'in_progress',
    providerCallId: callIdA2,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'in-progress' },
    call: { id: callIdA2, status: 'in-progress' },
  });

  VapiService.handleWebhook({
    type: 'transcript',
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'రావడం కుదరదు',
    },
    call: { id: callIdA2 },
  });

  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call' },
    call: { id: callIdA2, status: 'ended', endedReason: 'assistant-ended-call', duration: 20 },
  });
  console.log('  ✓ [PASS] Spoken "రావడం కుదరదు" processed into NOT_ATTENDING');

  // Call 3 on Campaign A: Unanswered call (no answer / busy)
  const callIdA3 = `01a1a6fd-7000-8cc3-aaac-${now}`;
  VapiService.initMarriageCallState(callIdA3);
  VapiService.mapProviderCallIdToJob(callIdA3, `job_A3_${now}`, campaignA, eventId, '+919876543212');
  callbridgeStorage.saveCallJob({
    id: `job_A3_${now}`,
    campaignId: campaignA,
    eventId,
    contactId: 'c_A3',
    contactName: 'Groom Guest 3',
    contactPhone: '+919876543212',
    status: 'calling',
    providerCallId: callIdA3,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'no-answer', endedReason: 'customer-did-not-answer' },
    call: { id: callIdA3, status: 'no-answer', endedReason: 'customer-did-not-answer', duration: 0 },
  });
  console.log('  ✓ [PASS] Unanswered call recorded without assigning RSVP category');

  // Call 1 on Campaign B: "చూస్తాను" -> MAYBE_ATTENDING
  const callIdB1 = `01a1a6fd-7000-8cc3-bbba-${now}`;
  VapiService.initMarriageCallState(callIdB1);
  VapiService.mapProviderCallIdToJob(callIdB1, `job_B1_${now}`, campaignB, eventId, '+919876543220');
  callbridgeStorage.saveCallJob({
    id: `job_B1_${now}`,
    campaignId: campaignB,
    eventId,
    contactId: 'c_B1',
    contactName: 'Bride Guest 1',
    contactPhone: '+919876543220',
    status: 'in_progress',
    providerCallId: callIdB1,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'in-progress' },
    call: { id: callIdB1, status: 'in-progress' },
  });

  VapiService.handleWebhook({
    type: 'transcript',
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'చూస్తాను కుదిరితే వస్తాను',
    },
    call: { id: callIdB1 },
  });

  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call' },
    call: { id: callIdB1, status: 'ended', endedReason: 'assistant-ended-call', duration: 30 },
  });
  console.log('  ✓ [PASS] Campaign B call classified as MAYBE_ATTENDING');

  // -----------------------------------------------------------------
  // 4. VERIFY DASHBOARD ANALYTICS ISOLATION & PERCENTAGE DENOMINATOR
  // -----------------------------------------------------------------
  console.log('\n--- 4. Dashboard Analytics & Denominator Check ---');

  // Verify Campaign A Analytics
  const analyticsA = ExportService.exportAnalyticsJson(eventId, campaignA);
  const rsvpA = analyticsA.moduleSpecificMetrics.marriageRsvp;
  console.log('Campaign A Metrics:', {
    totalCalls: rsvpA.totalCallsInitiated,
    answeredCalls: rsvpA.answeredCalls,
    finishedCalls: rsvpA.finishedCalls,
    attendingCount: rsvpA.attendingCount,
    attendingPercent: rsvpA.attendingPercent,
    notAttendingCount: rsvpA.notAttendingCount,
    notAttendingPercent: rsvpA.notAttendingPercent,
    maybeCount: rsvpA.maybeCount,
    maybePercent: rsvpA.maybePercent,
  });

  assert.strictEqual(rsvpA.totalCallsInitiated, 3, 'Campaign A Total Calls must be 3');
  assert.strictEqual(rsvpA.answeredCalls, 2, 'Campaign A Answered Calls must be 2');
  assert.strictEqual(rsvpA.attendingCount, 1, 'Campaign A Attending must be 1');
  assert.strictEqual(rsvpA.notAttendingCount, 1, 'Campaign A Not Attending must be 1');
  assert.strictEqual(rsvpA.maybeCount, 0, 'Campaign A Maybe must be 0');
  // Denominator: Answered Calls (2) -> 1/2 = 50%
  assert.strictEqual(rsvpA.attendingPercent, 50, 'Campaign A Attending % must be 50%');
  assert.strictEqual(rsvpA.notAttendingPercent, 50, 'Campaign A Not Attending % must be 50%');
  assert.strictEqual(rsvpA.maybePercent, 0, 'Campaign A Maybe % must be 0%');
  console.log('  ✓ [PASS] Campaign A calculations exact (1 Attending, 1 Not Attending, 0 Maybe out of 2 Answered = 50%/50%/0%)');

  // Verify Campaign B Analytics (Strict Campaign Isolation)
  const analyticsB = ExportService.exportAnalyticsJson(eventId, campaignB);
  const rsvpB = analyticsB.moduleSpecificMetrics.marriageRsvp;
  console.log('Campaign B Metrics:', {
    totalCalls: rsvpB.totalCallsInitiated,
    answeredCalls: rsvpB.answeredCalls,
    finishedCalls: rsvpB.finishedCalls,
    attendingCount: rsvpB.attendingCount,
    attendingPercent: rsvpB.attendingPercent,
    notAttendingCount: rsvpB.notAttendingCount,
    notAttendingPercent: rsvpB.notAttendingPercent,
    maybeCount: rsvpB.maybeCount,
    maybePercent: rsvpB.maybePercent,
  });

  assert.strictEqual(rsvpB.totalCallsInitiated, 1, 'Campaign B Total Calls must be 1');
  assert.strictEqual(rsvpB.answeredCalls, 1, 'Campaign B Answered Calls must be 1');
  assert.strictEqual(rsvpB.attendingCount, 0, 'Campaign B Attending must be 0 (Isolated from Campaign A)');
  assert.strictEqual(rsvpB.notAttendingCount, 0, 'Campaign B Not Attending must be 0 (Isolated from Campaign A)');
  assert.strictEqual(rsvpB.maybeCount, 1, 'Campaign B Maybe must be 1');
  // Denominator: Answered Calls (1) -> 1/1 = 100%
  assert.strictEqual(rsvpB.maybePercent, 100, 'Campaign B Maybe % must be 100%');
  console.log('  ✓ [PASS] Campaign B strictly isolated: Attending=0, NotAttending=0, Maybe=1 (100%)');

  // -----------------------------------------------------------------
  // 5. ZERO ANSWERED CALLS DENOMINATOR SAFETY (0% WHEN 0 ANSWERED)
  // -----------------------------------------------------------------
  console.log('\n--- 5. Zero Answered Calls Denominator Safety ---');
  const campaignC = `camp_marr_empty_${now}`;
  callbridgeStorage.saveCampaign({
    id: campaignC,
    eventId,
    clientId: 'client_001',
    name: 'Campaign C (Empty)',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 0,
    callsInitiated: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const analyticsC = ExportService.exportAnalyticsJson(eventId, campaignC);
  const rsvpC = analyticsC.moduleSpecificMetrics.marriageRsvp;
  assert.strictEqual(rsvpC.answeredCalls, 0);
  assert.strictEqual(rsvpC.attendingPercent, 0);
  assert.strictEqual(rsvpC.notAttendingPercent, 0);
  assert.strictEqual(rsvpC.maybePercent, 0);
  console.log('  ✓ [PASS] Zero answered calls safely yields 0% for all RSVP categories without NaN or division by zero');

  // -----------------------------------------------------------------
  // 6. ZERO REGRESSION ON POLITICAL CAMPAIGN MODULE
  // -----------------------------------------------------------------
  console.log('\n--- 6. Zero Regression on Political Campaign ---');
  const polEventId = `pol_event_test_${now}`;
  callbridgeStorage.saveEvent({
    id: polEventId,
    name: 'Constituency Outreach',
    type: 'political_campaign',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const polCampaignId = `pol_camp_${now}`;
  callbridgeStorage.saveCampaign({
    id: polCampaignId,
    eventId: polEventId,
    clientId: 'client_001',
    name: 'Voter Campaign',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 1,
    callsInitiated: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const polCallId = `01a1a6fd-7000-8cc3-pppp-${now}`;
  VapiService.mapProviderCallIdToJob(polCallId, `pol_job_${now}`, polCampaignId, polEventId, '+919999999999');
  callbridgeStorage.saveCallJob({
    id: `pol_job_${now}`,
    campaignId: polCampaignId,
    eventId: polEventId,
    contactId: 'pol_c1',
    contactName: 'Citizen 1',
    contactPhone: '+919999999999',
    status: 'in_progress',
    providerCallId: polCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Political DTMF Keypad 1
  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'in-progress' },
    call: { id: polCallId, status: 'in-progress' },
  });
  VapiService.handleWebhook({
    type: 'speech-update',
    message: { type: 'speech-update', digits: '1' },
    call: { id: polCallId, digits: '1' },
  });
  VapiService.handleWebhook({
    type: 'status-update',
    message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call' },
    call: { id: polCallId, status: 'ended', endedReason: 'assistant-ended-call', duration: 15 },
  });

  const polAnalytics = ExportService.exportAnalyticsJson(polEventId, polCampaignId);
  const polMetrics = polAnalytics.moduleSpecificMetrics.politicalCampaign;
  assert.strictEqual(polMetrics.pressed1Count, 1);
  assert.strictEqual(polMetrics.pressed1Percent, 100);
  assert.strictEqual(polAnalytics.moduleSpecificMetrics.marriageRsvp.attendingCount, 0);
  console.log('  ✓ [PASS] Political campaign intact: Keypad 1 recorded, 0 cross-module contamination');

  console.log('\n===============================================================');
  console.log('ALL VERIFICATION SUITES PASSED FLAWLESSLY!');
  console.log('===============================================================');
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
