import express from 'express';
import http from 'node:http';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { callbridgeRouter } from '../server/callbridgeRouter.ts';

async function httpJson(baseUrl: string, method: string, path: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: MARRIAGE EVENT NO-HISTORY & BATCH LIFECYCLE CLEANUP');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: any) {
    if (condition) {
      console.log(`  ✓ [PASS] ${name}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
      failed++;
      process.exitCode = 1;
    }
  }

  const runId = Date.now();
  const tenantId = `tenant_marr_hist_${runId}`;
  const marrEventId = `evt_marr_hist_${runId}`;
  const pubEventId = `evt_pub_hist_ref_${runId}`;
  const polEventId = `evt_pol_hist_ref_${runId}`;

  callbridgeStorage.saveTenant({
    id: tenantId,
    name: 'Marriage Lifecycle Test Tenant',
    email: 'marr-lifecycle@example.com',
    organization: 'Test Org',
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
  const savedClient001Sub = JSON.parse(JSON.stringify(callbridgeStorage.getSubscription('client_001')));

  callbridgeStorage.saveEvent({
    id: marrEventId,
    name: 'Test Wedding Batch Lifecycle',
    type: 'marriage_event',
    language: 'te',
    config: { approvedScript: 'నమస్కారం! మీరు వివాహ వేడుకకు హాజరవుతారా?' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const app = express();
  app.use(express.json());
  app.use('/api/callbridge', callbridgeRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr: any = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/api/callbridge`;

  const origCreateOutbound = VapiService.createOutboundCall;
  const origGetCallStatus = VapiService.getCallStatus;
  const origTerminateCall = VapiService.terminateCall;
  const origSendLiveCallControl = VapiService.sendLiveCallControl;

  const createdCampaignIds: string[] = [];

  try {
    const dispatchedCalls: Array<{ campaignId: string; jobId: string; providerCallId: string; phone: string }> = [];
    let seqCounter = 0;

    VapiService.createOutboundCall = async (params: any) => {
      seqCounter++;
      const providerId = `019aaa00-${String(seqCounter).padStart(4, '0')}-7000-8000-${runId.toString(16).slice(-12)}`;
      dispatchedCalls.push({
        campaignId: params.campaignId,
        jobId: params.jobId,
        providerCallId: providerId,
        phone: params.phoneNumber,
      });
      VapiService.initMarriageCallState(providerId);
      VapiService.registerTransientActiveCall(providerId, {
        campaignId: params.campaignId,
        jobId: params.jobId,
        eventId: params.eventId,
        phone: params.phoneNumber,
      });
      VapiService.activeCallControls.set(providerId, {
        controlUrl: `https://api.vapi.ai/call/control/mock-hist-${seqCounter}`,
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

    async function completeActiveCall(providerCallId: string, spokenUser: string) {
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: { type: 'status-update', status: 'in-progress', call: { id: providerCallId } },
      });
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: providerCallId } },
      });
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: { type: 'transcript', role: 'user', transcriptType: 'final', transcript: spokenUser, call: { id: providerCallId } },
      });
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: { type: 'transcript', role: 'assistant', transcriptType: 'final', transcript: 'సరే అండి, ధన్యవాదాలు.', call: { id: providerCallId } },
      });
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: { type: 'speech-update', role: 'assistant', status: 'stopped', call: { id: providerCallId } },
      });
      await httpJson(baseUrl, 'POST', '/vapi/webhook', {
        message: {
          type: 'status-update',
          status: 'ended',
          endedReason: 'assistant-ended-call',
          call: { id: providerCallId, status: 'ended', durationSeconds: 18 },
        },
      });
    }

    // =========================================================================
    // 1. BATCH 1: Import 2 contacts -> Start -> Running State -> Complete Cleanup
    // =========================================================================
    console.log('--- 1. Batch 1 Sequential Execution, Progress & Completion Cleanup ---');
    const commit1 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/contacts/commit-bulk`, {
      source: 'csv',
      contacts: [
        { name: 'Batch1 Guest A', phone: '+919876541001', status: 'Valid' },
        { name: 'Batch1 Guest B', phone: '+919876541002', status: 'Valid' },
      ],
    });
    assert(commit1.status === 200 && commit1.data.count === 2, 'Batch 1 imported 2 contacts');

    const create1 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns`, {
      name: 'Wedding Batch 1',
      concurrencyLimit: 1,
    });
    const batch1Id = create1.data.campaign.id;
    createdCampaignIds.push(batch1Id);
    assert(
      create1.status === 200 && create1.data.campaign.totalContacts === 2 && create1.data.campaign.pendingCount === 2,
      'Batch 1 created with totalContacts=2 & pendingCount=2'
    );

    const start1 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns/${batch1Id}/start`, {});
    assert(start1.status === 200 && start1.data.success, 'Batch 1 queue started');
    await new Promise((r) => setTimeout(r, 80));

    assert(dispatchedCalls.length === 1 && dispatchedCalls[0].phone === '+919876541001', 'Batch 1 dispatches only Contact A first');

    const histWhileRunning = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/call-history`);
    assert(
      histWhileRunning.status === 200 && Array.isArray(histWhileRunning.data.jobs) && histWhileRunning.data.jobs.length === 0,
      'GET /call-history returns [] for Marriage Event during active batch'
    );

    // Complete Contact A (ATTENDING)
    await completeActiveCall(dispatchedCalls[0].providerCallId, 'వస్తున్నాము.');

    // Wait for Contact B to be dispatched (600ms queue delay + async)
    await new Promise((r) => setTimeout(r, 800));
    assert(dispatchedCalls.length === 2 && dispatchedCalls[1].phone === '+919876541002', 'Contact B dialed sequentially after Contact A confirmed ended');

    // While Batch 1 is still running (Contact B active), batch contacts MUST NOT be prematurely deleted
    const contactsMidRun = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/contacts`);
    assert(contactsMidRun.data.contacts.length === 2, 'Running Batch 1 contacts NOT deleted before batch finishes');

    const campsMidRun = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/campaigns`);
    const b1Mid = campsMidRun.data.campaigns.find((c: any) => c.id === batch1Id);
    assert(
      b1Mid?.status === 'running' && b1Mid?.processedCount === 1 && b1Mid?.activeCalls === 1 && b1Mid?.pendingCount === 0,
      'Running batch progress counters accurate while 2nd/last contact is on line',
      { status: b1Mid?.status, processed: b1Mid?.processedCount, active: b1Mid?.activeCalls, pending: b1Mid?.pendingCount }
    );

    // Complete Contact B (NOT_ATTENDING)
    await completeActiveCall(dispatchedCalls[1].providerCallId, 'రాలేము.');
    await new Promise((r) => setTimeout(r, 150));

    const campsAfterB1 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/campaigns`);
    const b1Done = campsAfterB1.data.campaigns.find((c: any) => c.id === batch1Id);
    assert(
      b1Done?.status === 'completed' &&
        b1Done?.totalContacts === 2 &&
        b1Done?.processedCount === 2 &&
        b1Done?.activeCalls === 0 &&
        b1Done?.pendingCount === 0,
      'Batch 1 marked completed with full progress counters intact',
      b1Done
    );

    const contactsAfterB1 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/contacts`);
    assert(
      contactsAfterB1.data.contacts.length === 0,
      'Completed Batch 1 contact phone numbers cleaned up from Marriage Event contacts'
    );

    const jobsAfterB1 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/campaigns/${batch1Id}/jobs`);
    assert(
      jobsAfterB1.data.jobs.length === 0 && callbridgeStorage.getCallJobs(batch1Id).length === 0,
      'Completed Batch 1 individual call jobs & history removed completely'
    );

    const analyticsAfterB1 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/analytics`);
    const mRsvp1 = analyticsAfterB1.data.analytics?.moduleSpecificMetrics?.marriageRsvp;
    assert(
      mRsvp1?.attendingCount === 1 && mRsvp1?.notAttendingCount === 1 && mRsvp1?.answeredCalls === 2 && mRsvp1?.totalCallsInitiated === 2,
      'Marriage aggregate attendance analytics remain completely intact after Batch 1 cleanup',
      mRsvp1
    );

    // =========================================================================
    // 2. BATCH 2: Newly imported contacts MUST NOT mix with completed Batch 1
    // =========================================================================
    console.log('\n--- 2. Batch 2 Isolation (No Mixing With Old Completed Batch) ---');
    const commit2 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/contacts/commit-bulk`, {
      source: 'csv',
      contacts: [
        { name: 'Batch2 Guest C', phone: '+919876542001', status: 'Valid' },
        { name: 'Batch2 Guest D', phone: '+919876542002', status: 'Valid' },
      ],
    });
    assert(commit2.status === 200 && commit2.data.count === 2, 'Batch 2 imported 2 fresh contacts');

    const contactsBeforeB2 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/contacts`);
    const phonesBeforeB2 = contactsBeforeB2.data.contacts.map((c: any) => c.phone);
    assert(
      phonesBeforeB2.length === 2 &&
        phonesBeforeB2.includes('+919876542001') &&
        phonesBeforeB2.includes('+919876542002') &&
        !phonesBeforeB2.includes('+919876541001'),
      'Only Batch 2 contacts appear in active event contacts',
      phonesBeforeB2
    );

    const create2 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns`, {
      name: 'Wedding Batch 2',
      concurrencyLimit: 1,
    });
    const batch2Id = create2.data.campaign.id;
    createdCampaignIds.push(batch2Id);
    assert(
      create2.data.campaign.totalContacts === 2 && create2.data.queuedJobs === 2,
      'New Batch 2 queues ONLY the 2 newly imported contacts (never old Batch 1)'
    );

    await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns/${batch2Id}/start`, {});
    await new Promise((r) => setTimeout(r, 80));
    assert(dispatchedCalls.length === 3 && dispatchedCalls[2].phone === '+919876542001', 'Batch 2 first call dials Batch 2 Guest C');
    await completeActiveCall(dispatchedCalls[2].providerCallId, 'చూద్దాం.');
    await new Promise((r) => setTimeout(r, 800));
    assert(dispatchedCalls.length === 4 && dispatchedCalls[3].phone === '+919876542002', 'Batch 2 second call dials Batch 2 Guest D');
    await completeActiveCall(dispatchedCalls[3].providerCallId, 'వస్తాము.');
    await new Promise((r) => setTimeout(r, 150));

    const b2PhonesEverDialed = dispatchedCalls.filter((c) => c.campaignId === batch2Id).map((c) => c.phone);
    assert(
      b2PhonesEverDialed.length === 2 && !b2PhonesEverDialed.includes('+919876541001') && !b2PhonesEverDialed.includes('+919876541002'),
      'Batch 2 never dialed any Batch 1 contact',
      b2PhonesEverDialed
    );

    const contactsAfterB2 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/contacts`);
    assert(contactsAfterB2.data.contacts.length === 0, 'Completed Batch 2 contacts also cleaned up after completion');

    const analyticsAfterB2 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/analytics?campaignId=${batch2Id}`);
    const mRsvp2 = analyticsAfterB2.data.analytics?.moduleSpecificMetrics?.marriageRsvp;
    assert(
      mRsvp2?.attendingCount === 1 && mRsvp2?.maybeCount === 1 && mRsvp2?.answeredCalls === 2,
      'Batch 2 campaign-scoped RSVP analytics preserved after cleanup',
      mRsvp2
    );

    // =========================================================================
    // 3. RUNNING BATCH PROTECTION FOR UNQUEUED FUTURE CONTACTS
    // =========================================================================
    console.log('\n--- 3. Unqueued Future Contacts Preserved When Running Batch Completes ---');
    const commit3 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/contacts/commit-bulk`, {
      source: 'manual',
      contacts: [{ name: 'Batch3 Guest E', phone: '+919876543001', status: 'Valid' }],
    });
    assert(commit3.data.count === 1, 'Batch 3 added 1 contact');
    const create3 = await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns`, {
      name: 'Wedding Batch 3',
      concurrencyLimit: 1,
    });
    const batch3Id = create3.data.campaign.id;
    createdCampaignIds.push(batch3Id);

    // Add an unqueued future contact G BEFORE batch 3 completes
    await httpJson(baseUrl, 'POST', `/events/${marrEventId}/contacts`, {
      name: 'Future Batch4 Guest G',
      phone: '+919876544001',
    });

    await httpJson(baseUrl, 'POST', `/events/${marrEventId}/campaigns/${batch3Id}/start`, {});
    await new Promise((r) => setTimeout(r, 80));
    await completeActiveCall(dispatchedCalls[4].providerCallId, 'వస్తున్నాము.');
    await new Promise((r) => setTimeout(r, 150));

    const contactsAfterB3 = await httpJson(baseUrl, 'GET', `/events/${marrEventId}/contacts`);
    assert(
      contactsAfterB3.data.contacts.length === 1 && contactsAfterB3.data.contacts[0].phone === '+919876544001',
      'Completing Batch 3 deletes ONLY Batch 3 contact E and preserves unqueued future contact G',
      contactsAfterB3.data.contacts.map((c: any) => c.phone)
    );

    // =========================================================================
    // 4. NON-MARRIAGE MODULES UNTOUCHED (Public Survey & Political Campaign)
    // =========================================================================
    console.log('\n--- 4. Non-Regression Check: Public Survey & Political Campaign ---');
    callbridgeStorage.saveEvent({
      id: pubEventId,
      name: 'Test Pub Ref',
      type: 'public_survey',
      language: 'te',
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const pubContact = callbridgeStorage.saveContact({
      id: `cnt_pub_ref_${runId}`,
      userId: tenantId,
      eventId: pubEventId,
      name: 'Citizen Pub',
      phone: '+919876549001',
      originalPhone: '+919876549001',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const pubCampId = `camp_pub_ref_${runId}`;
    callbridgeStorage.saveCampaign({
      id: pubCampId,
      eventId: pubEventId,
      clientId: tenantId,
      name: 'Pub Ref Camp',
      status: 'completed',
      concurrencyLimit: 1,
      totalContacts: 1,
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      optOutCount: 0,
      queuedContactIds: [pubContact.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    callbridgeStorage.saveCallJob({
      id: `job_pub_ref_${runId}`,
      campaignId: pubCampId,
      eventId: pubEventId,
      contactId: pubContact.id,
      contactName: pubContact.name,
      contactPhone: pubContact.phone,
      status: 'completed',
      retryCount: 0,
      maxRetries: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const pubCleanupRes = callbridgeStorage.cleanupCompletedMarriageBatch(pubCampId);
    assert(
      pubCleanupRes.purgedJobs === 0 &&
        pubCleanupRes.purgedContacts === 0 &&
        callbridgeStorage.getContacts(pubEventId).length === 1 &&
        callbridgeStorage.getCallJobs(pubCampId).length === 1,
      'Public Survey contacts & completed callJobs remain 100% preserved'
    );

    callbridgeStorage.saveEvent({
      id: polEventId,
      name: 'Test Pol Ref',
      type: 'political_campaign',
      language: 'te',
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const polContact = callbridgeStorage.saveContact({
      id: `cnt_pol_ref_${runId}`,
      userId: tenantId,
      eventId: polEventId,
      name: 'Voter Pol',
      phone: '+919876549002',
      originalPhone: '+919876549002',
      consentStatus: 'granted',
      optOut: false,
      importSource: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const polCampId = `camp_pol_ref_${runId}`;
    callbridgeStorage.saveCampaign({
      id: polCampId,
      eventId: polEventId,
      clientId: tenantId,
      name: 'Pol Ref Camp',
      status: 'completed',
      concurrencyLimit: 1,
      totalContacts: 1,
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      optOutCount: 0,
      queuedContactIds: [polContact.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const polCleanupRes = callbridgeStorage.cleanupCompletedMarriageBatch(polCampId);
    assert(
      polCleanupRes.purgedContacts === 0 && callbridgeStorage.getContacts(polEventId).length === 1,
      'Political Campaign contacts remain unaffected by Marriage cleanup'
    );

    // =========================================================================
    // 5. STATIC / UI VERIFICATION CHECKS ON OutboundQueueView.tsx
    // =========================================================================
    console.log('\n--- 5. OutboundQueueView UI Branching Verification ---');
    const fs = await import('node:fs');
    const outQueueSource = fs.readFileSync('src/components/OutboundQueueView.tsx', 'utf8');
    assert(
      outQueueSource.includes('const isMarriageEvent = resolvedEventType === \'marriage_event\';') &&
        outQueueSource.includes('const isAggregateProgressView = isPoliticalCampaign || isMarriageEvent;'),
      'OutboundQueueView enables aggregate Sequential Campaign Progress view for marriage_event'
    );
    assert(
      outQueueSource.includes('{isAggregateProgressView ? (') &&
        !outQueueSource.includes('/* PUBLIC SURVEY & MARRIAGE EVENT: FULL HISTORY TABLE */'),
      'Marriage Event uses Sequential Campaign Progress branch and never enters Sequential Calling Queue history table'
    );
    assert(
      outQueueSource.includes("isMarriageEvent") &&
        outQueueSource.includes("'Automated sequential dispatch running strictly 1 call at a time. Each wedding invitation call finishes politely before advancing to the next contact.'"),
      'Marriage Event uses non-DTMF copy in Sequential Campaign Progress card'
    );
  } finally {
    VapiService.createOutboundCall = origCreateOutbound;
    VapiService.getCallStatus = origGetCallStatus;
    VapiService.terminateCall = origTerminateCall;
    VapiService.sendLiveCallControl = origSendLiveCallControl;
    server.close();

    // Clean up test fixtures from callbridge_db.json
    for (const c of callbridgeStorage.getContacts(marrEventId)) callbridgeStorage.deleteContact(c.id);
    for (const c of callbridgeStorage.getContacts(pubEventId)) callbridgeStorage.deleteContact(c.id);
    for (const c of callbridgeStorage.getContacts(polEventId)) callbridgeStorage.deleteContact(c.id);
    for (const cid of createdCampaignIds) callbridgeStorage.deleteCampaign(cid);
    callbridgeStorage.deleteCampaign(`camp_pub_ref_${runId}`);
    callbridgeStorage.deleteCampaign(`camp_pol_ref_${runId}`);
    for (const eid of [marrEventId, pubEventId, polEventId]) {
      const dbAny = (callbridgeStorage as any).data;
      delete dbAny.events[eid];
      delete dbAny.aggregateAnalytics[eid];
    }
    delete (callbridgeStorage as any).data.tenants[tenantId];
    delete (callbridgeStorage as any).data.subscriptions[tenantId];
    callbridgeStorage.saveSubscription(savedClient001Sub);
    (callbridgeStorage as any).persist();
  }

  console.log('\n================================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
