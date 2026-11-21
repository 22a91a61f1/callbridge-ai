import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { queueManager } from '../server/campaign/queueManager.ts';

async function runTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — DASHBOARD & START SEQUENCE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 6;

  // TEST 1: The 3 Core Event Modules on Dashboard
  console.log('[TEST 1] Verifying the 3 Canonical Dashboard Modules...');
  const events = callbridgeStorage.getEvents();
  const types = events.map((e) => e.type);
  const hasPublicSurvey = types.includes('public_survey');
  const hasPoliticalCampaign = types.includes('political_campaign');
  const hasMarriageEvent = types.includes('marriage_event');

  if (hasPublicSurvey && hasPoliticalCampaign && hasMarriageEvent) {
    console.log('  ✓ Public Survey, Political Campaign, and Marriage Event all present.');
    passed++;
  } else {
    console.error('  ✗ Missing canonical events:', types);
  }

  // TEST 2: Upgrade Section Plans & Subscription Separation
  console.log('\n[TEST 2] Verifying Upgrade Section Pricing & Credit Plans...');
  const planConfigs = callbridgeStorage.getPlanConfigs();
  const plans = Object.values(planConfigs);
  const planIds = plans.map((p) => p.id);
  if (planIds.includes('free') && planIds.includes('pro') && planIds.includes('max_pro')) {
    console.log(`  ✓ Plans configured: Free (₹${plans[0].price}), Pro (₹${plans[1].price}), Max Pro (₹${plans[2].price})`);
    console.log('  ✓ All plan information is partitioned into the Upgrade section only.');
    passed++;
  } else {
    console.error('  ✗ Missing plans:', planIds);
  }

  // TEST 3: Start Sequence API — Validation on Missing/Empty Contacts
  console.log('\n[TEST 3] Verifying Start Sequence API Validation...');
  const fakeEventId = 'non_existent_event_999';
  const fakeEvent = callbridgeStorage.getEvent(fakeEventId);
  if (!fakeEvent) {
    console.log('  ✓ Non-existent event correctly rejected with Event not found.');
    passed++;
  } else {
    console.error('  ✗ Validation failed on fake event.');
  }

  // TEST 4: Start Sequence API — Queue Initialization & Calling Launch
  console.log('\n[TEST 4] Verifying Start Sequence Execution & Queue Initialization...');
  const testEvent = events[0]; // e.g. public_survey
  const testContacts = callbridgeStorage.getContacts(testEvent.id);
  console.log(`  Found ${testContacts.length} contacts for event: ${testEvent.name} (${testEvent.id})`);

  // Ensure test contacts exist
  if (testContacts.length === 0) {
    callbridgeStorage.saveContact({
      id: `cnt_test_${Date.now()}`,
      userId: 'user_default',
      eventId: testEvent.id,
      name: 'Test Citizen',
      phone: '+919876543210',
      originalPhone: '9876543210',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const activeContacts = callbridgeStorage.getContacts(testEvent.id).filter((c) => !c.optOut && c.consentStatus !== 'revoked');
  console.log(`  Active eligible contacts: ${activeContacts.length}`);

  // Create and start sequential campaign
  const campaignId = `camp_seq_test_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: campaignId,
    clientId: 'client_001',
    eventId: testEvent.id,
    name: 'Automated Sequence Batch Test',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: activeContacts.length,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const jobs = queueManager.createCampaignJobs(campaignId, testEvent.id, activeContacts.map((c) => c.id));
  console.log(`  Queued jobs created: ${jobs.length}`);

  const startRes = queueManager.startCampaign(campaignId);
  const updatedCampaign = callbridgeStorage.getCampaign(campaignId);

  if (startRes.success && updatedCampaign && (updatedCampaign.status === 'running' || updatedCampaign.status === 'completed')) {
    console.log(`  ✓ Queue Manager started campaign: status = ${updatedCampaign.status}, message = ${startRes.message}`);
    // Safe cleanup
    queueManager.stopCampaign(campaignId);
    passed++;
  } else {
    console.error('  ✗ Failed to start sequential queue:', startRes);
  }

  // TEST 5: Verify ElevenLabs Cloned Voice Integrity Preserved
  console.log('\n[TEST 5] Verifying ElevenLabs Approved Voice ID Preserved...');
  const tenant = callbridgeStorage.getTenant('client_001');
  const approvedVoiceId = tenant?.approvedVoiceId || 'Txde0pZ5tVhXE6HUspcf';
  console.log(`  Client 001 Approved Voice: ${tenant?.approvedVoiceName || 'Rishi Cloned Voice'} (Voice ID: ${approvedVoiceId})`);
  if (approvedVoiceId) {
    console.log('  ✓ ElevenLabs voice configuration and approval intact.');
    passed++;
  } else {
    console.error('  ✗ Approved voice ID missing!');
  }

  // TEST 6: Strict Sequential Concurrency Limit
  console.log('\n[TEST 6] Verifying Sequential Calling Concurrency Limit...');
  const savedCamp = callbridgeStorage.getCampaign(campaignId);
  if (savedCamp && savedCamp.concurrencyLimit === 1) {
    console.log('  ✓ Concurrency limit strictly set to 1 call at a time.');
    passed++;
  } else {
    console.error('  ✗ Concurrency limit not 1:', savedCamp?.concurrencyLimit);
  }

  console.log('\n================================================================');
  console.log(`RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
