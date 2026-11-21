import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { VapiService } from '../server/telephony/vapiService';
import { ExportService } from '../server/reporting/exportService';

async function runTest() {
  console.log('=== RUNNING CALLBRIDGE ANALYTICS TWO-CONTACT BUG FIX TEST ===');

  const testEventId = `test_evt_analytics_${Date.now()}`;
  const testCampaignId = `test_camp_analytics_${Date.now()}`;

  // 1. Setup Political Campaign Event & Campaign
  callbridgeStorage.saveEvent({
    id: testEventId,
    name: 'Election Outreach 2026',
    type: 'political_campaign',
    language: 'te',
    selectedVoiceProfileId: 'Txde0pZ5tVhXE6HUspcf',
    config: {
      approvedScript: 'నమస్కారం! అభ్యర్థికి మద్దతు కోసం 1 నొక్కండి, మరిన్ని వివరాలకు 2 నొక్కండి.',
      dtmfOptions: [
        { digit: '1', labelEn: 'Support Candidate' },
        { digit: '2', labelEn: 'Request Information' },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  callbridgeStorage.saveCampaign({
    id: testCampaignId,
    eventId: testEventId,
    name: 'Voter Calling Queue',
    status: 'running',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    callsInitiated: 0,
    answeredCount: 0,
    keypad1Count: 0,
    keypad2Count: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Initial analytics check: must be 0
  const initialAnalytics = ExportService.exportAnalyticsJson(testEventId, testCampaignId);
  console.log('Initial essentialMetrics:', initialAnalytics.essentialMetrics);
  if (initialAnalytics.essentialMetrics.callsInitiated !== 0 || initialAnalytics.essentialMetrics.finishedCalls !== 0) {
    throw new Error('Initial metrics must be 0');
  }

  // --- CALL 1: Contact 1 ---
  const call1JobId = `job_${Date.now()}_0_abc`;
  const call1VapiId = `vapi_call_uuid_001_${Date.now()}`;

  // Record call initiated
  callbridgeStorage.recordCallInitiated(testEventId, call1JobId, testCampaignId);
  VapiService.registerTransientActiveCall(call1VapiId, {
    campaignId: testCampaignId,
    jobId: call1JobId,
    eventId: testEventId,
    phone: '+919876543210',
  });

  // Vapi sends webhook: status-update in-progress
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: { id: call1VapiId, status: 'in-progress', startedAt: new Date().toISOString() },
    },
  });

  // Respondent presses 1
  VapiService.handleWebhook({
    message: {
      type: 'conversation-update',
      call: { id: call1VapiId },
      artifact: {
        messages: [
          { role: 'assistant', message: 'దయచేసి మీ మద్దతు కోసం 1 నొక్కండి' },
          { role: 'user', message: '1' },
        ],
      },
    },
  });

  // Vapi sends webhook: status-update ended (with 0 duration as typical for status-update)
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'customer-ended-call',
      call: { id: call1VapiId, status: 'ended' },
    },
  });

  // Vapi sends webhook: end-of-call-report (with duration 15s)
  VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      durationSeconds: 15,
      call: { id: call1VapiId, status: 'ended', duration: 15 },
      artifact: {
        messages: [
          { role: 'assistant', message: 'నమస్కారం!' },
          { role: 'user', message: '1' },
        ],
      },
    },
  });

  // Duplicate webhook delivery from Vapi (must not increment counters again)
  VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      durationSeconds: 15,
      call: { id: call1VapiId, status: 'ended', duration: 15 },
    },
  });

  // Check analytics after Call 1
  const aggObj = callbridgeStorage.getAggregateAnalytics(testEventId);
  const campAggObj = callbridgeStorage.getAggregateAnalytics(testCampaignId);
  const campObj = callbridgeStorage.getCampaign(testCampaignId);
  console.log('DEBUG CALL 1:', {
    eventAgg: { total: aggObj.totalCalls, ans: aggObj.answeredCalls, comp: aggObj.completedCalls, k1: aggObj.politicalCampaign?.keypad1Count },
    campAgg: { total: campAggObj.totalCalls, ans: campAggObj.answeredCalls, comp: campAggObj.completedCalls, k1: campAggObj.politicalCampaign?.keypad1Count },
    camp: { callsInit: campObj?.callsInitiated, ans: campObj?.answeredCount, comp: campObj?.completedCount, k1: campObj?.keypad1Count },
  });

  const afterCall1 = ExportService.exportAnalyticsJson(testEventId, testCampaignId);
  console.log('After Call 1 metrics:', {
    callsInitiated: afterCall1.essentialMetrics.callsInitiated,
    finishedCalls: afterCall1.essentialMetrics.finishedCalls,
    callsAttended: afterCall1.essentialMetrics.callsAttended,
    attendedPercent: afterCall1.essentialMetrics.attendedPercent,
    pressed1Count: afterCall1.essentialMetrics.pressed1Count,
    pressed1Percent: afterCall1.essentialMetrics.pressed1Percent,
    pressed2Count: afterCall1.essentialMetrics.pressed2Count,
    pressed2Percent: afterCall1.essentialMetrics.pressed2Percent,
  });

  if (afterCall1.essentialMetrics.callsInitiated !== 1) throw new Error(`Expected callsInitiated 1, got ${afterCall1.essentialMetrics.callsInitiated}`);
  if (afterCall1.essentialMetrics.finishedCalls !== 1) throw new Error(`Expected finishedCalls 1, got ${afterCall1.essentialMetrics.finishedCalls}`);
  if (afterCall1.essentialMetrics.callsAttended !== 1) throw new Error(`Expected callsAttended 1, got ${afterCall1.essentialMetrics.callsAttended}`);
  if (afterCall1.essentialMetrics.attendedPercent !== 100) throw new Error(`Expected attendedPercent 100, got ${afterCall1.essentialMetrics.attendedPercent}`);
  if (afterCall1.essentialMetrics.pressed1Count !== 1) throw new Error(`Expected pressed1Count 1, got ${afterCall1.essentialMetrics.pressed1Count}`);
  if (afterCall1.essentialMetrics.pressed1Percent !== 100) throw new Error(`Expected pressed1Percent 100, got ${afterCall1.essentialMetrics.pressed1Percent}`);

  // --- CALL 2: Contact 2 ---
  const call2JobId = `job_${Date.now()}_1_xyz`;
  const call2VapiId = `vapi_call_uuid_002_${Date.now()}`;

  // Record call initiated
  callbridgeStorage.recordCallInitiated(testEventId, call2JobId, testCampaignId);
  VapiService.registerTransientActiveCall(call2VapiId, {
    campaignId: testCampaignId,
    jobId: call2JobId,
    eventId: testEventId,
    phone: '+919876543211',
  });

  // Vapi sends status-update ended immediately with customer-ended-call
  VapiService.handleWebhook({
    message: {
      type: 'status-update',
      status: 'ended',
      endedReason: 'customer-ended-call',
      call: { id: call2VapiId, status: 'ended', startedAt: new Date().toISOString() },
    },
  });

  // Vapi sends end-of-call-report with keypad 2 pressed
  VapiService.handleWebhook({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      durationSeconds: 22,
      call: { id: call2VapiId, status: 'ended', duration: 22 },
      artifact: {
        messages: [
          { role: 'assistant', message: 'నమస్కారం!' },
          { role: 'user', message: '2' },
        ],
      },
    },
  });

  // Check final analytics after both calls
  const finalAnalytics = ExportService.exportAnalyticsJson(testEventId, testCampaignId);
  console.log('Final Two-Contact Scenario Metrics:', {
    callsInitiated: finalAnalytics.essentialMetrics.callsInitiated,
    finishedCalls: finalAnalytics.essentialMetrics.finishedCalls,
    callsAttended: finalAnalytics.essentialMetrics.callsAttended,
    attendedPercent: `${finalAnalytics.essentialMetrics.attendedPercent}%`,
    callsNotAttended: finalAnalytics.essentialMetrics.callsNotAttended,
    notAttendedPercent: `${finalAnalytics.essentialMetrics.notAttendedPercent}%`,
    pressed1Count: finalAnalytics.essentialMetrics.pressed1Count,
    pressed1Percent: `${finalAnalytics.essentialMetrics.pressed1Percent}%`,
    pressed2Count: finalAnalytics.essentialMetrics.pressed2Count,
    pressed2Percent: `${finalAnalytics.essentialMetrics.pressed2Percent}%`,
  });

  // Requirement:
  // - Calls Initiated: 2
  // - Finished Calls: 2
  // - Answered Calls: 2
  // - Answered Percentage: 100%
  // - Keypad 1 Count: 1
  // - Keypad 1 Percentage: 50%
  // - Keypad 2 Count: 1
  // - Keypad 2 Percentage: 50%
  if (finalAnalytics.essentialMetrics.callsInitiated !== 2) {
    throw new Error(`Expected Calls Initiated: 2, got ${finalAnalytics.essentialMetrics.callsInitiated}`);
  }
  if (finalAnalytics.essentialMetrics.finishedCalls !== 2) {
    throw new Error(`Expected Finished Calls: 2, got ${finalAnalytics.essentialMetrics.finishedCalls}`);
  }
  if (finalAnalytics.essentialMetrics.callsAttended !== 2) {
    throw new Error(`Expected Answered Calls: 2, got ${finalAnalytics.essentialMetrics.callsAttended}`);
  }
  if (finalAnalytics.essentialMetrics.attendedPercent !== 100) {
    throw new Error(`Expected Answered Percentage: 100%, got ${finalAnalytics.essentialMetrics.attendedPercent}%`);
  }
  if (finalAnalytics.essentialMetrics.pressed1Count !== 1) {
    throw new Error(`Expected Keypad 1 Count: 1, got ${finalAnalytics.essentialMetrics.pressed1Count}`);
  }
  if (finalAnalytics.essentialMetrics.pressed1Percent !== 50) {
    throw new Error(`Expected Keypad 1 Percentage: 50%, got ${finalAnalytics.essentialMetrics.pressed1Percent}%`);
  }
  if (finalAnalytics.essentialMetrics.pressed2Count !== 1) {
    throw new Error(`Expected Keypad 2 Count: 1, got ${finalAnalytics.essentialMetrics.pressed2Count}`);
  }
  if (finalAnalytics.essentialMetrics.pressed2Percent !== 50) {
    throw new Error(`Expected Keypad 2 Percentage: 50%, got ${finalAnalytics.essentialMetrics.pressed2Percent}%`);
  }
  if (finalAnalytics.essentialMetrics.notAttendedPercent !== 0) {
    throw new Error(`Expected Unanswered Percentage: 0%, got ${finalAnalytics.essentialMetrics.notAttendedPercent}%`);
  }

  console.log('✓ ALL 2-CONTACT ANALYTICS EXPECTATIONS VERIFIED SUCCESSFULLY!');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
