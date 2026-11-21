/**
 * Targeted Verification Suite for Production Blocker Fixes (Fixes 1–4)
 *
 * Tests:
 * 1. Webhook authentication (fail-closed in prod, 401 on missing/invalid, 200 on valid x-vapi-secret/Bearer/?secret, dev mode, duplicate/out-of-order idempotency)
 * 2. Cross-tenant event, question, template, placeholder, and voice-selection mutation protection
 * 3. Event analytics tenant isolation (zero global leakage into individual customer dashboards)
 * 4. Voice profile tenant derivation & ownership enforcement (voiceRouter, /test-voice, /test-voice-audio, /test-phone-call, /pre-call-diagnostics)
 * 5. Legacy records without tenant ownership / 'user_default' denied (403)
 * 6. Billing attribution safety when tenant mapping is missing (zero charges to client_001 or any customer)
 * 7. Multi-instance & Cloud Run persistence safety guard (refuses max_instances > 1, unconfirmed prod ephemeral storage, and concurrent lock holders)
 * 8. Provider capacity safe default (VAPI_MAX_CONCURRENT_CALLS = 1)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { callbridgeRouter } from '../server/callbridgeRouter.ts';
import { voiceRouter } from '../server/voice/voiceRouter.ts';
import { voiceProfileStorage, JsonFileVoiceProfileStorage } from '../server/voice/voiceProfileStorage.ts';
import { ElevenLabsService, ACTIVE_RISHI_CLONED_VOICE_ID } from '../server/voice/elevenLabsService.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { providerCapacityController } from '../server/campaign/providerCapacityController.ts';
import {
  evaluateStorageAndInstanceSafety,
  acquireSingleInstanceLock,
  releaseSingleInstanceLock,
} from '../server/storage/instanceSafetyGuard.ts';
import type { AuthenticatedRequest } from '../server/auth/firebaseAuthMiddleware.ts';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name} — ${detail}`);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function runCase(name: string, fn: () => Promise<string> | string) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err: any) {
    record(name, false, err?.message || String(err));
  }
}

async function httpJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts?: { tenantId?: string; headers?: Record<string, string>; body?: any }
): Promise<{ status: number; body: any; rawText: string }> {
  const headers: Record<string, string> = { ...(opts?.headers || {}) };
  if (opts?.tenantId) {
    headers['x-test-tenant'] = opts.tenantId;
  }
  if (opts?.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  const resp = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const rawText = await resp.text();
  let parsed: any = rawText;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // non-json response
  }
  return { status: resp.status, body: parsed, rawText };
}

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'callbridge_db.json');
  const voiceDbPath = path.join(process.cwd(), 'data', 'voice_profiles.json');
  const dbBackup = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;
  const voiceDbBackup = fs.existsSync(voiceDbPath) ? fs.readFileSync(voiceDbPath, 'utf8') : null;

  const origEnv = {
    NODE_ENV: process.env.NODE_ENV,
    VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET,
    VAPI_SECRET: process.env.VAPI_SECRET,
    CALLBRIDGE_ENFORCE_WEBHOOK_AUTH: process.env.CALLBRIDGE_ENFORCE_WEBHOOK_AUTH,
    VAPI_MAX_CONCURRENT_CALLS: process.env.VAPI_MAX_CONCURRENT_CALLS,
  };

  // Build isolated Express server mirroring production middleware & webhook mounts
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const testAuthMiddleware = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const tenantId = (req.headers['x-test-tenant'] as string)?.trim();
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Missing test tenant auth' });
    }
    const ts = new Date().toISOString();
    req.authUser = {
      uid: `uid_${tenantId}`,
      email: `${tenantId}@test.local`,
      fullName: `Test ${tenantId}`,
      emailVerified: true,
      tenantId,
      role: 'customer',
      provider: 'password',
      createdAt: ts,
      updatedAt: ts,
      lastLoginAt: ts,
    };
    next();
  };

  // Unauthenticated webhooks (exact same handler contract as server.ts)
  app.post('/vapi/webhook', (req, res) => {
    const authCheck = VapiService.verifyWebhookAuth(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }
    const result = VapiService.handleWebhook(req.body);
    return res.status(200).json(result);
  });

  app.post('/telephony/webhook', (req, res) => {
    const authCheck = VapiService.verifyWebhookAuth(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, error: authCheck.error });
    }
    return res.status(200).json({ success: true });
  });

  // Top-level PDF handler check (exact same ownership check as server.ts)
  app.get('/api/calls/:jobId/transcript.pdf', testAuthMiddleware, (req: AuthenticatedRequest, res) => {
    const job =
      callbridgeStorage.getCallJob(req.params.jobId) ||
      callbridgeStorage.getCallJobByProviderId(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Call record not found' });
    if (
      req.authUser &&
      (!job.clientId || job.clientId === 'user_default' || job.clientId !== req.authUser.tenantId)
    ) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this call record' });
    }
    return res.status(200).json({ success: true, jobId: job.id });
  });

  app.use('/api/callbridge', testAuthMiddleware, callbridgeRouter);
  app.use('/api/voice-profile', testAuthMiddleware, voiceRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const TENANT_A = 'tenant_sec_alpha';
  const TENANT_B = 'tenant_sec_beta';

  try {
    // Seed Tenant A and Tenant B
    const now = new Date().toISOString();
    callbridgeStorage.saveTenant({
      id: TENANT_A,
      name: 'Alpha Customer',
      email: 'alpha@test.local',
      organization: 'Alpha Org',
      createdAt: now,
      updatedAt: now,
    });
    callbridgeStorage.saveTenant({
      id: TENANT_B,
      name: 'Beta Customer',
      email: 'beta@test.local',
      organization: 'Beta Org',
      createdAt: now,
      updatedAt: now,
    });

    // =========================================================================
    // TEST 1: WEBHOOK AUTHENTICATION (FIX 1)
    // =========================================================================
    await runCase('1A. Webhook auth fails closed (503) in production when VAPI_WEBHOOK_SECRET is unset', async () => {
      delete process.env.VAPI_WEBHOOK_SECRET;
      delete process.env.VAPI_SECRET;
      process.env.NODE_ENV = 'production';
      const r1 = await httpJson(baseUrl, 'POST', '/vapi/webhook', { body: { message: { type: 'status-update' } } });
      const r2 = await httpJson(baseUrl, 'POST', '/telephony/webhook', { body: { status: 'completed' } });
      const r3 = await httpJson(baseUrl, 'POST', '/api/callbridge/vapi/webhook', {
        tenantId: TENANT_A,
        body: { message: { type: 'status-update' } },
      });
      assert(r1.status === 503, `Expected 503 on /vapi/webhook, got ${r1.status}`);
      assert(r2.status === 503, `Expected 503 on /telephony/webhook, got ${r2.status}`);
      assert(r3.status === 503, `Expected 503 on /api/callbridge/vapi/webhook, got ${r3.status}`);
      return 'All 3 webhook entry points returned 503 fail-closed in production without secret';
    });

    await runCase('1B. Webhook auth rejects missing/invalid secret (401) and accepts valid x-vapi-secret, Bearer, and ?secret=', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VAPI_WEBHOOK_SECRET = 'super_secret_vapi_token_2026';

      const missing = await httpJson(baseUrl, 'POST', '/vapi/webhook', { body: { message: { type: 'status-update' } } });
      assert(missing.status === 401, `Expected 401 on missing secret, got ${missing.status}`);

      const wrong = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'wrong_token' },
        body: { message: { type: 'status-update' } },
      });
      assert(wrong.status === 401, `Expected 401 on invalid secret, got ${wrong.status}`);

      const validHeader = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'super_secret_vapi_token_2026' },
        body: { message: { type: 'status-update', call: { id: 'vapi_auth_test_1' }, status: 'ringing' } },
      });
      assert(validHeader.status === 200, `Expected 200 on valid x-vapi-secret, got ${validHeader.status}`);

      const validBearer = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { authorization: 'Bearer super_secret_vapi_token_2026' },
        body: { message: { type: 'status-update', call: { id: 'vapi_auth_test_2' }, status: 'ringing' } },
      });
      assert(validBearer.status === 200, `Expected 200 on valid Bearer token, got ${validBearer.status}`);

      const validQuery = await httpJson(baseUrl, 'POST', '/telephony/webhook?secret=super_secret_vapi_token_2026', {
        body: { status: 'completed' },
      });
      assert(validQuery.status === 200, `Expected 200 on valid ?secret= query, got ${validQuery.status}`);

      return 'Rejected missing/invalid with 401; accepted x-vapi-secret, Bearer, and ?secret= with 200';
    });

    await runCase('1C. Webhook auth works cleanly in local dev when secret unset', async () => {
      delete process.env.VAPI_WEBHOOK_SECRET;
      delete process.env.VAPI_SECRET;
      delete process.env.CALLBRIDGE_ENFORCE_WEBHOOK_AUTH;
      process.env.NODE_ENV = 'development';
      const devResp = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        body: { message: { type: 'status-update', call: { id: 'vapi_dev_1' }, status: 'ringing' } },
      });
      assert(devResp.status === 200, `Expected 200 in local dev without secret, got ${devResp.status}`);
      return 'Local dev allowed cleanly when secret unset';
    });

    await runCase('1D. Duplicate & out-of-order terminal webhook idempotency preserved', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'idem_secret_test';
      const campId = 'camp_idem_test';
      const jobId = 'job_idem_test';
      const providerId = 'vapi_idem_call_1';

      callbridgeStorage.saveCampaign({
        id: campId,
        clientId: TENANT_A,
        eventId: 'event_public_survey',
        name: 'Idem Campaign',
        status: 'running',
        concurrencyLimit: 1,
        totalContacts: 1,
        processedCount: 0,
        completedCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveCallJob({
        id: jobId,
        clientId: TENANT_A,
        campaignId: campId,
        eventId: 'event_public_survey',
        contactId: 'cnt_idem_1',
        contactName: 'Idem Contact',
        contactPhone: '+919999900001',
        status: 'in_progress',
        providerCallId: providerId,
        retryCount: 0,
        maxRetries: 1,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.mapProviderCallIdToJob(providerId, jobId, campId, 'event_public_survey', TENANT_A, 'cnt_idem_1', 'in_progress');

      const beforeTx = callbridgeStorage.getUsageTransactions(TENANT_A).length;
      const eorPayload = {
        message: {
          type: 'end-of-call-report',
          call: { id: providerId, status: 'ended', duration: 25, metadata: { jobId, campaignId: campId, clientId: TENANT_A } },
          endedReason: 'customer-ended-call',
          durationSeconds: 25,
        },
      };

      const first = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'idem_secret_test' },
        body: eorPayload,
      });
      assert(first.status === 200, `First EOR failed: ${first.status}`);

      const second = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'idem_secret_test' },
        body: eorPayload,
      });
      assert(second.status === 200, `Duplicate EOR failed: ${second.status}`);

      // Out-of-order stale ringing status after terminal
      const stale = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'idem_secret_test' },
        body: {
          message: {
            type: 'status-update',
            status: 'ringing',
            call: { id: providerId, status: 'ringing' },
          },
        },
      });
      assert(stale.status === 200, `Stale status failed: ${stale.status}`);

      const afterJob = callbridgeStorage.getCallJob(jobId);
      const afterTx = callbridgeStorage.getUsageTransactions(TENANT_A).length;
      const terminalStates = new Set(['completed', 'interrupted', 'failed', 'no_answer', 'busy', 'callback_scheduled']);
      assert(
        Boolean(afterJob && terminalStates.has(afterJob.status)),
        `Job regressed out of confirmed terminal state to ${afterJob?.status}`
      );
      assert(afterJob?.status !== 'ringing' && afterJob?.status !== 'in_progress', `Job regressed to non-terminal ${afterJob?.status}`);
      assert(afterTx - beforeTx <= 1, `Duplicate billing occurred: ${afterTx - beforeTx} transactions created`);
      return `Job remained terminal (${afterJob?.status}) after duplicate EOR + stale ringing, transactions delta=${afterTx - beforeTx}`;
    });

    // =========================================================================
    // TEST 2: CROSS-TENANT EVENT / QUESTION / TEMPLATE / PLACEHOLDER / VOICE-SELECTION MUTATIONS
    // =========================================================================
    await runCase('2A. Shared default event mutations (PUT, placeholders, questions, voice-selection) are strictly tenant-isolated', async () => {
      // Snapshot Tenant B's initial default script & questions
      const bBeforeEv = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_political_campaign', { tenantId: TENANT_B });
      const bBeforeQ = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_public_survey/questions', { tenantId: TENANT_B });
      assert(bBeforeEv.status === 200 && bBeforeQ.status === 200, 'Tenant B could not read default events');
      const bOriginalScript = bBeforeEv.body.event.config?.approvedScript;
      const bOriginalQCount = bBeforeQ.body.questions.length;

      // Tenant A mutates shared political campaign script + adds custom placeholder
      const aMutate = await httpJson(baseUrl, 'PUT', '/api/callbridge/events/event_political_campaign', {
        tenantId: TENANT_A,
        body: {
          name: 'Alpha Private Political Override',
          config: {
            approvedScript: 'ALPHA_SECRET_SCRIPT_ONLY',
            customPlaceholders: [{ key: 'alpha_key', label: 'Alpha Key', value: 'SecretA' }],
            placeholderValues: { alpha_key: 'SecretA' },
          },
        },
      });
      assert(aMutate.status === 200, `Tenant A PUT failed: ${aMutate.status}`);
      assert(aMutate.body.event.config?.approvedScript === 'ALPHA_SECRET_SCRIPT_ONLY', 'Tenant A did not see own override');

      // Tenant B must NOT see Tenant A's mutation
      const bAfterEv = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_political_campaign', { tenantId: TENANT_B });
      assert(
        bAfterEv.body.event.config?.approvedScript === bOriginalScript,
        `Tenant B leaked Tenant A script: ${bAfterEv.body.event.config?.approvedScript}`
      );
      assert(bAfterEv.body.event.name !== 'Alpha Private Political Override', 'Tenant B leaked Tenant A event name');

      // Tenant A deletes custom placeholder -> succeeds for A, does not touch B
      const aDelPh = await httpJson(baseUrl, 'DELETE', '/api/callbridge/events/event_political_campaign/custom-placeholders/alpha_key', {
        tenantId: TENANT_A,
      });
      assert(aDelPh.status === 200, `Tenant A delete placeholder failed: ${aDelPh.status}`);

      // Tenant A replaces survey questions on shared default event_public_survey
      const aMutQ = await httpJson(baseUrl, 'PUT', '/api/callbridge/events/event_public_survey/questions', {
        tenantId: TENANT_A,
        body: {
          questions: [{ id: 'q_alpha_1', order: 1, questionText: 'Alpha Only Question?', enabled: true }],
        },
      });
      assert(aMutQ.status === 200, `Tenant A PUT questions failed: ${aMutQ.status}`);

      const aReadQ = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_public_survey/questions', { tenantId: TENANT_A });
      const bAfterQ = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_public_survey/questions', { tenantId: TENANT_B });
      assert(aReadQ.body.questions.length === 1 && aReadQ.body.questions[0].questionText === 'Alpha Only Question?', 'Tenant A questions not saved');
      assert(
        bAfterQ.body.questions.length === bOriginalQCount &&
          !bAfterQ.body.questions.some((q: any) => q.questionText === 'Alpha Only Question?'),
        'Tenant B saw Tenant A survey questions!'
      );

      // Tenant A cannot delete shared default platform event
      const delDefault = await httpJson(baseUrl, 'DELETE', '/api/callbridge/events/event_public_survey', { tenantId: TENANT_A });
      assert(delDefault.status === 403, `Expected 403 deleting shared default event, got ${delDefault.status}`);

      return 'Tenant A overrides isolated from Tenant B; deleting shared default event returned 403';
    });

    await runCase('2B. Cross-tenant custom event and custom template access/mutations denied (403)', async () => {
      // Tenant A creates custom event & custom template
      const createEv = await httpJson(baseUrl, 'POST', '/api/callbridge/events', {
        tenantId: TENANT_A,
        body: { type: 'public_survey', name: 'Alpha Private Survey' },
      });
      assert(createEv.status === 200, `Create custom event failed: ${createEv.status}`);
      const customEventId = createEv.body.event.id;

      // Tenant B attempts GET, PUT, DELETE, PUT questions, POST voice-selection on Tenant A's custom event
      const bGet = await httpJson(baseUrl, 'GET', `/api/callbridge/events/${customEventId}`, { tenantId: TENANT_B });
      const bPut = await httpJson(baseUrl, 'PUT', `/api/callbridge/events/${customEventId}`, {
        tenantId: TENANT_B,
        body: { name: 'Hacked Name' },
      });
      const bDel = await httpJson(baseUrl, 'DELETE', `/api/callbridge/events/${customEventId}`, { tenantId: TENANT_B });
      const bQ = await httpJson(baseUrl, 'PUT', `/api/callbridge/events/${customEventId}/questions`, {
        tenantId: TENANT_B,
        body: { questions: [] },
      });
      const bVs = await httpJson(baseUrl, 'POST', `/api/callbridge/events/${customEventId}/voice-selection`, {
        tenantId: TENANT_B,
        body: { voiceSelectionType: 'cloned' },
      });
      assert(bGet.status === 403, `Expected 403 on cross-tenant GET event, got ${bGet.status}`);
      assert(bPut.status === 403, `Expected 403 on cross-tenant PUT event, got ${bPut.status}`);
      assert(bDel.status === 403, `Expected 403 on cross-tenant DELETE event, got ${bDel.status}`);
      assert(bQ.status === 403, `Expected 403 on cross-tenant PUT questions, got ${bQ.status}`);
      assert(bVs.status === 403, `Expected 403 on cross-tenant voice-selection, got ${bVs.status}`);

      // Custom template isolation
      const createTpl = await httpJson(baseUrl, 'POST', '/api/callbridge/templates', {
        tenantId: TENANT_A,
        body: { name: 'Alpha Secret Template', category: 'political_campaign', scriptTemplate: { te: 'Secret' } },
      });
      assert(createTpl.status === 200, `Create custom template failed: ${createTpl.status}`);
      const tplId = createTpl.body.template.id;

      const bListTpl = await httpJson(baseUrl, 'GET', '/api/callbridge/templates', { tenantId: TENANT_B });
      assert(!bListTpl.body.templates.some((t: any) => t.id === tplId), 'Tenant B saw Tenant A custom template in list!');

      const bGetTpl = await httpJson(baseUrl, 'GET', `/api/callbridge/templates/${tplId}`, { tenantId: TENANT_B });
      const bDelTpl = await httpJson(baseUrl, 'DELETE', `/api/callbridge/templates/${tplId}`, { tenantId: TENANT_B });
      assert(bGetTpl.status === 403, `Expected 403 on cross-tenant GET template, got ${bGetTpl.status}`);
      assert(bDelTpl.status === 403, `Expected 403 on cross-tenant DELETE template, got ${bDelTpl.status}`);

      // Deleting default system template returns 403
      const defTpl = bListTpl.body.templates.find((t: any) => t.isDefault);
      assert(defTpl, 'No default template found');
      const delDefTpl = await httpJson(baseUrl, 'DELETE', `/api/callbridge/templates/${defTpl.id}`, { tenantId: TENANT_B });
      assert(delDefTpl.status === 403, `Expected 403 deleting default template, got ${delDefTpl.status}`);

      return 'All cross-tenant custom event and template mutations returned 403';
    });

    // =========================================================================
    // TEST 3: EVENT ANALYTICS ISOLATION (NO GLOBAL LEAKAGE)
    // =========================================================================
    await runCase('3. Event analytics strictly isolated per tenant (zero global leakage)', async () => {
      const campA = 'camp_pol_analytics_alpha';
      callbridgeStorage.saveCampaign({
        id: campA,
        clientId: TENANT_A,
        eventId: 'event_political_campaign',
        name: 'Alpha Political Run',
        status: 'completed',
        concurrencyLimit: 1,
        totalContacts: 2,
        processedCount: 2,
        completedCount: 2,
        answeredCount: 2,
        failedCount: 0,
        optOutCount: 0,
        keypad1Count: 2,
        keypad2Count: 0,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.recordCallInitiated('event_political_campaign', 'job_pol_a1', campA);
      callbridgeStorage.recordCallAnswered('event_political_campaign', 'job_pol_a1', campA);
      callbridgeStorage.recordPoliticalKeypadOutcome('event_political_campaign', 'job_pol_a1', '1', campA);
      callbridgeStorage.recordCallInitiated('event_political_campaign', 'job_pol_a2', campA);
      callbridgeStorage.recordCallAnswered('event_political_campaign', 'job_pol_a2', campA);
      callbridgeStorage.recordPoliticalKeypadOutcome('event_political_campaign', 'job_pol_a2', '2', campA);

      // Tenant B calls event-level analytics WITHOUT ?campaignId
      const bAnalytics = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_political_campaign/analytics', {
        tenantId: TENANT_B,
      });
      assert(bAnalytics.status === 200, `Tenant B analytics failed: ${bAnalytics.status}`);
      const bMetrics = bAnalytics.body.analytics.essentialMetrics;
      const bPol = bAnalytics.body.analytics.moduleSpecificMetrics.politicalCampaign;
      assert(bMetrics.totalCallsMade === 0, `Tenant B leaked totalCallsMade=${bMetrics.totalCallsMade}`);
      assert(bMetrics.callsAttended === 0, `Tenant B leaked callsAttended=${bMetrics.callsAttended}`);
      assert(bPol.pressed1Count === 0 && bPol.pressed2Count === 0, `Tenant B leaked DTMF counts: p1=${bPol.pressed1Count}, p2=${bPol.pressed2Count}`);

      // Tenant A still sees their own metrics accurately
      const aAnalytics = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_political_campaign/analytics', {
        tenantId: TENANT_A,
      });
      assert(aAnalytics.status === 200, `Tenant A analytics failed: ${aAnalytics.status}`);
      const aPol = aAnalytics.body.analytics.moduleSpecificMetrics.politicalCampaign;
      assert(
        aPol.pressed1Count >= 1 && aPol.pressed2Count >= 1,
        `Tenant A did not see own political analytics: p1=${aPol.pressed1Count}, p2=${aPol.pressed2Count}`
      );

      return `Tenant B saw 0/0/0/0 (zero global leakage); Tenant A saw p1=${aPol.pressed1Count}, p2=${aPol.pressed2Count}`;
    });

    // =========================================================================
    // TEST 4: VOICE PROFILE TENANT OWNERSHIP (voiceRouter, /test-voice, /test-voice-audio)
    // =========================================================================
    await runCase('4. Voice profile ownership & tenant derivation enforced across voiceRouter & callbridgeRouter', async () => {
      const voiceAId = 'vp_alpha_private_voice';
      const elVoiceAId = 'el_alpha_private_9999';
      await voiceProfileStorage.saveProfile({
        id: voiceAId,
        client_id: TENANT_A,
        user_id: TENANT_A,
        eventType: 'public_survey',
        voiceName: 'Alpha Private Voice',
        elevenLabsVoiceId: elVoiceAId,
        voice_id: elVoiceAId,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'ready',
        isApproved: true,
        approvalStatus: 'approved',
        created_at: now,
        updated_at: now,
      });
      callbridgeStorage.saveVoiceProfile({
        id: voiceAId,
        clientId: TENANT_A,
        eventType: 'public_survey',
        name: 'Alpha Private Voice',
        voiceName: 'Alpha Private Voice',
        provider: 'elevenlabs',
        providerVoiceId: elVoiceAId,
        elevenLabsVoiceId: elVoiceAId,
        status: 'active',
        voiceStatus: 'ready',
        approvalStatus: 'approved',
        isApproved: true,
        languageCapabilities: ['te'],
        createdAt: now,
        updatedAt: now,
      });

      // 4a. GET /api/voice-profile/ omits client_id -> derives from req.authUser.tenantId
      const aList = await httpJson(baseUrl, 'GET', '/api/voice-profile/', { tenantId: TENANT_A });
      const bList = await httpJson(baseUrl, 'GET', '/api/voice-profile/', { tenantId: TENANT_B });
      assert(aList.status === 200 && aList.body.profiles.some((p: any) => p.voice_id === elVoiceAId), 'Tenant A did not see own voice');
      assert(bList.status === 200 && !bList.body.profiles.some((p: any) => p.voice_id === elVoiceAId), 'Tenant B saw Tenant A voice in GET /!');

      // 4b. Cross-tenant mutations & playback in voiceRouter -> 403
      const bApprove = await httpJson(baseUrl, 'POST', '/api/voice-profile/approve', {
        tenantId: TENANT_B,
        body: { voice_id: elVoiceAId, eventType: 'public_survey' },
      });
      const bActivate = await httpJson(baseUrl, 'POST', '/api/voice-profile/activate', {
        tenantId: TENANT_B,
        body: { voice_id: elVoiceAId },
      });
      const bPreviewGet = await httpJson(baseUrl, 'GET', `/api/voice-profile/preview-audio/${elVoiceAId}`, {
        tenantId: TENANT_B,
      });
      const bPreviewPost = await httpJson(baseUrl, 'POST', '/api/voice-profile/preview', {
        tenantId: TENANT_B,
        body: { voice_id: elVoiceAId, text: 'Hello' },
      });
      const bTts = await httpJson(baseUrl, 'POST', '/api/voice-profile/tts', {
        tenantId: TENANT_B,
        body: { voice_id: elVoiceAId, text: 'Hello' },
      });
      const bStream = await httpJson(baseUrl, 'POST', '/api/voice-profile/stream', {
        tenantId: TENANT_B,
        body: { voice_id: elVoiceAId, text: 'Hello' },
      });
      const bInternal = await httpJson(baseUrl, 'POST', '/api/voice-profile/internal-test', {
        tenantId: TENANT_A,
      });
      assert(bApprove.status === 403, `Expected 403 on cross-tenant /approve, got ${bApprove.status}`);
      assert(bActivate.status === 403, `Expected 403 on cross-tenant /activate, got ${bActivate.status}`);
      assert(bPreviewGet.status === 403, `Expected 403 on cross-tenant /preview-audio, got ${bPreviewGet.status}`);
      assert(bPreviewPost.status === 403, `Expected 403 on cross-tenant /preview, got ${bPreviewPost.status}`);
      assert(bTts.status === 403, `Expected 403 on cross-tenant /tts, got ${bTts.status}`);
      assert(bStream.status === 403, `Expected 403 on cross-tenant /stream, got ${bStream.status}`);
      assert(bInternal.status === 403, `Expected 403 on customer /internal-test, got ${bInternal.status}`);

      // 4c. Cross-tenant /test-voice, /test-voice-audio, /test-phone-call, /pre-call-diagnostics -> 403
      const bTestVoice = await httpJson(baseUrl, 'POST', '/api/callbridge/test-voice', {
        tenantId: TENANT_B,
        body: { text: 'Test speech', voiceProfileId: voiceAId },
      });
      const bTestVoiceAudio = await httpJson(
        baseUrl,
        'GET',
        `/api/callbridge/test-voice-audio?text=Hello&voiceProfileId=${encodeURIComponent(voiceAId)}`,
        { tenantId: TENANT_B }
      );
      const bTestVoiceAudioNoId = await httpJson(
        baseUrl,
        'GET',
        `/api/callbridge/test-voice-audio?text=Hello`,
        { tenantId: TENANT_B }
      );
      const bTestPhone = await httpJson(baseUrl, 'POST', '/api/callbridge/test-phone-call', {
        tenantId: TENANT_B,
        body: { phoneNumber: '9876543210', voiceProfileId: voiceAId, eventType: 'public_survey' },
      });
      const bDiag = await httpJson(baseUrl, 'POST', '/api/callbridge/pre-call-diagnostics', {
        tenantId: TENANT_B,
        body: { voiceProfileId: voiceAId, eventType: 'public_survey' },
      });

      assert(bTestVoice.status === 403, `Expected 403 on cross-tenant /test-voice, got ${bTestVoice.status}`);
      assert(bTestVoiceAudio.status === 403, `Expected 403 on cross-tenant /test-voice-audio, got ${bTestVoiceAudio.status}`);
      assert(bTestVoiceAudioNoId.status === 400, `Expected 400 when Tenant B has no voice profile (must not grab Tenant A voice), got ${bTestVoiceAudioNoId.status}`);
      assert(bTestPhone.status === 403, `Expected 403 on cross-tenant /test-phone-call, got ${bTestPhone.status}`);
      assert(bDiag.status === 403, `Expected 403 on cross-tenant /pre-call-diagnostics, got ${bDiag.status}`);

      return 'All cross-tenant voiceRouter, /test-voice, /test-voice-audio, /test-phone-call, and /pre-call-diagnostics calls returned 403';
    });

    // =========================================================================
    // TEST 5: LEGACY UNOWNED RECORDS DENIED (403)
    // =========================================================================
    await runCase('5. Legacy records without tenant ownership or with user_default are denied (403)', async () => {
      // Inject legacy unowned records directly into storage
      const legacyCampId = 'camp_legacy_unowned';
      const legacyContactId = 'cnt_legacy_default';
      const legacyJobId = 'job_legacy_unowned';
      const legacyTplId = 'tpl_legacy_unowned';
      const legacyEvId = 'event_legacy_custom_unowned';

      callbridgeStorage.saveCampaign({
        id: legacyCampId,
        clientId: undefined,
        eventId: 'event_public_survey',
        name: 'Legacy Unowned Campaign',
        status: 'draft',
        concurrencyLimit: 1,
        totalContacts: 1,
        processedCount: 0,
        completedCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveContact({
        id: legacyContactId,
        userId: 'user_default',
        eventId: 'event_public_survey',
        name: 'Legacy User Default Contact',
        phone: '+919876500000',
        originalPhone: '9876500000',
        consentStatus: 'granted',
        optOut: false,
        importSource: 'manual',
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveCallJob({
        id: legacyJobId,
        clientId: undefined,
        campaignId: legacyCampId,
        eventId: 'event_public_survey',
        contactId: legacyContactId,
        contactName: 'Legacy Contact',
        contactPhone: '+919876500000',
        status: 'completed',
        retryCount: 0,
        maxRetries: 1,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveTemplate({
        id: legacyTplId,
        category: 'public_survey',
        name: 'Legacy Unowned Template',
        description: 'Legacy',
        isDefault: false,
        isCustom: true,
        scriptTemplate: { te: 'Legacy', hi: 'Legacy', en: 'Legacy' },
        fields: [],
        defaultValues: {},
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveEvent({
        id: legacyEvId,
        type: 'public_survey',
        name: 'Legacy Custom Event',
        description: 'Legacy',
        language: 'te',
        createdAt: now,
        updatedAt: now,
        config: {},
      });

      const rCamp = await httpJson(baseUrl, 'POST', `/api/callbridge/events/event_public_survey/campaigns/${legacyCampId}/start`, {
        tenantId: TENANT_A,
      });
      const rContactDel = await httpJson(baseUrl, 'DELETE', `/api/callbridge/contacts/${legacyContactId}`, {
        tenantId: TENANT_A,
      });
      const rContactList = await httpJson(baseUrl, 'GET', '/api/callbridge/events/event_public_survey/contacts', {
        tenantId: TENANT_A,
      });
      const rJobPdf = await httpJson(baseUrl, 'GET', `/api/calls/${legacyJobId}/transcript.pdf`, {
        tenantId: TENANT_A,
      });
      const rCallStatus = await httpJson(baseUrl, 'GET', `/api/callbridge/telephony/call-status/${legacyJobId}`, {
        tenantId: TENANT_A,
      });
      const rTpl = await httpJson(baseUrl, 'GET', `/api/callbridge/templates/${legacyTplId}`, {
        tenantId: TENANT_A,
      });
      const rEv = await httpJson(baseUrl, 'GET', `/api/callbridge/events/${legacyEvId}`, {
        tenantId: TENANT_A,
      });

      assert(rCamp.status === 403, `Expected 403 on legacy unowned campaign, got ${rCamp.status}`);
      assert(rContactDel.status === 403, `Expected 403 on legacy user_default contact, got ${rContactDel.status}`);
      assert(!rContactList.body.contacts.some((c: any) => c.id === legacyContactId), 'Legacy user_default contact leaked into Tenant A contact list!');
      assert(rJobPdf.status === 403, `Expected 403 on legacy unowned PDF transcript, got ${rJobPdf.status}`);
      assert(rCallStatus.status === 403, `Expected 403 on legacy unowned call status, got ${rCallStatus.status}`);
      assert(rTpl.status === 403, `Expected 403 on legacy unowned template, got ${rTpl.status}`);
      assert(rEv.status === 403, `Expected 403 on legacy unowned custom event, got ${rEv.status}`);

      // Also verify client_001 bypass was removed from /billing/subscription & /billing/transactions
      const rBillSub = await httpJson(baseUrl, 'GET', '/api/callbridge/billing/subscription?userId=client_001', {
        tenantId: TENANT_A,
      });
      const rBillTx = await httpJson(baseUrl, 'GET', '/api/callbridge/billing/transactions?clientId=client_001', {
        tenantId: TENANT_A,
      });
      assert(rBillSub.status === 403, `Expected 403 on cross-tenant billing/subscription?userId=client_001, got ${rBillSub.status}`);
      assert(rBillTx.status === 403, `Expected 403 on cross-tenant billing/transactions?clientId=client_001, got ${rBillTx.status}`);

      return 'Legacy unowned/user_default campaign, contact, job PDF, call status, template, custom event, and client_001 billing bypass all denied with 403';
    });

    // =========================================================================
    // TEST 6: BILLING ATTRIBUTION WHEN TENANT MAPPING IS MISSING
    // =========================================================================
    await runCase('6. Missing tenant mapping never charges client_001 or any other customer', async () => {
      const subBefore = { ...callbridgeStorage.getSubscription('client_001') };
      const txBefore = callbridgeStorage.getUsageTransactions('client_001').length;

      // Direct recordCallBilling with empty & user_default tenant IDs
      const rec1 = callbridgeStorage.recordCallBilling({
        userId: '',
        callId: 'unowned_call_direct_1',
        eventId: 'event_public_survey',
        durationSeconds: 120,
        status: 'completed',
      });
      const rec2 = callbridgeStorage.recordCallBilling({
        userId: 'user_default',
        callId: 'unowned_call_direct_2',
        eventId: 'event_public_survey',
        durationSeconds: 90,
        status: 'completed',
      });
      assert(rec1.creditDeductionSeconds === 0 && rec1.endedReason === 'unattributed_missing_tenant', 'Empty userId deducted seconds!');
      assert(rec2.creditDeductionSeconds === 0 && rec2.endedReason === 'unattributed_missing_tenant', 'user_default deducted seconds!');

      // Terminal Vapi webhook for an unowned job with no tenant mapping anywhere
      const unownedJobId = 'job_billing_orphan_1';
      const unownedProviderId = 'vapi_billing_orphan_1';
      callbridgeStorage.saveCallJob({
        id: unownedJobId,
        clientId: undefined,
        campaignId: 'camp_does_not_exist',
        eventId: 'event_public_survey',
        contactId: 'cnt_orphan',
        contactName: 'Orphan',
        contactPhone: '+919000011111',
        status: 'in_progress',
        providerCallId: unownedProviderId,
        retryCount: 0,
        maxRetries: 1,
        createdAt: now,
        updatedAt: now,
      });

      process.env.VAPI_WEBHOOK_SECRET = 'billing_test_secret';
      const whResp = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'billing_test_secret' },
        body: {
          message: {
            type: 'end-of-call-report',
            call: { id: unownedProviderId, status: 'ended', duration: 60 },
            endedReason: 'customer-ended-call',
            durationSeconds: 60,
          },
        },
      });
      assert(whResp.status === 200, `Webhook failed: ${whResp.status}`);

      const subAfter = callbridgeStorage.getSubscription('client_001');
      const txAfter = callbridgeStorage.getUsageTransactions('client_001').length;
      assert(
        subAfter.usedSeconds === subBefore.usedSeconds && subAfter.remainingSeconds === subBefore.remainingSeconds,
        `client_001 subscription changed! before=${subBefore.usedSeconds}/${subBefore.remainingSeconds}, after=${subAfter.usedSeconds}/${subAfter.remainingSeconds}`
      );
      assert(txAfter === txBefore, `client_001 transactions grew from ${txBefore} to ${txAfter}`);

      return 'Zero seconds deducted and zero transactions recorded for client_001 when tenant mapping is missing';
    });

    // =========================================================================
    // TEST 7: CLOUD RUN / MULTI-INSTANCE & PERSISTENCE SAFETY GUARD (FIX 3)
    // =========================================================================
    await runCase('7. Instance & JSON persistence safety guard refuses multi-instance & unconfirmed prod ephemeral storage', async () => {
      // 7a. Multi-instance config refused
      const multiCheck = evaluateStorageAndInstanceSafety({
        NODE_ENV: 'production',
        CALLBRIDGE_MAX_INSTANCES: '3',
      });
      assert(multiCheck.mustRefuseStartup && multiCheck.reasons.length > 0, 'Guard failed to block CALLBRIDGE_MAX_INSTANCES=3');

      // 7b. Production Cloud Run without single-instance confirmation / persistent disk refused
      const prodCloudRunCheck = evaluateStorageAndInstanceSafety({
        NODE_ENV: 'production',
        K_SERVICE: 'callbridge-prod',
      });
      assert(prodCloudRunCheck.mustRefuseStartup && prodCloudRunCheck.reasons.length > 0, 'Guard failed to block unsafe prod Cloud Run startup');

      // 7c. Single-instance lock file prevents two live writers on the same data directory
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-lock-test-'));
      try {
        const lock1 = acquireSingleInstanceLock(tmpDir, { instanceId: 'instance_primary_1' });
        assert(lock1.acquired && lock1.lockPath, 'Primary instance failed to acquire lock');

        const lock2 = acquireSingleInstanceLock(tmpDir, { instanceId: 'instance_secondary_2' });
        assert(!lock2.acquired, 'Secondary live instance erroneously acquired lock held by primary!');

        releaseSingleInstanceLock(lock1.lockPath, 'instance_primary_1');
        const lock3 = acquireSingleInstanceLock(tmpDir, { instanceId: 'instance_secondary_2' });
        assert(lock3.acquired && lock3.lockPath, 'Secondary instance could not acquire lock after primary released it');
        releaseSingleInstanceLock(lock3.lockPath, 'instance_secondary_2');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      return 'Refused max_instances=3, refused unconfirmed prod Cloud Run ephemeral storage, and blocked concurrent writer lock';
    });

    // =========================================================================
    // TEST 8: PROVIDER CAPACITY SAFE DEFAULT (FIX 4)
    // =========================================================================
    await runCase('8. Provider capacity defaults safely to VAPI_MAX_CONCURRENT_CALLS=1 when unset', async () => {
      delete process.env.VAPI_MAX_CONCURRENT_CALLS;
      const maxDefault = providerCapacityController.getMaxConcurrentCalls();
      assert(maxDefault === 1, `Expected default VAPI_MAX_CONCURRENT_CALLS=1, got ${maxDefault}`);
      return `Verified default VAPI_MAX_CONCURRENT_CALLS=${maxDefault}`;
    });

    // =========================================================================
    // TEST 9: CROSS-TENANT ANSWERED COUNTER ISOLATION + DUPLICATE WEBHOOK NO DOUBLE-COUNT
    // =========================================================================
    await runCase('9. Cross-tenant answered counter isolation on shared default event & duplicate terminal webhook no double-count', async () => {
      // Seed Customer A historical answered call + keypad press on shared default event_political_campaign
      const campA = 'camp_shared_pol_alpha_iso';
      const jobA = 'job_shared_pol_alpha_1';
      callbridgeStorage.saveCampaign({
        id: campA,
        clientId: TENANT_A,
        eventId: 'event_political_campaign',
        name: 'Alpha Political Answered Run',
        status: 'completed',
        concurrencyLimit: 1,
        totalContacts: 1,
        processedCount: 1,
        completedCount: 1,
        answeredCount: 1,
        failedCount: 0,
        optOutCount: 0,
        keypad1Count: 1,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.recordCallInitiated('event_political_campaign', jobA, campA);
      callbridgeStorage.recordCallAnswered('event_political_campaign', jobA, campA);
      callbridgeStorage.recordPoliticalKeypadOutcome('event_political_campaign', jobA, '1', campA);

      // Verify global event aggregate DOES have historical answered calls & keypad1 > 0
      const globalEventAgg = callbridgeStorage.getAggregateAnalytics('event_political_campaign');
      assert((globalEventAgg.answeredCalls || 0) >= 1, 'Expected shared event aggregate to have historical answeredCalls >= 1');

      // Now Customer B runs a campaign on the SAME shared default event_political_campaign whose call goes unanswered
      const campB = 'camp_shared_pol_beta_unanswered';
      const jobB = 'job_shared_pol_beta_1';
      const providerIdB = 'vapi_shared_pol_beta_noanswer_1';
      callbridgeStorage.saveCampaign({
        id: campB,
        clientId: TENANT_B,
        eventId: 'event_political_campaign',
        name: 'Beta Political Unanswered Run',
        status: 'running',
        concurrencyLimit: 1,
        totalContacts: 1,
        processedCount: 0,
        completedCount: 0,
        answeredCount: 0,
        unansweredCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.saveCallJob({
        id: jobB,
        clientId: TENANT_B,
        campaignId: campB,
        eventId: 'event_political_campaign',
        contactId: 'cnt_beta_noans_1',
        contactName: 'Beta Contact',
        contactPhone: '+919888877771',
        status: 'calling',
        providerCallId: providerIdB,
        retryCount: 0,
        maxRetries: 1,
        createdAt: now,
        updatedAt: now,
      });
      callbridgeStorage.mapProviderCallIdToJob(
        providerIdB,
        jobB,
        campB,
        'event_political_campaign',
        TENANT_B,
        'cnt_beta_noans_1',
        'calling'
      );

      // Fire terminal no_answer webhook for Customer B
      process.env.VAPI_WEBHOOK_SECRET = 'counter_iso_secret';
      const noAnsPayload = {
        message: {
          type: 'end-of-call-report',
          call: { id: providerIdB, status: 'ended', duration: 0, metadata: { jobId: jobB, campaignId: campB, clientId: TENANT_B } },
          endedReason: 'customer-did-not-answer',
          durationSeconds: 0,
        },
      };
      const firstWh = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'counter_iso_secret' },
        body: noAnsPayload,
      });
      assert(firstWh.status === 200, `First no_answer webhook failed: ${firstWh.status}`);

      // Fire duplicate terminal webhook AND direct duplicate onJobTerminal to ensure zero double-counting
      const dupWh = await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        headers: { 'x-vapi-secret': 'counter_iso_secret' },
        body: noAnsPayload,
      });
      assert(dupWh.status === 200, `Duplicate no_answer webhook failed: ${dupWh.status}`);
      queueManager.onJobTerminal(campB, jobB, { isNoAnswer: true, status: 'no_answer' });

      const afterCampB = callbridgeStorage.getCampaign(campB);
      const afterJobB = callbridgeStorage.getCallJob(jobB);
      const afterMapB = callbridgeStorage.getProviderCallMapping(providerIdB);
      assert(afterCampB, 'Customer B campaign missing');
      const terminalStatusB = afterJobB?.status || afterMapB?.status;
      assert(terminalStatusB === 'no_answer', `Expected Customer B terminal status=no_answer, got ${terminalStatusB}`);
      assert(
        (afterCampB.answeredCount || 0) === 0,
        `Cross-tenant answered leak! Customer B answeredCount=${afterCampB.answeredCount} (expected 0)`
      );
      assert(
        (afterCampB.completedCount || 0) === 0,
        `Cross-tenant completed leak! Customer B completedCount=${afterCampB.completedCount} (expected 0)`
      );
      assert(
        (afterCampB.unansweredCount || 0) === 1,
        `Expected Customer B unansweredCount=1 (no double-count), got ${afterCampB.unansweredCount}`
      );
      assert(
        (afterCampB.processedCount || 0) === 1,
        `Expected Customer B processedCount=1 (no double-count), got ${afterCampB.processedCount}`
      );

      return 'Customer B remained answeredCount=0, unansweredCount=1, processedCount=1 despite Customer A historical answered calls & duplicate terminal webhooks';
    });

    // =========================================================================
    // TEST 10: VOICE PROFILE MISSING OWNERSHIP REJECTED/SKIPPED & ELEVENLABS NO client_001 FALLBACK
    // =========================================================================
    await runCase('10. Missing voice-profile ownership rejected/skipped & ElevenLabsService.cloneVoice rejects missing tenantId', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-vp-own-'));
      try {
        // Seed disk file with 1 valid customer profile + 2 unowned/user_default legacy records
        const diskPath = path.join(tmpDir, 'voice_profiles.json');
        fs.writeFileSync(
          diskPath,
          JSON.stringify(
            [
              {
                id: 'vp_legacy_no_owner',
                voiceName: 'Unowned Legacy Voice',
                elevenLabsVoiceId: 'el_unowned_1',
                eventType: 'public_survey',
                status: 'active',
              },
              {
                id: 'vp_legacy_user_default',
                client_id: 'user_default',
                user_id: 'user_default',
                voiceName: 'Default User Voice',
                elevenLabsVoiceId: 'el_user_default_2',
                eventType: 'public_survey',
                status: 'active',
              },
              {
                id: 'vp_valid_tenant_a',
                client_id: TENANT_A,
                user_id: TENANT_A,
                voiceName: 'Valid Alpha Voice',
                elevenLabsVoiceId: 'el_valid_alpha_3',
                eventType: 'public_survey',
                status: 'active',
                isApproved: true,
              },
            ],
            null,
            2
          ),
          'utf8'
        );

        const isolatedStore = new JsonFileVoiceProfileStorage(tmpDir);
        const allLoaded = await isolatedStore.listProfiles();
        assert(allLoaded.length === 1 && allLoaded[0].id === 'vp_valid_tenant_a', `Expected only 1 valid profile loaded, got ${allLoaded.map((p) => p.id).join(',')}`);
        const c001Profiles = await isolatedStore.getProfilesByClientId('client_001');
        assert(c001Profiles.length === 0, `Unowned legacy profiles were wrongly assigned to client_001! count=${c001Profiles.length}`);

        // saveProfile without client_id/user_id must reject
        let saveRejected = false;
        try {
          await isolatedStore.saveProfile({
            id: 'vp_should_fail',
            voiceName: 'No Owner',
            elevenLabsVoiceId: 'el_fail',
            eventType: 'public_survey',
          });
        } catch {
          saveRejected = true;
        }
        assert(saveRejected, 'saveProfile succeeded without client_id/user_id!');

        // saveProfile with user_default must reject
        let defaultRejected = false;
        try {
          await isolatedStore.saveProfile({
            id: 'vp_should_fail_default',
            client_id: 'user_default',
            voiceName: 'User Default',
            elevenLabsVoiceId: 'el_fail_default',
            eventType: 'public_survey',
          });
        } catch {
          defaultRejected = true;
        }
        assert(defaultRejected, 'saveProfile succeeded with user_default!');

        // getCompositeKey without userId must reject
        let compositeRejected = false;
        try {
          JsonFileVoiceProfileStorage.getCompositeKey('', 'public_survey', 'vp_1');
        } catch {
          compositeRejected = true;
        }
        assert(compositeRejected, 'getCompositeKey fell back to client_001 instead of rejecting empty userId!');

        // ElevenLabsService.cloneVoice without clientId/userId must reject BEFORE API call / fallback
        let cloneRejected = false;
        try {
          await ElevenLabsService.cloneVoice({
            audioBuffer: Buffer.from('test'),
            fileName: 'test.mp3',
            mimeType: 'audio/mpeg',
          } as any);
        } catch (err: any) {
          cloneRejected = String(err?.message || '').includes('Authenticated customer tenantId is required');
        }
        assert(cloneRejected, 'ElevenLabsService.cloneVoice did not reject missing tenantId!');

        return 'Unowned/user_default records skipped on load, saveProfile/getCompositeKey/cloneVoice all rejected missing tenantId';
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // =========================================================================
    // TEST 11: VOICE PROFILE ATOMIC WRITES & BACKUP RECOVERY
    // =========================================================================
    await runCase('11. Voice profile storage performs atomic writes with .bak backup and recovers from corrupted primary JSON', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-vp-atomic-'));
      try {
        const store = new JsonFileVoiceProfileStorage(tmpDir);
        await store.saveProfile({
          id: 'vp_atomic_1',
          client_id: TENANT_A,
          user_id: TENANT_A,
          eventType: 'public_survey',
          voiceName: 'Atomic Voice 1',
          elevenLabsVoiceId: 'el_atomic_voice_1',
          status: 'active',
          isApproved: true,
        });
        await store.saveProfile({
          id: 'vp_atomic_2',
          client_id: TENANT_B,
          user_id: TENANT_B,
          eventType: 'political_campaign',
          voiceName: 'Atomic Voice 2',
          elevenLabsVoiceId: 'el_atomic_voice_2',
          status: 'active',
          isApproved: true,
        });

        const primaryPath = path.join(tmpDir, 'voice_profiles.json');
        const backupPath = path.join(tmpDir, 'voice_profiles.json.bak');
        assert(fs.existsSync(primaryPath), 'Primary voice_profiles.json not written');
        assert(fs.existsSync(backupPath), 'Backup voice_profiles.json.bak not created on subsequent atomic write');

        // Ensure no stray .tmp files left behind
        const leftoverTmp = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
        assert(leftoverTmp.length === 0, `Stray temp files left behind: ${leftoverTmp.join(', ')}`);

        // Overwrite backup with latest valid snapshot (simulating steady-state), then corrupt primary JSON
        fs.copyFileSync(primaryPath, backupPath);
        fs.writeFileSync(primaryPath, '{ corrupted truncated json !!!', 'utf8');

        // Re-instantiate storage and verify automatic clean recovery from .bak
        const recovered = new JsonFileVoiceProfileStorage(tmpDir);
        const p1 = await recovered.getProfileById('vp_atomic_1');
        const p2 = await recovered.getProfileById('vp_atomic_2');
        assert(p1?.elevenLabsVoiceId === 'el_atomic_voice_1' && p1.client_id === TENANT_A, 'Failed to recover vp_atomic_1 from .bak');
        assert(p2?.elevenLabsVoiceId === 'el_atomic_voice_2' && p2.client_id === TENANT_B, 'Failed to recover vp_atomic_2 from .bak');

        return 'Atomic write created valid .bak with zero stray .tmp files; corrupted primary recovered cleanly from voice_profiles.json.bak';
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // =========================================================================
    // TEST 12: EXISTING SHARED PLATFORM RISHI VOICE REMAINS AVAILABLE
    // =========================================================================
    await runCase('12. Existing shared platform Rishi voice and its metadata remain available for customers', async () => {
      const rishiProfile = callbridgeStorage.getVoiceProfile(ACTIVE_RISHI_CLONED_VOICE_ID);
      assert(rishiProfile, 'Shared platform Rishi voice missing from callbridgeStorage.getVoiceProfile');
      assert(
        rishiProfile.providerVoiceId === ACTIVE_RISHI_CLONED_VOICE_ID &&
          rishiProfile.elevenLabsVoiceId === ACTIVE_RISHI_CLONED_VOICE_ID,
        `Rishi voice ID mutated: ${rishiProfile.providerVoiceId}`
      );
      assert(
        (rishiProfile.approvalStatus === 'approved' || rishiProfile.isApproved === true) &&
          rishiProfile.status === 'active',
        'Rishi voice approval/active metadata altered'
      );

      // Customer B can select the shared Rishi voice on their tenant-scoped event without 403
      const selResp = await httpJson(baseUrl, 'POST', '/api/callbridge/events/event_public_survey/voice-selection', {
        tenantId: TENANT_B,
        body: { voiceSelectionType: 'cloned', voiceId: ACTIVE_RISHI_CLONED_VOICE_ID },
      });
      assert(selResp.status === 200 && selResp.body.success === true, `Customer B could not select shared Rishi voice: ${selResp.status}`);

      return `Shared platform Rishi voice (${ACTIVE_RISHI_CLONED_VOICE_ID}) and metadata intact and selectable by authenticated customers`;
    });
  } finally {
    server.close();
    // Restore original env
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    // Restore original DB files cleanly
    if (dbBackup !== null) {
      fs.writeFileSync(dbPath, dbBackup, 'utf8');
      callbridgeStorage.reloadFromDisk();
    }
    if (voiceDbBackup !== null) {
      fs.writeFileSync(voiceDbPath, voiceDbBackup, 'utf8');
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  console.log(`\n========================================`);
  console.log(`PRODUCTION BLOCKER FIX SUITE: ${passedCount}/${results.length} PASSED (${failedCount} FAILED)`);
  console.log(`========================================`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
