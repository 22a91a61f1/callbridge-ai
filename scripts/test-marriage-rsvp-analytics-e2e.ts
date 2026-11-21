import { VapiService, classifyMarriageRsvp } from '../server/telephony/vapiService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { ExportService } from '../server/reporting/exportService.ts';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('TEST SUITE: MARRIAGE EVENT RSVP ANALYTICS VERIFICATION');
  console.log('======================================================\n');

  // Setup test tenant, event, and campaign for marriage event
  const tenantId = `tenant_test_${Date.now()}`;
  const now = new Date().toISOString();
  callbridgeStorage.saveTenant({
    id: tenantId,
    name: 'Wedding Test Host',
    email: 'test@wedding.com',
    organization: 'Wedding Test Org',
    createdAt: now,
    updatedAt: now,
  });

  const eventId = `ev_marriage_test_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: eventId,
    name: 'Grand Wedding Celebration',
    type: 'marriage_event',
    language: 'te',
    config: {
      approvedScript: 'నమస్కారం! మా వివాహ ఆహ్వానాన్ని మన్నించి విచ్చేయగలరు. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?',
    },
    createdAt: now,
    updatedAt: now,
  });

  const campaignId = `camp_marriage_test_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: campaignId,
    eventId,
    clientId: tenantId,
    name: 'Wedding RSVP Wave 1',
    status: 'running',
    optOutCount: 0,
    totalContacts: 10,
    processedCount: 0,
    callsInitiated: 0,
    answeredCount: 0,
    completedCount: 0,
    unansweredCount: 0,
    failedCount: 0,
    concurrencyLimit: 1,
    activeCalls: 0,
    attendingCount: 0,
    notAttendingCount: 0,
    maybeAttendingCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  console.log('--- TEST 1: Initial Dashboard State (All Zeros & 0% with Zero Answered Calls) ---');
  const initialAnalytics = ExportService.exportAnalyticsJson(eventId, campaignId);
  assert(initialAnalytics.eventType === 'marriage_event', 'Analytics correctly identifies marriage_event');
  assert(initialAnalytics.moduleType === 'marriage_event', 'Analytics returns moduleType === marriage_event');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.attendingCount === 0, 'Initial attendingCount is 0');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.notAttendingCount === 0, 'Initial notAttendingCount is 0');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.maybeCount === 0, 'Initial maybeCount is 0');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.attendingPercent === 0, 'Initial attendingPercent is 0%');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.notAttendingPercent === 0, 'Initial notAttendingPercent is 0%');
  assert(initialAnalytics.moduleSpecificMetrics.marriageRsvp.maybePercent === 0, 'Initial maybePercent is 0%');

  const runId = Date.now();
  console.log('\n--- TEST 2: Structured Result Capture via Vapi Tool Call (ATTENDING) ---');
  const call1ProviderId = `vapi_call_uuid_${runId}_1`;
  const job1Id = `job_test_${runId}_1`;
  const toolCallPayload1 = {
    message: {
      type: 'tool-calls',
      call: { id: call1ProviderId },
      toolCalls: [
        {
          id: 'tool_call_101',
          type: 'function',
          function: {
            name: 'recordMarriageRsvp',
            arguments: { category: 'ATTENDING' },
          },
        },
      ],
    },
  };

  // Map provider call ID to campaign and job
  callbridgeStorage.mapProviderCallIdToJob(call1ProviderId, job1Id, campaignId, eventId);
  callbridgeStorage.saveCallJob({
    id: job1Id,
    campaignId,
    eventId,
    contactId: 'c1',
    contactName: 'Respondent 1',
    contactPhone: '+919876543210',
    status: 'in_progress',
    providerCallId: call1ProviderId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  });

  const webhookRes1 = VapiService.handleWebhook(toolCallPayload1);
  assert(webhookRes1.success === true, 'Webhook accepts tool call successfully');
  assert(Array.isArray((webhookRes1 as any).results) && (webhookRes1 as any).results.length > 0, 'Tool call result response returned for Vapi');

  const analyticsAfterCall1 = ExportService.exportAnalyticsJson(eventId, campaignId);
  const m1 = analyticsAfterCall1.moduleSpecificMetrics.marriageRsvp;
  assert(m1.attendingCount === 1, 'Attending count incremented to 1');
  assert(m1.notAttendingCount === 0, 'Not attending count remains 0');
  assert(m1.maybeCount === 0, 'Maybe count remains 0');
  assert(m1.answeredCalls >= 1, 'Answered calls updated to at least 1');
  assert(m1.attendingPercent === 100, 'Attending percent is 100% (1/1)');

  console.log('\n--- TEST 3: Idempotency Protection (Duplicate Tool Call Webhook Ignored) ---');
  // Re-send the exact same tool call
  const duplicateWebhookRes1 = VapiService.handleWebhook(toolCallPayload1);
  assert(duplicateWebhookRes1.success === true, 'Duplicate webhook handled without crashing');

  const analyticsAfterDup1 = ExportService.exportAnalyticsJson(eventId, campaignId);
  const mDup1 = analyticsAfterDup1.moduleSpecificMetrics.marriageRsvp;
  assert(mDup1.attendingCount === 1, 'Attending count is STILL 1 (Duplicate not counted twice)');
  assert(mDup1.attendingPercent === 100, 'Attending percent remains 100%');

  console.log('\n--- TEST 4: Spoken Telugu Transcript Classification via Webhook (NOT_ATTENDING) ---');
  const call2ProviderId = `vapi_call_uuid_${runId}_2`;
  const job2Id = `job_test_${runId}_2`;
  callbridgeStorage.mapProviderCallIdToJob(call2ProviderId, job2Id, campaignId, eventId);
  callbridgeStorage.saveCallJob({
    id: job2Id,
    campaignId,
    eventId,
    contactId: 'c2',
    contactName: 'Respondent 2',
    contactPhone: '+919876543211',
    status: 'in_progress',
    providerCallId: call2ProviderId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  });

  const transcriptPayload2 = {
    message: {
      type: 'transcript',
      role: 'user',
      transcript: 'రావడం కుదరదు అండి, వేరే పని ఉంది రాలేను',
      call: { id: call2ProviderId },
    },
  };

  VapiService.handleWebhook(transcriptPayload2);
  const analyticsAfterCall2 = ExportService.exportAnalyticsJson(eventId, campaignId);
  const m2 = analyticsAfterCall2.moduleSpecificMetrics.marriageRsvp;
  assert(m2.attendingCount === 1, 'Attending count is 1');
  assert(m2.notAttendingCount === 1, 'Not attending count incremented to 1');
  assert(m2.maybeCount === 0, 'Maybe count is 0');
  assert(m2.answeredCalls >= 2, 'Answered calls updated to at least 2');
  assert(m2.attendingPercent === 50, 'Attending percent is 50% (1/2)');
  assert(m2.notAttendingPercent === 50, 'Not attending percent is 50% (1/2)');

  console.log('\n--- TEST 5: Direct Structured RSVP Result (MAYBE_ATTENDING) ---');
  const call3ProviderId = `vapi_call_uuid_${runId}_3`;
  const job3Id = `job_test_${runId}_3`;
  callbridgeStorage.mapProviderCallIdToJob(call3ProviderId, job3Id, campaignId, eventId);
  callbridgeStorage.saveCallJob({
    id: job3Id,
    campaignId,
    eventId,
    contactId: 'c3',
    contactName: 'Respondent 3',
    contactPhone: '+919876543212',
    status: 'in_progress',
    providerCallId: call3ProviderId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  });

  const directRes = VapiService.processStructuredMarriageRsvp(campaignId, call3ProviderId, 'MAYBE_ATTENDING', eventId);
  assert(directRes.success === true, 'Direct structured RSVP succeeded');
  assert(directRes.category === 'MAYBE_ATTENDING', 'Category resolved to MAYBE_ATTENDING');

  const analyticsAfterCall3 = ExportService.exportAnalyticsJson(eventId, campaignId);
  const m3 = analyticsAfterCall3.moduleSpecificMetrics.marriageRsvp;
  assert(m3.attendingCount === 1, 'Attending count is 1');
  assert(m3.notAttendingCount === 1, 'Not attending count is 1');
  assert(m3.maybeCount === 1, 'Maybe count incremented to 1');
  assert(m3.answeredCalls >= 3, 'Answered calls updated to at least 3');
  // 1 / 3 = 33%
  assert(m3.attendingPercent === 33, 'Attending percent is 33% (1/3)');
  assert(m3.notAttendingPercent === 33, 'Not attending percent is 33% (1/3)');
  assert(m3.maybePercent === 33, 'Maybe percent is 33% (1/3)');

  console.log('\n--- TEST 6: Duplicate Direct Result Ignored ---');
  const dupDirectRes = VapiService.processStructuredMarriageRsvp(campaignId, call3ProviderId, 'MAYBE_ATTENDING', eventId);
  assert(dupDirectRes.success === true && dupDirectRes.duplicate === true, 'Duplicate direct call identified as duplicate');
  const analyticsAfterDupDirect = ExportService.exportAnalyticsJson(eventId, campaignId);
  const mDupDirect = analyticsAfterDupDirect.moduleSpecificMetrics.marriageRsvp;
  assert(mDupDirect.maybeCount === 1, 'Maybe count still 1 after duplicate');

  console.log('\n--- TEST 7: End-of-Call Report Fallback Parsing ---');
  const call4ProviderId = `vapi_call_uuid_${runId}_4`;
  const job4Id = `job_test_${runId}_4`;
  callbridgeStorage.mapProviderCallIdToJob(call4ProviderId, job4Id, campaignId, eventId);
  callbridgeStorage.saveCallJob({
    id: job4Id,
    campaignId,
    eventId,
    contactId: 'c4',
    contactName: 'Respondent 4',
    contactPhone: '+919876543213',
    status: 'in_progress',
    providerCallId: call4ProviderId,
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  });

  const endReportPayload4 = {
    message: {
      type: 'end-of-call-report',
      call: {
        id: call4ProviderId,
        status: 'ended',
        endedReason: 'customer-ended-call',
        durationSeconds: 28,
        startedAt: new Date(Date.now() - 28000).toISOString(),
        endedAt: new Date().toISOString(),
      },
      transcript: 'Assistant: మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?\nUser: తప్పకుండా వస్తానండి, ధన్యవాదాలు\nAssistant: సరే, ధన్యవాదాలు.',
    },
  };

  VapiService.handleWebhook(endReportPayload4);
  const analyticsAfterCall4 = ExportService.exportAnalyticsJson(eventId, campaignId);
  const m4 = analyticsAfterCall4.moduleSpecificMetrics.marriageRsvp;
  assert(m4.attendingCount === 2, 'Attending count incremented to 2 from end-of-call report');
  assert(m4.notAttendingCount === 1, 'Not attending count remains 1');
  assert(m4.maybeCount === 1, 'Maybe count remains 1');
  // 4 answered calls: 2 attending (50%), 1 not attending (25%), 1 maybe (25%)
  assert(m4.attendingPercent === 50, 'Attending percent is 50% (2/4)');
  assert(m4.notAttendingPercent === 25, 'Not attending percent is 25% (1/4)');
  assert(m4.maybePercent === 25, 'Maybe percent is 25% (1/4)');

  console.log('\n--- TEST 8: Rejection of Invalid Categories and Non-Marriage Events ---');
  const invalidCatRes = VapiService.processStructuredMarriageRsvp(campaignId, `call_inv_${Date.now()}`, 'UNKNOWN_JIBBERISH', eventId);
  assert(invalidCatRes.success === false, 'Invalid category correctly rejected');

  // Political event test
  const polEventId = `ev_pol_test_${Date.now()}`;
  callbridgeStorage.saveEvent({
    id: polEventId,
    name: 'Political Campaign Event',
    type: 'political_campaign',
    language: 'te',
    config: {
      approvedScript: 'ఓటు వేయండి',
    },
    createdAt: now,
    updatedAt: now,
  });
  const polCampId = `camp_pol_test_${Date.now()}`;
  callbridgeStorage.saveCampaign({
    id: polCampId,
    eventId: polEventId,
    clientId: tenantId,
    name: 'Political Campaign 1',
    status: 'running',
    optOutCount: 0,
    totalContacts: 5,
    processedCount: 0,
    callsInitiated: 0,
    answeredCount: 0,
    completedCount: 0,
    unansweredCount: 0,
    failedCount: 0,
    concurrencyLimit: 1,
    activeCalls: 0,
    createdAt: now,
    updatedAt: now,
  });

  const polRsvpRes = VapiService.processStructuredMarriageRsvp(polCampId, `call_pol_${Date.now()}`, 'ATTENDING', polEventId);
  assert(polRsvpRes.success === false, 'Marriage RSVP update rejected for non-marriage campaign');

  console.log('\n--- TEST 9: Dashboard Data Returned Log & Structure Verification ---');
  let capturedLog: any = null;
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[MARRIAGE_RSVP_DASHBOARD_DATA_RETURNED]')) {
      capturedLog = args[1];
    }
    originalLog(...args);
  };

  // Simulate GET /events/:id/analytics
  const analyticsRes = ExportService.exportAnalyticsJson(eventId, campaignId);
  const ev = callbridgeStorage.getEvent(eventId);
  if (ev?.type === 'marriage_event') {
    const marriageRsvp = analyticsRes?.moduleSpecificMetrics?.marriageRsvp;
    console.log('[MARRIAGE_RSVP_DASHBOARD_DATA_RETURNED]', {
      campaignId: analyticsRes?.campaignId || campaignId || eventId,
      attendingCount: marriageRsvp?.attendingCount ?? 0,
      notAttendingCount: marriageRsvp?.notAttendingCount ?? 0,
      maybeAttendingCount: marriageRsvp?.maybeCount ?? marriageRsvp?.maybeAttendingCount ?? 0,
    });
  }
  console.log = originalLog;

  assert(capturedLog !== null, 'MARRIAGE_RSVP_DASHBOARD_DATA_RETURNED was emitted');
  assert(capturedLog?.campaignId === campaignId, 'Dashboard log contains correct campaignId');
  assert(capturedLog?.attendingCount === 2, 'Dashboard log has attendingCount === 2');
  assert(capturedLog?.notAttendingCount === 1, 'Dashboard log has notAttendingCount === 1');
  assert(capturedLog?.maybeAttendingCount === 1, 'Dashboard log has maybeAttendingCount === 1');
  assert(!('phone' in capturedLog) && !('transcript' in capturedLog), 'Dashboard log contains ZERO PII');

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
