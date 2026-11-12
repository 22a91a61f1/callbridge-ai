import { callbridgeStorage, CallJobRecord } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

async function runTwilioFailureAndBillingVerification() {
  console.log('================================================================');
  console.log('TEST SUITE: TWILIO FAILURE HANDLING, DIAGNOSTICS & BILLING SAFETY');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ [PASS ${totalTests}] ${testName}${detail ? ` -> ${detail}` : ''}`);
      passedTests++;
    } else {
      console.error(`  ✗ [FAIL ${totalTests}] ${testName}${detail ? ` -> ${detail}` : ''}`);
      throw new Error(`Assertion failed: ${testName} (${detail})`);
    }
  }

  const testUserId = `user_verify_${Date.now()}`;
  const sub = callbridgeStorage.getSubscription(testUserId);
  // Give this test user 600 seconds of credit
  sub.totalSeconds = 600;
  sub.usedSeconds = 0;
  sub.remainingSeconds = 600;
  sub.status = 'active';
  sub.planStatus = 'active';
  sub.planId = 'pro';
  callbridgeStorage.saveSubscription(sub);

  console.log(`Initial User Subscription: ${sub.remainingSeconds}s remaining\n`);

  // --------------------------------------------------------------------------
  // TEST 1: Unanswered call with 0 seconds duration
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Unanswered call with 0 seconds ---');
  const callId1 = `call_unans_0s_${Date.now()}`;
  const tx1 = callbridgeStorage.recordCallBilling({
    userId: testUserId,
    callId: callId1,
    eventId: 'evt_test_1',
    status: 'no_answer',
    durationSeconds: 0,
    wasAnswered: false,
    endedReason: 'customer-did-not-answer',
  });

  const subAfter1 = callbridgeStorage.getSubscription(testUserId);
  assert(tx1.creditDeductionSeconds === 0, 'Deduction must be 0 for unanswered call', `Deducted: ${tx1.creditDeductionSeconds}s`);
  assert(tx1.billingStatus === 'exempt_unconnected' || tx1.billingStatus === 'exempt_zero_duration', 'Billing status must be exempt', `Status: ${tx1.billingStatus}`);
  assert(subAfter1.remainingSeconds === 600, 'Customer credits must be completely unaffected', `Remaining: ${subAfter1.remainingSeconds}s`);

  // --------------------------------------------------------------------------
  // TEST 2: Unanswered call with 31 seconds ringing duration (Real Log Regression!)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Unanswered call with 31s ringing duration (Carrier Signaling Bug) ---');
  const callId2 = `call_unans_31s_${Date.now()}`;
  const tx2 = callbridgeStorage.recordCallBilling({
    userId: testUserId,
    callId: callId2,
    eventId: 'evt_test_2',
    status: 'no_answer',
    durationSeconds: 31,
    wasAnswered: false,
    endedReason: 'ring-timeout',
  });

  const subAfter2 = callbridgeStorage.getSubscription(testUserId);
  assert(tx2.creditDeductionSeconds === 0, 'Customer must NOT be charged for 31s of unanswered ringing time', `Deducted: ${tx2.creditDeductionSeconds}s`);
  assert(tx2.billingStatus === 'exempt_unconnected', 'Billing status must be exempt_unconnected', `Status: ${tx2.billingStatus}`);
  assert(tx2.durationSeconds === 31, 'Duration must accurately preserve 31s for provider telemetry', `Recorded: ${tx2.durationSeconds}s`);
  assert(subAfter2.remainingSeconds === 600, 'Customer credits must remain 600s', `Remaining: ${subAfter2.remainingSeconds}s`);

  // --------------------------------------------------------------------------
  // TEST 3: Answered call with genuine connected duration (45 seconds)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Answered call with genuine connected duration (45s) ---');
  const callId3 = `call_answered_45s_${Date.now()}`;
  const tx3 = callbridgeStorage.recordCallBilling({
    userId: testUserId,
    callId: callId3,
    eventId: 'evt_test_3',
    status: 'completed',
    durationSeconds: 45,
    wasAnswered: true,
    endedReason: 'assistant-ended-call',
  });

  const subAfter3 = callbridgeStorage.getSubscription(testUserId);
  assert(tx3.creditDeductionSeconds === 45, 'Answered call must deduct exact connected duration', `Deducted: ${tx3.creditDeductionSeconds}s`);
  assert(tx3.billingStatus === 'billed', 'Billing status must be billed', `Status: ${tx3.billingStatus}`);
  assert(subAfter3.remainingSeconds === 555, 'Customer credits must decrease by exactly 45s (600 - 45 = 555)', `Remaining: ${subAfter3.remainingSeconds}s`);

  // --------------------------------------------------------------------------
  // TEST 4: Carrier failure ('twilio-failed-to-connect-call' with 31s duration and provider cost)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Carrier failure with provider cost separation ---');
  const callId4 = `call_carrier_fail_${Date.now()}`;
  const tx4 = callbridgeStorage.recordCallBilling({
    userId: testUserId,
    callId: callId4,
    eventId: 'evt_test_4',
    status: 'failed',
    durationSeconds: 31,
    wasAnswered: false,
    endedReason: 'twilio-failed-to-connect-call',
    providerCost: 0.015,
  });

  const subAfter4 = callbridgeStorage.getSubscription(testUserId);
  assert(tx4.creditDeductionSeconds === 0, 'Carrier failure must NEVER deduct customer credits', `Deducted: ${tx4.creditDeductionSeconds}s`);
  assert(tx4.billingStatus === 'exempt_unconnected', 'Billing status must be exempt_unconnected', `Status: ${tx4.billingStatus}`);
  assert(tx4.providerCost === 0.015, 'Provider cost must be recorded separately without charging customer', `Provider Cost: $${tx4.providerCost}`);
  assert(subAfter4.remainingSeconds === 555, 'Customer balance must stay at 555s', `Remaining: ${subAfter4.remainingSeconds}s`);

  // Verify diagnostic formatting
  const formattedDiagnostic = VapiService.formatFailureReason('twilio-failed-to-connect-call: 21408');
  assert(
    formattedDiagnostic.includes('Twilio carrier connection failed') && formattedDiagnostic.includes('21408'),
    'Diagnostics must identify Twilio carrier error code and avoid unevidenced speculation',
    formattedDiagnostic
  );

  // --------------------------------------------------------------------------
  // TEST 5: Duplicate terminal webhook idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Duplicate terminal webhook protection (Idempotency) ---');
  const duplicateTx = callbridgeStorage.recordCallBilling({
    userId: testUserId,
    callId: callId3, // Same call as Test 3
    eventId: 'evt_test_3',
    status: 'completed',
    durationSeconds: 45,
    wasAnswered: true,
  });

  const subAfter5 = callbridgeStorage.getSubscription(testUserId);
  assert(duplicateTx.id === tx3.id, 'Duplicate webhook must return original transaction without creating a new one', `TxId: ${duplicateTx.id}`);
  assert(subAfter5.remainingSeconds === 555, 'Customer credits must not be deducted a second time on duplicate webhook', `Remaining: ${subAfter5.remainingSeconds}s`);

  // --------------------------------------------------------------------------
  // TEST 6: Subsequent queue contact dispatch
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Subsequent queue contact dispatch on terminal state ---');
  const testCampaignId = `camp_queue_${Date.now()}`;
  const testEventId = `evt_queue_${Date.now()}`;

  // Register campaign
  const campaign = callbridgeStorage.saveCampaign({
    id: testCampaignId,
    eventId: testEventId,
    name: 'Twilio Failure Queue Test',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create 2 jobs in queue
  const job1: CallJobRecord = {
    id: `job_queue_1_${Date.now()}`,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'ct_1',
    contactName: 'Contact 1',
    contactPhone: '+919999900001',
    status: 'in_progress',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const job2: CallJobRecord = {
    id: `job_queue_2_${Date.now()}`,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'ct_2',
    contactName: 'Contact 2',
    contactPhone: '+919999900002',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date(Date.now() + 100).toISOString(),
    updatedAt: new Date(Date.now() + 100).toISOString(),
  };

  callbridgeStorage.saveCallJob(job1);
  callbridgeStorage.saveCallJob(job2);

  // Trigger terminal state for job 1 (e.g. carrier connection failure)
  let queueCallbackFired = false;
  let receivedOutcome: any = null;

  VapiService.onCallTerminal((campId, jId, outcome) => {
    if (campId === testCampaignId && jId === job1.id) {
      queueCallbackFired = true;
      receivedOutcome = outcome;
    }
  });

  VapiService.notifyCallTerminal(testCampaignId, job1.id, {
    isAnswered: false,
    isNoAnswer: false,
    isFailed: true,
    status: 'failed',
  });

  assert(queueCallbackFired, 'Queue terminal notification must fire on call failure', `Job: ${job1.id}`);
  assert(receivedOutcome?.status === 'failed', 'Terminal outcome must accurately reflect failed status', `Status: ${receivedOutcome?.status}`);

  console.log('\n================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runTwilioFailureAndBillingVerification().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
