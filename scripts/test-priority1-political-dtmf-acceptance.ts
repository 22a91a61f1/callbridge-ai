import { callbridgeStorage, type ContactRecord } from '../server/storage/callbridgeStorage.ts';
import { VapiService, extractKeypadDigit } from '../server/telephony/vapiService.ts';
import { ExportService } from '../server/reporting/exportService.ts';

async function runPriority1AcceptanceTests() {
  console.log('========================================================================');
  console.log('PRIORITY 1 ACCEPTANCE TEST: POLITICAL CAMPAIGN KEYPAD ANALYTICS ACCURACY');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: any) {
    if (condition) {
      passed++;
      console.log(`✅ PASS [${passed}]: ${name}`);
    } else {
      failed++;
      console.error(`❌ FAIL: ${name}`, detail !== undefined ? detail : '');
    }
  }

  const ts = Date.now();

  // --------------------------------------------------------------------------
  // TEST 1: DTMF DIGIT EXTRACTION ACCURACY & FALSE-POSITIVE GUARD
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: DTMF Extraction & False-Positive Protection ---');
  assert(extractKeypadDigit({ message: { dtmf: 1 } }) === '1', 'Extracts numeric dtmf 1');
  assert(extractKeypadDigit({ message: { dtmf: '2' } }) === '2', 'Extracts string dtmf "2"');
  assert(extractKeypadDigit({ message: { digits: '1#' } }) === '1', 'Extracts DTMF with trailing # delimiter ("1#")');
  assert(extractKeypadDigit({ message: { digits: '2*' } }) === '2', 'Extracts DTMF with trailing * delimiter ("2*")');
  assert(
    extractKeypadDigit({ message: { type: 'transcript', role: 'user', transcript: "User's Keypad Entry: 1" } }) === '1',
    'Extracts Vapi keypadInputPlan format ("User\'s Keypad Entry: 1")'
  );
  assert(
    extractKeypadDigit({
      message: {
        type: 'tool-calls',
        toolWithToolCallList: [{ toolCall: { function: { name: 'captureDtmf', arguments: JSON.stringify({ digit: '2' }) } } }],
      },
    }) === '2',
    'Extracts digit from nested toolWithToolCallList arguments'
  );
  assert(
    extractKeypadDigit({
      message: {
        type: 'transcript',
        role: 'assistant',
        transcript: 'అభివృద్ధి కార్యక్రమాలకు మీ మద్దతు ఉంటే 1 నొక్కండి, మరిన్ని వివరాలకు 2 నొక్కండి.',
      },
    }) === null,
    'Ignores assistant transcript containing "1" and "2"'
  );
  assert(
    extractKeypadDigit({
      message: {
        type: 'transcript',
        role: 'user',
        transcript: 'What do you want me to do?',
      },
    }) === null,
    'Does NOT falsely match English word "do" as digit 2'
  );
  assert(
    extractKeypadDigit({
      message: {
        type: 'end-of-call-report',
        artifact: {
          transcript: 'AI: Press 1 for support, Press 2 for callback.\nUser: 2',
          messages: [
            { role: 'assistant', message: 'Press 1 for support, Press 2 for callback.' },
            { role: 'user', message: '2' },
          ],
        },
      },
    }) === '2',
    'Extracts User digit 2 instead of AI prompt digit 1 in combined transcript'
  );

  // --------------------------------------------------------------------------
  // TEST 2: VAPI OUTBOUND PAYLOAD INCLUDES keypadInputPlan FOR POLITICAL CALLS
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Vapi Outbound Payload keypadInputPlan ---');
  const originalFetch = global.fetch;
  const interceptedBodies: any[] = [];
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/call/phone')) {
      interceptedBodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `01999999-1111-7777-8888-${String(interceptedBodies.length).padStart(12, '0')}`,
          status: 'queued',
        }),
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    VapiService.setRuntimeConfig('test-key', 'test-phone-id', '');
    await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      contactName: 'Voter A',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారం! మద్దతు కోసం 1 నొక్కండి, వివరాలకు 2 నొక్కండి.',
      language: 'te',
      moduleType: 'political_campaign',
      appBaseUrl: 'https://example.test',
    });
    assert(
      interceptedBodies[0]?.assistant?.keypadInputPlan?.enabled === true,
      'Inline assistant includes keypadInputPlan.enabled = true for political_campaign'
    );

    VapiService.setRuntimeConfig('test-key', 'test-phone-id', 'asst_pol_test');
    await VapiService.createOutboundCall({
      phoneNumber: '+919876543211',
      contactName: 'Voter B',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారం! మద్దతు కోసం 1 నొక్కండి, వివరాలకు 2 నొక్కండి.',
      language: 'te',
      moduleType: 'political_campaign',
      appBaseUrl: 'https://example.test',
    });
    assert(
      interceptedBodies[1]?.assistantOverrides?.keypadInputPlan?.enabled === true,
      'assistantOverrides includes keypadInputPlan.enabled = true for political_campaign'
    );
  } finally {
    global.fetch = originalFetch;
  }

  // Helper to run an isolated 2-call webhook simulation scenario
  let scenarioCallSeq = 0;
  function runTwoCallScenario(opts: {
    suffix: string;
    call1Digit: '1' | '2' | '9' | 'none' | 'no_answer';
    call2Digit: '1' | '2' | '9' | 'none' | 'no_answer';
    lateDtmfOnCall2?: boolean;
  }) {
    const evtId = `evt_p1_${opts.suffix}_${ts}`;
    const campId = `camp_p1_${opts.suffix}_${ts}`;
    callbridgeStorage.saveEvent({
      id: evtId,
      name: `Political Scenario ${opts.suffix}`,
      type: 'political_campaign',
      language: 'te',
      config: { approvedScript: 'నమస్కారం! 1 లేదా 2 నొక్కండి.' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    callbridgeStorage.saveCampaign({
      id: campId,
      clientId: 'client_001',
      eventId: evtId,
      name: `Batch ${opts.suffix}`,
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

    const simulateCall = (idx: number, mode: '1' | '2' | '9' | 'none' | 'no_answer', lateDtmf = false) => {
      scenarioCallSeq++;
      const jobId = `job_p1_${opts.suffix}_${idx}_${ts}`;
      const vapiId = `0199a000-0000-7000-8000-${String(ts).slice(-8)}${String(scenarioCallSeq).padStart(4, '0')}`;

      callbridgeStorage.saveCallJob({
        id: jobId,
        campaignId: campId,
        eventId: evtId,
        contactId: `cnt_${idx}`,
        contactName: `Voter ${idx}`,
        contactPhone: `+91980000000${idx}`,
        status: 'calling',
        providerCallId: vapiId,
        retryCount: 0,
        maxRetries: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { moduleType: 'political_campaign' },
      });

      callbridgeStorage.recordCallInitiated(evtId, jobId, campId);
      VapiService.registerTransientActiveCall(vapiId, {
        campaignId: campId,
        jobId,
        eventId: evtId,
        phone: `+91980000000${idx}`,
      });

      // Assistant speaks prompt containing "1" and "2" — must NOT trigger DTMF
      VapiService.handleWebhook({
        message: {
          type: 'transcript',
          role: 'assistant',
          transcript: 'మద్దతు కోసం 1 నొక్కండి, వివరాలకు 2 నొక్కండి.',
          call: { id: vapiId, status: 'in-progress', startedAt: new Date().toISOString() },
        },
      });

      if (mode === 'no_answer') {
        VapiService.handleWebhook({
          message: {
            type: 'status-update',
            status: 'ended',
            endedReason: 'customer-did-not-answer',
            call: { id: vapiId, status: 'ended', endedReason: 'customer-did-not-answer' },
          },
        });
        return;
      }

      if (!lateDtmf && (mode === '1' || mode === '2' || mode === '9')) {
        // First DTMF webhook
        VapiService.handleWebhook({
          message: {
            type: 'conversation-update',
            call: { id: vapiId, status: 'in-progress' },
            dtmf: mode,
          },
        });
        // Duplicate DTMF webhook (must be idempotent)
        VapiService.handleWebhook({
          message: {
            type: 'transcript',
            role: 'user',
            transcript: `User's Keypad Entry: ${mode}`,
            call: { id: vapiId, status: 'in-progress' },
          },
        });
      }

      VapiService.handleWebhook({
        message: {
          type: 'status-update',
          status: 'ended',
          endedReason: 'customer-ended-call',
          call: { id: vapiId, status: 'ended', startedAt: new Date(Date.now() - 12000).toISOString(), endedAt: new Date().toISOString() },
        },
      });

      VapiService.handleWebhook({
        message: {
          type: 'end-of-call-report',
          endedReason: 'customer-ended-call',
          durationSeconds: 12,
          call: { id: vapiId, status: 'ended', duration: 12 },
          ...(lateDtmf && (mode === '1' || mode === '2') ? { dtmf: mode } : {}),
        },
      });

      // Duplicate terminal webhook
      VapiService.handleWebhook({
        message: {
          type: 'end-of-call-report',
          endedReason: 'customer-ended-call',
          durationSeconds: 12,
          call: { id: vapiId, status: 'ended', duration: 12 },
        },
      });
    };

    simulateCall(1, opts.call1Digit, false);
    simulateCall(2, opts.call2Digit, Boolean(opts.lateDtmfOnCall2));

    const camp = callbridgeStorage.getCampaign(campId);
    if (camp) {
      camp.status = 'completed';
      callbridgeStorage.saveCampaign(camp);
    }

    return {
      evtId,
      campId,
      report: ExportService.exportAnalyticsJson(evtId, campId),
      eventLevelReport: ExportService.exportAnalyticsJson(evtId),
    };
  }

  // --------------------------------------------------------------------------
  // TEST 3: USER EXACT SCENARIO — CALL 1 PRESSES 1, CALL 2 PRESSES 2 => 50% / 50%
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Exact User Scenario (Phone 1 -> 1, Phone 2 -> 2) ---');
  const s1 = runTwoCallScenario({ suffix: 'one_and_two', call1Digit: '1', call2Digit: '2' });
  const m1 = s1.report.moduleSpecificMetrics.politicalCampaign;
  assert(m1.pressed1Count === 1, `Option 1 count = 1 (got ${m1.pressed1Count})`);
  assert(m1.pressed2Count === 1, `Option 2 count = 1 (got ${m1.pressed2Count})`);
  assert(m1.pressed1Percent === 50, `Option 1 % = 50% (got ${m1.pressed1Percent}%)`);
  assert(m1.pressed2Percent === 50, `Option 2 % = 50% (got ${m1.pressed2Percent}%)`);
  assert(m1.totalValidResponses === 2, `Total valid responses = 2 (got ${m1.totalValidResponses})`);
  assert(m1.noInputCount === 0, `No-input count = 0 (got ${m1.noInputCount})`);

  // --------------------------------------------------------------------------
  // TEST 4: BOTH CALLS PRESS 1 => 100% / 0%
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: All-1 Scenario (Phone 1 -> 1, Phone 2 -> 1) ---');
  const s2 = runTwoCallScenario({ suffix: 'all_one', call1Digit: '1', call2Digit: '1' });
  const m2 = s2.report.moduleSpecificMetrics.politicalCampaign;
  assert(m2.pressed1Count === 2 && m2.pressed2Count === 0, `Counts = 2 / 0 (got ${m2.pressed1Count} / ${m2.pressed2Count})`);
  assert(m2.pressed1Percent === 100 && m2.pressed2Percent === 0, `Percentages = 100% / 0% (got ${m2.pressed1Percent}% / ${m2.pressed2Percent}%)`);

  // --------------------------------------------------------------------------
  // TEST 5: BOTH CALLS PRESS 2 => 0% / 100%
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: All-2 Scenario (Phone 1 -> 2, Phone 2 -> 2) ---');
  const s3 = runTwoCallScenario({ suffix: 'all_two', call1Digit: '2', call2Digit: '2' });
  const m3 = s3.report.moduleSpecificMetrics.politicalCampaign;
  assert(m3.pressed1Count === 0 && m3.pressed2Count === 2, `Counts = 0 / 2 (got ${m3.pressed1Count} / ${m3.pressed2Count})`);
  assert(m3.pressed1Percent === 0 && m3.pressed2Percent === 100, `Percentages = 0% / 100% (got ${m3.pressed1Percent}% / ${m3.pressed2Percent}%)`);

  // --------------------------------------------------------------------------
  // TEST 6: LATE DTMF IN END-OF-CALL-REPORT + NO FABRICATED '1'
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Late DTMF on Call 2 ("2") Reconciles No-Input -> 50% / 50% ---');
  const s4 = runTwoCallScenario({ suffix: 'late_two', call1Digit: '1', call2Digit: '2', lateDtmfOnCall2: true });
  const m4 = s4.report.moduleSpecificMetrics.politicalCampaign;
  assert(m4.pressed1Count === 1 && m4.pressed2Count === 1, `Late DTMF 2 preserved: 1 / 1 (got ${m4.pressed1Count} / ${m4.pressed2Count})`);
  assert(m4.pressed1Percent === 50 && m4.pressed2Percent === 50, `Percentages = 50% / 50% (got ${m4.pressed1Percent}% / ${m4.pressed2Percent}%)`);
  assert(m4.noInputCount === 0, `Premature noInputCount reconciled back to 0 (got ${m4.noInputCount})`);

  // --------------------------------------------------------------------------
  // TEST 7: VALID + NO-INPUT => DENOMINATOR IS VALID RESPONSES ONLY (100% / 0%)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Mixed Valid (1) + No-Input Call => 100% / 0% ---');
  const s5 = runTwoCallScenario({ suffix: 'one_and_none', call1Digit: '1', call2Digit: 'none' });
  const m5 = s5.report.moduleSpecificMetrics.politicalCampaign;
  assert(m5.totalValidResponses === 1, `Total valid responses = 1 (got ${m5.totalValidResponses})`);
  assert(m5.pressed1Percent === 100 && m5.pressed2Percent === 0, `Percentages = 100% / 0% (got ${m5.pressed1Percent}% / ${m5.pressed2Percent}%)`);
  assert(m5.noInputCount === 1, `No-input count = 1 (got ${m5.noInputCount})`);

  // --------------------------------------------------------------------------
  // TEST 8: VALID + NO-ANSWER => DENOMINATOR IS VALID RESPONSES ONLY (0% / 100%)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Mixed Valid (2) + Unanswered Call => 0% / 100% ---');
  const s6 = runTwoCallScenario({ suffix: 'two_and_noans', call1Digit: '2', call2Digit: 'no_answer' });
  const m6 = s6.report.moduleSpecificMetrics.politicalCampaign;
  assert(m6.totalValidResponses === 1, `Total valid responses = 1 (got ${m6.totalValidResponses})`);
  assert(m6.pressed1Percent === 0 && m6.pressed2Percent === 100, `Percentages = 0% / 100% (got ${m6.pressed1Percent}% / ${m6.pressed2Percent}%)`);
  assert(m6.unansweredCalls === 1, `Unanswered calls = 1 (got ${m6.unansweredCalls})`);

  // --------------------------------------------------------------------------
  // TEST 9: INVALID DIGITS (9) => 0% / 0% (NEVER NaN)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Invalid Digits Only ("9") => 0% / 0% ---');
  const s7 = runTwoCallScenario({ suffix: 'invalid_only', call1Digit: '9', call2Digit: 'none' });
  const m7 = s7.report.moduleSpecificMetrics.politicalCampaign;
  assert(m7.totalValidResponses === 0, `Total valid responses = 0 (got ${m7.totalValidResponses})`);
  assert(m7.pressed1Percent === 0 && m7.pressed2Percent === 0, `Zero-valid percentages = 0% / 0% (got ${m7.pressed1Percent}% / ${m7.pressed2Percent}%)`);

  // --------------------------------------------------------------------------
  // TEST 10: MULTIPLE CAMPAIGNS ON SAME EVENT — DEFAULT ANALYTICS PICKS NEWEST
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Multi-Campaign Latest Selection ---');
  const multiEvtId = `evt_p1_multi_${ts}`;
  const oldCampId = `camp_p1_old_${ts}`;
  const newCampId = `camp_p1_new_${ts}`;
  callbridgeStorage.saveEvent({
    id: multiEvtId,
    name: 'Multi-Campaign Political Event',
    type: 'political_campaign',
    language: 'te',
    config: {},
    createdAt: new Date(ts - 10000).toISOString(),
    updatedAt: new Date(ts - 10000).toISOString(),
  } as any);
  callbridgeStorage.saveCampaign({
    id: oldCampId,
    clientId: 'client_001',
    eventId: multiEvtId,
    name: 'Old Batch',
    status: 'completed',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 2,
    completedCount: 2,
    failedCount: 0,
    optOutCount: 0,
    callsInitiated: 2,
    answeredCount: 2,
    keypad1Count: 0,
    keypad2Count: 2,
    createdAt: new Date(ts - 5000).toISOString(),
    updatedAt: new Date(ts - 5000).toISOString(),
  } as any);
  callbridgeStorage.saveCampaign({
    id: newCampId,
    clientId: 'client_001',
    eventId: multiEvtId,
    name: 'New Batch (Draft)',
    status: 'draft',
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
    createdAt: new Date(ts).toISOString(),
    updatedAt: new Date(ts).toISOString(),
  } as any);
  // Old campaign had 0 / 2; New campaign has 0 / 0 so far -> fallback without processedCount should pick newest if none active, or with activity newest active
  const latestWithNoActivityOnNew = ExportService.exportAnalyticsJson(multiEvtId);
  assert(
    latestWithNoActivityOnNew.campaignId === oldCampId,
    `When new campaign is still draft (0 processed), analytics falls back to active/processed campaign (${latestWithNoActivityOnNew.campaignId})`
  );
  // Now record 1 + 2 on new campaign
  callbridgeStorage.recordCallInitiated(multiEvtId, `j_m1_${ts}`, newCampId);
  callbridgeStorage.recordPoliticalKeypadOutcome(multiEvtId, `j_m1_${ts}`, '1', newCampId);
  callbridgeStorage.recordCallInitiated(multiEvtId, `j_m2_${ts}`, newCampId);
  callbridgeStorage.recordPoliticalKeypadOutcome(multiEvtId, `j_m2_${ts}`, '2', newCampId);
  const newCampRecord = callbridgeStorage.getCampaign(newCampId)!;
  newCampRecord.status = 'completed';
  callbridgeStorage.saveCampaign(newCampRecord);

  const latestAfterRun = ExportService.exportAnalyticsJson(multiEvtId);
  assert(
    latestAfterRun.campaignId === newCampId &&
      latestAfterRun.moduleSpecificMetrics.politicalCampaign.pressed1Percent === 50 &&
      latestAfterRun.moduleSpecificMetrics.politicalCampaign.pressed2Percent === 50,
    `After running newer campaign (1 + 2), event analytics picks newer campaign and returns 50% / 50%`
  );

  console.log('\n========================================================================');
  console.log(`PRIORITY 1 ACCEPTANCE RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runPriority1AcceptanceTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
