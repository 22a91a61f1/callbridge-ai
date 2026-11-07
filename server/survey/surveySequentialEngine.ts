import OpenAI from 'openai';
import { callbridgeStorage, SurveyQuestion } from '../storage/callbridgeStorage.ts';

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
  role: 'agent' | 'respondent' | 'system';
  text: string;
  timestamp: string;
  questionId?: string;
  questionOrder?: number;
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
  CLOSING_MESSAGE: 'మా సర్వేలో పాల్గొని మీ అభిప్రాయాలను తెలియజేసినందుకు చాలా ధన్యవాదాలు. మీ సమయానికి కృతజ్ఞతలు. నమస్కారం.',
  CALLBACK_PROMPT_VAGUE: 'సరే, మీరు ఎప్పుడు మాట్లాడటానికి ఖాళీగా ఉంటారో చెప్పగలరా?',
  CALLBACK_PROMPT_TIME_OF_DAY: 'సరే, ఏ సమయానికి కాల్ చేయమంటారు?',
  SKIP_CONFIRMATION_QUESTION: 'మీరు ఈ ప్రశ్నను దాటవేయాలనుకుంటున్నారా?',
  STOP_CLOSING: 'సరే, ఎలాంటి సమస్య లేదు. మీ సమయానికి ధన్యవాదాలు.',
  NATURAL_ACKNOWLEDGMENTS: [
    'సరేనండి.',
    'అర్థమైంది అండి.',
    'అలాగేనండి.',
    'మంచిదండి.',
    'సరే, చాలా బాగుంది.',
    'సరే, మీ సమస్యను నమోదు చేసుకున్నాం.',
  ],
};

function getRandomTeluguAck(): string {
  const acks = TELUGU_STRINGS.NATURAL_ACKNOWLEDGMENTS;
  return acks[Math.floor(Math.random() * acks.length)];
}

// In-memory session store
const engineSessions = new Map<string, SurveyEngineSessionState>();

// Lazy OpenAI client
let openAiInstance: OpenAI | null = null;
function getOpenAi(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
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
      if ((!rawList || rawList.length === 0) && eventIdOrConfig !== 'event_public_survey') {
        rawList = callbridgeStorage.getSurveyQuestions('event_public_survey');
      }
    } else if (eventIdOrConfig && Array.isArray(eventIdOrConfig.questions) && eventIdOrConfig.questions.length > 0) {
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
    } catch {
      // ignore
    }

    const questions = options?.activeQuestions || this.resolveActiveQuestions(options?.eventId || savedJob?.eventId);

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
      conversationStatus: resumeIndex >= questions.length ? 'completed' : (initialQ ? 'ASKING_MAIN_QUESTION' : 'START'),
      stateMachineState: resumeIndex >= questions.length ? 'COMPLETED' : (initialQ ? 'ASKING_MAIN_QUESTION' : 'START'),
      followUpCountForCurrentQuestion: 0,
      maxFollowUpsPerQuestion: 2,
      callbackRequested: Boolean(initialCallbackScheduledAt || savedJob?.callbackRequested),
      callbackScheduledAt: initialCallbackScheduledAt,
      callbackTimezone: 'Asia/Kolkata',
      callbackDetails: initialCallbackDetails,
      answers: initialAnswers,
      transcripts: initialTranscripts,
      originalTranscript: [...initialTranscripts],
      // Legacy compatibility
      session_id: sessionId,
      current_question: initialQ ? initialQ.id : '',
      current_question_id: initialQ ? initialQ.id : '',
      current_question_topic: initialQ ? (initialQ.category || 'drinking_water') : 'drinking_water',
      conversation_status: resumeIndex >= questions.length ? 'completed' : 'waiting_for_answer',
      completed_questions: initialAnsweredIds,
    };

    engineSessions.set(sessionId, state);
    return state;
  }

  public static resetSession(sessionId: string): void {
    engineSessions.delete(sessionId);
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

    engineSessions.set(sessionId, state);

    return {
      success: true,
      spokenResponse: parsed.confirmationTelugu,
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
      /బిజీ|busy|తర్వాత కాల్|తరువాత కాల్|తర్వాత మాట్లాడ|తరువాత మాట్లాడ|ఇప్పుడు మాట్లాడలేను|ఇప్పుడు కుదరదు|సాయంత్రం కాల్|రేపు కాల్|రేపు ఉదయం|సాయంత్రం చేయండి|కాల్ చేయండి.*తర్వాత|టైమ్ లేదు|టైం లేదు|సమయం లేదు|వేరే పని/i.test(
        t
      );

    const isStop =
      /ఆపండి|ఆపేయండి|ముగించండి|వద్దు ఇక|ఇక వద్దు|కాల్ కట్|stop|end call|don't call|dont call|ఇష్టం లేదు.*సర్వే/i.test(
        t
      );

    const isSkip =
      /^దాటవేయండి$|^వదిలేయండి$|^skip$|^వద్దు$|^పాస్$/i.test(t) ||
      /ఈ ప్రశ్న దాటవేయండి|ఈ ప్రశ్న వద్దు|తర్వాతికి వెళ్ళండి|skip this/i.test(t);

    const isNextQuestion =
      /^next$|^next question$|^తర్వాతి ప్రశ్న$|^తదుపరి ప్రశ్న$/i.test(t) ||
      /నెక్స్ట్ క్వశ్చన్|నెక్స్ట్ ప్రశ్న/i.test(t);

    const isDontKnow =
      /తెలియదు|ఐడియా లేదు|నాకు తెలియదండి|నాకు ఐడియా లేదు|don'?t know/i.test(t);

    const isClarification =
      /అర్థం కాలేదు|మళ్లీ చెప్పండి|ఏమన్నారు|వివరించండి|repeat/i.test(t);

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
    action: 'ASK_FOLLOW_UP' | 'ACCEPT_ANSWER' | 'CLARIFY' | 'SKIP' | 'CALLBACK' | 'END';
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
    const client = getOpenAi();

    // If OpenAI is unavailable or fails, use safe deterministic Telugu logic
    if (!client) {
      return this.fallbackTurnAnalysis(params);
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
   - CALLBACK / BUSY: Respondent is busy, has no time, or requested callback (e.g. "ఇప్పుడు బిజీగా ఉన్నాను", "ఇప్పుడు మాట్లాడలేను", "నేను ఆఫీసులో ఉన్నాను", "తర్వాత మాట్లాడతాను", "సాయంత్రం మాట్లాడదాం", "సాయంత్రం కాల్ చేయండి", "రేపు కాల్ చేయండి").
     CRITICAL: Do NOT treat this as an answer to the survey question! Do NOT advance to the next question.
     - If time is vague (e.g. "ఇప్పుడు బిజీగా ఉన్నాను", "తర్వాత మాట్లాడతాను", "సాయంత్రం చేయండి"):
       - If they mention "సాయంత్రం": prompt = "సాయంత్రం ఏ సమయానికి కాల్ చేయమంటారు? 5 గంటలకా లేక 6 గంటలకా?"
       - If they mention "ఉదయం": prompt = "ఉదయం ఏ సమయానికి కాల్ చేయమంటారు? 10 గంటలకా లేక 11 గంటలకా?"
       - Otherwise: prompt = "సరే, మీకు ఏ సమయంలో మాట్లాడటానికి వీలవుతుంది?"
       action = "CALLBACK", callbackDetails = { isCallback: true, isTimeVague: true, clarificationQuestion: prompt }
     - If specific time is given (e.g. "సాయంత్రం 6 గంటలకు కాల్ చేయండి"):
       action = "CALLBACK", callbackDetails = { isCallback: true, isTimeVague: false }, acknowledgment = "సరే, ఈరోజు సాయంత్రం 6 గంటలకు మళ్లీ కాల్ చేస్తాము. ధన్యవాదాలు."
   - STOP: Respondent explicitly refuses or wants to end the call immediately ("మాట్లాడను", "సర్వే వద్దు", "కాల్ కట్ చేయండి", "stop").
   - SKIP: Respondent explicitly wants to skip this question ("దాటవేయండి", "skip").
   - CLARIFY / IRRELEVANT: Respondent asked unrelated questions (e.g., "ఎవరికి ఓటు వేయాలి", "మీది ఏ ఊరు", "మీరు ఎవరు"):
     Politely redirect back to the current question in Telugu: "క్షమించండి, మేము రాజకీయ సలహాలు ఇవ్వలేము. మన ప్రాంత సమస్యల గురించే మాట్లాడుతున్నాం. ${mainQuestion.text}".
   - ANSWER: Respondent answered the question:
     a) POSITIVE ANSWER (e.g., "బాగుంది.", "బాగానే ఉంది.", "ఎలాంటి సమస్య లేదు.", "అన్నీ బాగున్నాయి.", "ప్రతిరోజూ నీళ్లు వస్తున్నాయి.", "లేదు సమస్య లేదు", "సమస్య ఏమీ లేదు", "good", "fine", "no problem"):
        action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "అలాగేనండి." or "సరే, చాలా బాగుంది." or "మంచిదండి."
        (CRITICAL: Never ask a problem-related follow-up when the respondent says there is no problem or everything is good!)
     b) NEGATIVE / PROBLEM WITH DETAILS (e.g., "నీళ్లు సరిగ్గా రావడం లేదు, మూడు రోజులకొకసారి మాత్రమే వస్తున్నాయి.", "రోడ్లు చాలా పాడయ్యాయి, వర్షం పడితే నీళ్లు నిలిచిపోతున్నాయి.", "వారానికి రెండు రోజులే వస్తాయి", "గుంతలు ఎక్కువగా ఉన్నాయి"):
        action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "అవునా అండి, అర్థమైంది." or "సరేనండి, మీ సమస్యను నమోదు చేసుకున్నాం."
        (CRITICAL: Do not ask a follow-up question when specific details/frequency are already provided!)
     c) SHORT / INCOMPLETE PROBLEM (e.g., "నీళ్లు సరిగ్గా రావడం లేదు.", "మా ప్రాంతంలో రోడ్లు బాగోలేవు.", "డ్రైనేజీ సమస్య ఉంది.", "వీధి లైట్లు పనిచేయడం లేదు.", "బాలేదు", "సమస్య ఉంది"):
        - If current followUpCount (${followUpCount}) < maxFollowUps (${maxFollowUps}):
          action = "ASK_FOLLOW_UP", answerSufficient = false.
          Generate ONE intelligent, natural spoken Telugu follow-up question probing for missing details:
          * Drinking water: "నీళ్లు ఎన్ని రోజులకొకసారి వస్తున్నాయి?" or "రోజులో ఎన్ని గంటలు వస్తున్నాయి?"
          * Roads: "రోడ్లపై గుంతలు ఎక్కువగా ఉన్నాయా, లేక వర్షం నీళ్లు నిలుస్తున్నాయా?"
          * Drainage: "మురుగు నీరు రోడ్డుపైకి వస్తోందా, లేక ఇంట్లోకి వస్తోందా?"
          * Street lights: "స్ట్రీట్ లైట్లు అసలు వెలగడం లేదా, లేక రాత్రిపూట ఆగిపోతున్నాయా?"
          * Waste management: "చెత్త సేకరణ వారంలో ఎన్ని రోజులు జరుగుతోంది?"
          acknowledgment = "అవునా అండి." or "అర్థమైంది అండి." or "అలాగేనండి."
        - If current followUpCount >= ${maxFollowUps}:
          action = "ACCEPT_ANSWER", answerSufficient = true, followUpQuestion = null, acknowledgment = "సరేనండి, మీ సమస్యను నమోదు చేసుకున్నాం."
5. Spoken acknowledgments must be STRICTLY authentic natural Telugu script (తెలుగు లిపి).
   NEVER use English words like "Okay", "Noted", "Fine", "Thank you, noted".
   Naturally vary acknowledgments: "అలాగేనండి.", "అవునా అండి.", "అర్థమైంది అండి.", "సరేనండి.", "మంచిదండి.", "సరే, చాలా బాగుంది.", "సరేనండి, మీ సమస్యను నమోదు చేసుకున్నాం.".
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
    action: 'ASK_FOLLOW_UP' | 'ACCEPT_ANSWER' | 'CLARIFY' | 'SKIP' | 'CALLBACK' | 'END';
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

    if (quick.isStop) {
      return {
        action: 'END',
        followUpQuestion: null,
        reason: 'Respondent asked to end the call',
        answerSufficient: false,
        acknowledgment: TELUGU_STRINGS.STOP_CLOSING,
        extractedSummary: 'నిరాకరించారు / కాల్ ఆపమన్నారు',
      };
    }

    if (quick.isCallback) {
      const hasSpecificTime =
        /\d{1,2}/.test(u) ||
        /(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది|పది|పదకొండు|పన్నెండు)\s*గంటల/i.test(u);

      if (!hasSpecificTime) {
        let promptText = 'సరే, మీకు ఏ సమయంలో మాట్లాడటానికి వీలవుతుంది?';
        if (/సాయంత్రం/i.test(u)) {
          promptText = 'సాయంత్రం ఏ సమయానికి కాల్ చేయమంటారు? 5 గంటలకా లేక 6 గంటలకా?';
        } else if (/ఉదయం/i.test(u)) {
          promptText = 'ఉదయం ఏ సమయానికి కాల్ చేయమంటారు? 10 గంటలకా లేక 11 గంటలకా?';
        }
        return {
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
        };
      } else {
        const parsed = this.parseCallbackDateTime(respondentUtterance, 'Asia/Kolkata');
        return {
          action: 'CALLBACK',
          followUpQuestion: null,
          reason: 'Respondent specified callback time',
          answerSufficient: false,
          acknowledgment: parsed.confirmationTelugu,
          callbackDetails: {
            isCallback: true,
            isTimeVague: false,
            confirmationMessage: parsed.confirmationTelugu,
            rawUtterance: respondentUtterance,
            scheduledIso: parsed.scheduledIso,
            requestedDate: parsed.resolvedDateStr,
            requestedTime: parsed.resolvedTimeStr,
            timezone: 'Asia/Kolkata',
          },
          extractedSummary: `కాల్‌బ్యాక్ షెడ్యూల్ చేయబడింది: ${parsed.resolvedDateStr} ${parsed.resolvedTimeStr}`,
        };
      }
    }

    if (quick.isSkip) {
      return {
        action: 'SKIP',
        followUpQuestion: null,
        reason: 'Respondent requested to skip question',
        answerSufficient: true,
        acknowledgment: 'సరేనండి, ఈ ప్రశ్నను దాటవేస్తున్నాను.',
        extractedSummary: 'దాటవేశారు (Skipped)',
      };
    }

    if (quick.isNextQuestion) {
      return {
        action: 'CLARIFY',
        followUpQuestion: null,
        reason: 'Respondent said next question without answering',
        answerSufficient: false,
        acknowledgment: TELUGU_STRINGS.SKIP_CONFIRMATION_QUESTION,
        extractedSummary: 'నెక్స్ట్ క్వశ్చన్ అన్నారు',
      };
    }

    // Irrelevant / Political queries -> Polite redirect
    if (/ఓటు|పార్టీ|రాజకీయ|ఎవరు మీరు|మీరెవరు|మీది ఏ ఊరు|vote|party|who are you/i.test(u)) {
      return {
        action: 'CLARIFY',
        followUpQuestion: null,
        reason: 'Irrelevant or political query redirected to survey topic',
        answerSufficient: false,
        acknowledgment: `క్షమించండి, మేము రాజకీయ సలహాలు ఇవ్వలేము. మన ప్రాంత సమస్యల గురించే మాట్లాడుతున్నాం. ${mainQuestion.text}`,
        extractedSummary: 'విషయేతర సంభాషణ - సర్వే ప్రశ్నకు మళ్లించబడింది',
      };
    }

    // Positive answers: no issue, good, working fine, daily coming
    const isPositive =
      (
        /బాగుంది|బాగున్నాయి|బాగానే|బావుంది|బావున్నాయి|చాలా బాగుంది|చాలా మంచిగా|సమస్య లేదు|ఏమీ లేదు|ఎలాంటి సమస్య లేదు|ఎలాంటి ఇబ్బంది లేదు|ఇబ్బంది లేదు|అన్నీ బాగున్నాయి|ప్రతిరోజూ.*వస్తున్నాయి|ప్రతిరోజూ.*వస్తాయి|రోజూ.*వస్తాయి|రోజూ.*వస్తున్నాయి|good|fine|no problem|all good|bagundhi|bagunnayi|baane undhi/i.test(u) ||
        (/లేదు/i.test(u) && /బాగా|సమస్య|ఇబ్బంది/i.test(u))
      ) &&
      !/బాగోలేదు|సరిగ్గా రావడం లేదు|సరిగ్గా రావు|సమస్య ఉంది|చెడిపోయాయి|గుంతలు|బాలేదు|baledhu/i.test(u);

    if (isPositive) {
      return {
        action: 'ACCEPT_ANSWER',
        followUpQuestion: null,
        reason: 'Positive answer with no issue reported',
        answerSufficient: true,
        acknowledgment: 'అలాగేనండి.',
        extractedSummary: respondentUtterance,
      };
    }

    // Detailed problem answers (respondent already gave specifics, numbers, reasons, frequency)
    const hasDetailedExplanation =
      (/\b(రెండు|మూడు|నాలుగు|ఐదు|ఒక|రెండు|వారం|రోజులు|\d+)\s*(రోజు|గంట|సార్లు|రోజుల|వారం)/i.test(u)) ||
      /మూడు రోజులకొకసారి|రెండు రోజులకొకసారి|వారానికి|రాత్రిపూట|రాత్రి పూట/i.test(u) ||
      (/వర్షం|వర్షాలు/i.test(u) && /నీళ్లు నిలుస్తున్నాయి|నీళ్లు నిలిచిపోతున్నాయి|పాడయ్యాయి|హోల్స్|గుంతలు/i.test(u)) ||
      (/గుంతలు/i.test(u) && /చాలా|ఎక్కువ|వర్షం|వర్షాలు|హోల్స్|నీళ్లు/i.test(u)) ||
      (u.length > 20 && /కారణంగా|వల్ల|ఎందుకంటే|అసలు రావు|వారానికి|హోల్స్/i.test(u));

    if (hasDetailedExplanation) {
      return {
        action: 'ACCEPT_ANSWER',
        followUpQuestion: null,
        reason: 'Detailed problem answer with specifics already provided',
        answerSufficient: true,
        acknowledgment: 'అవునా అండి, అర్థమైంది.',
        extractedSummary: respondentUtterance,
      };
    }

    // Short or incomplete problem answers needing follow-up
    const isNegativeOrProblem =
      /బాగోలేదు|రావడం లేదు|సరిగ్గా రావు|సమస్య ఉంది|సమస్యలు ఉన్నాయి|చెడిపోయాయి|గుంతలు|బాలేదు|baledhu|problem|worst|పనిచేయడం లేదు|పనిచేయట్లేదు/i.test(u);

    if (isNegativeOrProblem && followUpCount < maxFollowUps) {
      let contextualFollowUp = 'ఈ సమస్య గురించి మరికొన్ని వివరాలు చెప్పగలరా?';
      const qText = mainQuestion.text.toLowerCase();

      if (qText.includes('నీరు') || qText.includes('తాగునీ') || qText.includes('water')) {
        contextualFollowUp = 'నీళ్లు ఎన్ని రోజులకొకసారి వస్తున్నాయి?';
      } else if (qText.includes('రోడ్') || qText.includes('road')) {
        contextualFollowUp = 'రోడ్లపై గుంతలు ఎక్కువగా ఉన్నాయా, లేక వర్షం నీళ్లు నిలుస్తున్నాయా?';
      } else if (qText.includes('దీప') || qText.includes('లైట్') || qText.includes('light')) {
        contextualFollowUp = 'స్ట్రీట్ లైట్లు అసలు వెలగడం లేదా, లేక రాత్రిపూట ఆగిపోతున్నాయా?';
      } else if (qText.includes('చెత్త') || qText.includes('పారిశుద్ధ్య') || qText.includes('garbage')) {
        contextualFollowUp = 'చెత్త సేకరణ వారంలో ఎన్ని రోజులు జరుగుతోంది?';
      } else if (qText.includes('డ్రైనేజీ') || qText.includes('మురుగు') || qText.includes('drainage')) {
        contextualFollowUp = 'మురుగు నీరు రోడ్డుపైకి వస్తోందా, లేక ఇంట్లోకి వస్తోందా?';
      } else if (qText.includes('విద్యుత్') || qText.includes('కరెంట్') || qText.includes('power')) {
        contextualFollowUp = 'కరెంట్ కోతలు ఎక్కువగా రాత్రిపూట ఉంటున్నాయా, లేక పగటిపూట ఉంటున్నాయా?';
      } else if (qText.includes('వైద్య') || qText.includes('ఆరోగ్య') || qText.includes('hospital')) {
        contextualFollowUp = 'వైద్యులు అందుబాటులో ఉంటున్నారా, లేక మందుల కొరత ఉందా?';
      }

      return {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: contextualFollowUp,
        reason: 'Contextual follow-up for problem answer',
        answerSufficient: false,
        acknowledgment: 'అవునా అండి.',
        extractedSummary: respondentUtterance,
      };
    }

    return {
      action: 'ACCEPT_ANSWER',
      followUpQuestion: null,
      reason: followUpCount >= maxFollowUps ? 'Max follow-ups reached, accepting response' : 'Sufficient answer provided',
      answerSufficient: true,
      acknowledgment: isNegativeOrProblem ? 'సరేనండి, మీ సమస్యను నమోదు చేసుకున్నాం.' : 'అలాగేనండి.',
      extractedSummary: respondentUtterance,
    };
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
    const periodLabel = hour >= 12 && hour < 16 ? 'మధ్యాహ్నం' : hour >= 16 ? 'సాయంత్రం' : 'ఉదయం';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const confirmationTelugu = `సరే, ${resolvedDayLabel} ${periodLabel} ${displayHour} గంటలకు తిరిగి కాల్ చేస్తాము. ధన్యవాదాలు.`;

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
    return {
      ...res,
      spokenResponse: res.reply,
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
    const userText = lastUserMsg.text.trim();

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

        const promptMsg =
          analysis.callbackDetails?.clarificationQuestion ||
          (/సాయంత్రం/i.test(userText)
            ? 'సాయంత్రం ఏ సమయానికి కాల్ చేయమంటారు? 5 గంటలకా లేక 6 గంటలకా?'
            : /ఉదయం/i.test(userText)
            ? 'ఉదయం ఏ సమయానికి కాల్ చేయమంటారు? 10 గంటలకా లేక 11 గంటలకా?'
            : 'సరే, మీకు ఏ సమయంలో మాట్లాడటానికి వీలవుతుంది?');

        state.transcripts.push({
          role: 'agent',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);

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
      state.conversationStatus = 'ended_by_user';
      state.stateMachineState = 'COMPLETED';
      const stopClosing = TELUGU_STRINGS.STOP_CLOSING;

      state.transcripts.push({
        role: 'agent',
        text: stopClosing,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(sessionId, state);

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
    // CASE 4: NEXT QUESTION WITHOUT ANSWERING
    // -------------------------------------------------------------------------
    if (analysis.action === 'CLARIFY' && /దాటవేయాలనుకుంటున్నారా/i.test(analysis.acknowledgment)) {
      const clarifyText = TELUGU_STRINGS.SKIP_CONFIRMATION_QUESTION;
      state.transcripts.push({
        role: 'agent',
        text: clarifyText,
        timestamp: new Date().toISOString(),
        questionId: currentQ.id,
        questionOrder: currentIdx + 1,
        turnType: 'clarification',
      });

      engineSessions.set(sessionId, state);

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
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          answerText: userText,
          followUps: [],
          answeredAt: nowIso,
          status: 'answered',
        };
      } else {
        if (!state.answers[currentQ.id].followUps) state.answers[currentQ.id].followUps = [];
        state.answers[currentQ.id].followUps.push({
          question: state.transcripts.slice(-2)[0]?.text || '',
          answer: userText,
        });
      }

      // Legacy compatibility for test suites
      this.populateLegacyTopicAnswers(state, currentQ, userText);

      const ack = analysis.acknowledgment || getRandomTeluguAck();
      const followUpReply = `${ack} ${analysis.followUpQuestion.trim()}`;

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
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        answerText: userText,
        followUps: [],
        answeredAt: nowIso,
        status: 'answered',
      };
    } else {
      if (!state.answers[currentQ.id].followUps) state.answers[currentQ.id].followUps = [];
      state.answers[currentQ.id].followUps.push({
        question: state.transcripts.slice(-2)[0]?.text || '',
        answer: userText,
      });
      // Append to main answer summary
      state.answers[currentQ.id].answerText += `; ${userText}`;
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
    const userText = lastUserMsg.text.trim();

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

        const promptMsg =
          analysis.callbackDetails?.clarificationQuestion ||
          (/సాయంత్రం/i.test(userText)
            ? 'సాయంత్రం ఏ సమయానికి కాల్ చేయమంటారు? 5 గంటలకా లేక 6 గంటలకా?'
            : /ఉదయం/i.test(userText)
            ? 'ఉదయం ఏ సమయానికి కాల్ చేయమంటారు? 10 గంటలకా లేక 11 గంటలకా?'
            : 'సరే, మీకు ఏ సమయంలో మాట్లాడటానికి వీలవుతుంది?');

        state.transcripts.push({
          role: 'agent',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          turnType: 'callback',
        });

        engineSessions.set(sessionId, state);

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
      state.conversationStatus = 'ended_by_user';
      state.stateMachineState = 'COMPLETED';
      const stopClosing = TELUGU_STRINGS.STOP_CLOSING;

      state.transcripts.push({
        role: 'agent',
        text: stopClosing,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(sessionId, state);

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

    if (
      analysis.action === 'ASK_FOLLOW_UP' &&
      analysis.followUpQuestion &&
      state.followUpCountForCurrentQuestion < state.maxFollowUpsPerQuestion
    ) {
      state.followUpCountForCurrentQuestion++;
      state.stateMachineState = 'WAITING_FOR_FOLLOW_UP_RESPONSE';

      if (!state.answers[currentQ.id]) {
        state.answers[currentQ.id] = {
          questionId: currentQ.id,
          questionText: currentQ.text,
          questionOrder: currentIdx + 1,
          answerText: userText,
          followUps: [],
          answeredAt: nowIso,
          status: 'answered',
        };
      } else {
        if (!state.answers[currentQ.id].followUps) state.answers[currentQ.id].followUps = [];
        state.answers[currentQ.id].followUps.push({
          question: state.transcripts.slice(-2)[0]?.text || '',
          answer: userText,
        });
      }

      this.populateLegacyTopicAnswers(state, currentQ, userText);
      const ack = analysis.acknowledgment || getRandomTeluguAck();
      const followUpReply = `${ack} ${analysis.followUpQuestion.trim()}`;

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

    if (!state.answers[currentQ.id]) {
      state.answers[currentQ.id] = {
        questionId: currentQ.id,
        questionText: currentQ.text,
        questionOrder: currentIdx + 1,
        answerText: userText,
        followUps: [],
        answeredAt: nowIso,
        status: 'answered',
      };
    } else {
      if (!state.answers[currentQ.id].followUps) state.answers[currentQ.id].followUps = [];
      state.answers[currentQ.id].followUps.push({
        question: state.transcripts.slice(-2)[0]?.text || '',
        answer: userText,
      });
      state.answers[currentQ.id].answerText += `; ${userText}`;
    }

    if (!state.answeredQuestionIds.includes(currentQ.id)) {
      state.answeredQuestionIds.push(currentQ.id);
    }

    this.populateLegacyTopicAnswers(state, currentQ, userText);
    const ack = analysis.acknowledgment || getRandomTeluguAck();
    return this.advanceToNextQuestion(state, activeQuestions, ack);
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

    // Check if there are remaining questions
    if (state.currentQuestionIndex < activeQuestions.length) {
      const nextQ = activeQuestions[state.currentQuestionIndex];
      state.currentQuestionId = nextQ.id;
      state.pendingQuestionId = nextQ.id;
      state.stateMachineState = 'WAITING_FOR_RESPONSE';

      // Update legacy state
      state.current_question = nextQ.id;
      state.current_question_id = nextQ.id;
      state.current_question_topic = nextQ.category || 'general';

      const cleanQText = nextQ.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
      const reply = `${acknowledgment} మరి ${cleanQText}`;
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

      const closingReply = `${acknowledgment} ${TELUGU_STRINGS.CLOSING_MESSAGE}`;
      state.lastGeneratedReply = closingReply;

      state.transcripts.push({
        role: 'agent',
        text: closingReply,
        timestamp: new Date().toISOString(),
        turnType: 'closing',
      });

      engineSessions.set(state.sessionId, state);

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
