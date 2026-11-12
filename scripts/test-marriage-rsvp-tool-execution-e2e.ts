/**
 * End-to-End Verification of Marriage RSVP Tool Execution, Logging, and Fallbacks
 */
import { VapiService } from '../server/telephony/vapiService';
import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { classifyMarriageRsvp } from '../server/voice/teluguPronunciationDictionary';

async function run() {
  console.log('=== RUNNING MARRIAGE RSVP TOOL EXECUTION & LIFECYCLE VERIFICATION ===\n');

  let passed = 0;
  let total = 0;
  function assert(cond: any, msg: string) {
    total++;
    if (cond) {
      console.log(`  ✓ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // Intercept logs to verify required transitions
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
    originalLog(...args);
  };

  // Setup mock Vapi credentials & fetch
  process.env.VAPI_PRIVATE_API_KEY = 'test_vapi_private_key_123';
  process.env.VAPI_PHONE_NUMBER_ID = 'test_phone_num_id_123';
  process.env.ELEVENLABS_API_KEY = 'test_el_key_123';

  let capturedRequestBody: any = null;
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (urlStr.includes('api.elevenlabs.io')) {
      return new Response(JSON.stringify({
        voice_id: 'Txde0pZ5tVhXE6HUspcf',
        name: 'Madhavi Cloned Voice',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('api.vapi.ai/credential')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('api.vapi.ai/call')) {
      if (init?.body) {
        try { capturedRequestBody = JSON.parse(init.body); } catch (e) { /* ignore */ }
      }
      const uniqueId = `01a1a6fd-c45f-7000-8cc3-${Math.random().toString(36).slice(2, 8)}${Date.now().toString().slice(-4)}`;
      return new Response(JSON.stringify({
        id: uniqueId,
        status: 'queued',
        createdAt: new Date().toISOString(),
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  };

  try {
    const timestamp = Date.now();
    const campaignId = `camp_marr_tool_${timestamp}`;
    const eventId = `event_marr_tool_${timestamp}`;

    // 1. Setup Marriage Campaign in storage
    callbridgeStorage.saveCampaign({
      id: campaignId,
      name: 'Marriage Tool Execution Test Campaign',
      eventId,
      moduleType: 'marriage_event',
      concurrencyLimit: 1,
      totalContacts: 10,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      activeCalls: 1,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    callbridgeStorage.saveEvent({
      id: eventId,
      name: 'Radha & Krishna Wedding',
      type: 'marriage_event',
      language: 'te',
      config: {
        renderedScript: 'మీరు ఈ వివాహ వేడుకకు విచ్చేసి వధూవరులను ఆశీర్వదించాల్సిందిగా కోరుతున్నాము. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    console.log('\n--- Step 1: Outbound Call Dispatch Tool Registration ---');
    // Call createOutboundCall (simulation mode)
    const callRes = await VapiService.createOutboundCall({
      campaignId,
      eventId,
      contactId: 'contact_1',
      contactName: 'Suresh Kumar',
      phoneNumber: '+919876543210',
      language: 'te',
      moduleType: 'marriage_event',
      script: 'మీరు ఈ వివాహ వేడుకకు విచ్చేసి వధూవరులను ఆశీర్వదించండి. మీరు హాజరవుతారా?',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
    });

    assert(callRes.success, 'Outbound call creation succeeded');
    const hasRegisteredLog = logs.some(l => l.includes('[MARRIAGE_RSVP_TOOL_REGISTERED]'));
    assert(hasRegisteredLog, 'Emitted [MARRIAGE_RSVP_TOOL_REGISTERED] during call setup');

    // Assert that capturedRequestBody has recordMarriageRsvp tool in model.tools and no invalid properties
    const asst = capturedRequestBody?.assistantOverrides || capturedRequestBody?.assistant;
    const modelTools = asst?.model?.tools || [];
    const rsvpToolInModel = modelTools.find((t: any) => t?.function?.name === 'recordMarriageRsvp');
    assert(Boolean(rsvpToolInModel), 'Vapi assistant payload contains recordMarriageRsvp in model.tools');
    assert(asst?.tools === undefined, 'assistantOverrides.tools does not exist (strictly compliant with Vapi schema)');
    assert(rsvpToolInModel?.serverUrl === undefined, 'tool.serverUrl does not exist (strictly compliant with Vapi schema)');
    assert(rsvpToolInModel?.server?.url !== undefined, 'tool.server.url is configured correctly');

    const providerCallId = callRes.callId;
    console.log(`Simulated Provider Call ID: ${providerCallId}`);

    console.log('\n--- Step 2: Live Tool-Call Webhook From Vapi ("అవును, వస్తున్నాను") ---');
    const toolCallPayload = {
      message: {
        type: 'tool-calls',
        call: {
          id: providerCallId,
          status: 'in-progress',
          metadata: {
            campaignId,
            eventId,
            moduleType: 'marriage_event',
            jobId: callRes.callId,
          },
        },
        toolCalls: [
          {
            id: 'tc_rsvp_001',
            type: 'function',
            function: {
              name: 'recordMarriageRsvp',
              arguments: JSON.stringify({
                category: 'ATTENDING',
                userSpeech: 'అవును, వస్తున్నాను',
              }),
            },
          },
        ],
      },
    };

    const webhookRes = VapiService.handleWebhook(toolCallPayload);
    assert(webhookRes.success, 'Webhook handler returned success');
    assert(Array.isArray((webhookRes as any).results), 'Webhook returned results array for Vapi');
    assert((webhookRes as any).results[0]?.toolCallId === 'tc_rsvp_001', 'Tool call ID matched in results');

    // Verify all transition logs
    assert(logs.some(l => l.includes('[MARRIAGE_RSVP_TOOL_CALL_RECEIVED]')), 'Emitted [MARRIAGE_RSVP_TOOL_CALL_RECEIVED]');
    assert(logs.some(l => l.includes('[MARRIAGE_RSVP_RESULT_RECEIVED]')), 'Emitted [MARRIAGE_RSVP_RESULT_RECEIVED]');
    assert(logs.some(l => l.includes('[MARRIAGE_RSVP_CLASSIFIED]')), 'Emitted [MARRIAGE_RSVP_CLASSIFIED]');
    assert(logs.some(l => l.includes('[MARRIAGE_RSVP_AGGREGATE_UPDATED]')), 'Emitted [MARRIAGE_RSVP_AGGREGATE_UPDATED]');
    assert(logs.some(l => l.includes('[MARRIAGE_RSVP_WEBHOOK_DISPATCHED]')), 'Emitted [MARRIAGE_RSVP_WEBHOOK_DISPATCHED]');

    // Check aggregate dashboard counts
    const agg1 = callbridgeStorage.getAggregateAnalytics(campaignId);
    assert(agg1.marriageEvent?.attendingCount === 1, `Dashboard attending count is 1 (got ${agg1.marriageEvent?.attendingCount})`);
    assert(agg1.marriageEvent?.notAttendingCount === 0, 'Dashboard not attending count is 0');
    assert(agg1.marriageEvent?.maybeAttendingCount === 0, 'Dashboard maybe count is 0');

    console.log('\n--- Step 3: End-of-Call Fallback When Tool Call Was Skipped ---');
    // Scenario 2: A second call where respondent says "వస్తున్నాను" but tool-call was NOT executed by Vapi
    const callRes2 = await VapiService.createOutboundCall({
      campaignId,
      eventId,
      contactId: 'contact_2',
      contactName: 'Ramesh Naidu',
      phoneNumber: '+919876543211',
      language: 'te',
      moduleType: 'marriage_event',
      script: 'మీరు ఈ వివాహ వేడుకకు విచ్చేసి వధూవరులను ఆశీర్వదించండి. మీరు హాజరవుతారా?',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
    });

    const providerCallId2 = callRes2.callId;

    // Vapi sends status-update: in-progress
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'in-progress',
        call: {
          id: providerCallId2,
          metadata: { campaignId, eventId, moduleType: 'marriage_event', jobId: callRes2.callId },
        },
      },
    });

    // Respondent says "వస్తున్నాను", AI says "సరే, ధన్యవాదాలు."
    // Vapi sends end-of-call-report WITHOUT prior tool-calls event:
    const endOfCallPayload = {
      message: {
        type: 'end-of-call-report',
        endedReason: 'assistant-ended-call',
        durationSeconds: 18,
        call: {
          id: providerCallId2,
          status: 'ended',
          duration: 18,
          metadata: { campaignId, eventId, moduleType: 'marriage_event', jobId: callRes2.callId },
          artifact: {
            messages: [
              { role: 'assistant', message: 'వివాహ వేడుకకు విచ్చేసి వధూవరులను ఆశీర్వదించండి. మీరు హాజరవుతారా?' },
              { role: 'user', message: 'వస్తున్నాను' },
              { role: 'assistant', message: 'సరే, ధన్యవాదాలు.' },
            ],
          },
        },
      },
    };

    const fallbackRes = VapiService.handleWebhook(endOfCallPayload);
    assert(fallbackRes.success, 'End-of-call fallback processed successfully');

    // Verify aggregate dashboard count updated for the second guest
    const agg2 = callbridgeStorage.getAggregateAnalytics(campaignId);
    assert(agg2.marriageEvent?.attendingCount === 2, `Dashboard attending count incremented to 2 (got ${agg2.marriageEvent?.attendingCount})`);

    console.log('\n--- Step 4: Strict Telugu Classification Semantic Integrity ---');
    assert(classifyMarriageRsvp('అవును, వస్తున్నాను') === 'ATTENDING', '"అవును, వస్తున్నాను" -> ATTENDING');
    assert(classifyMarriageRsvp('వస్తున్నాను') === 'ATTENDING', '"వస్తున్నాను" -> ATTENDING');
    assert(classifyMarriageRsvp('వస్తున్నా') === 'ATTENDING', '"వస్తున్నా" -> ATTENDING');
    assert(classifyMarriageRsvp('వస్తాము') === 'ATTENDING', '"వస్తాము" -> ATTENDING');
    assert(classifyMarriageRsvp('రాను') === 'NOT_ATTENDING', '"రాను" -> NOT_ATTENDING');
    assert(classifyMarriageRsvp('రాలేను') === 'NOT_ATTENDING', '"రాలేను" -> NOT_ATTENDING');
    assert(classifyMarriageRsvp('కుదిరితే వస్తాను') === 'MAYBE_ATTENDING', '"కుదిరితే వస్తాను" -> MAYBE_ATTENDING');

  } finally {
    console.log = originalLog;
    global.fetch = originalFetch;
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed}/${total} assertions passed`);
  console.log(`========================================`);
  if (passed === total) {
    console.log('ALL MARRIAGE RSVP TOOL EXECUTION TESTS PASSED!');
  } else {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
