import { VapiService, isValidUuid } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function testCorrelationAndWebhook() {
  console.log('========================================================================');
  console.log('CALL ID CORRELATION, UUIDv7 & WEBHOOK TRACING VERIFICATION');
  console.log('========================================================================\n');

  // TEST 1: UUIDv7 vs UUIDv4 vs Non-UUID
  console.log('--- 1. Testing UUID Regex & UUIDv7 Support ---');
  const userProviderCallId = '01a1a6fd-c45f-7000-8cc3-13c762bd7d8d'; // Exact UUID from user log
  const legacyUuidV4 = '8c78a165-4200-4100-8500-793800614067';
  const internalJobId = 'job_1793803008627_0_hnqw';

  if (!isValidUuid(userProviderCallId)) {
    throw new Error(`FAIL: User provider call ID "${userProviderCallId}" must be recognized as valid UUID!`);
  }
  console.log('[PASS] Test 1.1: UUIDv7 (from user log) correctly recognized by isValidUuid');

  if (!isValidUuid(legacyUuidV4)) {
    throw new Error('FAIL: Standard UUIDv4 failed validation');
  }
  console.log('[PASS] Test 1.2: Standard UUIDv4 recognized by isValidUuid');

  if (isValidUuid(internalJobId)) {
    throw new Error('FAIL: internalJobId should NOT pass isValidUuid');
  }
  console.log('[PASS] Test 1.3: Internal job ID correctly rejected as non-UUID');

  // TEST 2: Bidirectional Call ID Mapping
  console.log('\n--- 2. Testing Bidirectional Call ID Mapping ---');
  const testEventId = `event_test_corr_${Date.now()}`;
  const testCampId = `camp_test_corr_${Date.now()}`;
  const testJobId = 'job_1793803008627_0_hnqw';
  const testProviderCallId = '01a1a6fd-c45f-7000-8cc3-13c762bd7d8d';

  // Seed event & campaign
  callbridgeStorage.saveEvent({
    id: testEventId,
    type: 'political_campaign',
    name: 'Correlation Test Event',
    language: 'te',
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const campRecord = callbridgeStorage.saveCampaign({
    id: testCampId,
    eventId: testEventId,
    name: 'Correlation Campaign',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 1,
    callsInitiated: 0,
    activeCalls: 1,
    activeCallId: testJobId,
    activeCallProviderId: testProviderCallId,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    pendingCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Save the job record
  callbridgeStorage.saveCallJob({
    id: testJobId,
    campaignId: testCampId,
    eventId: testEventId,
    contactId: 'contact_corr_1',
    contactName: 'Test Voter',
    contactPhone: '+919876543210',
    status: 'calling',
    providerCallId: testProviderCallId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Register mappings
  VapiService.mapProviderCallIdToJob(testProviderCallId, testJobId, testCampId, testEventId);
  callbridgeStorage.mapProviderCallIdToJob(testProviderCallId, testJobId, testCampId, testEventId);

  // Check lookup
  const lookedUpJob = callbridgeStorage.getCallJobByProviderId(testProviderCallId);
  if (!lookedUpJob || lookedUpJob.id !== testJobId) {
    throw new Error(`FAIL: getCallJobByProviderId failed to find internal job: ${lookedUpJob?.id}`);
  }
  console.log('[PASS] Test 2.1: getCallJobByProviderId successfully resolves internal job from Vapi providerCallId');

  const mappedJobId = VapiService.getJobIdByProviderCallId(testProviderCallId);
  if (mappedJobId !== testJobId) {
    throw new Error(`FAIL: VapiService.getJobIdByProviderCallId expected ${testJobId}, got ${mappedJobId}`);
  }
  console.log('[PASS] Test 2.2: VapiService.getJobIdByProviderCallId resolves correctly');

  // TEST 3: Webhook Event Delivery with Vapi Call ID & DTMF Keypad
  console.log('\n--- 3. Testing Webhook Dispatch with Provider Call ID & DTMF ---');
  // First, in-progress webhook
  const inProgressPayload = {
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: {
        id: testProviderCallId,
        status: 'in-progress',
      },
    },
  };
  const inProgResult = VapiService.handleWebhook(inProgressPayload);
  if (!inProgResult.success) throw new Error('FAIL: in-progress webhook failed');
  console.log('[PASS] Test 3.1: in-progress webhook processed for providerCallId');

  // Keypad 1 DTMF event
  const dtmfPayload = {
    message: {
      type: 'conversation-update',
      call: {
        id: testProviderCallId,
      },
      digits: '1',
    },
  };
  const dtmfResult = VapiService.handleWebhook(dtmfPayload);
  if (!dtmfResult.success) throw new Error('FAIL: dtmf webhook failed');
  console.log('[PASS] Test 3.2: Keypad 1 DTMF registered');

  // Terminal webhook: status-update ended
  const endedPayload = {
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'customer-ended-call',
      durationSeconds: 28,
      call: {
        id: testProviderCallId,
        status: 'ended',
        endedReason: 'customer-ended-call',
        duration: 28,
      },
    },
  };
  const termResult = VapiService.handleWebhook(endedPayload);
  if (!termResult.isTerminal) throw new Error('FAIL: status-update ended must return isTerminal: true');
  console.log('[PASS] Test 3.3: status-update ended successfully triggered terminal processing');

  // Deliver to QueueManager
  queueManager.onJobTerminal(testCampId, testJobId, {
    isAnswered: true,
    status: 'completed',
  });
  console.log('[PASS] Test 3.4: onJobTerminal dispatched to QueueManager');

  // Duplicate end-of-call-report idempotency check
  const eocrPayload = {
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      durationSeconds: 28,
      call: {
        id: testProviderCallId,
        status: 'ended',
      },
    },
  };
  const eocrResult = VapiService.handleWebhook(eocrPayload);
  if (!eocrResult.isTerminal) throw new Error('FAIL: eocrResult must return isTerminal');
  console.log('[PASS] Test 3.5: Duplicate end-of-call-report handled idempotently');

  // TEST 4: Database Persistence & Campaign Counters
  console.log('\n--- 4. Verifying Database Campaign Record ---');
  const updatedCampaign = callbridgeStorage.getCampaign(testCampId);
  console.log('Campaign state after terminal processing:', {
    id: updatedCampaign?.id,
    status: updatedCampaign?.status,
    activeCalls: updatedCampaign?.activeCalls,
    activeCallId: updatedCampaign?.activeCallId,
    activeCallProviderId: updatedCampaign?.activeCallProviderId,
    completedCount: updatedCampaign?.completedCount,
    processedCount: updatedCampaign?.processedCount,
    answeredCount: updatedCampaign?.answeredCount,
    pendingCount: updatedCampaign?.pendingCount,
  });

  if (updatedCampaign?.status !== 'completed') {
    throw new Error(`FAIL: campaign status expected 'completed', got ${updatedCampaign?.status}`);
  }
  console.log('[PASS] Test 4.1: Campaign status is COMPLETED');

  if (updatedCampaign.activeCalls !== 0) {
    throw new Error(`FAIL: activeCalls expected 0, got ${updatedCampaign.activeCalls}`);
  }
  console.log('[PASS] Test 4.2: Active Calling is 0');

  if (updatedCampaign.activeCallId !== null) {
    throw new Error(`FAIL: activeCallId expected null, got ${updatedCampaign.activeCallId}`);
  }
  console.log('[PASS] Test 4.3: activeCallId cleared to null');

  if (updatedCampaign.completedCount !== 1) {
    throw new Error(`FAIL: completedCount expected 1, got ${updatedCampaign.completedCount}`);
  }
  console.log('[PASS] Test 4.4: Finished Calls (completedCount) is 1');

  if (updatedCampaign.processedCount !== 1) {
    throw new Error(`FAIL: processedCount expected 1, got ${updatedCampaign.processedCount}`);
  }
  console.log('[PASS] Test 4.5: Finished Calls (processedCount) is 1');

  // TEST 5: Analytics API Verification
  console.log('\n--- 5. Verifying Analytics API Output ---');
  const analyticsRes = ExportService.exportAnalyticsJson(testEventId, testCampId);
  const metrics = analyticsRes.essentialMetrics;
  const polMetrics = analyticsRes.politicalCampaign;
  console.log('Analytics essentialMetrics:', metrics);
  console.log('Analytics politicalCampaign:', polMetrics);

  if (metrics.callsInitiated !== 1) {
    throw new Error(`FAIL: callsInitiated expected 1, got ${metrics.callsInitiated}`);
  }
  console.log('[PASS] Test 5.1: Analytics Calls Initiated is 1');

  if (metrics.finishedCalls !== 1) {
    throw new Error(`FAIL: finishedCalls expected 1, got ${metrics.finishedCalls}`);
  }
  console.log('[PASS] Test 5.2: Analytics Finished Calls is 1');

  if (metrics.callsAttended !== 1) {
    throw new Error(`FAIL: callsAttended expected 1, got ${metrics.callsAttended}`);
  }
  console.log('[PASS] Test 5.3: Analytics Answered Calls is 1');

  if (metrics.attendedPercent !== 100) {
    throw new Error(`FAIL: attendedPercent expected 100, got ${metrics.attendedPercent}`);
  }
  console.log('[PASS] Test 5.4: Analytics Answered % is 100%');

  if (polMetrics.pressed1Count !== 1) {
    throw new Error(`FAIL: pressed1Count expected 1, got ${polMetrics.pressed1Count}`);
  }
  console.log('[PASS] Test 5.5: Keypad 1 Count is 1');

  if (polMetrics.pressed1Percent !== 100) {
    throw new Error(`FAIL: pressed1Percent expected 100, got ${polMetrics.pressed1Percent}`);
  }
  console.log('[PASS] Test 5.6: Keypad 1 % is 100%');

  if (polMetrics.pressed2Percent !== 0) {
    throw new Error(`FAIL: pressed2Percent expected 0, got ${polMetrics.pressed2Percent}`);
  }
  console.log('[PASS] Test 5.7: Keypad 2 % is 0%');

  // TEST 6: Reconciliation & GET /analytics Idempotency
  console.log('\n--- 6. Verifying Reconciliation Idempotency ---');
  await queueManager.reconcileCampaign(testCampId);
  const reconCampaign = callbridgeStorage.getCampaign(testCampId);
  if (reconCampaign?.status !== 'completed' || reconCampaign?.activeCalls !== 0 || reconCampaign?.completedCount !== 1) {
    throw new Error('FAIL: Reconcile altered terminal campaign state');
  }
  console.log('[PASS] Test 6.1: Reconcile safely preserved completed campaign state');

  console.log('\n========================================================================');
  console.log('ALL TESTS PASSED! CALL ID CORRELATION & UUIDv7 RESOLVED 100% ACCURATELY');
  console.log('========================================================================\n');
}

testCorrelationAndWebhook().catch((err) => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});
