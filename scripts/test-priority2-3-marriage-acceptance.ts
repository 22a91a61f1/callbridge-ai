import express from 'express';
import http from 'node:http';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { callbridgeRouter } from '../server/callbridgeRouter.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';

async function runSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: PRIORITY 2 & 3 — MARRIAGE SEQUENTIAL & CLOSING FIXES');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name}${detail ? ` (${detail})` : ''}`);
      failed++;
      process.exitCode = 1;
    }
  }

  const runId = Date.now();
  const tenantId = `tenant_p23_${runId}`;

  callbridgeStorage.saveTenant({
    id: tenantId,
    name: 'Marriage Test Tenant',
    email: 'marriage-test@example.com',
    organization: 'Test Family',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const baseSub = callbridgeStorage.getSubscription(tenantId);
  callbridgeStorage.saveSubscription({
    ...baseSub,
    userId: tenantId,
    planId: 'pro',
    status: 'active',
    planStatus: 'active',
    remainingSeconds: 36000,
    totalSeconds: 36000,
  });

  // Save originals so we can restore cleanly after suite
  const origCreateOutbound = VapiService.createOutboundCall;
  const origGetCallStatus = VapiService.getCallStatus;
  const origTerminateCall = VapiService.terminateCall;
  const origSendLiveCallControl = VapiService.sendLiveCallControl;

  try {
    // =========================================================================
    // PART 1: PRIORITY 3 — Vapi Assistant Config, Silent Tool & Single Closing
    // =========================================================================
    console.log('--- PART 1: Priority 3 — Outbound Config, Silent Tool, Single Acknowledgement ---');
    let capturedVapiRequest: any = null;
    const origFetch = globalThis.fetch;
    const origResolvePhone = VapiService.resolveValidPhoneNumberId;
    const origResolveCred = (VapiService as any).resolveVapiElevenLabsCredential;
    const origVerifyVoice = ElevenLabsService.verifyVoiceExists;
    const prevVapiKey = process.env.VAPI_PRIVATE_API_KEY;
    const prevPhoneId = process.env.VAPI_PHONE_NUMBER_ID;

    try {
      process.env.VAPI_PRIVATE_API_KEY = 'mock-vapi-key-test';
      process.env.VAPI_PHONE_NUMBER_ID = 'mock-phone-id-test';

      VapiService.resolveValidPhoneNumberId = async () => 'mock-phone-id-test';
      (VapiService as any).resolveVapiElevenLabsCredential = async () => undefined;
      ElevenLabsService.verifyVoiceExists = async () => ({ valid: true });
      globalThis.fetch = (async (_url: any, init?: any) => {
        if (init?.body) {
          capturedVapiRequest = JSON.parse(String(init.body));
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: `01999999-0001-7000-8000-${runId.toString(16).slice(-12)}`,
            status: 'queued',
            monitor: {
              controlUrl: 'https://api.vapi.ai/call/control/mock-p3',
              controlAuthenticationEnabled: false,
            },
          }),
        } as any;
      }) as any;

      const p3EventId = `evt_marr_p3_${runId}`;
      const p3CampId = `camp_marr_p3_${runId}`;
      callbridgeStorage.saveEvent({
        id: p3EventId,
        name: 'Priority 3 Wedding Config Test',
        type: 'marriage_event',
        language: 'te',
        config: {
          approvedScript: 'నమస్కారం అండి! మా వివాహ వేడుకకు తప్పకుండా విచ్చేయగలరు. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await origCreateOutbound.call(VapiService, {
        phoneNumber: '+919900112233',
        contactName: 'Ramesh',
        voiceId: 'mock_voice_rishi',
        moduleType: 'marriage_event',
        script: 'నమస్కారం అండి! మా వివాహ వేడుకకు తప్పకుండా విచ్చేయగలరు. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?',
        language: 'te',
        campaignId: p3CampId,
        eventId: p3EventId,
        contactId: 'cnt_p3',
        clientId: tenantId,
        callId: `job_p3_${runId}`,
        jobId: `job_p3_${runId}`,
      });

      const assistantCfg = capturedVapiRequest?.assistant || capturedVapiRequest?.assistantOverrides;
      const sysPrompt: string = assistantCfg?.model?.messages?.[0]?.content || '';
      const tools: any[] = assistantCfg?.model?.tools || [];
      const rsvpTool = tools.find((t) => t?.function?.name === 'recordMarriageRsvp');
      const endCallTool = tools.find((t) => t?.type === 'endCall');

      assert(Boolean(rsvpTool), 'Marriage assistant attaches recordMarriageRsvp tool');
      assert(!endCallTool, 'Marriage assistant removes endCall tool to prevent early/filler cutoff');
      const reqStartMsg = rsvpTool?.messages?.find((m: any) => m.type === 'request-start');
      const reqDelayMsg = rsvpTool?.messages?.find((m: any) => m.type === 'request-response-delayed');
      assert(reqStartMsg && reqStartMsg.content === '', 'recordMarriageRsvp request-start message is empty string (no filler)');
      assert(reqDelayMsg && reqDelayMsg.content === '', 'recordMarriageRsvp request-response-delayed message is empty string (no waiting phrase)');
      assert(sysPrompt.includes('"సరే అండి, ధన్యవాదాలు."'), 'Marriage system prompt specifies exact closing "సరే అండి, ధన్యవాదాలు."');
      assert(!sysPrompt.includes('"సరే, ధన్యవాదాలు."'), 'Marriage system prompt no longer instructs old "సరే, ధన్యవాదాలు."');
      assert(sysPrompt.includes('ABSOLUTELY NEVER say: "ఒక్క క్షణం ఆగండి"'), 'Marriage system prompt explicitly forbids "ఒక్క క్షణం ఆగండి"');
      assert(assistantCfg?.endCallMessage === undefined, 'endCallMessage is undefined to avoid double-speaking acknowledgement');
      assert(Array.isArray(assistantCfg?.endCallPhrases) && assistantCfg.endCallPhrases.includes('సరే అండి, ధన్యవాదాలు.'), 'endCallPhrases includes "సరే అండి, ధన్యవాదాలు."');

      // Test waiting phrase does NOT count as closing acknowledgement
      assert(VapiService.isWaitingPhrase('ఒక్క క్షణం ఆగండి.') === true, 'isWaitingPhrase detects "ఒక్క క్షణం ఆగండి."');
      const testCallP3 = `01999999-f302-7000-8000-${runId.toString(16).padStart(12, '0').slice(-12)}`;
      const testJobP3 = `job_p3_wh_${runId}`;
      callbridgeStorage.saveCampaign({
        id: p3CampId,
        eventId: p3EventId,
        clientId: tenantId,
        name: 'P3 Camp',
        status: 'running',
        concurrencyLimit: 1,
        totalContacts: 1,
        processedCount: 0,
        completedCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      callbridgeStorage.saveCallJob({
        id: testJobP3,
        campaignId: p3CampId,
        eventId: p3EventId,
        contactId: 'cnt_p3',
        contactName: 'Ramesh',
        contactPhone: '+919900112233',
        status: 'in_progress',
        providerCallId: testCallP3,
        retryCount: 0,
        maxRetries: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { moduleType: 'marriage_event' },
      });
      VapiService.registerTransientActiveCall(testCallP3, {
        campaignId: p3CampId,
        jobId: testJobP3,
        eventId: p3EventId,
        phone: '+919900112233',
      });
      VapiService.initMarriageCallState(testCallP3);

      // Assistant erroneously sends waiting phrase transcript -> should NOT mark thankYouSpoken!
      VapiService.handleWebhook({
        message: {
          type: 'transcript',
          role: 'assistant',
          transcript: 'ఒక్క క్షణం ఆగండి.',
          call: { id: testCallP3 },
        },
      });
      assert(!VapiService.getMarriageCallState(testCallP3).thankYouSpoken, 'Waiting phrase transcript does not trigger closing thank-you state');

      // Now send tool call recordMarriageRsvp -> verify tool returns "సరే అండి, ధన్యవాదాలు."
      const toolRes = VapiService.handleWebhook({
        message: {
          type: 'tool-calls',
          call: { id: testCallP3 },
          toolCalls: [
            {
              id: 'tc_rsvp_1',
              function: {
                name: 'recordMarriageRsvp',
                arguments: { category: 'ATTENDING', userSpeech: 'అవును వస్తాను' },
              },
            },
          ],
        },
      });
      assert(
        toolRes.results?.[0]?.result === 'సరే అండి, ధన్యవాదాలు.',
        'recordMarriageRsvp tool result returns exact phrase "సరే అండి, ధన్యవాదాలు."'
      );

      // Cleanup P3 timer cleanly via terminal webhook
      VapiService.handleWebhook({
        message: {
          type: 'status-update',
          status: 'ended',
          endedReason: 'assistant-said-end-call-phrase',
          call: { id: testCallP3, status: 'ended', durationSeconds: 15 },
        },
      });
    } finally {
      globalThis.fetch = origFetch;
      VapiService.resolveValidPhoneNumberId = origResolvePhone;
      (VapiService as any).resolveVapiElevenLabsCredential = origResolveCred;
      ElevenLabsService.verifyVoiceExists = origVerifyVoice;
      if (prevVapiKey === undefined) delete process.env.VAPI_PRIVATE_API_KEY;
      else process.env.VAPI_PRIVATE_API_KEY = prevVapiKey;
      if (prevPhoneId === undefined) delete process.env.VAPI_PHONE_NUMBER_ID;
      else process.env.VAPI_PHONE_NUMBER_ID = prevPhoneId;
    }

    // =========================================================================
    // PART 2: PRIORITY 2 — Strict 1-at-a-time Sequential Calling (4 Contacts)
    // =========================================================================
    console.log('\n--- PART 2: Priority 2 — Strict Sequential Calling (4 Contacts + Failures + Duplicate Webhooks) ---');
    const p2EventId = `evt_marr_p2_${runId}`;
    const p2CampId = `camp_marr_p2_${runId}`;
    callbridgeStorage.saveEvent({
      id: p2EventId,
      name: 'Priority 2 Sequential Wedding',
      type: 'marriage_event',
      language: 'te',
      config: { approvedScript: 'నమస్కారం! మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const contacts = [1, 2, 3, 4].map((idx) =>
      callbridgeStorage.saveContact({
        id: `cnt_p2_${idx}_${runId}`,
        userId: tenantId,
        eventId: p2EventId,
        name: `Guest ${idx}`,
        phone: `+91987650000${idx}`,
        originalPhone: `+91987650000${idx}`,
        consentStatus: 'granted',
        optOut: false,
        importSource: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    callbridgeStorage.saveCampaign({
      id: p2CampId,
      eventId: p2EventId,
      clientId: tenantId,
      name: 'P2 Sequential Campaign',
      status: 'draft',
      concurrencyLimit: 1,
      totalContacts: 4,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const dispatchedCalls: Array<{ jobId: string; providerCallId: string; phone: string }> = [];
    let shouldFailPhone3 = true;

    VapiService.createOutboundCall = async (params: any) => {
      if (params.phoneNumber === '+919876500003' && shouldFailPhone3) {
        shouldFailPhone3 = false;
        throw new Error('Mock simulated carrier timeout for Contact 3');
      }
      const seqNum = dispatchedCalls.length + 1;
      const providerId = `01999999-${String(seqNum).padStart(4, '0')}-7000-8000-${runId.toString(16).slice(-12)}`;
      dispatchedCalls.push({ jobId: params.jobId, providerCallId: providerId, phone: params.phoneNumber });
      VapiService.initMarriageCallState(providerId);
      VapiService.registerTransientActiveCall(providerId, {
        campaignId: params.campaignId,
        jobId: params.jobId,
        eventId: params.eventId,
        phone: params.phoneNumber,
      });
      VapiService.activeCallControls.set(providerId, {
        controlUrl: `https://api.vapi.ai/call/control/mock-${seqNum}`,
        controlAuthenticationEnabled: false,
      });
      return {
        success: true,
        callId: params.jobId,
        providerCallId: providerId,
        status: 'calling',
      };
    };

    VapiService.getCallStatus = async (identifier: string) => ({
      id: identifier,
      status: 'in_progress',
      isTerminal: false,
    });
    VapiService.sendLiveCallControl = async () => ({ success: true, status: 200 });
    VapiService.terminateCall = async () => ({ success: true, message: 'mock terminated' });

    queueManager.createCampaignJobs(p2CampId, p2EventId, contacts.map((c) => c.id));
    queueManager.startCampaign(p2CampId);

    // Wait briefly for Contact 1 async dispatch
    await new Promise((r) => setTimeout(r, 80));
    assert(dispatchedCalls.length === 1, 'Only 1 outbound call initiated initially');
    assert(dispatchedCalls[0].phone === '+919876500001', 'First call goes to Contact 1 in queueOrder');

    // Re-trigger processNext & reconcileCampaign while Call 1 is ringing/connected/playing closing audio
    const call1 = dispatchedCalls[0];
    VapiService.handleWebhook({ message: { type: 'status-update', status: 'ringing', call: { id: call1.providerCallId } } });
    queueManager.processNext(p2CampId);
    await queueManager.reconcileCampaign(p2CampId);
    assert(dispatchedCalls.length === 1, 'Contact 2 NOT dialed while Contact 1 is ringing');

    VapiService.handleWebhook({ message: { type: 'status-update', status: 'in-progress', call: { id: call1.providerCallId } } });
    VapiService.handleWebhook({ message: { type: 'transcript', role: 'user', transcript: 'అవును వస్తాను', call: { id: call1.providerCallId } } });
    VapiService.handleWebhook({ message: { type: 'transcript', role: 'assistant', transcript: 'సరే అండి, ధన్యవాదాలు.', call: { id: call1.providerCallId } } });
    queueManager.processNext(p2CampId);
    assert(dispatchedCalls.length === 1, 'Contact 2 NOT dialed while Contact 1 closing audio is playing');

    VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: call1.providerCallId } } });
    await new Promise((r) => setTimeout(r, 50));
    assert(dispatchedCalls.length === 1, 'Contact 2 NOT dialed until provider confirms Call 1 ended');

    // Confirm Contact 1 terminal state
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'assistant-said-end-call-phrase',
        call: { id: call1.providerCallId, status: 'ended', durationSeconds: 20 },
      },
    });
    // Wait for sequential scheduler (600ms) -> Contact 2
    await new Promise((r) => setTimeout(r, 800));
    assert(dispatchedCalls.length === 2, 'Contact 2 dialed strictly after Call 1 reached terminal state');
    assert(dispatchedCalls[1].phone === '+919876500002', 'Second call goes to Contact 2');

    // Duplicate terminal webhooks for Call 2 -> must NOT advance twice!
    const call2 = dispatchedCalls[1];
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'customer-did-not-answer',
        call: { id: call2.providerCallId, status: 'ended', durationSeconds: 0 },
      },
    });
    VapiService.handleWebhook({
      message: {
        type: 'end-of-call-report',
        endedReason: 'customer-did-not-answer',
        call: { id: call2.providerCallId, status: 'ended', durationSeconds: 0 },
      },
    });

    // Wait for Contact 3 (fails in mock) -> unlocks -> advances cleanly to Contact 4
    await new Promise((r) => setTimeout(r, 1500));
    assert(dispatchedCalls.length === 3, 'Contact 3 attempted & failed, then Contact 4 dialed (exact 1 remaining active)');
    assert(dispatchedCalls[2].phone === '+919876500004', 'Contact 4 dialed sequentially after Contact 3 dispatch failure');

    // Complete Contact 4
    const call4 = dispatchedCalls[2];
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'customer-ended-call',
        call: { id: call4.providerCallId, status: 'ended', durationSeconds: 18 },
      },
    });
    await new Promise((r) => setTimeout(r, 200));

    const finalP2Camp = callbridgeStorage.getCampaign(p2CampId);
    assert(finalP2Camp?.status === 'completed', 'P2 campaign marked completed after final call');
    assert((finalP2Camp?.activeCalls ?? 0) === 0 && !finalP2Camp?.activeCallId && !finalP2Camp?.activeCallProviderId, 'P2 active call locks fully cleared');

    // =========================================================================
    // PART 3: PRIORITY 2 — Concurrent Duplicate HTTP Trigger Protection
    // =========================================================================
    console.log('\n--- PART 3: Priority 2 — Concurrent HTTP Start & Proceed Protection ---');
    const app = express();
    app.use(express.json());
    app.use('/api/callbridge', callbridgeRouter);
    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}/api/callbridge`;

    try {
      const httpEvtId = `evt_marr_http_${runId}`;
      callbridgeStorage.saveEvent({
        id: httpEvtId,
        name: 'Concurrent HTTP Marriage Test',
        type: 'marriage_event',
        language: 'te',
        config: { approvedScript: 'నమస్కారం! వివాహ ఆహ్వానం. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const h1 = callbridgeStorage.saveContact({
        id: `cnt_http_1_${runId}`,
        userId: tenantId,
        eventId: httpEvtId,
        name: 'HTTP Guest 1',
        phone: '+919800111111',
        originalPhone: '+919800111111',
        consentStatus: 'granted',
        optOut: false,
        importSource: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const h2 = callbridgeStorage.saveContact({
        id: `cnt_http_2_${runId}`,
        userId: tenantId,
        eventId: httpEvtId,
        name: 'HTTP Guest 2',
        phone: '+919800222222',
        originalPhone: '+919800222222',
        consentStatus: 'granted',
        optOut: false,
        importSource: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const countBeforeHttp = dispatchedCalls.length;
      const [resA, resB, resC] = await Promise.all([
        fetch(`${baseUrl}/events/${httpEvtId}/proceed-with-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: tenantId }),
        }).then((r) => r.json()),
        fetch(`${baseUrl}/events/${httpEvtId}/proceed-with-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: tenantId }),
        }).then((r) => r.json()),
        fetch(`${baseUrl}/events/${httpEvtId}/sequence/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: tenantId }),
        }).then((r) => r.json()),
      ]);

      await new Promise((r) => setTimeout(r, 120));
      const eventCampaigns = callbridgeStorage.getCampaigns(httpEvtId);
      const httpDispatched = dispatchedCalls.slice(countBeforeHttp);
      assert(resA.success && resB.success && resC.success, 'All duplicate concurrent trigger requests respond cleanly');
      assert(eventCampaigns.length === 1, 'Only ONE Marriage campaign created despite 3 simultaneous start/proceed calls');
      assert(httpDispatched.length === 1, 'Only ONE outbound call initiated despite simultaneous HTTP requests');
      assert(httpDispatched[0].phone === h1.phone, 'Dispatched call belongs to Contact 1 (not Contact 2)');

      // Cleanly terminate active HTTP campaign call
      VapiService.handleWebhook({
        message: {
          type: 'status-update',
          status: 'ended',
          endedReason: 'customer-ended-call',
          call: { id: httpDispatched[0].providerCallId, status: 'ended', durationSeconds: 10 },
        },
      });
      await new Promise((r) => setTimeout(r, 750));
      const h2Call = dispatchedCalls[dispatchedCalls.length - 1];
      if (h2Call.phone === h2.phone) {
        VapiService.handleWebhook({
          message: {
            type: 'status-update',
            status: 'ended',
            endedReason: 'customer-ended-call',
            call: { id: h2Call.providerCallId, status: 'ended', durationSeconds: 10 },
          },
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      server.close();
    }

    // =========================================================================
    // PART 4: PRIORITY 2 — Persisted Restart Recovery + Separate Campaigns Isolation
    // =========================================================================
    console.log('\n--- PART 4: Persisted Lock Recovery & Two Independent Marriage Campaigns ---');
    const recEventId = `evt_marr_rec_${runId}`;
    const recCampId = `camp_marr_rec_${runId}`;
    callbridgeStorage.saveEvent({
      id: recEventId,
      name: 'Restart Recovery Wedding',
      type: 'marriage_event',
      language: 'te',
      config: { approvedScript: 'వివాహ ఆహ్వానం' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const recC1 = callbridgeStorage.saveContact({
      id: `cnt_rec_1_${runId}`,
      userId: tenantId,
      eventId: recEventId,
      name: 'Recovery Guest 1',
      phone: '+919700111111',
      originalPhone: '+919700111111',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const recC2 = callbridgeStorage.saveContact({
      id: `cnt_rec_2_${runId}`,
      userId: tenantId,
      eventId: recEventId,
      name: 'Recovery Guest 2',
      phone: '+919700222222',
      originalPhone: '+919700222222',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const recUuid1 = `01999999-aaaa-7000-8000-${runId.toString(16).slice(-12)}`;
    const recJob1Id = `job_rec_1_${runId}`;
    const recJob2Id = `job_rec_2_${runId}`;
    callbridgeStorage.saveCampaign({
      id: recCampId,
      eventId: recEventId,
      clientId: tenantId,
      name: 'Recovered Wedding Camp',
      status: 'running',
      concurrencyLimit: 1,
      activeCalls: 1,
      activeCallId: recJob1Id,
      activeCallProviderId: recUuid1,
      activeCallStatus: 'calling',
      totalContacts: 2,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    callbridgeStorage.saveCallJob({
      id: recJob1Id,
      campaignId: recCampId,
      eventId: recEventId,
      contactId: recC1.id,
      contactName: recC1.name,
      contactPhone: recC1.phone,
      status: 'in_progress',
      providerCallId: recUuid1,
      retryCount: 0,
      maxRetries: 1,
      metadata: { queueOrder: 0, moduleType: 'marriage_event' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    callbridgeStorage.saveCallJob({
      id: recJob2Id,
      campaignId: recCampId,
      eventId: recEventId,
      contactId: recC2.id,
      contactName: recC2.name,
      contactPhone: recC2.phone,
      status: 'pending',
      retryCount: 0,
      maxRetries: 1,
      metadata: { queueOrder: 1, moduleType: 'marriage_event' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // While recUuid1 is still in_progress, processNext & reconcile must NOT dial Contact 2!
    const beforeRec = dispatchedCalls.length;
    (queueManager as any).activeRunners.set(recCampId, { campaignId: recCampId, isPaused: false, isStopped: false, timer: null });
    await queueManager.reconcileCampaign(recCampId);
    queueManager.processNext(recCampId);
    await new Promise((r) => setTimeout(r, 80));
    assert(dispatchedCalls.length === beforeRec, 'Persisted activeCallId lock prevents Contact 2 dispatch while Call 1 active across restart');

    // Now provider reports recUuid1 completed -> reconcile advances cleanly to Contact 2
    VapiService.getCallStatus = async (id: string) => {
      if (id === recUuid1) {
        return { id, status: 'completed', isTerminal: true, duration: 15 };
      }
      return { id, status: 'in_progress', isTerminal: false };
    };
    await queueManager.reconcileCampaign(recCampId);
    await new Promise((r) => setTimeout(r, 750));
    assert(dispatchedCalls.length === beforeRec + 1 && dispatchedCalls[dispatchedCalls.length - 1].phone === recC2.phone, 'Reconciliation unlocks and dispatches Contact 2 once active call reaches terminal');

    // Separate Campaign Isolation Test (Campaign X and Campaign Y running simultaneously)
    const campX = recCampId; // currently active with recC2's providerCallId
    const campXCall = dispatchedCalls[dispatchedCalls.length - 1];
    const campYEvtId = `evt_marr_isoY_${runId}`;
    const campYId = `camp_marr_isoY_${runId}`;
    callbridgeStorage.saveEvent({
      id: campYEvtId,
      name: 'Wedding Y Independent',
      type: 'marriage_event',
      language: 'te',
      config: { approvedScript: 'వివాహ ఆహ్వానం Y' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const yC1 = callbridgeStorage.saveContact({
      id: `cnt_isoY_1_${runId}`,
      userId: tenantId,
      eventId: campYEvtId,
      name: 'Y Guest 1',
      phone: '+919600111111',
      originalPhone: '+919600111111',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    callbridgeStorage.saveCampaign({
      id: campYId,
      eventId: campYEvtId,
      clientId: tenantId,
      name: 'Wedding Y Camp',
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
    queueManager.createCampaignJobs(campYId, campYEvtId, [yC1.id]);
    queueManager.startCampaign(campYId);
    await new Promise((r) => setTimeout(r, 80));
    const campYCall = dispatchedCalls[dispatchedCalls.length - 1];
    assert(campYCall.phone === yC1.phone, 'Separate Marriage Event Campaign Y runs independently from active Campaign X');

    // Complete Y without affecting X
    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'user',
        transcript: 'తప్పకుండా వస్తాను',
        call: { id: campYCall.providerCallId },
      },
    });
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'customer-ended-call',
        call: { id: campYCall.providerCallId, status: 'ended', durationSeconds: 14 },
      },
    });
    await new Promise((r) => setTimeout(r, 80));

    const freshX = callbridgeStorage.getCampaign(campX);
    const freshY = callbridgeStorage.getCampaign(campYId);
    assert(freshY?.status === 'completed' && (freshY?.activeCalls ?? 0) === 0, 'Campaign Y finishes cleanly');
    assert(freshX?.status === 'running' && freshX?.activeCalls === 1, 'Campaign X stays undisturbed and active while Campaign Y finishes');

    // Finish X cleanly
    VapiService.handleWebhook({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'customer-ended-call',
        call: { id: campXCall.providerCallId, status: 'ended', durationSeconds: 14 },
      },
    });
    await new Promise((r) => setTimeout(r, 80));
    assert(callbridgeStorage.getCampaign(campX)?.status === 'completed', 'Campaign X completes cleanly after its final call');
  } finally {
    VapiService.createOutboundCall = origCreateOutbound;
    VapiService.getCallStatus = origGetCallStatus;
    VapiService.terminateCall = origTerminateCall;
    VapiService.sendLiveCallControl = origSendLiveCallControl;
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} / ${passed + failed} ASSERTIONS PASSED`);
  console.log('================================================================\n');
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
