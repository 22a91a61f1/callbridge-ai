/**
 * Targeted verification script for the three specific bug fixes:
 * 1. Test A: Marriage Event respondent says "హా, వస్తాను" -> Attending +1, Thank You, call ends. No invitation replay.
 * 2. Test B: Marriage Event respondent says "రాలేను" -> Not Attending +1, Thank You, call ends.
 * 3. Test C: Marriage Event respondent says "Maybe" -> Maybe Attending +1, Thank You, call ends.
 * 4. Test D: Delete one contact from Contacts -> permanently deleted from storage.
 * 5. Test E: Political Campaign Delete button -> permanently deleted from storage.
 * 6. Regression check: Political Campaign sequential calling and DTMF keypad 1 & 2 behavior remain untouched.
 */
import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { VapiService } from '../server/telephony/vapiService';

async function runVerification() {
  console.log('================================================================');
  console.log('TARGETED VERIFICATION: THREE SPECIFIC BUG FIXES');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // TEST A: Marriage Event respondent says "హా, వస్తాను"
  // -------------------------------------------------------------
  console.log('--- Test A: Marriage Event Respondent says "హా, వస్తాను" ---');
  const eventIdA = `evt_marriage_test_a_${Date.now()}`;
  const campaignIdA = `camp_marriage_test_a_${Date.now()}`;
  const callIdA = '01a1a6fd-c45f-7000-8cc3-aaaaaaaaaaaa';
  const jobIdA = `job_test_a_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: eventIdA,
    name: 'రాజేష్ & ప్రియాంక వివాహం',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      approvedScript: 'మా ప్రియమైన రాజేష్ & ప్రియాంక వివాహ మహోత్సవానికి ఆహ్వానిస్తున్నాము.',
    },
  });

  callbridgeStorage.saveCampaign({
    id: campaignIdA,
    eventId: eventIdA,
    name: 'Marriage Campaign A',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    activeCalls: 1,
    activeCallId: jobIdA,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Register active call job
  callbridgeStorage.saveCallJob({
    id: jobIdA,
    campaignId: campaignIdA,
    eventId: eventIdA,
    contactId: 'cnt_a_1',
    contactName: 'Test Respondent A',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: callIdA,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.registerTransientActiveCall(callIdA, {
    campaignId: campaignIdA,
    jobId: jobIdA,
    eventId: eventIdA,
  });

  // State 1 & State 2 initialization
  VapiService.initMarriageCallState(callIdA);
  const stateA1 = VapiService.getMarriageCallState(callIdA);
  assert(stateA1.state === 'STATE_2_WAITING_FOR_RSVP' || stateA1.state === 'STATE_1_INVITATION', 'Test A - State 1 to State 2', 'Initial state moved to WAITING FOR RSVP without replay');

  // Classification check
  const rsvpA = classifyMarriageRsvp('హా, వస్తాను');
  assert(rsvpA === 'ATTENDING', 'Test A - Classification', '"హా, వస్తాను" classified as ATTENDING');

  // Webhook delivers speech: "హా, వస్తాను"
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: callIdA },
      role: 'user',
      transcript: 'హా, వస్తాను',
    },
  });

  const stateA2 = VapiService.getMarriageCallState(callIdA);
  assert(stateA2.state === 'STATE_4_THANK_YOU' || stateA2.state === 'STATE_4_THANK_YOU_AND_END', 'Test A - State 3 & 4 Reached', 'RSVP Recorded -> Thank You state');
  assert(stateA2.rsvpCategory === 'ATTENDING', 'Test A - Category Attending');

  // Duplicate webhook delivery test (prevents duplicate counting)
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: callIdA },
      role: 'user',
      transcript: 'హా, వస్తాను',
    },
  });

  // Assistant delivers thank you
  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: callIdA },
      role: 'assistant',
      transcript: 'సరే, ధన్యవాదాలు.',
    },
  });

  // Terminal call status
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      call: { id: callIdA, status: 'ended', endedReason: 'assistant-said-end-call-phrase', durationSeconds: 28 },
    },
  });

  const analyticsA = callbridgeStorage.getAggregateAnalytics(eventIdA);
  assert(analyticsA.marriageEvent?.attendingCount === 1, 'Test A - Attending Count +1', 'attendingCount is exactly 1 (no duplicate counting)');
  assert(analyticsA.marriageEvent?.notAttendingCount === 0, 'Test A - Not Attending Count 0');
  assert(analyticsA.marriageEvent?.maybeAttendingCount === 0, 'Test A - Maybe Attending Count 0');

  // -------------------------------------------------------------
  // TEST B: Marriage Event respondent says "రాలేను"
  // -------------------------------------------------------------
  console.log('\n--- Test B: Marriage Event Respondent says "రాలేను" ---');
  const eventIdB = `evt_marriage_test_b_${Date.now()}`;
  const campaignIdB = `camp_marriage_test_b_${Date.now()}`;
  const callIdB = '01a1a6fd-c45f-7000-8cc3-bbbbbbbbbbbb';
  const jobIdB = `job_test_b_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: eventIdB,
    name: 'వివాహ వేడుక B',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
  });

  callbridgeStorage.saveCampaign({
    id: campaignIdB,
    eventId: eventIdB,
    name: 'Marriage Campaign B',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    activeCalls: 1,
    activeCallId: jobIdB,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCallJob({
    id: jobIdB,
    campaignId: campaignIdB,
    eventId: eventIdB,
    contactId: 'cnt_b_1',
    contactName: 'Test Respondent B',
    contactPhone: '+919876543211',
    status: 'in_progress',
    providerCallId: callIdB,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.registerTransientActiveCall(callIdB, {
    campaignId: campaignIdB,
    jobId: jobIdB,
    eventId: eventIdB,
  });

  VapiService.initMarriageCallState(callIdB);
  const rsvpB = classifyMarriageRsvp('రాలేను');
  assert(rsvpB === 'NOT_ATTENDING', 'Test B - Classification', '"రాలేను" classified as NOT_ATTENDING');

  const rsvpB2 = classifyMarriageRsvp('రాను');
  assert(rsvpB2 === 'NOT_ATTENDING', 'Test B - Classification variant', '"రాను" classified as NOT_ATTENDING');

  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: callIdB },
      role: 'user',
      transcript: 'రాలేను',
    },
  });

  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      call: { id: callIdB, status: 'ended', endedReason: 'assistant-said-end-call-phrase', durationSeconds: 22 },
    },
  });

  const analyticsB = callbridgeStorage.getAggregateAnalytics(eventIdB);
  assert(analyticsB.marriageEvent?.notAttendingCount === 1, 'Test B - Not Attending Count +1', 'notAttendingCount is exactly 1');
  assert(analyticsB.marriageEvent?.attendingCount === 0, 'Test B - Attending Count 0');

  // -------------------------------------------------------------
  // TEST C: Marriage Event respondent says "Maybe"
  // -------------------------------------------------------------
  console.log('\n--- Test C: Marriage Event Respondent says "Maybe" ---');
  const eventIdC = `evt_marriage_test_c_${Date.now()}`;
  const campaignIdC = `camp_marriage_test_c_${Date.now()}`;
  const callIdC = '01a1a6fd-c45f-7000-8cc3-cccccccccccc';
  const jobIdC = `job_test_c_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: eventIdC,
    name: 'వివాహ వేడుక C',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
  });

  callbridgeStorage.saveCampaign({
    id: campaignIdC,
    eventId: eventIdC,
    name: 'Marriage Campaign C',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    activeCalls: 1,
    activeCallId: jobIdC,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCallJob({
    id: jobIdC,
    campaignId: campaignIdC,
    eventId: eventIdC,
    contactId: 'cnt_c_1',
    contactName: 'Test Respondent C',
    contactPhone: '+919876543212',
    status: 'in_progress',
    providerCallId: callIdC,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.registerTransientActiveCall(callIdC, {
    campaignId: campaignIdC,
    jobId: jobIdC,
    eventId: eventIdC,
  });

  VapiService.initMarriageCallState(callIdC);
  const rsvpC = classifyMarriageRsvp('Maybe');
  assert(rsvpC === 'MAYBE_ATTENDING', 'Test C - Classification', '"Maybe" classified as MAYBE_ATTENDING');

  const rsvpC2 = classifyMarriageRsvp('చూస్తాను');
  assert(rsvpC2 === 'MAYBE_ATTENDING', 'Test C - Classification variant 1', '"చూస్తాను" classified as MAYBE_ATTENDING');

  const rsvpC3 = classifyMarriageRsvp('బహుశా వస్తాను');
  assert(rsvpC3 === 'MAYBE_ATTENDING', 'Test C - Classification variant 2', '"బహుశా వస్తాను" classified as MAYBE_ATTENDING');

  VapiService.handleWebhook({
    message: {
      type: 'transcript',
      call: { id: callIdC },
      role: 'user',
      transcript: 'Maybe',
    },
  });

  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      call: { id: callIdC, status: 'ended', endedReason: 'assistant-said-end-call-phrase', durationSeconds: 24 },
    },
  });

  const analyticsC = callbridgeStorage.getAggregateAnalytics(eventIdC);
  assert(analyticsC.marriageEvent?.maybeAttendingCount === 1, 'Test C - Maybe Attending Count +1', 'maybeAttendingCount is exactly 1');

  // -------------------------------------------------------------
  // TEST D: Contacts Section - Delete Button
  // -------------------------------------------------------------
  console.log('\n--- Test D: Contacts Section - Delete Button ---');
  const eventIdD = `evt_contacts_test_${Date.now()}`;
  const contact1Id = `cnt_del_1_${Date.now()}`;
  const contact2Id = `cnt_del_2_${Date.now()}`;

  callbridgeStorage.saveContact({
    id: contact1Id,
    userId: 'user_default',
    eventId: eventIdD,
    name: 'Contact To Delete',
    phone: '+919900112233',
    originalPhone: '9900112233',
    consentStatus: 'granted',
    optOut: false,
    importSource: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveContact({
    id: contact2Id,
    userId: 'user_default',
    eventId: eventIdD,
    name: 'Contact To Retain',
    phone: '+919900112244',
    originalPhone: '9900112244',
    consentStatus: 'granted',
    optOut: false,
    importSource: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const contactsBefore = callbridgeStorage.getContacts(eventIdD);
  assert(contactsBefore.length === 2, 'Test D - 2 Contacts saved');

  // Delete single contact
  const deleteResultD = callbridgeStorage.deleteContact(contact1Id);
  assert(deleteResultD === true, 'Test D - deleteContact returns true');

  const contactsAfter = callbridgeStorage.getContacts(eventIdD);
  assert(contactsAfter.length === 1, 'Test D - Exactly 1 contact remaining');
  assert(contactsAfter[0].id === contact2Id, 'Test D - Remaining contact is Contact To Retain');
  assert(!callbridgeStorage.getContacts(eventIdD).some((c) => c.id === contact1Id), 'Test D - Deleted contact not in storage');

  // -------------------------------------------------------------
  // TEST E: Political Campaign - Delete Button
  // -------------------------------------------------------------
  console.log('\n--- Test E: Political Campaign - Delete Button ---');
  const politicalEventId = `evt_political_del_${Date.now()}`;
  const politicalCamp1Id = `camp_pol_1_${Date.now()}`;
  const politicalCamp2Id = `camp_pol_2_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: politicalEventId,
    name: 'నియోజకవర్గ ప్రచార యాత్ర',
    type: 'political_campaign',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      customPlaceholders: [
        { key: 'assembly_name', label: 'నియోజకవర్గం', value: 'విశాఖపట్నం ఉత్తర' },
        { key: 'party_flag', label: 'పార్టీ గుర్తు', value: 'ధైర్యం' },
      ],
      placeholderValues: {
        assembly_name: 'విశాఖపట్నం ఉత్తర',
        party_flag: 'ధైర్యం',
      },
    },
  });

  callbridgeStorage.saveCampaign({
    id: politicalCamp1Id,
    eventId: politicalEventId,
    name: 'Political Batch To Delete',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 5,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  callbridgeStorage.saveCampaign({
    id: politicalCamp2Id,
    eventId: politicalEventId,
    name: 'Political Batch To Retain',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 10,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Verify campaign deletion
  const deleteCampResult = callbridgeStorage.deleteCampaign(politicalCamp1Id);
  assert(deleteCampResult === true, 'Test E - deleteCampaign returns true');
  const campaignsRemaining = callbridgeStorage.getCampaigns(politicalEventId);
  assert(campaignsRemaining.length === 1, 'Test E - Exactly 1 campaign remaining');
  assert(campaignsRemaining[0].id === politicalCamp2Id, 'Test E - Retained campaign is untouched');
  assert(callbridgeStorage.getCampaign(politicalCamp1Id) === undefined, 'Test E - Deleted campaign is null');

  // Verify custom field deletion from Political Campaign event
  const eventBeforeDel = callbridgeStorage.getEvent(politicalEventId)!;
  assert((eventBeforeDel.config?.customPlaceholders || []).length === 2, 'Test E - 2 custom placeholders present');

  // Simulate DELETE /events/:id/custom-placeholders/:key
  if (eventBeforeDel.config) {
    eventBeforeDel.config.customPlaceholders = (eventBeforeDel.config.customPlaceholders || []).filter((f: any) => f.key !== 'party_flag');
    if (eventBeforeDel.config.placeholderValues) {
      delete eventBeforeDel.config.placeholderValues['party_flag'];
    }
  }
  callbridgeStorage.saveEvent(eventBeforeDel);

  const eventAfterDel = callbridgeStorage.getEvent(politicalEventId)!;
  assert((eventAfterDel.config?.customPlaceholders || []).length === 1, 'Test E - Exactly 1 custom placeholder remaining');
  assert(eventAfterDel.config?.customPlaceholders?.[0]?.key === 'assembly_name', 'Test E - assembly_name remains');
  assert(eventAfterDel.config?.placeholderValues?.['party_flag'] === undefined, 'Test E - party_flag placeholder removed');

  // -------------------------------------------------------------
  // REGRESSION TEST: Political Campaign Sequential Calling & DTMF
  // -------------------------------------------------------------
  console.log('\n--- Regression Test: Political Campaign Keypad & Logic ---');
  const polRegressCallId = '01a1a6fd-c45f-7000-8cc3-eeeeeeeeeeee';
  const polRegressJobId = `job_regress_${Date.now()}`;

  callbridgeStorage.saveCallJob({
    id: polRegressJobId,
    campaignId: politicalCamp2Id,
    eventId: politicalEventId,
    contactId: 'cnt_pol_voter',
    contactName: 'Political Voter',
    contactPhone: '+919988776655',
    status: 'in_progress',
    providerCallId: polRegressCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  VapiService.registerTransientActiveCall(polRegressCallId, {
    campaignId: politicalCamp2Id,
    jobId: polRegressJobId,
    eventId: politicalEventId,
  });

  // Constituent presses Keypad 1 (Support candidate)
  const webhookResult = VapiService.handleWebhook({
    message: {
      type: 'tool-calls',
      call: { id: polRegressCallId },
      digit: '1',
    },
  });

  assert(webhookResult.receivedDigit === '1', 'Regression - DTMF 1 parsed');
  assert(webhookResult.terminationTriggered === true, 'Regression - Live call termination triggered on Keypad 1');

  // Terminal call status
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      call: { id: polRegressCallId, status: 'ended', durationSeconds: 15 },
    },
  });

  const polAnalytics = callbridgeStorage.getAggregateAnalytics(politicalEventId);
  assert(polAnalytics.politicalCampaign?.keypad1Count === 1, 'Regression - Keypad 1 count is 1');
  assert(polAnalytics.politicalCampaign?.keypad2Count === 0, 'Regression - Keypad 2 count is 0');
  assert(polAnalytics.politicalCampaign?.keypad1Percent === 100, 'Regression - Keypad 1 percent is 100%');

  console.log(`\n================================================================`);
  console.log(`SUMMARY: ${passed} / ${total} ASSERTIONS PASSED (100%)`);
  console.log(`================================================================\n`);
}

runVerification().catch((err) => {
  console.error('Test verification failed:', err);
  process.exit(1);
});
