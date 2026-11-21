import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';

async function runSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: MARRIAGE FINAL ACKNOWLEDGEMENT & CALL TERMINATION FIX');
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
  const tenantId = `tenant_marr_ack_${runId}`;
  callbridgeStorage.saveTenant({
    id: tenantId,
    name: 'Marriage Ack Tenant',
    email: 'marr-ack@example.com',
    organization: 'Test Wedding',
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

  const origCreateOutbound = VapiService.createOutboundCall;
  const origGetCallStatus = VapiService.getCallStatus;
  const origTerminateCall = VapiService.terminateCall;
  const origSendLiveCallControl = VapiService.sendLiveCallControl;
  const origFetch = globalThis.fetch;
  const origResolvePhone = VapiService.resolveValidPhoneNumberId;
  const origResolveCred = (VapiService as any).resolveVapiElevenLabsCredential;
  const origVerifyVoice = ElevenLabsService.verifyVoiceExists;
  const prevVapiKey = process.env.VAPI_PRIVATE_API_KEY;
  const prevPhoneId = process.env.VAPI_PHONE_NUMBER_ID;

  try {
    // =========================================================================
    // 1. Outbound tool config check: request-complete/request-failed removed
    // =========================================================================
    console.log('--- 1. Assistant & Tool Configuration Verification ---');
    let capturedBody: any = null;
    try {
      process.env.VAPI_PRIVATE_API_KEY = 'mock-vapi-key';
      process.env.VAPI_PHONE_NUMBER_ID = 'mock-phone-id';
      VapiService.resolveValidPhoneNumberId = async () => 'mock-phone-id';
      (VapiService as any).resolveVapiElevenLabsCredential = async () => undefined;
      ElevenLabsService.verifyVoiceExists = async () => ({ valid: true });
      globalThis.fetch = (async (_url: any, init?: any) => {
        if (init?.body) capturedBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: `01988888-0001-7000-8000-${runId.toString(16).slice(-12)}`,
            status: 'queued',
            monitor: {
              controlUrl: 'https://api.vapi.ai/call/control/mock-cfg',
              controlAuthenticationEnabled: false,
            },
          }),
        } as any;
      }) as any;

      const cfgEventId = `evt_marr_cfg_${runId}`;
      const cfgCampId = `camp_marr_cfg_${runId}`;
      callbridgeStorage.saveEvent({
        id: cfgEventId,
        name: 'Wedding Config Event',
        type: 'marriage_event',
        language: 'te',
        config: { approvedScript: 'నమస్కారం! వివాహ వేడుకకు ఆహ్వానం. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await origCreateOutbound.call(VapiService, {
        phoneNumber: '+919876543200',
        contactName: 'Config Guest',
        voiceId: 'mock_voice',
        moduleType: 'marriage_event',
        script: 'నమస్కారం! వివాహ వేడుకకు ఆహ్వానం. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?',
        language: 'te',
        campaignId: cfgCampId,
        eventId: cfgEventId,
        contactId: 'cnt_cfg',
        clientId: tenantId,
        callId: `job_cfg_${runId}`,
        jobId: `job_cfg_${runId}`,
      });

      const assistantCfg = capturedBody?.assistant || capturedBody?.assistantOverrides;
      const rsvpTool = (assistantCfg?.model?.tools || []).find((t: any) => t?.function?.name === 'recordMarriageRsvp');
      const hasRequestComplete = (rsvpTool?.messages || []).some((m: any) => m.type === 'request-complete');
      const hasRequestFailed = (rsvpTool?.messages || []).some((m: any) => m.type === 'request-failed');
      assert(!hasRequestComplete, 'marriageRsvpTool omits empty request-complete message so Vapi never suppresses post-tool speech');
      assert(!hasRequestFailed, 'marriageRsvpTool omits empty request-failed message');
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
    // 2. Setup Mocked Live Call Control & Termination Observers
    // =========================================================================
    const sayCommands: Array<{ controlUrl: string; command: any; at: number }> = [];
    const termCommands: Array<{ callId: string; at: number }> = [];

    VapiService.sendLiveCallControl = async (controlUrl: string, _auth?: boolean, cmd: Record<string, any> = { type: 'end-call' }) => {
      if (cmd?.type === 'say') {
        sayCommands.push({ controlUrl, command: cmd, at: Date.now() });
      }
      return { success: true, status: 200 };
    };
    VapiService.terminateCall = async (callId: string) => {
      termCommands.push({ callId, at: Date.now() });
      return { success: true, message: 'mock terminated' };
    };

    const eventId = `evt_marr_fix_${runId}`;
    const campaignId = `camp_marr_fix_${runId}`;
    callbridgeStorage.saveEvent({
      id: eventId,
      name: 'Wedding Ack & Termination Regression',
      type: 'marriage_event',
      language: 'te',
      config: { approvedScript: 'మా వివాహ వేడుకకు తప్పకుండా విచ్చేయగలరు. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    callbridgeStorage.saveCampaign({
      id: campaignId,
      eventId,
      clientId: tenantId,
      name: 'Marriage Ack Campaign',
      status: 'running',
      concurrencyLimit: 1,
      totalContacts: 8,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let callSeq = 0;
    function setupCall(phone: string) {
      callSeq++;
      const providerId = `01977777-${String(callSeq).padStart(4, '0')}-7000-8000-${runId.toString(16).slice(-12)}`;
      const jobId = `job_fix_${callSeq}_${runId}`;
      const controlUrl = `https://api.vapi.ai/call/control/mock-fix-${callSeq}`;
      callbridgeStorage.saveCallJob({
        id: jobId,
        campaignId,
        eventId,
        contactId: `cnt_fix_${callSeq}`,
        contactName: `Guest ${callSeq}`,
        contactPhone: phone,
        status: 'calling',
        providerCallId: providerId,
        retryCount: 0,
        maxRetries: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { controlUrl, controlAuthenticationEnabled: false, moduleType: 'marriage_event' },
      });
      VapiService.registerTransientActiveCall(providerId, { campaignId, jobId, eventId, phone });
      VapiService.activeCallControls.set(providerId, { controlUrl, controlAuthenticationEnabled: false });
      VapiService.initMarriageCallState(providerId);
      VapiService.handleWebhook({ message: { type: 'status-update', status: 'in-progress', call: { id: providerId } } });
      VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: providerId } } });
      return { providerId, jobId, controlUrl };
    }

    // =========================================================================
    // CASE A: "వస్తున్నాము." -> natural LLM speech + duplicate/stray speech-update:stopped protection
    // =========================================================================
    console.log('\n--- 2. Phrase "వస్తున్నాము." + Stray speech-update:stopped Guard ---');
    const c1 = setupCall('+919811111101');
    const termCountBeforeC1 = termCommands.length;
    const sayCountBeforeC1 = sayCommands.length;

    // Partial transcript arrives first -> must NOT lock state prematurely
    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'user',
        transcriptType: 'partial',
        transcript: 'వస్తు...',
        call: { id: c1.providerId },
      },
    });
    assert(
      VapiService.getMarriageCallState(c1.providerId).state === 'STATE_2_WAITING_FOR_RSVP',
      'Partial user transcript keeps state in STATE_2_WAITING_FOR_RSVP'
    );

    // Final transcript "వస్తున్నాము." arrives -> saved as ATTENDING
    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'user',
        transcriptType: 'final',
        transcript: 'వస్తున్నాము.',
        call: { id: c1.providerId },
      },
    });
    assert(VapiService.getMarriageCallState(c1.providerId).rsvpCategory === 'ATTENDING', '"వస్తున్నాము." recorded as ATTENDING');

    // Stray speech-update: stopped arrives BEFORE ack has even started -> must NOT cut off the call!
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c1.providerId } },
    });
    await new Promise((r) => setTimeout(r, 40));
    assert(
      termCommands.length === termCountBeforeC1 && !VapiService.getMarriageCallState(c1.providerId).endCallRequested,
      'Stray speech-update:stopped before ack starts does NOT prematurely terminate call'
    );

    // Assistant speaks exact acknowledgement
    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'assistant',
        transcript: 'సరే అండి, ధన్యవాదాలు.',
        call: { id: c1.providerId },
      },
    });
    assert(termCommands.length === termCountBeforeC1, 'Call remains active while acknowledgement audio plays');

    // Audio playback completes -> termination triggered!
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c1.providerId } },
    });
    await new Promise((r) => setTimeout(r, 40));
    assert(termCommands.length === termCountBeforeC1 + 1, 'Termination triggered cleanly after ack playback stopped');
    assert(sayCommands.length === sayCountBeforeC1, 'Fallback say not dispatched when assistant spoke ack naturally (no double ack)');

    // Duplicate speech-update:stopped + status-update:ended must NOT terminate twice
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c1.providerId } },
    });
    VapiService.handleWebhook({
      message: { type: 'status-update', status: 'ended', endedReason: 'assistant-said-end-call-phrase', call: { id: c1.providerId, durationSeconds: 18 } },
    });
    VapiService.handleWebhook({
      message: { type: 'end-of-call-report', endedReason: 'assistant-said-end-call-phrase', call: { id: c1.providerId, durationSeconds: 18 } },
    });
    assert(termCommands.length === termCountBeforeC1 + 1, 'Duplicate webhooks trigger termination exactly once');

    // =========================================================================
    // CASE B: "వస్తాము." -> tool-call returns, LLM fails to speak -> Fallback live say + playback wait + termination
    // =========================================================================
    console.log('\n--- 3. Phrase "వస్తాము." + Silent LLM Tool Fallback (say + playback wait + termination) ---');
    const c2 = setupCall('+919811111102');
    const sayBeforeC2 = sayCommands.length;
    const termBeforeC2 = termCommands.length;

    const tcRes2 = VapiService.handleWebhook({
      message: {
        type: 'tool-calls',
        call: { id: c2.providerId, monitor: { controlUrl: c2.controlUrl, controlAuthenticationEnabled: false } },
        toolCalls: [{ id: 'tc_2', function: { name: 'recordMarriageRsvp', arguments: { category: 'ATTENDING', userSpeech: 'వస్తాము.' } } }],
      },
    });
    assert(tcRes2.results?.[0]?.result === 'సరే అండి, ధన్యవాదాలు.', '"వస్తాము." tool returns exact ack phrase');
    assert(VapiService.getMarriageCallState(c2.providerId).rsvpCategory === 'ATTENDING', '"వస్తాము." recorded as ATTENDING');

    // Stray speech-update: stopped right after tool call before LLM spoke -> must NOT kill call!
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c2.providerId } },
    });
    await new Promise((r) => setTimeout(r, 40));
    assert(termCommands.length === termBeforeC2, 'Stray speech-update:stopped right after tool-call does NOT kill call before ack');

    // Wait 1750ms for ackWatchdogTimer to dispatch live control "say"
    await new Promise((r) => setTimeout(r, 1750));
    assert(sayCommands.length === sayBeforeC2 + 1, 'Fallback live say dispatched once after silent LLM');
    assert(
      sayCommands[sayCommands.length - 1].command.content === 'సరే అండి, ధన్యవాదాలు.' &&
      sayCommands[sayCommands.length - 1].command.type === 'say',
      'Live control say delivers exact phrase "సరే అండి, ధన్యవాదాలు."'
    );
    assert(termCommands.length === termBeforeC2, 'Call still NOT terminated until say playback finishes');

    // Vapi emits speech-update: started then stopped for the say audio
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'started', call: { id: c2.providerId } },
    });
    assert(termCommands.length === termBeforeC2, 'Call remains open while say audio is playing');
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c2.providerId } },
    });
    await new Promise((r) => setTimeout(r, 50));
    assert(termCommands.length === termBeforeC2 + 1, 'Termination fires right after say audio completes');

    VapiService.handleWebhook({
      message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call', call: { id: c2.providerId, durationSeconds: 20 } },
    });

    // =========================================================================
    // CASE C: "వస్తున్నామో లేదో చూస్తాము." -> Transcript classifies ATTENDING, LLM speaks wrong clarification -> Immediate say + terminate
    // =========================================================================
    console.log('\n--- 4. Phrase "వస్తున్నామో లేదో చూస్తాము." + Non-Closing Assistant Speech Guard ---');
    const c3 = setupCall('+919811111103');
    const sayBeforeC3 = sayCommands.length;
    const termBeforeC3 = termCommands.length;

    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'user',
        transcriptType: 'final',
        transcript: 'వస్తున్నామో లేదో చూస్తాము.',
        call: { id: c3.providerId },
      },
    });
    assert(
      VapiService.getMarriageCallState(c3.providerId).rsvpCategory === 'ATTENDING',
      '"వస్తున్నామో లేదో చూస్తాము." preserves existing ATTENDING classification'
    );

    // LLM wrongly asks a clarification instead of saying "సరే అండి, ధన్యవాదాలు."
    VapiService.handleWebhook({
      message: {
        type: 'transcript',
        role: 'assistant',
        transcript: 'మీరు వివాహ వేడుకకు వస్తున్నారా?',
        call: { id: c3.providerId },
      },
    });
    VapiService.handleWebhook({
      message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c3.providerId } },
    });
    await new Promise((r) => setTimeout(r, 50));

    assert(termCommands.length === termBeforeC3, 'Call does NOT terminate after wrong non-closing assistant phrase');
    assert(sayCommands.length === sayBeforeC3 + 1, 'Exact acknowledgement "సరే అండి, ధన్యవాదాలు." dispatched via say right after non-closing utterance');
    assert(sayCommands[sayCommands.length - 1].command.content === 'సరే అండి, ధన్యవాదాలు.', 'Say content matches exact acknowledgement');

    // Playback completes
    VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'started', call: { id: c3.providerId } } });
    VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c3.providerId } } });
    await new Promise((r) => setTimeout(r, 50));
    assert(termCommands.length === termBeforeC3 + 1, 'Termination fires after acknowledgement playback finishes');

    VapiService.handleWebhook({
      message: { type: 'status-update', status: 'ended', endedReason: 'assistant-ended-call', call: { id: c3.providerId, durationSeconds: 22 } },
    });

    // =========================================================================
    // CASE D: "ఆలోచిస్తాము." & "వస్తామో లేదో ఆలోచిస్తాము." via tool-call ATTENDING + speech-update:started/stopped (no assistant transcript)
    // =========================================================================
    console.log('\n--- 5. Phrases "ఆలోచిస్తాము." & "వస్తామో లేదో ఆలోచిస్తాము." ---');
    for (const phrase of ['ఆలోచిస్తాము.', 'వస్తామో లేదో ఆలోచిస్తాము.']) {
      const c = setupCall(phrase === 'ఆలోచిస్తాము.' ? '+919811111104' : '+919811111105');
      const sayBefore = sayCommands.length;
      const termBefore = termCommands.length;

      // Transcript arrives first
      VapiService.handleWebhook({
        message: { type: 'transcript', role: 'user', transcript: phrase, call: { id: c.providerId } },
      });
      // Tool-call records ATTENDING (preserving existing app behavior)
      const tcRes = VapiService.handleWebhook({
        message: {
          type: 'tool-calls',
          call: { id: c.providerId },
          toolCalls: [{ id: `tc_${callSeq}`, function: { name: 'recordMarriageRsvp', arguments: { category: 'ATTENDING', userSpeech: phrase } } }],
        },
      });
      assert(tcRes.results?.[0]?.result === 'సరే అండి, ధన్యవాదాలు.', `"${phrase}" tool returns exact ack`);

      // Assistant plays audio (speech-update started -> stopped, without separate assistant transcript)
      VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'started', call: { id: c.providerId } } });
      await new Promise((r) => setTimeout(r, 40));
      assert(termCommands.length === termBefore, `"${phrase}" call stays connected while TTS plays`);

      VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c.providerId } } });
      await new Promise((r) => setTimeout(r, 50));
      assert(termCommands.length === termBefore + 1, `"${phrase}" call terminates cleanly after TTS playback finishes`);
      assert(sayCommands.length === sayBefore, `"${phrase}" spoken once via natural assistant TTS without duplicate fallback say`);

      VapiService.handleWebhook({
        message: { type: 'status-update', status: 'ended', endedReason: 'assistant-said-end-call-phrase', call: { id: c.providerId, durationSeconds: 19 } },
      });
    }

    // =========================================================================
    // CASE E: Definite ATTENDING ("తప్పకుండా వస్తాను") and NOT_ATTENDING ("రాను")
    // =========================================================================
    console.log('\n--- 6. Definite ATTENDING ("తప్పకుండా వస్తాను") & NOT_ATTENDING ("రాను") ---');
    for (const item of [
      { phrase: 'తప్పకుండా వస్తాను', expected: 'ATTENDING', phone: '+919811111106' },
      { phrase: 'రాను', expected: 'NOT_ATTENDING', phone: '+919811111107' },
    ]) {
      const c = setupCall(item.phone);
      const termBefore = termCommands.length;
      VapiService.handleWebhook({
        message: { type: 'transcript', role: 'user', transcript: item.phrase, call: { id: c.providerId } },
      });
      assert(VapiService.getMarriageCallState(c.providerId).rsvpCategory === item.expected, `"${item.phrase}" classified as ${item.expected}`);
      VapiService.handleWebhook({
        message: { type: 'transcript', role: 'assistant', transcript: 'సరే అండి, ధన్యవాదాలు.', call: { id: c.providerId } },
      });
      VapiService.handleWebhook({
        message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: c.providerId } },
      });
      await new Promise((r) => setTimeout(r, 50));
      assert(termCommands.length === termBefore + 1, `"${item.phrase}" terminated after ack playback`);
      VapiService.handleWebhook({
        message: { type: 'status-update', status: 'ended', endedReason: 'assistant-said-end-call-phrase', call: { id: c.providerId, durationSeconds: 16 } },
      });
    }

    // Verify analytics totals updated accurately across all calls (preserving existing classification rules)
    const agg = callbridgeStorage.getAggregateAnalytics(campaignId);
    assert(agg.marriageEvent?.attendingCount === 5, `Analytics attendingCount preserved accurately (got ${agg.marriageEvent?.attendingCount})`);
    assert(agg.marriageEvent?.maybeAttendingCount === 1, `Analytics maybeAttendingCount preserved accurately (got ${agg.marriageEvent?.maybeAttendingCount})`);
    assert(agg.marriageEvent?.notAttendingCount === 1, `Analytics notAttendingCount preserved accurately (got ${agg.marriageEvent?.notAttendingCount})`);

    // =========================================================================
    // CASE F: Sequential Queue Advancement Only After Confirmed Terminal Status
    // =========================================================================
    console.log('\n--- 7. Sequential Calling Advancement Order After Ack + Termination ---');
    const seqEventId = `evt_marr_seq_ack_${runId}`;
    const seqCampId = `camp_marr_seq_ack_${runId}`;
    callbridgeStorage.saveEvent({
      id: seqEventId,
      name: 'Sequential Ack Order Wedding',
      type: 'marriage_event',
      language: 'te',
      config: { approvedScript: 'వివాహ ఆహ్వానం. మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const seqContacts = ['+919822222201', '+919822222202'].map((phone, i) =>
      callbridgeStorage.saveContact({
        id: `cnt_seq_ack_${i}_${runId}`,
        userId: tenantId,
        eventId: seqEventId,
        name: `Seq Guest ${i + 1}`,
        phone,
        originalPhone: phone,
        consentStatus: 'granted',
        optOut: false,
        importSource: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    callbridgeStorage.saveCampaign({
      id: seqCampId,
      eventId: seqEventId,
      clientId: tenantId,
      name: 'Seq Ack Camp',
      status: 'draft',
      concurrencyLimit: 1,
      totalContacts: 2,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const seqDispatched: Array<{ providerCallId: string; phone: string }> = [];
    VapiService.createOutboundCall = async (params: any) => {
      const idx = seqDispatched.length + 1;
      const pid = `01966666-${String(idx).padStart(4, '0')}-7000-8000-${runId.toString(16).slice(-12)}`;
      seqDispatched.push({ providerCallId: pid, phone: params.phoneNumber });
      VapiService.initMarriageCallState(pid);
      VapiService.registerTransientActiveCall(pid, { campaignId: params.campaignId, jobId: params.jobId, eventId: params.eventId, phone: params.phoneNumber });
      VapiService.activeCallControls.set(pid, { controlUrl: `https://api.vapi.ai/call/control/mock-seq-${idx}`, controlAuthenticationEnabled: false });
      return { success: true, callId: params.jobId, providerCallId: pid, status: 'calling' };
    };
    VapiService.getCallStatus = async (id: string) => ({ id, status: 'in_progress', isTerminal: false });

    queueManager.createCampaignJobs(seqCampId, seqEventId, seqContacts.map((c) => c.id));
    queueManager.startCampaign(seqCampId);
    await new Promise((r) => setTimeout(r, 80));
    assert(seqDispatched.length === 1 && seqDispatched[0].phone === '+919822222201', 'Only Contact 1 dialed initially');

    const callOneId = seqDispatched[0].providerCallId;
    const termBeforeSeq = termCommands.length;
    VapiService.handleWebhook({ message: { type: 'status-update', status: 'in-progress', call: { id: callOneId } } });
    VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: callOneId } } });
    VapiService.handleWebhook({ message: { type: 'transcript', role: 'user', transcript: 'వస్తున్నాము.', call: { id: callOneId } } });
    VapiService.handleWebhook({ message: { type: 'transcript', role: 'assistant', transcript: 'సరే అండి, ధన్యవాదాలు.', call: { id: callOneId } } });
    assert(seqDispatched.length === 1, 'Contact 2 NOT dialed while Contact 1 ack plays');

    VapiService.handleWebhook({ message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: callOneId } } });
    await new Promise((r) => setTimeout(r, 80));
    assert(termCommands.length === termBeforeSeq + 1, 'Contact 1 termination triggered after ack stops');
    assert(seqDispatched.length === 1, 'Contact 2 STILL NOT dialed before provider terminal status-update arrives');

    VapiService.handleWebhook({
      message: { type: 'status-update', status: 'ended', endedReason: 'assistant-said-end-call-phrase', call: { id: callOneId, durationSeconds: 20 } },
    });
    await new Promise((r) => setTimeout(r, 800));
    assert(seqDispatched.length === 2 && seqDispatched[1].phone === '+919822222202', 'Contact 2 dialed strictly after Call 1 provider terminal status');

    // Finish Call 2
    VapiService.handleWebhook({
      message: { type: 'status-update', status: 'ended', endedReason: 'assistant-said-end-call-phrase', call: { id: seqDispatched[1].providerCallId, durationSeconds: 18 } },
    });
    await new Promise((r) => setTimeout(r, 100));
    assert(callbridgeStorage.getCampaign(seqCampId)?.status === 'completed', 'Sequential campaign completed cleanly');
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
