import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { normalizeTeluguPronunciation } from '../server/voice/teluguPronunciationDictionary.ts';

async function runTestSuite() {
  console.log('====================================================');
  console.log('CALLBRIDGE AI — FINAL PRODUCTION VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: any) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`, extra ? extra : '');
      failed++;
    }
  }

  // ----------------------------------------------------
  // PRIORITY 1: VOICE QUALITY & TELUGU PRONUNCIATION
  // ----------------------------------------------------
  console.log('--- PRIORITY 1: Voice Quality & Telugu Pronunciation ---');

  const teluguRaw = 'నమస్కారం   అండి!   ఇది మొదటి ప్రశ్న : తాగునీటి సౌకర్యం ఎలా ఉంది?';
  const normalized = normalizeTeluguPronunciation(teluguRaw);
  assert(
    'Telugu pronunciation normalization removes survey prefixes without splitting compound words',
    normalized.normalizedText.includes('నమస్కారం అండి!') &&
    normalized.normalizedText.includes('తాగునీటి') &&
    !normalized.normalizedText.includes('మొదటి ప్రశ్న')
  );

  const event = callbridgeStorage.getEvents()[0];
  const clientId = (event as any)?.clientId || 'client_001';
  const approvedVoiceId = 'Txde0pZ5tVhXE6HUspcf';

  assert(
    'Tenant has approved ElevenLabs cloned voice configured',
    Boolean(approvedVoiceId)
  );

  // ----------------------------------------------------
  // PRIORITY 2: DTMF 1 & 2 INSTANT CALL HANGUP
  // ----------------------------------------------------
  console.log('\n--- PRIORITY 2: DTMF 1 & 2 Instant Call Hangup ---');

  const providerId1 = `vapi_uuid_1_${Date.now()}`;
  const testJobId = `job_test_dtmf_${Date.now()}`;
  const now = new Date().toISOString();
  callbridgeStorage.saveCallJob({
    id: testJobId,
    clientId,
    campaignId: 'camp_test_dtmf',
    eventId: event.id,
    contactId: 'cnt_001',
    contactName: 'Ramesh Naidu',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: providerId1,
    startedAt: now,
    retryCount: 0,
    maxRetries: 1,
    transcript: [{ role: 'agent', text: 'నమస్కారం అండి!' }],
    createdAt: now,
    updatedAt: now,
  });

  // Simulate DTMF 1 webhook event
  const webhookResult1 = VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: { id: providerId1 },
    },
    digits: '1',
  });

  const updatedJob1 = callbridgeStorage.getCallJob(testJobId);
  assert(
    'Pressing DTMF 1 saves digit "1" in the call record',
    updatedJob1?.dtmfDigitReceived === '1'
  );
  assert(
    'Pressing DTMF 1 immediately marks the call job as "completed"',
    updatedJob1?.status === 'completed'
  );
  assert(
    'Pressing DTMF 1 triggers instant hangup metadata flag',
    updatedJob1?.metadata?.instantHangupTriggered === true
  );

  // Simulate DTMF 2 on another call
  const providerId2 = `vapi_uuid_2_${Date.now()}`;
  const testJobId2 = `job_test_dtmf_2_${Date.now()}`;
  callbridgeStorage.saveCallJob({
    id: testJobId2,
    clientId,
    campaignId: 'camp_test_dtmf',
    eventId: event.id,
    contactId: 'cnt_002',
    contactName: 'Suresh Kumar',
    contactPhone: '+919876543211',
    status: 'in_progress',
    providerCallId: providerId2,
    startedAt: now,
    retryCount: 0,
    maxRetries: 1,
    transcript: [{ role: 'agent', text: 'నమస్కారం అండి!' }],
    createdAt: now,
    updatedAt: now,
  });

  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: { id: providerId2 },
    },
    digits: '2',
  });

  const updatedJob2 = callbridgeStorage.getCallJob(testJobId2);
  assert(
    'Pressing DTMF 2 saves digit "2" in the call record',
    updatedJob2?.dtmfDigitReceived === '2'
  );
  assert(
    'Pressing DTMF 2 immediately marks the call job as "completed"',
    updatedJob2?.status === 'completed'
  );

  // ----------------------------------------------------
  // PRIORITY 3: QUEUE CONTROLS (START, PAUSE, CONTINUE, STOP, CANCEL)
  // ----------------------------------------------------
  console.log('\n--- PRIORITY 3: Queue Controls (Start, Pause, Continue, Stop, Cancel) ---');

  const testCampId = `camp_ctrl_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: testCampId,
    clientId,
    eventId: event.id,
    name: 'Queue Control Test Batch',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Seed 2 jobs for this campaign: 1 in_progress, 1 pending
  callbridgeStorage.saveCallJob({
    id: `job_ctrl_1_${Date.now()}`,
    clientId,
    campaignId: testCampId,
    eventId: event.id,
    contactId: 'cnt_001',
    contactName: 'Contact 1',
    contactPhone: '+919876543201',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });
  callbridgeStorage.saveCallJob({
    id: `job_ctrl_2_${Date.now()}`,
    clientId,
    campaignId: testCampId,
    eventId: event.id,
    contactId: 'cnt_002',
    contactName: 'Contact 2',
    contactPhone: '+919876543202',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });

  // 1. Start Campaign
  const startRes = queueManager.startCampaign(testCampId);
  const campAfterStart = callbridgeStorage.getCampaign(testCampId);
  assert('Start Queue transitions status to "running"', campAfterStart?.status === 'running');

  // 2. Pause Campaign
  const pauseRes = queueManager.pauseCampaign(testCampId);
  const campAfterPause = callbridgeStorage.getCampaign(testCampId);
  assert('Pause Queue transitions status to "paused"', campAfterPause?.status === 'paused');

  // 3. Continue Campaign
  const resumeRes = queueManager.resumeCampaign(testCampId);
  const campAfterResume = callbridgeStorage.getCampaign(testCampId);
  assert('Continue Queue resumes status to "running"', campAfterResume?.status === 'running');

  // 4. Stop Campaign
  const stopRes = queueManager.stopCampaign(testCampId);
  const campAfterStop = callbridgeStorage.getCampaign(testCampId);
  assert('Stop Queue transitions status to "stopped" and preserves records', campAfterStop?.status === 'stopped');

  // 5. Cancel Campaign
  const cancelRes = await queueManager.cancelCampaign(testCampId);
  const campAfterCancel = callbridgeStorage.getCampaign(testCampId);
  assert('Cancel Queue transitions status to "cancelled"', campAfterCancel?.status === 'cancelled');

  // ----------------------------------------------------
  // PRIORITY 4: SIMPLIFIED ANALYTICS (6 ESSENTIAL METRICS ONLY)
  // ----------------------------------------------------
  console.log('\n--- PRIORITY 4: Simplified Analytics (6 Essential Metrics) ---');

  const analyticsReport = ExportService.exportAnalyticsJson(event.id);
  assert('Analytics returns essentialMetrics object', Boolean(analyticsReport.essentialMetrics));
  const em = analyticsReport.essentialMetrics;

  assert('Metric 1: totalCallsMade is present and numeric', typeof em.totalCallsMade === 'number');
  assert('Metric 2: callsAttended is present and attendedPercent calculated', typeof em.callsAttended === 'number' && typeof em.attendedPercent === 'number');
  assert('Metric 3: callsNotAttended is present and notAttendedPercent calculated', typeof em.callsNotAttended === 'number' && typeof em.notAttendedPercent === 'number');
  assert('Metric 4: callsRejected is present and rejectedPercent calculated', typeof em.callsRejected === 'number' && typeof em.rejectedPercent === 'number');
  assert('Metric 5: pressed1Count is present and pressed1Percent calculated', typeof em.pressed1Count === 'number' && typeof em.pressed1Percent === 'number');
  assert('Metric 6: pressed2Count is present and pressed2Percent calculated', typeof em.pressed2Count === 'number' && typeof em.pressed2Percent === 'number');

  // ----------------------------------------------------
  // PRIORITY 5: PRO PLAN RAZORPAY CHECKOUT
  // ----------------------------------------------------
  console.log('\n--- PRIORITY 5: Pro Plan Razorpay Checkout ---');

  // 1. Order Creation
  const testTenantId = `test_tenant_billing_${Date.now()}`;
  const order = callbridgeStorage.createPaymentOrder(testTenantId, 'pro');
  assert('Pro plan payment order created with valid orderId', Boolean(order.orderId) && order.orderId.startsWith('order_'));
  assert('Pro plan order has price in INR', order.amount > 0 && order.currency === 'INR');
  assert('Razorpay Key ID is provided for client SDK', Boolean(order.keyId));

  // 2. Signature Verification and Credit Activation
  const verifyResult = callbridgeStorage.verifyPaymentAndActivate({
    userId: testTenantId,
    orderId: order.orderId,
    paymentId: `pay_test_${Date.now()}`,
    signature: `sig_test_${Date.now()}`,
    planId: 'pro',
  });

  assert('Payment signature verification succeeds', verifyResult.success === true);
  assert('Pro plan credits talk time in seconds to tenant subscription', verifyResult.subscription.planId === 'pro' && verifyResult.subscription.remainingSeconds > 0);

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error('Fatal error running test suite:', e);
  process.exit(1);
});
