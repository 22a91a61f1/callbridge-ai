import { callbridgeStorage, type CallJobRecord, type CampaignRecord, type ContactRecord } from '../storage/callbridgeStorage.ts';
import { VapiService } from '../telephony/vapiService.ts';
import { ElevenLabsService } from '../voice/elevenLabsService.ts';
import { sanitizeScriptForSpeech } from '../templates/templateEngine.ts';
import { SurveySequentialEngine } from '../survey/surveySequentialEngine.ts';
import { providerCapacityController } from './providerCapacityController.ts';

interface ActiveRunner {
  campaignId: string;
  tenantId: string;
  isPaused: boolean;
  isStopped: boolean;
  timer: NodeJS.Timeout | null;
}

const ACTIVE_JOB_STATUSES = new Set(['initiating', 'calling', 'ringing', 'in_progress']);
const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'no_answer',
  'busy',
  'opted_out',
  'interrupted',
  'callback_scheduled',
]);

class QueueManager {
  private activeRunners = new Map<string, ActiveRunner>();
  private terminalHandledJobs = new Set<string>();
  private campaignDispatchingLocks = new Set<string>();
  private monitoredJobs = new Set<string>();
  private monitorTimers = new Map<string, NodeJS.Timeout>();
  private waitingForCapacityCampaigns = new Set<string>();
  private backgroundSweepInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor() {
    this.reconcileOnStartup().catch((err: any) => {
      console.warn('[QUEUE_STARTUP_RECONCILE_WARN]', err?.message || err);
    });
    VapiService.onCallTerminal((campaignId, jobId, outcome) => {
      this.onJobTerminal(campaignId, jobId, outcome);
    });
    providerCapacityController.onCapacityAvailable(() => {
      if (!this.isShuttingDown) {
        this.scheduleEligibleQueues();
      }
    });
    this.startBackgroundScheduler();
  }

  private startBackgroundScheduler(): void {
    if (this.backgroundSweepInterval) return;
    // Lightweight server-side background sweep keeps all independent customer queues advancing
    // even if browsers close, tabs close, or provider capacity frees up after backoff.
    this.backgroundSweepInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.scheduleEligibleQueues();
    }, 2000);
    if (typeof this.backgroundSweepInterval.unref === 'function') {
      this.backgroundSweepInterval.unref();
    }
  }

  public prepareForShutdown(): void {
    this.isShuttingDown = true;
    if (this.backgroundSweepInterval) {
      clearInterval(this.backgroundSweepInterval);
      this.backgroundSweepInterval = null;
    }
    for (const runner of this.activeRunners.values()) {
      if (runner.timer) {
        clearTimeout(runner.timer);
        runner.timer = null;
      }
    }
    for (const timer of this.monitorTimers.values()) {
      clearTimeout(timer);
    }
    this.monitorTimers.clear();
    this.monitoredJobs.clear();
    // Flush persisted state cleanly without prematurely releasing active provider locks
    callbridgeStorage.persist();
  }

  /**
   * Resets in-memory timers/maps and runs full startup reconciliation from disk.
   * Used on server boot and in restart-recovery verification tests.
   */
  public async simulateRestartAndReconcile(): Promise<void> {
    this.isShuttingDown = false;
    for (const runner of this.activeRunners.values()) {
      if (runner.timer) clearTimeout(runner.timer);
    }
    this.activeRunners.clear();
    this.terminalHandledJobs.clear();
    this.campaignDispatchingLocks.clear();
    for (const timer of this.monitorTimers.values()) {
      clearTimeout(timer);
    }
    this.monitorTimers.clear();
    this.monitoredJobs.clear();
    this.waitingForCapacityCampaigns.clear();
    providerCapacityController.resetInMemoryState();
    callbridgeStorage.reloadFromDisk();
    await this.reconcileOnStartup();
    this.startBackgroundScheduler();
  }

  /**
   * Universal startup reconciliation across ALL customers & ALL 3 modules:
   * 1. Restores every persisted in-flight call's per-tenant lock & provider slot FIRST.
   * 2. Reconciles each in-flight call against Vapi before dispatching any new call for that customer.
   * 3. Never dispatches a second call while a customer's previous call has an uncertain status.
   * 4. Independently resumes eligible running queues for every customer.
   */
  public async reconcileOnStartup(): Promise<void> {
    try {
      // 1. Restore all persisted in-flight jobs & tenant queue locks BEFORE any dispatch
      const activeJobs = callbridgeStorage.getAllActiveJobs();
      const restoredByCampaign = new Map<string, CallJobRecord[]>();

      for (const job of activeJobs) {
        const camp = job.campaignId ? callbridgeStorage.getCampaign(job.campaignId) : undefined;
        const tenantId =
          (job.clientId && job.clientId !== 'user_default' ? job.clientId : undefined) ||
          (camp?.clientId && camp.clientId !== 'user_default' ? camp.clientId : undefined);
        if (!tenantId) {
          console.warn(`[QUEUE_RECOVERY_SKIP_UNOWNED_JOB] Skipping active job ${job.id} with missing/unverified tenant ownership.`);
          continue;
        }
        providerCapacityController.restoreLeaseFromPersistence({
          jobId: job.id,
          tenantId,
          campaignId: job.campaignId,
          providerCallId: job.providerCallId || camp?.activeCallProviderId || undefined,
          state: job.status === 'initiating' ? 'initiating' : 'active',
          acquiredAt: job.startedAt || job.createdAt,
        });
        const list = restoredByCampaign.get(job.campaignId) || [];
        list.push(job);
        restoredByCampaign.set(job.campaignId, list);
      }

      // Also restore any persisted tenantQueueStates whose job was already purged (e.g. Zero-PII)
      const persistedTenantStates = callbridgeStorage.getAllTenantQueueStates();
      for (const [tenantId, tState] of Object.entries(persistedTenantStates)) {
        if (tState?.activeJobId && !callbridgeStorage.isJobTerminalHandled(tState.activeJobId)) {
          providerCapacityController.restoreLeaseFromPersistence({
            jobId: tState.activeJobId,
            tenantId,
            campaignId: tState.activeCampaignId || 'campaign_recovered',
            providerCallId: tState.activeProviderCallId || undefined,
            state: tState.activeCallState || 'active',
            acquiredAt: tState.updatedAt,
          });
        }
      }

      // 2. Register active runners for all persisted running campaigns across all customers
      const allCampaigns = callbridgeStorage.getAllCampaigns();
      const runningCampaigns = allCampaigns.filter((c) => c.status === 'running');
      for (const camp of runningCampaigns) {
        const tenantId = camp.clientId && camp.clientId !== 'user_default' ? camp.clientId : undefined;
        if (!tenantId) {
          console.warn(`[QUEUE_RECOVERY_SKIP_UNOWNED_CAMPAIGN] Skipping running campaign ${camp.id} with missing/unverified tenant ownership.`);
          continue;
        }
        if (!this.activeRunners.has(camp.id)) {
          this.activeRunners.set(camp.id, {
            campaignId: camp.id,
            tenantId,
            isPaused: false,
            isStopped: false,
            timer: null,
          });
        }
        console.log(`[QUEUE_RECOVERY] Restored running campaign ${camp.id} (tenant=${tenantId}).`);
      }

      // 3. Reconcile every in-flight call against Vapi FIRST before starting any new calls
      const reconciledCampaigns = new Set<string>();
      for (const [campaignId, jobs] of restoredByCampaign.entries()) {
        reconciledCampaigns.add(campaignId);
        for (const job of jobs) {
          await this.reconcileSingleActiveJob(campaignId, job);
        }
      }

      // Also reconcile any persisted tenantQueueStates not already handled above
      for (const tState of Object.values(persistedTenantStates)) {
        if (tState?.activeJobId && tState.activeCampaignId && !reconciledCampaigns.has(tState.activeCampaignId)) {
          const existingJob = callbridgeStorage.getCallJob(tState.activeJobId);
          if (existingJob && ACTIVE_JOB_STATUSES.has(existingJob.status)) {
            await this.reconcileSingleActiveJob(tState.activeCampaignId, existingJob);
          } else if (!existingJob && tState.activeProviderCallId) {
            await this.reconcileCampaign(tState.activeCampaignId);
          }
        }
      }

      // 4. Resume eligible running campaigns whose customer has no active/uncertain call
      for (const camp of runningCampaigns) {
        const freshCamp = callbridgeStorage.getCampaign(camp.id);
        if (!freshCamp || freshCamp.status !== 'running') continue;
        const tenantId = freshCamp.clientId && freshCamp.clientId !== 'user_default' ? freshCamp.clientId : undefined;
        if (!tenantId) continue;
        if (providerCapacityController.hasActiveTenantCall(tenantId)) {
          continue; // Keep locked until confirmed terminal
        }
        this.processNext(freshCamp.id);
      }
    } catch (e: any) {
      console.warn('[QUEUE_RECOVERY_WARN]', e?.message || e);
    }
  }

  private async reconcileSingleActiveJob(campaignId: string, job: CallJobRecord): Promise<void> {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    const providerCallId =
      job.providerCallId ||
      campaign?.activeCallProviderId ||
      VapiService.getProviderCallIdByJobId(job.id) ||
      callbridgeStorage.getProviderCallIdByJobId(job.id);

    if (!providerCallId) {
      // Initiating call crashed before receiving a providerCallId: keep monitoring/quarantined rather than duplicating blindly
      console.warn(`[QUEUE_RECOVERY_UNCERTAIN_JOB] Active job ${job.id} (campaign=${campaignId}) has no providerCallId yet; holding tenant lock until verified.`);
      this.monitorJobUntilTerminal(job.id, campaignId);
      return;
    }

    try {
      const statusRes = await VapiService.getCallStatus(providerCallId);
      const status = String(statusRes?.status || '').toLowerCase();
      const isGenuineTerminal = Boolean(
        statusRes &&
        (status !== 'error' || statusRes.httpStatus === 404) &&
        (statusRes.isTerminal || TERMINAL_JOB_STATUSES.has(status) || status === 'ended')
      );

      if (isGenuineTerminal) {
        const isAns = status === 'completed' || status === 'interrupted' || status === 'callback_scheduled' || Boolean(statusRes.dtmfDigit);
        this.onJobTerminal(campaignId, job.id, {
          isAnswered: isAns,
          isNoAnswer: status === 'no_answer',
          isFailed: status === 'failed' || status === 'busy' || status === 'error',
          status: status === 'error' ? 'failed' : status === 'ended' ? 'completed' : status,
        });
        return;
      }

      // Still active or uncertain on Vapi -> keep lock held & attach monitor
      console.log(`[QUEUE_RECOVERY_STILL_ACTIVE] Job ${job.id} (${providerCallId}) status=${status || 'uncertain'}. Holding lock and monitoring.`);
      this.monitorJobUntilTerminal(job.id, campaignId);
    } catch (err: any) {
      // Network/provider error during startup reconciliation -> NEVER treat as ended! Hold lock and monitor.
      console.warn(`[QUEUE_RECOVERY_UNCERTAIN_STATUS] Could not confirm ${job.id} (${providerCallId}): ${err?.message || err}. Keeping tenant lock held.`);
      this.monitorJobUntilTerminal(job.id, campaignId);
    }
  }

  /**
   * Checks all running & waiting customer queues and dispatches eligible pending jobs
   * independently whenever their tenant lock AND provider capacity allow.
   */
  public scheduleEligibleQueues(): void {
    if (this.isShuttingDown) return;

    const candidateCampaignIds = new Set<string>(this.waitingForCapacityCampaigns);
    for (const [campId, runner] of this.activeRunners.entries()) {
      if (!runner.isPaused && !runner.isStopped) {
        candidateCampaignIds.add(campId);
      }
    }
    for (const camp of callbridgeStorage.getAllCampaigns()) {
      if (camp.status === 'running') {
        candidateCampaignIds.add(camp.id);
      }
    }

    for (const campId of candidateCampaignIds) {
      const snap = providerCapacityController.getSnapshot();
      if (snap.availableSlots <= 0 || snap.backoffRemainingMs > 0) {
        break;
      }
      const camp = callbridgeStorage.getCampaign(campId);
      if (!camp || camp.status !== 'running') {
        this.waitingForCapacityCampaigns.delete(campId);
        continue;
      }
      const tenantId = camp.clientId && camp.clientId !== 'user_default' ? camp.clientId : undefined;
      if (!tenantId) {
        this.waitingForCapacityCampaigns.delete(campId);
        continue;
      }
      if (!this.activeRunners.has(campId)) {
        this.activeRunners.set(campId, {
          campaignId: campId,
          tenantId,
          isPaused: false,
          isStopped: false,
          timer: null,
        });
      }
      if (providerCapacityController.hasActiveTenantCall(tenantId)) {
        continue;
      }
      this.processNext(campId);
    }
  }

  /**
   * Enqueue contacts for a campaign
   */
  public createCampaignJobs(campaignId: string, eventId: string, contactIds: string[]): CallJobRecord[] {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    const contacts = callbridgeStorage.getContacts(eventId, campaign?.clientId);
    const selectedContacts = contactIds.length > 0
      ? contactIds.map((id) => contacts.find((c) => c.id === id)).filter((c): c is ContactRecord => Boolean(c))
      : contacts;

    const existingJobs = callbridgeStorage.getCallJobs(campaignId);
    const existingPhones = new Set(existingJobs.map((j) => j.contactPhone));

    const now = new Date().toISOString();
    const newJobs: CallJobRecord[] = [];

    for (let idx = 0; idx < selectedContacts.length; idx++) {
      const contact = selectedContacts[idx];
      // Prevent duplicate calls to same contact within the same campaign
      if (existingPhones.has(contact.phone)) {
        continue;
      }

      // Check opt-out and consent
      let initialStatus: CallJobRecord['status'] = 'pending';
      if (contact.optOut) {
        initialStatus = 'opted_out';
      } else if (contact.consentStatus === 'revoked') {
        initialStatus = 'skipped';
      }

      const resolvedJobClientId =
        (campaign?.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined) ||
        ((contact as any).clientId && (contact as any).clientId !== 'user_default' ? (contact as any).clientId : undefined) ||
        (contact.userId && contact.userId !== 'user_default' ? contact.userId : undefined);
      if (!resolvedJobClientId) {
        console.warn(`[QUEUE_SKIP_UNOWNED_CONTACT] Skipping contact ${contact.id} with missing verified tenant ownership.`);
        continue;
      }

      const jobCreatedAt = new Date(Date.now() + idx * 50).toISOString();
      const job: CallJobRecord = {
        id: `job_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        clientId: resolvedJobClientId,
        campaignId,
        eventId,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        status: initialStatus,
        retryCount: 0,
        maxRetries: 2,
        metadata: { queueOrder: idx },
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt,
      };

      newJobs.push(job);
      existingPhones.add(contact.phone);
    }

    callbridgeStorage.saveCallJobsBulk(newJobs);

    const targetCampaign = callbridgeStorage.getCampaign(campaignId);
    if (targetCampaign) {
      const allJobs = callbridgeStorage.getCallJobs(campaignId);
      const existingQueuedIds = Array.isArray(targetCampaign.queuedContactIds) ? targetCampaign.queuedContactIds : [];
      targetCampaign.queuedContactIds = Array.from(
        new Set([...existingQueuedIds, ...selectedContacts.map((c) => c.id)])
      );
      targetCampaign.totalContacts = Math.max(allJobs.length, targetCampaign.totalContacts || 0);
      targetCampaign.pendingCount = allJobs.filter((j) => j.status === 'pending').length;
      targetCampaign.optOutCount = allJobs.filter((j) => j.status === 'opted_out').length;
      callbridgeStorage.saveCampaign(targetCampaign);
    }

    return newJobs;
  }

  /**
   * Start or Resume campaign queue
   */
  public startCampaign(campaignId: string): { success: boolean; message: string; campaign?: CampaignRecord } {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign) {
      return { success: false, message: 'Campaign not found' };
    }

    const tenantId = campaign.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined;
    if (!tenantId) {
      return {
        success: false,
        message: 'Cannot start campaign: Missing verified customer tenant ownership.',
      };
    }

    const event = campaign.eventId ? callbridgeStorage.getEvent(campaign.eventId, tenantId) : null;
    if (event?.type === 'public_survey') {
      const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(campaign.eventId, tenantId);
      if (!activeQuestions || activeQuestions.length === 0) {
        return {
          success: false,
          message: 'Cannot start survey: Public Survey has no active questions. Please add at least one question before starting.',
        };
      }
    }

    let runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = false;
      runner.isStopped = false;
      runner.tenantId = tenantId;
    } else {
      runner = {
        campaignId,
        tenantId,
        isPaused: false,
        isStopped: false,
        timer: null,
      };
      this.activeRunners.set(campaignId, runner);
    }

    campaign.status = 'running';
    campaign.updatedAt = new Date().toISOString();
    callbridgeStorage.saveCampaign(campaign);

    this.processNext(campaignId);
    return { success: true, message: 'Campaign started successfully', campaign };
  }

  /**
   * Pause campaign queue: stops initiating new calls for THIS customer's campaign only.
   * Preserves any active call and does NOT release the active-call lock until confirmed terminal.
   */
  public pauseCampaign(campaignId: string): { success: boolean; message: string; campaign?: CampaignRecord } {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (campaign) {
      campaign.status = 'paused';
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
    }

    this.waitingForCapacityCampaigns.delete(campaignId);
    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = true;
      if (runner.timer) {
        clearTimeout(runner.timer);
        runner.timer = null;
      }
    }

    return { success: true, message: 'Campaign paused', campaign: campaign || undefined };
  }

  /**
   * Continue / Resume campaign queue
   * Resumes a paused or stopped queue, picking up from the next pending contact.
   * Does NOT re-call completed or failed contacts.
   */
  public resumeCampaign(campaignId: string): { success: boolean; message: string; campaign?: CampaignRecord } {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign) {
      return { success: false, message: 'Campaign not found' };
    }

    const tenantId = campaign.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined;
    if (!tenantId) {
      return { success: false, message: 'Cannot resume campaign: Missing verified customer tenant ownership.' };
    }
    let runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = false;
      runner.isStopped = false;
      runner.tenantId = tenantId;
    } else {
      runner = {
        campaignId,
        tenantId,
        isPaused: false,
        isStopped: false,
        timer: null,
      };
      this.activeRunners.set(campaignId, runner);
    }

    campaign.status = 'running';
    campaign.updatedAt = new Date().toISOString();
    callbridgeStorage.saveCampaign(campaign);

    this.processNext(campaignId);
    return { success: true, message: 'Queue continued. Processing next pending contact.', campaign };
  }

  /**
   * Stop campaign queue: Stops initiating new calls, preserves active call state, allows safe resume.
   */
  public stopCampaign(campaignId: string): { success: boolean; message: string; campaign?: CampaignRecord } {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (campaign) {
      campaign.status = 'stopped';
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
    }

    this.waitingForCapacityCampaigns.delete(campaignId);
    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = true;
      runner.isStopped = true;
      if (runner.timer) {
        clearTimeout(runner.timer);
        runner.timer = null;
      }
    }

    // Preserve active call in progress - DO NOT cancel ongoing conversations or release lock prematurely!
    console.log(`[QUEUE_STOPPED] Campaign ${campaignId} stopped initiating new calls. Active call preserved.`);
    return { success: true, message: 'Queue stopped. Current active call is preserved and no new calls will be placed.', campaign: campaign || undefined };
  }

  /**
   * Cancel campaign queue: Cancels remaining pending jobs for THIS campaign only.
   * If an active provider call is in progress, requests termination via Vapi and waits for
   * provider terminal confirmation before marking it finished or releasing the provider slot.
   * Never affects any other customer's queue or active calls.
   */
  public async cancelCampaign(campaignId: string): Promise<{ success: boolean; message: string; campaign?: CampaignRecord }> {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    this.waitingForCapacityCampaigns.delete(campaignId);

    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isStopped = true;
      if (runner.timer) {
        clearTimeout(runner.timer);
        runner.timer = null;
      }
      this.activeRunners.delete(campaignId);
    }

    const jobs = callbridgeStorage.getCallJobs(campaignId);
    const now = new Date().toISOString();
    let hasActiveProviderCallAwaitingConfirmation = false;

    for (const j of jobs) {
      if (j.status === 'pending') {
        j.status = 'cancelled';
        j.updatedAt = now;
        callbridgeStorage.saveCallJob(j);
      } else if (ACTIVE_JOB_STATUSES.has(j.status)) {
        const providerCallId = j.providerCallId || campaign?.activeCallProviderId || VapiService.getProviderCallIdByJobId(j.id);
        if (providerCallId) {
          // Request cancellation on Vapi, mark lease as cancelling, and keep monitoring until provider confirms terminal state
          hasActiveProviderCallAwaitingConfirmation = true;
          providerCapacityController.markCancelling(j.id);
          j.metadata = { ...(j.metadata || {}), cancelRequestedAt: now };
          j.updatedAt = now;
          callbridgeStorage.saveCallJob(j);

          VapiService.terminateCall(
            providerCallId,
            j.metadata?.controlUrl,
            j.metadata?.controlAuthenticationEnabled
          ).catch((e: any) => {
            console.warn(`[CANCEL_CAMPAIGN_TERMINATE_WARN] ${providerCallId}:`, e?.message || e);
          });

          // Ensure monitor stays active until Vapi confirms call ended
          this.monitorJobUntilTerminal(j.id, campaignId, { allowCancelledCampaign: true });
        } else {
          // Call had not received a providerCallId yet; mark cancelled and release lock
          j.status = 'cancelled';
          j.endedAt = now;
          j.failureReason = 'Cancelled by user before provider placement';
          j.updatedAt = now;
          callbridgeStorage.saveCallJob(j);
          callbridgeStorage.markJobTerminalHandled(j.id);
          providerCapacityController.releaseOnConfirmedTerminal(j.id);
        }
      }
    }

    if (campaign) {
      campaign.status = 'cancelled';
      campaign.pendingCount = 0;
      if (!hasActiveProviderCallAwaitingConfirmation) {
        campaign.activeCalls = 0;
        campaign.activeCallId = null;
        campaign.activeCallProviderId = null;
        campaign.activeCallStatus = null;
      } else {
        campaign.activeCallStatus = 'cancelling';
      }
      campaign.updatedAt = now;
      callbridgeStorage.saveCampaign(campaign);
    }

    console.log(`[QUEUE_CANCELLED] Campaign ${campaignId} cancelled by user.`, {
      awaitingProviderConfirmation: hasActiveProviderCallAwaitingConfirmation,
    });
    return {
      success: true,
      message: hasActiveProviderCallAwaitingConfirmation
        ? 'Campaign cancelled. Pending calls removed; active call termination requested and awaiting provider confirmation.'
        : 'Campaign cancelled and pending calls cleared.',
      campaign: campaign || undefined,
    };
  }

  /**
   * Get module-isolated assistant system prompt
   */
  public getAssistantSystemPrompt(eventType: string, language: string = 'te', event?: any): string {
    if (eventType === 'marriage_event') {
      return `You are a respectful, warm family representative delivering a personalized wedding invitation in authentic Telugu script (తెలుగు).

CONVERSATION STATE MACHINE RULES FOR MARRIAGE EVENT:
Current State: STATE 2 (WAITING FOR RSVP).
CRITICAL INSTRUCTION: The complete wedding invitation transcript and the spoken RSVP question were ALREADY completely delivered to the respondent in the opening message.
UNDER NO CIRCUMSTANCES should you ever repeat, recite, re-read, summarize, or restart the wedding invitation transcript, family names, wedding dates, times, or venue details again.
Never recite the invitation transcript again!

CRITICAL — ZERO WAITING / FILLER PHRASES:
- NEVER speak any waiting, hold, thinking, or pause phrases at any point before, during, or after tool calls.
- ABSOLUTELY NEVER say: "ఒక్క క్షణం ఆగండి", "ఒక క్షణం ఆగండి", "ఒక్క సెకండ్ ఆగండి", "ఒక సెకండ్ ఆగండి", "దయచేసి వేచి ఉండండి", "ఒక్క క్షణం", "ఒక క్షణం", "Please wait", "One moment", "Just a second", "Hold on", or any filler speech.
- Invoke tool recordMarriageRsvp SILENTLY with zero filler speech.

YOUR ONLY TASK:
The respondent is answering the spoken RSVP question: "మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?".
Classify their answer into one of the following 3 categories:
1. ATTENDING:
   Telugu: అవును, హా, హా వస్తాను, హా అవును, అవును నేను వస్తాను, వస్తాను, తప్పకుండా వస్తాను, నేను అటెండ్ అవుతాను, వస్తాం, వస్తున్నాను, హాజరవుతాను, విచ్చేస్తాను.
   English: Yes, Yes I will attend, Yeah, Sure, definitely, I will come, We will come, count me in.
   Hindi: Haan, Ji haan, Pakka aaunga, Pakka aaungi, Zaroor aaunga.
   ACTION: Silently invoke recordMarriageRsvp with category "ATTENDING". Speak ONLY:
   "సరే అండి, ధన్యవాదాలు."

2. NOT ATTENDING:
   Telugu: లేదు, లేదు నేను రాను, రాను, రావట్లేదు, రాలేను, రాలేము, నేను అటెండ్ అవ్వను, కుదరదు, రావడం కుదరదు, వీలుకాదు, వీలుపడదు, హాజరు కాలేను.
   English: No, No I cannot come, Nope, cannot attend, unable to attend, not coming, will not attend.
   Hindi: Nahi, Nahi aaunga, Nahi aaungi, Aana mushkil hai.
   ACTION: Silently invoke recordMarriageRsvp with category "NOT_ATTENDING". Speak ONLY:
   "సరే అండి, ధన్యవాదాలు."

3. MAYBE ATTENDING:
   Telugu: చూస్తాను, కుదిరితే వస్తాను, టైం బట్టి, బహుశా వస్తాను, ఇంకా తెలియదు, ప్రయత్నిస్తాను, చూద్దాం, సమయం బట్టి, వీలైతే.
   English: Maybe, I will try, Not sure, Depends on time, tentative.
   Hindi: Dekhenge, Shayad, Koshish karenge.
   ACTION: Silently invoke recordMarriageRsvp with category "MAYBE_ATTENDING". Speak ONLY:
   "సరే అండి, ధన్యవాదాలు."

4. UNCLEAR:
   If and only if the respondent only gave an initial greeting (e.g. "హలో", "నమస్కారం", "hello") or an unclear sound, ask at most ONE short clarification in Telugu:
   "మీరు వివాహ వేడుకకు వస్తున్నారా?"
   After their next reply, silently invoke recordMarriageRsvp and speak ONLY:
   "సరే అండి, ధన్యవాదాలు."

TERMINATION RULE:
Speak ONLY "సరే అండి, ధన్యవాదాలు." once, and then STOP SPEAKING COMPLETELY.
Do not speak any waiting phrase such as "ఒక్క క్షణం ఆగండి.".
Do not speak any additional sentence or follow-up question.
Do not read the invitation transcript again.
Do not repeat "సరే అండి, ధన్యవాదాలు." a second time.
Do not generate any further conversational response.
The active call will end automatically once audio playback completes.
Speak ONLY in authentic Telugu script (తెలుగు).`;
    }
    return '';
  }

  /**
   * Process next contact in sequential FIFO order for THIS customer's campaign.
   * - Strictly at most 1 active outbound call per customer across ALL their campaigns.
   * - Independent across customers: different customers run simultaneously when shared provider capacity allows.
   */
  public processNext(campaignId: string): void {
    if (this.isShuttingDown) return;

    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign || campaign.status !== 'running') {
      this.waitingForCapacityCampaigns.delete(campaignId);
      return;
    }

    const tenantId = campaign.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined;
    if (!tenantId) {
      console.warn(`[QUEUE_PROCESS_BLOCKED_UNOWNED_CAMPAIGN] Campaign ${campaignId} has no verified tenant owner.`);
      this.waitingForCapacityCampaigns.delete(campaignId);
      return;
    }
    let runner = this.activeRunners.get(campaignId);
    if (!runner) {
      runner = {
        campaignId,
        tenantId,
        isPaused: false,
        isStopped: false,
        timer: null,
      };
      this.activeRunners.set(campaignId, runner);
    }
    if (runner.isPaused || runner.isStopped) return;

    if (this.campaignDispatchingLocks.has(campaignId)) {
      console.log(`[QUEUE_DISPATCH_LOCKED] Campaign ${campaignId} dispatch is currently locked. Skipping duplicate trigger.`);
      return;
    }

    const event = campaign.eventId ? callbridgeStorage.getEvent(campaign.eventId, tenantId) : null;
    const isMarriage = event?.type === 'marriage_event' || (campaign as any)?.moduleType === 'marriage_event';

    const jobs = callbridgeStorage.getCallJobs(campaignId);

    // 1. Check active jobs in this campaign
    const activeJobs = jobs.filter((j) => ACTIVE_JOB_STATUSES.has(j.status));
    if (activeJobs.length > 0) {
      console.log(`[QUEUE_SEQUENTIAL_WAIT] Campaign ${campaignId} (tenant=${tenantId}) has active call ${activeJobs[0].id} (${activeJobs[0].status}). Waiting for confirmed terminal state.`);
      this.monitorJobUntilTerminal(activeJobs[0].id, campaignId);
      return;
    }

    // 2. Per-customer active-call lock across ALL campaigns belonging to this customer
    const tenantActiveLease = providerCapacityController.getTenantActiveLease(tenantId);
    const tenantActiveJobsOnDisk = callbridgeStorage.getActiveJobsByClient(tenantId);
    if (tenantActiveLease || tenantActiveJobsOnDisk.length > 0) {
      const blockingJobId = tenantActiveLease?.jobId || tenantActiveJobsOnDisk[0]?.id;
      const blockingCampaignId = tenantActiveLease?.campaignId || tenantActiveJobsOnDisk[0]?.campaignId;
      console.log(`[TENANT_SEQUENTIAL_LOCK_HELD] Tenant ${tenantId} already has active call ${blockingJobId} (campaign=${blockingCampaignId}). Holding campaign ${campaignId} until terminal state.`);
      this.waitingForCapacityCampaigns.add(campaignId);
      if (blockingJobId && blockingCampaignId) {
        this.monitorJobUntilTerminal(blockingJobId, blockingCampaignId);
      }
      return;
    }

    // Marriage Event persisted active call lock safeguard
    if (isMarriage && ((campaign.activeCalls ?? 0) > 0 || Boolean(campaign.activeCallId) || Boolean(campaign.activeCallProviderId))) {
      console.log(`[MARRIAGE_SEQUENTIAL_LOCK_HELD] Campaign ${campaignId} still holds active call lock (${campaign.activeCallId || campaign.activeCallProviderId}). Waiting for terminal state.`);
      if (campaign.activeCallId) {
        this.monitorJobUntilTerminal(campaign.activeCallId, campaignId);
      }
      return;
    }

    // 3. Preserve exact FIFO import/queue order within this customer's queue
    const pendingJobs = jobs
      .filter((j) => j.status === 'pending')
      .sort((a, b) => {
        const orderA = typeof a.metadata?.queueOrder === 'number' ? a.metadata.queueOrder : null;
        const orderB = typeof b.metadata?.queueOrder === 'number' ? b.metadata.queueOrder : null;
        if (orderA !== null && orderB !== null) return orderA - orderB;
        return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      });

    if (pendingJobs.length === 0 && activeJobs.length === 0) {
      campaign.status = 'completed';
      campaign.activeCalls = 0;
      campaign.activeCallId = null;
      campaign.activeCallProviderId = null;
      campaign.activeCallStatus = null;
      campaign.pendingCount = 0;
      campaign.processedCount = Math.max(
        campaign.processedCount || 0,
        jobs.filter((j) => TERMINAL_JOB_STATUSES.has(j.status)).length
      );
      campaign.completedCount = Math.max(
        campaign.completedCount || 0,
        jobs.filter((j) => j.status === 'completed').length
      );
      campaign.failedCount = Math.max(
        campaign.failedCount || 0,
        jobs.filter((j) => ['failed', 'no_answer', 'busy'].includes(j.status)).length
      );
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
      callbridgeStorage.cleanupCompletedMarriageBatch(campaignId);
      this.activeRunners.delete(campaignId);
      this.waitingForCapacityCampaigns.delete(campaignId);
      console.log(`[QUEUE_CAMPAIGN_COMPLETED] Campaign ${campaignId} (tenant=${tenantId}) finished all contacts.`);
      return;
    }

    // 4. Acquire BOTH per-tenant active-call lock AND shared provider concurrency slot atomically
    const nextJob = pendingJobs[0];
    if (!nextJob) return;

    const acquireResult = providerCapacityController.tryAcquire(tenantId, nextJob.id, campaign.id);
    if (!acquireResult.acquired) {
      this.waitingForCapacityCampaigns.add(campaignId);
      console.log(`[QUEUE_WAITING_CAPACITY] Campaign ${campaignId} (tenant=${tenantId}) kept job ${nextJob.id} pending (${acquireResult.reason}, active=${acquireResult.activeCount}/${acquireResult.maxConcurrentCalls}).`);
      return;
    }

    this.waitingForCapacityCampaigns.delete(campaignId);
    this.campaignDispatchingLocks.add(campaignId);
    this.dispatchJob(nextJob, campaign)
      .catch((err) => {
        console.error(`[QUEUE_DISPATCH_ERROR] Campaign ${campaignId}:`, err);
      })
      .finally(() => {
        this.campaignDispatchingLocks.delete(campaignId);
      });
  }

  /**
   * Dispatches a single call via real Vapi + Twilio telephony
   */
  private async dispatchJob(job: CallJobRecord, campaign: CampaignRecord): Promise<void> {
    const now = new Date().toISOString();
    const clientId =
      (job.clientId && job.clientId !== 'user_default' ? job.clientId : undefined) ||
      (campaign.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined);

    if (!clientId) {
      console.error(`[CALL_BLOCKED_MISSING_TENANT] Aborting job ${job.id} in campaign ${campaign.id}: missing verified tenant ownership.`);
      job.status = 'failed';
      job.failureReason = 'Missing verified customer tenant ownership; call aborted.';
      job.endedAt = now;
      job.durationSeconds = 0;
      job.updatedAt = now;
      callbridgeStorage.saveCallJob(job);
      this.onJobTerminal(campaign.id, job.id, { isFailed: true, status: 'failed' });
      return;
    }

    // 0. Verify SaaS Subscription & Call Credit Allowance
    const eligibility = callbridgeStorage.checkCallEligibility(clientId);
    if (!eligibility.allowed) {
      console.warn(`[CALL_BLOCKED_CREDITS_EXHAUSTED] Campaign ${campaign.id}: ${eligibility.reason}`);
      this.stopCampaign(campaign.id);
      job.status = 'failed';
      job.failureReason = eligibility.reason || 'Call duration credits exhausted. Please upgrade your plan.';
      job.endedAt = now;
      job.durationSeconds = 0;
      job.updatedAt = now;
      callbridgeStorage.saveCallJob(job);
      this.onJobTerminal(campaign.id, job.id);
      return;
    }

    // 1. Accurate State: 'initiating' (backend is requesting the call)
    job.status = 'initiating';
    job.startedAt = now;
    job.updatedAt = now;
    callbridgeStorage.saveCallJob(job);

    campaign.activeCalls = 1;
    campaign.activeCallId = job.id;
    campaign.activeCallStatus = 'calling';
    campaign.callsInitiated = (campaign.callsInitiated || 0) + 1;
    campaign.pendingCount = callbridgeStorage.getCallJobs(campaign.id).filter((j) => j.status === 'pending').length;
    campaign.updatedAt = now;
    callbridgeStorage.saveCampaign(campaign);
    callbridgeStorage.recordCallInitiated(campaign.eventId, job.id, campaign.id);

    const event = callbridgeStorage.getEvent(campaign.eventId, clientId);
    const eventType = event?.type || 'public_survey';

    // 2. Resolve approved ElevenLabs voice for this customer & module (strictly tenant-isolated)
    let rawVoiceId: string | undefined = undefined;
    if (event?.selectedVoiceProfileId) {
      const selectedProfile = callbridgeStorage.getVoiceProfile(event.selectedVoiceProfileId);
      // Use event-level selection immediately only if it is a shared/additional voice or owned by THIS customer
      if (selectedProfile && (!selectedProfile.clientId || selectedProfile.clientId === clientId)) {
        rawVoiceId = selectedProfile.providerVoiceId || selectedProfile.elevenLabsVoiceId;
      } else if (!selectedProfile && event.voiceSelectionType === 'additional') {
        rawVoiceId = event.selectedVoiceProfileId;
      }
    }
    if (!rawVoiceId) {
      const approved = callbridgeStorage.getApprovedVoiceProfile(clientId, eventType, event?.id);
      rawVoiceId = approved?.providerVoiceId || approved?.elevenLabsVoiceId;
    }
    if (!rawVoiceId && event?.selectedVoiceProfileId) {
      // Preserve existing default/Rishi voice fallback if customer has not cloned their own voice
      rawVoiceId = event.selectedVoiceProfileId;
    }
    const voiceId = ElevenLabsService.resolveVoiceId(rawVoiceId, { eventId: event?.id, eventType });

    // 3. Module-isolated script & system prompt separation with clean speech rendering
    let rawScript = '';
    let systemPrompt = '';

    if (eventType === 'public_survey') {
      const questions = callbridgeStorage.getSurveyQuestions(event?.id || 'event_public_survey', clientId);
      const enabledQuestions = questions.filter((q) => q.enabled !== false);
      const questionList = enabledQuestions
        .map((q, idx) => `${idx + 1}. ${q.text || q.questionText}`)
        .join('\n');

      rawScript = event?.config?.surveyIntro || 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.';
      // For public_survey, vapiService builds the authoritative, comprehensive conversational prompt with exact acknowledgements and closing.
      systemPrompt = '';
    } else if (eventType === 'marriage_event') {
      rawScript =
        event?.config?.generatedScript ||
        event?.config?.approvedScript ||
        'నమస్కారం అండి! మా వివాహ ఆహ్వానాన్ని మన్నించి మీ కుటుంబ సమేతంగా విచ్చేయగలరు.';
      systemPrompt = this.getAssistantSystemPrompt('marriage_event', event?.language || 'te', event);
    } else if (eventType === 'political_campaign') {
      rawScript = event?.config?.approvedScript || 'నమస్కారం! అభ్యర్థి తరఫున మాట్లాడుతున్నాము.';
      const dtmfOpts = event?.config?.dtmfOptions || [];
      const dtmfText = dtmfOpts.length > 0
        ? `The respondent may press keypad 1 to support or keypad 2 to request callback. The backend telephony system automatically records the DTMF key and terminates the call immediately upon receiving key 1 or 2.`
        : '';
      systemPrompt = `You are delivering the exact user-authored campaign speech:
"${rawScript}"
${dtmfText}
Never invent statements or promises not in the script. Conclude politely.`;
    } else {
      rawScript = event?.config?.renderedScript || event?.config?.approvedScript || 'నమస్కారం!';
      systemPrompt = `Deliver this message politely and clearly: "${rawScript}".`;
    }

    // Replace placeholders with real values and sanitize so raw {{}} brackets are never sent to Vapi
    const placeholderValues = event?.config?.placeholderValues || {};
    let renderedScript = rawScript;
    for (const [k, v] of Object.entries(placeholderValues)) {
      if (v && String(v).trim()) {
        renderedScript = renderedScript.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v).trim());
      }
    }
    const script = sanitizeScriptForSpeech(renderedScript).trim() ||
      (eventType === 'public_survey' ? 'నమస్కారం అండి! ప్రజా సర్వే కోసం మాట్లాడుతున్నాం.' : 'నమస్కారం!');

    try {
      console.log('[QUEUE_DISPATCHING_CALL]', {
        jobId: job.id,
        contactName: job.contactName,
        phone: job.contactPhone,
        voiceId,
        eventType,
        maxDurationSeconds: eligibility.maxPermittedSeconds,
      });

      // Execute actual outbound call via Vapi API
      const result = await VapiService.createOutboundCall({
        callId: job.id,
        jobId: job.id,
        phoneNumber: job.contactPhone,
        contactName: job.contactName,
        voiceId,
        voiceName: event?.name,
        moduleType: eventType,
        script,
        systemPrompt,
        language: event?.language || 'te',
        dtmfOptions: event?.config?.dtmfOptions || [],
        campaignId: campaign.id,
        eventId: campaign.eventId,
        contactId: job.contactId,
        clientId,
        userId: clientId,
        appBaseUrl: VapiService.getAppBaseUrl() || undefined,
        maxDurationSeconds: eligibility.maxPermittedSeconds,
      });

      // Provider accepted: Update state to 'calling' with real provider call ID & Twilio Call SID
      const providerCallId = result.providerCallId || result.callId;
      const acceptedJob = callbridgeStorage.getCallJob(job.id);
      if (acceptedJob) {
        acceptedJob.status = 'calling';
        acceptedJob.providerCallId = providerCallId;
        acceptedJob.twilioCallSid = (result as any).twilioCallSid;
        acceptedJob.updatedAt = new Date().toISOString();
        callbridgeStorage.saveCallJob(acceptedJob);
      }

      campaign.activeCallProviderId = providerCallId || null;
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);

      if (providerCallId) {
        providerCapacityController.attachProviderCallId(job.id, providerCallId);
        VapiService.mapProviderCallIdToJob(
          providerCallId,
          job.id,
          campaign.id,
          campaign.eventId,
          job.contactPhone,
          clientId,
          job.contactId
        );
        callbridgeStorage.mapProviderCallIdToJob(
          providerCallId,
          job.id,
          campaign.id,
          campaign.eventId,
          clientId,
          job.contactId,
          'calling'
        );
      }

      console.log('[QUEUE_CALL_ACCEPTED_BY_PROVIDER]', {
        tenantId: clientId,
        jobId: job.id,
        providerCallId,
        phone: job.contactPhone,
      });

      // Monitor call until confirmed terminal state (completed / failed / no_answer / busy / cancelled)
      this.monitorJobUntilTerminal(job.id, campaign.id);
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      const isRateLimit = Boolean(
        err?.isRateLimit ||
        err?.statusCode === 429 ||
        /rate.?limit|too many requests|concurrent|concurrency|max.?calls/i.test(errMsg)
      );

      if (isRateLimit) {
        // Provider capacity / HTTP 429 throttling: keep job PENDING (do NOT fail it!), back off, and retry automatically
        console.warn('[QUEUE_CALL_RATE_LIMITED_REQUEUE]', {
          tenantId: clientId,
          jobId: job.id,
          campaignId: campaign.id,
          error: errMsg,
        });
        const requeuedJob = callbridgeStorage.getCallJob(job.id);
        const ts = new Date().toISOString();
        if (requeuedJob && !TERMINAL_JOB_STATUSES.has(requeuedJob.status)) {
          requeuedJob.status = 'pending';
          requeuedJob.startedAt = undefined;
          requeuedJob.updatedAt = ts;
          callbridgeStorage.saveCallJob(requeuedJob);
        }
        campaign.activeCalls = 0;
        campaign.activeCallId = null;
        campaign.activeCallProviderId = null;
        campaign.activeCallStatus = null;
        campaign.callsInitiated = Math.max(0, (campaign.callsInitiated || 1) - 1);
        campaign.pendingCount = callbridgeStorage.getCallJobs(campaign.id).filter((j) => j.status === 'pending').length;
        campaign.updatedAt = ts;
        callbridgeStorage.saveCampaign(campaign);
        this.waitingForCapacityCampaigns.add(campaign.id);
        providerCapacityController.recordProviderRateLimit(job.id, err?.retryAfterMs);
        return;
      }

      console.error('[QUEUE_CALL_REJECTED_BY_PROVIDER]', {
        tenantId: clientId,
        jobId: job.id,
        phone: job.contactPhone,
        error: errMsg,
      });

      const failedJob = callbridgeStorage.getCallJob(job.id);
      const finishTime = new Date().toISOString();
      if (failedJob) {
        failedJob.status = 'failed';
        failedJob.failureReason = errMsg || 'Telephony provider rejected call request';
        failedJob.endedAt = finishTime;
        failedJob.durationSeconds = 0;
        failedJob.updatedAt = finishTime;
        callbridgeStorage.saveCallJob(failedJob);
      }

      // Advance THIS customer's sequential queue cleanly after confirmed pre-placement failure
      this.onJobTerminal(campaign.id, job.id, { isFailed: true, status: 'failed' });
    }
  }

  /**
   * Actively polls Vapi Call Status until a CONFIRMED terminal state is reached.
   * CRITICAL SAFETY RULE:
   * - Never treat a network timeout or polling timeout as proof that a call ended.
   * - Keep the customer active-call lock and provider slot held while status is uncertain,
   *   slowing from 3s polling to 15s reconciliation polling after 5 minutes until Vapi confirms terminal state.
   */
  private monitorJobUntilTerminal(
    jobId: string,
    campaignId: string,
    options?: { allowCancelledCampaign?: boolean }
  ): void {
    if (this.isShuttingDown) return;
    if (this.monitoredJobs.has(jobId) || this.terminalHandledJobs.has(jobId) || callbridgeStorage.isJobTerminalHandled(jobId)) {
      return;
    }
    this.monitoredJobs.add(jobId);

    const initialJob = callbridgeStorage.getCallJob(jobId);
    const initialCampaign = callbridgeStorage.getCampaign(campaignId);
    let lastKnownProviderCallId: string | undefined =
      initialJob?.providerCallId ||
      initialCampaign?.activeCallProviderId ||
      VapiService.getProviderCallIdByJobId(jobId) ||
      callbridgeStorage.getProviderCallIdByJobId(jobId);

    let pollCount = 0;

    const scheduleNextPoll = () => {
      if (this.isShuttingDown || !this.monitoredJobs.has(jobId)) return;
      const delayMs = pollCount < 100 ? 3000 : 15000;
      const timer = setTimeout(runPoll, delayMs);
      if (typeof timer.unref === 'function') timer.unref();
      this.monitorTimers.set(jobId, timer);
    };

    const stopMonitoring = () => {
      const existingTimer = this.monitorTimers.get(jobId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.monitorTimers.delete(jobId);
      }
      this.monitoredJobs.delete(jobId);
    };

    const runPoll = async () => {
      this.monitorTimers.delete(jobId);
      pollCount++;

      if (this.isShuttingDown || this.terminalHandledJobs.has(jobId) || callbridgeStorage.isJobTerminalHandled(jobId)) {
        stopMonitoring();
        return;
      }

      const camp = callbridgeStorage.getCampaign(campaignId);
      const currentRunner = this.activeRunners.get(campaignId);
      const hasLease = Boolean(providerCapacityController.getLeaseByJobId(jobId));
      // Keep monitoring even if campaign was paused/cancelled as long as the provider lease is still held
      if (!hasLease && !options?.allowCancelledCampaign && (!currentRunner || currentRunner.isStopped) && camp?.status !== 'running') {
        stopMonitoring();
        return;
      }

      const job = callbridgeStorage.getCallJob(jobId);
      if (job?.providerCallId) {
        lastKnownProviderCallId = job.providerCallId;
      }

      // If already marked terminal (e.g. via webhook), finalize and release cleanly
      if (job && TERMINAL_JOB_STATUSES.has(job.status)) {
        stopMonitoring();
        this.onJobTerminal(campaignId, jobId, {
          isAnswered: job.status === 'completed' || job.status === 'interrupted' || job.status === 'callback_scheduled',
          isNoAnswer: job.status === 'no_answer',
          isFailed: job.status === 'failed' || job.status === 'busy',
          status: job.status,
        });
        return;
      }

      const targetId = job?.providerCallId || lastKnownProviderCallId || VapiService.getProviderCallIdByJobId(jobId);
      if (targetId) {
        try {
          const statusRes = await VapiService.getCallStatus(targetId);
          if (statusRes) {
            const status = String(statusRes.status || '').toLowerCase();
            const isGenuineTerminal =
              (status !== 'error' || statusRes.httpStatus === 404) &&
              (statusRes.isTerminal || TERMINAL_JOB_STATUSES.has(status) || status === 'ended');

            if (isGenuineTerminal) {
              stopMonitoring();
              const isAns = status === 'completed' || status === 'interrupted' || status === 'callback_scheduled' || Boolean(statusRes.dtmfDigit);
              const normalizedFinal =
                job?.metadata?.cancelRequestedAt && (status === 'ended' || status === 'cancelled' || status === 'completed')
                  ? 'cancelled'
                  : status === 'error'
                  ? 'failed'
                  : status === 'ended'
                  ? 'completed'
                  : status;
              this.onJobTerminal(campaignId, jobId, {
                isAnswered: normalizedFinal !== 'cancelled' && isAns,
                isNoAnswer: normalizedFinal === 'no_answer',
                isFailed: normalizedFinal === 'failed' || normalizedFinal === 'busy',
                status: normalizedFinal,
              });
              return;
            }
          }
        } catch (pollErr: any) {
          // Network timeout or transient provider error: NEVER assume call ended! Keep lock held and retry.
          console.warn(`[POLL_STATUS_UNCERTAIN_HOLD_LOCK] ${jobId}:`, pollErr?.message || pollErr);
        }
      }

      if (pollCount === 100) {
        console.warn(`[POLL_LONG_RUNNING_CALL] Call ${jobId} still unconfirmed after 5 minutes; keeping lock held and switching to 15s reconciliation polling.`);
      }

      scheduleNextPoll();
    };

    scheduleNextPoll();
  }

  /**
   * Reconciles an active or running campaign against provider call state.
   * Ensures activeCalls = 0 and status = 'completed' when finished, preventing stale values.
   */
  public async reconcileCampaign(campaignId: string): Promise<CampaignRecord | null> {
    if (this.campaignDispatchingLocks.has(campaignId)) {
      return callbridgeStorage.getCampaign(campaignId) || null;
    }

    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign) return null;

    const hasActiveFlag = (campaign.activeCalls ?? 0) > 0 || Boolean(campaign.activeCallId);
    const isRunning = campaign.status === 'running';

    if (!hasActiveFlag && !isRunning) {
      return campaign;
    }

    let targetJobId = campaign.activeCallId;
    if (!targetJobId) {
      const activeJobs = callbridgeStorage.getCallJobs(campaignId).filter((j) =>
        ['initiating', 'calling', 'ringing', 'in_progress'].includes(j.status)
      );
      if (activeJobs.length > 0) {
        targetJobId = activeJobs[0].id;
      }
    }

    if (targetJobId) {
      const job = callbridgeStorage.getCallJob(targetJobId);
      const providerCallId =
        job?.providerCallId ||
        campaign.activeCallProviderId ||
        VapiService.getProviderCallIdByJobId(targetJobId) ||
        targetJobId;
      try {
        const statusRes = await VapiService.getCallStatus(providerCallId);
        if (
          statusRes &&
          (statusRes.status !== 'error' || statusRes.httpStatus === 404) &&
          (statusRes.isTerminal ||
            ['completed', 'failed', 'cancelled', 'no_answer', 'busy', 'ended'].includes(statusRes.status || ''))
        ) {
          const isAns = statusRes.status === 'completed' || Boolean(statusRes.dtmfDigit);
          this.onJobTerminal(campaignId, targetJobId, {
            isAnswered: isAns,
            isNoAnswer: statusRes.status === 'no_answer',
            isFailed: statusRes.status === 'failed' || statusRes.status === 'busy' || statusRes.status === 'error',
            status: statusRes.status === 'error' ? 'failed' : statusRes.status,
          });
        }
      } catch (e: any) {
        console.warn(`[RECONCILE_STATUS_WARN] ${targetJobId}:`, e.message);
      }
    } else {
      const allJobs = callbridgeStorage.getCallJobs(campaignId);
      const activeJobs = allJobs.filter((j) =>
        ['initiating', 'calling', 'ringing', 'in_progress'].includes(j.status)
      );
      const remainingPending = allJobs.filter((j) => j.status === 'pending').length;
      campaign.pendingCount = remainingPending;
      if (remainingPending === 0 && activeJobs.length === 0) {
        campaign.activeCalls = 0;
        campaign.activeCallId = null;
        campaign.activeCallProviderId = null;
        campaign.activeCallStatus = null;
        if (campaign.status === 'running') {
          campaign.status = 'completed';
        }
        campaign.updatedAt = new Date().toISOString();
        callbridgeStorage.saveCampaign(campaign);
        if (campaign.status === 'completed') {
          callbridgeStorage.cleanupCompletedMarriageBatch(campaignId);
        }
      }
    }

    return callbridgeStorage.getCampaign(campaignId) || null;
  }

  /**
   * Called when a call reaches terminal state. Updates campaign metrics and advances queue.
   */
  public onJobTerminal(
    campaignId: string,
    jobId?: string,
    outcome?: { isAnswered?: boolean; isNoAnswer?: boolean; isFailed?: boolean; status?: string }
  ): void {
    if (jobId) {
      const existingTimer = this.monitorTimers.get(jobId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.monitorTimers.delete(jobId);
      }
      this.monitoredJobs.delete(jobId);

      // Persistent + in-memory idempotency: duplicate webhooks or restarts never re-advance or double-release
      if (this.terminalHandledJobs.has(jobId) || callbridgeStorage.isJobTerminalHandled(jobId)) {
        providerCapacityController.releaseOnConfirmedTerminal(jobId);
        return;
      }
      this.terminalHandledJobs.add(jobId);
      callbridgeStorage.markJobTerminalHandled(jobId);

      const termJob = callbridgeStorage.getCallJob(jobId);
      if (termJob && (termJob.status === 'pending' || ACTIVE_JOB_STATUSES.has(termJob.status))) {
        const resolvedStatus = outcome?.status === 'cancelled'
          ? 'cancelled'
          : outcome?.isFailed
          ? 'failed'
          : outcome?.isNoAnswer
          ? 'no_answer'
          : outcome?.status === 'busy'
          ? 'busy'
          : outcome?.status === 'failed'
          ? 'failed'
          : outcome?.status === 'no_answer'
          ? 'no_answer'
          : 'completed';
        const endedIso = new Date().toISOString();
        termJob.status = resolvedStatus;
        termJob.endedAt = termJob.endedAt || endedIso;
        termJob.updatedAt = endedIso;
        callbridgeStorage.saveCallJob(termJob);
        if (termJob.providerCallId) {
          callbridgeStorage.updateProviderCallMappingStatus(termJob.providerCallId, resolvedStatus);
        }
      }

      // Release ONLY this call's per-tenant active lock & shared provider capacity slot
      // (releasing capacity automatically wakes any other eligible customer waiting for a slot!)
      providerCapacityController.releaseOnConfirmedTerminal(jobId);
    }

    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign) return;

    const prevFinishedCount = campaign.processedCount || 0;
    const prevActiveCount = campaign.activeCalls ?? 0;

    campaign.activeCalls = 0;
    campaign.activeCallId = null;
    campaign.activeCallProviderId = null;
    campaign.activeCallStatus = null;

    const campAgg = callbridgeStorage.getAggregateAnalytics(campaignId);
    const currentJob = jobId ? callbridgeStorage.getCallJob(jobId) : undefined;

    const currentJobIsAnswered = Boolean(
      outcome?.isAnswered ||
      outcome?.status === 'completed' ||
      outcome?.status === 'interrupted' ||
      outcome?.status === 'callback_scheduled' ||
      (currentJob &&
        (currentJob.status === 'completed' ||
          currentJob.status === 'interrupted' ||
          currentJob.status === 'callback_scheduled' ||
          Boolean(currentJob.dtmfDigitReceived)))
    );
    const currentJobIsNoAnswer = Boolean(
      !currentJobIsAnswered &&
      (outcome?.isNoAnswer || outcome?.status === 'no_answer' || currentJob?.status === 'no_answer')
    );
    const currentJobIsFailed = Boolean(
      !currentJobIsAnswered &&
      !currentJobIsNoAnswer &&
      (outcome?.isFailed ||
        outcome?.status === 'failed' ||
        outcome?.status === 'busy' ||
        currentJob?.status === 'failed' ||
        currentJob?.status === 'busy')
    );

    const allCampaignJobs = callbridgeStorage.getCallJobs(campaignId);
    const actualFailedJobs = allCampaignJobs.filter((j) => ['failed', 'busy'].includes(j.status)).length;
    const actualCompletedJobs = allCampaignJobs.filter((j) => j.status === 'completed').length;
    const actualUnansweredJobs = allCampaignJobs.filter((j) => j.status === 'no_answer').length;
    const actualAnsweredJobs = allCampaignJobs.filter(
      (j) =>
        j.status === 'completed' ||
        j.status === 'interrupted' ||
        j.status === 'callback_scheduled' ||
        Boolean(j.dtmfDigitReceived)
    ).length;

    const campDtmfAnswered =
      (campAgg.politicalCampaign?.keypad1Count || 0) + (campAgg.politicalCampaign?.keypad2Count || 0);

    const resolvedAnswered = Math.max(
      actualAnsweredJobs,
      campAgg.answeredCalls || 0,
      campDtmfAnswered,
      currentJobIsAnswered ? 1 : 0
    );
    const resolvedUnanswered = Math.max(
      actualUnansweredJobs,
      campAgg.unansweredCalls || 0,
      currentJobIsNoAnswer ? 1 : 0
    );
    const resolvedFailed = Math.max(
      actualFailedJobs,
      campAgg.failedCalls || 0,
      currentJobIsFailed ? 1 : 0
    );
    const event = campaign.eventId ? callbridgeStorage.getEvent(campaign.eventId, campaign.clientId) : null;
    const isPublicSurvey = event?.type === 'public_survey';

    const resolvedCompleted = isPublicSurvey
      ? Math.max(
          actualCompletedJobs,
          campAgg.completedCalls || 0,
          outcome?.status === 'completed' || currentJob?.status === 'completed' ? 1 : 0
        )
      : Math.max(
          actualCompletedJobs,
          campAgg.completedCalls || 0,
          resolvedAnswered
        );

    campaign.answeredCount = resolvedAnswered;
    campaign.unansweredCount = resolvedUnanswered;
    campaign.failedCount = resolvedFailed;
    campaign.completedCount = resolvedCompleted;
    const totalFinished = resolvedCompleted + resolvedUnanswered + resolvedFailed;
    campaign.processedCount = campaign.totalContacts
      ? Math.min(campaign.totalContacts, totalFinished)
      : totalFinished;

    const allJobs = callbridgeStorage.getCallJobs(campaignId);
    const remainingPending = allJobs.filter((j) => j.status === 'pending').length;
    const remainingActive = allJobs.filter((j) =>
      ['initiating', 'calling', 'ringing', 'in_progress'].includes(j.status)
    ).length;
    campaign.pendingCount = remainingPending;

    if (remainingPending === 0 && remainingActive === 0) {
      if (campaign.status === 'running' || campaign.status === 'draft') {
        campaign.status = 'completed';
      }
    }

    campaign.updatedAt = new Date().toISOString();
    callbridgeStorage.saveCampaign(campaign);

    console.log('[VAPI_PERSISTENCE_UPDATE]', {
      campaignId: campaign.id,
      finishedBefore: prevFinishedCount,
      finishedAfter: campaign.processedCount,
      activeBefore: prevActiveCount,
      activeAfter: campaign.activeCalls,
      answeredAfter: campaign.answeredCount,
      keypad1After: campAgg.politicalCampaign?.keypad1Count ?? campaign.keypad1Count ?? 0,
      keypad2After: campAgg.politicalCampaign?.keypad2Count ?? campaign.keypad2Count ?? 0,
    });

    const remainingJobs = callbridgeStorage.getCallJobs(campaignId);
    const hasRemainingPending = remainingJobs.some((j) => j.status === 'pending');
    const hasRemainingActive = remainingJobs.some((j) =>
      ['initiating', 'calling', 'ringing', 'in_progress'].includes(j.status)
    );

    if (!hasRemainingPending && !hasRemainingActive) {
      if (campaign.status === 'running') {
        campaign.status = 'completed';
        campaign.updatedAt = new Date().toISOString();
        callbridgeStorage.saveCampaign(campaign);
      }
      if (campaign.status === 'completed') {
        callbridgeStorage.cleanupCompletedMarriageBatch(campaignId);
      }
      const existingRunner = this.activeRunners.get(campaignId);
      if (existingRunner?.timer) {
        clearTimeout(existingRunner.timer);
        existingRunner.timer = null;
      }
      this.activeRunners.delete(campaignId);
      console.log(`[QUEUE_CAMPAIGN_ALL_PROCESSED] Campaign ${campaignId} completed. All queued calls reached terminal state.`);
      return;
    }

    const tenantId = campaign.clientId && campaign.clientId !== 'user_default' ? campaign.clientId : undefined;
    if (!tenantId) {
      this.scheduleEligibleQueues();
      return;
    }
    let runner = this.activeRunners.get(campaignId);
    if (!runner && campaign.status === 'running') {
      runner = { campaignId, tenantId, isPaused: false, isStopped: false, timer: null };
      this.activeRunners.set(campaignId, runner);
    }

    if (!runner || runner.isPaused || runner.isStopped || campaign.status !== 'running') {
      // Even if this campaign paused/stopped/cancelled, wake any other waiting campaign (including another campaign of this tenant or other tenants)
      this.scheduleEligibleQueues();
      return;
    }

    // Advance ONLY this customer's queue to next pending FIFO contact cleanly via trackable timer
    if (runner.timer) {
      clearTimeout(runner.timer);
      runner.timer = null;
    }
    runner.timer = setTimeout(() => {
      if (runner) runner.timer = null;
      this.processNext(campaignId);
    }, 300);
    if (typeof runner.timer.unref === 'function') {
      runner.timer.unref();
    }
  }

  /**
   * Returns a tenant-scoped queue status summary (strictly isolated to tenantId).
   */
  public getTenantQueueStatus(tenantId: string, eventId?: string) {
    const campaigns = eventId
      ? callbridgeStorage.getCampaigns(eventId, tenantId)
      : callbridgeStorage.getAllCampaigns(tenantId);
    const activeLease = providerCapacityController.getTenantActiveLease(tenantId);
    const capacity = providerCapacityController.getSnapshot();

    const summaries = campaigns.map((camp) => {
      const jobs = callbridgeStorage.getCallJobs(camp.id);
      const pendingCount = jobs.filter((j) => j.status === 'pending').length;
      const completedCount = jobs.filter((j) => j.status === 'completed').length;
      const failedCount = jobs.filter((j) => ['failed', 'no_answer', 'busy'].includes(j.status)).length;
      const activeJob = jobs.find((j) => ACTIVE_JOB_STATUSES.has(j.status));
      return {
        campaignId: camp.id,
        eventId: camp.eventId,
        name: camp.name,
        status: camp.status,
        waitingForProviderCapacity: this.waitingForCapacityCampaigns.has(camp.id),
        totalContacts: Math.max(camp.totalContacts || 0, jobs.length),
        pendingCount,
        completedCount: Math.max(camp.completedCount || 0, completedCount),
        failedCount: Math.max(camp.failedCount || 0, failedCount),
        activeContact: activeJob
          ? {
              jobId: activeJob.id,
              contactId: activeJob.contactId,
              contactName: activeJob.contactName,
              status: activeJob.status,
              providerCallId: activeJob.providerCallId || null,
            }
          : null,
        updatedAt: camp.updatedAt,
      };
    });

    return {
      tenantId,
      hasActiveCall: Boolean(activeLease),
      activeCall: activeLease
        ? {
            campaignId: activeLease.campaignId,
            jobId: activeLease.jobId,
            providerCallId: activeLease.providerCallId || null,
            state: activeLease.state,
          }
        : null,
      queues: summaries,
      providerCapacity: {
        maxConcurrentCalls: capacity.maxConcurrentCalls,
        activeSlots: capacity.activeSlots,
        availableSlots: capacity.availableSlots,
        usingSafeDefault: capacity.usingSafeDefault,
        backoffRemainingMs: capacity.backoffRemainingMs,
      },
    };
  }

  /**
   * Handle Webhook updates from external telephony provider (Twilio, Vapi, etc.)
   */
  public handleTelephonyWebhook(payload: {
    callId: string;
    status: string;
    duration?: number;
    digits?: string;
    failureReason?: string;
  }): { success: boolean; job?: CallJobRecord } {
    if (!payload?.callId) {
      return { success: false };
    }

    // Strictly resolve via persisted providerCallId / jobId lookup (never cross-tenant guessing)
    const targetJob =
      callbridgeStorage.getCallJobByProviderId(payload.callId) ||
      callbridgeStorage.getCallJob(payload.callId);

    if (!targetJob) {
      return { success: false };
    }

    // Out-of-order & duplicate protection: never overwrite a confirmed terminal status
    if (TERMINAL_JOB_STATUSES.has(targetJob.status) || callbridgeStorage.isJobTerminalHandled(targetJob.id)) {
      return { success: true, job: targetJob };
    }

    const now = new Date().toISOString();
    let isTerminal = false;
    const normalizedIncoming = String(payload.status || '').toLowerCase();

    if (normalizedIncoming === 'completed' || normalizedIncoming === 'ended') {
      targetJob.status = 'completed';
      targetJob.durationSeconds = payload.duration || targetJob.durationSeconds || 18;
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (normalizedIncoming === 'busy') {
      targetJob.status = 'busy';
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (normalizedIncoming === 'no_answer' || normalizedIncoming === 'no-answer') {
      targetJob.status = 'no_answer';
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (normalizedIncoming === 'cancelled' || normalizedIncoming === 'canceled') {
      targetJob.status = 'cancelled';
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (normalizedIncoming === 'ringing') {
      if (targetJob.status !== 'in_progress') {
        targetJob.status = 'ringing';
      }
    } else if (normalizedIncoming === 'in_progress' || normalizedIncoming === 'in-progress') {
      targetJob.status = 'in_progress';
    } else if (normalizedIncoming === 'failed') {
      targetJob.status = 'failed';
      targetJob.failureReason = payload.failureReason || 'Provider reported call failure';
      targetJob.endedAt = now;
      isTerminal = true;
    }

    if (payload.digits) {
      targetJob.dtmfDigitReceived = payload.digits;
    }

    targetJob.updatedAt = now;
    callbridgeStorage.saveCallJob(targetJob);
    if (targetJob.providerCallId) {
      callbridgeStorage.updateProviderCallMappingStatus(targetJob.providerCallId, targetJob.status);
    }

    if (isTerminal && targetJob.campaignId) {
      this.onJobTerminal(targetJob.campaignId, targetJob.id, {
        isAnswered: targetJob.status === 'completed',
        isNoAnswer: targetJob.status === 'no_answer',
        isFailed: targetJob.status === 'failed' || targetJob.status === 'busy',
        status: targetJob.status,
      });
    }

    return { success: true, job: targetJob };
  }
}

export const queueManager = new QueueManager();
