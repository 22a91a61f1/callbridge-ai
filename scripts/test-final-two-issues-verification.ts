import { readFileSync } from 'fs';
import { callbridgeStorage, type ContactRecord } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runTwoIssuesVerification() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — ISSUE 1 & ISSUE 2 VERIFICATION (PROMPT 1 & PROMPT 2)');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] Test ${total}: ${testName}`);
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
      if (details) console.error('       Details:', details);
    }
  }

  // ===========================================================================
  // ISSUE 2 VERIFICATION: Remove Upcoming Contacts in Sequential Queue UI
  // ===========================================================================
  console.log('--- VERIFYING ISSUE 2: Upcoming Contacts UI Removal ---');
  const outboundQueueContent = readFileSync('src/components/OutboundQueueView.tsx', 'utf-8');

  assert(
    !outboundQueueContent.includes('Upcoming Contacts in Sequential Queue'),
    'Heading "Upcoming Contacts in Sequential Queue" is completely absent from OutboundQueueView'
  );
  assert(
    !outboundQueueContent.includes('No pending contacts in queue'),
    'Empty-state message "No pending contacts in queue" is completely absent from OutboundQueueView'
  );
  assert(
    outboundQueueContent.includes('Sequential Campaign Progress'),
    'Sequential Campaign Progress card remains fully intact'
  );
  assert(
    outboundQueueContent.includes('Active Calling') &&
    outboundQueueContent.includes('Finished Calls') &&
    outboundQueueContent.includes('Remaining Pending'),
    'Summary tiles (Active Calling, Finished Calls, Remaining Pending) remain present'
  );

  // ===========================================================================
  // ISSUE 1 & PROMPT 2: Trace one actual Vapi call ID through the full pipeline
  // Vapi ended event -> Webhook handler -> Correct campaign/call record -> Database update -> Analytics API response -> Frontend values
  // ===========================================================================
  console.log('\n--- VERIFYING ISSUE 1 & PROMPT 2: Full Telephony & Analytics Pipeline ---');

  const now = Date.now();
  const eventId = `test_live_evt_${now}`;
  const campaignId = `test_live_camp_${now}`;
  const clientId = 'client_001';
  const vapiCallUuid = `8c78a165-4200-4100-8500-${now.toString().slice(-12)}`;

  // 1. Setup real political campaign event with 1 contact
  callbridgeStorage.saveEvent({
    id: eventId,
    name: 'Election Campaign Verified 2026',
    type: 'political_campaign',
    language: 'te',
    config: {
      candidateName: 'Test Candidate',
      approvedScript: 'నమస్కారం! అభ్యర్థికి మద్దతు తెలపడానికి 1 నొక్కండి.',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate', spokenPrompt: { te: 'మద్దతు', hi: 'समर्थन', en: 'Support' } },
        { digit: '2', labelEn: 'Request Callback', spokenPrompt: { te: 'కాల్ బ్యాక్', hi: 'कॉल बैक', en: 'Callback' } },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const contacts: ContactRecord[] = [
    {
      id: `cnt_live_${now}`,
      userId: clientId,
      eventId,
      name: 'Ramesh Voter',
      phone: '+919876543210',
      originalPhone: '+919876543210',
      consentStatus: 'granted' as const,
      optOut: false,
      importSource: 'manual' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  callbridgeStorage.saveContactsBulk(contacts);

  // 2. Create Campaign with 1 contact
  callbridgeStorage.saveCampaign({
    id: campaignId,
    clientId,
    eventId,
    name: 'Single Call Sequential Verification',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 1,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const queuedJobs = queueManager.createCampaignJobs(campaignId, eventId, contacts.map((c) => c.id));
  assert(queuedJobs.length === 1, 'Exactly 1 job enqueued in queue manager');
  const liveJob = queuedJobs[0];

  // Intercept Vapi outbound call to link providerCallId with Vapi Call UUID
  const origCreateOutboundCall = VapiService.createOutboundCall;
  (VapiService as any).createOutboundCall = async (params: any) => {
    VapiService.registerTransientActiveCall(vapiCallUuid, {
      campaignId: params.campaignId,
      jobId: params.callId,
      eventId: params.eventId,
      phone: params.phoneNumber,
    });
    return {
      success: true,
      callId: params.callId,
      providerCallId: vapiCallUuid,
      status: 'calling',
    };
  };

  // 3. Start the campaign
  const startResult = queueManager.startCampaign(campaignId);
  assert(startResult.success === true, 'Campaign started successfully');

  // Check in-flight active state before terminal event
  const runningCamp = callbridgeStorage.getCampaign(campaignId);
  assert(runningCamp?.status === 'running', 'Campaign status is RUNNING during active call');
  assert(runningCamp?.activeCalls === 1, 'Active Calling is 1 during active call');
  assert(runningCamp?.completedCount === 0, 'Finished Calls is 0 before call terminates');
  assert(runningCamp?.pendingCount === 0, 'Remaining Pending is 0 while single call is on line');

  // 4. Trace Vapi Event 1: Call Answered ('in-progress')
  const inProgressWebhook = {
    message: {
      type: 'status-update',
      call: { id: vapiCallUuid, status: 'in-progress' },
      status: 'in-progress',
    },
  };
  const inProgRes = VapiService.handleWebhook(inProgressWebhook);
  assert(inProgRes.success === true, 'Call in-progress webhook processed successfully');

  // 5. Trace Vapi Event 2: Keypad 1 pressed ('conversation-update')
  const keypadWebhook = {
    message: {
      type: 'conversation-update',
      call: { id: vapiCallUuid, status: 'in-progress' },
      dtmf: '1',
    },
  };
  const kpRes = VapiService.handleWebhook(keypadWebhook);
  assert(kpRes.receivedDigit === '1', 'Keypad 1 recognized from Vapi payload');
  assert(kpRes.terminationTriggered === true, 'Keypad 1 triggered call termination sequence');

  // 6. Trace Vapi Event 3: Terminal Ended Event ('status-update' with 'ended')
  const endedWebhook = {
    message: {
      type: 'status-update',
      call: {
        id: vapiCallUuid,
        status: 'ended',
        endedReason: 'customer-ended-call',
        durationSeconds: 24,
      },
      status: 'ended',
    },
  };
  const endRes = VapiService.handleWebhook(endedWebhook);
  assert(endRes.isTerminal === true, 'Vapi status-update ended identified as terminal event');

  // 7. Trace Vapi Event 4: Duplicate end-of-call-report (Idempotency check)
  const reportWebhook = {
    message: {
      type: 'end-of-call-report',
      call: {
        id: vapiCallUuid,
        status: 'ended',
        endedReason: 'customer-ended-call',
        durationSeconds: 24,
      },
    },
  };
  const reportRes = VapiService.handleWebhook(reportWebhook);
  assert(reportRes.isTerminal === true, 'Duplicate end-of-call-report handled idempotently');

  // Restore createOutboundCall
  (VapiService as any).createOutboundCall = origCreateOutboundCall;

  // 8. Verify Campaign record in Database
  const finalCamp = callbridgeStorage.getCampaign(campaignId);
  console.log('\n--- VERIFYING DATABASE CAMPAIGN RECORD ---');
  console.log('Persisted Campaign Record:', {
    id: finalCamp?.id,
    status: finalCamp?.status,
    totalContacts: finalCamp?.totalContacts,
    activeCalls: finalCamp?.activeCalls,
    completedCount: finalCamp?.completedCount,
    processedCount: finalCamp?.processedCount,
    pendingCount: finalCamp?.pendingCount,
  });

  assert(finalCamp?.status === 'completed', 'Campaign status updated to COMPLETED');
  assert(finalCamp?.activeCalls === 0, 'Active Calling is 0');
  assert(finalCamp?.completedCount === 1, 'Finished Calls (completedCount) is 1');
  assert(finalCamp?.processedCount === 1, 'Finished Calls (processedCount) is 1');
  assert(finalCamp?.pendingCount === 0, 'Remaining Pending is 0');

  // 9. Verify Analytics Aggregates (ExportService API response)
  console.log('\n--- VERIFYING ANALYTICS API RESPONSE ---');
  const analytics = ExportService.exportAnalyticsJson(eventId, campaignId);
  const m = analytics.essentialMetrics;
  const pm = analytics.moduleSpecificMetrics.politicalCampaign;

  console.log('Essential Metrics:', m);
  console.log('Political Campaign Metrics:', pm);

  assert(m.callsInitiated === 1, 'Calls Initiated is 1');
  assert(m.finishedCalls === 1, 'Finished Calls is 1');
  assert(m.callsAttended === 1, 'Answered Calls (callsAttended) is 1');
  assert(m.attendedPercent === 100, 'Answered % is 100%');
  assert(m.notAttendedPercent === 0, 'Unanswered % is 0%');
  assert(m.failedOrBusyPercent === 0, 'Busy / Failed % is 0%');
  assert(m.pressed1Count === 1, 'Pressed 1 Count is 1');
  assert(m.pressed1Percent === 100, 'Pressed 1 % is 100% (Denominator: Answered Calls)');
  assert(m.pressed2Percent === 0, 'Pressed 2 % is 0%');

  // 10. Verify Page Refresh Simulation: reconcileCampaign + repeat fetch
  console.log('\n--- VERIFYING RECONCILIATION & PAGE REFRESH PERSISTENCE ---');
  const reconciledCamp = await queueManager.reconcileCampaign(campaignId);
  const refreshedAnalytics = ExportService.exportAnalyticsJson(eventId, campaignId);
  const rm = refreshedAnalytics.essentialMetrics;

  assert(reconciledCamp?.activeCalls === 0, 'After reconciliation: Active Calling remains 0');
  assert(reconciledCamp?.status === 'completed', 'After reconciliation: Campaign Status remains COMPLETED');
  assert(reconciledCamp?.completedCount === 1, 'After reconciliation: Finished Calls remains 1');
  assert(rm.finishedCalls === 1, 'After page refresh: Analytics Finished Calls remains 1');
  assert(rm.attendedPercent === 100, 'After page refresh: Analytics Answered % remains 100%');
  assert(rm.pressed1Percent === 100, 'After page refresh: Analytics Pressed 1 % remains 100%');

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('========================================================================\n');

  if (passed === total) {
    console.log('SUCCESS: All Issue 1 & Issue 2 verifications passed with 100% accuracy!');
  } else {
    process.exit(1);
  }
}

runTwoIssuesVerification().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
