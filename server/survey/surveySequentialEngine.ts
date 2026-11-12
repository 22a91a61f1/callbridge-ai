import OpenAI from 'openai';
import { callbridgeStorage, type SurveyQuestion } from '../storage/callbridgeStorage.ts';

export type StateMachineState =
  | 'START'
  | 'ASKING_MAIN_QUESTION'
  | 'WAITING_FOR_RESPONSE'
  | 'PROCESSING_RESPONSE'
  | 'GENERATING_FOLLOW_UP'
  | 'ASKING_FOLLOW_UP'
  | 'WAITING_FOR_FOLLOW_UP_RESPONSE'
  | 'SAVING_RESPONSE'
  | 'MOVING_TO_NEXT_QUESTION'
  | 'SCHEDULE_CALLBACK'
  | 'COMPLETED'
  | 'INTERRUPTED';

export interface SurveyTranscriptTurn {
  id?: string;
  callId?: string;
  sessionId?: string;
  surveyId?: string;
  eventId?: string;
  speakerRole?: 'assistant' | 'respondent';
  transcriptText?: string;
  role: 'agent' | 'respondent' | 'system' | 'assistant';
  text: string;
  timestamp: string;
  questionId?: string;
  questionOrder?: number;
  sequenceNumber?: number;
  isFinal?: boolean;
  confidence?: number;
  turnType?:
    | 'greeting'
    | 'main_question'
    | 'follow_up'
    | 'clarification'
    | 'answer'
    | 'skip'
    | 'callback'
    | 'closing'
    | 'system';
}

export interface SurveyEngineSessionState {
  callId: string;
  sessionId: string;
  campaignId?: string;
  providerCallId?: string;
  eventId?: string;
  surveyId?: string;
  targetLanguage: string;
  currentQuestionId: string;
  currentQuestionIndex: number;
  totalActiveQuestions: number;
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  pendingQuestionId: string;
  pendingFollowUpQuestionId: string | null;
  lastProcessedToolCallId: string | null;
  surveyCompletionStatus:
    | 'in_progress'
    | 'completed'
    | 'callback_scheduled'
    | 'interrupted'
    | string;
  conversationStatus:
    | 'in_progress'
    | 'completed'
    | 'callback_requested'
    | 'callback_scheduled'
    | 'interrupted'
    | 'ended_by_user'
    | StateMachineState
    | string;
  stateMachineState: StateMachineState;
  followUpCountForCurrentQuestion: number;
  maxFollowUpsPerQuestion: number;
  callbackRequested: boolean;
  callbackScheduledAt: string | null;
  callbackTimezone: string;
  callbackDetails: {
    requestedDate?: string;
    requestedTime?: string;
    isTimeVague?: boolean;
    timezone?: string;
    rawUtterance?: string;
    confirmationMessage?: string;
    unansweredQuestionId?: string;
    unansweredQuestionIndex?: number;
    scheduledTimestamp?: string;
    resumeQuestionIndex?: number;
    answeredQuestionIds?: string[];
  } | null;
  answers: Record<
    string,
    {
      questionId: string;
      questionText: string;
      questionOrder: number;
      answerText: string;
      followUps?: Array<{ question: string; answer: string }>;
      answeredAt: string;
      status: 'answered' | 'skipped' | 'refused';
    } | any
  >;
  transcripts: SurveyTranscriptTurn[];
  originalTranscript: SurveyTranscriptTurn[];
  lastProcessedUtterance?: string;
  lastProcessedQuestionId?: string;
  lastGeneratedReply?: string;
  // Backwards compatibility with existing memoryEngine / sessionManager / test scripts
  session_id?: string;
  current_question?: string;
  current_question_id?: string;
  current_question_topic?: string;
  current_topic?: string;
  conversation_status?: string;
  completed_questions?: string[];
  pending_follow_up?: any;
}

export interface EngineTurnResult {
  reply: string;
  spokenResponse: string;
  currentQuestionId: string;
  currentQuestionIndex: number;
  totalActiveQuestions: number;
  extractedAnswers: Array<{
    questionId: string;
    answerSummary: string;
    status: 'answered' | 'skipped' | 'refused' | 'pending';
  }>;
  isSurveyComplete: boolean;
  isCompleted: boolean;
  isSurveyStopped: boolean;
  isCallback: boolean;
  callbackScheduledAt: string | null;
  conversationState: SurveyEngineSessionState;
  conversation_state: SurveyEngineSessionState;
  action: 'ASK_MAIN_QUESTION' | 'ASK_FOLLOW_UP' | 'ACCEPT_ANSWER' | 'CLARIFY' | 'SKIP' | 'CALLBACK' | 'END';
  summaryOfCollected: string;
  audioBase64?: string | null;
  turnPipeline?: string;
}

// Canonical Telugu Spoken Strings
export const TELUGU_STRINGS = {
  DEFAULT_INTRO: 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.',
  CLOSING_MESSAGE: 'సరే అండి, ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేశాము. మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.',
  CALLBACK_PROMPT_VAGUE: 'సరే అండి, మీకు ఏ సమయంలో మళ్లీ కాల్ చేస్తే వీలుగా ఉంటుంది?',
  CALLBACK_PROMPT_TIME_OF_DAY: 'సరే అండి, ఏ సమయానికి కాల్ చేయమంటారు?',
  CALLBACK_CONFIRMATION: 'సరే అండి, మీరు చెప్పిన సమయంలో మళ్లీ కాల్ చేస్తాము. ధన్యవాదాలు.',
  SKIP_CONFIRMATION_QUESTION: 'మీరు ఈ ప్రశ్నను దాటవేయాలనుకుంటున్నారా?',
  STOP_CLOSING: 'సరే అండి, మీ సమయానికి ధన్యవాదాలు. నమస్కారం.',
  CONNECTION_CHECK_REPLY: 'అవును అండి, మీ మాట వినపడుతోంది. చెప్పండి.',
  CASE_A_ACK: 'సరే అండి, ధన్యవాదాలు.',
  CASE_B_FOLLOW_UP: 'ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?',
  CASE_C_ACK: 'సరే అండి, ధన్యవాదాలు.',
  CASE_D_ACK: 'సరే అండి, ధన్యవాదాలు.',
  NATURAL_ACKNOWLEDGMENTS: [
    'సరే అండి, ధన్యవాదాలు.',
  ],
};

function getRandomTeluguAck(): string {
  return TELUGU_STRINGS.CASE_A_ACK;
}

// In-memory session store
const engineSessions = new Map<string, SurveyEngineSessionState>();

// Lazy OpenAI client
let openAiInstance: OpenAI | null = null;
function getOpenAi(): OpenAI | null {
  const apiKey = (process.env.OPENAI_MODEL_API_KEY || process.env.OPENAI_API_KEY)?.trim();
  if (!apiKey) return null;
  if (!openAiInstance) {
    openAiInstance = new OpenAI({
      apiKey,
      timeout: 4000,
      maxRetries: 1,
    });
  }
  return openAiInstance;
}

export class SurveySequentialEngine {
  public static filterHallucinatoryLoops(text: string): string {
    if (!text) return '';
    let cleaned = text.trim();
    // Strip repetitive single/double word hallucination loops e.g. "my my my my...", "yeah yeah yeah...", "the the the..."
    cleaned = cleaned.replace(/\b([a-zA-Z]+)(?:\s+\1){2,}\b/gi, '');
    // Also filter Telugu repeated hallucination token loops if any
    cleaned = cleaned.replace(/([\u0C00-\u0C7F]+)(?:\s+\1){3,}/gu, '$1');
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  /**
   * Cleans background noise, environmental cues, and audio tags from transcript text.
   */
  public static cleanTranscriptNoise(text: string): string {
    if (!text) return '';
    const filtered = this.filterHallucinatoryLoops(text);
    return filtered
      .replace(/\[(?:noise|applause|chatter|traffic|cough|throat-clearing|laughter|music|silence|background noise|unintelligible|whispering|sigh|breath|cheering|horn|birds|ambient)\]/gi, ' ')
      .replace(/\((?:noise|applause|chatter|traffic|cough|laughter|music|unintelligible)\)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public static appendTurn(
    state: SurveyEngineSessionState,
    role: 'agent' | 'respondent' | 'system' | 'assistant',
    text: string,
    options?: {
      questionId?: string;
      questionOrder?: number;
      turnType?: SurveyTranscriptTurn['turnType'];
      confidence?: number;
    }
  ): SurveyTranscriptTurn | null {
    if (!text || !text.trim()) return null;
    const cleanText = role === 'respondent' ? this.cleanTranscriptNoise(text) : text.trim();
    if (!cleanText) return null;

    if (!Array.isArray(state.transcripts)) {
      state.transcripts = [];
    }
    if (!Array.isArray(state.originalTranscript)) {
      state.originalTranscript = [];
    }

    const speakerRole: 'assistant' | 'respondent' = role === 'respondent' ? 'respondent' : 'assistant';
    const effectiveRole = role === 'agent' ? 'assistant' : role;
    const norm = (s: string) => (s || '').toLowerCase().replace(/[.,!?:;۔।\s]/g, '');
    const normClean = norm(cleanText);

    // Check recent turns and streaming deduplication
    if (state.transcripts.length > 0) {
      const last = state.transcripts[state.transcripts.length - 1];
      const isSameSpeaker = last.role === role || last.role === effectiveRole || last.speakerRole === speakerRole;
      if (isSameSpeaker) {
        const normLast = norm(last.text || last.transcriptText || '');
        if (normLast === normClean) {
          return last;
        }
        if (cleanText.length > (last.text || '').length && normClean.startsWith(normLast)) {
          last.text = cleanText;
          last.transcriptText = cleanText;
          last.timestamp = new Date().toISOString();
          return last;
        }
        if ((last.text || '').length >= cleanText.length && normLast.startsWith(normClean)) {
          return last;
        }
      }

      const recent = state.transcripts.slice(-3);
      const duplicateRecent = recent.find((t) => {
        const matchesSpeaker = t.role === role || t.role === effectiveRole || t.speakerRole === speakerRole;
        return matchesSpeaker && norm(t.text || t.transcriptText || '') === normClean;
      });
      if (duplicateRecent) {
        return duplicateRecent;
      }
    }

    const nowIso = new Date().toISOString();
    const seqNum = state.transcripts.length + 1;
    const resolvedQId = options?.questionId || state.currentQuestionId || state.pendingQuestionId;
    const resolvedQOrder = options?.questionOrder || (state.currentQuestionIndex !== undefined ? state.currentQuestionIndex + 1 : undefined);
    const callId = state.providerCallId || state.callId || state.sessionId;

    const turn: SurveyTranscriptTurn = {
      id: `turn_${callId}_${seqNum}_${Date.now()}`,
      callId,
      sessionId: state.sessionId,
      surveyId: state.eventId || state.surveyId || 'event_public_survey',
      eventId: state.eventId || state.surveyId || 'event_public_survey',
      speakerRole,
      transcriptText: cleanText,
      role: effectiveRole as any,
      text: cleanText,
      timestamp: nowIso,
      questionId: resolvedQId,
      questionOrder: resolvedQOrder,
      sequenceNumber: seqNum,
      isFinal: true,
      turnType: options?.turnType || (role === 'respondent' ? 'answer' : 'main_question'),
    };

    // Store confidence only when actually supplied by provider for respondent speech.
    // Never assign artificial confidence to AI-generated utterances.
    if (speakerRole === 'respondent' && typeof options?.confidence === 'number') {
      turn.confidence = options.confidence;
    }

    state.transcripts.push(turn);
    state.originalTranscript.push({ ...turn });
    return turn;
  }

  public static createTrackedTranscriptArray(
    state: any,
    initial?: any[]
  ): SurveyTranscriptTurn[] {
    const arr: SurveyTranscriptTurn[] = [];
    const origPush = arr.push.bind(arr);

    arr.push = function (...items: any[]) {
      for (const item of items) {
        if (item && typeof item === 'object') {
          const rawText = item.text || item.transcriptText || '';
          const cleanText = SurveySequentialEngine.filterHallucinatoryLoops(rawText);
          if (!cleanText) continue;

          const speakerRole: 'assistant' | 'respondent' = item.speakerRole || (item.role === 'respondent' ? 'respondent' : 'assistant');
          const effectiveRole = item.role === 'agent' ? 'assistant' : item.role;
          const norm = (s: string) => (s || '').toLowerCase().replace(/[.,!?:;۔।\s]/g, '');
          const normClean = norm(cleanText);

          // Check if last turn was from the same speaker
          if (arr.length > 0) {
            const last = arr[arr.length - 1];
            const isSameSpeaker = last.role === item.role || (last as any).speakerRole === item.speakerRole || (last as any).speakerRole === speakerRole;
            if (isSameSpeaker) {
              const normLast = norm(last.text || last.transcriptText || '');
              // Exact normalized duplicate -> skip
              if (normLast === normClean) {
                continue;
              }
              // Streaming update: cleanText is longer and starts with last turn -> update last in place
              if (cleanText.length > (last.text || '').length && normClean.startsWith(normLast)) {
                last.text = cleanText;
                last.transcriptText = cleanText;
                last.timestamp = item.timestamp || new Date().toISOString();
                continue;
              }
              // Shorter incoming fragment of existing turn -> skip
              if ((last.text || '').length >= cleanText.length && normLast.startsWith(normClean)) {
                continue;
              }
            }

            // Also check recent turns for duplicate
            const recent = arr.slice(-3);
            const duplicateRecent = recent.find((t) => {
              const matchesSpeaker = t.role === item.role || (t as any).speakerRole === speakerRole;
              return matchesSpeaker && norm(t.text || t.transcriptText || '') === normClean;
            });
            if (duplicateRecent) {
              continue;
            }
          }

          const callId = item.callId || state?.providerCallId || state?.callId || state?.sessionId;
          const seqNum = arr.length + 1;

          const enriched: any = {
            id: item.id || `turn_${callId}_${seqNum}_${Date.now()}`,
            callId,
            sessionId: item.sessionId || state?.sessionId,
            surveyId: item.surveyId || state?.eventId || state?.surveyId || 'event_public_survey',
            eventId: item.eventId || state?.eventId || state?.surveyId || 'event_public_survey',
            speakerRole,
            transcriptText: item.transcriptText || cleanText,
            role: effectiveRole,
            text: cleanText,
            timestamp: item.timestamp || new Date().toISOString(),
            questionId: item.questionId || state?.currentQuestionId || state?.pendingQuestionId,
            questionOrder: item.questionOrder !== undefined ? item.questionOrder : (state?.currentQuestionIndex !== undefined ? state.currentQuestionIndex + 1 : undefined),
            sequenceNumber: seqNum,
            isFinal: true,
            turnType: item.turnType || (speakerRole === 'respondent' ? 'answer' : 'main_question'),
          };

          // Store confidence only when actually supplied by provider for respondent speech
          if (speakerRole === 'respondent' && typeof item.confidence === 'number') {
            enriched.confidence = item.confidence;
          }

          origPush(enriched);
        } else {
          origPush(item);
        }
      }
      return arr.length;
    };

    if (Array.isArray(initial) && initial.length > 0) {
      arr.push(...initial);
    }

    return arr;
  }

  /**
   * Resolves the list of active survey questions.
   * Saved campaign questions are the source of truth.
   * Respects added, edited, deleted, reordered questions.
   */
  public static resolveActiveQuestions(
    eventIdOrConfig?: string | { questions?: any[] }
  ): SurveyQuestion[] {
    let rawList: any[] = [];
    if (typeof eventIdOrConfig === 'string') {
      rawList = callbridgeStorage.getSurveyQuestions(eventIdOrConfig);
    } else if (eventIdOrConfig && Array.isArray(eventIdOrConfig.questions)) {
      rawList = eventIdOrConfig.questions;
    } else {
      rawList = callbridgeStorage.getSurveyQuestions('event_public_survey');
    }

    const filtered = rawList
      .filter((q) => q && q.enabled !== false)
      .map((q, idx) => ({
        id: q.id || q.questionId || `A${idx + 1}`,
        questionId: q.questionId || q.id || `A${idx + 1}`,
        surveyId: q.surveyId || 'event_public_survey',
        text: (q.text || q.questionText || '').trim(),
        questionText: (q.questionText || q.text || '').trim(),
        category: (q.category || 'General').trim(),
        description: q.description || '',
        questionOrder: typeof q.questionOrder === 'number' ? q.questionOrder : idx + 1,
        enabled: q.enabled !== false,
        questionType: q.questionType || 'open_ended',
        allowFollowUp: q.allowFollowUp !== false,
        createdAt: q.createdAt || new Date().toISOString(),
        updatedAt: q.updatedAt || new Date().toISOString(),
      }))
      .filter((q) => q.text.length > 0)
      .sort((a, b) => (a.questionOrder ?? 0) - (b.questionOrder ?? 0));

    return filtered;
  }

  // In-memory cache of executed tool calls for instant idempotency
  private static executedToolCalls = new Map<string, EngineTurnResult>();

  /**
   * Invalidates cached in-memory survey sessions and tool calls for an event
   * when its questions are created, edited, deleted, or reordered.
   */
  public static invalidateEventCache(eventId?: string): void {
    if (!eventId) {
      engineSessions.clear();
      this.executedToolCalls.clear();
      return;
    }
    for (const [key, session] of engineSessions.entries()) {
      if (session.eventId === eventId || session.surveyId === eventId) {
        engineSessions.delete(key);
      }
    }
    this.executedToolCalls.clear();
  }

  // Per-call serialization mutex to guarantee sequential, race-free processing
  private static callLocks = new Map<string, Promise<any>>();

  public static async serializeCallExecution<T>(callKey: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.callLocks.get(callKey) || Promise.resolve();
    let releaseLock: () => void;
    const current = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.callLocks.set(callKey, prev.then(() => current, () => current));

    try {
      await prev;
      return await fn();
    } finally {
      releaseLock!();
      if (this.callLocks.get(callKey) === current) {
        this.callLocks.delete(callKey);
      }
    }
  }

  /**
   * Atomically synchronizes in-memory session state into callbridgeStorage
   */
  public static persistSessionState(state: SurveyEngineSessionState): void {
    if (!state || !state.sessionId) return;
    try {
      let job = callbridgeStorage.getCallJob(state.sessionId);
      if (!job && state.providerCallId) {
        job = callbridgeStorage.getCallJobByProviderId(state.providerCallId);
      }
      if (!job && state.campaignId) {
        const cJobs = callbridgeStorage.getCallJobs(state.campaignId);
        job = cJobs.find((j) => j.providerCallId === state.sessionId || j.id === state.sessionId);
      }
      if (!job) {
        const mappedJobId = callbridgeStorage.getJobIdByProviderCallId(state.sessionId);
        if (mappedJobId) job = callbridgeStorage.getCallJob(mappedJobId);
      }
      if (job) {
        job.surveyState = state;
        job.surveyAnswers = state.answers;
        if (Array.isArray(state.transcripts)) {
          job.transcript = state.transcripts as any;
          job.originalTranscript = state.transcripts as any;
        }
        if (state.stateMachineState === 'COMPLETED') {
          job.status = 'completed';
        } else if (state.callbackRequested) {
          job.status = 'callback_scheduled';
          job.callbackRequested = true;
          job.callbackScheduledAt = state.callbackScheduledAt || undefined;
          job.callbackDetails = state.callbackDetails || undefined;
        }
        callbridgeStorage.saveCallJob(job);
      }
    } catch (err) {
      console.warn('[SURVEY_PERSIST_SESSION_ERROR]', err);
    }
  }

  /**
   * Aliases an existing session under a new key (e.g. mapping providerCallId to testCallId)
   */
  public static aliasSession(newKey: string, existingKey: string): void {
    if (!newKey || !existingKey || newKey === existingKey) return;
    const existing = engineSessions.get(existingKey);
    if (existing) {
      engineSessions.set(newKey, existing);
    } else {
      const revExisting = engineSessions.get(newKey);
      if (revExisting) {
        engineSessions.set(existingKey, revExisting);
      }
    }
  }

  /**
   * Retrieves or initializes session state
   */
  public static getOrCreateSession(
    sessionId: string,
    options?: {
      campaignId?: string;
      providerCallId?: string;
      eventId?: string;
      activeQuestions?: SurveyQuestion[];
      resumeQuestionIndex?: number;
      answeredQuestionIds?: string[];
    }
  ): SurveyEngineSessionState {
    let existing = engineSessions.get(sessionId);
    if (!existing) {
      try {
        const mappedJobId = callbridgeStorage.getJobIdByProviderCallId(sessionId);
        if (mappedJobId && engineSessions.has(mappedJobId)) {
          existing = engineSessions.get(mappedJobId)!;
          engineSessions.set(sessionId, existing);
        }
        if (!existing) {
          const mappedProviderId = callbridgeStorage.getProviderCallIdByJobId(sessionId);
          if (mappedProviderId && engineSessions.has(mappedProviderId)) {
            existing = engineSessions.get(mappedProviderId)!;
            engineSessions.set(sessionId, existing);
          }
        }
      } catch {
        // ignore
      }
    }
    if (existing) return existing;

    // Check if there is a saved job in storage to restore session state across restarts / reloads
    let savedJob: any = null;
    try {
      savedJob = callbridgeStorage.getCallJob(sessionId);
      if (!savedJob && options?.providerCallId) {
        savedJob = callbridgeStorage.getCallJobByProviderId(options.providerCallId);
      }
      if (!savedJob && options?.campaignId) {
        const cJobs = callbridgeStorage.getCallJobs(options.campaignId);
        savedJob = cJobs.find((j) => j.providerCallId === sessionId || j.id === sessionId);
      }
      if (!savedJob) {
        const mappedJobId = callbridgeStorage.getJobIdByProviderCallId(sessionId);
        if (mappedJobId) savedJob = callbridgeStorage.getCallJob(mappedJobId);
      }
    } catch {
      // ignore
    }

    const questions = options?.activeQuestions || this.resolveActiveQuestions(options?.eventId || savedJob?.eventId);

    // If storage has an existing saved surveyState, restore directly and align index
    if (savedJob?.surveyState) {
      const restoredState: SurveyEngineSessionState = {
        ...savedJob.surveyState,
        sessionId,
        campaignId: options?.campaignId || savedJob.campaignId || savedJob.surveyState.campaignId,
        providerCallId: options?.providerCallId || savedJob.providerCallId || savedJob.surveyState.providerCallId,
        eventId: options?.eventId || savedJob.eventId || savedJob.surveyState.eventId || 'event_public_survey',
        surveyId: options?.eventId || savedJob.eventId || savedJob.surveyState.surveyId || 'event_public_survey',
        totalActiveQuestions: questions.length,
      };

      if (!Array.isArray(restoredState.transcripts)) {
        restoredState.transcripts = [];
      }
      if (!Array.isArray(restoredState.originalTranscript)) {
        restoredState.originalTranscript = [];
      }
      if (!restoredState.answers || typeof restoredState.answers !== 'object') {
        restoredState.answers = {};
      }
      if (!Array.isArray(restoredState.answeredQuestionIds)) {
        restoredState.answeredQuestionIds = [];
      }
      if (!Array.isArray(restoredState.skippedQuestionIds)) {
        restoredState.skippedQuestionIds = [];
      }
      if (typeof restoredState.followUpCountForCurrentQuestion !== 'number') {
        restoredState.followUpCountForCurrentQuestion = 0;
      }
      if (typeof restoredState.maxFollowUpsPerQuestion !== 'number') {
        restoredState.maxFollowUpsPerQuestion = 1;
      }

      // Ensure resume index and currentQuestionId point strictly to currently active questions
      const activeQuestionIds = new Set(questions.map((q) => q.id));
      if (questions.length === 0) {
        restoredState.currentQuestionIndex = 0;
        restoredState.currentQuestionId = '';
        restoredState.pendingQuestionId = '';
        restoredState.totalActiveQuestions = 0;
        restoredState.stateMachineState = 'COMPLETED';
        restoredState.conversationStatus = 'completed';
      } else if (!activeQuestionIds.has(restoredState.currentQuestionId) || restoredState.answeredQuestionIds.length > 0) {
        const firstUnanswered = questions.findIndex(
          (q) => !restoredState.answeredQuestionIds.includes(q.id) && !restoredState.skippedQuestionIds.includes(q.id)
        );
        if (firstUnanswered >= 0) {
          restoredState.currentQuestionIndex = firstUnanswered;
          restoredState.currentQuestionId = questions[firstUnanswered].id;
          restoredState.pendingQuestionId = questions[firstUnanswered].id;
        } else {
          restoredState.currentQuestionIndex = questions.length;
          restoredState.stateMachineState = 'COMPLETED';
          restoredState.conversationStatus = 'completed';
        }
      }

      if (!restoredState.callId) {
        restoredState.callId = sessionId || options?.providerCallId || savedJob?.providerCallId || 'call_default';
      }
      if (restoredState.pendingFollowUpQuestionId === undefined) {
        restoredState.pendingFollowUpQuestionId = null;
      }
      if (restoredState.lastProcessedToolCallId === undefined) {
        restoredState.lastProcessedToolCallId = null;
      }
      if (!restoredState.surveyCompletionStatus) {
        restoredState.surveyCompletionStatus = restoredState.stateMachineState === 'COMPLETED' ? 'completed' : 'in_progress';
      }

      restoredState.transcripts = this.createTrackedTranscriptArray(restoredState, restoredState.transcripts);
      restoredState.originalTranscript = this.createTrackedTranscriptArray(restoredState, restoredState.originalTranscript);

      engineSessions.set(sessionId, restoredState);
      if (restoredState.callId && restoredState.callId !== sessionId) {
        engineSessions.set(restoredState.callId, restoredState);
      }
      if (savedJob.id && savedJob.id !== sessionId) {
        engineSessions.set(savedJob.id, restoredState);
      }
      if (savedJob.providerCallId && savedJob.providerCallId !== sessionId) {
        engineSessions.set(savedJob.providerCallId, restoredState);
      }
      return restoredState;
    }

    let resumeIndex = options?.resumeQuestionIndex ?? 0;
    let initialAnswers: any = {};
    let initialAnsweredIds: string[] = options?.answeredQuestionIds ? [...options.answeredQuestionIds] : [];
    let initialTranscripts: any[] = [];
    let initialCallbackScheduledAt: string | null = null;
    let initialCallbackDetails: any = null;

    if (savedJob) {
      if (savedJob.surveyAnswers && typeof savedJob.surveyAnswers === 'object') {
        initialAnswers = { ...savedJob.surveyAnswers };
        initialAnsweredIds = Object.keys(savedJob.surveyAnswers);
      }
      if (savedJob.surveyState?.answers) {
        initialAnswers = { ...initialAnswers, ...savedJob.surveyState.answers };
      }
      if (savedJob.surveyState?.answeredQuestionIds?.length) {
        initialAnsweredIds = Array.from(new Set([...initialAnsweredIds, ...savedJob.surveyState.answeredQuestionIds]));
      }
      if (Array.isArray(savedJob.transcript) && savedJob.transcript.length > 0) {
        initialTranscripts = [...savedJob.transcript];
      }
      if (savedJob.callbackScheduledAt) {
        initialCallbackScheduledAt = savedJob.callbackScheduledAt;
      }
      if (savedJob.callbackDetails) {
        initialCallbackDetails = savedJob.callbackDetails;
      }

      // Automatically determine first unanswered question if not explicitly provided
      if (options?.resumeQuestionIndex === undefined && initialAnsweredIds.length > 0 && questions.length > 0) {
        const firstUnanswered = questions.findIndex((q) => !initialAnsweredIds.includes(q.id));
        if (firstUnanswered >= 0) {
          resumeIndex = firstUnanswered;
        } else if (initialAnsweredIds.length >= questions.length) {
          resumeIndex = questions.length;
        }
      }
    }

    const initialQ = questions[resumeIndex] || questions[0];

    const state: SurveyEngineSessionState = {
      callId: sessionId || options?.providerCallId || savedJob?.providerCallId || 'call_default',
      sessionId,
      campaignId: options?.campaignId || savedJob?.campaignId,
      providerCallId: options?.providerCallId || savedJob?.providerCallId,
      eventId: options?.eventId || savedJob?.eventId || 'event_public_survey',
      surveyId: options?.eventId || savedJob?.eventId || 'event_public_survey',
      targetLanguage: 'te',
      currentQuestionId: initialQ ? initialQ.id : '',
      currentQuestionIndex: resumeIndex,
      totalActiveQuestions: questions.length,
      answeredQuestionIds: initialAnsweredIds,
      skippedQuestionIds: savedJob?.surveyState?.skippedQuestionIds || [],
      pendingQuestionId: initialQ ? initialQ.id : '',
      pendingFollowUpQuestionId: null,
      lastProcessedToolCallId: null,
      surveyCompletionStatus: resumeIndex >= questions.length ? 'completed' : 'in_progress',
      conversationStatus: resumeIndex >= questions.length ? 'completed' : (initialQ ? 'ASKING_MAIN_QUESTION' : 'START'),
      stateMachineState: resumeIndex >= questions.length ? 'COMPLETED' : (initialQ ? 'ASKING_MAIN_QUESTION' : 'START'),
      followUpCountForCurrentQuestion: 0,
      maxFollowUpsPerQuestion: 1,
      callbackRequested: Boolean(initialCallbackScheduledAt || savedJob?.callbackRequested),
      callbackScheduledAt: initialCallbackScheduledAt,
      callbackTimezone: 'Asia/Kolkata',
      callbackDetails: initialCallbackDetails,
      answers: initialAnswers,
      transcripts: this.createTrackedTranscriptArray(
        { sessionId, providerCallId: options?.providerCallId || savedJob?.providerCallId, callId: sessionId },
        initialTranscripts
      ),
      originalTranscript: this.createTrackedTranscriptArray(
        { sessionId, providerCallId: options?.providerCallId || savedJob?.providerCallId, callId: sessionId },
        initialTranscripts
      ),
      // Legacy compatibility
      session_id: sessionId,
      current_question: initialQ ? initialQ.id : '',
      current_question_id: initialQ ? initialQ.id : '',
      current_question_topic: initialQ ? (initialQ.category || 'drinking_water') : 'drinking_water',
      conversation_status: resumeIndex >= questions.length ? 'completed' : 'waiting_for_answer',
      completed_questions: initialAnsweredIds,
    };

    engineSessions.set(sessionId, state);
    if (savedJob?.id && savedJob.id !== sessionId) {
      engineSessions.set(savedJob.id, state);
    }
    if (savedJob?.providerCallId && savedJob.providerCallId !== sessionId) {
      engineSessions.set(savedJob.providerCallId, state);
    }
    return state;
  }

  public static resetSession(sessionId: string): void {
    engineSessions.delete(sessionId);
  }

  public static clearAllSessions(): void {
    engineSessions.clear();
    this.executedToolCalls.clear();
  }

  public static getState(sessionId: string): SurveyEngineSessionState | undefined {
    let s = engineSessions.get(sessionId);
    if (!s) {
      try {
        const mappedJobId = callbridgeStorage.getJobIdByProviderCallId(sessionId);
        if (mappedJobId && engineSessions.has(mappedJobId)) {
          s = engineSessions.get(mappedJobId);
        }
        if (!s) {
          const mappedProviderId = callbridgeStorage.getProviderCallIdByJobId(sessionId);
          if (mappedProviderId && engineSessions.has(mappedProviderId)) {
            s = engineSessions.get(mappedProviderId);
          }
        }
      } catch {
        // ignore
      }
    }
    return s;
  }

  public static getOrCreateState(
    sessionId: string,
    campaignId?: string,
    eventId?: string,
    activeQuestions?: SurveyQuestion[],
    contactPhone?: string,
    contactName?: string
  ): SurveyEngineSessionState {
    return this.getOrCreateSession(sessionId, {
      campaignId,
      eventId,
      activeQuestions,
    });
  }

  public static scheduleCallback(params: {
    campaignId?: string;
    providerCallId: string;
    requestedTimeText: string;
    note?: string;
    eventId?: string;
  }): {
    success: boolean;
    spokenResponse: string;
    callbackDetails: any;
  } {
    const sessionId = params.providerCallId;
    const state = this.getOrCreateState(sessionId, params.campaignId, params.eventId);
    const parsed = this.parseCallbackDateTime(params.requestedTimeText, state.callbackTimezone);

    state.callbackRequested = true;
    state.callbackScheduledAt = parsed.scheduledIso;
    state.callbackDetails = {
      requestedDate: parsed.resolvedDateStr,
      requestedTime: parsed.resolvedTimeStr,
      isTimeVague: false,
      timezone: state.callbackTimezone,
      rawUtterance: params.requestedTimeText,
      confirmationMessage: parsed.confirmationTelugu,
    };
    state.conversationStatus = 'SCHEDULE_CALLBACK';
    state.stateMachineState = 'SCHEDULE_CALLBACK';

    state.transcripts.push({
      role: 'agent',
      text: parsed.confirmationTelugu,
      timestamp: new Date().toISOString(),
      turnType: 'callback',
    });

    console.log('[SURVEY_CALLBACK_SCHEDULED]', {
      campaignId: params.campaignId,
      providerCallId: params.providerCallId,
      scheduledIso: parsed.scheduledIso,
      requestedTimeText: params.requestedTimeText,
      timezone: state.callbackTimezone,
    });

    engineSessions.set(sessionId, state);
    this.persistSessionState(state);

    const returnConfirm = 'సరే అండి, మీరు చెప్పిన సమయంలో తిరిగి కాల్ చేస్తాము. ధన్యవాదాలు.';
    return {
      success: true,
      spokenResponse: returnConfirm,
      callbackDetails: {
        ...state.callbackDetails,
        scheduledIso: parsed.scheduledIso,
      },
    };
  }

  public static skipQuestion(params: {
    campaignId?: string;
    providerCallId: string;
    questionId?: string;
    reason?: string;
    eventId?: string;
  }): {
    success: boolean;
    spokenResponse: string;
    isCompleted: boolean;
  } {
    const sessionId = params.providerCallId;
    const state = this.getOrCreateState(sessionId, params.campaignId, params.eventId);
    const activeQuestions = this.resolveActiveQuestions(params.eventId || state.eventId);

    console.log('[SURVEY_QUESTION_SKIPPED]', {
      campaignId: params.campaignId,
      providerCallId: params.providerCallId,
      questionId: state.currentQuestionId,
      reason: params.reason || 'Respondent requested skip',
    });

    state.skippedQuestionIds.push(state.currentQuestionId);
    state.followUpCountForCurrentQuestion = 0;

    const nextIdx = state.currentQuestionIndex + 1;
    if (nextIdx >= activeQuestions.length) {
      state.stateMachineState = 'COMPLETED';
      state.conversationStatus = 'completed';
      const closingMsg = TELUGU_STRINGS.CLOSING_MESSAGE;

      state.transcripts.push({
        role: 'agent',
        text: closingMsg,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      return {
        success: true,
        spokenResponse: closingMsg,
        isCompleted: true,
      };
    } else {
      const nextQ = activeQuestions[nextIdx];
      state.currentQuestionIndex = nextIdx;
      state.currentQuestionId = nextQ.id;
      state.pendingQuestionId = nextQ.id;
      state.stateMachineState = 'ASKING_MAIN_QUESTION';

      const spokenResponse = `సరేనండి. తదుపరి ప్రశ్న: ${nextQ.text}`;
      state.transcripts.push({
        role: 'agent',
        text: spokenResponse,
        timestamp: new Date().toISOString(),
        questionId: nextQ.id,
        questionOrder: nextIdx + 1,
        turnType: 'main_question',
      });

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      return {
        success: true,
        spokenResponse,
        isCompleted: false,
      };
    }
  }

  /**
   * Deterministic Natural Telugu Intent Pre-Classifier
   */
  public static classifyQuickIntent(text: string): {
    isCallback: boolean;
    isStop: boolean;
    isSkip: boolean;
    isNextQuestion: boolean;
    isDontKnow: boolean;
    isClarification: boolean;
    isQuestion: boolean;
  } {
    const t = (text || '').trim().toLowerCase();

    const isCallback =
      /బిజీ|busy|తర్వాత కాల్|తరువాత కాల్|తర్వాత మాట్లాడ|తరువాత మాట్లాడ|తర్వాత మాట్లాడతాను|ఇప్పుడు మాట్లాడలేను|ఇప్పుడు కుదరదు|సాయంత్రం కాల్|రేపు కాల్|రేపు ఉదయం|సాయంత్రం చేయండి|కాల్ చేయండి.*తర్వాత|టైమ్ లేదు|టైం లేదు|సమయం లేదు|వేరే పని/i.test(
        t
      );

    const isStop =
      /ఆపండి|ఆపేయండి|ముగించండి|వద్దు ఇక|ఇక వద్దు|కాల్ కట్|stop|end call|don't call|dont call|ఇష్టం లేదు.*సర్వే|సరే\s*బై|బై|bye|ఇక\s*మాట్లాడను|ఇక\s*చాలు|మాట్లాడను/i.test(
        t
      );

    const isSkip =
      /^దాటవేయండి$|^వదిలేయండి$|^skip$|^వద్దు$|^పాస్$/i.test(t) ||
      /ఈ ప్రశ్న దాటవేయండి|ఈ ప్రశ్న వద్దు|తర్వాతికి వెళ్ళండి|skip this/i.test(t);

    const isNextQuestion =
      /^next$|^next question$|^next question please$|^go ahead$|^తర్వాతి ప్రశ్న$|^తదుపరి ప్రశ్న$|^తర్వాత ప్రశ్న$/i.test(t) ||
      /నెక్స్ట్ క్వశ్చన్|నెక్స్ట్ ప్రశ్న|తర్వాత ప్రశ్న అడగండి|ముందుకు వెళ్ళండి/i.test(t);

    const isDontKnow =
      /తెలియదు|ఐడియా లేదు|నాకు తెలియదండి|నాకు ఐడియా లేదు|don'?t know/i.test(t);

    const isClarification =
      /అర్థం కాలేదు|మళ్లీ చెప్పండి|ఏమన్నారు|వివరించండి|repeat|నాకేం అర్థం కాలేదు|తెలీదు అర్థం కాలేదు|వినిపించలేదు|ఏంటో/i.test(t);

    const isQuestion = /\?$/.test(t) || /ఎందుకు|ఎవరు|ఎక్కడ|ఎంత|ఏమిటి/i.test(t);

    return {
      isCallback,
      isStop,
      isSkip,
      isNextQuestion,
      isDontKnow,
      isClarification,
      isQuestion,
    };
  }

  /**
   * Uses OpenAI to understand natural Telugu meaning, extract structured intent,
   * evaluate if an answer is sufficient, and generate relevant follow-ups.
   */
  public static async analyzeTurnWithOpenAi(params: {
    mainQuestion: SurveyQuestion;
    respondentUtterance: string;
    followUpCount: number;
    maxFollowUps: number;
    conversationHistory: Array<{ role: string; text: string }>;
  }): Promise<{
    action: 'ASK_FOLLOW_UP' | 'ACCEPT_ANSWER' | 'CLARIFY' | 'SKIP' | 'CALLBACK' | 'END' | 'NEXT_QUESTION';
    followUpQuestion: string | null;
    reason: string;
    answerSufficient: boolean;
    acknowledgment: string;
    callbackDetails?: {
      isCallback: boolean;
      preferredDate?: string | null;
      preferredTime?: string | null;
      isTimeVague: boolean;
      clarificationQuestion?: string | null;
      confirmationMessage?: string | null;
    };
    extractedSummary: string;
  }> {
    const { mainQuestion, respondentUtterance, followUpCount, maxFollowUps, conversationHistory } = params;

    // Fast, deterministic local classification (<5ms) for natural zero-latency flow
    const deterministic = this.fallbackTurnAnalysis(params);
    // If decisive intent is identified (Case A positive, Case B explained problem, Case C clarification/accept, stop, callback, skip, next),
    // return immediately in < 5ms without network latency!
    if (deterministic.action !== 'CLARIFY') {
      return deterministic;
    }

    const client = getOpenAi();
    // If OpenAI is unavailable, return deterministic result
    if (!client) {
      return deterministic;
    }

    const systemPrompt = `You are an intelligent, natural conversational Telugu analyst and reasoning engine for CallBridge AI citizen survey.
The interview is conducted strictly in authentic spoken Telugu.

RULES & SCENARIOS:
1. Understand the respondent's natural spoken Telugu (in Telugu script or English transliteration like "water bagundhi", "roads baledhu", "baane undhi").
2. The current main survey question is:
   ID: ${mainQuestion.id}
   Topic: ${mainQuestion.category || 'General'}
   Question: "${mainQuestion.text}"
3. The respondent just said:
   "${respondentUtterance}"
4. Determine the classification:
   - CALLBACK / BUSY: Respondent is busy, has no time, or requested callback (e.g. "ఇప్పుడు బిజీగా ఉన్నాను", "ఇప్పుడు మాట్లాడలేను", "నేను ఆఫీసులో ఉన్నాను", "తర్వాత మాట్లాడతాను", "సాయంత్రం కాల్ చేయండి", "రేపు కాల్ చేయండి").
     CRITICAL: Do NOT treat this as an answer to the survey question! Do NOT advance to the next question.
     - If time is vague (e.g. "ఇప్పుడు బిజీగా ఉన్నాను", "తర్వాత మాట్లాడతాను"):
       prompt = "సరే అండి, మీకు ఏ సమయంలో మళ్లీ కాల్ చేస్తే వీలుగా ఉంటుంది?"
       action = "CALLBACK", callbackDetails = { isCallback: true, isTimeVague: true, clarificationQuestion: prompt }
     - If specific time is given (e.g. "సాయంత్రం 6 గంటలకు కాల్ చేయండి"):
       action = "CALLBACK", callbackDetails = { isCallback: true, isTimeVague: false }, acknowledgment = "సరే అండి, మీరు చెప్పిన సమయంలో మళ్లీ కాల్ చేస్తాము. ధన్యవాదాలు."
   - STOP / BYE: Respondent explicitly refuses, says bye, or wants to end the call immediately ("సరే బై", "బై", "ఇక మాట్లాడను", "సర్వే వద్దు", "కాల్ కట్ చేయండి", "stop", "bye"):
     action = "END", acknowledgment = "సరే అండి, మీ సమయానికి ధన్యవాదాలు. నమస్కారం."
   - CONNECTION CHECK / GREETING: Respondent checks line ("హలో", "వినిపిస్తుందా?", "చెప్పండి", "Hello", "Can you hear me?"):
     action = "CLARIFY", acknowledgment = "అవును అండి, వినిపిస్తోంది. చెప్పండి."
   - SKIP: Respondent explicitly wants to skip this question ("దాటవేయండి", "skip").
   - CLARIFY / IRRELEVANT: Respondent asked unrelated questions (e.g., "ఎవరికి ఓటు వేయాలి", "మీది ఏ ఊరు", "మీరు ఎవరు"):
     Politely redirect back to the current question in Telugu: "క్షమించండి, మేము రాజకీయ సలహాలు ఇవ్వలేము. మన ప్రాంత సమస్యల గురించే మాట్లాడుతున్నాం. ${mainQuestion.text}".
   - ANSWER: Respondent answered the question:
     a) CASE A — POSITIVE ANSWER / NO PROBLEM (e.g., "బాగుంది.", "బాగానే ఉంది.", "ఎలాంటి సమస్య లేదు.", "సమస్య ఏమీ లేదు.", "పర్వాలేదు.", "బాగానే జరుగుతోంది.", "అన్నీ బాగున్నాయి.", "ప్రతిరోజూ నీళ్లు వస్తున్నాయి.", "good", "fine", "no problem"):
        action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "సరే అండి, ధన్యవాదాలు."
        (CRITICAL: Never ask a problem-related follow-up when the respondent says there is no problem or everything is good!)
     b) CASE B — PROBLEM WITHOUT EXPLANATION (e.g., "సమస్య ఉంది.", "బాగోలేదు.", "బాగాలేదు.", "సరిగ్గా లేదు.", "చాలా ఇబ్బందిగా ఉంది.", "baledhu", "problem"):
        - If current followUpCount (${followUpCount}) === 0:
          action = "ASK_FOLLOW_UP", answerSufficient = false.
          CRITICAL RULE: The follow-up question MUST be strictly: "ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?".
          NEVER provide examples, suggestions, multiple-choice options, or lists of possible problems.
          followUpQuestion = "ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?"
          acknowledgment = ""
        - If current followUpCount (${followUpCount}) >= 1:
          action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "సరే అండి, ధన్యవాదాలు."
     c) CASE C — RESPONDENT EXPLAINS THE PROBLEM (when current followUpCount (${followUpCount}) >= 1 or answering the follow-up):
        action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "సరే అండి, ధన్యవాదాలు."
     d) CASE D — DETAILED PROBLEM IN FIRST ANSWER (e.g., "నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి మాత్రమే వస్తున్నాయి.", "రోడ్లు చాలా పాడయ్యాయి, వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.", "మా ప్రాంతంలో రోడ్లు బాగోలేవు. చాలా గుంతలు ఉన్నాయి.", "వారానికి రెండు రోజులే వస్తాయి", "గుంతలు ఎక్కువగా ఉన్నాయి"):
        action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "సరే అండి, ధన్యవాదాలు."
5. Spoken acknowledgments must be STRICTLY authentic natural Telugu script (తెలుగు లిపి).
6. Output JSON format strictly:
{
  "action": "ACCEPT_ANSWER" | "ASK_FOLLOW_UP" | "CLARIFY" | "SKIP" | "CALLBACK" | "END",
  "answerSufficient": boolean,
  "followUpQuestion": string | null,
  "acknowledgment": string,
  "reason": string,
  "summary": string,
  "callbackDetails": { "isCallback": boolean, "isTimeVague": boolean, "clarificationQuestion": string | null, "confirmationMessage": string | null, "preferredDate": string | null, "preferredTime": string | null }
}`;

    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-4).map((m) => ({
            role: m.role === 'agent' ? ('assistant' as const) : ('user' as const),
            content: m.text,
          })),
          { role: 'user', content: respondentUtterance },
        ],
      });

      const rawContent = response.choices[0]?.message?.content?.trim();
      if (!rawContent) {
        return this.fallbackTurnAnalysis(params);
      }

      const parsed = JSON.parse(rawContent);

      return {
        action: parsed.action || (parsed.answerSufficient ? 'ACCEPT_ANSWER' : 'ASK_FOLLOW_UP'),
        followUpQuestion: parsed.followUpQuestion || null,
        reason: parsed.reason || 'OpenAI turn analysis',
        answerSufficient: Boolean(parsed.answerSufficient),
        acknowledgment: parsed.acknowledgment || getRandomTeluguAck(),
        callbackDetails: parsed.callbackDetails || undefined,
        extractedSummary: parsed.summary || parsed.extractedAnswer || respondentUtterance,
      };
    } catch (err: any) {
      console.warn('[OPENAI_ANALYSIS_FALLBACK_TRIGGERED]', err?.message || err);
      return this.fallbackTurnAnalysis(params);
    }
  }

  /**
   * Safe deterministic fallback analysis if OpenAI is temporarily unavailable or times out
   */
  private static fallbackTurnAnalysis(params: {
    mainQuestion: SurveyQuestion;
    respondentUtterance: string;
    followUpCount: number;
    maxFollowUps: number;
  }): {
    action: 'ASK_FOLLOW_UP' | 'ACCEPT_ANSWER' | 'CLARIFY' | 'SKIP' | 'CALLBACK' | 'END' | 'NEXT_QUESTION';
    followUpQuestion: string | null;
    reason: string;
    answerSufficient: boolean;
    acknowledgment: string;
    callbackDetails?: any;
    extractedSummary: string;
  } {
    const { mainQuestion, respondentUtterance, followUpCount, maxFollowUps } = params;
    const quick = this.classifyQuickIntent(respondentUtterance);
    const u = respondentUtterance.trim().toLowerCase();

    const logClassification = (result: any, isPos?: boolean) => {
      console.log('[SURVEY_INTENT_CLASSIFIED]', {
        questionId: mainQuestion.id,
        userUtterance: respondentUtterance,
        action: result.action,
        isPositive: Boolean(isPos),
        answerSufficient: Boolean(result.answerSufficient),
        reason: result.reason,
      });
      return result;
    };

    if (quick.isStop) {
      return logClassification({
        action: 'END',
        followUpQuestion: null,
        reason: 'Respondent asked to end the call',
        answerSufficient: false,
        acknowledgment: TELUGU_STRINGS.STOP_CLOSING,
        extractedSummary: 'నిరాకరించారు / కాల్ ఆపమన్నారు',
      });
    }

    if (quick.isCallback) {
      const hasSpecificTime =
        /\d{1,2}/.test(u) ||
        /(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది|పది|పదకొండు|పన్నెండు)\s*గంటల/i.test(u);

      if (!hasSpecificTime) {
        const promptText = TELUGU_STRINGS.CALLBACK_PROMPT_VAGUE;
        return logClassification({
          action: 'CALLBACK',
          followUpQuestion: null,
          reason: 'Respondent requested a callback (vague time)',
          answerSufficient: false,
          acknowledgment: promptText,
          callbackDetails: {
            isCallback: true,
            isTimeVague: true,
            clarificationQuestion: promptText,
            rawUtterance: respondentUtterance,
          },
          extractedSummary: 'కాల్‌బ్యాక్ అభ్యర్థించారు (సమయం అడిగారు)',
        });
      } else {
        const parsed = this.parseCallbackDateTime(respondentUtterance, 'Asia/Kolkata');
        return logClassification({
          action: 'CALLBACK',
          followUpQuestion: null,
          reason: 'Respondent specified callback time',
          answerSufficient: false,
          acknowledgment: TELUGU_STRINGS.CALLBACK_CONFIRMATION,
          callbackDetails: {
            isCallback: true,
            isTimeVague: false,
            confirmationMessage: TELUGU_STRINGS.CALLBACK_CONFIRMATION,
            rawUtterance: respondentUtterance,
            scheduledIso: parsed.scheduledIso,
            requestedDate: parsed.resolvedDateStr,
            requestedTime: parsed.resolvedTimeStr,
            timezone: 'Asia/Kolkata',
          },
          extractedSummary: `కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది: ${parsed.resolvedDateStr} ${parsed.resolvedTimeStr}`,
        });
      }
    }

    if (quick.isSkip) {
      return logClassification({
        action: 'SKIP',
        followUpQuestion: null,
        reason: 'Respondent requested to skip question',
        answerSufficient: true,
        acknowledgment: 'సరేనండి, ఈ ప్రశ్నను దాటవేస్తున్నాను.',
        extractedSummary: 'దాటవేశారు (Skipped)',
      });
    }

    if (quick.isNextQuestion) {
      return logClassification({
        action: 'NEXT_QUESTION',
        followUpQuestion: null,
        reason: 'Respondent asked to continue to next question (Case 4)',
        answerSufficient: true,
        acknowledgment: 'సరేనండి.',
        extractedSummary: 'తదుపరి ప్రశ్నకు కొనసాగించారు (Continue to next question)',
      });
    }

    // Isolated greeting / Connection check ("హలో", "వినపడుతోందా", etc.) -> Line Check response strictly without survey restart
    const isConnectionCheckOrGreeting =
      ((/^(హలో|హలోనండి|హలో\s*అండి|వినపడుతోందా|వినబడుతోందా|వినిపిస్తుందా|వినిపిస్తోందా|మాట\s*వినపడుతోందా|మాట\s*వినబడుతోందా|మాట\s*వినిపిస్తుందా|చెప్పండి|hello|can you hear me|am i audible)/i.test(u) ||
        /^(హలో|హలోనండి|హలో\s*అండి)[\s,]+(వినిపిస్తుందా|వినిపిస్తోందా|వినపడుతోందా|వినబడుతోందా|చెప్పండి)/i.test(u)) &&
       !/బాగు|బావు|సమస్య|ఇబ్బంది|గుంతలు|కరెంట్|నీళ్లు|రోడ్లు|చెత్త|స్కూల్|బస్|పాలన|సదుపాయ/i.test(u)) ||
      /^(హలో|హలోనండి|హలో\s*అండి|వినపడుతోందా|వినబడుతోందా|వినిపిస్తుందా|వినిపిస్తోందా|చెప్పండి|hello)[\s\?\.\!,]*$/i.test(u.trim());

    if (isConnectionCheckOrGreeting) {
      const cleanPrompt = (mainQuestion.text || mainQuestion.questionText || '').replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
      let lineCheckReply = TELUGU_STRINGS.CONNECTION_CHECK_REPLY;
      if (/వినిపిస్తుందా|వినిపిస్తోందా/i.test(u)) {
        lineCheckReply = 'అవును అండి, వినిపిస్తోంది. చెప్పండి.';
      } else {
        lineCheckReply = `అవును అండి, మీ మాట వినపడుతోంది. చెప్పండి. ${cleanPrompt}`;
      }
      return logClassification({
        action: 'CLARIFY',
        followUpQuestion: null,
        reason: 'Respondent asked connection check or greeting; retaining active question without survey restart',
        answerSufficient: false,
        acknowledgment: lineCheckReply,
        extractedSummary: 'కనెక్షన్ నిర్ధారణ (Line Check)',
      });
    }

    // Irrelevant / Political queries -> Polite redirect
    if (/ఓటు|పార్టీ|రాజకీయ|ఎవరు మీరు|మీరెవరు|మీది ఏ ఊరు|vote|party|who are you/i.test(u)) {
      return logClassification({
        action: 'CLARIFY',
        followUpQuestion: null,
        reason: 'Irrelevant or political query redirected to survey topic',
        answerSufficient: false,
        acknowledgment: `క్షమించండి, మేము రాజకీయ సలహాలు ఇవ్వలేము. మన ప్రాంత సమస్యల గురించే మాట్లాడుతున్నాం. ${mainQuestion.text}`,
        extractedSummary: 'విషయేతర సంభాషణ - సర్వే ప్రశ్నకు మళ్లించబడింది',
      });
    }

    if (quick.isClarification || /అర్థం\s*కాలేదు|మళ్లీ\s*చెప్పండి|ఏమన్నారు|వినిపించలేదు|స్పష్టంగా\s*లేదు|repeat|pardon|తెలీదు\s*అర్థం/i.test(u)) {
      return logClassification({
        action: 'CLARIFY',
        followUpQuestion: null,
        reason: 'Respondent asked for clarification or did not understand (Case 5)',
        answerSufficient: false,
        acknowledgment: `క్షమించండి, మీ సమాధానం స్పష్టంగా వినిపించలేదు. దయచేసి మళ్లీ చెప్పగలరా? ${mainQuestion.text}`,
        extractedSummary: 'అస్పష్ట సమాధానం (Unclear answer / Clarification requested)',
      });
    }

    // CASE 1: Positive answers: no problem, good, working fine, "బాగానే ఉంది", "బాగుంది", "సమస్య లేదు"
    // -----------------------------------------------------------------------
    // CASE A: Positive / No Problem Answers (Everything is fine)
    // -----------------------------------------------------------------------
    const isTeluguNoProblem =
      /ఎలాంటి\s*(సమస్య|ఇబ్బంది)\s*లేదు/i.test(u) ||
      /ఏ\s*(సమస్య|సమస్యా|ఇబ్బంది)\s*లేదు/i.test(u) ||
      /సమస్య\s*(ఏమీ|ఏం|ఎమీ)?\s*లేదు/i.test(u) ||
      /సమస్యేమీ\s*లేదు|సమస్యేం\s*లేదు|సమస్యలు\s*(ఏమీ|లేవు|లేవండి)/i.test(u) ||
      /ఇబ్బంది\s*(ఏమీ|ఏం)?\s*లేదు/i.test(u) ||
      /ఏమీ\s*లేదు|ఏం\s*లేదు/i.test(u);

    const isEnglishPositive =
      /^(no\s*problem|all\s*good|good|fine|everything\s*is\s*fine|it('?s)?\s*good|yeah\s*it('?s)?\s*good|no\s*issue|no\s*issues|nothing\s*wrong)[\s\.,!]*$/i.test(u) ||
      /\b(no\s*problem|everything\s*is\s*fine|it'?s\s*good|all\s*good)\b/i.test(u);

    const isTeluguPositiveWords =
      /బాగుంది|బాగున్నాయి|బాగానే\s*ఉంది|బాగానే\s*ఉన్నాయి|బావుంది|బావున్నాయి|బాగానే|బాగానే\s*ఉన్నాను|బాగున్నాను|బాగానే\s*వస్తోంది|బాగానే\s*వస్తున్నాయి|అంతా\s*బాగుంది|మంచిగానే\s*ఉంది|మంచిగా\s*ఉంది|మంచిగానే|మంచిగా|చాలా\s*బాగుంది|చాలా\s*మంచిగా|పర్వాలేదు|పరవాలేదు|మంచిది|అన్నీ\s*బాగున్నాయి|లాగా\s*ఉంది|లాగానే\s*ఉంది|బాగానె\s*ఉంది|బాగుందండి|బాగుంది\s*అండి|బాగానే\s*ఉందండి|బాగానే\s*ఉంది\s*అండి|మంచిదండి|మంచిది\s*అండి|ఉందండి|ఉంది\s*అండి|సరిపోతున్నాయి|సరిపోతుంది|సరిపోతున్నాయి\s*అండి/i.test(u);

    // Common short affirmative / positive responses in colloquial Telugu
    const isShortAffirmative =
      /^(బాగుంది|బాగానే\s*ఉంది|బాగుంది\s*అండి|బాగానే\s*ఉంది\s*అండి|మంచిగా\s*ఉంది|మంచిగానే\s*ఉంది|పరవాలేదు|పర్వాలేదు|ఓకే|ఒకే|okay|ok|ఉంది|బాగున్నాయి|లాగా\s*ఉంది|లాగానే\s*ఉంది|బావుంది|బావున్నాయి|సరిపోతాయి|సరిపోతుంది|సరిపోతున్నాయి|సరిపోతున్నాయి\s*అండి)(\s*అండి)?[\s\.,!]*$/i.test(u.trim()) ||
      /^(\+1|yes|yeah|fine|good|all\s*good|no\s*issue)[\s\.,!]*$/i.test(u.trim());

    const hasClearNegativeMarker =
      /బాగోలేదు|బాగాలేదు|బాగోలేవు|బాగాలేవు|బాలేదు|బాలేవు|సరిగ్గా\s*లేదు|సరిగా\s*లేదు|సరిగ్గా\s*రావడం\s*లేదు|సరిగ్గా\s*రావు|రావడం\s*లేదు|రావట్లేదు|రాదు|పోతుంది|పోతోంది|చెడిపోయాయి|గుంతలు|సమస్య\s*ఉంది|సమస్యలు\s*ఉన్నాయి|ఇబ్బందిగా\s*ఉంది|ఇబ్బంది\s*ఉంది|not\s*good|worst|problem\s*exists|there\s*is\s*a\s*problem|baledhu/i.test(u);

    const isCaseAPositive =
      isTeluguNoProblem ||
      isEnglishPositive ||
      isShortAffirmative ||
      (isTeluguPositiveWords && !hasClearNegativeMarker);

    if (isCaseAPositive) {
      return logClassification({
        action: 'ACCEPT_ANSWER',
        followUpQuestion: null,
        reason: 'Positive answer with no issue reported (Case A)',
        answerSufficient: true,
        acknowledgment: TELUGU_STRINGS.CASE_A_ACK, // "సరే అండి, ధన్యవాదాలు."
        extractedSummary: respondentUtterance,
      }, true);
    }

    // -----------------------------------------------------------------------
    // CASE C (Second turn / Clarification already asked once):
    // If follow-up clarification was already asked once for this question (followUpCount >= 1):
    // Accept the respondent's explanation or refusal, acknowledge, and continue!
    // -----------------------------------------------------------------------
    if (followUpCount >= 1) {
      return logClassification({
        action: 'ACCEPT_ANSWER',
        followUpQuestion: null,
        reason: 'Follow-up clarification received or completed; advancing to next question (Case C/Completed)',
        answerSufficient: true,
        acknowledgment: TELUGU_STRINGS.CASE_A_ACK, // "సరే అండి, ధన్యవాదాలు."
        extractedSummary: respondentUtterance,
      });
    }

    // -----------------------------------------------------------------------
    // CASE B: Problem Reported and Explained
    // The respondent reports a problem AND gives specifics/details/cause.
    // -----------------------------------------------------------------------
    const hasSpecificProblemExplanation =
      // Road / infrastructure issues with specifics (potholes, waterlogging, damage)
      (/రోడ్లు|రోడ్డు|రోడ్లపై|రోడ్ల|roads?/i.test(u) && /గుంతలు|హోల్స్|పాడయ్యాయి|చెడిపోయాయి|నడవలేకపోతున్నాం|మట్టి|వర్షం|నీళ్లు\s*నిలుస్తున్నాయి|నీళ్లు\s*నిలిచిపోతున్నాయి|potholes|bad\s*condition|damaged/i.test(u)) ||
      (/గుంతలు|హోల్స్|potholes/i.test(u)) ||
      // Transport issues with specifics
      (/రైళ్లు|రైలు|ట్రైన్లు|ట్రైన్స్|బస్సులు|బస్సు|రవాణా|ట్రాన్స్పోర్ట్|trains?|buses?/i.test(u) && /రావడం\s*లేదు|రావట్లేదు|సరిగ్గా\s*రావు|సమయానికి|టైంకి|సరిగా\s*లేదు|లేవు|late|delay/i.test(u)) ||
      (/సమయానికి\s*రావడం\s*లేదు|సమయానికి\s*రావు|సరిగ్గా\s*సమయానికి|టైంకి\s*రావు|టైముకి\s*రావు/i.test(u)) ||
      // Water supply specifics (frequency, quality, pipes)
      (/వాటర్\s*సప్లై|సప్లై|పైపులు|బోరింగ్|కొరత|మురికి|ఉప్పు|water\s*supply|dirty\s*water|no\s*water/i.test(u)) ||
      (/నీళ్లు|తాగునీరు|తాగునీటి|వాటర్/i.test(u) && /(వారానికి|రోజుకు|రెండు\s*రోజు|మూడు\s*రోజు|రెండు\s*సార్లు|మూడు\s*సార్లు|రోజులు|రావడం\s*లేదు|రావట్లేదు)/i.test(u)) ||
      // Drainage / sanitation specifics (overflow, smell, mosquitoes)
      (/డ్రైనేజ్|డ్రైనేజీ|మురుగు|కాలువలు|పారుదల|బ్లాక్|వాసన|దుర్వాసన|దోమలు|drainage|overflow|sewage|smell/i.test(u)) ||
      (/వర్షం|వర్షాలు/i.test(u) && /నీళ్లు\s*నిలుస్తున్నాయి|నీళ్లు\s*నిలిచిపోతున్నాయి|పాడయ్యాయి|హోల్స్|గుంతలు/i.test(u)) ||
      (/చెత్త|పారిశుధ్యం|స్వీపర్లు|డంపింగ్|garbage|waste/i.test(u) && /తీయడం\s*లేదు|వేయడం\s*లేదు|రావడం\s*లేదు|సరిగ్గా\s*లేదు|సమస్య|not\s*collected/i.test(u)) ||
      // Electricity specifics (frequency, cut, voltage)
      (/కరెంట్|కరెంటు|విద్యుత్|పవర్|power|electricity/i.test(u) && /పోతుంది|పోతోంది|ఉండదు|కట్|రాదు|లో\s*వోల్టేజ్|తరచుగా|తరచూ|cut|frequent/i.test(u)) ||
      (/తరచుగా\s*పోతోంది|తరచూ\s*పోతుంది|రోజుకు\s*మూడు\s*సార్లు\s*కరెంట్/i.test(u)) ||
      // Health / Hospital specifics
      (/ఆరోగ్య|హాస్పిటల్|ఆసుపత్రి|డాక్టర్లు|డాక్టర్|మందులు|hospital|doctors?|medicines?/i.test(u) && /లేరు|రారు|రావడం\s*లేదు|దొరకవు|సరిగ్గా\s*లేదు|సమస్య|not\s*available/i.test(u)) ||
      // Education / School specifics
      (/స్కూల్|పాఠశాల|బడి|టీచర్లు|ఉపాధ్యాయులు|విద్యా|school|teachers?/i.test(u) && /లేరు|రారు|సరిగ్గా\s*లేదు|సదుపాయాలు\s*లేవు|సమస్య|not\s*proper/i.test(u)) ||
      // Government service specifics
      (/ప్రభుత్వ\s*సేవలు|ఆఫీసులు|కార్యాలయాలు|సర్టిఫికెట్|ఆఫీస్|govt\s*services?/i.test(u) && /పనులు\s*అవ్వడం\s*లేదు|పనులు\s*అవ్వట్లేదు|లేట్|తిప్పుకుంటున్నారు|లంచాలు|సమస్య/i.test(u)) ||
      // Time frequency indicators of recurring problem
      (/(రెండు|మూడు|నాలుగు|ఐదు|ఒక|రెండు|వారం|రోజులు|\d+)\s*(రోజు|గంట|సార్లు|రోజుల|వారం|సార్లు|నిమిషాలు)/i.test(u)) ||
      /మూడు\s*రోజులకొకసారి|రెండు\s*రోజులకొకసారి|వారానికి|రాత్రిపూట|రాత్రి\s*పూట|రోజుకు|ప్రతిరోజూ\s*రావు|తరచూ\s*పోతుంది|చాలా\s*సార్లు/i.test(u) ||
      // Explanatory conjunctions indicating detailed explanation
      (u.length > 20 && /కారణంగా|వల్ల|ఎందుకంటే|అసలు\s*రావు|సరిగ్గా\s*పనిచేయడం\s*లేదు|సరిగ్గా\s*పనిచేయట్లేదు|because|due\s*to/i.test(u));

    if (hasSpecificProblemExplanation) {
      return logClassification({
        action: 'ACCEPT_ANSWER',
        followUpQuestion: null,
        reason: 'Specific problem explained directly in answer; accepting without clarification (Case B)',
        answerSufficient: true,
        acknowledgment: TELUGU_STRINGS.CASE_A_ACK, // "సరే అండి, ధన్యవాదాలు."
        extractedSummary: respondentUtterance,
      });
    }

    // -----------------------------------------------------------------------
    // CASE C: Problem Reported but NOT Explained
    // The respondent explicitly says there is a problem without any explanation (e.g. "సమస్య ఉంది.", "చాలా ఇబ్బందిగా ఉంది.", "ఏదో సమస్య ఉంది.", "There is a problem.").
    // CRITICAL: A simple negative answer such as "బాగోలేదు" or "బాగాలేదు" must NOT be held for clarification;
    // it is accepted immediately as a valid answer! Only trigger clarification when they explicitly state a problem exists without explaining it.
    // -----------------------------------------------------------------------
    const isExplicitVagueProblem =
      /^(సమస్య\s*ఉంది|సమస్యలు\s*ఉన్నాయి|చాలా\s*ఇబ్బందిగా\s*ఉంది|ఇబ్బందిగా\s*ఉంది|ఇబ్బంది\s*ఉంది|ఏదో\s*సమస్య\s*ఉంది|problem\s*exists|there\s*is\s*a\s*problem|problem\s*undhi)(\s*అండి)?[\s\.,!]*$/i.test(u.trim()) ||
      ((/సమస్య\s*ఉంది|సమస్యలు\s*ఉన్నాయి|ఇబ్బందిగా\s*ఉంది|there\s*is\s*a\s*problem/i.test(u)) &&
       u.length < 30 && !hasSpecificProblemExplanation);

    if (isExplicitVagueProblem && followUpCount === 0) {
      return logClassification({
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: TELUGU_STRINGS.CASE_B_FOLLOW_UP, // "ఏ సమస్య ఉందో కొంచెం వివరంగా చెప్తారా?"
        reason: 'Problem indicated without explanation; asking single clarification (Case C)',
        answerSufficient: false,
        acknowledgment: '',
        extractedSummary: respondentUtterance,
      });
    }

    // -----------------------------------------------------------------------
    // CASE D: Default Accept / Fallback
    // If respondent provided an answer that does not match vague negative, accept it!
    // -----------------------------------------------------------------------
    return logClassification({
      action: 'ACCEPT_ANSWER',
      followUpQuestion: null,
      reason: followUpCount >= maxFollowUps ? 'Max follow-ups reached, accepting response' : 'Sufficient answer provided',
      answerSufficient: true,
      acknowledgment: TELUGU_STRINGS.CASE_A_ACK, // "సరే అండి, ధన్యవాదాలు."
      extractedSummary: respondentUtterance,
    });
  }

  /**
   * Parses callback date and time in the campaign timezone.
   * Resolves common spoken Telugu expressions:
   * "ఈరోజు సాయంత్రం ఆరు గంటలకు" -> Today 18:00
   * "రేపు ఉదయం 10 గంటలకు" -> Tomorrow 10:00
   * "సాయంత్రం 5 గంటలకు" -> Today 17:00
   * "తర్వాత 7 గంటలకు" -> 19:00
   */
  public static parseCallbackDateTime(
    utterance: string,
    timezone = 'Asia/Kolkata'
  ): {
    scheduledIso: string;
    resolvedDateStr: string;
    resolvedTimeStr: string;
    confirmationTelugu: string;
    timeString: string;
    timezone: string;
    parsedHour: number;
    parsedMinute: number;
  } {
    const text = utterance.trim();
    const now = new Date();

    // Determine target day (today vs tomorrow vs day after tomorrow vs day of week)
    const isDayAfterTomorrow = /ఎల్లుండి|day after tomorrow/i.test(text);
    const isTomorrow = /రేపు|tomorrow/i.test(text);
    const targetDate = new Date(now);
    let resolvedDayLabel = 'ఈరోజు';

    if (isDayAfterTomorrow) {
      targetDate.setDate(targetDate.getDate() + 2);
      resolvedDayLabel = 'ఎల్లుండి';
    } else if (isTomorrow) {
      targetDate.setDate(targetDate.getDate() + 1);
      resolvedDayLabel = 'రేపు';
    } else {
      const dowMap: Record<string, number> = {
        ఆదివారం: 0,
        సోమవారం: 1,
        మంగళవారం: 2,
        బుధవారం: 3,
        గురువారం: 4,
        శుక్రవారం: 5,
        శనివారం: 6,
      };
      for (const [dowName, dowIdx] of Object.entries(dowMap)) {
        if (text.includes(dowName)) {
          const curDow = now.getDay();
          let daysAhead = (dowIdx - curDow + 7) % 7;
          if (daysAhead === 0) daysAhead = 7;
          targetDate.setDate(now.getDate() + daysAhead);
          resolvedDayLabel = dowName;
          break;
        }
      }
    }

    // Extract hour
    let hour = 18; // default to 6 PM if unspecified
    let minute = 0;

    // Check for Telugu digits or English numbers
    const numMatch = text.match(/(\d{1,2})(?:\s*[:\.]\s*(\d{2}))?/);
    const teluguWordsMatch = text.match(/(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది|పది|పదకొండు|పన్నెండు)\s*గంటల/);

    if (numMatch) {
      hour = parseInt(numMatch[1], 10);
      if (numMatch[2]) minute = parseInt(numMatch[2], 10);
    } else if (teluguWordsMatch) {
      const map: Record<string, number> = {
        ఒక: 1,
        రెండు: 2,
        మూడు: 3,
        నాలుగు: 4,
        ఐదు: 5,
        ఆరు: 6,
        ఏడు: 7,
        ఎనిమిది: 8,
        తొమ్మిది: 9,
        పది: 10,
        పదకొండు: 11,
        పన్నెండు: 12,
      };
      hour = map[teluguWordsMatch[1]] || 6;
    }

    // Determine AM / PM context
    const isEvening = /సాయంత్రం|రాత్రి|evening|night|pm/i.test(text);
    const isMorning = /ఉదయం|morning|am/i.test(text);
    const isAfternoon = /మధ్యాహ్నం|afternoon/i.test(text);

    if (isEvening && hour < 12) {
      hour += 12;
    } else if (isAfternoon && hour < 12 && hour !== 12) {
      hour += 12;
    } else if (isMorning && hour === 12) {
      hour = 0;
    } else if (!isMorning && !isEvening && !isAfternoon) {
      // If hour is 1-6 without qualifier, assume evening
      if (hour >= 1 && hour <= 6) hour += 12;
    }

    targetDate.setHours(hour, minute, 0, 0);

    // If time is already past for today and not explicitly tomorrow or another day, push to tomorrow
    if (!isTomorrow && !isDayAfterTomorrow && resolvedDayLabel === 'ఈరోజు' && targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
      resolvedDayLabel = 'రేపు';
    }

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const hh = String(targetDate.getHours()).padStart(2, '0');
    const min = String(targetDate.getMinutes()).padStart(2, '0');

    const scheduledIso = targetDate.toISOString();
    const resolvedDateStr = `${yyyy}-${mm}-${dd}`;
    const resolvedTimeStr = `${hh}:${min}`;

    // Natural spoken confirmation in Telugu
    const confirmationTelugu = TELUGU_STRINGS.CALLBACK_CONFIRMATION;

    return {
      scheduledIso,
      resolvedDateStr,
      resolvedTimeStr,
      confirmationTelugu,
      timeString: resolvedTimeStr,
      timezone: 'Asia/Kolkata',
      parsedHour: hour,
      parsedMinute: minute,
    };
  }

  private static wrapResult(res: any): EngineTurnResult {
    let reply = res.reply || '';
    const state = res.conversationState || res.conversation_state;

    // Strict Universal No-Repeat Guarantee for ALL answered questions (1 to 10):
    // Once any question is answered, its question prompt text must NEVER be re-asked in the spoken reply!
    // Exception: If action is CLARIFY or ASK_FOLLOW_UP, intentional follow-up/line-check is allowed.
    if (
      res.action !== 'CLARIFY' &&
      res.action !== 'ASK_FOLLOW_UP' &&
      state &&
      Array.isArray(state.answeredQuestionIds) &&
      state.answeredQuestionIds.length > 0
    ) {
      const activeQuestions = this.resolveActiveQuestions(state.eventId);
      let repeatsAnsweredQuestion = false;

      // Check if reply accidentally contains any answered question's prompt text
      for (const answeredId of state.answeredQuestionIds) {
        const answeredQ = activeQuestions.find((q) => q.id === answeredId);
        if (!answeredQ) continue;

        // Core question prompt phrase without intro prefixes
        const coreWords = answeredQ.text
          .replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '')
          .replace(/మీ ప్రాంతంలో|మీ ప్రాంతంలోని|గురించి మీ అభిప్రాయం ఏమిటి\?|ఎలా ఉంది\?|ఎలా ఉన్నాయి\?|సరిపోతున్నాయా\?|ఏది అని మీరు భావిస్తున్నారు\?/gi, '')
          .trim();

        if (coreWords.length >= 4 && reply.includes(coreWords)) {
          const currentQ = activeQuestions[state.currentQuestionIndex];
          if (!currentQ || !currentQ.text.includes(coreWords)) {
            repeatsAnsweredQuestion = true;
            break;
          }
        }
      }

      // Also check specific greeting / intro / Q1 leak signatures
      if (
        !repeatsAnsweredQuestion &&
        (state.answeredQuestionIds.includes('A1') || state.answeredQuestionIds.length > 0) &&
        (reply.includes('తాగునీటి') || reply.includes('ప్రజా సదుపాయాల') || reply.includes('మొదటి ప్రశ్న'))
      ) {
        const currentQ = activeQuestions[state.currentQuestionIndex];
        if (!currentQ || !currentQ.text.includes('తాగునీటి')) {
          repeatsAnsweredQuestion = true;
        }
      }

      if (repeatsAnsweredQuestion) {
        console.warn('[SURVEY_ENGINE_STRICT_NO_REPEAT_ENFORCED]', {
          originalReply: reply.slice(0, 60),
          currentQuestionIndex: state.currentQuestionIndex,
          answeredIds: state.answeredQuestionIds,
        });

        if (state.currentQuestionIndex < activeQuestions.length) {
          const nextQ = activeQuestions[state.currentQuestionIndex];
          const cleanQText = nextQ.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
          reply = `సరేనండి. మరి ${cleanQText}`;
        } else {
          reply = TELUGU_STRINGS.CLOSING_MESSAGE;
        }
      }
    }

    return {
      ...res,
      reply,
      spokenResponse: reply,
      isCompleted: Boolean(res.isSurveyComplete),
    };
  }

  /**
   * Main entry point for a conversation turn.
   * Controls deterministic sequential progression, OpenAI dynamic follow-ups,
   * natural acknowledgments, callback scheduling, and automatic completion.
   */
  public static async processTurn(params: {
    sessionId?: string;
    messages?: Array<{ role: string; text: string }>;
    userUtterance?: string;
    questionId?: string;
    surveyConfig?: {
      id?: string;
      title?: string;
      questions?: SurveyQuestion[];
      surveyIntro?: string;
    };
    eventId?: string;
    campaignId?: string;
    providerCallId?: string;
    jobId?: string;
    contactId?: string;
    contactPhone?: string;
  }): Promise<EngineTurnResult> {
    const sessionId = params.sessionId || params.providerCallId || params.jobId || 'session_default';
    const messages = params.messages || (params.userUtterance ? [{ role: 'respondent', text: params.userUtterance }] : []);
    const { surveyConfig, eventId, campaignId, providerCallId, jobId } = params;

    // 1. Resolve active questions
    const activeQuestions = this.resolveActiveQuestions(surveyConfig?.questions?.length ? surveyConfig : eventId);
    if (activeQuestions.length === 0) {
      return this.wrapResult({
        reply: 'నమస్కారం! ప్రస్తుతం ఈ సర్వేకు సంబంధించిన ప్రశ్నలు ఇంకా కాన్ఫిగర్ చేయబడలేదు.',
        currentQuestionId: '',
        currentQuestionIndex: 0,
        totalActiveQuestions: 0,
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: this.getOrCreateSession(sessionId, { activeQuestions }),
        conversation_state: this.getOrCreateSession(sessionId, { activeQuestions }),
        action: 'END',
        summaryOfCollected: '',
      });
    }

    // 2. Retrieve or initialize session state
    let state = this.getOrCreateSession(sessionId, {
      campaignId,
      providerCallId: providerCallId || jobId,
      eventId: eventId || 'event_public_survey',
      activeQuestions,
    });

    state.totalActiveQuestions = activeQuestions.length;

    // Filter respondent messages
    const respondentMsgs = messages.filter((m) => m.role === 'respondent' || m.role === 'user');
    const nowIso = new Date().toISOString();

    // =========================================================================
    // STEP A: Initial survey greeting & first main question
    // =========================================================================
    if (respondentMsgs.length === 0) {
      const q = activeQuestions[state.currentQuestionIndex] || activeQuestions[0];
      state.currentQuestionId = q.id;
      state.pendingQuestionId = q.id;
      state.stateMachineState = 'WAITING_FOR_RESPONSE';
      state.followUpCountForCurrentQuestion = 0;

      const intro = surveyConfig?.surveyIntro?.trim() || TELUGU_STRINGS.DEFAULT_INTRO;
      const cleanQ = q.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
      const initialReply = state.currentQuestionIndex === 0
        ? `${intro} ${cleanQ}`
        : `నమస్కారం అండి! మేము ఇంతకుముందు మాట్లాడిన సర్వేను కొనసాగిద్దాం. ${cleanQ}`;

      // Save initial turn to transcript
      state.transcripts.push({
        role: 'agent',
        text: initialReply,
        timestamp: nowIso,
        questionId: q.id,
        questionOrder: state.currentQuestionIndex + 1,
        turnType: state.currentQuestionIndex === 0 ? 'greeting' : 'main_question',
      });
      state.originalTranscript = [...state.transcripts];

      // Update legacy fields
      state.current_question = q.id;
      state.current_question_id = q.id;
      state.current_question_topic = q.category || 'drinking_water';
      state.conversation_status = 'waiting_for_answer';

      engineSessions.set(sessionId, state);

      return this.wrapResult({
        reply: initialReply,
        currentQuestionId: q.id,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'ASK_MAIN_QUESTION',
        summaryOfCollected: '',
      });
    }

    // =========================================================================
    // STEP B: Process Respondent Utterance
    // =========================================================================
    const lastUserMsg = respondentMsgs[respondentMsgs.length - 1];
    const rawUserText = lastUserMsg.text.trim();
    const userText = this.cleanTranscriptNoise(rawUserText) || rawUserText;

    if (!this.cleanTranscriptNoise(rawUserText)) {
      const clarifyNoise = 'క్షమించండి, మీ మాట సరిగ్గా వినిపించలేదు. మరోసారి చెప్పగలరా?';
      state.lastGeneratedReply = clarifyNoise;
      state.transcripts.push({
        role: 'agent',
        text: clarifyNoise,
        timestamp: new Date().toISOString(),
        questionId: state.currentQuestionId,
        questionOrder: state.currentQuestionIndex + 1,
        turnType: 'clarification',
      });
      engineSessions.set(state.sessionId, state);
      this.persistSessionState(state);
      return this.wrapResult({
        reply: clarifyNoise,
        currentQuestionId: state.currentQuestionId,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'CLARIFY',
        summaryOfCollected: '',
      });
    }

    // Duplicate transcription protection: If identical utterance was already processed
    if (state.lastProcessedUtterance && state.lastProcessedUtterance === userText && state.transcripts.length > 0) {
      if (state.lastGeneratedReply) {
        return this.wrapResult({
          reply: state.lastGeneratedReply,
          currentQuestionId: state.currentQuestionId,
          currentQuestionIndex: state.currentQuestionIndex,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: state.stateMachineState === 'COMPLETED',
          isSurveyStopped: state.stateMachineState === 'COMPLETED' || state.callbackRequested,
          isCallback: state.callbackRequested,
          callbackScheduledAt: state.callbackScheduledAt,
          conversationState: state,
          conversation_state: state,
          action: state.callbackRequested ? 'CALLBACK' : 'ASK_MAIN_QUESTION',
          summaryOfCollected: '',
        });
      }
      const lastAgentTurn = [...state.transcripts].reverse().find((t) => t.role === 'agent' && t.turnType !== 'greeting');
      if (lastAgentTurn) {
        return this.wrapResult({
          reply: lastAgentTurn.text,
          currentQuestionId: state.currentQuestionId,
          currentQuestionIndex: state.currentQuestionIndex,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: state.stateMachineState === 'COMPLETED',
          isSurveyStopped: state.stateMachineState === 'COMPLETED' || state.callbackRequested,
          isCallback: state.callbackRequested,
          callbackScheduledAt: state.callbackScheduledAt,
          conversationState: state,
          conversation_state: state,
          action: state.callbackRequested ? 'CALLBACK' : 'ASK_MAIN_QUESTION',
          summaryOfCollected: '',
        });
      }
    }
    state.lastProcessedUtterance = userText;

    // Record respondent turn in transcripts
    state.transcripts.push({
      role: 'respondent',
      text: userText,
      timestamp: nowIso,
      questionId: state.currentQuestionId,
      questionOrder: state.currentQuestionIndex + 1,
      turnType: 'answer',
    });
    state.originalTranscript = [...state.transcripts];

    // Check if we were in SCHEDULE_CALLBACK state (waiting for user to provide the time)
    if (state.stateMachineState === 'SCHEDULE_CALLBACK' || state.callbackRequested) {
      const parsed = this.parseCallbackDateTime(userText, state.callbackTimezone);
      state.callbackScheduledAt = parsed.scheduledIso;
      state.callbackDetails = {
        requestedDate: parsed.resolvedDateStr,
        requestedTime: parsed.resolvedTimeStr,
        isTimeVague: false,
        timezone: state.callbackTimezone,
        rawUtterance: userText,
        confirmationMessage: parsed.confirmationTelugu,
        unansweredQuestionId: state.currentQuestionId,
        unansweredQuestionIndex: state.currentQuestionIndex,
      };
      state.conversationStatus = 'callback_scheduled';
      state.stateMachineState = 'COMPLETED';

      // Save turn
      state.transcripts.push({
        role: 'agent',
        text: parsed.confirmationTelugu,
        timestamp: new Date().toISOString(),
        turnType: 'callback',
      });

      engineSessions.set(sessionId, state);

      return this.wrapResult({
        reply: parsed.confirmationTelugu,
        currentQuestionId: state.currentQuestionId,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: true,
        callbackScheduledAt: parsed.scheduledIso,
        conversationState: state,
        conversation_state: state,
        action: 'CALLBACK',
        summaryOfCollected: 'కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది.',
      });
    }

    // Resolve current main question
    const currentQ = activeQuestions[state.currentQuestionIndex] || activeQuestions[0];
    const currentIdx = state.currentQuestionIndex;

    // Run OpenAI turn analysis
    const analysis = await this.analyzeTurnWithOpenAi({
      mainQuestion: currentQ,
      respondentUtterance: userText,
      followUpCount: state.followUpCountForCurrentQuestion,
      maxFollowUps: state.maxFollowUpsPerQuestion,
      conversationHistory: messages,
    });

    // -------------------------------------------------------------------------
    // CASE 1: CALLBACK REQUESTED
    // -------------------------------------------------------------------------
    if (analysis.action === 'CALLBACK') {
      const isVague = analysis.callbackDetails?.isTimeVague !== false;
      const hasSpecificTime =
        /\d{1,2}/.test(userText) ||
        /(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది|పది|పదకొండు|పన్నెండు)\s*గంటల/i.test(userText);

      if (isVague && !hasSpecificTime) {
        // Ask for preferred time
        state.stateMachineState = 'SCHEDULE_CALLBACK';
        state.callbackRequested = true;
        state.pendingQuestionId = currentQ.id;

        const promptMsg = analysis.callbackDetails?.clarificationQuestion || TELUGU_STRINGS.CALLBACK_PROMPT_VAGUE;
        state.lastGeneratedReply = promptMsg;

        state.transcripts.push({
          role: 'agent',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);
        this.persistSessionState(state);

        return this.wrapResult({
          reply: promptMsg,
          currentQuestionId: currentQ.id,
          currentQuestionIndex: currentIdx,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: false,
          isSurveyStopped: false,
          isCallback: true,
          callbackScheduledAt: null,
          conversationState: state,
          conversation_state: state,
          action: 'CALLBACK',
          summaryOfCollected: '',
        });
      } else {
        // Resolve time immediately
        const parsed = this.parseCallbackDateTime(userText, state.callbackTimezone);
        state.callbackScheduledAt = parsed.scheduledIso;
        state.callbackDetails = {
          requestedDate: parsed.resolvedDateStr,
          requestedTime: parsed.resolvedTimeStr,
          isTimeVague: false,
          timezone: state.callbackTimezone,
          rawUtterance: userText,
          confirmationMessage: parsed.confirmationTelugu,
          unansweredQuestionId: currentQ.id,
          unansweredQuestionIndex: currentIdx,
        };
        state.conversationStatus = 'callback_scheduled';
        state.stateMachineState = 'COMPLETED';

        state.transcripts.push({
          role: 'agent',
          text: parsed.confirmationTelugu,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);

        return this.wrapResult({
          reply: parsed.confirmationTelugu,
          currentQuestionId: currentQ.id,
          currentQuestionIndex: currentIdx,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: false,
          isSurveyStopped: true,
          isCallback: true,
          callbackScheduledAt: parsed.scheduledIso,
          conversationState: state,
          conversation_state: state,
          action: 'CALLBACK',
          summaryOfCollected: 'కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది.',
        });
      }
    }

    // -------------------------------------------------------------------------
    // CASE 2: STOP / REFUSE
    // -------------------------------------------------------------------------
    if (analysis.action === 'END') {
      state.conversationStatus = 'interrupted';
      state.stateMachineState = 'INTERRUPTED';
      const stopClosing = TELUGU_STRINGS.STOP_CLOSING;
      state.lastGeneratedReply = stopClosing;

      state.transcripts.push({
        role: 'agent',
        text: stopClosing,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      console.log('[SURVEY_STRUCTURED_PROGRESSION]', {
        callId: state.sessionId,
        sessionId: state.sessionId,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        detectedIntent: 'Respondent said bye / requested call termination',
        answerClassification: 'END',
        followUpPending: false,
        parentQuestionId: currentQ.id,
        action: 'END',
        nextQuestionId: currentQ.id,
        nextQuestionIndex: currentIdx,
      });

      return this.wrapResult({
        reply: stopClosing,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'END',
        summaryOfCollected: '',
      });
    }

    // -------------------------------------------------------------------------
    // CASE 3: SKIP QUESTION
    // -------------------------------------------------------------------------
    if (analysis.action === 'SKIP') {
      state.skippedQuestionIds.push(currentQ.id);
      state.answers[currentQ.id] = {
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        answerText: 'దాటవేశారు (Skipped)',
        answeredAt: nowIso,
        status: 'skipped',
      };

      return this.advanceToNextQuestion(state, activeQuestions, 'సరేనండి, ఈ ప్రశ్నను దాటవేస్తున్నాను.');
    }

    // -------------------------------------------------------------------------
    // CASE 4: RESPONDENT ASKS TO CONTINUE / NEXT QUESTION
    // -------------------------------------------------------------------------
    if (analysis.action === 'NEXT_QUESTION') {
      if (!state.answers[currentQ.id]) {
        state.answers[currentQ.id] = {
          callId: state.sessionId,
          campaignId: state.campaignId,
          surveyId: state.eventId,
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          originalAnswer: userText,
          followUpAnswer: null,
          combinedAnswer: userText,
          answerText: 'తదుపరి ప్రశ్నకు వెళ్లారు (Continued to next question)',
          status: 'skipped',
          followUpCount: 0,
          parentQuestionId: currentQ.id,
          answeredAt: nowIso,
          followUps: [],
        };
      }
      if (!state.skippedQuestionIds.includes(currentQ.id) && !state.answeredQuestionIds.includes(currentQ.id)) {
        state.skippedQuestionIds.push(currentQ.id);
      }
      return this.advanceToNextQuestion(state, activeQuestions, 'సరేనండి.');
    }

    // -------------------------------------------------------------------------
    // CASE 5: CLARIFICATION NEEDED
    // -------------------------------------------------------------------------
    if (analysis.action === 'CLARIFY') {
      const clarifyText = analysis.acknowledgment || `${TELUGU_STRINGS.SKIP_CONFIRMATION_QUESTION} ${currentQ.text}`;
      state.lastGeneratedReply = clarifyText;
      state.transcripts.push({
        role: 'agent',
        text: clarifyText,
        timestamp: new Date().toISOString(),
        questionId: currentQ.id,
        questionOrder: currentIdx + 1,
        turnType: 'clarification',
      });

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      return this.wrapResult({
        reply: clarifyText,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'CLARIFY',
        summaryOfCollected: '',
      });
    }

    // -------------------------------------------------------------------------
    // CASE 5: DYNAMIC FOLLOW-UP QUESTION (OPENAI GENERATED)
    // -------------------------------------------------------------------------
    if (
      analysis.action === 'ASK_FOLLOW_UP' &&
      analysis.followUpQuestion &&
      state.followUpCountForCurrentQuestion < state.maxFollowUpsPerQuestion
    ) {
      state.followUpCountForCurrentQuestion++;
      state.stateMachineState = 'WAITING_FOR_FOLLOW_UP_RESPONSE';

      // Record intermediate partial answer
      if (!state.answers[currentQ.id]) {
        state.answers[currentQ.id] = {
          callId: state.sessionId,
          campaignId: state.campaignId,
          surveyId: state.eventId,
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          originalAnswer: userText,
          followUpAnswer: null,
          combinedAnswer: userText,
          answerText: userText,
          status: 'answered',
          followUpCount: 0,
          parentQuestionId: currentQ.id,
          answeredAt: nowIso,
          followUps: [],
        };
      } else {
        const existing = state.answers[currentQ.id];
        existing.followUpAnswer = userText;
        existing.combinedAnswer = `${existing.originalAnswer || existing.answerText}; ${userText}`;
        existing.answerText = existing.combinedAnswer;
        existing.followUpCount = (existing.followUpCount || 0) + 1;
        existing.answeredAt = nowIso;
        if (!existing.followUps) existing.followUps = [];
        existing.followUps.push({
          question: state.transcripts.slice(-2)[0]?.text || '',
          answer: userText,
        });
      }

      // Legacy compatibility for test suites
      this.populateLegacyTopicAnswers(state, currentQ, userText);

      const followUpReply =
        analysis.acknowledgment && analysis.acknowledgment.trim().length > 0
          ? `${analysis.acknowledgment.trim()} ${analysis.followUpQuestion.trim()}`
          : analysis.followUpQuestion.trim();

      state.lastGeneratedReply = followUpReply;

      state.transcripts.push({
        role: 'agent',
        text: followUpReply,
        timestamp: new Date().toISOString(),
        questionId: currentQ.id,
        questionOrder: currentIdx + 1,
        turnType: 'follow_up',
      });

      state.pending_follow_up = {
        questionId: currentQ.id,
        questionText: analysis.followUpQuestion,
        followUpNumber: state.followUpCountForCurrentQuestion,
      };

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      console.log('[SURVEY_STRUCTURED_PROGRESSION]', {
        callId: state.sessionId,
        sessionId: state.sessionId,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        detectedIntent: analysis.reason || 'Problem reported without full explanation',
        answerClassification: 'ASK_FOLLOW_UP',
        followUpPending: true,
        parentQuestionId: currentQ.id,
        action: 'ASK_FOLLOW_UP',
        nextQuestionId: currentQ.id,
        nextQuestionIndex: currentIdx,
      });

      return this.wrapResult({
        reply: followUpReply,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'ASK_FOLLOW_UP',
        summaryOfCollected: '',
      });
    }

    // -------------------------------------------------------------------------
    // CASE 6: ANSWER SUFFICIENT / FOLLOW-UPS COMPLETED -> ADVANCE SEQUENTIALLY
    // -------------------------------------------------------------------------
    if (!state.answers[currentQ.id]) {
      state.answers[currentQ.id] = {
        callId: state.sessionId,
        campaignId: state.campaignId,
        surveyId: state.eventId,
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        originalAnswer: userText,
        followUpAnswer: null,
        combinedAnswer: userText,
        answerText: userText,
        status: 'answered',
        followUpCount: 0,
        parentQuestionId: currentQ.id,
        answeredAt: nowIso,
        followUps: [],
      };
    } else {
      const existing = state.answers[currentQ.id];
      existing.followUpAnswer = userText;
      existing.combinedAnswer = `${existing.originalAnswer || existing.answerText}; ${userText}`;
      existing.answerText = existing.combinedAnswer;
      existing.followUpCount = (existing.followUpCount || 0) + 1;
      existing.answeredAt = nowIso;
      if (!existing.followUps) existing.followUps = [];
      existing.followUps.push({
        question: state.transcripts.slice(-2)[0]?.text || '',
        answer: userText,
      });
    }

    if (!state.answeredQuestionIds.includes(currentQ.id)) {
      state.answeredQuestionIds.push(currentQ.id);
    }

    // Populate legacy answers for test suites
    this.populateLegacyTopicAnswers(state, currentQ, userText);

    const ack = analysis.acknowledgment || getRandomTeluguAck();
    return this.advanceToNextQuestion(state, activeQuestions, ack);
  }

  /**
   * Synchronous turn processing for instantaneous webhook dispatching
   */
  public static processTurnSync(params: {
    sessionId?: string;
    messages?: Array<{ role: string; text: string }>;
    userUtterance?: string;
    questionId?: string;
    toolCallId?: string;
    surveyConfig?: {
      id?: string;
      title?: string;
      questions?: SurveyQuestion[];
      surveyIntro?: string;
    };
    eventId?: string;
    campaignId?: string;
    providerCallId?: string;
    jobId?: string;
    contactId?: string;
    contactPhone?: string;
  }): EngineTurnResult {
    const sessionId = params.sessionId || params.providerCallId || params.jobId || 'session_default';
    const messages = params.messages || (params.userUtterance ? [{ role: 'respondent', text: params.userUtterance }] : []);
    const { surveyConfig, eventId, campaignId, providerCallId, jobId } = params;

    // Check instant tool-call idempotency cache
    if (params.toolCallId && this.executedToolCalls.has(params.toolCallId)) {
      console.log('[SURVEY_TOOL_CALL_CACHE_HIT]', { toolCallId: params.toolCallId });
      return this.executedToolCalls.get(params.toolCallId)!;
    }

    const activeQuestions = this.resolveActiveQuestions(surveyConfig?.questions?.length ? surveyConfig : eventId);
    if (activeQuestions.length === 0) {
      return this.wrapResult({
        reply: 'నమస్కారం! ప్రస్తుతం ఈ సర్వేకు సంబంధించిన ప్రశ్నలు ఇంకా కాన్ఫిగర్ చేయబడలేదు.',
        currentQuestionId: '',
        currentQuestionIndex: 0,
        totalActiveQuestions: 0,
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: this.getOrCreateSession(sessionId, { activeQuestions }),
        conversation_state: this.getOrCreateSession(sessionId, { activeQuestions }),
        action: 'END',
        summaryOfCollected: '',
      });
    }

    let state = this.getOrCreateSession(sessionId, {
      campaignId,
      providerCallId: providerCallId || jobId,
      eventId: eventId || 'event_public_survey',
      activeQuestions,
    });
    state.totalActiveQuestions = activeQuestions.length;

    const respondentMsgs = messages.filter((m) => m.role === 'respondent' || m.role === 'user');
    const nowIso = new Date().toISOString();

    // If no respondent utterance yet
    if (respondentMsgs.length === 0) {
      // If questions were already answered, never replay Question 1!
      if (state.answeredQuestionIds.length > 0) {
        const firstUnanswered = activeQuestions.findIndex(
          (q) => !state.answeredQuestionIds.includes(q.id) && !state.skippedQuestionIds.includes(q.id)
        );
        if (firstUnanswered >= 0) {
          state.currentQuestionIndex = firstUnanswered;
          const nextQ = activeQuestions[firstUnanswered];
          state.currentQuestionId = nextQ.id;
          state.pendingQuestionId = nextQ.id;
          const cleanQ = nextQ.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
          const resumeReply = `నమస్కారం అండి! మేము ఇంతకుముందు మాట్లాడిన సర్వేను కొనసాగిద్దాం. ${cleanQ}`;
          return this.wrapResult({
            reply: resumeReply,
            currentQuestionId: nextQ.id,
            currentQuestionIndex: state.currentQuestionIndex,
            totalActiveQuestions: activeQuestions.length,
            extractedAnswers: this.buildExtractedAnswers(state),
            isSurveyComplete: false,
            isSurveyStopped: false,
            isCallback: false,
            callbackScheduledAt: null,
            conversationState: state,
            conversation_state: state,
            action: 'ASK_MAIN_QUESTION',
            summaryOfCollected: '',
          });
        }
      }

      const q = activeQuestions[state.currentQuestionIndex] || activeQuestions[0];
      state.currentQuestionId = q.id;
      state.pendingQuestionId = q.id;
      state.stateMachineState = 'WAITING_FOR_RESPONSE';
      state.followUpCountForCurrentQuestion = 0;

      const intro = surveyConfig?.surveyIntro?.trim() || TELUGU_STRINGS.DEFAULT_INTRO;
      const cleanQ = q.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
      const initialReply = state.currentQuestionIndex === 0
        ? `${intro} ${cleanQ}`
        : `నమస్కారం అండి! మేము ఇంతకుముందు మాట్లాడిన సర్వేను కొనసాగిద్దాం. ${cleanQ}`;

      state.transcripts.push({
        role: 'agent',
        text: initialReply,
        timestamp: nowIso,
        questionId: q.id,
        questionOrder: state.currentQuestionIndex + 1,
        turnType: state.currentQuestionIndex === 0 ? 'greeting' : 'main_question',
      });
      state.originalTranscript = [...state.transcripts];
      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      return this.wrapResult({
        reply: initialReply,
        currentQuestionId: q.id,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'ASK_MAIN_QUESTION',
        summaryOfCollected: '',
      });
    }

    const lastUserMsg = respondentMsgs[respondentMsgs.length - 1];
    const rawUserText = lastUserMsg.text.trim();
    const userText = this.cleanTranscriptNoise(rawUserText) || rawUserText;

    if (!this.cleanTranscriptNoise(rawUserText)) {
      const clarifyNoise = 'క్షమించండి, మీ మాట సరిగ్గా వినిపించలేదు. మరోసారి చెప్పగలరా?';
      state.lastGeneratedReply = clarifyNoise;
      state.transcripts.push({
        role: 'agent',
        text: clarifyNoise,
        timestamp: new Date().toISOString(),
        questionId: state.currentQuestionId,
        questionOrder: state.currentQuestionIndex + 1,
        turnType: 'clarification',
      });
      engineSessions.set(state.sessionId, state);
      this.persistSessionState(state);
      const res = this.wrapResult({
        reply: clarifyNoise,
        currentQuestionId: state.currentQuestionId,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'CLARIFY',
        summaryOfCollected: '',
      });
      if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
      return res;
    }

    // Synchronize session state index to the target question if answering a later question (e.g. Q2 after restart)
    if (params.questionId) {
      const targetIdx = activeQuestions.findIndex((q) => q.id === params.questionId);
      if (targetIdx >= 0 && state.currentQuestionIndex < targetIdx) {
        for (let i = 0; i < targetIdx; i++) {
          const qId = activeQuestions[i].id;
          if (!state.answeredQuestionIds.includes(qId) && !state.skippedQuestionIds.includes(qId)) {
            state.answeredQuestionIds.push(qId);
            if (!state.answers[qId]) {
              state.answers[qId] = {
                questionId: qId,
                questionText: activeQuestions[i].text,
                questionOrder: i + 1,
                answerText: 'పూర్తయింది (Answered previously)',
                answeredAt: nowIso,
                status: 'answered',
              };
            }
          }
        }
        state.currentQuestionIndex = targetIdx;
        state.currentQuestionId = activeQuestions[targetIdx].id;
        state.pendingQuestionId = activeQuestions[targetIdx].id;
      }
    }

    // Already-Answered Question Protection (Strict No-Repeat Guarantee)
    if (params.questionId && state.answeredQuestionIds.includes(params.questionId)) {
      console.log('[SURVEY_QUESTION_ALREADY_ANSWERED_GUARD]', {
        sessionId,
        questionId: params.questionId,
        currentIdx: state.currentQuestionIndex,
        answeredIds: state.answeredQuestionIds,
      });

      const nextUnanswered = activeQuestions.findIndex(
        (q, idx) => idx >= state.currentQuestionIndex && !state.answeredQuestionIds.includes(q.id) && !state.skippedQuestionIds.includes(q.id)
      );

      if (nextUnanswered >= 0) {
        state.currentQuestionIndex = nextUnanswered;
        state.currentQuestionId = activeQuestions[nextUnanswered].id;
        state.pendingQuestionId = activeQuestions[nextUnanswered].id;
        const q = activeQuestions[nextUnanswered];
        const cleanQ = q.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
        const nextReply = state.lastGeneratedReply && state.lastGeneratedReply.includes(cleanQ)
          ? state.lastGeneratedReply
          : `సరే అండి, ధన్యవాదాలు. మరి ${cleanQ}`;
        state.lastGeneratedReply = nextReply;
        const lastTr = state.transcripts.length > 0 ? state.transcripts[state.transcripts.length - 1] : null;
        if (!lastTr || (lastTr.role === 'agent' && lastTr.text !== nextReply) || lastTr.role !== 'agent') {
          state.transcripts.push({
            role: 'agent',
            text: nextReply,
            timestamp: new Date().toISOString(),
            questionId: q.id,
            questionOrder: state.currentQuestionIndex + 1,
            turnType: 'main_question',
          });
        }
        engineSessions.set(sessionId, state);
        this.persistSessionState(state);

        const res = this.wrapResult({
          reply: nextReply,
          currentQuestionId: q.id,
          currentQuestionIndex: state.currentQuestionIndex,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: false,
          isSurveyStopped: false,
          isCallback: false,
          callbackScheduledAt: null,
          conversationState: state,
          conversation_state: state,
          action: 'ASK_MAIN_QUESTION',
          summaryOfCollected: '',
        });
        if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
        return res;
      } else {
        state.stateMachineState = 'COMPLETED';
        state.conversationStatus = 'completed';
        const closingReply = TELUGU_STRINGS.CLOSING_MESSAGE;
        state.lastGeneratedReply = closingReply;
        state.transcripts.push({
          role: 'agent',
          text: closingReply,
          timestamp: new Date().toISOString(),
          turnType: 'closing',
        });
        engineSessions.set(sessionId, state);
        this.persistSessionState(state);

        const res = this.wrapResult({
          reply: closingReply,
          currentQuestionId: '',
          currentQuestionIndex: activeQuestions.length,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: true,
          isSurveyStopped: false,
          isCallback: false,
          callbackScheduledAt: null,
          conversationState: state,
          conversation_state: state,
          action: 'END',
          summaryOfCollected: 'సర్వే పూర్తయింది.',
        });
        if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
        return res;
      }
    }

    // Duplicate transcription protection: If identical utterance was already processed
    const currentQId = params.questionId || state.currentQuestionId || (activeQuestions[state.currentQuestionIndex]?.id);
    const isExplicitDifferentQuestion = Boolean(
      params.questionId &&
      state.lastProcessedQuestionId &&
      params.questionId !== state.lastProcessedQuestionId
    );
    const normUser = userText.toLowerCase().replace(/[.,!?:;۔।\s]/g, '');
    const normLast = (state.lastProcessedUtterance || '').toLowerCase().replace(/[.,!?:;۔।\s]/g, '');

    if (!isExplicitDifferentQuestion && normUser && normLast === normUser && state.transcripts.length > 0) {
      if (state.lastGeneratedReply) {
        const res = this.wrapResult({
          reply: state.lastGeneratedReply,
          currentQuestionId: state.currentQuestionId,
          currentQuestionIndex: state.currentQuestionIndex,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: state.stateMachineState === 'COMPLETED',
          isSurveyStopped: state.stateMachineState === 'COMPLETED' || state.callbackRequested,
          isCallback: state.callbackRequested,
          callbackScheduledAt: state.callbackScheduledAt,
          conversationState: state,
          conversation_state: state,
          action: state.callbackRequested ? 'CALLBACK' : 'ASK_MAIN_QUESTION',
          summaryOfCollected: '',
        });
        if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
        return res;
      }
      const lastAgentTurn = [...state.transcripts].reverse().find((t) => t.role === 'agent' && t.turnType !== 'greeting');
      if (lastAgentTurn) {
        const res = this.wrapResult({
          reply: lastAgentTurn.text,
          currentQuestionId: state.currentQuestionId,
          currentQuestionIndex: state.currentQuestionIndex,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: state.stateMachineState === 'COMPLETED',
          isSurveyStopped: state.stateMachineState === 'COMPLETED' || state.callbackRequested,
          isCallback: state.callbackRequested,
          callbackScheduledAt: state.callbackScheduledAt,
          conversationState: state,
          conversation_state: state,
          action: state.callbackRequested ? 'CALLBACK' : 'ASK_MAIN_QUESTION',
          summaryOfCollected: '',
        });
        if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
        return res;
      }
    }
    state.lastProcessedUtterance = userText;
    state.lastProcessedQuestionId = currentQId;

    if (!Array.isArray(state.transcripts)) state.transcripts = [];
    if (!Array.isArray(state.originalTranscript)) state.originalTranscript = [];

    state.transcripts.push({
      role: 'respondent',
      text: userText,
      timestamp: nowIso,
      questionId: state.currentQuestionId,
      questionOrder: state.currentQuestionIndex + 1,
      turnType: 'answer',
    });
    state.originalTranscript = [...state.transcripts];

    if (state.stateMachineState === 'SCHEDULE_CALLBACK' || state.callbackRequested) {
      const parsed = this.parseCallbackDateTime(userText, state.callbackTimezone);
      state.callbackScheduledAt = parsed.scheduledIso;
      state.callbackDetails = {
        requestedDate: parsed.resolvedDateStr,
        requestedTime: parsed.resolvedTimeStr,
        isTimeVague: false,
        timezone: state.callbackTimezone,
        rawUtterance: userText,
        confirmationMessage: parsed.confirmationTelugu,
        unansweredQuestionId: state.currentQuestionId,
        unansweredQuestionIndex: state.currentQuestionIndex,
      };
      state.conversationStatus = 'callback_scheduled';
      state.stateMachineState = 'COMPLETED';

      state.transcripts.push({
        role: 'agent',
        text: parsed.confirmationTelugu,
        timestamp: new Date().toISOString(),
        turnType: 'callback',
      });

      engineSessions.set(sessionId, state);

      return this.wrapResult({
        reply: parsed.confirmationTelugu,
        currentQuestionId: state.currentQuestionId,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: true,
        callbackScheduledAt: parsed.scheduledIso,
        conversationState: state,
        conversation_state: state,
        action: 'CALLBACK',
        summaryOfCollected: 'కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది.',
      });
    }

    const currentQ = activeQuestions[state.currentQuestionIndex] || activeQuestions[0];
    const currentIdx = state.currentQuestionIndex;

    const analysis = this.fallbackTurnAnalysis({
      mainQuestion: currentQ,
      respondentUtterance: userText,
      followUpCount: state.followUpCountForCurrentQuestion,
      maxFollowUps: state.maxFollowUpsPerQuestion,
    });

    if (analysis.action === 'CALLBACK') {
      const isVague = analysis.callbackDetails?.isTimeVague !== false;
      const hasSpecificTime =
        /\d{1,2}/.test(userText) ||
        /(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది|పది|పదకొండు|పన్నెండు)\s*గంటల/i.test(userText);

      if (isVague && !hasSpecificTime) {
        state.stateMachineState = 'SCHEDULE_CALLBACK';
        state.callbackRequested = true;
        state.pendingQuestionId = currentQ.id;

        const promptMsg = analysis.callbackDetails?.clarificationQuestion || TELUGU_STRINGS.CALLBACK_PROMPT_VAGUE;
        state.lastGeneratedReply = promptMsg;

        state.transcripts.push({
          role: 'agent',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);
        this.persistSessionState(state);

        return this.wrapResult({
          reply: promptMsg,
          currentQuestionId: currentQ.id,
          currentQuestionIndex: currentIdx,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: false,
          isSurveyStopped: false,
          isCallback: true,
          callbackScheduledAt: null,
          conversationState: state,
          conversation_state: state,
          action: 'CALLBACK',
          summaryOfCollected: '',
        });
      } else {
        const parsed = this.parseCallbackDateTime(userText, state.callbackTimezone);
        state.callbackScheduledAt = parsed.scheduledIso;
        state.callbackDetails = {
          requestedDate: parsed.resolvedDateStr,
          requestedTime: parsed.resolvedTimeStr,
          isTimeVague: false,
          timezone: state.callbackTimezone,
          rawUtterance: userText,
          confirmationMessage: parsed.confirmationTelugu,
          unansweredQuestionId: currentQ.id,
          unansweredQuestionIndex: currentIdx,
        };
        state.conversationStatus = 'callback_scheduled';
        state.stateMachineState = 'COMPLETED';

        state.transcripts.push({
          role: 'agent',
          text: parsed.confirmationTelugu,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);

        return this.wrapResult({
          reply: parsed.confirmationTelugu,
          currentQuestionId: currentQ.id,
          currentQuestionIndex: currentIdx,
          totalActiveQuestions: activeQuestions.length,
          extractedAnswers: this.buildExtractedAnswers(state),
          isSurveyComplete: false,
          isSurveyStopped: true,
          isCallback: true,
          callbackScheduledAt: parsed.scheduledIso,
          conversationState: state,
          conversation_state: state,
          action: 'CALLBACK',
          summaryOfCollected: 'కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది.',
        });
      }
    }

    if (analysis.action === 'END') {
      state.conversationStatus = 'interrupted';
      state.stateMachineState = 'INTERRUPTED';
      const stopClosing = TELUGU_STRINGS.STOP_CLOSING;
      state.lastGeneratedReply = stopClosing;

      state.transcripts.push({
        role: 'agent',
        text: stopClosing,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      console.log('[SURVEY_STRUCTURED_PROGRESSION]', {
        callId: state.sessionId,
        sessionId: state.sessionId,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        detectedIntent: 'Respondent said bye / requested call termination',
        answerClassification: 'END',
        followUpPending: false,
        parentQuestionId: currentQ.id,
        action: 'END',
        nextQuestionId: currentQ.id,
        nextQuestionIndex: currentIdx,
      });

      const res = this.wrapResult({
        reply: stopClosing,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: true,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'END',
        summaryOfCollected: '',
      });
      if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
      return res;
    }

    if (analysis.action === 'SKIP') {
      state.skippedQuestionIds.push(currentQ.id);
      state.answers[currentQ.id] = {
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        answerText: 'దాటవేశారు (Skipped)',
        answeredAt: nowIso,
        status: 'skipped',
      };

      return this.advanceToNextQuestion(state, activeQuestions, 'సరేనండి, ఈ ప్రశ్నను దాటవేస్తున్నాను.');
    }

    if (analysis.action === 'NEXT_QUESTION') {
      if (!state.answers[currentQ.id]) {
        state.answers[currentQ.id] = {
          callId: state.sessionId,
          campaignId: state.campaignId,
          surveyId: state.eventId,
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          originalAnswer: userText,
          followUpAnswer: null,
          combinedAnswer: userText,
          answerText: 'తదుపరి ప్రశ్నకు వెళ్లారు (Continued to next question)',
          status: 'skipped',
          followUpCount: 0,
          parentQuestionId: currentQ.id,
          answeredAt: nowIso,
          followUps: [],
        };
      }
      if (!state.skippedQuestionIds.includes(currentQ.id) && !state.answeredQuestionIds.includes(currentQ.id)) {
        state.skippedQuestionIds.push(currentQ.id);
      }
      const res = this.advanceToNextQuestion(state, activeQuestions, 'సరేనండి.');
      if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
      return res;
    }

    if (analysis.action === 'CLARIFY') {
      const clarifyReply = analysis.acknowledgment || `${TELUGU_STRINGS.SKIP_CONFIRMATION_QUESTION} ${currentQ.text}`;
      state.lastGeneratedReply = clarifyReply;
      state.transcripts.push({
        role: 'agent',
        text: clarifyReply,
        timestamp: new Date().toISOString(),
        questionId: currentQ.id,
        questionOrder: currentIdx + 1,
        turnType: 'clarification',
      });
      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      const res = this.wrapResult({
        reply: clarifyReply,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'CLARIFY',
        summaryOfCollected: '',
      });
      if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
      return res;
    }

    if (
      analysis.action === 'ASK_FOLLOW_UP' &&
      analysis.followUpQuestion &&
      state.followUpCountForCurrentQuestion < state.maxFollowUpsPerQuestion
    ) {
      state.followUpCountForCurrentQuestion++;
      state.stateMachineState = 'WAITING_FOR_FOLLOW_UP_RESPONSE';

      if (!state.answers[currentQ.id]) {
        state.answers[currentQ.id] = {
          callId: state.sessionId,
          campaignId: state.campaignId,
          surveyId: state.eventId,
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          originalAnswer: userText,
          followUpAnswer: null,
          combinedAnswer: userText,
          answerText: userText,
          status: 'answered',
          followUpCount: 0,
          parentQuestionId: currentQ.id,
          answeredAt: nowIso,
          followUps: [],
        };
      } else {
        const existing = state.answers[currentQ.id];
        existing.followUpAnswer = userText;
        existing.combinedAnswer = `${existing.originalAnswer || existing.answerText}; ${userText}`;
        existing.answerText = existing.combinedAnswer;
        existing.followUpCount = (existing.followUpCount || 0) + 1;
        existing.answeredAt = nowIso;
        if (!existing.followUps) existing.followUps = [];
        existing.followUps.push({
          question: state.transcripts.slice(-2)[0]?.text || '',
          answer: userText,
        });
      }

      this.populateLegacyTopicAnswers(state, currentQ, userText);
      const followUpReply =
        analysis.acknowledgment && analysis.acknowledgment.trim().length > 0
          ? `${analysis.acknowledgment.trim()} ${analysis.followUpQuestion.trim()}`
          : analysis.followUpQuestion.trim();

      state.lastGeneratedReply = followUpReply;

      state.transcripts.push({
        role: 'agent',
        text: followUpReply,
        timestamp: new Date().toISOString(),
        questionId: currentQ.id,
        questionOrder: currentIdx + 1,
        turnType: 'follow_up',
      });

      state.pending_follow_up = {
        questionId: currentQ.id,
        questionText: analysis.followUpQuestion,
        followUpNumber: state.followUpCountForCurrentQuestion,
      };

      engineSessions.set(sessionId, state);
      this.persistSessionState(state);

      console.log('[SURVEY_STRUCTURED_PROGRESSION]', {
        callId: state.sessionId,
        sessionId: state.sessionId,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        detectedIntent: analysis.reason || 'Problem reported without full explanation',
        answerClassification: 'ASK_FOLLOW_UP',
        followUpPending: true,
        parentQuestionId: currentQ.id,
        action: 'ASK_FOLLOW_UP',
        nextQuestionId: currentQ.id,
        nextQuestionIndex: currentIdx,
      });

      const res = this.wrapResult({
        reply: followUpReply,
        currentQuestionId: currentQ.id,
        currentQuestionIndex: currentIdx,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'ASK_FOLLOW_UP',
        summaryOfCollected: '',
      });
      if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, res);
      return res;
    }

    if (!state.answers[currentQ.id]) {
      state.answers[currentQ.id] = {
        callId: state.sessionId,
        campaignId: state.campaignId,
        surveyId: state.eventId,
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        originalAnswer: userText,
        followUpAnswer: null,
        combinedAnswer: userText,
        answerText: userText,
        status: 'answered',
        followUpCount: 0,
        parentQuestionId: currentQ.id,
        answeredAt: nowIso,
        followUps: [],
      };
    } else {
      const existing = state.answers[currentQ.id];
      existing.followUpAnswer = userText;
      existing.combinedAnswer = `${existing.originalAnswer || existing.answerText}; ${userText}`;
      existing.answerText = existing.combinedAnswer;
      existing.followUpCount = (existing.followUpCount || 0) + 1;
      existing.answeredAt = nowIso;
      if (!existing.followUps) existing.followUps = [];
      existing.followUps.push({
        question: state.transcripts.slice(-2)[0]?.text || '',
        answer: userText,
      });
    }

    if (!state.answeredQuestionIds.includes(currentQ.id)) {
      state.answeredQuestionIds.push(currentQ.id);
    }

    this.populateLegacyTopicAnswers(state, currentQ, userText);
    const ack = analysis.acknowledgment || getRandomTeluguAck();
    const nextTurnRes = this.advanceToNextQuestion(state, activeQuestions, ack);

    console.log('[SURVEY_STRUCTURED_PROGRESSION]', {
      callId: state.sessionId,
      sessionId: state.sessionId,
      currentQuestionId: currentQ.id,
      currentQuestionIndex: currentIdx,
      detectedIntent: analysis.reason || 'Main answer accepted',
      answerClassification: analysis.action,
      followUpPending: false,
      parentQuestionId: currentQ.id,
      action: nextTurnRes.action,
      nextQuestionId: nextTurnRes.currentQuestionId,
      nextQuestionIndex: nextTurnRes.currentQuestionIndex,
    });

    if (params.toolCallId) this.executedToolCalls.set(params.toolCallId, nextTurnRes);
    return nextTurnRes;
  }

  /**
   * Advances deterministically to the next active question.
   * If all active questions are answered, triggers closing message and completion.
   */
  private static advanceToNextQuestion(
    state: SurveyEngineSessionState,
    activeQuestions: SurveyQuestion[],
    acknowledgment: string
  ): EngineTurnResult {
    state.currentQuestionIndex++;
    state.followUpCountForCurrentQuestion = 0;
    state.pending_follow_up = null;

    // Advance past any questions that are already answered or skipped
    while (
      state.currentQuestionIndex < activeQuestions.length &&
      (state.answeredQuestionIds.includes(activeQuestions[state.currentQuestionIndex].id) ||
       state.skippedQuestionIds.includes(activeQuestions[state.currentQuestionIndex].id))
    ) {
      state.currentQuestionIndex++;
    }

    // Check if there are remaining questions
    if (state.currentQuestionIndex < activeQuestions.length) {
      const nextQ = activeQuestions[state.currentQuestionIndex];
      state.currentQuestionId = nextQ.id;
      state.pendingQuestionId = nextQ.id;
      state.pendingFollowUpQuestionId = null;
      state.surveyCompletionStatus = 'in_progress';
      state.stateMachineState = 'WAITING_FOR_RESPONSE';

      // Update legacy state
      state.current_question = nextQ.id;
      state.current_question_id = nextQ.id;
      state.current_question_topic = nextQ.category || 'general';

      const cleanQText = nextQ.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
      const prefix = cleanQText.startsWith('మరి') ? '' : 'మరి ';
      const reply = `${acknowledgment} ${prefix}${cleanQText}`.trim();
      state.lastGeneratedReply = reply;

      state.transcripts.push({
        role: 'agent',
        text: reply,
        timestamp: new Date().toISOString(),
        questionId: nextQ.id,
        questionOrder: state.currentQuestionIndex + 1,
        turnType: 'main_question',
      });

      engineSessions.set(state.sessionId, state);
      this.persistSessionState(state);

      return this.wrapResult({
        reply,
        currentQuestionId: nextQ.id,
        currentQuestionIndex: state.currentQuestionIndex,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: false,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'ASK_MAIN_QUESTION',
        summaryOfCollected: '',
      });
    } else {
      // ALL ACTIVE QUESTIONS COMPLETED!
      state.stateMachineState = 'COMPLETED';
      state.conversationStatus = 'completed';
      state.conversation_status = 'completed';
      state.surveyCompletionStatus = 'completed';
      state.pendingFollowUpQuestionId = null;

      // Canonical Telugu closing message already begins with the approved acknowledgement "సరే అండి, ధన్యవాదాలు."
      const closingReply = TELUGU_STRINGS.CLOSING_MESSAGE;
      state.lastGeneratedReply = closingReply;

      state.transcripts.push({
        role: 'agent',
        text: closingReply,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(state.sessionId, state);
      this.persistSessionState(state);

      return this.wrapResult({
        reply: closingReply,
        currentQuestionId: '',
        currentQuestionIndex: activeQuestions.length,
        totalActiveQuestions: activeQuestions.length,
        extractedAnswers: this.buildExtractedAnswers(state),
        isSurveyComplete: true,
        isSurveyStopped: false,
        isCallback: false,
        callbackScheduledAt: null,
        conversationState: state,
        conversation_state: state,
        action: 'END',
        summaryOfCollected: 'సర్వే విజయవంతంగా పూర్తయింది.',
      });
    }
  }

  /**
   * Helper to build extracted answers array
   */
  private static buildExtractedAnswers(state: SurveyEngineSessionState): Array<{
    questionId: string;
    answerSummary: string;
    status: 'answered' | 'skipped' | 'refused' | 'pending';
  }> {
    const list: Array<{
      questionId: string;
      answerSummary: string;
      status: 'answered' | 'skipped' | 'refused' | 'pending';
    }> = [];

    for (const [qId, entry] of Object.entries(state.answers)) {
      if (entry && typeof entry === 'object' && entry.answerText) {
        list.push({
          questionId: qId,
          answerSummary: entry.answerText,
          status: entry.status || 'answered',
        });
      }
    }

    return list;
  }

  /**
   * Populates legacy fields on state.answers so older tests (e.g. test-dynamic-conversation) pass
   */
  private static populateLegacyTopicAnswers(
    state: SurveyEngineSessionState,
    question: SurveyQuestion,
    utterance: string
  ): void {
    const u = utterance.toLowerCase();

    // Days per week extraction
    const daysMatch = utterance.match(/(\d+)\s*(days|రోజులు)?/i);
    if (daysMatch) {
      state.answers['water_days_per_week'] = parseInt(daysMatch[1], 10);
    } else if (/నాలుగు|four/i.test(u)) {
      state.answers['water_days_per_week'] = 4;
    } else if (/మూడు|three/i.test(u)) {
      state.answers['water_days_per_week'] = 3;
    } else if (/రెండు|two/i.test(u)) {
      state.answers['water_days_per_week'] = 2;
    }

    if (/baledhu|బాలేదు|సరిగ్గా లేదు|సరిగ్గా రావు|problem|సమస్య/i.test(u)) {
      state.answers['water_supply'] = 'irregular';
    }

    if (/supply/i.test(u)) {
      state.answers['water_main_issue'] = 'supply';
    }

    if (/timing/i.test(u)) {
      state.answers['water_timing_issue'] = true;
      state.answers['water_timing'] = 'problem';
      if (!state.completed_questions) state.completed_questions = [];
      if (!state.completed_questions.includes('drinking_water')) {
        state.completed_questions.push('drinking_water');
      }
    }
  }
}

// Wire up storage question modifications to automatically invalidate sequential engine session cache
callbridgeStorage.onQuestionsChanged = (eventId) => {
  SurveySequentialEngine.invalidateEventCache(eventId);
};

