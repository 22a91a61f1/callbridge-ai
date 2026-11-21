import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { callbridgeStorage, type ContactRecord, type CampaignRecord, type VoiceProfileRecord } from '../server/storage/callbridgeStorage.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { providerCapacityController } from '../server/campaign/providerCapacityController.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';
import { callbridgeRouter } from '../server/callbridgeRouter.ts';
import type { AuthenticatedRequest } from '../server/auth/firebaseAuthMiddleware.ts';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: any, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(id: string, name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const info = await fn();
    results.push({ id, name, passed: true, details: info || 'OK' });
    console.log(`  [PASS] ${id}: ${name}${info ? ` — ${info}` : ''}`);
  } catch (err: any) {
    results.push({ id, name, passed: false, details: err?.message || String(err) });
    console.error(`  [FAIL] ${id}: ${name} — ${err?.message || err}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 4000, intervalMs = 25): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

// ==========================================
// CONTROLLABLE MOCK VAPI PROVIDER HARNESS
// ==========================================
interface MockProviderCall {
  providerCallId: string;
  jobId: string;
  campaignId: string;
  eventId: string;
  tenantId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'ended';
  endedReason?: string;
  durationSeconds?: number;
  terminatedRequested?: boolean;
  forcePollError?: boolean;
  createdAt: number;
}

const mockCallsByProviderId = new Map<string, MockProviderCall>();
const dispatchLog: Array<{ tenantId: string; campaignId: string; contactName: string; providerCallId: string; jobId: string; at: number }> = [];
let mockCallSeq = 0;
let injectNextRateLimit: { remaining: number; retryAfterMs: number } | null = null;
let autoCompleteDelayMs: number | null = null;

function resetMockProvider() {
  mockCallsByProviderId.clear();
  dispatchLog.length = 0;
  mockCallSeq = 0;
  injectNextRateLimit = null;
  autoCompleteDelayMs = null;
}

function getActiveMockCalls(): MockProviderCall[] {
  return Array.from(mockCallsByProviderId.values()).filter((c) => c.status !== 'ended');
}

function getActiveMockCallsForTenant(tenantId: string): MockProviderCall[] {
  return getActiveMockCalls().filter((c) => c.tenantId === tenantId);
}

async function finishMockCallViaWebhook(
  providerCallId: string,
  options: {
    endedReason?: string;
    durationSeconds?: number;
    answered?: boolean;
    eventId?: string;
  } = {}
): Promise<any> {
  const mc = mockCallsByProviderId.get(providerCallId);
  if (!mc) throw new Error(`Mock call ${providerCallId} not found`);
  const answered = options.answered !== false;
  const durationSeconds = answered ? (options.durationSeconds ?? 25) : 0;
  const endedReason = options.endedReason || (answered ? 'customer-ended-call' : 'customer-did-not-answer');
  mc.status = 'ended';
  mc.endedReason = endedReason;
  mc.durationSeconds = durationSeconds;

  const payload = {
    message: {
      type: 'end-of-call-report',
      endedReason,
      durationSeconds,
      transcript: answered ? 'AI: నమస్కారం\nUser: బాగుంది' : '',
      call: {
        id: providerCallId,
        status: 'ended',
        endedReason,
        durationSeconds,
        metadata: {
          jobId: mc.jobId,
          campaignId: mc.campaignId,
          eventId: mc.eventId,
          clientId: mc.tenantId,
          contactId: mc.contactId,
        },
      },
    },
  };

  const res = await VapiService.handleWebhook(payload);
  if (res.job?.campaignId && res.isTerminal) {
    queueManager.onJobTerminal(res.job.campaignId, res.job.id, {
      isAnswered: res.job.status === 'completed',
      isNoAnswer: res.job.status === 'no_answer',
      isFailed: res.job.status === 'failed',
      status: res.job.status,
    });
  }
  return res;
}

function setupTenantFixtures(tenantId: string, eventId: string, contactNames: string[], basePhoneSuffix: number): { contacts: ContactRecord[]; campaign: CampaignRecord } {
  const now = new Date().toISOString();
  callbridgeStorage.saveTenant({
    id: tenantId,
    name: `Customer ${tenantId}`,
    email: `${tenantId}@test.callbridge.ai`,
    organization: `Org ${tenantId}`,
    createdAt: now,
    updatedAt: now,
  });

  // Ensure generous subscription balance for tests
  const sub = callbridgeStorage.getSubscription(tenantId);
  sub.planId = 'pro';
  sub.totalSeconds = 36000;
  sub.usedSeconds = 0;
  sub.remainingSeconds = 36000;
  sub.status = 'active';
  callbridgeStorage.saveSubscription(sub);

  // Ensure approved voice profile for each module type
  const ev = callbridgeStorage.getEvent(eventId);
  const eventType = (ev?.type || 'public_survey') as any;
  const voiceId = `el_voice_${tenantId}_${eventType}`;
  const vp: VoiceProfileRecord = {
    id: `vp_${tenantId}_${eventType}`,
    clientId: tenantId,
    eventType,
    eventId,
    name: `Approved Voice ${tenantId}`,
    voiceName: `Approved Voice ${tenantId}`,
    provider: 'elevenlabs',
    providerVoiceId: voiceId,
    elevenLabsVoiceId: voiceId,
    status: 'active',
    voiceStatus: 'ready',
    approvalStatus: 'approved',
    isApproved: true,
    languageCapabilities: ['te', 'hi', 'en'],
    createdAt: now,
    updatedAt: now,
  };
  callbridgeStorage.saveVoiceProfile(vp);
  callbridgeStorage.setTenantApprovedVoice(tenantId, vp.id, eventType, eventId);

  const baseTime = Date.now();
  const contacts: ContactRecord[] = contactNames.map((name, idx) => {
    const phone = `+9198${String(basePhoneSuffix).padStart(4, '0')}${String(idx + 1).padStart(4, '0')}`;
    const c: ContactRecord = {
      id: `cnt_${tenantId}_${eventId}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      userId: tenantId,
      eventId,
      name,
      phone,
      originalPhone: phone,
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date(baseTime + idx * 50).toISOString(),
      updatedAt: new Date(baseTime + idx * 50).toISOString(),
    };
    callbridgeStorage.saveContact(c);
    return c;
  });

  const campaign: CampaignRecord = {
    id: `camp_${tenantId}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    clientId: tenantId,
    eventId,
    name: `${tenantId} Queue`,
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: contacts.length,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  callbridgeStorage.saveCampaign(campaign);
  queueManager.createCampaignJobs(campaign.id, eventId, contacts.map((c) => c.id));

  return { contacts, campaign };
}

async function cleanStateBetweenTests(): Promise<void> {
  queueManager.prepareForShutdown();
  providerCapacityController.resetInMemoryState();
  resetMockProvider();
  // Clear transient test records from memory while keeping default system events/plans
  const raw: any = (callbridgeStorage as any).data;
  raw.contacts = {};
  raw.campaigns = {};
  raw.callJobs = {};
  raw.providerCallMapping = {};
  raw.terminalJobIds = {};
  raw.processedWebhookEvents = {};
  raw.tenantQueueStates = {};
  raw.usageTransactions = {};
  raw.subscriptions = {};
  raw.aggregateAnalytics = {};
  callbridgeStorage.persist();
  await queueManager.simulateRestartAndReconcile();
}

async function httpRequest(
  baseUrl: string,
  method: string,
  urlPath: string,
  options: { tenantId?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; rawText: string }> {
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };
  if (options.tenantId) {
    headers['x-test-tenant'] = options.tenantId;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const rawText = await res.text();
  let body: any = rawText;
  try {
    body = JSON.parse(rawText);
  } catch {
    // non-json response (CSV, etc.)
  }
  return { status: res.status, body, rawText };
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'callbridge_db.json');
  const bakPath = `${dbPath}.bak`;
  const origDb = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;
  const origBak = fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : null;

  // Save original methods to restore in finally
  const origCreateOutboundCall = VapiService.createOutboundCall;
  const origGetCallStatus = VapiService.getCallStatus;
  const origTerminateCall = VapiService.terminateCall;
  const origVerifyVoiceExists = ElevenLabsService.verifyVoiceExists;

  // Install deterministic provider mocks
  (ElevenLabsService as any).verifyVoiceExists = async (voiceId: string) => ({
    valid: true,
    voiceId,
    name: `MockVoice-${voiceId}`,
  });

  (VapiService as any).createOutboundCall = async (params: any) => {
    if (injectNextRateLimit && injectNextRateLimit.remaining > 0) {
      injectNextRateLimit.remaining--;
      const err: any = new Error('Vapi HTTP 429 Too Many Requests: concurrency limit reached');
      err.isRateLimit = true;
      err.statusCode = 429;
      err.retryAfterMs = injectNextRateLimit.retryAfterMs;
      throw err;
    }

    mockCallSeq++;
    const providerCallId = `vapi_mock_${mockCallSeq}_${Date.now().toString(36)}`;
    const jobId = params.jobId || `job_direct_${mockCallSeq}`;
    const tenantId = params.clientId || params.userId || 'client_001';

    const mc: MockProviderCall = {
      providerCallId,
      jobId,
      campaignId: params.campaignId || 'test_campaign_direct',
      eventId: params.eventId || 'event_public_survey',
      tenantId,
      contactId: params.contactId || 'contact_test',
      contactName: params.contactName || 'Contact',
      phoneNumber: params.phoneNumber,
      status: 'in-progress',
      createdAt: Date.now(),
    };
    mockCallsByProviderId.set(providerCallId, mc);
    dispatchLog.push({
      tenantId,
      campaignId: mc.campaignId,
      contactName: mc.contactName,
      providerCallId,
      jobId,
      at: Date.now(),
    });

    VapiService.mapProviderCallIdToJob(
      providerCallId,
      jobId,
      mc.campaignId,
      mc.eventId,
      mc.phoneNumber,
      tenantId,
      mc.contactId
    );

    if (autoCompleteDelayMs !== null) {
      const delay = autoCompleteDelayMs;
      setTimeout(() => {
        if (mc.status !== 'ended') {
          finishMockCallViaWebhook(providerCallId, { answered: true, durationSeconds: 20 }).catch(() => null);
        }
      }, delay);
    }

    return {
      success: true,
      callId: jobId,
      providerCallId,
      status: 'in_progress',
      isSimulated: false,
      message: `Mock call placed (${providerCallId})`,
    };
  };

  (VapiService as any).getCallStatus = async (callId: string) => {
    const mc =
      mockCallsByProviderId.get(callId) ||
      Array.from(mockCallsByProviderId.values()).find((c) => c.jobId === callId);
    if (!mc) {
      return {
        callId,
        providerCallId: callId,
        status: 'error',
        httpStatus: 503,
        isTerminal: false,
        error: 'Simulated temporary network error fetching provider status',
      };
    }
    if (mc.forcePollError) {
      return {
        callId: mc.jobId,
        providerCallId: mc.providerCallId,
        status: 'error',
        httpStatus: 503,
        isTerminal: false,
        error: 'Simulated temporary provider polling timeout',
      };
    }
    const isTerminal = mc.status === 'ended';
    return {
      callId: mc.jobId,
      providerCallId: mc.providerCallId,
      status: isTerminal ? (mc.endedReason === 'customer-did-not-answer' ? 'no_answer' : mc.endedReason === 'cancelled' ? 'cancelled' : 'completed') : 'in_progress',
      rawStatus: mc.status,
      isTerminal,
      durationSeconds: mc.durationSeconds || 0,
      job: callbridgeStorage.getCallJob(mc.jobId),
    };
  };

  (VapiService as any).terminateCall = async (callId: string) => {
    const mc =
      mockCallsByProviderId.get(callId) ||
      Array.from(mockCallsByProviderId.values()).find((c) => c.jobId === callId);
    if (mc) {
      mc.terminatedRequested = true;
    }
    return { success: true, message: 'Termination requested on mock provider' };
  };

  // Start ephemeral Express server for HTTP tenant isolation & route tests
  const app = express();
  app.use(express.json());
  app.use((req: AuthenticatedRequest, _res, next) => {
    const t = req.headers['x-test-tenant'] as string | undefined;
    if (t) {
      const nowIso = new Date().toISOString();
      req.authUser = {
        uid: `uid_${t}`,
        email: `${t}@test.callbridge.ai`,
        fullName: `User ${t}`,
        role: 'customer',
        tenantId: t,
        provider: 'password',
        emailVerified: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
    }
    next();
  });
  app.use('/api/callbridge', callbridgeRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  console.log('\n================================================================');
  console.log('CALLBRIDGE AI — INDEPENDENT MULTI-USER QUEUES VERIFICATION (18 TCs)');
  console.log('================================================================\n');

  try {
    // Ensure default Public Survey event has active questions
    const publicSurveyEventId = 'event_public_survey';
    const politicalEventId = 'event_political_campaign';
    const marriageEventId = 'event_marriage_event';

    // ------------------------------------------------------------------
    // TC-01: Customer 1 sequential FIFO order (A1 -> A2 -> A3)
    // ------------------------------------------------------------------
    await runTest('TC-01', 'Customer 1 sequential FIFO order (A1 -> A2 -> A3)', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const { campaign } = setupTenantFixtures('cust_1', publicSurveyEventId, ['A1', 'A2', 'A3'], 1001);

      const startRes = queueManager.startCampaign(campaign.id);
      assert(startRes.success, 'startCampaign failed');
      await waitFor(() => dispatchLog.length === 1);
      assert(dispatchLog[0].contactName === 'A1', `Expected A1 first, got ${dispatchLog[0].contactName}`);
      assert(getActiveMockCallsForTenant('cust_1').length === 1, 'Expected exactly 1 active call for cust_1');

      // While A1 is active, A2 must NOT start
      await sleep(150);
      assert(dispatchLog.length === 1, 'A2 started prematurely while A1 was active');

      // Confirm A1 terminal -> A2 starts
      await finishMockCallViaWebhook(dispatchLog[0].providerCallId);
      await waitFor(() => dispatchLog.length === 2);
      assert(dispatchLog[1].contactName === 'A2', `Expected A2 second, got ${dispatchLog[1].contactName}`);

      // Confirm A2 terminal -> A3 starts
      await finishMockCallViaWebhook(dispatchLog[1].providerCallId);
      await waitFor(() => dispatchLog.length === 3);
      assert(dispatchLog[2].contactName === 'A3', `Expected A3 third, got ${dispatchLog[2].contactName}`);

      // Confirm A3 terminal -> campaign completed
      await finishMockCallViaWebhook(dispatchLog[2].providerCallId);
      await waitFor(() => callbridgeStorage.getCampaign(campaign.id)?.status === 'completed');
      return 'Order verified: A1 -> A2 -> A3, strictly sequential';
    });

    // ------------------------------------------------------------------
    // TC-02..TC-08: Multi-customer parallel execution & independent progression
    // ------------------------------------------------------------------
    await cleanStateBetweenTests();
    providerCapacityController.setRuntimeMaxConcurrentCalls(3);
    const f1 = setupTenantFixtures('cust_1', publicSurveyEventId, ['A1', 'A2', 'A3'], 2001);
    const f2 = setupTenantFixtures('cust_2', publicSurveyEventId, ['B1', 'B2', 'B3'], 2002);
    const f3 = setupTenantFixtures('cust_3', publicSurveyEventId, ['C1', 'C2', 'C3'], 2003);

    await runTest('TC-02', 'Customer 2 starts B1 while Customer 1 is actively calling A1', async () => {
      queueManager.startCampaign(f1.campaign.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A1'));
      queueManager.startCampaign(f2.campaign.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'B1'));

      assert(getActiveMockCallsForTenant('cust_1').length === 1, 'cust_1 should have 1 active call (A1)');
      assert(getActiveMockCallsForTenant('cust_2').length === 1, 'cust_2 should have 1 active call (B1)');
      return 'A1 and B1 active simultaneously';
    });

    await runTest('TC-03', 'Parallel execution across Customer 1, 2, and 3 when VAPI_MAX_CONCURRENT_CALLS >= 3', async () => {
      queueManager.startCampaign(f3.campaign.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'C1'));

      const active = getActiveMockCalls();
      assert(active.length === 3, `Expected 3 parallel active calls, got ${active.length}`);
      assert(providerCapacityController.getActiveCount() === 3, 'Provider capacity controller should show 3 active slots');
      return 'A1, B1, C1 running in parallel (3/3 slots)';
    });

    await runTest('TC-04', 'A1 completion advances ONLY Customer 1 to A2', async () => {
      const a1 = dispatchLog.find((d) => d.contactName === 'A1')!;
      await finishMockCallViaWebhook(a1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A2'));
      await sleep(100);

      assert(!dispatchLog.some((d) => d.contactName === 'B2'), 'B2 should NOT have started when A1 ended');
      assert(!dispatchLog.some((d) => d.contactName === 'C2'), 'C2 should NOT have started when A1 ended');
      assert(getActiveMockCallsForTenant('cust_1')[0]?.contactName === 'A2', 'cust_1 active should be A2');
      assert(getActiveMockCallsForTenant('cust_2')[0]?.contactName === 'B1', 'cust_2 active should remain B1');
      assert(getActiveMockCallsForTenant('cust_3')[0]?.contactName === 'C1', 'cust_3 active should remain C1');
      return 'Only cust_1 advanced (A1 -> A2)';
    });

    await runTest('TC-05', 'B1 completion advances ONLY Customer 2 to B2', async () => {
      const b1 = dispatchLog.find((d) => d.contactName === 'B1')!;
      await finishMockCallViaWebhook(b1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'B2'));
      await sleep(100);

      assert(!dispatchLog.some((d) => d.contactName === 'A3'), 'A3 should NOT have started when B1 ended');
      assert(!dispatchLog.some((d) => d.contactName === 'C2'), 'C2 should NOT have started when B1 ended');
      assert(getActiveMockCallsForTenant('cust_2')[0]?.contactName === 'B2', 'cust_2 active should be B2');
      return 'Only cust_2 advanced (B1 -> B2)';
    });

    await runTest('TC-06', 'Customer 1 finishes A2 -> A3 without waiting for Customer 2', async () => {
      const a2 = dispatchLog.find((d) => d.contactName === 'A2')!;
      await finishMockCallViaWebhook(a2.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A3'));
      const a3 = dispatchLog.find((d) => d.contactName === 'A3')!;
      await finishMockCallViaWebhook(a3.providerCallId);
      await waitFor(() => callbridgeStorage.getCampaign(f1.campaign.id)?.status === 'completed');

      assert(getActiveMockCallsForTenant('cust_2')[0]?.contactName === 'B2', 'cust_2 still on B2 while cust_1 finished');
      assert(getActiveMockCallsForTenant('cust_3')[0]?.contactName === 'C1', 'cust_3 still on C1 while cust_1 finished');
      return 'cust_1 completed independently while cust_2 & cust_3 stayed mid-call';
    });

    await runTest('TC-07', 'Customer 2 finishes B2 -> B3 without waiting for Customer 1 or 3', async () => {
      const b2 = dispatchLog.find((d) => d.contactName === 'B2')!;
      await finishMockCallViaWebhook(b2.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'B3'));
      const b3 = dispatchLog.find((d) => d.contactName === 'B3')!;
      await finishMockCallViaWebhook(b3.providerCallId);
      await waitFor(() => callbridgeStorage.getCampaign(f2.campaign.id)?.status === 'completed');

      assert(getActiveMockCallsForTenant('cust_3')[0]?.contactName === 'C1', 'cust_3 still on C1');
      return 'cust_2 completed independently';
    });

    await runTest('TC-08', 'Customer 3 runs independently (C1 -> C2 -> C3)', async () => {
      const c1 = dispatchLog.find((d) => d.contactName === 'C1')!;
      await finishMockCallViaWebhook(c1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'C2'));
      const c2 = dispatchLog.find((d) => d.contactName === 'C2')!;
      await finishMockCallViaWebhook(c2.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'C3'));
      const c3 = dispatchLog.find((d) => d.contactName === 'C3')!;
      await finishMockCallViaWebhook(c3.providerCallId);
      await waitFor(() => callbridgeStorage.getCampaign(f3.campaign.id)?.status === 'completed');
      return 'cust_3 progressed C1 -> C2 -> C3 and completed';
    });

    // ------------------------------------------------------------------
    // TC-09: Same customer cannot run 2 simultaneous active calls across 2 campaigns
    // ------------------------------------------------------------------
    await runTest('TC-09', 'Same customer cannot run 2 simultaneous calls across 2 campaigns', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(4);
      const campA = setupTenantFixtures('cust_same', publicSurveyEventId, ['S1', 'S2'], 3001).campaign;
      const campB = setupTenantFixtures('cust_same', politicalEventId, ['P1'], 3002).campaign;

      queueManager.startCampaign(campA.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'S1'));

      // Start second campaign for SAME customer while S1 is active
      queueManager.startCampaign(campB.id);
      await sleep(200);

      assert(getActiveMockCallsForTenant('cust_same').length === 1, 'Same customer must NEVER exceed 1 active call');
      assert(!dispatchLog.some((d) => d.contactName === 'P1'), 'Second campaign P1 must wait while S1 is active');

      // Pause campA and complete S1 -> now campB P1 can dispatch!
      queueManager.pauseCampaign(campA.id);
      const s1 = dispatchLog.find((d) => d.contactName === 'S1')!;
      await finishMockCallViaWebhook(s1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'P1'), 3500);
      assert(getActiveMockCallsForTenant('cust_same').length === 1, 'Still strictly 1 active call for cust_same');
      return 'Per-tenant active-call lock enforced across multiple campaigns';
    });

    // ------------------------------------------------------------------
    // TC-10: Pausing Customer 1 does NOT pause Customer 2
    // ------------------------------------------------------------------
    await runTest('TC-10', 'Pausing Customer 1 does NOT pause Customer 2 and preserves active lock until terminal', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const c1 = setupTenantFixtures('cust_1', publicSurveyEventId, ['A1', 'A2'], 4001).campaign;
      const c2 = setupTenantFixtures('cust_2', publicSurveyEventId, ['B1', 'B2'], 4002).campaign;

      queueManager.startCampaign(c1.id);
      queueManager.startCampaign(c2.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A1') && dispatchLog.some((d) => d.contactName === 'B1'));

      // Pause cust_1 while A1 is active
      queueManager.pauseCampaign(c1.id);
      assert(callbridgeStorage.getCampaign(c1.id)?.status === 'paused', 'c1 should be paused');
      assert(callbridgeStorage.getCampaign(c2.id)?.status === 'running', 'c2 must stay running');
      assert(providerCapacityController.hasActiveTenantCall('cust_1'), 'cust_1 active lock must stay held while A1 is live');

      // Advance cust_2 -> B2 starts normally
      const b1 = dispatchLog.find((d) => d.contactName === 'B1')!;
      await finishMockCallViaWebhook(b1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'B2'));

      // Finish A1 -> A2 must NOT start while paused, and cust_1 lock releases
      const a1 = dispatchLog.find((d) => d.contactName === 'A1')!;
      await finishMockCallViaWebhook(a1.providerCallId);
      await sleep(150);
      assert(!dispatchLog.some((d) => d.contactName === 'A2'), 'A2 must NOT start while c1 is paused');
      assert(!providerCapacityController.hasActiveTenantCall('cust_1'), 'cust_1 lock released after A1 terminal');

      // Resume cust_1 -> A2 starts
      queueManager.resumeCampaign(c1.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A2'));
      return 'Pause isolated to cust_1; cust_2 unaffected; resume dispatched A2';
    });

    // ------------------------------------------------------------------
    // TC-11: Cancelling Customer 1 does NOT cancel Customer 2 & awaits provider confirm
    // ------------------------------------------------------------------
    await runTest('TC-11', 'Cancelling Customer 1 does NOT cancel Customer 2 & awaits provider confirmation', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const fC1 = setupTenantFixtures('cust_1', publicSurveyEventId, ['A1', 'A2'], 5001);
      const c1 = fC1.campaign;
      const c2 = setupTenantFixtures('cust_2', publicSurveyEventId, ['B1', 'B2'], 5002).campaign;
      const a2JobId = callbridgeStorage.getCallJobs(c1.id).find((j) => j.contactId === fC1.contacts[1].id)!.id;

      queueManager.startCampaign(c1.id);
      queueManager.startCampaign(c2.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'A1') && dispatchLog.some((d) => d.contactName === 'B1'));

      const a1 = dispatchLog.find((d) => d.contactName === 'A1')!;
      await queueManager.cancelCampaign(c1.id);

      assert(callbridgeStorage.getCampaign(c1.id)?.status === 'cancelled', 'c1 should be cancelled');
      assert(callbridgeStorage.getCampaign(c2.id)?.status === 'running', 'c2 must remain running');
      assert(mockCallsByProviderId.get(a1.providerCallId)?.terminatedRequested === true, 'Provider terminateCall should be invoked for A1');
      // Pending A2 must be cancelled immediately (look up by jobId since terminal jobs anonymize contactName)
      const a2Job = callbridgeStorage.getCallJob(a2JobId);
      assert(a2Job?.status === 'cancelled', `Pending A2 should be cancelled, got ${a2Job?.status}`);
      // Active A1 lease must still be held in 'cancelling' state until provider confirms terminal
      assert(providerCapacityController.getTenantActiveLease('cust_1')?.state === 'cancelling', 'Active lease must stay in cancelling state until provider confirms');

      // Provider confirms A1 ended -> lease releases cleanly
      await finishMockCallViaWebhook(a1.providerCallId, { answered: false, endedReason: 'cancelled' });
      assert(!providerCapacityController.hasActiveTenantCall('cust_1'), 'cust_1 lease released after provider confirmed termination');

      // cust_2 continues uninterrupted
      const b1 = dispatchLog.find((d) => d.contactName === 'B1')!;
      await finishMockCallViaWebhook(b1.providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'B2'));
      return 'Cancel isolated to cust_1; lease held in cancelling until provider confirm';
    });

    // ------------------------------------------------------------------
    // TC-12: Browser closure (zero client requests) does NOT stop backend queue
    // ------------------------------------------------------------------
    await runTest('TC-12', 'Browser closure (zero client requests) does not stop backend queue execution', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(2);
      autoCompleteDelayMs = 80; // Simulates provider completing calls autonomously via webhooks with zero client HTTP requests
      const c1 = setupTenantFixtures('cust_headless', publicSurveyEventId, ['H1', 'H2', 'H3'], 6001).campaign;

      queueManager.startCampaign(c1.id);
      await waitFor(() => callbridgeStorage.getCampaign(c1.id)?.status === 'completed', 4000);
      autoCompleteDelayMs = null;
      const names = dispatchLog.map((d) => d.contactName);
      assert(names.join(',') === 'H1,H2,H3', `Expected H1,H2,H3, got ${names.join(',')}`);
      return 'All 3 calls completed autonomously on backend with zero client requests';
    });

    // ------------------------------------------------------------------
    // TC-13: Server restart recovery & uncertain status safety
    // ------------------------------------------------------------------
    await runTest('TC-13', 'Server restart reconciles active calls, holds lock on uncertain status, resumes safely', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const c1 = setupTenantFixtures('cust_restart', publicSurveyEventId, ['R1', 'R2'], 7001).campaign;

      queueManager.startCampaign(c1.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'R1'));
      const r1 = dispatchLog.find((d) => d.contactName === 'R1')!;

      // Case A: Provider status returns network error during restart -> lock MUST stay held, R2 MUST NOT start!
      mockCallsByProviderId.get(r1.providerCallId)!.forcePollError = true;
      await queueManager.simulateRestartAndReconcile();
      await sleep(150);

      assert(providerCapacityController.hasActiveTenantCall('cust_restart'), 'Lock must remain held when provider status is uncertain');
      assert(dispatchLog.length === 1, 'Restart with uncertain status must NEVER duplicate R1 or dispatch R2');

      // Case B: Now provider confirms R1 ended on next restart reconciliation -> lock releases and R2 dispatches!
      const mc = mockCallsByProviderId.get(r1.providerCallId)!;
      mc.forcePollError = false;
      mc.status = 'ended';
      mc.endedReason = 'customer-ended-call';
      mc.durationSeconds = 30;

      await queueManager.simulateRestartAndReconcile();
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'R2'), 3000);
      assert(dispatchLog.filter((d) => d.contactName === 'R1').length === 1, 'R1 must never be called twice');
      return 'Uncertain status held lock; confirmed terminal resumed R2 without duplicating R1';
    });

    // ------------------------------------------------------------------
    // TC-14: Shared provider capacity limit + HTTP 429 backoff retry
    // ------------------------------------------------------------------
    await runTest('TC-14', 'Provider capacity ceiling (max=2) & HTTP 429 rate-limit backoff keeps job pending', async () => {
      await cleanStateBetweenTests();
      // Part 1: Verify safe default when env unset
      providerCapacityController.setRuntimeMaxConcurrentCalls(null);
      const defaultMax = providerCapacityController.getMaxConcurrentCalls();
      assert(defaultMax >= 1, 'Default max concurrent calls must be >= 1');

      // Part 2: max=2 with 3 customers -> 3rd waits pending until slot frees
      providerCapacityController.setRuntimeMaxConcurrentCalls(2);
      const c1 = setupTenantFixtures('cap_1', publicSurveyEventId, ['X1'], 8001).campaign;
      const c2 = setupTenantFixtures('cap_2', publicSurveyEventId, ['Y1'], 8002).campaign;
      const c3 = setupTenantFixtures('cap_3', publicSurveyEventId, ['Z1'], 8003).campaign;

      queueManager.startCampaign(c1.id);
      queueManager.startCampaign(c2.id);
      queueManager.startCampaign(c3.id);
      await waitFor(() => dispatchLog.length === 2);
      await sleep(150);

      assert(dispatchLog.length === 2, `Expected max 2 active calls at capacity=2, got ${dispatchLog.length}`);
      assert(providerCapacityController.getActiveCount() === 2, 'Active provider slots must equal 2');
      const z1Job = callbridgeStorage.getCallJobs(c3.id)[0];
      assert(z1Job.status === 'pending', `3rd customer job should remain pending, got ${z1Job.status}`);

      // Free slot 1 -> 3rd customer automatically wakes and dispatches!
      await finishMockCallViaWebhook(dispatchLog[0].providerCallId);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'Z1'), 3000);

      // Finish remaining calls
      for (const d of [...dispatchLog]) {
        if (mockCallsByProviderId.get(d.providerCallId)?.status !== 'ended') {
          await finishMockCallViaWebhook(d.providerCallId);
        }
      }

      // Part 3: HTTP 429 throttling keeps job pending (not failed) and retries after backoff
      injectNextRateLimit = { remaining: 1, retryAfterMs: 500 };
      const c4 = setupTenantFixtures('cap_4', publicSurveyEventId, ['RL1'], 8004).campaign;
      queueManager.startCampaign(c4.id);
      await sleep(150);

      const rlJobMid = callbridgeStorage.getCallJobs(c4.id)[0];
      assert(rlJobMid.status === 'pending', `HTTP 429 must keep job pending (not failed), got ${rlJobMid.status}`);
      assert(providerCapacityController.getBackoffRemainingMs() > 0, 'Provider backoff window must be active after 429');

      // Wait for backoff to expire and auto-retry
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'RL1'), 3000);
      return 'Capacity max=2 enforced + HTTP 429 requeued pending and auto-retried after backoff';
    });

    // ------------------------------------------------------------------
    // TC-15: Duplicate & out-of-order webhooks idempotency
    // ------------------------------------------------------------------
    await runTest('TC-15', 'Duplicate & out-of-order webhooks do not overwrite terminal state, double-advance, or double-bill', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const c1 = setupTenantFixtures('cust_wh', publicSurveyEventId, ['W1', 'W2', 'W3'], 9001).campaign;

      queueManager.startCampaign(c1.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'W1'));
      const w1 = dispatchLog.find((d) => d.contactName === 'W1')!;

      // First confirmed end-of-call-report (40s answered)
      await finishMockCallViaWebhook(w1.providerCallId, { answered: true, durationSeconds: 40 });
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'W2'));

      const usedAfterFirst = callbridgeStorage.getSubscription('cust_wh').usedSeconds;
      assert(usedAfterFirst === 40, `Expected 40s billed after W1, got ${usedAfterFirst}`);
      const terminalStatusBeforeOutOfOrder = callbridgeStorage.getCallJob(w1.jobId)?.status;
      assert(
        terminalStatusBeforeOutOfOrder === 'completed' || terminalStatusBeforeOutOfOrder === 'interrupted',
        `Expected confirmed terminal status for W1, got ${terminalStatusBeforeOutOfOrder}`
      );

      // Out-of-order late 'in-progress' webhook for already-ended W1
      await VapiService.handleWebhook({
        message: {
          type: 'status-update',
          status: 'in-progress',
          call: { id: w1.providerCallId, status: 'in-progress' },
        },
      });
      const statusAfterOutOfOrder = callbridgeStorage.getCallJob(w1.jobId)?.status;
      assert(
        statusAfterOutOfOrder === terminalStatusBeforeOutOfOrder,
        `Out-of-order in-progress must NOT overwrite terminal status (${terminalStatusBeforeOutOfOrder} -> ${statusAfterOutOfOrder})`
      );

      // Duplicate end-of-call-report for W1
      await finishMockCallViaWebhook(w1.providerCallId, { answered: true, durationSeconds: 40 });
      await sleep(150);

      const usedAfterDup = callbridgeStorage.getSubscription('cust_wh').usedSeconds;
      assert(usedAfterDup === 40, `Duplicate webhook double-billed! Expected 40s, got ${usedAfterDup}`);
      assert(!dispatchLog.some((d) => d.contactName === 'W3'), 'Duplicate webhook must NOT skip W2 to dispatch W3');
      return 'Out-of-order status ignored; duplicate webhook idempotent (40s billed once, W2 active)';
    });

    // ------------------------------------------------------------------
    // TC-16: Strict cross-tenant HTTP isolation & duplicate phone isolation
    // ------------------------------------------------------------------
    await runTest('TC-16', 'Cross-tenant HTTP isolation (403/zero leakage) & tenant-scoped duplicate detection', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const fA = setupTenantFixtures('tenant_alpha', publicSurveyEventId, ['Alpha1'], 9101);
      const fB = setupTenantFixtures('tenant_beta', publicSurveyEventId, ['Beta1'], 9102);

      // 1. Tenant-scoped duplicate phone detection: Beta can paste the exact same phone number Alpha already imported!
      const sharedPhone = fA.contacts[0].phone;
      const pasteBeta = await httpRequest(baseUrl, 'POST', `/api/callbridge/events/${publicSurveyEventId}/contacts/paste`, {
        tenantId: 'tenant_beta',
        body: { pastedText: `Shared Person, ${sharedPhone}` },
      });
      assert(pasteBeta.status === 200 && pasteBeta.body.validCount === 1 && pasteBeta.body.duplicateCount === 0,
        `Tenant Beta should NOT see Alpha's phone as duplicate: ${JSON.stringify(pasteBeta.body)}`);

      // Alpha pasting the same phone SHOULD see it as duplicate
      const pasteAlpha = await httpRequest(baseUrl, 'POST', `/api/callbridge/events/${publicSurveyEventId}/contacts/paste`, {
        tenantId: 'tenant_alpha',
        body: { pastedText: `Shared Person, ${sharedPhone}` },
      });
      assert(pasteAlpha.status === 200 && pasteAlpha.body.duplicateCount === 1, 'Alpha should detect its own duplicate phone');

      // 2. Alpha cannot see Beta's contacts or campaigns
      const alphaContacts = await httpRequest(baseUrl, 'GET', `/api/callbridge/events/${publicSurveyEventId}/contacts`, {
        tenantId: 'tenant_alpha',
      });
      assert(alphaContacts.body.contacts.every((c: any) => c.userId === 'tenant_alpha'), 'Alpha contacts leaked Beta records');

      const alphaCampaigns = await httpRequest(baseUrl, 'GET', `/api/callbridge/events/${publicSurveyEventId}/campaigns`, {
        tenantId: 'tenant_alpha',
      });
      assert(alphaCampaigns.body.campaigns.every((c: any) => c.clientId === 'tenant_alpha'), 'Alpha campaigns leaked Beta records');

      // 3. Cross-tenant 403 checks
      const startOtherCamp = await httpRequest(baseUrl, 'POST', `/api/callbridge/events/${publicSurveyEventId}/campaigns/${fB.campaign.id}/start`, {
        tenantId: 'tenant_alpha',
      });
      assert(startOtherCamp.status === 403, `Expected 403 starting other tenant campaign, got ${startOtherCamp.status}`);

      const pauseOtherCamp = await httpRequest(baseUrl, 'POST', `/api/callbridge/events/${publicSurveyEventId}/campaigns/${fB.campaign.id}/pause`, {
        tenantId: 'tenant_alpha',
      });
      assert(pauseOtherCamp.status === 403, `Expected 403 pausing other tenant campaign, got ${pauseOtherCamp.status}`);

      const deleteOtherContact = await httpRequest(baseUrl, 'DELETE', `/api/callbridge/events/${publicSurveyEventId}/contacts/${fB.contacts[0].id}`, {
        tenantId: 'tenant_alpha',
      });
      assert(deleteOtherContact.status === 403, `Expected 403 deleting other tenant contact, got ${deleteOtherContact.status}`);

      const otherAnalytics = await httpRequest(baseUrl, 'GET', `/api/callbridge/events/${publicSurveyEventId}/analytics?campaignId=${fB.campaign.id}`, {
        tenantId: 'tenant_alpha',
      });
      assert(otherAnalytics.status === 403, `Expected 403 reading other tenant analytics, got ${otherAnalytics.status}`);

      const otherBilling = await httpRequest(baseUrl, 'GET', `/api/callbridge/billing/subscription?clientId=tenant_beta`, {
        tenantId: 'tenant_alpha',
      });
      assert(otherBilling.status === 403, `Expected 403 reading other tenant billing, got ${otherBilling.status}`);

      const otherCalls = await httpRequest(baseUrl, 'GET', `/api/callbridge/calls?clientId=tenant_beta`, {
        tenantId: 'tenant_alpha',
      });
      assert(otherCalls.status === 403, `Expected 403 reading other tenant calls, got ${otherCalls.status}`);

      // 4. Shared provider config & phone numbers blocked for authenticated customers
      const configMutate = await httpRequest(baseUrl, 'POST', '/api/callbridge/telephony/config', {
        tenantId: 'tenant_alpha',
        body: { apiKey: 'evil' },
      });
      assert(configMutate.status === 403, `Expected 403 on customer POST /telephony/config, got ${configMutate.status}`);

      const phoneNumbersList = await httpRequest(baseUrl, 'GET', '/api/callbridge/telephony/phone-numbers', {
        tenantId: 'tenant_alpha',
      });
      assert(phoneNumbersList.status === 403, `Expected 403 on customer GET /telephony/phone-numbers, got ${phoneNumbersList.status}`);

      // 5. Queue-status endpoint strictly returns own tenant queues
      const qStatus = await httpRequest(baseUrl, 'GET', '/api/callbridge/queue-status', {
        tenantId: 'tenant_alpha',
      });
      assert(qStatus.status === 200 && qStatus.body.tenantId === 'tenant_alpha', 'queue-status should return tenant_alpha');
      assert(qStatus.body.queues.every((q: any) => q.campaignId === fA.campaign.id), 'queue-status leaked another tenant campaign');

      return 'All cross-tenant routes returned 403; duplicate phones & exports isolated per tenant';
    });

    // ------------------------------------------------------------------
    // TC-17: Billing accuracy per customer (answered vs unanswered)
    // ------------------------------------------------------------------
    await runTest('TC-17', 'Per-customer billing accuracy (answered deducted from owner only; unanswered = 0s)', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(3);
      const bA = setupTenantFixtures('bill_1', publicSurveyEventId, ['BA1', 'BA2'], 9201).campaign;
      const bB = setupTenantFixtures('bill_2', publicSurveyEventId, ['BB1'], 9202).campaign;

      queueManager.startCampaign(bA.id);
      queueManager.startCampaign(bB.id);
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'BA1') && dispatchLog.some((d) => d.contactName === 'BB1'));

      // bill_1 BA1 answered for 45s -> bill_1 charged 45s
      await finishMockCallViaWebhook(dispatchLog.find((d) => d.contactName === 'BA1')!.providerCallId, { answered: true, durationSeconds: 45 });
      await waitFor(() => dispatchLog.some((d) => d.contactName === 'BA2'));

      // bill_1 BA2 unanswered -> 0s charged
      await finishMockCallViaWebhook(dispatchLog.find((d) => d.contactName === 'BA2')!.providerCallId, { answered: false });

      // bill_2 BB1 answered for 30s -> bill_2 charged 30s
      await finishMockCallViaWebhook(dispatchLog.find((d) => d.contactName === 'BB1')!.providerCallId, { answered: true, durationSeconds: 30 });

      const sub1 = callbridgeStorage.getSubscription('bill_1');
      const sub2 = callbridgeStorage.getSubscription('bill_2');
      assert(sub1.usedSeconds === 45, `bill_1 expected 45s used, got ${sub1.usedSeconds}`);
      assert(sub2.usedSeconds === 30, `bill_2 expected 30s used, got ${sub2.usedSeconds}`);
      return 'bill_1 charged 45s (BA2 unanswered=0s); bill_2 charged 30s independently';
    });

    // ------------------------------------------------------------------
    // TC-18: All 3 existing modules + Marriage Event multi-customer start + atomic .bak recovery
    // ------------------------------------------------------------------
    await runTest('TC-18', 'All 3 modules (Public Survey, Political Campaign, Marriage Event) & atomic .bak recovery', async () => {
      await cleanStateBetweenTests();
      providerCapacityController.setRuntimeMaxConcurrentCalls(4);

      const m1 = setupTenantFixtures('mod_pub', publicSurveyEventId, ['PS1'], 9301);
      const m2 = setupTenantFixtures('mod_pol', politicalEventId, ['PC1'], 9302);
      const m3 = setupTenantFixtures('mod_mar1', marriageEventId, ['ME1'], 9303);
      const m4 = setupTenantFixtures('mod_mar2', marriageEventId, ['ME2'], 9304);

      // Start via HTTP /events/:id/sequence/start for Marriage Event for 2 different customers simultaneously
      const [resMar1, resMar2] = await Promise.all([
        httpRequest(baseUrl, 'POST', `/api/callbridge/events/${marriageEventId}/sequence/start`, {
          tenantId: 'mod_mar1',
          body: { campaignId: m3.campaign.id },
        }),
        httpRequest(baseUrl, 'POST', `/api/callbridge/events/${marriageEventId}/sequence/start`, {
          tenantId: 'mod_mar2',
          body: { campaignId: m4.campaign.id },
        }),
      ]);
      assert(resMar1.status === 200 && resMar1.body.success, `Marriage start 1 failed: ${JSON.stringify(resMar1.body)}`);
      assert(resMar2.status === 200 && resMar2.body.success, `Marriage start 2 failed: ${JSON.stringify(resMar2.body)}`);

      queueManager.startCampaign(m1.campaign.id);
      queueManager.startCampaign(m2.campaign.id);

      await waitFor(() =>
        dispatchLog.some((d) => d.contactName === 'PS1') &&
        dispatchLog.some((d) => d.contactName === 'PC1') &&
        dispatchLog.some((d) => d.contactName === 'ME1') &&
        dispatchLog.some((d) => d.contactName === 'ME2')
      );

      // Verify atomic persist + .bak recovery
      callbridgeStorage.persist();
      assert(fs.existsSync(dbPath) && fs.existsSync(bakPath), 'Atomic persist should create primary DB and .bak backup');
      const goodBackup = fs.readFileSync(bakPath, 'utf8');
      fs.writeFileSync(dbPath, '{corrupted_json', 'utf8');
      callbridgeStorage.reloadFromDisk();
      assert(callbridgeStorage.getEvent(publicSurveyEventId) !== undefined, 'Storage must recover cleanly from .bak on corrupt primary JSON');
      // Restore clean primary
      fs.writeFileSync(dbPath, goodBackup, 'utf8');
      callbridgeStorage.reloadFromDisk();

      return 'All 3 modules dispatched in parallel across tenants + .bak crash recovery verified';
    });
  } finally {
    // Cleanup & restore original database file so repository state remains spotless
    queueManager.prepareForShutdown();
    providerCapacityController.resetInMemoryState();
    providerCapacityController.setRuntimeMaxConcurrentCalls(null);

    (VapiService as any).createOutboundCall = origCreateOutboundCall;
    (VapiService as any).getCallStatus = origGetCallStatus;
    (VapiService as any).terminateCall = origTerminateCall;
    (ElevenLabsService as any).verifyVoiceExists = origVerifyVoiceExists;

    await new Promise<void>((resolve) => server.close(() => resolve()));

    if (origDb !== null) {
      fs.writeFileSync(dbPath, origDb, 'utf8');
    } else if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (origBak !== null) {
      fs.writeFileSync(bakPath, origBak, 'utf8');
    } else if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount}/${results.length} TEST CASES PASSED`);
  console.log('================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
