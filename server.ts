import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { voiceRouter } from './server/voice/voiceRouter.ts';
import { ElevenLabsService} from './server/voice/elevenLabsService.ts';
import { voiceProfileStorage } from './server/voice/voiceProfileStorage.ts';
import { surveySessionStore, type SurveySessionState } from './server/survey/sessionManager.ts';
import {
  processTurnMemory,
  QUESTION_TOPIC_MAP,
  TOPIC_QUESTION_MAP,
  isCallEndStatement,
  isRefusalStatement,
  isBusyStatement,
  isAlreadyAnsweredStatement,
} from './server/survey/memoryEngine.ts';
import { processTurnWithOpenAi } from './server/survey/openAiEngine.ts';

import { callbridgeRouter } from './server/callbridgeRouter.ts';
import { VapiService } from './server/telephony/vapiService.ts';
import { queueManager } from './server/campaign/queueManager.ts';
import { callbridgeStorage } from './server/storage/callbridgeStorage.ts';
import { ExportService } from './server/reporting/exportService.ts';
import { SurveySequentialEngine } from './server/survey/surveySequentialEngine.ts';

dotenv.config({ override: true });

const app = express();
const PORT = 3000;

app.set('trust proxy', true);

// CORS & Preflight handling for iframe, preview and mobile environments
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, xi-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Auto-register public host URL for Vapi webhooks (strictly HTTPS for public endpoints)
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const rawHost = host.split(',')[0].trim();
    VapiService.setAppBaseUrl(`https://${rawHost}`);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Inbound Vapi & Telephony webhook routes (Root & API endpoints)
const handleIncomingVapiWebhook = (req: express.Request, res: express.Response) => {
  const result = VapiService.handleWebhook(req.body);
  if (result.job?.campaignId && result.isTerminal) {
    queueManager.onJobTerminal(result.job.campaignId, result.job.id, {
      isAnswered: result.job.status === 'completed',
      isNoAnswer: result.job.status === 'no_answer',
      isFailed: result.job.status === 'failed',
      status: result.job.status,
    });
  }
  res.json(result);
};

app.post('/vapi/webhook', handleIncomingVapiWebhook);
app.post('/api/vapi/webhook', handleIncomingVapiWebhook);
app.post('/api/callbridge/vapi/webhook', handleIncomingVapiWebhook);
app.post('/telephony/webhook', (req, res) => {
  const result = queueManager.handleTelephonyWebhook({
    callId: req.body?.call_id || req.body?.CallSid || req.body?.callId,
    status: req.body?.status || req.body?.CallStatus || 'completed',
    duration: req.body?.duration ? parseInt(req.body.duration, 10) : undefined,
    digits: req.body?.digits || req.body?.Digits,
    failureReason: req.body?.error_message || req.body?.errorMessage,
  });
  res.json(result);
});

// Mount CallBridge AI multi-event & campaign management router
app.use('/api/callbridge', callbridgeRouter);

// Mount User Voice Cloning module (Reusable for Mobile App, Survey, Events)
app.use('/api/voice-profile', voiceRouter);

// Lazy initialization for GoogleGenAI with mandatory telemetry header
let aiClientInstance: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClientInstance) {
    aiClientInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClientInstance;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'telugu-public-survey-ai-voice-agent' });
});

// Session Management Endpoints
app.get('/api/survey/session/:session_id', (req, res) => {
  const session = surveySessionStore.getSession(req.params.session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json(session);
});

app.post('/api/survey/session/reset', (req, res) => {
  const sessionId = req.body?.session_id || 'session_001';
  const surveyId = req.body?.survey_id || 'public_facilities';
  const session = surveySessionStore.resetSession(sessionId, surveyId, 'te');
  return res.json({ success: true, session });
});

// High-Priority Conversation Intent classification helper
export type ConversationIntent =
  | 'GREETING'
  | 'SMALL_TALK'
  | 'WHY_CALLING'
  | 'WHO_ARE_YOU'
  | 'AGREE_PARTICIPATE'
  | 'SURVEY_ANSWER'
  | 'SURVEY_QUESTION'
  | 'CLARIFICATION'
  | 'ALREADY_ANSWERED'
  | 'CORRECTION'
  | 'BUSY'
  | 'REFUSE'
  | 'STOP'
  | 'VOTE_ADVICE_QUERY'
  | 'UNRELATED'
  | 'UNCLEAR';

export function classifyConversationIntent(
  text: string,
  hasConfiguredQuestions = true,
  contextHistory: Array<{ role: string; text: string }> = []
): ConversationIntent {
  const t = text.trim();
  if (!t) return 'UNCLEAR';

  // PRIORITY 1: STOP / CALL END
  if (
    isCallEndStatement(t) ||
    /ఆపండి|ఆపగలరా|ఆపేయండి|ముగించండి|ఇక్కడితో ముగించు|ఇక వద్దు|వద్దు ఇక|stop|quit|end call|don't call|dont call/i.test(t)
  ) {
    return 'STOP';
  }

  // PRIORITY 2: REFUSAL
  if (
    isRefusalStatement(t) ||
    /చెప్పను|సమాధానం చెప్పను|దాటవేయండి|skip|వద్దు|ఇష్టం లేదు|పాస్|don'?t want to answer|won'?t answer|refuse/i.test(t)
  ) {
    return 'REFUSE';
  }

  // PRIORITY 3: BUSY / NOT AVAILABLE
  if (
    isBusyStatement(t) ||
    /బిజీ|busy|టైమ్ లేదు|టైం లేదు|సమయం లేదు|పని ఉంది|వేరే పని ఉంది|మాట్లాడలేను|తర్వాత మాట్లాడ|తరువాత మాట్లాడ|ఇప్పుడు కుదరదు|తర్వాత చేయండి|తర్వాత కాల్/i.test(t)
  ) {
    return 'BUSY';
  }

  // 4. CRITICAL CONVERSATION CONTROL: AGREE_PARTICIPATE
  // Examples: "సరే, సర్వే చేయండి.", "సర్వే చేయండి", "సర్వే ప్రారంభించండి", "సరే, అడగండి", "అడగండి", "సరే, ప్రారంభిద్దాం", "ప్రశ్నలు అడగండి", "ఓకే, అడగండి"
  // When the respondent agrees to participate, the interviewer must take initiative immediately.
  if (
    /సర్వే చేయండి|సర్వే ప్రారంభించండి|సర్వే మొదలుపెట్టండి|ప్రారంభించండి|మొదలుపెట్టండి|అడగండి|ప్రశ్నలు అడగండి|ప్రశ్న అడగండి|సరే.*సర్వే|ఓకే.*సర్వే|సర్వే చేయవచ్చు|సర్వే చేయగలరు|start survey|ask questions|ask question|go ahead|proceed/i.test(
      t
    ) ||
    /^(సరే|ఓకే|అలాగే)[\,\.\s]*(సర్వే|అడగండి|చెప్పండి|ప్రారంభిద్దాం|చేయండి)/i.test(t)
  ) {
    return 'AGREE_PARTICIPATE';
  }

  // 5. WHO_ARE_YOU
  // Examples: "నువ్వు ఎవరు?", "మీరెవరు?", "ఎవరు మీరు?", "మీ పేరేంటి?", "Who are you?"
  if (/who are you|నువ్వు ఎవరు|మీరెవరు|ఎవరు మీరు|మీ పేరేంటి|ఎవరితో మాట్లాడుతున్నాను/i.test(t)) {
    return 'WHO_ARE_YOU';
  }

  // 5. WHY_CALLING / WHY_SURVEY
  // Examples: "ఎందుకు కాల్ చేస్తున్నారు?", "ఎందుకు ఫోన్ చేస్తున్నారు?", "ఈ సర్వే ఎందుకు చేస్తున్నారు?", "Why are you calling me?", "ఎందుకు అడుగుతున్నారు?"
  if (
    /why are you calling|why.*call|ఎందుకు.*ఫోన్|ఎందుకు.*కాల్|ఎందుకు.*చేస్తున్నారు|ఎందుకు కాల్|ఎందుకు ఫోన్|ఎందుకు చేస్తున్నారు|సర్వే ఎందుకు|ఎందుకు అడుగుతున్నారు|దేని కోసం కాల్|దేనికోసం/i.test(
      t
    )
  ) {
    return 'WHY_CALLING';
  }

  // 6. ALREADY_ANSWERED
  // Examples: "నేను ఇప్పటికే చెప్పాను కదా.", "ముందే చెప్పాను", "మళ్లీ ఎందుకు అడుగుతున్నారు?", "already told you"
  if (/ఇప్పటికే చెప్పాను|ముందే చెప్పాను|మళ్లీ ఎందుకు|already told|already said|చెప్పేసా కదా/i.test(t)) {
    return 'ALREADY_ANSWERED';
  }

  // 7. CORRECTION
  // Examples: "కాదు, నా పేరు రవి కాదు. రాజు.", "కాదు", "తప్పుగా చెప్పారు"
  if (/^కాదు|^తప్పు|కాదు.*రాజు|కాదు.*పేరు|కాదండి/i.test(t)) {
    return 'CORRECTION';
  }

  // 8. GREETING
  // Examples: "హలో", "నమస్కారం", "శుభోదయం", "Hello", "Hi"
  if (/^(హలో|నమస్కారం|నమస్తే|శుభోదయం|hello|hi|hey)[\s\.\,\!]*$/i.test(t)) {
    return 'GREETING';
  }

  // 9. SMALL_TALK
  // Examples: "ఎలా ఉన్నారు?", "బాగున్నారా?", "ఏం చేస్తున్నారు?", "How are you?", "What are you doing?"
  if (/how are you|ఎలా ఉన్నారు|బాగున్నారా|ఏం చేస్తున్నారు|ఏం చేస్తున్నావు|చేస్తున్నావ్|what are you doing/i.test(t)) {
    return 'SMALL_TALK';
  }

  // 10. CRITICAL POLITICAL NEUTRALITY: VOTE_ADVICE_QUERY
  // If respondent asks "నేను ఎవరికి ఓటు వేయాలి?" (Whom should I vote for?) or asks who to vote for:
  if (/ఎవరికి ఓటు వేయాలి|ఎవరికి ఓటెయ్యాలి|ఎవరికి ఓటు వేస్తే బాగుంటుంది|ఎవరికి ఓటు వేయమంటారు|who should i vote for|whom should i vote for/i.test(t)) {
    return 'VOTE_ADVICE_QUERY';
  }

  // 11. UNRELATED
  // Examples: "మీరు ఎక్కడి నుంచి మాట్లాడుతున్నారు?", "వాతావరణం ఎలా ఉంది?", "క్రికెట్ స్కోర్ ఎంత?"
  if (/ఎక్కడి నుంచి|ఎక్కడ ఉంటారు|క్రికెట్|వర్షం|సినిమా|రాజకీయం/i.test(t)) {
    return 'UNRELATED';
  }

  // 12. SURVEY_QUESTION (Respondent asking a question about the survey subject)
  if (/\?$/.test(t) || /ఎప్పుడు|ఎక్కడ|ఎంత|ఏమిటి|ఎలా|ఎందుకు|చెప్తారా|నిజమేనా/i.test(t)) {
    return 'SURVEY_QUESTION';
  }

  // 13. UNCLEAR (Too short, vague, interjections)
  // Examples: "అలా ఉంది", "ఏమో", "పర్లేదు", "హ్మ్"
  if (/^(అలా ఉంది|ఏమో|పర్లేదు|హ్మ్|చూద్దాం|ఏమోనండి)[\s\.\,]*$/i.test(t) || t.length <= 1) {
    return 'UNCLEAR';
  }

  // 14. CLARIFICATION
  if (/అంటే ఏమిటి|అర్థం కాలేదు|మళ్లీ చెప్పండి|వివరించండి/i.test(t)) {
    return 'CLARIFICATION';
  }

  // Default to SURVEY_ANSWER if substantial response provided
  return 'SURVEY_ANSWER';
}

// Fallback natural dialogue generator for when external AI APIs face temporary high demand (503) or rate limits (429)
function generateNaturalFallbackResponse(
  messages: Array<{ role: string; text: string }>,
  surveyConfig: {
    title: string;
    questions: Array<{ id: string; text: string; category?: string }>;
    knowledgeBase?: string;
  },
  collectedAnswers: Record<string, string>
) {
  const questions = surveyConfig?.questions || [];
  const title = surveyConfig?.title || 'పౌర సర్వే';
  const hasConfiguredQuestions = questions.length > 0;

  // 1. Initial survey launch (no prior conversation messages)
  if (!messages || messages.length === 0) {
    if (!hasConfiguredQuestions) {
      return {
        reply: 'నమస్కారం! ప్రస్తుతం ఈ సర్వేకు సంబంధించిన ప్రశ్నలు మరియు వివరాలు ఇంకా కాన్ఫిగర్ చేయబడలేదు. ప్రశ్నలు అందించిన తర్వాత సర్వేను ప్రారంభించడానికి నేను సిద్ధంగా ఉన్నాను.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }
    const q1 = questions[0];
    const firstQText = (q1?.text || 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది అండి?')
      .replace(/^మొదటి\s*ప్రశ్న\s*[:\.]?\s*/gi, '')
      .trim();
    return {
      reply: `నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. ${firstQText}`,
      currentQuestionId: q1.id,
      extractedAnswers: [{ questionId: q1.id, answerSummary: 'పెండింగ్', status: 'pending' }],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 2. We have conversation history. Get last user/respondent input.
  const respondentMsgs = messages.filter((m) => m.role === 'respondent' || m.role === 'user');
  const lastUserText = respondentMsgs.length > 0 ? respondentMsgs[respondentMsgs.length - 1].text.trim() : '';

  // Classify intent according to high-priority intent rules
  const intent = classifyConversationIntent(lastUserText, hasConfiguredQuestions, messages);

  // ==============================================================
  // CRITICAL PRIORITY 1: BUSY / NOT AVAILABLE
  // Rules:
  // - Do NOT continue the survey.
  // - Do NOT repeat the introduction.
  // - Do NOT ask another question.
  // - Do NOT explain the survey again.
  // - Preferred response: "సరే, అర్థమైంది. మీకు ఇబ్బంది కలిగించను. ధన్యవాదాలు." or "అలాగే, అర్థమైంది. ఇప్పుడు మిమ్మల్ని ఇబ్బంది పెట్టను. ధన్యవాదాలు."
  // - Then end the conversation (isSurveyStopped: true).
  // ==============================================================
  if (intent === 'BUSY') {
  return {
    reply:
      'సరే అండి. మీకు ఎప్పుడు సౌకర్యంగా ఉంటుందో చెప్పండి, ఆ సమయానికి మళ్లీ కాల్ చేస్తాము.',
    currentQuestionId: '',
    extractedAnswers: [],
    isSurveyComplete: false,
    isSurveyStopped: false,
    summaryOfCollected: '',
  };
}
  // ==============================================================
  // CRITICAL PRIORITY 2: STOP / EXPLICITLY END
  // Rules:
  // - If the respondent explicitly says they do not want to continue.
  // - Respond politely in Telugu: "సరే, ఎలాంటి సమస్య లేదు. మీ సమయానికి ధన్యవాదాలు."
  // - Do NOT ask another survey question.
  // - End the conversation (isSurveyStopped: true).
  // ==============================================================
  if (intent === 'STOP') {
    return {
      reply: 'సరే, ఎలాంటి సమస్య లేదు. మీ సమయానికి ధన్యవాదాలు.',
      currentQuestionId: '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: true,
      summaryOfCollected: '',
    };
  }

  // ==============================================================
  // BRANCH A: UNCONFIGURED DEVELOPMENT PHASE (No questions provided)
  // ==============================================================
  if (!hasConfiguredQuestions) {
    // When respondent agrees to participate, but survey questions have NOT yet been configured:
    // Natural response as specified:
    // "తప్పకుండా. సర్వే ప్రారంభించడానికి సిద్ధంగా ఉన్నాను. అయితే ప్రస్తుతం ప్రశ్నలు ఇంకా సిద్ధం కాలేదు."
    // Do not pretend that a survey question exists.
    // NEVER ask the respondent to provide the survey question.
    if (intent === 'AGREE_PARTICIPATE') {
      return {
        reply: 'తప్పకుండా. సర్వే ప్రారంభించడానికి సిద్ధంగా ఉన్నాను. అయితే ప్రస్తుతం ప్రశ్నలు ఇంకా సిద్ధం కాలేదు.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'WHO_ARE_YOU') {
      return {
        reply: 'నేను ఈ ప్రజా సర్వే కోసం రూపొందించిన AI వాయిస్ ఏజెంట్ని.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'WHY_CALLING') {
      return {
        reply: 'మీ అభిప్రాయం తెలుసుకోవడానికి ఈ సర్వే చేస్తున్నాం. కొన్ని ప్రశ్నలు మాత్రమే ఉంటాయి.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'GREETING') {
      return {
        reply: 'నమస్కారం. నేను ప్రజల అభిప్రాయాలను తెలుసుకునే సర్వే కోసం రూపొందించిన వాయిస్ ఏజెంట్ని. మీతో కొద్దిసేపు మాట్లాడి కొన్ని ప్రశ్నలు అడగబోతున్నాను.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'SMALL_TALK') {
      if (/how are you|ఎలా ఉన్నారు|బాగున్నారా/i.test(lastUserText)) {
        return {
          reply: 'నేను బాగున్నాను. మీరు ఎలా ఉన్నారు?',
          currentQuestionId: '',
          extractedAnswers: [],
          isSurveyComplete: false,
          isSurveyStopped: false,
          summaryOfCollected: '',
        };
      }
      return {
        reply: 'మీతో ఈ సర్వే గురించి మాట్లాడుతున్నాను.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'CORRECTION') {
      return {
        reply: 'అవును, అర్థమైంది. సరిగ్గా గుర్తుంచుకుంటాను.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    const nameMatch = lastUserText.match(/నా పేరు\s+([^\.\,\s]+)/i);
    if (nameMatch) {
      return {
        reply: `సరే, అర్థమైంది. మీ పేరు ${nameMatch[1]} అని గుర్తుంచుకుంటాను.`,
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    if (intent === 'ALREADY_ANSWERED') {
      const priorUserMsgs = respondentMsgs.slice(0, -1);
      const hadPreviousStatement = priorUserMsgs.some((m) => m.text.length > 2);
      if (hadPreviousStatement) {
        return {
          reply: 'అవును, మీరు అది ఇప్పటికే చెప్పారు. నాకు గుర్తుంది.',
          currentQuestionId: '',
          extractedAnswers: [],
          isSurveyComplete: false,
          isSurveyStopped: false,
          summaryOfCollected: '',
        };
      } else {
        return {
          reply: 'క్షమించండి, ఆ విషయం గురించి మీరు ఇంకా చెప్పలేదు. చెప్పగలిగితే చెప్పండి.',
          currentQuestionId: '',
          extractedAnswers: [],
          isSurveyComplete: false,
          isSurveyStopped: false,
          summaryOfCollected: '',
        };
      }
    }

    if (intent === 'REFUSE') {
      return {
        reply: 'సరే, పరవాలేదు. మీ ఇష్టం.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }

    // Default conversational response in unconfigured development phase
    // Note: Do NOT restart introduction repeatedly
    return {
      reply: 'అవును, వింటున్నాను. దయచేసి చెప్పండి.',
      currentQuestionId: '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // ==============================================================
  // BRANCH B: CONFIGURED SURVEY PHASE (Questions are provided)
  // ==============================================================

  // Identify unanswered questions
  const unansweredList = questions.filter(
    (q) => !collectedAnswers[q.id] || collectedAnswers[q.id].includes('pending')
  );
  const nextUnanswered = unansweredList[0];

  // 1. AGREE_PARTICIPATE: When respondent agrees to participate, take active initiative immediately!
  // Start the configured survey by asking the first survey question naturally.
  // Never say "నేను వింటున్నాను, చెప్పండి." or wait for the respondent to ask what happens next.
  // Never say "మొదటి ప్రశ్న", "రెండవ ప్రశ్న", "నెక్స్ట్ క్వశ్చన్", "తదుపరి ప్రశ్న".
  if (intent === 'AGREE_PARTICIPATE') {
    const qToAsk = nextUnanswered || questions[0];
    const cleanQ = qToAsk.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|తదుపరి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim();
    return {
      reply: `తప్పకుండా, సర్వే ప్రారంభిద్దాం. ${cleanQ}`,
      currentQuestionId: qToAsk.id,
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 2. REFUSE: Higher priority than survey progression
  // If a person refuses, never pressure them. Mark refused and move smoothly to next question.
  if (intent === 'REFUSE') {
    const currentQ = nextUnanswered || questions[0];
    const newAnswers = [{ questionId: currentQ.id, answerSummary: 'సమాధానం ఇవ్వడానికి నిరాకరించారు', status: 'refused' as const }];
    const remainingUnanswered = questions.find((q) => q.id !== currentQ.id && (!collectedAnswers[q.id] || collectedAnswers[q.id].includes('pending')));

    if (remainingUnanswered) {
      return {
        reply: `సరే, ఎలాంటి సమస్య లేదు. మీరు సమాధానం ఇవ్వకూడదనుకుంటే ఆ ప్రశ్నను వదిలేయవచ్చు. తర్వాతి ప్రశ్న: ${remainingUnanswered.text}`,
        currentQuestionId: remainingUnanswered.id,
        extractedAnswers: newAnswers,
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    } else {
      return {
        reply: 'సరే, ఎలాంటి సమస్య లేదు. సర్వేలోని అన్ని ప్రశ్నలు పూర్తయ్యాయి. మీ సమయానికి ధన్యవాదాలు!',
        currentQuestionId: '',
        extractedAnswers: newAnswers,
        isSurveyComplete: true,
        isSurveyStopped: false,
        summaryOfCollected: 'సర్వే పూర్తయింది.',
      };
    }
  }

  // 4. VOTE_ADVICE_QUERY: Enforce strict political neutrality
  if (intent === 'VOTE_ADVICE_QUERY') {
    const returnText = nextUnanswered ? ` మనం సర్వేను కొనసాగిద్దాం. ${nextUnanswered.text}` : '';
    return {
      reply: `ఎవరికి ఓటు వేయాలనే నిర్ణయం మీదే. నేను మీకు ఏ అభ్యర్థిని లేదా పార్టీని ఎంచుకోమని చెప్పలేను.${returnText}`,
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 5. WHO_ARE_YOU
  if (intent === 'WHO_ARE_YOU') {
    const qStr = nextUnanswered ? ` మనం సర్వే కొనసాగిద్దాం: ${nextUnanswered.text}` : '';
    return {
      reply: `నేను ఈ ప్రజా సర్వే కోసం రూపొందించిన AI వాయిస్ ఏజెంట్ని.${qStr}`,
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 3. WHY_CALLING / RESPONDENT QUESTION ABOUT PURPOSE
  // Section 8: Explain purpose first, then naturally return to unanswered question without recording answer
  if (intent === 'WHY_CALLING') {
    const qStr = nextUnanswered
      ? ` ${nextUnanswered.text.replace(/^(ఇది\s*)?(మొదటి|రెండవ|తదుపరి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '').trim()}`
      : '';
    return {
      reply: `అవును అండి. మీ ప్రాంతంలో తాగునీరు, రోడ్లు, డ్రైనేజీ లాంటి ప్రజా సదుపాయాలు ఎలా ఉన్నాయో తెలుసుకోవడానికి ఈ సర్వే చేస్తున్నాం. మీ ప్రాంతంలో పరిస్థితి ఎలా ఉందో మీ దగ్గర నుంచే తెలుసుకోవడానికి కొన్ని ప్రశ్నలు అడుగుతున్నాం.${qStr}`,
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 4. GREETING
  if (intent === 'GREETING') {
    const qStr = nextUnanswered ? ` మనం సర్వే ప్రారంభిద్దాం: ${nextUnanswered.text}` : '';
    return {
      reply: `నమస్కారం!${qStr}`,
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 5. SMALL_TALK
  if (intent === 'SMALL_TALK') {
    if (/how are you|ఎలా ఉన్నారు|బాగున్నారా/i.test(lastUserText)) {
      return {
        reply: 'నేను బాగున్నాను. మీరు ఎలా ఉన్నారు?',
        currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }
    const qStr = nextUnanswered ? ` ${nextUnanswered.text}` : '';
    return {
      reply: `మీతో ఈ సర్వే గురించి మాట్లాడుతున్నాను.${qStr}`,
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 6. ALREADY_ANSWERED
  if (intent === 'ALREADY_ANSWERED') {
    const hasAnyAnswered = Object.keys(collectedAnswers).length > 0;
    if (hasAnyAnswered) {
      if (nextUnanswered) {
        return {
          reply: `అవును, మీరు అది ఇప్పటికే చెప్పారు. నాకు గుర్తుంది. మరి ${nextUnanswered.text.replace(/^తర్వాతి\s*ప్రశ్న\s*[:\.]?\s*/gi, '')}`,
          currentQuestionId: nextUnanswered.id,
          extractedAnswers: [],
          isSurveyComplete: false,
          isSurveyStopped: false,
          summaryOfCollected: '',
        };
      } else {
        return {
          reply: 'అవును, మీరు అది ఇప్పటికే చెప్పారు. నాకు గుర్తుంది. మన సర్వేలోని అన్ని ప్రశ్నలు పూర్తయ్యాయి. మీ సమయానికి ధన్యవాదాలు!',
          currentQuestionId: '',
          extractedAnswers: [],
          isSurveyComplete: true,
          isSurveyStopped: false,
          summaryOfCollected: 'సర్వే విజయవంతంగా పూర్తయింది.',
        };
      }
    } else {
      return {
        reply: 'క్షమించండి, ఆ విషయం గురించి మీరు ఇంకా చెప్పలేదు. చెప్పగలిగితే చెప్పండి.',
        currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
      };
    }
  }

  // 7. CORRECTION
  if (intent === 'CORRECTION') {
    return {
      reply: 'అవును, అర్థమైంది. సరిగ్గా గుర్తుంచుకుంటాను.',
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 8. Dynamic Follow-up: e.g. "నీళ్లు వస్తాయి కానీ ప్రతిరోజూ రావు."
  if (/నీళ్లు వస్తాయి కానీ ప్రతిరోజూ రావు|ప్రతిరోజూ రావు|సరిగ్గా రావు/i.test(lastUserText)) {
    return {
      reply: 'అర్థమైంది. సాధారణంగా వారానికి ఎన్ని రోజులు నీటి సమస్య ఎదురవుతోంది?',
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: nextUnanswered ? [{ questionId: nextUnanswered.id, answerSummary: lastUserText, status: 'pending' }] : [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 9. UNCLEAR answer
  if (intent === 'UNCLEAR') {
    return {
      reply: 'క్షమించండి, మీరు చెప్పింది నాకు పూర్తిగా అర్థం కాలేదు. ఇంకొంచెం వివరంగా చెప్పగలరా?',
      currentQuestionId: nextUnanswered ? nextUnanswered.id : '',
      extractedAnswers: [],
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  }

  // 10. Standard SURVEY_ANSWER
  const currentQ = nextUnanswered || questions[0];
  const newAnswers = currentQ
    ? [{ questionId: currentQ.id, answerSummary: lastUserText, status: 'answered' as const }]
    : [];

  const remainingUnanswered = questions.find(
    (q) => q.id !== currentQ?.id && (!collectedAnswers[q.id] || collectedAnswers[q.id].includes('pending'))
  );

  const naturalAcks = ['అవును, చెప్పండి.', 'సరే, అర్థమైంది.', 'ఓకే, గుర్తుంచుకుంటాను.', 'అలాగే.', 'అవును, నాకు అర్థమైంది.'];
  const ack = naturalAcks[Math.floor(Math.random() * naturalAcks.length)];

  if (remainingUnanswered) {
    return {
      reply: `${ack} మరి ${remainingUnanswered.text}`,
      currentQuestionId: remainingUnanswered.id,
      extractedAnswers: newAnswers,
      isSurveyComplete: false,
      isSurveyStopped: false,
      summaryOfCollected: '',
    };
  } else {
    return {
      reply: `${ack} మన సర్వేలోని అన్ని ప్రశ్నలు పూర్తయ్యాయి. మీ అమూల్యమైన సమయానికి ధన్యవాదాలు!`,
      currentQuestionId: '',
      extractedAnswers: newAnswers,
      isSurveyComplete: true,
      isSurveyStopped: false,
      summaryOfCollected: 'సర్వే విజయవంతంగా పూర్తయింది.',
    };
  }
}

// Telugu Public Survey AI Voice Agent interaction endpoint
app.post('/api/survey/interact', async (req, res) => {
  let sessionState: SurveySessionState | null = null;
  try {
    const {
      messages,
      surveyConfig,
      collectedAnswers,
      session_id,
      sessionId,
      conversation_state,
      conversationState,
      voice_id,
      voiceId,
      client_id,
      clientId,
    } = req.body;

    const currentSessionId = (session_id || sessionId || 'session_001').trim();
    const surveyId = surveyConfig?.id || 'public_facilities';
    const targetClientId = (client_id || clientId || 'client_001').toString().trim();

    // Resolve active voice_id for this client
    let activeVoiceId: string | null = (voice_id || voiceId || '').toString().trim() || null;

    if (activeVoiceId) {
  // Validate that this voice is still valid and not failed
  const existing = await voiceProfileStorage.getProfileByVoiceId(activeVoiceId).catch(() => null);

  if (!existing || existing.status !== 'active' || existing.voice_status === 'failed') {
    activeVoiceId = null;
  }
}

if (!activeVoiceId) {
  try {
    const activeProfile = await voiceProfileStorage.getActiveProfile(targetClientId);

    if (
      activeProfile &&
      activeProfile.voice_id &&
      activeProfile.status === 'active' &&
      activeProfile.voice_status !== 'failed'
    ) {
      activeVoiceId = activeProfile.voice_id;
    }
  } catch (err) {
    console.warn('Could not query active voice profile:', err);
  }
}

    // SECTION 2 RULE: If active_voice_id does not exist, do NOT start the voice survey.
    // Return the mandatory Telugu instruction: "ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి."
    if (!activeVoiceId) {
      const promptToCreateMsg = 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.';
      return res.status(200).json({
        success: false,
        has_active_voice: false,
        reply: promptToCreateMsg,
        audio_base64: null,
        audio_url: null,
        voice_id: null,
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: true,
        summaryOfCollected: '',
        session_id: currentSessionId,
        conversationState: sessionState,
        conversation_state: sessionState,
        error: promptToCreateMsg,
      });
    }

    // 1. Retrieve or create session state
    sessionState = surveySessionStore.getOrCreateSession(currentSessionId, surveyId, 'te');

    // Merge incoming conversation state if provided by client
    if (conversation_state || conversationState) {
      const incoming = conversation_state || conversationState;
      sessionState = surveySessionStore.saveSession({
        ...sessionState,
        ...incoming,
        answers: {
          ...sessionState.answers,
          ...(incoming.answers || {}),
        },
      });
    }

    const title = surveyConfig?.title || 'ప్రజా సర్వే (Public Survey)';
    const questions = Array.isArray(surveyConfig?.questions) ? surveyConfig.questions : [];
    const knowledgeBase = surveyConfig?.knowledgeBase || '';
    const hasConfiguredQuestions = questions.length > 0;

    const respondentMsgs = (messages || []).filter(
      (m: { role: string; text: string }) => m.role === 'respondent' || m.role === 'user'
    );
    const lastUserText = respondentMsgs.length > 0 ? respondentMsgs[respondentMsgs.length - 1].text.trim() : '';

    // If starting a fresh survey session with no respondent messages yet
    if (respondentMsgs.length === 0) {
      sessionState = surveySessionStore.resetSession(currentSessionId, surveyId, 'te');
      if (hasConfiguredQuestions) {
        sessionState.current_question_id = questions[0].id;
        sessionState.current_question_topic = QUESTION_TOPIC_MAP[questions[0].id] || 'drinking_water';
        sessionState.conversation_status = 'waiting_for_answer';
        sessionState = surveySessionStore.saveSession(sessionState);

        const cleanFirstQ = questions[0].text
          .replace(/^(ఇది\s*)?(మొదటి|రెండవ|తదుపరి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '')
          .trim();
        const initialReply = `నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం. ${cleanFirstQ}`;

        let audioBase64: string | null = null;
        let pipelineUsed = 'direct_cloned_tts';
        if (activeVoiceId) {
          try {
            const speechRes = await ElevenLabsService.synthesizeSpeech(activeVoiceId, initialReply);
audioBase64 = `data:${speechRes.contentType};base64,${speechRes.buffer.toString('base64')}`;
pipelineUsed = 'direct_cloned_tts';
          } catch (err: any) {
            console.error('Survey greeting TTS error:', err?.message || err);
            if (err?.message?.includes('404') || err?.message?.includes('voice_not_found')) {
              await voiceProfileStorage.markVoiceInvalid(activeVoiceId).catch(() => {});
              activeVoiceId = null;
            }
            audioBase64 = null;
          }
        }

        // If the voice was invalid or failed on ElevenLabs, notify client to record/create voice
        if (!activeVoiceId) {
          const promptToCreateMsg = 'ముందుగా మీ వాయిస్ని సరిగ్గా సృష్టించి పరీక్షించాలి.';
          return res.status(200).json({
            success: false,
            has_active_voice: false,
            reply: promptToCreateMsg,
            audio_base64: null,
            audio_url: null,
            voice_id: null,
            currentQuestionId: questions[0].id,
            extractedAnswers: [],
            isSurveyComplete: false,
            isSurveyStopped: true,
            summaryOfCollected: '',
            session_id: sessionState.session_id,
            conversationState: sessionState,
            conversation_state: sessionState,
            error: promptToCreateMsg,
          });
        }

        const audioStreamUrl = activeVoiceId
          ? `/api/voice-profile/stream?voice_id=${encodeURIComponent(activeVoiceId)}&text=${encodeURIComponent(initialReply)}`
          : null;

        return res.json({
          reply: initialReply,
          audio_base64: audioBase64,
          audio_stream_url: audioStreamUrl,
          audio_url: activeVoiceId
            ? `/api/voice-profile/tts-audio?voice_id=${encodeURIComponent(activeVoiceId)}&text=${encodeURIComponent(initialReply)}`
            : null,
          voice_id: activeVoiceId,
          voice_provider: 'elevenlabs',
          pipeline: pipelineUsed,
          currentQuestionId: questions[0].id,
          extractedAnswers: [],
          isSurveyComplete: false,
          isSurveyStopped: false,
          summaryOfCollected: '',
          session_id: sessionState.session_id,
          conversationState: sessionState,
          conversation_state: sessionState,
        });
      }
    }

    // 2. Central Conversational Intelligence: OpenAI Processes Meaning & Context
    const { openAiResult, updatedSessionState } = await processTurnWithOpenAi(
      lastUserText,
      sessionState,
      surveyConfig,
      collectedAnswers || {},
      messages || []
    );

    sessionState = surveySessionStore.saveSession(updatedSessionState);

    const isComplete = sessionState.conversation_status === 'completed';
    const isStopped =
  sessionState.conversation_status === 'ended_by_user' ||
  sessionState.conversation_status === 'refused' ||
  sessionState.conversation_status === 'ended';

    // 3. Synthesize the response text into client's cloned voice
    const responseText = openAiResult.response_text;
    console.log('🔎 ACTUAL AI RESPONSE TEXT:', JSON.stringify(responseText));
    let turnAudioBase64: string | null = null;
    let turnPipeline = 'direct_cloned_tts';

    const t_tts_start = Date.now();
    const shouldSkipBase64 = req.body?.prefer_stream === true || req.body?.skip_audio_base64 === true;

    if (activeVoiceId && responseText && !shouldSkipBase64) {
      try {
        const speechRes = await ElevenLabsService.synthesizeSpeech(activeVoiceId, responseText);
turnAudioBase64 = `data:${speechRes.contentType};base64,${speechRes.buffer.toString('base64')}`;
turnPipeline = 'direct_cloned_tts';
      } catch (err: any) {
        console.error('Turn TTS synthesis error:', err?.message || err);
        if (err?.message?.includes('404') || err?.message?.includes('voice_not_found')) {
          await voiceProfileStorage.markVoiceInvalid(activeVoiceId).catch(() => {});
          activeVoiceId = null;
        }
        turnAudioBase64 = null;
      }
    }

    const t_first_audio = Date.now();
    const timestamps = req.body?.timestamps || {};
    const speech_end = timestamps.speech_end || null;
    const transcription_start = timestamps.transcription_start || null;
    const transcription_end = timestamps.transcription_end || null;
    const total_latency = speech_end ? t_first_audio - speech_end : t_first_audio - t_tts_start;

    console.log('[VOICE_LATENCY]', {
      speech_end: speech_end ? new Date(speech_end).toISOString() : null,
      transcription_start: transcription_start ? new Date(transcription_start).toISOString() : null,
      transcription_end: transcription_end ? new Date(transcription_end).toISOString() : null,
      llm_start: new Date(t_tts_start).toISOString(),
      llm_end: new Date(t_tts_start).toISOString(),
      tts_start: new Date(t_tts_start).toISOString(),
      first_audio_byte: new Date(t_first_audio).toISOString(),
      total_latency_ms: total_latency,
      pipeline: turnPipeline,
    });

    const audioStreamUrl = activeVoiceId
      ? `/api/voice-profile/stream?voice_id=${encodeURIComponent(activeVoiceId)}&text=${encodeURIComponent(responseText)}`
      : null;

    // Build extracted answers list from OpenAI topic updates and session state
    const extractedList: Array<{ questionId: string; answerSummary: string; status: 'answered' | 'refused' | 'pending' }> = [];
    if (openAiResult.topic_updates && Array.isArray(openAiResult.topic_updates)) {
      openAiResult.topic_updates.forEach((tu) => {
        const qId = TOPIC_QUESTION_MAP[tu.topic] || tu.topic;
        extractedList.push({
          questionId: qId,
          answerSummary: tu.summary || Object.entries(tu.data || {}).map(([k, v]) => `${k}: ${v}`).join(', '),
          status: (tu.status as string) === 'refused' ? 'refused' : tu.status === 'sufficiently_answered' || tu.status === 'completed' ? 'answered' : 'pending',
        });
      });
    }

    Object.entries(sessionState.answers || {}).forEach(([k, v]) => {
      const qId = TOPIC_QUESTION_MAP[k] || sessionState?.current_question || 'A1';
      if (!extractedList.some((e) => e.answerSummary.includes(k))) {
        extractedList.push({
          questionId: qId,
          answerSummary: `${k}: ${v}`,
          status: 'answered',
        });
      }
    });

    return res.json({
      reply: responseText,
      audio_base64: turnAudioBase64,
      audio_stream_url: audioStreamUrl,
      audio_url: activeVoiceId
        ? `/api/voice-profile/tts-audio?voice_id=${encodeURIComponent(activeVoiceId)}&text=${encodeURIComponent(responseText)}`
        : null,
      voice_id: activeVoiceId,
      voice_provider: 'elevenlabs',
      pipeline: turnPipeline,
      currentQuestionId: sessionState.current_question || sessionState.current_question_id,
      extractedAnswers: extractedList,
      isSurveyComplete: isComplete,
      isSurveyStopped: isStopped,
      summaryOfCollected: isComplete ? 'సర్వే విజయవంతంగా పూర్తయింది.' : '',
      session_id: sessionState.session_id,
      conversationState: sessionState,
      conversation_state: sessionState,
    });
  } catch (error: any) {
    console.error('Error in /api/survey/interact:', error);
    try {
      const fallbackResult = generateNaturalFallbackResponse(
        req.body?.messages || [],
        req.body?.surveyConfig || { title: 'పౌర సర్వే', questions: [] },
        req.body?.collectedAnswers || {}
      ) as any;
      fallbackResult.session_id = sessionState?.session_id || 'session_001';
      fallbackResult.conversationState = sessionState || null;
      fallbackResult.conversation_state = sessionState || null;
      return res.json(fallbackResult);
    } catch {
      return res.status(200).json({
        reply: 'నమస్కారం! సర్వేను కొనసాగించడానికి నేను సిద్ధంగా ఉన్నాను.',
        currentQuestionId: '',
        extractedAnswers: [],
        isSurveyComplete: false,
        isSurveyStopped: false,
        summaryOfCollected: '',
        session_id: sessionState?.session_id || 'session_001',
        conversationState: sessionState || null,
        conversation_state: sessionState || null,
      });
    }
  }
});

// Top-level PDF download routes (served directly before Vite SPA middlewares)
const handlePdfDownload = async (req: express.Request, res: express.Response) => {
  const { jobId } = req.params;
  let job =
    callbridgeStorage.getCallJob(jobId) ||
    callbridgeStorage.getCallJobByProviderId(jobId);

  if (!job) {
    const mappedJobId = VapiService.getJobIdByProviderCallId(jobId);
    if (mappedJobId) {
      job = callbridgeStorage.getCallJob(mappedJobId);
    }
  }

  if (!job) {
    return res.status(404).json({ success: false, error: 'Call record not found' });
  }

  // Ensure transcripts and surveyState are populated from in-memory engine if available
  const targetId = job.providerCallId || job.id;
  const sState = SurveySequentialEngine.getState(targetId) || SurveySequentialEngine.getState(job.id);
  if (sState?.transcripts && sState.transcripts.length > 0) {
    if (!job.transcript || job.transcript.length <= 1) {
      job.transcript = [...sState.transcripts];
      job.originalTranscript = [...sState.transcripts];
    }
    if (!job.surveyAnswers || Object.keys(job.surveyAnswers).length === 0) {
      job.surveyAnswers = sState.answers;
    }
    job.surveyState = sState;
  }

  try {
    const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(job);

    // Track download metrics
    if (!Array.isArray(job.pdfDownloads)) {
      job.pdfDownloads = [];
    }
    job.pdfDownloads.push({
      downloadedAt: new Date().toISOString(),
      count: job.pdfDownloads.length + 1,
    });
    job.downloaded = true;
    job.downloadedAt = new Date().toISOString();
    job.downloadCount = (job.downloadCount || 0) + 1;
    callbridgeStorage.saveCallJob(job);

    const safePhone = (job.contactPhone || job.id).replace(/[^0-9a-zA-Z_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="survey_transcript_${safePhone}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err: any) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to generate PDF' });
  }
};

app.get('/calls/:jobId/transcript.pdf', handlePdfDownload);
app.get('/api/calls/:jobId/transcript.pdf', handlePdfDownload);
app.get('/api/callbridge/calls/:jobId/transcript.pdf', handlePdfDownload);

// Start Express server and connect Vite in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telugu Public Survey AI Voice Agent server running at http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.argv.some((a) => a.includes('scripts/test-'))) {
  startServer();
}
