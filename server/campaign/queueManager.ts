import { callbridgeStorage, type CallJobRecord, type CampaignRecord } from '../storage/callbridgeStorage.ts';
import { VapiService } from '../telephony/vapiService.ts';
import { ElevenLabsService } from '../voice/elevenLabsService.ts';
import { sanitizeScriptForSpeech } from '../templates/templateEngine.ts';

interface ActiveRunner {
  campaignId: string;
  isPaused: boolean;
  isStopped: boolean;
  timer: NodeJS.Timeout | null;
}

class QueueManager {
  private activeRunners = new Map<string, ActiveRunner>();
  private terminalHandledJobs = new Set<string>();

  constructor() {
    this.resumeActiveCampaigns();
    VapiService.onCallTerminal((campaignId, jobId, outcome) => {
      this.onJobTerminal(campaignId, jobId, outcome);
    });
  }

  private resumeActiveCampaigns(): void {
    try {
      const allEvents = callbridgeStorage.getEvents();
      for (const evt of allEvents) {
        const campaigns = callbridgeStorage.getCampaigns(evt.id);
        for (const camp of campaigns) {
          if (camp.status === 'running') {
            console.log(`[QUEUE_RECOVERY] Found running campaign: ${camp.id} (${camp.name}). Resuming runner.`);
            let runner = this.activeRunners.get(camp.id);
            if (!runner) {
              runner = { campaignId: camp.id, isPaused: false, isStopped: false, timer: null };
              this.activeRunners.set(camp.id, runner);
            }
            setTimeout(() => this.processNext(camp.id), 2500);
          }
        }
      }
    } catch (e: any) {
      console.warn('[QUEUE_RECOVERY_WARN]', e.message);
    }
  }

  /**
   * Enqueue contacts for a campaign
   */
  public createCampaignJobs(campaignId: string, eventId: string, contactIds: string[]): CallJobRecord[] {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    const contacts = callbridgeStorage.getContacts(eventId, campaign?.clientId);
    const selectedContacts = contactIds.length > 0
      ? contacts.filter((c) => contactIds.includes(c.id))
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

      const jobCreatedAt = new Date(Date.now() + idx * 50).toISOString();
      const job: CallJobRecord = {
        id: `job_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        clientId: campaign?.clientId || (contact as any).clientId || 'client_001',
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
      targetCampaign.totalContacts = allJobs.length;
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

    let runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = false;
      runner.isStopped = false;
    } else {
      runner = {
        campaignId,
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
   * Pause campaign queue: stops initiating new calls, lets active call finish
   */
  public pauseCampaign(campaignId: string): { success: boolean; message: string; campaign?: CampaignRecord } {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (campaign) {
      campaign.status = 'paused';
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
    }

    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = true;
      if (runner.timer) clearTimeout(runner.timer);
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

    let runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = false;
      runner.isStopped = false;
    } else {
      runner = {
        campaignId,
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

    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isPaused = true;
      runner.isStopped = true;
      if (runner.timer) clearTimeout(runner.timer);
    }

    // Preserve active call in progress - DO NOT cancel ongoing conversations!
    console.log(`[QUEUE_STOPPED] Campaign ${campaignId} stopped initiating new calls. Active call preserved.`);
    return { success: true, message: 'Queue stopped. Current active call is preserved and no new calls will be placed.', campaign: campaign || undefined };
  }

  /**
   * Cancel campaign queue: Cancels remaining pending jobs, terminates active in-flight call if requested.
   */
  public async cancelCampaign(campaignId: string): Promise<{ success: boolean; message: string; campaign?: CampaignRecord }> {
    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (campaign) {
      campaign.status = 'cancelled';
      campaign.activeCalls = 0;
      campaign.activeCallId = null;
      campaign.activeCallStatus = null;
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
    }

    const runner = this.activeRunners.get(campaignId);
    if (runner) {
      runner.isStopped = true;
      if (runner.timer) clearTimeout(runner.timer);
      this.activeRunners.delete(campaignId);
    }

    const jobs = callbridgeStorage.getCallJobs(campaignId);
    const now = new Date().toISOString();

    for (const j of jobs) {
      if (j.status === 'pending') {
        j.status = 'cancelled';
        j.updatedAt = now;
        callbridgeStorage.saveCallJob(j);
      } else if (j.status === 'in_progress' || j.status === 'calling' || j.status === 'ringing' || j.status === 'initiating') {
        // Active call: explicitly terminate provider call using valid providerCallId in background
        const targetId = j.providerCallId || j.id;
        VapiService.terminateCall(targetId).catch((e: any) => {
          console.warn(`[CANCEL_CAMPAIGN_TERMINATE_WARN] ${targetId}:`, e.message);
        });
        j.status = 'cancelled';
        j.endedAt = now;
        j.failureReason = 'Cancelled by user';
        j.updatedAt = now;
        callbridgeStorage.saveCallJob(j);
      }
    }

    console.log(`[QUEUE_CANCELLED] Campaign ${campaignId} cancelled by user.`);
    return { success: true, message: 'Campaign cancelled and pending/active calls terminated.', campaign: campaign || undefined };
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

YOUR ONLY TASK:
The respondent is answering the spoken RSVP question: "మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?".
Classify their answer into one of the following 3 categories:
1. ATTENDING:
   Telugu: అవును, హా, హా వస్తాను, హా అవును, అవును నేను వస్తాను, వస్తాను, తప్పకుండా వస్తాను, నేను అటెండ్ అవుతాను, వస్తాం, వస్తున్నాను, హాజరవుతాను, విచ్చేస్తాను.
   English: Yes, Yes I will attend, Yeah, Sure, definitely, I will come, We will come, count me in.
   Hindi: Haan, Ji haan, Pakka aaunga, Pakka aaungi, Zaroor aaunga.
   ACTION: Transition to STATE 3 & STATE 4. Say ONLY:
   "సరే, ధన్యవాదాలు."

2. NOT ATTENDING:
   Telugu: లేదు, లేదు నేను రాను, రాను, రావట్లేదు, రాలేను, రాలేము, నేను అటెండ్ అవ్వను, కుదరదు, రావడం కుదరదు, వీలుకాదు, వీలుపడదు, హాజరు కాలేను.
   English: No, No I cannot come, Nope, cannot attend, unable to attend, not coming, will not attend.
   Hindi: Nahi, Nahi aaunga, Nahi aaungi, Aana mushkil hai.
   ACTION: Transition to STATE 3 & STATE 4. Say ONLY:
   "సరే, ధన్యవాదాలు."

3. MAYBE ATTENDING:
   Telugu: చూస్తాను, కుదిరితే వస్తాను, టైం బట్టి, బహుశా వస్తాను, ఇంకా తెలియదు, ప్రయత్నిస్తాను, చూద్దాం, సమయం బట్టి, వీలైతే.
   English: Maybe, I will try, Not sure, Depends on time, tentative.
   Hindi: Dekhenge, Shayad, Koshish karenge.
   ACTION: Transition to STATE 3 & STATE 4. Say ONLY:
   "సరే, ధన్యవాదాలు."

4. UNCLEAR:
   If and only if the respondent only gave an initial greeting (e.g. "హలో", "నమస్కారం", "hello") or an unclear sound, ask at most ONE short clarification in Telugu:
   "క్షమించండి, మీరు వివాహానికి వస్తున్నారా లేదా అనేది స్పష్టంగా చెప్పగలరా?"
   After their next reply, say ONLY:
   "సరే, ధన్యవాదాలు."

TERMINATION RULE:
Once you speak "సరే, ధన్యవాదాలు.", STOP SPEAKING COMPLETELY.
Do not speak any additional sentence or follow-up question.
Do not read the invitation transcript again.
Do not generate any further conversational response.
Invoke tool endCall to end the call immediately.
The active call will end automatically.
Speak ONLY in authentic Telugu script (తెలుగు).`;
    }
    return '';
  }

  /**
   * Process next contact in sequential order
   * Strictly 1 call at a time. Advance only when current call reaches terminal state.
   */
  public processNext(campaignId: string): void {
    const runner = this.activeRunners.get(campaignId);
    if (!runner || runner.isPaused || runner.isStopped) return;

    const campaign = callbridgeStorage.getCampaign(campaignId);
    if (!campaign || campaign.status !== 'running') return;

    const jobs = callbridgeStorage.getCallJobs(campaignId);
    
    // In-flight active jobs that occupy the telephony line
    const activeJobs = jobs.filter((j) =>
      j.status === 'initiating' || j.status === 'calling' || j.status === 'ringing' || j.status === 'in_progress'
    );

    // Strict sequential execution: exactly 1 call at a time per campaign
    const concurrencyLimit = 1;
    if (activeJobs.length >= concurrencyLimit) {
      console.log(`[QUEUE_SEQUENTIAL_WAIT] Campaign ${campaignId} has active call ${activeJobs[0].id} (${activeJobs[0].status}). Waiting for terminal state.`);
      return;
    }

    // Preserve exact queue order (FIFO)
    const pendingJobs = jobs
      .filter((j) => j.status === 'pending')
      .sort((a, b) => {
        const orderA = typeof a.metadata?.queueOrder === 'number' ? a.metadata.queueOrder : null;
        const orderB = typeof b.metadata?.queueOrder === 'number' ? b.metadata.queueOrder : null;
        if (orderA !== null && orderB !== null) return orderA - orderB;
        return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      });

    if (pendingJobs.length === 0 && activeJobs.length === 0) {
      // All queued contacts have been processed
      campaign.status = 'completed';
      campaign.processedCount = jobs.filter((j) =>
        ['completed', 'failed', 'opted_out', 'no_answer', 'busy', 'cancelled'].includes(j.status)
      ).length;
      campaign.completedCount = jobs.filter((j) => j.status === 'completed').length;
      campaign.failedCount = jobs.filter((j) => ['failed', 'no_answer', 'busy'].includes(j.status)).length;
      campaign.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(campaign);
      this.activeRunners.delete(campaignId);
      console.log(`[QUEUE_CAMPAIGN_COMPLETED] Campaign ${campaignId} finished all contacts.`);
      return;
    }

    // Strictly take 1 next pending contact
    const nextJob = pendingJobs[0];
    if (nextJob) {
      this.dispatchJob(nextJob, campaign);
    }
  }

  /**
   * Dispatches a single call via real Vapi + Twilio telephony
   */
  private async dispatchJob(job: CallJobRecord, campaign: CampaignRecord): Promise<void> {
    const now = new Date().toISOString();
    const clientId = job.clientId || campaign.clientId || 'client_001';

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

    const event = callbridgeStorage.getEvent(campaign.eventId);
    const eventType = event?.type || 'public_survey';

    // 2. Resolve approved ElevenLabs voice for this module
    let rawVoiceId = event?.selectedVoiceProfileId;
    if (!rawVoiceId) {
      const approved = callbridgeStorage.getApprovedVoiceProfile(clientId, eventType, event?.id);
      rawVoiceId = approved?.providerVoiceId || approved?.elevenLabsVoiceId;
    }
    const voiceId = ElevenLabsService.resolveVoiceId(rawVoiceId);

    // 3. Module-isolated script & system prompt separation with clean speech rendering
    let rawScript = '';
    let systemPrompt = '';

    if (eventType === 'public_survey') {
      const questions = callbridgeStorage.getSurveyQuestions(event?.id || 'event_public_survey');
      const enabledQuestions = questions.filter((q) => q.enabled !== false);
      const questionList = enabledQuestions
        .map((q, idx) => `${idx + 1}. ${q.text || q.questionText}`)
        .join('\n');

      rawScript = event?.config?.surveyIntro || 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.';
      systemPrompt = `You are a courteous, professional Telugu interviewer conducting a civic survey for public facilities.
Survey Introduction: "${rawScript}"
Survey questions to ask one by one in order:
${questionList}

Instructions:
1. Speak in natural, respectful conversational Telugu.
2. Deliver the introduction first, then ask each question one at a time.
3. Wait for the respondent to answer each question.
4. Acknowledge each response warmly and concisely in 1 short sentence before asking the next question.
5. If the respondent asks for clarification, give a brief, helpful 1-sentence answer based only on civic context, then continue.
6. After the last question, say: "మీ విలువైన సమయానికి మరియు సమాధానాలకు హృదయపూర్వక ధన్యవాదాలు! శుభదినం."
7. Terminate the call gracefully once all questions are completed.`;
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
        VapiService.mapProviderCallIdToJob(providerCallId, job.id, campaign.id, campaign.eventId, job.contactPhone);
        callbridgeStorage.mapProviderCallIdToJob(providerCallId, job.id, campaign.id, campaign.eventId);
      }

      console.log('[QUEUE_CALL_ACCEPTED_BY_PROVIDER]', {
        jobId: job.id,
        providerCallId,
        phone: job.contactPhone,
      });

      // Monitor call until terminal state (completed / failed / no_answer)
      this.monitorJobUntilTerminal(job.id, campaign.id);
    } catch (err: any) {
      console.error('[QUEUE_CALL_REJECTED_BY_PROVIDER]', {
        jobId: job.id,
        phone: job.contactPhone,
        error: err?.message || err,
      });

      const failedJob = callbridgeStorage.getCallJob(job.id);
      const finishTime = new Date().toISOString();
      if (failedJob) {
        failedJob.status = 'failed';
        failedJob.failureReason = err?.message || 'Telephony provider rejected call request';
        failedJob.endedAt = finishTime;
        failedJob.durationSeconds = 0;
        failedJob.updatedAt = finishTime;
        callbridgeStorage.saveCallJob(failedJob);
      }

      // Advance sequential queue to next contact
      this.onJobTerminal(campaign.id, job.id);
    }
  }

  /**
   * Actively polls Vapi Call Status until terminal state is reached
   */
  private monitorJobUntilTerminal(jobId: string, campaignId: string): void {
    const runner = this.activeRunners.get(campaignId);
    if (!runner || runner.isStopped) return;

    let pollCount = 0;
    const maxPolls = 100; // 100 * 3s = 300s (5 minutes max per call)

    const interval = setInterval(async () => {
      pollCount++;
      const currentRunner = this.activeRunners.get(campaignId);
      if (!currentRunner || currentRunner.isStopped) {
        clearInterval(interval);
        return;
      }

      let job = callbridgeStorage.getCallJob(jobId);
      // If already terminal (via webhook or earlier poll), stop and advance
      if (job && ['completed', 'failed', 'cancelled', 'no_answer', 'busy', 'opted_out', 'interrupted', 'callback_scheduled'].includes(job.status)) {
        clearInterval(interval);
        this.onJobTerminal(campaignId, jobId);
        return;
      }

      const targetId = job?.providerCallId || jobId;
      try {
        const statusRes = await VapiService.getCallStatus(targetId);
        if (statusRes) {
          const status = statusRes.status || '';
          if (statusRes.isTerminal || ['completed', 'failed', 'cancelled', 'no_answer', 'busy', 'ended', 'interrupted', 'callback_scheduled'].includes(status)) {
            clearInterval(interval);
            const isAns = status === 'completed' || status === 'interrupted' || status === 'callback_scheduled' || Boolean(statusRes.dtmfDigit);
            this.onJobTerminal(campaignId, jobId, {
              isAnswered: isAns,
              isNoAnswer: status === 'no_answer',
              isFailed: status === 'failed' || status === 'busy',
              status,
            });
            return;
          }
        }
      } catch (pollErr: any) {
        console.warn(`[POLL_STATUS_WARN] ${jobId}:`, pollErr?.message);
      }

      if (pollCount >= maxPolls) {
        clearInterval(interval);
        console.warn(`[POLL_TIMEOUT] Call ${jobId} reached 5-minute timeout.`);
        const timeoutJob = callbridgeStorage.getCallJob(jobId);
        if (timeoutJob && !['completed', 'failed', 'cancelled'].includes(timeoutJob.status)) {
          timeoutJob.status = 'no_answer';
          timeoutJob.failureReason = 'Call timed out without provider terminal callback';
          timeoutJob.endedAt = new Date().toISOString();
          timeoutJob.updatedAt = timeoutJob.endedAt;
          callbridgeStorage.saveCallJob(timeoutJob);
        }
        this.onJobTerminal(campaignId, jobId);
      }
    }, 3000);
  }

  /**
   * Reconciles an active or running campaign against provider call state.
   * Ensures activeCalls = 0 and status = 'completed' when finished, preventing stale values.
   */
  public async reconcileCampaign(campaignId: string): Promise<CampaignRecord | null> {
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
          statusRes.isTerminal ||
          ['completed', 'failed', 'cancelled', 'no_answer', 'busy', 'ended'].includes(statusRes.status || '')
        ) {
          const isAns = statusRes.status === 'completed' || Boolean(statusRes.dtmfDigit);
          this.onJobTerminal(campaignId, targetJobId, {
            isAnswered: isAns,
            isNoAnswer: statusRes.status === 'no_answer',
            isFailed: statusRes.status === 'failed' || statusRes.status === 'busy',
            status: statusRes.status,
          });
        }
      } catch (e: any) {
        console.warn(`[RECONCILE_STATUS_WARN] ${targetJobId}:`, e.message);
      }
    } else {
      const allJobs = callbridgeStorage.getCallJobs(campaignId);
      const remainingPending = allJobs.filter((j) => j.status === 'pending').length;
      campaign.pendingCount = remainingPending;
      if (remainingPending === 0) {
        campaign.activeCalls = 0;
        campaign.activeCallId = null;
        campaign.activeCallProviderId = null;
        campaign.activeCallStatus = null;
        if (campaign.status === 'running') {
          campaign.status = 'completed';
        }
        campaign.updatedAt = new Date().toISOString();
        callbridgeStorage.saveCampaign(campaign);
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
      if (this.terminalHandledJobs.has(jobId)) {
        return; // Deduplicate: already handled this terminal call
      }
      this.terminalHandledJobs.add(jobId);
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
    const eventAgg = callbridgeStorage.getAggregateAnalytics(campaign.eventId);

    const isAnswered = Boolean(
      outcome?.isAnswered ||
      outcome?.status === 'completed' ||
      (campAgg.answeredCalls || 0) > 0 ||
      (eventAgg.answeredCalls || 0) > 0 ||
      (campAgg.politicalCampaign && (campAgg.politicalCampaign.keypad1Count > 0 || campAgg.politicalCampaign.keypad2Count > 0)) ||
      (eventAgg.politicalCampaign && (eventAgg.politicalCampaign.keypad1Count > 0 || eventAgg.politicalCampaign.keypad2Count > 0))
    );
    const isNoAnswer = Boolean(!isAnswered && (outcome?.isNoAnswer || outcome?.status === 'no_answer' || campAgg.unansweredCalls > 0));
    const isFailed = Boolean(!isAnswered && !isNoAnswer && (outcome?.isFailed || outcome?.status === 'failed' || outcome?.status === 'busy' || campAgg.failedCalls > 0));

    const resolvedAnswered = Math.max(
      campaign.answeredCount || 0,
      campAgg.answeredCalls || 0,
      eventAgg.answeredCalls || 0,
      isAnswered ? 1 : 0
    );
    const resolvedUnanswered = Math.max(
      campaign.unansweredCount || 0,
      campAgg.unansweredCalls || 0,
      eventAgg.unansweredCalls || 0,
      isNoAnswer ? 1 : 0
    );
    const resolvedFailed = Math.max(
      campaign.failedCount || 0,
      campAgg.failedCalls || 0,
      eventAgg.failedCalls || 0,
      isFailed ? 1 : 0
    );
    const event = campaign.eventId ? callbridgeStorage.getEvent(campaign.eventId) : null;
    const isPublicSurvey = event?.type === 'public_survey';

    const resolvedCompleted = isPublicSurvey
      ? Math.max(
          campaign.completedCount || 0,
          campAgg.completedCalls || 0,
          eventAgg.completedCalls || 0,
          outcome?.status === 'completed' ? 1 : 0
        )
      : Math.max(
          campaign.completedCount || 0,
          campAgg.completedCalls || 0,
          eventAgg.completedCalls || 0,
          resolvedAnswered
        );

    campaign.answeredCount = resolvedAnswered;
    campaign.unansweredCount = resolvedUnanswered;
    campaign.failedCount = resolvedFailed;
    campaign.completedCount = resolvedCompleted;
    campaign.processedCount = Math.max(
      campaign.processedCount || 0,
      resolvedCompleted + resolvedUnanswered + resolvedFailed,
      1
    );

    const allJobs = callbridgeStorage.getCallJobs(campaignId);
    const remainingPending = allJobs.filter((j) => j.status === 'pending').length;
    campaign.pendingCount = remainingPending;

    if (remainingPending === 0) {
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

    if (!hasRemainingPending) {
      if (campaign.status === 'running') {
        campaign.status = 'completed';
        campaign.updatedAt = new Date().toISOString();
        callbridgeStorage.saveCampaign(campaign);
      }
      this.activeRunners.delete(campaignId);
      console.log(`[QUEUE_CAMPAIGN_ALL_PROCESSED] Campaign ${campaignId} completed. All queued calls reached terminal state.`);
      return;
    }

    let runner = this.activeRunners.get(campaignId);
    if (!runner && campaign.status === 'running') {
      runner = { campaignId, isPaused: false, isStopped: false, timer: null };
      this.activeRunners.set(campaignId, runner);
    }

    if (!runner || runner.isPaused || runner.isStopped || campaign.status !== 'running') return;

    // Advance queue to next pending contact immediately
    setTimeout(() => {
      this.processNext(campaignId);
    }, 600);
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
    const allEvents = callbridgeStorage.getEvents();
    let targetJob: CallJobRecord | undefined;

    for (const evt of allEvents) {
      const jobs = callbridgeStorage.getCallJobsByEvent(evt.id);
      targetJob = jobs.find((j) => j.providerCallId === payload.callId || j.id === payload.callId);
      if (targetJob) break;
    }

    if (!targetJob) {
      return { success: false };
    }

    const now = new Date().toISOString();
    let isTerminal = false;

    if (payload.status === 'completed' || payload.status === 'ended') {
      targetJob.status = 'completed';
      targetJob.durationSeconds = payload.duration || targetJob.durationSeconds || 18;
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (payload.status === 'busy') {
      targetJob.status = 'busy';
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (payload.status === 'no_answer' || payload.status === 'no-answer') {
      targetJob.status = 'no_answer';
      targetJob.endedAt = now;
      isTerminal = true;
    } else if (payload.status === 'ringing') {
      targetJob.status = 'ringing';
    } else if (payload.status === 'in_progress' || payload.status === 'in-progress') {
      targetJob.status = 'in_progress';
    } else if (payload.status === 'failed') {
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

    if (isTerminal && targetJob.campaignId) {
      this.onJobTerminal(targetJob.campaignId, targetJob.id);
    }

    return { success: true, job: targetJob };
  }
}

export const queueManager = new QueueManager();
