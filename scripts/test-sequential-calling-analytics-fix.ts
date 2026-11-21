import { callbridgeStorage, type ContactRecord } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runSequentialCallingAndAnalyticsVerification() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — SEQUENTIAL CALLING & ANALYTICS FIX VERIFICATION');
  console.log('================================================================\n');

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

  // Intercept VapiService.createOutboundCall to simulate telephony acceptance without throwing credential errors
  const originalCreateOutboundCall = VapiService.createOutboundCall;
  const dispatchedCalls: any[] = [];
  (VapiService as any).createOutboundCall = async (params: any) => {
    dispatchedCalls.push(params);
    const mockProviderCallId = `vapi_live_${params.callId}`;
    // Register active transient call so webhooks can immediately match this provider call ID
    VapiService.registerTransientActiveCall(mockProviderCallId, {
      campaignId: params.campaignId,
      jobId: params.callId,
      eventId: params.eventId,
      phone: params.phoneNumber,
    });
    return {
      success: true,
      callId: params.callId,
      providerCallId: mockProviderCallId,
      status: 'calling',
    };
  };

  try {
    // 1. SETUP TEST EVENT WITH TWO CONTACTS IN STRICT FIFO ORDER
    const eventId = `test_evt_seq_${Date.now()}`;
    const campaignId = `test_camp_seq_${Date.now()}`;
    const clientId = 'client_001';

    callbridgeStorage.saveEvent({
      id: eventId,
      name: 'Election Campaign 2026',
      type: 'political_campaign',
      language: 'te',
      config: {
        candidateName: 'Rishi Candidate',
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
        id: `cnt_seq_1_${Date.now()}`,
        userId: clientId,
        eventId,
        name: 'Voter Alpha',
        phone: '+919988776655',
        originalPhone: '+919988776655',
        consentStatus: 'granted' as const,
        optOut: false,
        importSource: 'manual' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `cnt_seq_2_${Date.now()}`,
        userId: clientId,
        eventId,
        name: 'Voter Beta',
        phone: '+919988776656',
        originalPhone: '+919988776656',
        consentStatus: 'granted' as const,
        optOut: false,
        importSource: 'manual' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    callbridgeStorage.saveContactsBulk(contacts);

    callbridgeStorage.saveCampaign({
      id: campaignId,
      clientId,
      eventId,
      name: 'Ward 12 Sequential Queue',
      status: 'draft',
      concurrencyLimit: 1,
      totalContacts: 2,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      answeredCount: 0,
      unansweredCount: 0,
      busyCount: 0,
      pendingCount: 2,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const jobs = queueManager.createCampaignJobs(campaignId, eventId, contacts.map((c) => c.id));
    assert(jobs.length === 2, 'Two jobs enqueued for the campaign in sequential order');
    assert(jobs[0].contactPhone === '+919988776655', 'First job is Voter Alpha (+919988776655)');
    assert(jobs[1].contactPhone === '+919988776656', 'Second job is Voter Beta (+919988776656)');

    // Verify initial analytics are zero
    let initialAnalytics = ExportService.exportAnalyticsJson(eventId, campaignId);
    assert(initialAnalytics.essentialMetrics.totalCallsMade === 0, 'Initial calls made is 0');
    assert(initialAnalytics.essentialMetrics.finishedCalls === 0, 'Initial finished calls is 0');
    assert(initialAnalytics.essentialMetrics.callsAttended === 0, 'Initial answered calls is 0');

    // TEST 1: Start campaign -> First number receives call
    const startRes = queueManager.startCampaign(campaignId);
    assert(startRes.success === true, 'QueueManager startCampaign succeeds');

    // Wait briefly for dispatch
    await new Promise((r) => setTimeout(r, 100));

    let campaignState = callbridgeStorage.getCampaign(campaignId);
    assert(campaignState?.status === 'running', 'Campaign state is running');
    assert(campaignState?.activeCalls === 1, 'Strictly 1 active call on telephony line');
    assert(Boolean(campaignState?.activeCallId), 'Active call ID is maintained in campaign state');

    const firstCallJobId = campaignState?.activeCallId!;
    const firstJob = callbridgeStorage.getCallJob(firstCallJobId);
    assert(firstJob?.contactPhone === '+919988776655', 'First queued contact (+919988776655) receives call first');

    const firstVapiCallId = firstJob?.providerCallId || `vapi_live_${firstCallJobId}`;

    // TEST 2: Call 1 answers with Keypad 1 and then ends
    // Step 2a: Send Keypad 1
    const keypad1Webhook = {
      message: {
        type: 'conversation-update',
        call: {
          id: firstVapiCallId,
          status: 'in-progress',
        },
        dtmf: '1',
      },
    };
    const kp1Res = VapiService.handleWebhook(keypad1Webhook);
    assert(kp1Res.receivedDigit === '1', 'Keypad 1 recognized');

    // Step 2b: Terminal ended webhook arrives from Vapi
    const call1EndedWebhook = {
      message: {
        type: 'status-update',
        call: {
          id: firstVapiCallId,
          status: 'ended',
          endedReason: 'customer-ended-call',
          durationSeconds: 28,
        },
        status: 'ended',
      },
    };

    const end1Res = VapiService.handleWebhook(call1EndedWebhook);
    assert(end1Res.isTerminal === true, 'Call 1 marks terminal on actual Vapi ended event');

    // Webhook route triggers onJobTerminal
    queueManager.onJobTerminal(campaignId, firstCallJobId, {
      isAnswered: true,
      status: 'completed',
    });

    // Verify Call 1 terminal metrics
    let analyticsAfterCall1 = ExportService.exportAnalyticsJson(eventId, campaignId);
    console.log('DEBUG_ANALYTICS_AFTER_CALL_1:', JSON.stringify(analyticsAfterCall1, null, 2));
    assert(analyticsAfterCall1.essentialMetrics.finishedCalls === 1, 'Finished Calls increased by 1 (now exactly 1)', { finishedCalls: analyticsAfterCall1.essentialMetrics.finishedCalls });
    assert(analyticsAfterCall1.essentialMetrics.callsAttended === 1, 'Calls Answered increased by 1 (now 1)');
    assert(analyticsAfterCall1.essentialMetrics.pressed1Count === 1, 'Pressed 1 Count is 1');
    assert(analyticsAfterCall1.essentialMetrics.pressed1Percent === 100, 'Pressed 1 Percent is 100%');

    // Wait 800ms for queueManager to advance automatically to contact 2
    await new Promise((r) => setTimeout(r, 800));

    campaignState = callbridgeStorage.getCampaign(campaignId);
    assert(campaignState?.status === 'running', 'Campaign is still running for pending contact');
    assert(campaignState?.activeCalls === 1, 'Call 2 automatically dispatched: strictly 1 active call');
    assert(campaignState?.activeCallId !== firstCallJobId, 'Active call moved to second contact');

    const secondCallJobId = campaignState?.activeCallId!;
    const secondJob = callbridgeStorage.getCallJob(secondCallJobId);
    assert(secondJob?.contactPhone === '+919988776656', 'Second contact (+919988776656) received the next call automatically');

    const secondVapiCallId = secondJob?.providerCallId || `vapi_live_${secondCallJobId}`;

    // Duplicate webhook delivery test: duplicate status-update should not double-count or double-dispatch
    const duplicateEndWebhook = {
      message: {
        type: 'status-update',
        call: { id: firstVapiCallId, status: 'ended' },
      },
    };
    VapiService.handleWebhook(duplicateEndWebhook);
    queueManager.onJobTerminal(campaignId, firstCallJobId, { isAnswered: true, status: 'completed' });

    analyticsAfterCall1 = ExportService.exportAnalyticsJson(eventId, campaignId);
    assert(analyticsAfterCall1.essentialMetrics.finishedCalls === 1, 'Duplicate webhook does not increment Finished Calls past 1');

    // TEST 3: End Call 2 (No Answer)
    const call2EndedWebhook = {
      message: {
        type: 'status-update',
        call: {
          id: secondVapiCallId,
          status: 'ended',
          endedReason: 'no-answer',
          durationSeconds: 0,
        },
        status: 'ended',
      },
    };
    const end2Res = VapiService.handleWebhook(call2EndedWebhook);
    assert(end2Res.isTerminal === true, 'Call 2 marks terminal on actual Vapi ended event');

    queueManager.onJobTerminal(campaignId, secondCallJobId, {
      isAnswered: false,
      isNoAnswer: true,
      status: 'no_answer',
    });

    // Verify Campaign and Analytics after both calls reach terminal state
    const finalCampaign = callbridgeStorage.getCampaign(campaignId);
    assert(finalCampaign?.status === 'completed', 'Campaign marked as completed after both calls reach terminal state');
    assert(finalCampaign?.activeCalls === 0, 'Active calls cleared to 0');
    assert(finalCampaign?.activeCallId === null, 'Active call ID cleared to null');

    const finalAnalytics = ExportService.exportAnalyticsJson(eventId, campaignId);
    assert(finalAnalytics.essentialMetrics.finishedCalls === 2, 'Finished Calls increased to exactly 2', { finishedCalls: finalAnalytics.essentialMetrics.finishedCalls });
    assert(finalAnalytics.essentialMetrics.callsAttended === 1, 'Answered Calls remains 1');
    assert(finalAnalytics.essentialMetrics.callsNotAttended === 1, 'Unanswered Calls is 1');
    assert(finalAnalytics.essentialMetrics.attendedPercent === 50, 'Answered percentage is 50%');

    // TEST 4: Persistence across restart / fresh load
    const reloadedAnalytics = ExportService.exportAnalyticsJson(eventId, campaignId);
    assert(reloadedAnalytics.essentialMetrics.finishedCalls === 2, 'Reloaded analytics retains Finished Calls = 2');
    assert(reloadedAnalytics.essentialMetrics.callsAttended === 1, 'Reloaded analytics retains Answered Calls = 1');
    assert(reloadedAnalytics.essentialMetrics.pressed1Count === 1, 'Reloaded analytics retains Keypad 1 count = 1');

    console.log(`\nAll tests passed: ${passed}/${total}`);
  } finally {
    (VapiService as any).createOutboundCall = originalCreateOutboundCall;
  }
}

runSequentialCallingAndAnalyticsVerification().catch(console.error);
