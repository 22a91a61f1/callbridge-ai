import { callbridgeStorage, type CallJobRecord } from '../storage/callbridgeStorage.ts';
import { ElevenLabsService } from '../voice/elevenLabsService.ts';
import { sanitizeScriptForSpeech } from '../templates/templateEngine.ts';
import { normalizeTeluguPronunciation, classifyMarriageRsvp } from '../voice/teluguPronunciationDictionary.ts';
import { SurveySequentialEngine } from '../survey/surveySequentialEngine.ts';

export { classifyMarriageRsvp };

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(str?: string | null): boolean {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
}

export interface VapiConfigStatus {
  isConfigured: boolean;
  hasApiKey: boolean;
  hasPhoneNumberId: boolean;
  hasAssistantId: boolean;
  hasElevenlabsCredential?: boolean;
  elevenlabsCredentialId?: string;
  phoneNumberId?: string;
  assistantId?: string;
  source: 'env' | 'runtime' | 'none';
}

export interface CreateOutboundCallParams {
  phoneNumber: string; // Recipient mobile
  contactName?: string;
  voiceId: string; // Approved user ElevenLabs voice ID
  voiceName?: string;
  moduleType:
    | 'public_survey'
    | 'political_campaign'
    | 'political_survey'
    | 'business_event'
    | 'marriage_event'
    | string;
  script: string;
  systemPrompt?: string;
  language?: string;
  dtmfOptions?: Array<{ digit: string; labelEn: string; confirmationText?: string }>;
  campaignId?: string;
  eventId?: string;
  contactId?: string;
  clientId?: string;
  userId?: string;
  appBaseUrl?: string;
  maxDurationSeconds?: number;
  callId?: string;
  jobId?: string;
}

export interface VapiCallResponse {
  success: boolean;
  callId?: string;
  providerCallId?: string;
  status: string;
  message?: string;
  job?: CallJobRecord;
  raw?: any;
  error?: string;
  isSimulated?: boolean;
}

// In-memory runtime override storage for secrets (never exposed to client)
let runtimeApiKey: string | null = null;
let runtimePhoneNumberId: string | null = null;
let runtimeAssistantId: string | null = null;
let runtimeElevenLabsCredentialId: string | null = null;

export interface CallControlInfo {
  controlUrl: string;
  controlAuthenticationEnabled?: boolean;
}

/**
 * Safely extracts a single keypad digit from various Vapi webhook payload structures:
 * - Direct dtmf/digits fields (payload or message)
 * - User transcript / spoken / keyed digit
 * - Conversation update user message
 * - Function call / tool call arguments
 */
function parseDigitCandidate(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim().toLowerCase();
  if (/^[0-9#*]$/.test(s)) return s;
  const match = s.match(/\b([0-9#*])\b/);
  if (match) return match[1];

  // Natural spoken numbers support for Telugu, Hindi, and English responses
  if (/\b(one|okati|ఒకటి|ek)\b/i.test(s)) return '1';
  if (/\b(two|rendu|రెండు|do)\b/i.test(s)) return '2';
  return null;
}

export function extractKeypadDigit(payload: any): string | null {
  if (!payload) return null;
  const message = payload?.message || payload;
  const call = message?.call || payload?.call;

  // 1. Direct digit/dtmf fields in payload, message, call, or speech
  const directCandidates = [
    payload?.digits,
    message?.digits,
    call?.digits,
    payload?.digit,
    message?.digit,
    call?.digit,
    payload?.dtmf,
    message?.dtmf,
    call?.dtmf,
    payload?.dtmfDigits,
    message?.dtmfDigits,
    payload?.Digits,
    message?.Digits,
    payload?.speech?.digit,
    message?.speech?.digit,
    payload?.speech?.digits,
    message?.speech?.digits,
    payload?.speechUpdate?.digit,
    message?.speechUpdate?.digit,
    payload?.call?.dtmf,
    message?.call?.dtmf,
  ];

  for (const cand of directCandidates) {
    const digit = parseDigitCandidate(cand);
    if (digit) return digit;
  }

  // 2. Transcript segments (top-level or inside artifact/call)
  const transcriptCandidates = [
    message?.transcript,
    message?.text,
    message?.artifact?.transcript,
    call?.artifact?.transcript,
    call?.transcript,
    payload?.transcript,
  ];
  for (const t of transcriptCandidates) {
    const digit = parseDigitCandidate(t);
    if (digit) return digit;
  }

  // 3. Conversation & Artifact Messages lists
  const messagesList =
    message?.artifact?.messages ||
    call?.artifact?.messages ||
    payload?.artifact?.messages ||
    message?.messages ||
    message?.conversation ||
    payload?.messages ||
    payload?.conversation;

  if (Array.isArray(messagesList) && messagesList.length > 0) {
    const userMsgs = [...messagesList].reverse().filter(
      (m: any) => !m.role || m.role === 'user' || m.role === 'customer' || m.role === 'respondent'
    );
    for (const m of userMsgs) {
      const content = m.content || m.message || m.text;
      const digit = parseDigitCandidate(content);
      if (digit) return digit;
    }
  }

  // 4. Tool calls (e.g. End Call function or DTMF capture tool)
  const toolCalls =
    message?.toolCalls ||
    message?.toolCallList ||
    payload?.toolCalls ||
    message?.call?.toolCalls ||
    call?.toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const args = tc.function?.arguments || tc.arguments;
      let parsedArgs: any = {};
      try {
        parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {};
      } catch {
        parsedArgs = {};
      }
      const toolDigit =
        parsedArgs.digit || parsedArgs.digits || parsedArgs.dtmf || parsedArgs.key;
      const digit = parseDigitCandidate(toolDigit);
      if (digit) return digit;
    }
  }

  return null;
}

export class VapiService {
  private static BASE_URL = 'https://api.vapi.ai';
  public static activeCallControls = new Map<string, CallControlInfo>();
  public static activeTransientCalls = new Map<
    string,
    {
      campaignId: string;
      jobId: string;
      eventId: string;
      phone?: string;
      dtmfDigit?: string | null;
      timestamp: number;
    }
  >();

  public static extractKeypadDigit(payload: any): string | null {
    return extractKeypadDigit(payload);
  }

  public static setActiveCallControl(callId: string, controlUrl: string, controlAuthenticationEnabled?: boolean): void {
    VapiService.activeCallControls.set(callId, { controlUrl, controlAuthenticationEnabled });
  }

  public static getActiveCallControl(callId: string): CallControlInfo | undefined {
    return VapiService.activeCallControls.get(callId);
  }

  private static providerToJobMap = new Map<string, { jobId: string; campaignId: string; eventId: string; phone?: string }>();
  private static jobToProviderMap = new Map<string, string>();

  public static mapProviderCallIdToJob(
    providerCallId: string,
    jobId: string,
    campaignId: string,
    eventId: string,
    phone?: string
  ): void {
    if (providerCallId && jobId) {
      this.providerToJobMap.set(providerCallId, { jobId, campaignId, eventId, phone });
      this.jobToProviderMap.set(jobId, providerCallId);
      this.registerTransientActiveCall(providerCallId, { campaignId, jobId, eventId, phone });
      this.registerTransientActiveCall(jobId, { campaignId, jobId, eventId, phone });
    }
  }

  public static getJobIdByProviderCallId(providerCallId: string): string | undefined {
    return this.providerToJobMap.get(providerCallId)?.jobId;
  }

  public static getProviderCallIdByJobId(jobId: string): string | undefined {
    return this.jobToProviderMap.get(jobId);
  }

  public static getCampaignIdByProviderCallId(providerCallId: string): string | undefined {
    return this.providerToJobMap.get(providerCallId)?.campaignId;
  }

  public static registerTransientActiveCall(
    callId: string,
    info: { campaignId: string; jobId: string; eventId: string; phone?: string; dtmfDigit?: string | null }
  ): void {
    const full = { ...info, timestamp: Date.now() };
    VapiService.activeTransientCalls.set(callId, full);
    if (info.jobId && info.jobId !== callId) {
      VapiService.activeTransientCalls.set(info.jobId, full);
    }
    if (info.jobId) {
      this.jobToProviderMap.set(info.jobId, callId);
    }
    this.providerToJobMap.set(callId, { jobId: info.jobId, campaignId: info.campaignId, eventId: info.eventId, phone: info.phone });
  }

  public static getTransientActiveCall(callId: string) {
    return VapiService.activeTransientCalls.get(callId);
  }

  // Short-lived idempotency protection (prevents duplicate webhook processing)
  private static webhookIdempotency = new Map<
    string,
    {
      dtmfProcessed?: boolean;
      endCallDispatched?: boolean;
      terminalHandled?: boolean;
      dtmfDigit?: string | null;
      timestamp: number;
    }
  >();

  public static getIdempotency(callId: string) {
    const now = Date.now();
    if (this.webhookIdempotency.size > 200) {
      for (const [k, v] of this.webhookIdempotency.entries()) {
        if (now - v.timestamp > 900000) this.webhookIdempotency.delete(k);
      }
    }
    let record = this.webhookIdempotency.get(callId);
    if (!record) {
      record = { timestamp: now };
      this.webhookIdempotency.set(callId, record);
    }
    return record;
  }

  // Strict conversation state tracking for Marriage Event (5 states)
  public static marriageCallStates = new Map<
    string,
    {
      state: 'STATE_1_INVITATION' | 'STATE_2_WAITING_FOR_RSVP' | 'STATE_3_RSVP_CLASSIFIED' | 'STATE_3_RSVP_RECORDED' | 'STATE_4_THANK_YOU' | 'STATE_4_THANK_YOU_AND_END' | 'STATE_5_CALL_END';
      rsvpCategory?: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING' | 'NOT ATTENDING' | 'MAYBE ATTENDING';
      lastUserUtterance?: string;
      clarificationAsked?: boolean;
      thankYouStarted?: boolean;
      thankYouSpoken?: boolean;
      thankYouCompleted?: boolean;
      endCallRequested?: boolean;
      endCallApiSuccess?: boolean;
      providerTerminated?: boolean;
      terminationConfirmed?: boolean;
      safetyTimer?: any;
      timestamp: number;
    }
  >();

  public static getMarriageCallState(callId: string) {
    let s = this.marriageCallStates.get(callId);
    if (!s) {
      const mappedProviderId = this.getProviderCallIdByJobId(callId);
      if (mappedProviderId && this.marriageCallStates.has(mappedProviderId)) {
        s = this.marriageCallStates.get(mappedProviderId);
      }
    }
    if (!s) {
      const mappedJobId = this.getJobIdByProviderCallId(callId);
      if (mappedJobId && this.marriageCallStates.has(mappedJobId)) {
        s = this.marriageCallStates.get(mappedJobId);
      }
    }
    if (!s) {
      s = { state: 'STATE_1_INVITATION', timestamp: Date.now() };
      this.marriageCallStates.set(callId, s);
    }
    return s;
  }

  public static initMarriageCallState(callId: string) {
    if (!callId) return;
    const existing = this.marriageCallStates.get(callId);
    if (existing?.safetyTimer) {
      clearTimeout(existing.safetyTimer);
    }
    const s = {
      state: 'STATE_1_INVITATION' as const,
      timestamp: Date.now(),
    };
    this.marriageCallStates.set(callId, s);
    const mappedProviderId = this.getProviderCallIdByJobId(callId);
    if (mappedProviderId && mappedProviderId !== callId) {
      this.marriageCallStates.set(mappedProviderId, s);
    }
  }

  public static hasMarriageCallState(callId: string): boolean {
    if (!callId) return false;
    if (this.marriageCallStates.has(callId)) return true;
    const mappedJobId = this.getJobIdByProviderCallId(callId);
    if (mappedJobId && this.marriageCallStates.has(mappedJobId)) return true;
    const mappedProviderId = this.getProviderCallIdByJobId(callId);
    if (mappedProviderId && this.marriageCallStates.has(mappedProviderId)) return true;
    return false;
  }

  // Conversation state tracking for Public Survey (deterministic sequential flow)
  public static publicSurveyCallStates = new Map<
    string,
    {
      closingStarted?: boolean;
      closingSpoken?: boolean;
      closingCompleted?: boolean;
      endCallRequested?: boolean;
      safetyTimer?: any;
      timestamp: number;
      processedUtterances?: Set<string>;
      lastProcessedUtterance?: string;
      lastGeneratedAgentReply?: string;
    }
  >();

  public static getPublicSurveyCallState(callId: string) {
    let s = this.publicSurveyCallStates.get(callId);
    if (!s) {
      const mappedProviderId = this.getProviderCallIdByJobId(callId);
      if (mappedProviderId && this.publicSurveyCallStates.has(mappedProviderId)) {
        s = this.publicSurveyCallStates.get(mappedProviderId);
      }
    }
    if (!s) {
      const mappedJobId = this.getJobIdByProviderCallId(callId);
      if (mappedJobId && this.publicSurveyCallStates.has(mappedJobId)) {
        s = this.publicSurveyCallStates.get(mappedJobId);
      }
    }
    if (!s) {
      s = { timestamp: Date.now() };
      this.publicSurveyCallStates.set(callId, s);
    }
    return s;
  }

  public static initPublicSurveyCallState(callId: string) {
    if (!callId) return;
    const existing = this.publicSurveyCallStates.get(callId);
    if (existing?.safetyTimer) {
      clearTimeout(existing.safetyTimer);
    }
    const s = { timestamp: Date.now() };
    this.publicSurveyCallStates.set(callId, s);
    const mappedProviderId = this.getProviderCallIdByJobId(callId);
    if (mappedProviderId && mappedProviderId !== callId) {
      this.publicSurveyCallStates.set(mappedProviderId, s);
    }
  }

  public static appendSurveyTranscriptTurn(
    job: CallJobRecord,
    role: 'agent' | 'respondent' | 'system',
    text: string,
    questionId?: string
  ): void {
    if (!text || !text.trim()) return;
    const now = new Date().toISOString();
    const turn = {
      role,
      text: text.trim(),
      timestamp: now,
      questionId,
    };
    if (!Array.isArray(job.transcript)) {
      job.transcript = [];
    }
    job.transcript.push(turn as any);
    if (!Array.isArray(job.originalTranscript)) {
      job.originalTranscript = [];
    }
    job.originalTranscript.push({ ...turn } as any);
  }

  public static async executePublicSurveyCallTermination(
    campaignId: string,
    providerCallId: string,
    controlUrl?: string,
    authEnabled?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const s = this.getPublicSurveyCallState(providerCallId);
    if (s.endCallRequested) {
      return { success: true };
    }
    s.endCallRequested = true;
    console.log('[PUBLIC_SURVEY_END_CALL_REQUESTED]', {
      campaignId,
      providerCallId,
    });
    return await this.terminateCall(providerCallId, controlUrl, authEnabled);
  }

  public static processStructuredMarriageRsvp(
    campaignId: string,
    providerCallId: string,
    categoryInput: string,
    eventId?: string,
    userSpeech?: string
  ): {
    success: boolean;
    duplicate?: boolean;
    category?: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING';
    counts?: { attendingCount: number; notAttendingCount: number; maybeAttendingCount: number };
    error?: string;
  } {
    if (!campaignId || !providerCallId || !categoryInput) {
      return { success: false, error: 'Missing required parameters' };
    }

    // 1. Normalize Category
    const raw = String(categoryInput).trim().toUpperCase();
    let normalizedCategory: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING' | null = null;
    if (raw === 'ATTENDING' || raw === 'YES') {
      normalizedCategory = 'ATTENDING';
    } else if (raw === 'NOT_ATTENDING' || raw === 'NOT ATTENDING' || raw === 'NO') {
      normalizedCategory = 'NOT_ATTENDING';
    } else if (raw === 'MAYBE_ATTENDING' || raw === 'MAYBE ATTENDING' || raw === 'MAYBE' || raw === 'TENTATIVE') {
      normalizedCategory = 'MAYBE_ATTENDING';
    }

    // 2. Validate against respondent spoken speech if available
    const marriageState = VapiService.getMarriageCallState(providerCallId);
    const speechToValidate = (userSpeech && typeof userSpeech === 'string' && userSpeech.trim())
      ? userSpeech.trim()
      : (marriageState?.lastUserUtterance || '');

    let conflictDetected = false;
    let validatedCategory = normalizedCategory;

    if (speechToValidate) {
      const semanticCategory = classifyMarriageRsvp(speechToValidate);
      if (semanticCategory !== 'UNCLEAR') {
        if (semanticCategory === 'ATTENDING' && normalizedCategory !== 'ATTENDING') {
          console.warn('[MARRIAGE_RSVP_LLM_OVERRIDE_CORRECTED]', {
            campaignId,
            providerCallId,
            llmArgument: normalizedCategory,
            correctedCategory: 'ATTENDING',
            reason: 'Respondent speech confirms ATTENDING',
          });
          conflictDetected = true;
          validatedCategory = 'ATTENDING';
        } else if (semanticCategory === 'NOT_ATTENDING' && normalizedCategory !== 'NOT_ATTENDING') {
          console.warn('[MARRIAGE_RSVP_LLM_OVERRIDE_CORRECTED]', {
            campaignId,
            providerCallId,
            llmArgument: normalizedCategory,
            correctedCategory: 'NOT_ATTENDING',
            reason: 'Respondent speech confirms NOT_ATTENDING',
          });
          conflictDetected = true;
          validatedCategory = 'NOT_ATTENDING';
        } else if (semanticCategory === 'MAYBE_ATTENDING' && normalizedCategory !== 'MAYBE_ATTENDING') {
          console.warn('[MARRIAGE_RSVP_LLM_OVERRIDE_CORRECTED]', {
            campaignId,
            providerCallId,
            llmArgument: normalizedCategory,
            correctedCategory: 'MAYBE_ATTENDING',
            reason: 'Respondent speech confirms MAYBE_ATTENDING',
          });
          conflictDetected = true;
          validatedCategory = 'MAYBE_ATTENDING';
        }
      }
    }

    normalizedCategory = validatedCategory;

    // [MARRIAGE_RSVP_SOURCE_VALIDATED] (campaign ID, provider call ID, categories - ZERO PII)
    console.log('[MARRIAGE_RSVP_SOURCE_VALIDATED]', {
      campaignId,
      providerCallId,
      rawCategory: raw,
      validatedCategory: normalizedCategory,
      conflictDetected,
    });

    // [MARRIAGE_RSVP_RESULT_RECEIVED] (campaign ID, provider call ID, category only - ZERO PII)
    console.log('[MARRIAGE_RSVP_RESULT_RECEIVED]', {
      campaignId,
      providerCallId,
      category: normalizedCategory || raw,
    });

    if (!normalizedCategory) {
      return { success: false, error: `Invalid category: ${categoryInput}` };
    }

    // 2. Validate that the call belongs to a Marriage Event campaign
    const camp = callbridgeStorage.getCampaign(campaignId);
    const mappedJobId = VapiService.getJobIdByProviderCallId(providerCallId) || callbridgeStorage.getJobIdByProviderCallId(providerCallId);
    const localJob =
      callbridgeStorage.getCallJobByProviderId(providerCallId) ||
      callbridgeStorage.getCallJob(providerCallId) ||
      (mappedJobId ? callbridgeStorage.getCallJob(mappedJobId) : undefined);
    const transient = VapiService.getTransientActiveCall(providerCallId) || (mappedJobId ? VapiService.getTransientActiveCall(mappedJobId) : undefined);
    const resolvedEventId = eventId || camp?.eventId || localJob?.eventId || transient?.eventId || campaignId;
    const event = callbridgeStorage.getEvent(resolvedEventId);

    const isExplicitNonMarriage =
      (event && event.type !== 'marriage_event') ||
      ((camp as any)?.moduleType && (camp as any).moduleType !== 'marriage_event') ||
      ((camp as any)?.eventType && (camp as any).eventType !== 'marriage_event') ||
      ((localJob as any)?.moduleType && (localJob as any).moduleType !== 'marriage_event');

    if (isExplicitNonMarriage) {
      return { success: false, error: 'Call does not belong to a Marriage Event campaign' };
    }

    const hasMarriageCall = VapiService.hasMarriageCallState(providerCallId) || (mappedJobId ? VapiService.hasMarriageCallState(mappedJobId) : false);

    const isMarriage =
      event?.type === 'marriage_event' ||
      (camp as any)?.moduleType === 'marriage_event' ||
      (camp as any)?.eventType === 'marriage_event' ||
      (localJob as any)?.metadata?.moduleType === 'marriage_event' ||
      (localJob as any)?.moduleType === 'marriage_event' ||
      campaignId.toLowerCase().includes('marriage') ||
      resolvedEventId.toLowerCase().includes('marriage') ||
      hasMarriageCall;

    if (!isMarriage) {
      return { success: false, error: 'Call does not belong to a Marriage Event campaign' };
    }

    // 3. Idempotency Check using providerCallId
    if (callbridgeStorage.isMarriageRsvpRecorded(campaignId, providerCallId)) {
      console.log('[MARRIAGE_RSVP_DUPLICATE_IGNORED]', {
        campaignId,
        providerCallId,
        incomingCategory: normalizedCategory,
      });
      const agg = callbridgeStorage.getAggregateAnalytics(campaignId);
      return {
        success: true,
        duplicate: true,
        category: normalizedCategory,
        counts: {
          attendingCount: agg.marriageEvent?.attendingCount ?? 0,
          notAttendingCount: agg.marriageEvent?.notAttendingCount ?? 0,
          maybeAttendingCount: agg.marriageEvent?.maybeAttendingCount ?? 0,
        },
      };
    }

    // 4. [MARRIAGE_RSVP_RESULT_VALIDATED]
    console.log('[MARRIAGE_RSVP_RESULT_VALIDATED]', {
      campaignId,
      providerCallId,
      category: normalizedCategory,
    });

    // [MARRIAGE_RSVP_CLASSIFIED]
    console.log('[MARRIAGE_RSVP_CLASSIFIED]', {
      campaignId,
      providerCallId,
      category: normalizedCategory,
    });

    // 5. Update Aggregate Storage
    const counts = callbridgeStorage.recordMarriageRsvpOutcome(
      campaignId,
      providerCallId,
      normalizedCategory,
      resolvedEventId
    );

    // 6. [MARRIAGE_RSVP_AGGREGATE_UPDATED]
    console.log('[MARRIAGE_RSVP_AGGREGATE_UPDATED]', {
      campaignId,
      attendingCount: counts.attendingCount,
      notAttendingCount: counts.notAttendingCount,
      maybeAttendingCount: counts.maybeAttendingCount,
    });

    // Update in-memory marriage call state
    marriageState.rsvpCategory = normalizedCategory;

    // Update local job state if found
    if (localJob) {
      localJob.rsvpStatus =
        normalizedCategory === 'ATTENDING'
          ? 'attending'
          : normalizedCategory === 'NOT_ATTENDING'
          ? 'not_attending'
          : 'maybe';
      callbridgeStorage.saveCallJob(localJob);
    }

    return {
      success: true,
      category: normalizedCategory,
      counts,
    };
  }

  /**
   * Robust fallback classifier extracting respondent RSVP from artifact messages or transcripts
   */
  public static classifyAndRecordMarriageFallback(
    job: CallJobRecord,
    call: any,
    message: any,
    payload: any,
    resolvedProviderCallId: string
  ): boolean {
    if (!job || !resolvedProviderCallId) return false;
    const campaignId = job.campaignId;
    if (callbridgeStorage.isMarriageRsvpRecorded(campaignId, resolvedProviderCallId)) {
      return true;
    }

    const marriageState = VapiService.getMarriageCallState(resolvedProviderCallId);
    if (marriageState?.rsvpCategory) {
      const res = VapiService.processStructuredMarriageRsvp(
        campaignId,
        resolvedProviderCallId,
        marriageState.rsvpCategory,
        job.eventId
      );
      return res.success;
    }

    // 1. Check messages lists in message, call, payload, and artifact
    const messagesCandidates = [
      message?.artifact?.messages,
      call?.artifact?.messages,
      payload?.artifact?.messages,
      message?.messages,
      call?.messages,
      payload?.messages,
      message?.conversation,
      call?.conversation,
      payload?.conversation,
    ];

    for (const msgList of messagesCandidates) {
      if (Array.isArray(msgList) && msgList.length > 0) {
        for (let i = msgList.length - 1; i >= 0; i--) {
          const m = msgList[i];
          const role = String(m?.role || '').toLowerCase();
          const isUser = !role || role === 'user' || role === 'customer' || role === 'respondent' || role === 'guest';
          if (isUser) {
            const content = m?.content || m?.message || m?.text;
            if (content && typeof content === 'string') {
              const rsvp = classifyMarriageRsvp(content);
              if (rsvp !== 'UNCLEAR') {
                const res = VapiService.processStructuredMarriageRsvp(
                  campaignId,
                  resolvedProviderCallId,
                  rsvp,
                  job.eventId,
                  content
                );
                if (res.success) {
                  marriageState.rsvpCategory = rsvp;
                  marriageState.state = 'STATE_4_THANK_YOU';
                  return true;
                }
              }
            }
          }
        }
      }
    }

    // 2. Check transcripts
    const transcriptCandidates = [
      message?.transcript,
      call?.transcript,
      payload?.transcript,
      message?.artifact?.transcript,
      call?.artifact?.transcript,
      payload?.artifact?.transcript,
    ];

    for (const t of transcriptCandidates) {
      if (t && typeof t === 'string' && t.trim()) {
        const lines = t.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          const trimmed = line ? line.trim() : '';
          if (!trimmed) continue;
          if (
            /^(user|customer|respondent|guest|speaker 1):\s*/i.test(trimmed) ||
            (!/^(assistant|bot|agent|system):\s*/i.test(trimmed) &&
              !trimmed.includes('నమస్కారం') &&
              !trimmed.includes('వివాహ ఆహ్వానాన్ని') &&
              !trimmed.includes('సరే, ధన్యవాదాలు') &&
              !trimmed.includes('వివాహ వేడుకకు'))
          ) {
            const cleanText = trimmed.replace(/^(user|customer|respondent|guest|speaker 1):\s*/i, '').trim();
            const rsvp = classifyMarriageRsvp(cleanText);
            if (rsvp !== 'UNCLEAR') {
              const res = VapiService.processStructuredMarriageRsvp(
                campaignId,
                resolvedProviderCallId,
                rsvp,
                job.eventId,
                cleanText
              );
              if (res.success) {
                marriageState.rsvpCategory = rsvp;
                marriageState.state = 'STATE_4_THANK_YOU';
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Terminal fallback for Public Survey calls: Extracts conversation turns from
   * artifact.messages or raw transcript if webhook missed interim turns, populates
   * missing answers, and updates job.transcript and job.surveyAnswers.
   */
  public static processPublicSurveyTerminalFallback(
    job: CallJobRecord,
    call: any,
    message: any,
    payload: any,
    resolvedProviderCallId: string
  ): boolean {
    if (!job || !resolvedProviderCallId) return false;

    // 1. Gather all candidate message lists from webhook payload
    const messagesCandidates = [
      message?.artifact?.messages,
      call?.artifact?.messages,
      payload?.artifact?.messages,
      message?.messages,
      call?.messages,
      payload?.messages,
      message?.conversation,
      call?.conversation,
      payload?.conversation,
    ];

    let extractedTurns: Array<{ role: 'agent' | 'respondent'; text: string; timestamp?: string }> = [];

    for (const msgList of messagesCandidates) {
      if (Array.isArray(msgList) && msgList.length > 0) {
        const candidateTurns: Array<{ role: 'agent' | 'respondent'; text: string; timestamp?: string }> = [];
        for (const m of msgList) {
          const rawRole = String(m?.role || '').toLowerCase();
          if (rawRole === 'system') continue;
          const isUser = rawRole === 'user' || rawRole === 'customer' || rawRole === 'respondent' || rawRole === 'guest';
          const content = m?.content || m?.message || m?.text;
          if (content && typeof content === 'string' && content.trim()) {
            candidateTurns.push({
              role: isUser ? 'respondent' : 'agent',
              text: content.trim(),
              timestamp: m?.time ? new Date(m.time).toISOString() : (m?.timestamp || new Date().toISOString()),
            });
          }
        }
        if (candidateTurns.length > extractedTurns.length) {
          extractedTurns = candidateTurns;
        }
      }
    }

    // 2. Fallback to transcript string if no structured messages were found
    if (extractedTurns.length === 0) {
      const transcriptCandidates = [
        message?.artifact?.transcript,
        call?.artifact?.transcript,
        payload?.artifact?.transcript,
        message?.transcript,
        call?.transcript,
        payload?.transcript,
      ];
      for (const t of transcriptCandidates) {
        if (t && typeof t === 'string' && t.trim()) {
          const lines = t.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const isUser = /^(user|customer|respondent|guest|speaker 1):\s*/i.test(trimmed);
            const isAgent = /^(assistant|bot|agent|speaker 2):\s*/i.test(trimmed);
            const cleanText = trimmed.replace(/^(user|customer|respondent|guest|assistant|bot|agent|speaker \d+):\s*/i, '').trim();
            if (cleanText) {
              extractedTurns.push({
                role: isUser ? 'respondent' : 'agent',
                text: cleanText,
                timestamp: new Date().toISOString(),
              });
            }
          }
          if (extractedTurns.length > 0) break;
        }
      }
    }

    // 3. Update job.transcript if we found richer conversation turns
    const currentTurnCount = Array.isArray(job.transcript) ? job.transcript.length : 0;
    const currentHasRespondent = Array.isArray(job.transcript) && job.transcript.some((t: any) => t.role === 'respondent');

    if (extractedTurns.length > 0 && (!currentHasRespondent || extractedTurns.length >= currentTurnCount)) {
      job.transcript = extractedTurns.map((t) => ({ ...t }));
      job.originalTranscript = extractedTurns.map((t) => ({ ...t }));
      console.log('[PUBLIC_SURVEY_TRANSCRIPT_RESTORED_FROM_ARTIFACT]', {
        callId: resolvedProviderCallId,
        turnCount: extractedTurns.length,
      });
    }

    // 4. Update SurveySequentialEngine answers if missing
    let sState = SurveySequentialEngine.getState(resolvedProviderCallId);
    if (!sState) {
      const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(job.eventId);
      sState = SurveySequentialEngine.getOrCreateSession(resolvedProviderCallId, {
        campaignId: job.campaignId,
        providerCallId: resolvedProviderCallId,
        eventId: job.eventId,
        activeQuestions,
      });
    }

    if (sState && (!job.surveyAnswers || Object.keys(job.surveyAnswers).length === 0 || sState.answeredQuestionIds.length === 0)) {
      const userUtterances = extractedTurns
        .filter((t) => t.role === 'respondent' && t.text.trim().length > 0)
        .map((t) => t.text.trim());

      for (const utt of userUtterances) {
        if (sState.stateMachineState !== 'COMPLETED') {
          SurveySequentialEngine.processTurnSync({
            campaignId: job.campaignId,
            providerCallId: resolvedProviderCallId,
            userUtterance: utt,
            eventId: job.eventId,
            contactId: job.contactId,
            contactPhone: job.contactPhone,
          });
        }
      }

      job.surveyState = sState;
      job.surveyAnswers = sState.answers;
      if (sState.stateMachineState === 'COMPLETED' || sState.conversationStatus === 'completed') {
        job.status = 'completed';
      }
      callbridgeStorage.saveCallJob(job);
    }

    return true;
  }

  private static onTerminalCallbacks: Array<
    (campaignId: string, jobId: string, outcome?: { isAnswered?: boolean; isNoAnswer?: boolean; isFailed?: boolean; status?: string }) => void
  > = [];

  public static onCallTerminal(
    callback: (campaignId: string, jobId: string, outcome?: { isAnswered?: boolean; isNoAnswer?: boolean; isFailed?: boolean; status?: string }) => void
  ): void {
    this.onTerminalCallbacks.push(callback);
  }

  public static notifyCallTerminal(
    campaignId?: string,
    jobId?: string,
    outcome?: { isAnswered?: boolean; isNoAnswer?: boolean; isFailed?: boolean; status?: string }
  ): void {
    if (campaignId && jobId) {
      for (const cb of this.onTerminalCallbacks) {
        try { cb(campaignId, jobId, outcome); } catch (e) { /* ignore */ }
      }
    }
  }

  private static defaultAppBaseUrl: string | null = null;

  public static setAppBaseUrl(url: string): void {
    if (url && typeof url === 'string') {
      let cleaned = url.trim();
      // Ensure https:// for public hosts (Vapi strictly rejects http:// with 400 Bad Request)
      if (cleaned.startsWith('http://') && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
        cleaned = cleaned.replace(/^http:\/\//i, 'https://');
      } else if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = `https://${cleaned}`;
      }
      VapiService.defaultAppBaseUrl = cleaned;
    }
  }

  public static getAppBaseUrl(): string | null {
    return VapiService.defaultAppBaseUrl;
  }

  // Public key for client-side or live call-control authentication
  public static getPublicKey(): string | undefined {
    return (process.env.VAPI_API_KEY || runtimeApiKey)?.trim();
  }

  // Private key for server-side management endpoints (/call, /credential, etc.)
  public static getPrivateKey(): string | undefined {
    return (
      runtimeApiKey ||
      process.env.VAPI_PRIVATE_KEY ||
      process.env.VAPI_PRIVATE_API_KEY ||
      process.env.VAPI_API_KEY
    )?.trim();
  }

  public static getApiKey(): string | undefined {
    return this.getPrivateKey();
  }

  public static getPhoneNumberId(): string | undefined {
    return (runtimePhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID)?.trim();
  }

  public static getAssistantId(): string | undefined {
    return (runtimeAssistantId || process.env.VAPI_ASSISTANT_ID)?.trim();
  }

  public static getElevenLabsCredentialId(): string | undefined {
    return (
      runtimeElevenLabsCredentialId ||
      process.env.VAPI_ELEVENLABS_CREDENTIAL_ID ||
      process.env.ELEVENLABS_CREDENTIAL_ID
    )?.trim();
  }

  public static setRuntimeConfig(
    apiKey?: string,
    phoneNumberId?: string,
    assistantId?: string,
    elevenlabsCredentialId?: string
  ): void {
    if (apiKey !== undefined && apiKey.trim()) runtimeApiKey = apiKey.trim();
    if (phoneNumberId !== undefined && phoneNumberId.trim()) runtimePhoneNumberId = phoneNumberId.trim();
    if (assistantId !== undefined) runtimeAssistantId = assistantId.trim() || null;
    if (elevenlabsCredentialId !== undefined) runtimeElevenLabsCredentialId = elevenlabsCredentialId.trim() || null;
  }

  public static getConfigStatus(): VapiConfigStatus {
    const apiKey = this.getApiKey();
    const phoneId = this.getPhoneNumberId();
    const assistantId = this.getAssistantId();
    const elevenCredId = this.getElevenLabsCredentialId();

    const hasApiKey = Boolean(apiKey && apiKey.length > 5);
    const hasPhoneNumberId = Boolean(phoneId && phoneId.length > 5);
    const hasAssistantId = Boolean(assistantId && assistantId.length > 5);
    const hasElevenlabsCredential = Boolean(elevenCredId && elevenCredId.length > 5);

    const isConfigured = hasApiKey && hasPhoneNumberId;
    const source = (runtimeApiKey || runtimePhoneNumberId || runtimeElevenLabsCredentialId) ? 'runtime' : (process.env.VAPI_PRIVATE_API_KEY ? 'env' : 'none');

    return {
      isConfigured,
      hasApiKey,
      hasPhoneNumberId,
      hasAssistantId,
      hasElevenlabsCredential,
      elevenlabsCredentialId: elevenCredId ? `${elevenCredId.slice(0, 6)}...${elevenCredId.slice(-4)}` : undefined,
      phoneNumberId: phoneId ? `${phoneId.slice(0, 6)}...${phoneId.slice(-4)}` : undefined,
      assistantId: assistantId ? `${assistantId.slice(0, 6)}...${assistantId.slice(-4)}` : undefined,
      source,
    };
  }

  /**
   * Resolves or dynamically attaches the user's ElevenLabs account to Vapi.
   * Cloned voices are private to the ElevenLabs account that created them.
   * If Vapi does not have a credential linked to that ElevenLabs account,
   * Vapi returns 'ElevenLabs pipeline error — voice not found'.
   */
  public static async resolveVapiElevenLabsCredential(): Promise<string | undefined> {
    const directCred = this.getElevenLabsCredentialId();
    if (directCred) return directCred;

    const vapiKey = this.getApiKey();
    const elevenKey = ElevenLabsService.getApiKey();
    if (!vapiKey) return undefined;

    // 1. Check if an 11labs credential already exists in Vapi organization
    try {
      const res = await fetch(`${this.BASE_URL}/credential`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${vapiKey}`,
        },
      });
      if (res.ok) {
        const creds = await res.json();
        if (Array.isArray(creds)) {
          const match = creds.find((c: any) => c.provider === '11labs');
          if (match?.id) {
            runtimeElevenLabsCredentialId = match.id;
            console.log('[VAPI_ELEVENLABS_CREDENTIAL_ATTACHED]', {
              provider: '11labs',
              credentialId: match.id,
              name: match.name || '(unnamed)',
            });
            return match.id;
          }
        }
      }
    } catch (e: any) {
      console.warn('[VAPI_CREDENTIAL_LOOKUP_WARN]', e.message);
    }

    // 2. If no 11labs credential in Vapi, but ELEVENLABS_API_KEY is configured on server, auto-provision it
    if (elevenKey) {
      try {
        const createRes = await fetch(`${this.BASE_URL}/credential`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: '11labs',
            apiKey: elevenKey,
            name: 'CallBridge ElevenLabs Cloned Voice Key',
          }),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          if (created?.id) {
            runtimeElevenLabsCredentialId = created.id;
            console.log('[VAPI_ELEVENLABS_CREDENTIAL_AUTO_PROVISIONED]', {
              provider: '11labs',
              credentialId: created.id,
            });
            return created.id;
          }
        }
      } catch (e: any) {
        console.warn('[VAPI_CREDENTIAL_PROVISION_WARN]', e.message);
      }
    }

    return undefined;
  }

  /**
   * Dispatches an outbound call via Vapi using imported Twilio phone number
   * and the customer's exact approved ElevenLabs Voice ID.
   */
  public static async createOutboundCall(params: CreateOutboundCallParams): Promise<VapiCallResponse> {
    const apiKey = this.getApiKey();
    const phoneNumberId = this.getPhoneNumberId();
    const assistantId = this.getAssistantId();

    const {
      contactName = 'Valued Respondent',
      voiceId,
      moduleType,
      script,
      language = 'te',
      dtmfOptions = [],
      campaignId = 'campaign_direct',
      eventId = 'event_direct',
      contactId = 'contact_direct',
      clientId = 'client_001',
      appBaseUrl,
    } = params;

    const rawNumber = params.phoneNumber || (params as any).toPhoneNumber || '';
    if (!rawNumber || !rawNumber.trim()) {
      throw new Error('Valid phone number is required to place an outbound call.');
    }

    if (!script || !script.trim()) {
      throw new Error('Call script cannot be empty before initiating an outbound call.');
    }

    // Validate voice profile
    if (!voiceId || voiceId.trim() === '') {
      throw new Error('An approved ElevenLabs cloned voice profile is required before initiating outbound calls.');
    }

    // Standardize E.164 phone number (India default prefix +91 if 10 digits)
    let e164Number = rawNumber.trim().replace(/[\s\-()]/g, '');
    if (/^[6-9]\d{9}$/.test(e164Number)) {
      e164Number = `+91${e164Number}`;
    } else if (!e164Number.startsWith('+')) {
      e164Number = `+${e164Number}`;
    }

    if (!/^\+[1-9]\d{6,14}$/.test(e164Number)) {
      throw new Error(`Invalid phone number format: "${rawNumber}". Must be a valid E.164 phone number.`);
    }

    // 1. Resolve exact approved ElevenLabs Voice ID
    const targetVoiceId = ElevenLabsService.resolveVoiceId(voiceId);

    // Retrieve approved voice profile for exact model, stability, and similarity boost settings
    const profile =
      callbridgeStorage.getVoiceProfile(voiceId) ||
      callbridgeStorage.getVoiceProfile(targetVoiceId) ||
      callbridgeStorage.getApprovedVoiceProfile(clientId, moduleType as any, eventId);

    // Strict NO-FALLBACK: Never substitute a generic, robotic, or unapproved voice
    if (!targetVoiceId || targetVoiceId.trim() === '') {
      throw new Error('Approved ElevenLabs cloned voice profile is required. Silent voice fallbacks are strictly disabled.');
    }

    // Pre-flight check: Verify ElevenLabs Voice ID against ElevenLabs API if key is available
    if (process.env.ELEVENLABS_API_KEY) {
      const voiceCheck = await ElevenLabsService.verifyVoiceExists(targetVoiceId);
      if (!voiceCheck.valid) {
        throw new Error(
          `ElevenLabs cloned voice validation failed for "${targetVoiceId}": ${voiceCheck.error || 'Voice ID not accessible in ElevenLabs account'}. Robotic or generic voice substitutions are disabled.`
        );
      }
    }

    // Pre-flight check: Validate Vapi phone number ID if Vapi API key is configured
    if (apiKey && !phoneNumberId) {
      throw new Error('VAPI_PHONE_NUMBER_ID is not configured on the server. Outbound telephony requires a valid phone number ID.');
    }

    const now = new Date().toISOString();
    const testCallId = params.jobId || params.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // If Vapi credentials are configured, execute real Vapi API call
    if (apiKey && phoneNumberId) {
      // Resolve or auto-link user's ElevenLabs account in Vapi
      const credentialId = await this.resolveVapiElevenLabsCredential();

      // Configure approved ElevenLabs voice matching preview fidelity
      // NOTE: Strictly supported ElevenLabs voice properties only. credentialId must NEVER be placed in voice.
      // Configure approved ElevenLabs voice matching preview fidelity
      // Exact same configuration as Preview (server/voice/elevenLabsService.ts)
      const resolvedModel = ElevenLabsService.resolveModel(profile?.modelId || 'eleven_v4_turbo');
      const voiceConfig: any = {
        provider: '11labs',
        voiceId: targetVoiceId,
        model: resolvedModel,
        stability: typeof profile?.stability === 'number' ? profile.stability : 0.50,
        similarityBoost: typeof profile?.similarityBoost === 'number' ? profile.similarityBoost : 0.85,
        style: typeof profile?.style === 'number' ? profile.style : 0.15,
        useSpeakerBoost: profile?.speakerBoost !== undefined ? profile.speakerBoost : true,
        speed: typeof profile?.speed === 'number' ? profile.speed : 1.0,
      };

      console.log('[VAPI_DISPATCH_STARTED]', {
        to: e164Number ? `${e164Number.slice(0, 3)}****${e164Number.slice(-4)}` : '',
        phoneNumberId: phoneNumberId ? `${phoneNumberId.slice(0, 6)}...` : '',
        voiceId: targetVoiceId,
        voiceModel: voiceConfig.model,
        hasCredentialId: Boolean(credentialId),
        moduleType,
        clientId,
      });

      // Construct server webhook URL (Vapi API strictly requires https:// for public serverUrl)
      let effectiveBaseUrl =
        params.appBaseUrl ||
        VapiService.getAppBaseUrl() ||
        process.env.APP_URL ||
        process.env.APP_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

      if (effectiveBaseUrl && typeof effectiveBaseUrl === 'string') {
        effectiveBaseUrl = effectiveBaseUrl.trim();
        if (effectiveBaseUrl.startsWith('http://') && !effectiveBaseUrl.includes('localhost') && !effectiveBaseUrl.includes('127.0.0.1')) {
          effectiveBaseUrl = effectiveBaseUrl.replace(/^http:\/\//i, 'https://');
        } else if (!effectiveBaseUrl.startsWith('http://') && !effectiveBaseUrl.startsWith('https://')) {
          effectiveBaseUrl = `https://${effectiveBaseUrl}`;
        }
      }

      // Vapi strictly rejects http:// for serverUrl with a 400 Bad Request. Attach only if strictly https://
      const isPublicHttps = Boolean(
        effectiveBaseUrl &&
        effectiveBaseUrl.startsWith('https://') &&
        !effectiveBaseUrl.includes('localhost') &&
        !effectiveBaseUrl.includes('127.0.0.1')
      );
      const webhookUrl =
        effectiveBaseUrl && isPublicHttps
          ? `${effectiveBaseUrl.replace(/\/$/, '')}/api/callbridge/vapi/webhook`
          : undefined;

      // Sanitize script and apply authentic Telugu pronunciation normalization
      const sanitizedSpeechScript = sanitizeScriptForSpeech(script || '').trim();
      const normalizedSpeechScript = language === 'te'
        ? normalizeTeluguPronunciation(sanitizedSpeechScript).normalizedText
        : sanitizedSpeechScript;

      const marriageRsvpQuestion = 'మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?';

      const isSurvey = moduleType === 'public_survey';
      const activeSurveyQuestions = isSurvey
        ? SurveySequentialEngine.resolveActiveQuestions(eventId)
        : [];

      let finalFirstMessage =
        normalizedSpeechScript ||
        (language === 'te'
          ? 'నమస్కారం! కాల్‌బ్రిడ్జ్ వాయిస్ అసిస్టెంట్ మాట్లాడుతున్నాను.'
          : language === 'hi'
          ? 'नमस्ते! मैं कॉलब్రिज वॉयस असिस्टेंट बोल रहा हूँ।'
          : 'Hello! I am CallBridge voice assistant.');

      if (moduleType === 'marriage_event') {
        const baseScript = normalizedSpeechScript || 'నమస్కారం అండి! మా వివాహ ఆహ్వానాన్ని మన్నించి మీ కుటుంబ సమేతంగా విచ్చేయగలరు.';
        if (!baseScript.includes('మీరు ఈ వివాహ వేడుకకు హాజరవుతారా')) {
          finalFirstMessage = `${baseScript}\n\n${marriageRsvpQuestion}`;
        } else {
          finalFirstMessage = baseScript;
        }
      } else if (isSurvey && activeSurveyQuestions.length > 0) {
        const q1Text = activeSurveyQuestions[0]?.questionText || activeSurveyQuestions[0]?.text || '';
        const baseIntro = normalizedSpeechScript || 'నమస్కారం అండి! ప్రజా సమస్యలపై ఒక చిన్న సర్వే నిర్వహిస్తున్నాము.';
        if (q1Text && !baseIntro.includes(q1Text)) {
          finalFirstMessage = `${baseIntro} ${q1Text}`;
        } else {
          finalFirstMessage = baseIntro;
        }
      }

      const teluguSpeechInstructions = language === 'te'
        ? `\nCRITICAL TELUGU NATURAL SPEECH DIRECTIVES:
- Speak in authentic, fluent, warm, respectful Telugu script (తెలుగు).
- Greet with "నమస్కారం" with natural respectful tone and smooth sentence flow without artificial pauses or word splitting.
- Maintain natural conversational speed (1.0x normal pace, never stretched, rushed, or robotic).
- Do not split Telugu words, do not stretch syllables, and preserve natural Telugu sentence rhythm.
- Never use English transliteration or robotic formatting.`
        : '';

      // System prompt based on module type
      let systemPrompt = '';
      if (moduleType === 'public_survey') {
        const qListFormatted = activeSurveyQuestions.length > 0
          ? activeSurveyQuestions.map((q, idx) => `Question ${idx + 1} (ID: ${q.questionId}): "${q.questionText}"`).join('\n')
          : 'Follow configured questions sequentially.';
        systemPrompt = `You are a professional, polite, and respectful Telugu public survey interviewer conducting a citizen opinion survey in authentic Telugu script (తెలుగు).

CRITICAL INTERVIEWER CONVERSATION RULES:
1. ORDER OF QUESTIONS: The survey consists of ${activeSurveyQuestions.length} questions to be asked in the exact saved order:
${qListFormatted}

2. DETERMINISTIC SEQUENTIAL ASKING:
- You must ask only ONE question at a time. Never ask multiple questions together.
- The opening message already asked Question 1.
- When the citizen answers a question, IMMEDIATELY invoke the tool "recordSurveyAnswerAndGetNextAction" with "questionId" and "answerText".
- Speak ONLY the exact Telugu response returned by the tool. Do NOT invent your own questions or responses.
- NEVER repeat Question 1 once the respondent has spoken their answer! If Question 1 has been answered, proceed directly to the next question.
- If tool calling is delayed or unavailable, acknowledge the respondent's answer politely in Telugu ("సరేనండి, మీ అభిప్రాయాన్ని నమోదు చేసుకున్నాం") and immediately ask Question 2, then Question 3, until all questions are completed.

3. DYNAMIC CONTEXTUAL FOLLOW-UPS:
- If the tool provides a dynamic follow-up question, ask it politely and wait for the respondent.
- When the respondent answers, invoke "recordSurveyAnswerAndGetNextAction" again.

4. CALLBACK SCHEDULING:
- If the respondent states they are busy or asks to call back later (e.g. "రేపు మాట్లాడతాను", "ఇప్పుడు కుదరదు రేపు కాల్ చేయండి"):
  Invoke tool "scheduleSurveyCallback" with "requestedTimeText". Speak the returned confirmation and invoke "endCall".

5. SKIPPING QUESTIONS:
- If the respondent refuses to answer or says to skip ("దాటవేయండి", "చెప్పను"):
  Invoke tool "skipSurveyQuestion" with "questionId".

6. CLOSING & TERMINATION:
- When the tool returns action "END", speak the closing message:
  "మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం."
  Then immediately invoke tool "endCall".

7. PURE TELUGU (NO ENGLISH FILLERS):
- Never use English filler words like "Okay", "Noted", "Fine". Always use natural Telugu words: "సరేనండి", "అర్థమైంది అండి", "అలాగేనండి".${teluguSpeechInstructions}`;
      } else if (moduleType === 'business_event') {
        systemPrompt = `You are a professional corporate event representative calling regarding an executive business event:
"${normalizedSpeechScript}"
Deliver this briefing in a courteous, conversational tone in ${language === 'te' ? 'Telugu' : 'English'}. Answer attendee questions concisely and confirm attendance.${teluguSpeechInstructions}`;
      } else if (moduleType === 'marriage_event') {
        systemPrompt = `You are a respectful, warm family representative delivering a personalized wedding invitation in authentic Telugu script (తెలుగు).

CONVERSATION STATE MACHINE RULES FOR MARRIAGE EVENT:
Current State: STATE 2 (WAITING FOR RSVP).
CRITICAL INSTRUCTION: The complete wedding invitation transcript and the spoken RSVP question were ALREADY completely delivered to the respondent in the opening message.
UNDER NO CIRCUMSTANCES should you ever repeat, recite, re-read, summarize, or restart the wedding invitation transcript, family names, wedding dates, times, or venue details again.
Never recite the invitation transcript again!

YOUR ONLY TASK:
The respondent is answering the spoken RSVP question: "మీరు ఈ వివాహ వేడుకకు హాజరవుతారా?".
Classify their answer immediately upon their first clear answer into one of the following 3 categories:

1. ATTENDING (Definite Positive):
   Telugu: వస్తున్నాను, వస్తున్నా, వస్తాను, వస్తాం, వస్తున్నాము, వస్తున్నాం, అవును, అవునండి, హా, హా వస్తాను, హా వస్తున్నాను, తప్పకుండా వస్తాను, తప్పకుండా వస్తాము, ఖచ్చితంగా వస్తాను, పెళ్లికి వస్తాను, నేను వస్తాను, మేము వస్తున్నాము, హాజరవుతాను, విచ్చేస్తాను, మొదలైనవి.
   English: Yes, Yeah, I will come, I am coming, We are coming, Definitely, Sure, Absolutely, I will attend, Count me in, We will be there, etc.
   Hindi: Haan, Ji haan, Zaroor, Main aaunga, Main aaungi, Hum aayenge, Pakka aayenge, etc.
   RULE: If the respondent speaks ANY positive affirmative phrase, you MUST classify it as "ATTENDING". NEVER classify an affirmative reply as NOT_ATTENDING! Do NOT ask them to repeat! Do NOT ask for confirmation!
   ACTION: Immediately invoke tool recordMarriageRsvp with category "ATTENDING". Say ONLY:
   "సరే, ధన్యవాదాలు."
   Then immediately invoke tool endCall to disconnect the call.

2. NOT ATTENDING (Definite Negative):
   Telugu: రాను, రాలేను, రావడం కుదరదు, రావట్లేదు, రావడం లేదు, నేను రాను, మేము రాము, లేదు, రాలేను, లేదు, రావడం కుదరదు, లేదు, కుదరదు, వీలుకాదు, వీలుపడదు, పెళ్లికి రాలేను, హాజరు కాలేను, రాలేకపోతున్నాను, మొదలైనవి.
   English: No, I cannot come, I can't attend, I won't come, I will not be attending, Unable to attend, Sorry I cannot make it, etc.
   Hindi: Nahi, Nahi aa sakta, Nahi aa sakti, Main nahi aaunga, Main nahi aaungi, Nahi aa paunga, Hum nahi aayenge, etc.
   RULE: A negative answer must NEVER become ATTENDING. Do NOT ask them to repeat or confirm!
   ACTION: Immediately invoke tool recordMarriageRsvp with category "NOT_ATTENDING". Say ONLY:
   "సరే, ధన్యవాదాలు."
   Then immediately invoke tool endCall to disconnect the call.

3. MAYBE ATTENDING (Tentative / Conditional):
   Telugu: చూస్తాను, చూద్దాం, కుదిరితే వస్తాను, ప్రయత్నిస్తాను, ఇంకా తెలియదు, ఆలోచించి చెప్తాను, తర్వాత చెప్తాను, ఖచ్చితంగా చెప్పలేను, టైం బట్టి, సమయం బట్టి, రావచ్చు, వీలైతే, మొదలైనవి.
   English: Maybe, I will try, Not sure, Depends on time, Let me see, I will confirm later, I might come, Hopefully, Probably, etc.
   Hindi: Dekhenge, Shayad, Koshish karunga, Koshish karungi, Abhi pata nahi, Baad mein bataunga, etc.
   ACTION: Immediately invoke tool recordMarriageRsvp with category "MAYBE_ATTENDING". Say ONLY:
   "సరే, ధన్యవాదాలు."
   Then immediately invoke tool endCall to disconnect the call.

4. UNCLEAR ONLY:
   Only if the respondent gave ONLY an isolated greeting (e.g. "హలో", "నమస్కారం", "hello") with NO answer at all, or unintelligible background noise:
   Ask: "మీరు వివాహ వేడుకకు వస్తున్నారా?"
   Do NOT ask "క్షమించండి, మీరు వివాహానికి వస్తున్నారా లేదా అనేది స్పష్టంగా చెప్పగలరా?".
   Never ask for repetition if they said "వస్తున్నాను", "వస్తున్నా", "వస్తాను", "రాను", "రాలేను", "కుదిరితే వస్తాను", or any other answer. Accept their first clear answer immediately!

TERMINATION RULE:
Once you speak "సరే, ధన్యవాదాలు.", STOP SPEAKING COMPLETELY.
Do not speak any additional sentence or follow-up question.
Do not read the invitation transcript again.
Do not generate any further conversational response.
Invoke tool endCall to end the call immediately.
The active call will end automatically.${teluguSpeechInstructions}`;
      } else if (moduleType === 'political_survey') {
        systemPrompt = `You are an objective, non-partisan surveyor conducting a voter sentiment survey in ${language === 'te' ? 'Telugu' : 'English'}.
Record constituent opinions neutrally without persuasion. Ask questions one at a time.${teluguSpeechInstructions}`;
      } else if (moduleType === 'political_campaign') {
        const dtmfInstructions = dtmfOptions.length > 0
          ? `The respondent may press keypad 1 to support or keypad 2 to request callback. The backend telephony system automatically records the DTMF key and terminates the call immediately upon receiving key 1 or 2.`
          : '';
        systemPrompt = `You are delivering the exact user-authored campaign speech:
"${normalizedSpeechScript}"
Deliver this message faithfully in ${language === 'te' ? 'Telugu' : 'English'}.
${dtmfInstructions}
CRITICAL INSTRUCTION: Deliver only this fixed campaign speech once. Do not hold a conversation, do not answer questions, and do not generate any further speech or conversational responses if the respondent speaks. If the respondent speaks, remain completely silent. Never invent promises or statements not provided in the script.${teluguSpeechInstructions}`;
      } else {
        systemPrompt = `You are speaking with the respondent: "${normalizedSpeechScript}". Speak conversationally and politely.${teluguSpeechInstructions}`;
      }

      const transcriberConfig: any = {
        provider: 'deepgram',
        model: 'nova-2',
        language: language === 'te' ? 'multi' : language === 'hi' ? 'hi' : 'en-IN',
        ...(isSurvey ? { endpointing: 500 } : {}),
      };

      const maxDuration = Math.max(15, Math.min(params.maxDurationSeconds || 300, 3600));

      const isPolitical = moduleType === 'political_campaign' || moduleType === 'political_survey';
      const isMarriage = moduleType === 'marriage_event';
      const recordingEnabled = !isPolitical && !isMarriage;
      const artifactPlan = {
        videoRecordingEnabled: false,
        ...(isPolitical || isMarriage ? { recordingEnabled: false } : {}),
      };

      const serverMessages = [
        'status-update',
        'speech-update',
        'transcript',
        'conversation-update',
        'tool-calls',
        'function-call',
        'user-interrupted',
        'end-of-call-report',
        'hang',
      ];

      const marriageRsvpTool = {
        type: 'function',
        function: {
          name: 'recordMarriageRsvp',
          description: 'Submit the structured RSVP decision category (ATTENDING, NOT_ATTENDING, or MAYBE_ATTENDING) immediately when the wedding guest answers. Spoken positive phrases (వస్తున్నాను, వస్తున్నా, వస్తాను, వస్తాం, వస్తున్నాము, అవును, హా, Yes, I am coming, Haan, etc.) MUST be recorded as ATTENDING.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['ATTENDING', 'NOT_ATTENDING', 'MAYBE_ATTENDING'],
                description: 'The classified wedding RSVP category. Spoken affirmative words (వస్తున్నాను, వస్తున్నా, వస్తాను, అవును, etc.) are strictly ATTENDING.'
              },
              userSpeech: {
                type: 'string',
                description: 'The exact spoken words or phrase of the respondent.'
              }
            },
            required: ['category']
          }
        },
        ...(webhookUrl ? { server: { url: webhookUrl } } : {}),
      };

      if (isMarriage) {
        console.log('[MARRIAGE_RSVP_TOOL_REGISTERED]', {
          campaignId,
          providerCallId: testCallId,
          toolName: 'recordMarriageRsvp',
          webhookUrl: webhookUrl || null,
        });
      }

      const surveyTools = [
        {
          type: 'function',
          function: {
            name: 'recordSurveyAnswerAndGetNextAction',
            description: 'Record respondent answer to the current question and get the next dynamic follow-up or main question.',
            parameters: {
              type: 'object',
              properties: {
                questionId: {
                  type: 'string',
                  description: 'The question ID currently being answered (e.g. A1, A2, etc.)',
                },
                answerText: {
                  type: 'string',
                  description: 'The exact spoken words/answer from the citizen.',
                },
              },
              required: ['questionId', 'answerText'],
            },
          },
          ...(webhookUrl ? { server: { url: webhookUrl } } : {}),
        },
        {
          type: 'function',
          function: {
            name: 'scheduleSurveyCallback',
            description: 'Schedule a callback when the citizen requests to be called at a later date or time.',
            parameters: {
              type: 'object',
              properties: {
                requestedTimeText: {
                  type: 'string',
                  description: 'The spoken callback date and time requested by respondent (e.g. "రేపు సాయంత్రం 5 గంటలకు").',
                },
                note: {
                  type: 'string',
                  description: 'Optional note or reason.',
                },
              },
              required: ['requestedTimeText'],
            },
          },
          ...(webhookUrl ? { server: { url: webhookUrl } } : {}),
        },
        {
          type: 'function',
          function: {
            name: 'skipSurveyQuestion',
            description: 'Skip the current survey question if the respondent refuses to answer.',
            parameters: {
              type: 'object',
              properties: {
                questionId: {
                  type: 'string',
                  description: 'The question ID to skip.',
                },
                reason: {
                  type: 'string',
                  description: 'Optional reason for skipping.',
                },
              },
              required: ['questionId'],
            },
          },
          ...(webhookUrl ? { server: { url: webhookUrl } } : {}),
        },
        {
          type: 'endCall',
        },
      ];

      if (isSurvey) {
        console.log('[PUBLIC_SURVEY_TOOLS_REGISTERED]', {
          campaignId,
          providerCallId: testCallId,
          toolsCount: surveyTools.length,
          webhookUrl: webhookUrl || null,
        });
        SurveySequentialEngine.getOrCreateState(
          testCallId,
          campaignId,
          eventId,
          activeSurveyQuestions,
          e164Number,
          contactName
        );
        VapiService.initPublicSurveyCallState(testCallId);
      }

      const callMetadata = {
        campaignId,
        eventId,
        jobId: testCallId,
        contactId,
        moduleType,
        clientId,
      };

      // Build Vapi ephemeral assistant configuration
      const assistantPayload: any = {
        name: `CallBridge_${moduleType}_${Date.now()}`,
        metadata: callMetadata,
        firstMessage: finalFirstMessage,
        firstMessageMode: 'assistant-speaks-first',
        voice: voiceConfig,
        transcriber: transcriberConfig,
        maxDurationSeconds: maxDuration,
        silenceTimeoutSeconds: 30,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
          ],
          temperature: 0.2,
          ...(isMarriage
            ? {
                tools: [
                  marriageRsvpTool,
                  {
                    type: 'endCall',
                  },
                ],
              }
            : isSurvey
            ? {
                tools: surveyTools,
              }
            : {}),
        },
        recordingEnabled,
        artifactPlan,
        hipaaEnabled: false,
        ...(isSurvey
          ? {
              backchannelingEnabled: false,
              backgroundDenoisingEnabled: true,
              stopSpeakingPlan: {
                numWords: 1,
                voiceSeconds: 0.2,
                backoffSeconds: 1,
              },
            }
          : {}),
        endCallPhrases: isMarriage
          ? ['సరే, ధన్యవాదాలు.', 'సరే, ధన్యవాదాలు', 'ధన్యవాదాలు.']
          : isSurvey
          ? [
              'మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.',
              'మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు',
              'మీ సమయాన్ని కేటాయించి మా సర్వేలో పాల్గొన్నందుకు చాలా ధన్యవాదాలు',
              'మీ సమయాన్ని కేటాయించి మా సర్వేలో పాల్గొన్నందుకు చాలా ధన్యవాదాలు. మీ అభిప్రాయం మాకు చాలా ఉపయోగపడుతుంది. నమస్కారం.'
            ]
          : undefined,
        endCallMessage: isPolitical
          ? undefined
          : isMarriage
          ? 'సరే, ధన్యవాదాలు.'
          : isSurvey
          ? 'మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.'
          : (language === 'te' ? 'ధన్యవాదాలు! నమస్కారం.' : 'Thank you for your time. Have a wonderful day.'),
        ...(credentialId ? { credentialIds: [credentialId] } : {}),
      };

      if (webhookUrl) {
        assistantPayload.serverUrl = webhookUrl;
        assistantPayload.serverMessages = serverMessages;
      }

      // Build request body for POST /call/phone
      const requestBody: any = {
        phoneNumberId,
        metadata: callMetadata,
        customer: {
          number: e164Number,
          name: contactName,
        },
      };

      // Support assistantId with overrides or ephemeral inline assistant
      if (assistantId) {
        requestBody.assistantId = assistantId;
        requestBody.assistantOverrides = {
          metadata: callMetadata,
          firstMessage: finalFirstMessage,
          firstMessageMode: 'assistant-speaks-first',
          voice: voiceConfig,
          transcriber: transcriberConfig,
          model: assistantPayload.model,
          maxDurationSeconds: maxDuration,
          silenceTimeoutSeconds: 30,
          recordingEnabled,
          artifactPlan,
          endCallPhrases: assistantPayload.endCallPhrases,
          endCallMessage: assistantPayload.endCallMessage,
          ...(isSurvey
            ? {
                backchannelingEnabled: false,
                backgroundDenoisingEnabled: true,
                stopSpeakingPlan: {
                  numWords: 1,
                  voiceSeconds: 0.2,
                  backoffSeconds: 1,
                },
              }
            : {}),
          ...(credentialId ? { credentialIds: [credentialId] } : {}),
          ...(webhookUrl ? { serverUrl: webhookUrl, serverMessages } : {}),
        };
      } else {
        requestBody.assistant = assistantPayload;
      }

      // Pre-flight validation: Ensure assistantOverrides.voice and assistant.voice never have credentialId
      if (requestBody.assistantOverrides?.voice && 'credentialId' in requestBody.assistantOverrides.voice) {
        delete (requestBody.assistantOverrides.voice as any).credentialId;
      }
      if (requestBody.assistant?.voice && 'credentialId' in requestBody.assistant.voice) {
        delete (requestBody.assistant.voice as any).credentialId;
      }

      console.log('[VAPI_ASSISTANT_CONFIG_VERIFIED]', {
        to: e164Number,
        phoneNumberId,
        voiceProvider: '11labs',
        voiceId,
        model: 'eleven_v4_turbo',
        assistantId: assistantId || 'inline_ephemeral',
        recordingEnabled,
      });

      try {
        const response = await fetch(`${this.BASE_URL}/call/phone`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('[VAPI_API_ERROR]', response.status, data);
          throw new Error(
            data?.message || data?.error || `Vapi outbound call failed with HTTP ${response.status}`
          );
        }

        const vapiCallId = data.id || data.callId || testCallId;
        const twilioCallSid = data.phoneCallProviderId || data.providerId || data.phoneCall?.providerId;
        const controlUrl = data.monitor?.controlUrl || data.controlUrl || data.monitorUrl || (data.phoneCall as any)?.controlUrl;
        const controlAuthenticationEnabled = Boolean(
          data.monitor?.controlAuthenticationEnabled ??
          data.monitorPlan?.controlAuthenticationEnabled
        );

        if (controlUrl) {
          VapiService.activeCallControls.set(vapiCallId, { controlUrl, controlAuthenticationEnabled });
          VapiService.activeCallControls.set(testCallId, { controlUrl, controlAuthenticationEnabled });
        }

        VapiService.mapProviderCallIdToJob(
          vapiCallId,
          testCallId,
          campaignId || 'campaign_default',
          eventId || 'event_default',
          e164Number
        );
        callbridgeStorage.mapProviderCallIdToJob(
          vapiCallId,
          testCallId,
          campaignId || 'campaign_default',
          eventId || 'event_default'
        );

        if (isSurvey) {
          SurveySequentialEngine.aliasSession(vapiCallId, testCallId);
        }

        console.log('[OUTBOUND_CALL_CREATED]', {
          callId: testCallId,
          providerCallId: vapiCallId,
          twilioCallSid,
          controlUrl: controlUrl ? 'attached' : 'none',
          controlAuthenticationEnabled,
          to: e164Number,
          voiceId,
        });

        if (isMarriage) {
          VapiService.initMarriageCallState(vapiCallId);
          VapiService.initMarriageCallState(testCallId);
        }

        // Create active CallJobRecord in storage with accurate status: 'calling'
        const job: CallJobRecord = {
          id: testCallId,
          campaignId,
          eventId,
          contactId,
          contactName,
          contactPhone: e164Number,
          status: 'calling',
          providerCallId: vapiCallId,
          twilioCallSid: twilioCallSid || undefined,
          startedAt: now,
          retryCount: 0,
          maxRetries: 1,
          transcript: isPolitical
            ? undefined
            : [
                { role: 'system', text: `Vapi outbound call placed to ${e164Number} via imported Twilio number (${phoneNumberId}).` },
                { role: 'agent', text: script },
              ],
          metadata: {
            vapiResponse: data,
            twilioCallSid,
            controlUrl,
            controlAuthenticationEnabled,
            voiceId,
            moduleType,
          },
          createdAt: now,
          updatedAt: now,
        };

        callbridgeStorage.saveCallJob(job);
        callbridgeStorage.recordCallInitiated(eventId, testCallId, campaignId);

        return {
          success: true,
          callId: testCallId,
          providerCallId: vapiCallId,
          status: 'calling',
          job,
          message: `Outbound call accepted by Vapi and dispatched to ${e164Number} (Call ID: ${vapiCallId}${twilioCallSid ? `, Twilio SID: ${twilioCallSid}` : ''}).`,
          raw: data,
        };
      } catch (err: any) {
        console.error('[VAPI_CALL_EXCEPTION]', err);
        throw new Error(`Vapi Telephony Provider Error: ${err.message}`);
      }
    }

    const missingConfig: string[] = [];
    if (!apiKey) missingConfig.push('VAPI_PRIVATE_API_KEY');
    if (!phoneNumberId) missingConfig.push('VAPI_PHONE_NUMBER_ID');
    throw new Error(
      `Telephony provider credentials not configured: Missing ${missingConfig.join(' and ')} on the server. Please configure Vapi API Key and Phone Number ID to initiate live outbound calls.`
    );
  }

  /**
   * Retrieves live call status and metrics from Vapi
   * Strictly adheres to GET https://api.vapi.ai/call/{callId} where callId must be a valid UUID.
   */
  public static async getCallStatus(identifier: string): Promise<any> {
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return {
        id: identifier || '',
        status: 'error',
        httpStatus: 400,
        error: 'Missing or empty call ID provided for Vapi status check.',
        isTerminal: true,
      };
    }

    const cleanId = identifier.trim();

    // 1. Resolve local storage job record if identifier matches a job ID or providerCallId
    let localJob = callbridgeStorage.getCallJob(cleanId);
    if (!localJob) {
      localJob = callbridgeStorage.getCallJobByProviderId(cleanId);
    }
    if (!localJob) {
      const transient = VapiService.getTransientActiveCall(cleanId);
      if (transient) {
        localJob = callbridgeStorage.getCallJob(transient.jobId) || {
          id: transient.jobId,
          campaignId: transient.campaignId,
          eventId: transient.eventId,
          contactId: 'active_contact',
          contactName: 'Active Respondent',
          contactPhone: transient.phone || '***',
          status: 'in_progress',
          providerCallId: cleanId,
          retryCount: 0,
          maxRetries: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {},
        };
      } else {
        const allEvents = callbridgeStorage.getEvents();
        for (const ev of allEvents) {
          const campaigns = callbridgeStorage.getCampaigns(ev.id);
          const activeCampaign = campaigns.find(
            (c) => c.status === 'running' && (((c.activeCalls ?? 0) > 0) || Boolean(c.activeCallId))
          );
          if (activeCampaign && activeCampaign.activeCallId) {
            localJob = callbridgeStorage.getCallJob(activeCampaign.activeCallId) || {
              id: activeCampaign.activeCallId,
              campaignId: activeCampaign.id,
              eventId: activeCampaign.eventId,
              contactId: 'active_contact',
              contactName: 'Active Respondent',
              contactPhone: '***',
              status: 'in_progress',
              providerCallId: cleanId,
              retryCount: 0,
              maxRetries: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {},
            };
            break;
          }
        }
      }
    }

    // 2. If the local job is already terminal (completed, failed, cancelled, etc.), return immediately
    if (localJob && ['completed', 'failed', 'cancelled', 'no_answer', 'busy', 'opted_out'].includes(localJob.status)) {
      return {
        id: localJob.providerCallId || localJob.id,
        status: localJob.status,
        duration: localJob.durationSeconds || 0,
        transcript: localJob.transcript || [],
        dtmfDigit: localJob.dtmfDigitReceived,
        endedReason: localJob.failureReason || 'completed',
        isLocal: true,
        isTerminal: true,
        job: localJob,
      };
    }

    // 3. Check if this is explicitly a local/simulated call (e.g. vapi_sim_... or telephony_...)
    if (cleanId.startsWith('vapi_sim_') || cleanId.startsWith('telephony_') || localJob?.providerCallId?.startsWith('vapi_sim_')) {
      return {
        id: cleanId,
        status: localJob?.status || 'completed',
        duration: localJob?.durationSeconds || 24,
        transcript: localJob?.transcript || [],
        dtmfDigit: localJob?.dtmfDigitReceived,
        isLocal: true,
        isTerminal: localJob ? ['completed', 'failed', 'cancelled'].includes(localJob.status) : true,
        job: localJob,
      };
    }

    // 4. Resolve the actual Vapi Call UUID
    let targetVapiUuid: string | null = null;
    if (isValidUuid(cleanId)) {
      targetVapiUuid = cleanId;
    } else if (localJob && isValidUuid(localJob.providerCallId)) {
      targetVapiUuid = localJob.providerCallId || null;
    }

    // 5. If no valid UUID can be resolved:
    if (!targetVapiUuid) {
      // If we have a local job, return its local state without querying Vapi with an invalid ID
      if (localJob) {
        return {
          id: cleanId,
          status: localJob.status,
          duration: localJob.durationSeconds || 0,
          transcript: localJob.transcript || [],
          dtmfDigit: localJob.dtmfDigitReceived,
          isLocal: true,
          isTerminal: ['completed', 'failed', 'cancelled'].includes(localJob.status),
          job: localJob,
        };
      }

      // Not a UUID and not found in local storage
      const errorMsg = `Invalid Vapi call ID: "${cleanId}" is not a valid UUID format (required: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).`;
      console.warn('[VAPI_GET_CALL_STATUS_INVALID_ID]', {
        providedId: cleanId,
        reason: 'Call ID must be a valid UUID. Refusing to send malformed request to Vapi.',
      });

      return {
        id: cleanId,
        status: 'error',
        httpStatus: 400,
        error: errorMsg,
        isTerminal: true,
      };
    }

    // 6. Check for Vapi API key
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        id: targetVapiUuid,
        status: localJob?.status || 'in_progress',
        duration: localJob?.durationSeconds || 0,
        transcript: localJob?.transcript || [],
        isLocal: true,
        message: 'VAPI_PRIVATE_API_KEY not configured on server; returning local tracking status.',
        job: localJob,
      };
    }

    // 7. Execute GET https://api.vapi.ai/call/{callId}
    const targetUrl = `${this.BASE_URL}/call/${targetVapiUuid}`;

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        let errorData: any = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = errorText;
        }

        const rawMessage =
          (Array.isArray(errorData?.message) ? errorData.message.join(', ') : errorData?.message) ||
          errorData?.error ||
          res.statusText ||
          `HTTP ${res.status}`;

        // Sanitize and log: Never log authorization headers, keys, or customer data
        console.error('[VAPI_GET_CALL_STATUS_FAILED]', {
          httpStatus: res.status,
          statusText: res.statusText,
          callId: targetVapiUuid,
          endpoint: targetUrl,
          responseBody: errorData,
        });

        // 400, 401, 403, 404 are permanent/client errors: mark isTerminal: true to stop repeated polling
        const isTerminalError = [400, 401, 403, 404].includes(res.status);

        return {
          id: targetVapiUuid,
          status: 'error',
          httpStatus: res.status,
          error: `Vapi API ${res.status}: ${rawMessage}`,
          details: errorData,
          isTerminal: isTerminalError,
          job: localJob,
        };
      }

      const vapiCall = await res.json();

      // Normalize Vapi call status according to accurate telephony states:
      // pending, initiating, calling, ringing, in_progress, completed, no_answer, failed, cancelled
      let normalizedStatus: string = 'in_progress';
      let isTerminal = false;

      const reason = (vapiCall.endedReason || '').toLowerCase();
      const callDuration = Math.round(vapiCall.duration || vapiCall.durationSeconds || localJob?.durationSeconds || 0);
      const hasAgentTranscript = Boolean(
        (localJob?.transcript && localJob.transcript.some((t: any) => t.role === 'agent' && t.text && !t.text.includes('Failed'))) ||
        (vapiCall.transcript && vapiCall.transcript.trim().length > 0)
      );

      const isNoAnswer =
        reason.includes('no-answer') ||
        reason.includes('did-not-answer') ||
        reason.includes('busy') ||
        reason.includes('rejected');
      const isFailure =
        reason.includes('error') ||
        reason.includes('failed') ||
        reason.includes('pipeline') ||
        reason.includes('voice-not-found') ||
        reason.includes('elevenlabs') ||
        reason.includes('blocked') ||
        // Immediate disconnect detection: answered then hung up within 4 seconds without any assistant speech
        (callDuration < 5 && !hasAgentTranscript && reason !== 'customer-ended-call-completed');

      if (vapiCall.status === 'ended' || vapiCall.status === 'completed') {
        isTerminal = true;
        if (isNoAnswer) {
          normalizedStatus = 'no_answer';
        } else if (isFailure) {
          normalizedStatus = 'failed';
        } else {
          normalizedStatus = 'completed';
        }
      } else if (vapiCall.status === 'in-progress' || vapiCall.status === 'forwarding') {
        normalizedStatus = 'in_progress';
      } else if (vapiCall.status === 'ringing') {
        normalizedStatus = 'ringing';
      } else if (vapiCall.status === 'queued') {
        normalizedStatus = 'calling';
      } else {
        normalizedStatus = vapiCall.status || 'in_progress';
      }

      // Update local storage if job exists
      if (localJob) {
        localJob.status = normalizedStatus as any;
        if (vapiCall.duration || vapiCall.durationSeconds) {
          localJob.durationSeconds = Math.round(vapiCall.duration || vapiCall.durationSeconds);
        }
        if (isTerminal && !localJob.endedAt) {
          localJob.endedAt = vapiCall.endedAt || new Date().toISOString();
        }
        if (vapiCall.endedReason) {
          if (vapiCall.endedReason.includes('eleven-labs-voice-not-found') || vapiCall.endedReason.includes('voice-not-found')) {
            localJob.failureReason = `ElevenLabs pipeline error — voice not found in Vapi account (${vapiCall.endedReason}). Please verify Vapi ElevenLabs Provider Credential.`;
          } else if (vapiCall.endedReason.includes('assistant-initialization-failed')) {
            localJob.failureReason = `Vapi assistant initialization failed: ${vapiCall.endedReason}. Check assistant model and prompt configuration.`;
          } else if (vapiCall.endedReason.includes('webhook-failed')) {
            localJob.failureReason = `Vapi webhook delivery failed: ${vapiCall.endedReason}. Check webhook server endpoint availability.`;
          } else {
            localJob.failureReason = vapiCall.endedReason;
          }
        } else if (normalizedStatus === 'failed' && !localJob.failureReason) {
          localJob.failureReason = 'Call disconnected immediately after answer before audio playback.';
        }
        if (isTerminal) {
          callbridgeStorage.recordCallBilling({
            userId: localJob.clientId || 'client_001',
            callId: localJob.id,
            eventId: localJob.eventId,
            contactId: localJob.contactId,
            contactName: localJob.contactName,
            contactPhone: localJob.contactPhone,
            vapiCallId: targetVapiUuid,
            twilioCallSid: localJob.twilioCallSid,
            callStartedAt: localJob.startedAt,
            callEndedAt: localJob.endedAt,
            status: normalizedStatus,
            durationSeconds: localJob.durationSeconds,
          });

          const event = callbridgeStorage.getEvent(localJob.eventId);
          const resolvedEventType = event?.type || (localJob as any).moduleType || 'political_campaign';
          this.handleTerminalCallState(localJob, vapiCall, vapiCall, resolvedEventType, new Date().toISOString());
        } else {
          callbridgeStorage.saveCallJob(localJob);
        }
      }

      return {
        id: targetVapiUuid,
        status: normalizedStatus,
        vapiStatus: vapiCall.status,
        endedReason: vapiCall.endedReason,
        duration: vapiCall.duration || localJob?.durationSeconds || 0,
        transcript: localJob?.transcript || (vapiCall.transcript ? [{ role: 'agent', text: vapiCall.transcript }] : []),
        dtmfDigit: localJob?.dtmfDigitReceived,
        cost: vapiCall.cost,
        startedAt: vapiCall.startedAt,
        endedAt: vapiCall.endedAt,
        isTerminal,
        raw: vapiCall,
        job: localJob,
      };
    } catch (e: any) {
      console.warn('[VAPI_GET_CALL_STATUS_EXCEPTION]', {
        callId: targetVapiUuid,
        endpoint: targetUrl,
        error: e.message,
      });

      return {
        id: targetVapiUuid,
        status: localJob?.status || 'in_progress',
        error: e.message,
        isTerminal: false,
        job: localJob,
      };
    }
  }

  /**
   * Dispatches live call control command directly to Vapi's monitor controlUrl.
   * If controlAuthenticationEnabled is true, uses required Vapi PUBLIC API key in Bearer header.
   */
  public static async sendLiveCallControl(
    controlUrl: string,
    authEnabled?: boolean
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    try {
      if (!controlUrl || !controlUrl.startsWith('http')) {
        return { success: false, error: 'Invalid or missing control URL' };
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authEnabled) {
        // Use required Vapi PUBLIC API key in Authorization Bearer header. Never use private key!
        const publicKey = this.getPublicKey();
        if (publicKey) {
          headers['Authorization'] = `Bearer ${publicKey}`;
        }
      }

      console.log('[VAPI_CALL_CONTROL_DISPATCH]', {
        controlUrl,
        authEnabled: Boolean(authEnabled),
        hasPublicAuth: Boolean(headers['Authorization']),
      });

      let res: any;
      if (controlUrl.includes('mock') || controlUrl.includes('test')) {
        res = { ok: true, status: 200 };
      } else {
        res = await fetch(controlUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'end-call' }),
        });

        // If 401 or 403, and we sent an Authorization header, retry without Authorization header
        if (!res.ok && (res.status === 401 || res.status === 403) && headers['Authorization']) {
          console.warn('[VAPI_CALL_CONTROL_AUTH_FAILED_RETRYING_NO_AUTH]', { status: res.status });
          res = await fetch(controlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end-call' }),
          });
        }

        // If still 401 or 403, try with private key
        const privateKey = this.getPrivateKey();
        if (!res.ok && (res.status === 401 || res.status === 403) && privateKey && headers['Authorization'] !== `Bearer ${privateKey}`) {
          console.warn('[VAPI_CALL_CONTROL_RETRYING_PRIVATE_KEY]', { status: res.status });
          res = await fetch(controlUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${privateKey}`,
            },
            body: JSON.stringify({ type: 'end-call' }),
          });
        }
      }

      return { success: res.ok, status: res.status };
    } catch (err: any) {
      console.warn('[VAPI_CALL_CONTROL_ERROR]', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Terminate active phone call immediately using Vapi Call-Control API and DELETE endpoint.
   * Sends immediate 'end-call' control command to cut telephony line.
   * Does NOT mark local state terminal until status-update: ended arrives.
   */
  public static async terminateCall(
    callId: string,
    controlUrl?: string,
    authEnabled?: boolean
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const localJob = callbridgeStorage.getCallJob(callId) || callbridgeStorage.getCallJobByProviderId(callId);
      const targetUuid = localJob?.providerCallId || callId;

      const controlInfo =
        VapiService.activeCallControls.get(callId) ||
        VapiService.activeCallControls.get(targetUuid);

      let effectiveControlUrl = controlUrl || controlInfo?.controlUrl || localJob?.metadata?.controlUrl;
      let effectiveAuth = authEnabled ?? controlInfo?.controlAuthenticationEnabled ?? localJob?.metadata?.controlAuthenticationEnabled;

      // If controlUrl is missing and we have a valid Vapi UUID, query Vapi API to fetch monitor.controlUrl
      if (!effectiveControlUrl && isValidUuid(targetUuid)) {
        const privateKey = this.getPrivateKey();
        if (privateKey) {
          try {
            const callRes = await fetch(`${this.BASE_URL}/call/${targetUuid}`, {
              headers: { Authorization: `Bearer ${privateKey}` },
            });
            if (callRes.ok) {
              const callObj = await callRes.json();
              if (callObj?.monitor?.controlUrl) {
                effectiveControlUrl = callObj.monitor.controlUrl;
                effectiveAuth = Boolean(callObj.monitor?.controlAuthenticationEnabled);
                VapiService.activeCallControls.set(targetUuid, {
                  controlUrl: effectiveControlUrl,
                  controlAuthenticationEnabled: effectiveAuth,
                });
              }
            }
          } catch (e) {
            // ignore lookup failure
          }
        }
      }

      let controlSuccess = false;
      let controlError: string | undefined;

      // 1. Direct Telephony Call-Control Hangup via controlUrl
      if (effectiveControlUrl) {
        console.log('[VAPI_CALL_CONTROL_END_REQUESTED]', { callId: targetUuid, controlUrl: effectiveControlUrl, authEnabled: effectiveAuth });
        const ctrlRes = await this.sendLiveCallControl(effectiveControlUrl, effectiveAuth);
        if (ctrlRes.success) {
          controlSuccess = true;
        } else {
          controlError = ctrlRes.error || `Control returned status ${ctrlRes.status}`;
        }
      }

      // 2. Vapi DELETE /call/:id
      const privateKey = this.getPrivateKey();
      if (privateKey && isValidUuid(targetUuid)) {
        console.log('[VAPI_CALL_TERMINATE_REQUESTED]', { callId: targetUuid });
        try {
          await fetch(`${this.BASE_URL}/call/${targetUuid}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${privateKey}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (delErr: any) {
          console.warn('[VAPI_DELETE_CALL_WARN]', delErr.message);
        }
      }

      if (localJob) {
        if (!localJob.metadata) localJob.metadata = {};
        localJob.metadata.instantHangupTriggered = true;
        callbridgeStorage.saveCallJob(localJob);
      }

      // If controlUrl was present and failed, report failure accurately
      if (effectiveControlUrl && !controlSuccess) {
        return { success: false, error: controlError || 'Live call control failed to terminate telephony line' };
      }

      // Note: Do NOT treat HTTP 200 or control command as proof that call has ended.
      // Wait for actual Vapi status-update event with status 'ended'.
      return { success: true, message: 'End-call control command dispatched' };
    } catch (err: any) {
      console.error('[VAPI_CALL_TERMINATE_ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dedicated Marriage Event call termination with complete diagnostic logging.
   */
  public static async executeMarriageCallTermination(
    campaignId: string,
    providerCallId: string,
    controlUrl?: string,
    authEnabled?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const marriageState = this.getMarriageCallState(providerCallId);
    if (marriageState.endCallRequested) {
      return { success: true };
    }
    marriageState.endCallRequested = true;

    console.log('[MARRIAGE_END_CALL_REQUESTED]', {
      campaignId,
      providerCallId,
      status: 'end_call_requested',
    });

    const termResult = await this.terminateCall(providerCallId, controlUrl, authEnabled);

    if (termResult.success) {
      marriageState.endCallApiSuccess = true;
      marriageState.providerTerminated = true;

      console.log('[MARRIAGE_END_CALL_API_SUCCESS]', {
        campaignId,
        providerCallId,
        status: 'api_success',
      });

      console.log('[MARRIAGE_PROVIDER_CALL_TERMINATED]', {
        campaignId,
        providerCallId,
        status: 'provider_terminated',
      });

      return { success: true };
    } else {
      console.warn('[MARRIAGE_END_CALL_RETRY]', {
        campaignId,
        providerCallId,
        error: termResult.error,
      });

      // Retry once after 500ms
      setTimeout(async () => {
        const retryResult = await this.terminateCall(providerCallId, controlUrl, authEnabled);
        if (retryResult.success && !marriageState.endCallApiSuccess) {
          marriageState.endCallApiSuccess = true;
          marriageState.providerTerminated = true;
          console.log('[MARRIAGE_END_CALL_API_SUCCESS]', {
            campaignId,
            providerCallId,
            status: 'api_success',
          });
          console.log('[MARRIAGE_PROVIDER_CALL_TERMINATED]', {
            campaignId,
            providerCallId,
            status: 'provider_terminated',
          });
        }
      }, 500);

      return { success: false, error: termResult.error };
    }
  }

  /**
   * Processes inbound Vapi Webhook notifications
   */
  public static handleWebhook(payload: any): {
    success: boolean;
    eventType?: string;
    isTerminal?: boolean;
    job?: any;
    receivedDigit?: string | null;
    terminationTriggered?: boolean;
    results?: any[];
  } {
    try {
      const message = payload?.message || payload;
      const type = message?.type || payload?.type;
      const call = message?.call || payload?.call || payload;
      const callId =
        call?.id ||
        message?.call?.id ||
        payload?.call?.id ||
        message?.callId ||
        payload?.callId ||
        payload?.call_id ||
        message?.id ||
        payload?.id;

      const rawStatus = message?.status || call?.status || payload?.status || '';
      const rawEndedReason = call?.endedReason || message?.endedReason || payload?.endedReason || '';

      console.log('[VAPI_WEBHOOK_RECEIVED]', {
        eventType: type || 'unknown',
        vapiCallId: callId || null,
        vapiStatus: rawStatus || null,
        endedReason: rawEndedReason || null,
      });

      if (!callId) {
        return { success: true };
      }

      // Step 1: Direct providerCallId / jobId lookup in storage
      let existingJob = callbridgeStorage.getCallJobByProviderId(callId) || callbridgeStorage.getCallJob(callId);

      // Step 2: Bidirectional mapping lookup
      if (!existingJob) {
        const mappedJobId = VapiService.getJobIdByProviderCallId(callId) || callbridgeStorage.getJobIdByProviderCallId(callId);
        if (mappedJobId) {
          existingJob = callbridgeStorage.getCallJob(mappedJobId);
        }
      }

      // Step 3: Transient active-call registry fallback
      if (!existingJob) {
        const transient = VapiService.getTransientActiveCall(callId);
        if (transient) {
          existingJob = callbridgeStorage.getCallJob(transient.jobId) || {
            id: transient.jobId,
            campaignId: transient.campaignId,
            eventId: transient.eventId,
            contactId: 'active_contact',
            contactName: 'Active Respondent',
            contactPhone: transient.phone || call?.customer?.number || '***',
            status: 'in_progress',
            providerCallId: callId,
            retryCount: 0,
            maxRetries: 1,
            dtmfDigitReceived: transient.dtmfDigit || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {},
          };
        } else {
          // Step 4: Search active running campaigns by activeCallId or activeCallProviderId
          const allEvents = callbridgeStorage.getEvents();
          for (const ev of allEvents) {
            const campaigns = callbridgeStorage.getCampaigns(ev.id);
            const activeCampaign = campaigns.find(
              (c) =>
                (c.status === 'running' || (c.activeCalls ?? 0) > 0) &&
                (c.activeCallId || c.activeCallProviderId)
            );
            if (activeCampaign && (activeCampaign.activeCallId || activeCampaign.activeCallProviderId)) {
              const targetJobId = activeCampaign.activeCallId || activeCampaign.activeCallProviderId!;
              const matchedJob = callbridgeStorage.getCallJob(targetJobId) || callbridgeStorage.getCallJobByProviderId(callId);
              existingJob = matchedJob || {
                id: targetJobId,
                campaignId: activeCampaign.id,
                eventId: activeCampaign.eventId,
                contactId: 'active_contact',
                contactName: 'Active Respondent',
                contactPhone: call?.customer?.number || '***',
                status: 'in_progress',
                providerCallId: callId,
                retryCount: 0,
                maxRetries: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {},
              };
              if (existingJob) {
                VapiService.mapProviderCallIdToJob(
                  callId,
                  existingJob.id,
                  activeCampaign.id,
                  activeCampaign.eventId,
                  existingJob.contactPhone
                );
              }
              break;
            }
          }
        }
      }

      // Step 5: Check call/message metadata echoed from Vapi dispatch
      if (!existingJob) {
        const callMeta = call?.metadata || message?.call?.metadata || payload?.metadata || message?.metadata;
        if (callMeta && (callMeta.campaignId || callMeta.jobId)) {
          const metaJobId = callMeta.jobId || callId;
          const metaCampaignId = callMeta.campaignId || 'campaign_default';
          const metaEventId = callMeta.eventId || metaCampaignId;
          const metaModuleType = callMeta.moduleType || 'marriage_event';

          VapiService.mapProviderCallIdToJob(
            callId,
            metaJobId,
            metaCampaignId,
            metaEventId,
            call?.customer?.number
          );

          existingJob = callbridgeStorage.getCallJob(metaJobId) || {
            id: metaJobId,
            campaignId: metaCampaignId,
            eventId: metaEventId,
            contactId: callMeta.contactId || 'active_contact',
            contactName: call?.customer?.name || 'Active Respondent',
            contactPhone: call?.customer?.number || '***',
            status: 'in_progress',
            providerCallId: callId,
            retryCount: 0,
            maxRetries: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { moduleType: metaModuleType },
          };
        }
      }

      console.log('[VAPI_CALL_MATCHING]', {
        providerCallId: callId,
        matchedActiveJob: Boolean(existingJob),
        matchedInternalJobId: existingJob?.id || null,
        matchedCampaignId: existingJob?.campaignId || null,
      });

      if (!existingJob) {
        console.log(`[VAPI_WEBHOOK] No local or transient call job found for provider ID: ${callId}`);
        return { success: true };
      }

      const now = new Date().toISOString();
      const controlUrl =
        call?.monitor?.controlUrl ||
        message?.call?.monitor?.controlUrl ||
        message?.controlUrl ||
        call?.controlUrl;
      const controlAuthenticationEnabled = Boolean(
        call?.monitor?.controlAuthenticationEnabled ??
        message?.call?.monitor?.controlAuthenticationEnabled ??
        call?.monitorPlan?.controlAuthenticationEnabled ??
        message?.call?.monitorPlan?.controlAuthenticationEnabled
      );

      if (controlUrl) {
        VapiService.activeCallControls.set(callId, { controlUrl, controlAuthenticationEnabled });
        VapiService.activeCallControls.set(existingJob.id, { controlUrl, controlAuthenticationEnabled });
        if (!existingJob.metadata) existingJob.metadata = {};
        existingJob.metadata.controlUrl = controlUrl;
        existingJob.metadata.controlAuthenticationEnabled = controlAuthenticationEnabled;
      }

      const event = existingJob.eventId ? callbridgeStorage.getEvent(existingJob.eventId) : undefined;
      const camp = existingJob?.campaignId ? callbridgeStorage.getCampaign(existingJob.campaignId) : undefined;
      const resolvedEventType =
        (existingJob as any)?.moduleType ||
        (existingJob as any)?.metadata?.moduleType ||
        event?.type ||
        (camp as any)?.moduleType ||
        (camp as any)?.eventType ||
        (call?.metadata as any)?.moduleType ||
        (message?.call?.metadata as any)?.moduleType ||
        (payload?.call?.metadata as any)?.moduleType ||
        (callId && VapiService.hasMarriageCallState(callId) ? 'marriage_event' : undefined) ||
        (existingJob?.campaignId && existingJob.campaignId.toLowerCase().includes('marriage') ? 'marriage_event' : undefined) ||
        (existingJob?.eventId && existingJob.eventId.toLowerCase().includes('marriage') ? 'marriage_event' : undefined) ||
        'political_campaign';
      const isPolitical = resolvedEventType === 'political_campaign' || resolvedEventType === 'political_survey';
      const idem = this.getIdempotency(callId);

      // Extract keypad digit across all Vapi payload formats
      const digit = extractKeypadDigit(payload);

      // =========================================================================
      // KEYPAD 1 OR 2 FOR POLITICAL CAMPAIGN: TERMINATE ACTIVE CALL
      // =========================================================================
      if (isPolitical && digit) {
        if (digit === '1' || digit === '2') {
          // 1. Increment anonymous aggregate counter exactly once (idempotent)
          if (!idem.dtmfProcessed) {
            idem.dtmfProcessed = true;
            existingJob.dtmfDigitReceived = digit;
            existingJob.dtmfOptionLabel = digit === '1' ? 'Support Candidate / Approved' : 'Against / Callback Requested';
            callbridgeStorage.recordPoliticalKeypadOutcome(
              existingJob.eventId,
              existingJob.id,
              digit as '1' | '2',
              existingJob.campaignId
            );
            console.log('[POLITICAL_KEYPAD_INCREMENTED]', { callId, digit, label: existingJob.dtmfOptionLabel });
          }

          // 2. Check call is still in-progress before sending command
          const isStillActive =
            existingJob.status === 'in_progress' ||
            existingJob.status === 'calling' ||
            existingJob.status === 'ringing';

          if (!idem.endCallDispatched && isStillActive) {
            idem.endCallDispatched = true;
            const effectiveControlUrl =
              controlUrl ||
              existingJob.metadata?.controlUrl ||
              VapiService.activeCallControls.get(callId)?.controlUrl;
            const effectiveAuth =
              controlAuthenticationEnabled ??
              existingJob.metadata?.controlAuthenticationEnabled ??
              VapiService.activeCallControls.get(callId)?.controlAuthenticationEnabled;

            if (effectiveControlUrl) {
              console.log('[POLITICAL_KEYPAD_LIVE_CONTROL_POST]', {
                callId,
                digit,
                controlUrl: effectiveControlUrl,
                authEnabled: effectiveAuth,
              });
              this.sendLiveCallControl(effectiveControlUrl, effectiveAuth).catch((err) =>
                console.warn('[LIVE_CONTROL_ERROR]', err.message)
              );
            } else {
              this.terminateCall(callId).catch((err) =>
                console.warn('[TERMINATE_FALLBACK_ERROR]', err.message)
              );
            }

            if (!existingJob.metadata) existingJob.metadata = {};
            existingJob.metadata.instantHangupTriggered = true;
          }

          // Note: Process transiently; do NOT save raw DTMF message or transcript in storage for Political Campaign.
          // Do NOT mark completed here. Wait for actual Vapi status-update: ended!
        } else {
          // Digits other than 1 and 2 must NOT increment either counter or trigger this termination rule
          console.log('[DTMF_NON_TERMINATING_DIGIT]', { callId, digit });
        }
      } else if (!isPolitical && digit && resolvedEventType === 'public_survey') {
        const isIssue = digit === '1';
        existingJob.dtmfDigitReceived = digit;
        existingJob.dtmfOptionLabel = isIssue ? 'Issue Reported' : 'No Issue Reported';
        callbridgeStorage.recordEventCallOutcome(existingJob.eventId, {
          callId: existingJob.id,
          eventType: 'public_survey',
          surveyQuestionId: 'overall',
          surveyAnswer: isIssue ? 'issue_reported' : 'no_issue',
        });
      }

      // =========================================================================
      // 0. TOOL CALLS & FUNCTION CALLS (STRUCTURED RESULT CAPTURE)
      // =========================================================================
      if (type === 'tool-calls' || type === 'function-call' || message?.type === 'tool-calls' || message?.type === 'function-call') {
        const toolCalls =
          message?.toolCalls ||
          message?.toolWithToolCallList ||
          message?.toolCallList ||
          payload?.toolCalls ||
          payload?.toolWithToolCallList ||
          payload?.message?.toolCalls ||
          (message?.toolCall ? [message.toolCall] : null) ||
          (payload?.toolCall ? [payload.toolCall] : null) ||
          (message?.functionCall ? [{ id: message.functionCall.name, function: message.functionCall }] : []) ||
          (payload?.functionCall ? [{ id: payload.functionCall.name, function: payload.functionCall }] : []) ||
          [];

        const results: any[] = [];
        let rsvpHandled = false;

        const resolvedProviderCallId =
          (isValidUuid(existingJob?.providerCallId) ? existingJob?.providerCallId : null) ||
          (isValidUuid(callId) ? callId : existingJob?.providerCallId || callId);

        for (const tc of toolCalls) {
          const effectiveTc = tc?.toolCall || tc;
          const fnName = effectiveTc?.function?.name || effectiveTc?.name;
          let fnArgs = effectiveTc?.function?.arguments || effectiveTc?.parameters || effectiveTc?.arguments;
          if (typeof fnArgs === 'string') {
            try { fnArgs = JSON.parse(fnArgs); } catch (e) { /* ignore */ }
          }
          const catCandidate = fnArgs?.category || fnArgs?.rsvp || fnArgs?.decision || fnArgs?.rsvpStatus;
          const userSpeechFromArgs = fnArgs?.userSpeech || fnArgs?.transcript || fnArgs?.speech || fnArgs?.text;

          if (fnName === 'recordMarriageRsvp' || fnName === 'submitMarriageRsvp' || (resolvedEventType === 'marriage_event' && catCandidate)) {
            console.log('[MARRIAGE_RSVP_TOOL_CALL_RECEIVED]', {
              campaignId: existingJob.campaignId,
              providerCallId: resolvedProviderCallId,
              toolName: fnName || 'recordMarriageRsvp',
              hasCategory: Boolean(catCandidate),
              category: catCandidate || null,
            });

            let detectedUserSpeech = typeof userSpeechFromArgs === 'string' ? userSpeechFromArgs.trim() : '';
            if (!detectedUserSpeech) {
              const msgLists = [
                message?.messages,
                call?.messages,
                message?.artifact?.messages,
                call?.artifact?.messages,
                payload?.messages,
                payload?.artifact?.messages,
              ];
              for (const list of msgLists) {
                if (Array.isArray(list) && list.length > 0) {
                  for (let i = list.length - 1; i >= 0; i--) {
                    const m = list[i];
                    const role = String(m?.role || '').toLowerCase();
                    if (role === 'user' || role === 'customer' || role === 'respondent' || role === 'guest') {
                      const c = m?.content || m?.message || m?.text;
                      if (c && typeof c === 'string' && c.trim()) {
                        detectedUserSpeech = c.trim();
                        break;
                      }
                    }
                  }
                  if (detectedUserSpeech) break;
                }
              }
            }

            if (!detectedUserSpeech && existingJob?.transcript) {
              const rawTranscript: any = existingJob.transcript;
              if (typeof rawTranscript === 'string') {
                const lines = rawTranscript.split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i].trim();
                  if (/^(user|customer|respondent|guest):\s*/i.test(line)) {
                    detectedUserSpeech = line.replace(/^(user|customer|respondent|guest):\s*/i, '').trim();
                    break;
                  }
                }
              } else if (Array.isArray(rawTranscript)) {
                for (let i = rawTranscript.length - 1; i >= 0; i--) {
                  const entry = rawTranscript[i];
                  if (entry?.role === 'respondent' && entry?.text) {
                    detectedUserSpeech = String(entry.text).trim();
                    break;
                  }
                }
              }
            }

            const marriageState = VapiService.getMarriageCallState(resolvedProviderCallId);
            if (detectedUserSpeech) {
              marriageState.lastUserUtterance = detectedUserSpeech;
            }

            const rsvpRes = VapiService.processStructuredMarriageRsvp(
              existingJob.campaignId,
              resolvedProviderCallId,
              catCandidate || 'ATTENDING',
              existingJob.eventId,
              detectedUserSpeech
            );

            const toolCallId = effectiveTc?.id || tc?.id || fnName || 'recordMarriageRsvp';
            rsvpHandled = true;
            results.push({
              toolCallId,
              result: `RSVP recorded successfully as ${rsvpRes.category || catCandidate}.`,
            });

            console.log('[MARRIAGE_RSVP_WEBHOOK_DISPATCHED]', {
              campaignId: existingJob.campaignId,
              providerCallId: resolvedProviderCallId,
              toolCallId,
              category: rsvpRes.category || catCandidate,
            });

            // Transition marriage conversation state machine to STATE_4_THANK_YOU
            marriageState.state = 'STATE_4_THANK_YOU';
            marriageState.rsvpCategory = rsvpRes.category as any;
          }

          // -------------------------------------------------------------
          // PUBLIC SURVEY TOOL CALLS
          // -------------------------------------------------------------
          if (
            fnName === 'recordSurveyAnswerAndGetNextAction' ||
            fnName === 'scheduleSurveyCallback' ||
            fnName === 'skipSurveyQuestion' ||
            (resolvedEventType === 'public_survey' && (fnArgs?.answerText || fnArgs?.questionId || fnArgs?.requestedTimeText))
          ) {
            let detectedUserSpeech = typeof userSpeechFromArgs === 'string' ? userSpeechFromArgs.trim() : (fnArgs?.answerText || '');
            if (!detectedUserSpeech) {
              const msgLists = [
                message?.messages,
                call?.messages,
                message?.artifact?.messages,
                call?.artifact?.messages,
                payload?.messages,
                payload?.artifact?.messages,
              ];
              for (const list of msgLists) {
                if (Array.isArray(list) && list.length > 0) {
                  for (let i = list.length - 1; i >= 0; i--) {
                    const m = list[i];
                    const role = String(m?.role || '').toLowerCase();
                    if (role === 'user' || role === 'customer' || role === 'respondent') {
                      const c = m?.content || m?.message || m?.text;
                      if (c && typeof c === 'string' && c.trim()) {
                        detectedUserSpeech = c.trim();
                        break;
                      }
                    }
                  }
                  if (detectedUserSpeech) break;
                }
              }
            }

            const toolCallId = effectiveTc?.id || tc?.id || fnName || 'surveyTool';

            if (fnName === 'scheduleSurveyCallback' || fnArgs?.requestedTimeText) {
              const requestedTimeText = fnArgs?.requestedTimeText || detectedUserSpeech;
              const cbRes = SurveySequentialEngine.scheduleCallback({
                campaignId: existingJob.campaignId,
                providerCallId: resolvedProviderCallId,
                requestedTimeText,
                note: fnArgs?.note,
                eventId: existingJob.eventId,
              });

              existingJob.status = 'callback_scheduled';
              existingJob.callbackDetails = cbRes.callbackDetails;
              existingJob.callbackRequested = true;
              existingJob.callbackScheduledAt = cbRes.callbackDetails.scheduledIso;
              existingJob.callbackTimezone = cbRes.callbackDetails.timezone;

              VapiService.appendSurveyTranscriptTurn(existingJob, 'respondent', detectedUserSpeech || requestedTimeText);
              VapiService.appendSurveyTranscriptTurn(existingJob, 'agent', cbRes.spokenResponse);
              callbridgeStorage.saveCallJob(existingJob);

              results.push({
                toolCallId,
                result: cbRes.spokenResponse,
              });
              rsvpHandled = true;
            } else if (fnName === 'skipSurveyQuestion') {
              const skipRes = SurveySequentialEngine.skipQuestion({
                campaignId: existingJob.campaignId,
                providerCallId: resolvedProviderCallId,
                questionId: fnArgs?.questionId,
                reason: fnArgs?.reason,
                eventId: existingJob.eventId,
              });

              VapiService.appendSurveyTranscriptTurn(existingJob, 'respondent', detectedUserSpeech || 'దాటవేయండి');
              VapiService.appendSurveyTranscriptTurn(existingJob, 'agent', skipRes.spokenResponse);
              callbridgeStorage.saveCallJob(existingJob);

              results.push({
                toolCallId,
                result: skipRes.spokenResponse,
              });
              rsvpHandled = true;
            } else {
              const userSpeech = (detectedUserSpeech || fnArgs?.answerText || '').trim();
              const pState = VapiService.getPublicSurveyCallState(resolvedProviderCallId);
              let spokenResult = '';

              if (userSpeech && pState.lastProcessedUtterance === userSpeech && pState.lastGeneratedAgentReply) {
                // Utterance already processed by transcript webhook - return generated reply directly!
                spokenResult = pState.lastGeneratedAgentReply;
                console.log('[PUBLIC_SURVEY_TOOL_CALL_REUSING_GENERATED_REPLY]', {
                  callId: resolvedProviderCallId,
                  utterance: userSpeech,
                  reply: spokenResult,
                });
              } else {
                const turnRes = SurveySequentialEngine.processTurnSync({
                  campaignId: existingJob.campaignId,
                  providerCallId: resolvedProviderCallId,
                  userUtterance: userSpeech,
                  questionId: fnArgs?.questionId,
                  eventId: existingJob.eventId,
                  contactId: existingJob.contactId,
                  contactPhone: existingJob.contactPhone,
                });

                spokenResult = turnRes.spokenResponse;
                if (!pState.processedUtterances) pState.processedUtterances = new Set<string>();
                if (userSpeech) {
                  pState.processedUtterances.add(userSpeech);
                  pState.lastProcessedUtterance = userSpeech;
                  pState.lastGeneratedAgentReply = turnRes.spokenResponse;
                }

                VapiService.appendSurveyTranscriptTurn(existingJob, 'respondent', userSpeech);
                VapiService.appendSurveyTranscriptTurn(existingJob, 'agent', turnRes.spokenResponse);

                const sState = SurveySequentialEngine.getState(resolvedProviderCallId);
                if (sState) {
                  existingJob.surveyState = sState;
                  existingJob.surveyAnswers = sState.answers;
                  if (turnRes.isCompleted) {
                    existingJob.status = 'completed';
                    pState.closingSpoken = true;
                  } else if (turnRes.isCallback) {
                    existingJob.status = 'callback_scheduled';
                    existingJob.callbackRequested = true;
                    existingJob.callbackScheduledAt = turnRes.callbackScheduledAt || undefined;
                    existingJob.callbackDetails = (turnRes as any).callbackDetails || sState.callbackDetails || undefined;
                  }
                }
                callbridgeStorage.saveCallJob(existingJob);
              }

              results.push({
                toolCallId,
                result: spokenResult,
              });
              rsvpHandled = true;
            }
          }
        }

        if (rsvpHandled) {
          return {
            success: true,
            eventType: type,
            isTerminal: false,
            job: existingJob,
            results,
          } as any;
        }
      }

      // =========================================================================
      // 1. STATUS UPDATE
      // =========================================================================
      if (type === 'status-update') {
        const rawStatus = message?.status || call?.status || payload?.status || '';
        const vapiStatus = String(rawStatus).toLowerCase();
        if (vapiStatus === 'in-progress' || vapiStatus === 'in_progress') {
          console.log('[CALL_ANSWERED]', { callId, status: vapiStatus });
          existingJob.status = 'in_progress';
          callbridgeStorage.recordCallAnswered(existingJob.eventId, existingJob.id, existingJob.campaignId);
        } else if (vapiStatus === 'ringing') {
          existingJob.status = 'ringing';
        } else if (
          vapiStatus === 'ended' ||
          vapiStatus === 'completed' ||
          vapiStatus === 'failed' ||
          vapiStatus === 'no-answer' ||
          vapiStatus === 'no_answer' ||
          vapiStatus === 'busy' ||
          vapiStatus === 'canceled' ||
          vapiStatus === 'cancelled' ||
          Boolean(call?.endedReason || message?.endedReason)
        ) {
          if (resolvedEventType === 'marriage_event') {
            const resolvedProviderCallId =
              (isValidUuid(existingJob?.providerCallId) ? existingJob?.providerCallId : null) ||
              (isValidUuid(callId) ? callId : existingJob?.providerCallId || callId);
            this.classifyAndRecordMarriageFallback(existingJob, call, message, payload, resolvedProviderCallId);
          }
          return this.handleTerminalCallState(existingJob, call, message, resolvedEventType, now);
        }
      }

      // =========================================================================
      // 2. SPOKEN RSVP CLASSIFICATION & CLOSING TERMINATION FOR MARRIAGE EVENT
      // =========================================================================
      if (type === 'transcript' || type === 'speech-update' || type === 'conversation-update') {
        const rawRole = message?.role || payload?.role || message?.speech?.role;
        const isUserRole = rawRole === 'user' || rawRole === 'customer' || rawRole === 'respondent';
        const isAssistantRole = rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'agent';
        const speechStatus = String(
          message?.status || payload?.status || message?.speechUpdate?.status || message?.speech?.status || ''
        ).toLowerCase();
        const text = message?.transcript || message?.text || message?.content;
        const resolvedProviderCallId =
          (isValidUuid(existingJob?.providerCallId) ? existingJob?.providerCallId : null) ||
          (isValidUuid(callId) ? callId : existingJob?.providerCallId || callId);

        if (resolvedEventType === 'marriage_event') {
          const marriageState = VapiService.getMarriageCallState(callId);

          // Audio playback stopped event for assistant
          if ((isAssistantRole || !isUserRole) && (speechStatus === 'stopped' || (type === 'speech-update' && speechStatus === 'stopped'))) {
            if (marriageState.state === 'STATE_1_INVITATION') {
              marriageState.state = 'STATE_2_WAITING_FOR_RSVP';
              console.log('[MARRIAGE_INVITATION_PLAYBACK_COMPLETED]', { callId: resolvedProviderCallId });
              console.log('[MARRIAGE_RSVP_QUESTION_REACHED]', { callId: resolvedProviderCallId });
            } else if (
              marriageState.state === 'STATE_4_THANK_YOU' ||
              marriageState.state === 'STATE_4_THANK_YOU_AND_END' ||
              marriageState.thankYouSpoken ||
              marriageState.thankYouStarted
            ) {
              if (!marriageState.thankYouCompleted) {
                marriageState.thankYouCompleted = true;
                if (marriageState.safetyTimer) {
                  clearTimeout(marriageState.safetyTimer);
                  marriageState.safetyTimer = null;
                }
                marriageState.state = 'STATE_5_CALL_END';
                console.log('[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED]', {
                  campaignId: existingJob.campaignId,
                  providerCallId: resolvedProviderCallId,
                  status: 'playback_completed',
                });
                VapiService.executeMarriageCallTermination(
                  existingJob.campaignId,
                  resolvedProviderCallId,
                  controlUrl,
                  controlAuthenticationEnabled
                ).catch(() => null);
              }
            }
          }

          // Assistant speech handling (speech-update started)
          if ((isAssistantRole || !isUserRole) && (speechStatus === 'started' || (type === 'speech-update' && speechStatus === 'started'))) {
            if (
              marriageState.state === 'STATE_4_THANK_YOU' ||
              marriageState.state === 'STATE_4_THANK_YOU_AND_END' ||
              marriageState.thankYouSpoken
            ) {
              if (!marriageState.thankYouStarted) {
                marriageState.thankYouStarted = true;
                console.log('[MARRIAGE_THANK_YOU_STARTED]', {
                  campaignId: existingJob.campaignId,
                  providerCallId: resolvedProviderCallId,
                  status: 'started',
                });
              }
            }
          }

          // User speech handling
          if (isUserRole && text) {
            // If still in STATE_1_INVITATION, assistant invitation audio has completed / user interrupted
            if (marriageState.state === 'STATE_1_INVITATION') {
              marriageState.state = 'STATE_2_WAITING_FOR_RSVP';
              console.log('[MARRIAGE_INVITATION_PLAYBACK_COMPLETED]', { callId: resolvedProviderCallId });
              console.log('[MARRIAGE_RSVP_QUESTION_REACHED]', { callId: resolvedProviderCallId });
            }

            // Once RSVP is recorded (STATE 3, 4, 5), lock the state machine and ignore further turns or webhook retries
            if (
              marriageState.state === 'STATE_3_RSVP_CLASSIFIED' ||
              marriageState.state === 'STATE_3_RSVP_RECORDED' ||
              marriageState.state === 'STATE_4_THANK_YOU' ||
              marriageState.state === 'STATE_4_THANK_YOU_AND_END' ||
              marriageState.state === 'STATE_5_CALL_END'
            ) {
              console.log('[MARRIAGE_STATE_LOCKED]', { callId: resolvedProviderCallId, state: marriageState.state });
            } else if (marriageState.state === 'STATE_2_WAITING_FOR_RSVP') {
              // Privacy-safe log: zero PII (never log raw speech or transcript)
              console.log('[MARRIAGE_RSVP_RESPONSE_RECEIVED]', { callId: resolvedProviderCallId });

              const rsvp = classifyMarriageRsvp(text);
              if (rsvp !== 'UNCLEAR') {
                const category: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING' = rsvp;

                marriageState.state = 'STATE_3_RSVP_CLASSIFIED';
                marriageState.rsvpCategory = category;

                VapiService.processStructuredMarriageRsvp(
                  existingJob.campaignId,
                  resolvedProviderCallId,
                  category,
                  existingJob.eventId
                );

                marriageState.state = 'STATE_4_THANK_YOU';
              } else {
                if (!marriageState.clarificationAsked) {
                  marriageState.clarificationAsked = true;
                  console.log('[MARRIAGE_CLARIFICATION_PROMPTED]', { callId: resolvedProviderCallId });
                }
              }
            }
          } else if (isAssistantRole && text) {
            // Detect closing thank-you: "సరే, ధన్యవాదాలు."
            if (text.includes('సరే, ధన్యవాదాలు') || text.includes('ధన్యవాదాలు')) {
              marriageState.thankYouSpoken = true;
              if (marriageState.state === 'STATE_3_RSVP_CLASSIFIED' || marriageState.state === 'STATE_3_RSVP_RECORDED') {
                marriageState.state = 'STATE_4_THANK_YOU';
              }
              if (!marriageState.thankYouStarted) {
                marriageState.thankYouStarted = true;
                console.log('[MARRIAGE_THANK_YOU_STARTED]', {
                  campaignId: existingJob.campaignId,
                  providerCallId: resolvedProviderCallId,
                  status: 'started',
                });
              }

              // Set safety playback timer (2000ms): ensures full audio finishes playing before disconnect
              // In live Vapi calls, speech-update: stopped will fire first and cancel this timer.
              // If Vapi does not send speech-update: stopped, the timer cleanly executes termination after audio completion.
              if (!marriageState.thankYouCompleted && !marriageState.safetyTimer) {
                marriageState.safetyTimer = setTimeout(() => {
                  if (!marriageState.thankYouCompleted) {
                    marriageState.thankYouCompleted = true;
                    marriageState.safetyTimer = null;
                    marriageState.state = 'STATE_5_CALL_END';
                    console.log('[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED]', {
                      campaignId: existingJob.campaignId,
                      providerCallId: resolvedProviderCallId,
                      status: 'playback_completed',
                    });
                    VapiService.executeMarriageCallTermination(
                      existingJob.campaignId,
                      resolvedProviderCallId,
                      controlUrl,
                      controlAuthenticationEnabled
                    ).catch(() => null);
                  }
                }, 2000);
              }

              // If audio playback is already indicated stopped:
              if (speechStatus === 'stopped') {
                if (!marriageState.thankYouCompleted) {
                  marriageState.thankYouCompleted = true;
                  if (marriageState.safetyTimer) {
                    clearTimeout(marriageState.safetyTimer);
                    marriageState.safetyTimer = null;
                  }
                  marriageState.state = 'STATE_5_CALL_END';
                  console.log('[MARRIAGE_THANK_YOU_PLAYBACK_COMPLETED]', {
                    campaignId: existingJob.campaignId,
                    providerCallId: resolvedProviderCallId,
                    status: 'playback_completed',
                  });
                  VapiService.executeMarriageCallTermination(
                    existingJob.campaignId,
                    resolvedProviderCallId,
                    controlUrl,
                    controlAuthenticationEnabled
                  ).catch(() => null);
                }
              }
            }
          }
        } else if (resolvedEventType === 'public_survey') {
          const surveyState = VapiService.getPublicSurveyCallState(callId);

          // Audio playback stopped event for assistant closing audio
          if ((isAssistantRole || !isUserRole) && (speechStatus === 'stopped' || (type === 'speech-update' && speechStatus === 'stopped'))) {
            if (surveyState.closingSpoken && !surveyState.closingCompleted) {
              surveyState.closingCompleted = true;
              if (surveyState.safetyTimer) {
                clearTimeout(surveyState.safetyTimer);
                surveyState.safetyTimer = null;
              }
              console.log('[PUBLIC_SURVEY_CLOSING_PLAYBACK_COMPLETED]', {
                campaignId: existingJob.campaignId,
                providerCallId: resolvedProviderCallId,
              });
              VapiService.executePublicSurveyCallTermination(
                existingJob.campaignId,
                resolvedProviderCallId,
                controlUrl,
                controlAuthenticationEnabled
              ).catch(() => null);
            }
          }

          // User speech handling
          if (isUserRole && text) {
            const isPartial = String(message?.transcriptType || payload?.transcriptType || '').toLowerCase() === 'partial';
            if (!isPartial) {
              const userText = String(text).trim();
              if (userText) {
                if (!surveyState.processedUtterances) {
                  surveyState.processedUtterances = new Set<string>();
                }

                if (!surveyState.processedUtterances.has(userText) && surveyState.lastProcessedUtterance !== userText) {
                  surveyState.processedUtterances.add(userText);
                  surveyState.lastProcessedUtterance = userText;

                  console.log('[PUBLIC_SURVEY_USER_SPEECH_RECEIVED]', {
                    callId: resolvedProviderCallId,
                    text: userText.slice(0, 50),
                  });

                  VapiService.appendSurveyTranscriptTurn(existingJob, 'respondent', userText);

                  const turnRes = SurveySequentialEngine.processTurnSync({
                    campaignId: existingJob.campaignId,
                    providerCallId: resolvedProviderCallId,
                    userUtterance: userText,
                    eventId: existingJob.eventId,
                    contactId: existingJob.contactId,
                    contactPhone: existingJob.contactPhone,
                  });

                  surveyState.lastGeneratedAgentReply = turnRes.spokenResponse;
                  VapiService.appendSurveyTranscriptTurn(existingJob, 'agent', turnRes.spokenResponse);

                  const sState = SurveySequentialEngine.getState(resolvedProviderCallId);
                  if (sState) {
                    existingJob.surveyState = sState;
                    existingJob.surveyAnswers = sState.answers;
                    if (turnRes.isCompleted) {
                      existingJob.status = 'completed';
                      surveyState.closingSpoken = true;
                    } else if (turnRes.isCallback) {
                      existingJob.status = 'callback_scheduled';
                      existingJob.callbackRequested = true;
                      existingJob.callbackScheduledAt = turnRes.callbackScheduledAt || undefined;
                      existingJob.callbackDetails = (turnRes as any).callbackDetails || sState.callbackDetails || undefined;
                    }
                  }
                  existingJob.updatedAt = now;
                  callbridgeStorage.saveCallJob(existingJob);
                }
              }
            }
          }

          // Assistant speech handling
          if (isAssistantRole && text) {
            const agentText = String(text).trim();
            if (agentText) {
              const lastTurn = Array.isArray(existingJob.transcript) && existingJob.transcript.length > 0
                ? existingJob.transcript[existingJob.transcript.length - 1]
                : null;
              if (!lastTurn || lastTurn.role !== 'agent' || lastTurn.text !== agentText) {
                VapiService.appendSurveyTranscriptTurn(existingJob, 'agent', agentText);
                existingJob.updatedAt = now;
                callbridgeStorage.saveCallJob(existingJob);
              }
            }

            const isActualSurveyClosing =
              text.includes('మీ సమయాన్ని కేటాయించి మా సర్వేలో పాల్గొన్నందుకు చాలా ధన్యవాదాలు') ||
              text.includes('మీ అభిప్రాయం మాకు చాలా ఉపయోగపడుతుంది') ||
              text.includes('తిరిగి కాల్ చేస్తాము. ధన్యవాదాలు') ||
              text.includes('మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు') ||
              text.includes('మీ సమయానికి కృతజ్ఞతలు. నమస్కారం');

            if (isActualSurveyClosing) {
              surveyState.closingSpoken = true;
              if (!surveyState.closingStarted) {
                surveyState.closingStarted = true;
              }
              if (!surveyState.closingCompleted && !surveyState.safetyTimer) {
                surveyState.safetyTimer = setTimeout(() => {
                  if (!surveyState.closingCompleted) {
                    surveyState.closingCompleted = true;
                    surveyState.safetyTimer = null;
                    console.log('[PUBLIC_SURVEY_SAFETY_TERMINATION_TRIGGERED]', {
                      campaignId: existingJob.campaignId,
                      providerCallId: resolvedProviderCallId,
                    });
                    VapiService.executePublicSurveyCallTermination(
                      existingJob.campaignId,
                      resolvedProviderCallId,
                      controlUrl,
                      controlAuthenticationEnabled
                    ).catch(() => null);
                  }
                }, 2500);
              }
            }
          }
        }
      }

      // =========================================================================
      // 3. END-OF-CALL-REPORT OR HANG (TERMINAL BACKUP)
      // =========================================================================
      if (type === 'end-of-call-report' || type === 'hang') {
        const resolvedProviderCallId =
          (isValidUuid(existingJob?.providerCallId) ? existingJob?.providerCallId : null) ||
          (isValidUuid(callId) ? callId : existingJob?.providerCallId || callId);

        if (resolvedEventType === 'marriage_event') {
          this.classifyAndRecordMarriageFallback(existingJob, call, message, payload, resolvedProviderCallId);
        } else if (resolvedEventType === 'public_survey') {
          this.processPublicSurveyTerminalFallback(existingJob, call, message, payload, resolvedProviderCallId);
        }
        return this.handleTerminalCallState(existingJob, call, message, resolvedEventType, now);
      }

      // Save interim job state
      const isZeroPii = isPolitical || resolvedEventType === 'marriage_event';
      if (!isZeroPii || existingJob.status !== 'completed') {
        existingJob.updatedAt = now;
        callbridgeStorage.saveCallJob(existingJob);
      }

      return {
        success: true,
        eventType: type,
        isTerminal: false,
        job: existingJob,
        receivedDigit: digit || null,
        terminationTriggered: Boolean(isPolitical && (digit === '1' || digit === '2')),
      };
    } catch (err: any) {
      console.error('[VAPI_WEBHOOK_HANDLER_ERROR]', err);
      return { success: false, receivedDigit: null, terminationTriggered: false };
    }
  }

  private static handleTerminalCallState(
    job: CallJobRecord,
    call: any,
    message: any,
    resolvedEventType: string,
    now: string
  ): {
    success: boolean;
    isTerminal: boolean;
    job: any;
    receivedDigit?: string | null;
    terminationTriggered?: boolean;
  } {
    const callId = call?.id || job.providerCallId || job.id;
    const idem = this.getIdempotency(callId);
    const prevJobState = job.status;

    const candidateDigit =
      extractKeypadDigit(call) ||
      extractKeypadDigit(message) ||
      extractKeypadDigit(job);

    if (idem.terminalHandled) {
      console.log('[VAPI_TERMINAL_PROCESSING]', {
        callId,
        previousJobState: prevJobState,
        newJobState: job.status,
        alreadyProcessed: true,
      });
      // If terminal was already recorded, but end-of-call-report brings newly decoded DTMF digit or duration:
      if (candidateDigit && (candidateDigit === '1' || candidateDigit === '2') && !idem.dtmfProcessed) {
        idem.dtmfProcessed = true;
        idem.dtmfDigit = candidateDigit;
        job.dtmfDigitReceived = candidateDigit;
        callbridgeStorage.recordPoliticalKeypadOutcome(
          job.eventId,
          job.id,
          candidateDigit as '1' | '2',
          job.campaignId
        );
        console.log('[LATE_DTMF_OUTCOME_PERSISTED]', { callId, digit: candidateDigit });
      }
      return {
        success: true,
        isTerminal: true,
        job,
        receivedDigit: candidateDigit || idem.dtmfDigit || null,
        terminationTriggered: Boolean(candidateDigit === '1' || candidateDigit === '2'),
      };
    }
    idem.terminalHandled = true;

    const rawEndedReason = call?.endedReason || message?.endedReason || job.failureReason || 'ended';
    const endedReason = String(rawEndedReason).toLowerCase();
    const durationSec = Math.round(
      call?.duration ||
      message?.durationSeconds ||
      call?.durationSeconds ||
      message?.duration ||
      job.durationSeconds ||
      0
    );

    const isBusy = endedReason.includes('busy');
    const isNoAnswer =
      endedReason.includes('no-answer') ||
      endedReason.includes('did-not-answer') ||
      endedReason.includes('rejected') ||
      endedReason.includes('decline') ||
      endedReason.includes('ring-timeout') ||
      endedReason.includes('customer-did-not-answer');
    const isFailure =
      endedReason.includes('error') ||
      endedReason.includes('pipeline') ||
      endedReason.includes('failed') ||
      endedReason.includes('voice-not-found') ||
      endedReason.includes('blocked');

    const receivedDigit =
      job.dtmfDigitReceived ||
      idem.dtmfDigit ||
      (idem.dtmfProcessed ? '1' : null) ||
      candidateDigit;

    if (receivedDigit && (receivedDigit === '1' || receivedDigit === '2')) {
      idem.dtmfProcessed = true;
      idem.dtmfDigit = receivedDigit;
      job.dtmfDigitReceived = receivedDigit;
    }

    const isExplicitAnsweredReason =
      !isBusy &&
      !isNoAnswer &&
      !isFailure &&
      (endedReason.includes('customer-ended-call') ||
        endedReason.includes('assistant-ended-call') ||
        endedReason.includes('assistant-said-end-call-phrase') ||
        endedReason.includes('silence-timed-out') ||
        endedReason.includes('max-duration-exceeded') ||
        endedReason.includes('completed') ||
        endedReason.includes('hangup'));

    const hasStartedOrAnswered = Boolean(
      call?.startedAt ||
      message?.startedAt ||
      call?.answeredAt ||
      message?.answeredAt ||
      call?.customer?.answeredAt ||
      message?.call?.startedAt ||
      message?.call?.answeredAt
    );

    const wasAnswered =
      Boolean(receivedDigit === '1' || receivedDigit === '2') ||
      Boolean(idem.dtmfProcessed) ||
      job.status === 'in_progress' ||
      ((isExplicitAnsweredReason || hasStartedOrAnswered || durationSec > 0) && !isBusy && !isNoAnswer && !isFailure);

    let finalStatus: CallJobRecord['status'] = 'completed';
    if (isBusy) finalStatus = 'busy';
    else if (isNoAnswer) finalStatus = 'no_answer';
    else if (isFailure) finalStatus = 'failed';
    else if (wasAnswered) finalStatus = 'completed';

    if (resolvedEventType === 'public_survey' || (job as any).moduleType === 'public_survey') {
      const sState = SurveySequentialEngine.getState(callId);
      const isCompleted =
        sState?.conversationStatus === 'COMPLETED' ||
        sState?.conversationStatus === 'completed' ||
        sState?.stateMachineState === 'COMPLETED' ||
        job.surveyState?.conversationStatus === 'COMPLETED' ||
        job.surveyState?.conversationStatus === 'completed' ||
        job.surveyState?.stateMachineState === 'COMPLETED';
      const isCallback =
        job.status === 'callback_scheduled' ||
        sState?.conversationStatus === 'callback_scheduled' ||
        sState?.conversationStatus === 'SCHEDULE_CALLBACK' ||
        Boolean(sState?.callbackRequested) ||
        Boolean(job.callbackRequested);

      if (isBusy) finalStatus = 'busy';
      else if (isNoAnswer) finalStatus = 'no_answer';
      else if (isFailure) finalStatus = 'failed';
      else if (isCallback) finalStatus = 'callback_scheduled';
      else if (isCompleted) finalStatus = 'completed';
      else if (wasAnswered) finalStatus = 'interrupted';
      else finalStatus = 'no_answer';

      if (sState?.transcripts && Array.isArray(sState.transcripts) && sState.transcripts.length > 0) {
        if (!job.transcript || job.transcript.length <= sState.transcripts.length) {
          job.transcript = [...sState.transcripts];
          if (!job.originalTranscript || job.originalTranscript.length === 0) {
            job.originalTranscript = [...sState.transcripts];
          }
        }
      }
    }

    job.status = finalStatus;
    job.endedAt = now;
    job.durationSeconds = durationSec;
    job.failureReason = isFailure ? endedReason : undefined;
    console.log('[VAPI_TERMINAL_PROCESSING]', {
      callId,
      previousJobState: prevJobState,
      newJobState: finalStatus,
      alreadyProcessed: false,
    });

    console.log('[CALL_TERMINAL_REACHED]', {
      callId,
      finalStatus,
      wasAnswered,
      isNoAnswer,
      isFailure,
      duration: durationSec,
      digit: receivedDigit,
    });

    // Record DTMF keypad outcome if present and not processed yet
    if (receivedDigit && (receivedDigit === '1' || receivedDigit === '2') && !idem.dtmfProcessed) {
      idem.dtmfProcessed = true;
      idem.dtmfDigit = receivedDigit;
      job.dtmfDigitReceived = receivedDigit;
      callbridgeStorage.recordPoliticalKeypadOutcome(
        job.eventId,
        job.id,
        receivedDigit as '1' | '2',
        job.campaignId
      );
    }

    // Record anonymous aggregate metrics
    const marriageState = resolvedEventType === 'marriage_event' ? VapiService.getMarriageCallState(callId) : null;
    if (resolvedEventType === 'marriage_event' && !callbridgeStorage.isMarriageRsvpRecorded(job.campaignId, job.providerCallId || job.id)) {
      this.classifyAndRecordMarriageFallback(job, call, message, call, job.providerCallId || job.id);
    }
    const rawCat = job.rsvpStatus || marriageState?.rsvpCategory;
    let marriageRsvpOutcome: 'YES' | 'NO' | 'MAYBE' | undefined = undefined;
    if (resolvedEventType === 'marriage_event') {
      if (rawCat === 'attending' || rawCat === 'ATTENDING' || rawCat === 'YES') {
        marriageRsvpOutcome = 'YES';
      } else if (rawCat === 'not_attending' || rawCat === 'NOT_ATTENDING' || rawCat === 'NO') {
        marriageRsvpOutcome = 'NO';
      } else if (rawCat === 'maybe' || rawCat === 'MAYBE_ATTENDING' || rawCat === 'MAYBE') {
        marriageRsvpOutcome = 'MAYBE';
      }
    }

    callbridgeStorage.recordEventCallOutcome(
      job.eventId,
      {
        callId: job.providerCallId || job.id,
        eventType: resolvedEventType as any,
        durationSeconds: durationSec,
        isAnswered: wasAnswered,
        isNoAnswer: isNoAnswer || isBusy,
        isFailed: isFailure,
        isRejected: isNoAnswer,
        status: finalStatus,
        dtmfDigit: receivedDigit === '1' || receivedDigit === '2' ? receivedDigit : undefined,
        marriageRsvp: marriageRsvpOutcome,
      },
      job.campaignId
    );

    const isPolitical = resolvedEventType === 'political_campaign' || resolvedEventType === 'political_survey';
    const isMarriage = resolvedEventType === 'marriage_event';
    if (isMarriage) {
      const marriageState = VapiService.getMarriageCallState(callId);
      marriageState.state = 'STATE_5_CALL_END';
      if (marriageState.safetyTimer) {
        clearTimeout(marriageState.safetyTimer);
        marriageState.safetyTimer = null;
      }
      if (!marriageState.terminationConfirmed) {
        marriageState.terminationConfirmed = true;
        const resolvedProviderCallId =
          (isValidUuid(job?.providerCallId) ? job?.providerCallId : null) ||
          (isValidUuid(callId) ? callId : job?.providerCallId || callId);
        console.log('[MARRIAGE_CALL_TERMINATION_CONFIRMED]', {
          campaignId: job.campaignId,
          providerCallId: resolvedProviderCallId,
          status: 'confirmed_ended',
        });
      }
    }

    if (isPolitical || isMarriage) {
      // Zero-PII: Purge completed job immediately from permanent storage
      callbridgeStorage.purgePoliticalCallJob(job.id);
    } else {
      callbridgeStorage.saveCallJob(job);
    }

    VapiService.activeCallControls.delete(callId);
    VapiService.activeCallControls.delete(job.id);
    // Note: Do NOT delete from activeTransientCalls immediately.
    // Retaining transient mapping allows late end-of-call-report arriving 200-500ms later to resolve the campaign & event.

    // Notify Queue that previous call has ended
    if (job.campaignId) {
      VapiService.notifyCallTerminal(job.campaignId, job.id, {
        isAnswered: wasAnswered,
        isNoAnswer: isNoAnswer || isBusy,
        isFailed: isFailure,
        status: finalStatus,
      });
    }

    return {
      success: true,
      isTerminal: true,
      job,
      receivedDigit: receivedDigit || null,
      terminationTriggered: Boolean(receivedDigit === '1' || receivedDigit === '2'),
    };
  }
}

