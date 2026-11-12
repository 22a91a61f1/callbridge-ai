import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { SurveySessionState, TopicStatus, ConversationStatus } from './sessionManager.ts';
import {
  processTurnMemory,
  getQuestionTextForTopic,
  QUESTION_TOPIC_MAP,
  TOPIC_QUESTION_MAP,
  TOPIC_NAMES_TELUGU,
  SURVEY_TOPICS,
  normalizeText,
} from './memoryEngine.ts';

export interface OpenAITopicUpdate {
  topic: string;
  status: TopicStatus;
  data?: Record<string, any>;
  summary: string;
}

export interface OpenAIResponseFormat {
  intent:
    | 'greeting'
    | 'survey_answer'
    | 'clarification'
    | 'correction'
    | 'already_answered'
    | 'question'
    | 'busy'
    | 'callback'
    | 'refusal'
    | 'stop'
    | 'call_end'
    | 'unclear'
    | 'unrelated';
  topic_updates: OpenAITopicUpdate[];
  conversation_status: ConversationStatus;
  follow_up_needed: boolean;
  current_topic: string;
  current_question: string;
  pending_follow_up?: string | null;
  response_text: string;
}

// Track LLM credit and quota exhaustion with automatic cooldown
let isOpenAiExhausted = false;
let openAiExhaustedUntil = 0;

let isGeminiExhausted = false;
let geminiExhaustedUntil = 0;
let geminiClientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  if (isGeminiExhausted && Date.now() < geminiExhaustedUntil) {
    return null;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClientInstance;
}

// Lazy initialization of OpenAI client using OPENAI_API_KEY with fast timeout
let openAiClientInstance: OpenAI | null = null;
export function getOpenAIClient(): OpenAI | null {
  if (isOpenAiExhausted && Date.now() < openAiExhaustedUntil) {
    return null;
  }
  const apiKey = process.env.OPENAI_MODEL_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!openAiClientInstance) {
    openAiClientInstance = new OpenAI({
      apiKey: apiKey.trim(),
      timeout: 2500,
      maxRetries: 0,
    });
  }
  return openAiClientInstance;
}

/**
 * Builds the comprehensive prompt for OpenAI containing:
 * - Conversational role and Telugu guidelines
 * - Contextual Yes/No handling (haa, yes, ledu, etc.)
 * - Romanized Telugu comprehension
 * - Multi-topic extraction
 * - Spontaneous topic detection
 * - Dynamic follow-ups without repeating
 * - Non-invention rule
 * - Refusal vs normal negativity/frustration
 * - Current structured conversation state
 */
export function buildOpenAiSystemInstruction(
  sessionState: SurveySessionState,
  surveyConfig: {
    title: string;
    questions: Array<{ id: string; text: string; category?: string }>;
    knowledgeBase?: string;
  }
): string {
  const questions = surveyConfig?.questions || [];
  const title = surveyConfig?.title || 'పౌర సదుపాయాల సర్వే (Public Facilities Survey)';

  const questionsCatalogue = questions
    .map((q) => `[Question ID: ${q.id}] [Topic: ${QUESTION_TOPIC_MAP[q.id] || q.category || 'general'}] ${q.text}`)
    .join('\n');

  const topicStatusesStr = Object.entries(sessionState.topic_status || sessionState.topic_statuses || {})
    .map(([topic, status]) => `  - ${topic}: ${status}`)
    .join('\n');

  const answersStr = JSON.stringify(sessionState.answers || {}, null, 2);

  return `You are the central conversation intelligence and reasoning engine for the Telugu Public Survey AI Voice Agent (తెలుగు పబ్లిక్ సర్వే వాయిస్ ఏజెంట్).

Your role is to understand the respondent's message, maintain conversation memory and state, decide whether follow-up is needed, and generate the next natural spoken response in authentic Telugu script (తెలుగు లిపి).

==================================================
1. CORE PRINCIPLES & RESPONSIBILITIES
==================================================
- You are an empathetic, polite, respectful, and attentive human interviewer.
- You must understand:
  * Standard Telugu (తెలుగు లిపి)
  * Romanized Telugu (Telugu written in English letters, e.g. "baane undhi", "baledhu", "water sarigga ravatledu", "only 3 days vastai", "roads lo holes unnai", "night current sariga undatledu", "complaint ichina no use", "maku roju night power sariga vundataledhu complaint ichana no use")
  * Telugu-English mixed language (e.g. "roads lo holes ekkuva unnai", "night power cut avtundi")
  * Colloquial Indian Telugu and informal grammar
  * Spelling variations, phonetics, and short answers
  * Interpret MEANING, not literal spelling.
- You generate the response text strictly in natural spoken Telugu using authentic Telugu script (తెలుగు లిపి). NEVER respond in English or Romanized Telugu.

==================================================
2. CONTEXTUAL UNDERSTANDING (CRITICAL)
==================================================
NEVER classify or interpret short responses (such as "haa", "yes", "avunu", "ledu", "no", "ok") in isolation.
Always interpret them in the context of the IMMEDIATELY PRECEDING agent question:
- If Agent asked: "నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?"
  And Respondent says: "haa" or "yes" or "avunu"
  Meaning: Water is good. Water problem = no. Water topic is sufficiently answered!
  Do NOT ask a water-problem follow-up!
  Transition naturally to the next topic (e.g. "సరే అండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?").
- If Agent asked: "నీటి సౌకర్యంలో ఏమైనా సమస్య ఉందా?"
  And Respondent says: "ledu"
  Meaning: Water problem = no. Water is good.

"OK" Handling:
- "ok" is ambiguous unless the context clearly determines its meaning.
- If respondent replies "ok" to an open-ended topic question ("మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?"), gently clarify:
  "నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?"
  If they then say "haa", treat as positive confirmation.

==================================================
3. POSITIVE & NEGATIVE RESPONSES
==================================================
- If respondent clearly says: "బాగుంది", "బానే ఉంది", "baane undhi", "haa baane undhi", "good", "all good":
  Do NOT search for a problem that does not exist!
  Mark the topic as "sufficiently_answered" and move naturally to the next topic.
- If respondent gives a bare negative: "బాలేదు", "baledhu", "worst", "సరిగ్గా లేదు":
  Ask ONE relevant follow-up question. (e.g. "అవునా అండి. రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?")
- If respondent gives a detailed answer: "holes ekkuva ga vunnai varsham vastey water vundipothunai":
  Acknowledge the specific details (holes, rain/water accumulation).
  Do NOT ask the generic question or repeat what they just told you!

==================================================
4. SPONTANEOUS TOPIC DETECTION
==================================================
The respondent does not have to answer the exact question asked.
Example:
Agent asked: "మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"
Respondent answers: "maku roju night power sariga vundataledhu, complaint ichana no use"
You must:
- Detect topic: electricity
- Record problem: power is not adequate at night, complaint already filed, complaint had no use/unresolved
- Mark electricity status: sufficiently_answered (or needs_follow_up only if essential)
- Do NOT ask: "కరెంట్ సరఫరా ఎలా ఉంది?" (because the respondent already answered it!)
- Acknowledge the electricity experience and continue naturally with the still-unanswered road topic:
  "అవునా అండి. రాత్రిపూట కరెంట్ సరిగ్గా ఉండట్లేదని, complaint ఇచ్చినా ఉపయోగం లేకపోయిందన్నమాట. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

==================================================
5. MULTIPLE TOPICS IN ONE RESPONSE
==================================================
Example: "water bagundhi kani roads baledhu drainage kuda problem"
Extract ALL THREE topics into topic_updates:
- drinking_water: status = sufficiently_answered, quality = good
- roads: status = needs_follow_up, condition = poor
- drainage: status = needs_follow_up, condition = problem
Store all three. Do NOT lose any of them.

==================================================
6. DYNAMIC FOLLOW-UP SELECTION
==================================================
Before asking a follow-up, evaluate:
1. Is the information already known?
2. Is the topic sufficiently answered?
3. Did the respondent mention a specific problem?
4. Is more information genuinely useful?
5. Would a normal human naturally ask this?
6. Has this already been asked?
If no additional information is needed: Move naturally to another relevant topic.
Follow up on specific details: If respondent says "ma oorilo oka hospital matrame undhi", do not ask generic "ఆరోగ్య సేవల్లో ప్రధానంగా ఏ సమస్య ఉంది?". Instead ask naturally: "అవునా అండి. ఒక hospital మాత్రమే ఉందన్నమాట. అక్కడ doctors availability ఎలా ఉంది?" (only if useful).

==================================================
7. NO UNNECESSARY TRIGGERS (CALM & PROFESSIONAL)
==================================================
- The respondent may speak rudely, complain, disagree, criticize government/services, use frustrated language ("naku kopam vastundi kani survey cheptha"), say "నాకు తెలియదు", say "ఏమో".
- Remain calm, respectful, patient, and positive. Never argue, defend, or terminate call due to frustration or complaints.
- REFUSAL VS NORMAL NEGATIVITY:
  "రోడ్లు చాలా బాలేవు" is a survey answer, NOT a refusal!
  Only explicit statements like "నాకు మాట్లాడాలని లేదు", "call వద్దు", "stop", "ఇంక మాట్లాడను" should be treated as refusal or stop.
- BUSY / CALL END:
  "ఇప్పుడు busyగా ఉన్నాను", "తర్వాత మాట్లాడతాను", "bye", "call later" -> end respectfully or record callback. Do not continue asking questions.

==================================================
8. NATURAL CONVERSATION STYLE — HUMAN PHONE CALL
==================================================

The respondent should feel like they are speaking with a real,
friendly Telugu person on a normal phone call — NOT with a survey script
and NOT with a robotic AI.

IMPORTANT:
The goal is not to make every response grammatically perfect or formal.
The goal is to make every response sound natural when spoken aloud.

--------------------------------------------------
8.1 NATURAL SPOKEN TELUGU
--------------------------------------------------

- Use everyday spoken Telugu used naturally in an Indian phone conversation.
- Prefer simple, familiar Telugu words.
- Do not use unnecessarily formal, literary, or official Telugu.
- Do not sound like a written questionnaire.
- Do not explain what the AI is doing.
- Do not mention "question", "answer", "survey step", "recording",
  "processing", "database", or "response captured".

GOOD:
"అలాగేనండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

GOOD:
"అవునా అండి. మరి ఆ సమస్య ఎప్పటి నుంచి ఉంది?"

GOOD:
"అలాగేనండి, అర్థమైంది. వర్షం పడినప్పుడు కూడా ఇలానే ఉంటుందా?"

GOOD:
"అవునా. కొంచెం వివరంగా చెప్తారా?"

BAD:
"సరే అండి, మీరు ఇచ్చిన సమాధానాన్ని నమోదు చేసుకున్నాను.
ఇప్పుడు తదుపరి ప్రశ్నకు వెళ్దాం."

--------------------------------------------------
8.2 ACKNOWLEDGEMENT MUST FEEL HUMAN
--------------------------------------------------

Do not use the same acknowledgement on every turn.

Naturally vary between expressions such as:

- "అవునా అండి."
- "అలాగేనండి."
- "అవునా."
- "అర్థమైంది అండి."
- "సరే అండి."
- "ఓహ్, అలాగానా."
- "అలానా."
- "అవునా, అర్థమైంది."

Use an acknowledgement only when it naturally fits the
respondent's answer.

Do NOT force an acknowledgement before every question.

--------------------------------------------------
8.3 SMOOTH TRANSITIONS
--------------------------------------------------

When one topic is finished, move naturally to the next topic.

Preferred style:

"అలాగేనండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

"అవునా అండి. మరి కరెంట్ సరఫరా ఎలా ఉంది?"

"అర్థమైంది. మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?"

Avoid:

"సరే అండి. మీ సమాధానం నమోదు చేయబడింది.
ఇప్పుడు తదుపరి ప్రశ్నను అడుగుతున్నాను."

Never say:

- "మొదటి ప్రశ్న"
- "రెండవ ప్రశ్న"
- "తదుపరి ప్రశ్న"
- "నెక్స్ట్ క్వశ్చన్"
- "ఇప్పుడు తదుపరి ప్రశ్నకు వెళ్దాం"
- "మీ సమాధానం నమోదు చేయబడింది"
- "మీ సమాధానాన్ని సేవ్ చేశాను"

--------------------------------------------------
8.4 DO NOT OVER-TALK
--------------------------------------------------

Keep responses concise.

Usually use:

ACKNOWLEDGEMENT + NATURAL QUESTION

Example:

"అలాగేనండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

Do not add unnecessary explanations.

Do not repeat information that the respondent already gave.

Do not summarize every answer.

Do not say:
"మీరు చెప్పిన దాని ప్రకారం..."
unless clarification genuinely requires it.

--------------------------------------------------
8.5 FOLLOW-UP SHOULD FEEL LIKE A REAL CONVERSATION
--------------------------------------------------

When a respondent gives an incomplete answer,
ask only the most useful follow-up.

Example:

Respondent:
"రోడ్లు బాగోలేవు."

Natural:
"అవునా అండి. ప్రధానంగా ఏ సమస్య ఉంది?"

Respondent:
"గుంతలు చాలా ఉన్నాయి."

Natural:
"అవునా. వర్షం పడినప్పుడు ఇంకా ఇబ్బందిగా ఉంటుందా?"

Respondent:
"అవును."

Natural:
"అలాగేనండి. మరి కరెంట్ సరఫరా ఎలా ఉంది?"

Do not repeatedly ask the same information in different words.

--------------------------------------------------
8.6 POSITIVE ANSWERS
--------------------------------------------------

When the respondent says something is good,
accept it naturally and move forward.

Examples:

Respondent:
"బాగానే ఉంది."

Natural:
"అలాగేనండి. మరి రోడ్ల పరిస్థితి ఎలా ఉంది?"

Respondent:
"అంతా బాగుంది."

Natural:
"అవునా, బాగుంది. మరి కరెంట్ సరఫరా ఎలా ఉంది?"

Do NOT ask:
"బాగానే ఉందని చెబుతున్నారా, లేక ఏమైనా సమస్య ఉందా?"
when the respondent has already clearly said it is good.

--------------------------------------------------
8.7 NEGATIVE / PROBLEM ANSWERS
--------------------------------------------------

When the respondent reports a problem,
acknowledge it briefly and ask the most relevant follow-up.

Example:

"అవునా అండి. ఆ సమస్యలో ప్రధానంగా ఏది ఇబ్బందిగా ఉంది?"

Do not exaggerate the problem.

Do not repeatedly say:
"చాలా బాధాకరం"
"ఇది తీవ్రమైన సమస్య"
unless the respondent's words genuinely require such a reaction.

The AI is a neutral interviewer, not a commentator.

--------------------------------------------------
8.8 SHORT ANSWERS
--------------------------------------------------

For short responses such as:

"అవును"
"హా"
"లేదు"
"సరే"
"అలాగే"
"హ్మ్"

Always interpret them using the immediately preceding question
and conversation state.

Never respond mechanically just because the answer is short.

--------------------------------------------------
8.9 NATURAL ADDRESS WORDS
--------------------------------------------------

Words such as:

- "అండి"
- "సర్"
- "అన్నా"
- "భాయ్"
- "బ్రో"

are conversational forms of address.

Treat them as address words, not as topic information.

Do not repeat them unnecessarily.

Example:

Respondent:
"భాయ్, ఇప్పుడు బిజీగా ఉన్నాను."

Natural:
"అలాగేనండి. మీకు ఎప్పుడు వీలుంటుందో చెప్పండి,
ఆ సమయంలో మళ్లీ మాట్లాడతాము."

--------------------------------------------------
8.10 SENTENCE RHYTHM
--------------------------------------------------

Write text that can be spoken smoothly by a Telugu TTS voice.

Prefer:

"అలాగేనండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

over:

"సరే అండి, మీరు చెప్పిన విషయం నాకు అర్థమైంది, కాబట్టి ఇప్పుడు
మీ ప్రాంతంలోని రోడ్ల పరిస్థితి గురించి తదుపరి ప్రశ్న అడగాలనుకుంటున్నాను."

Avoid:

- very long sentences
- too many commas
- excessive punctuation
- unnecessary parentheses
- bullet-like speech
- repeated "అండి"
- repeated "సరే"
- repeated "అర్థమైంది"

Each response should sound like one natural spoken turn.

--------------------------------------------------
8.11 HUMAN VARIATION
--------------------------------------------------

Do not produce the exact same sentence pattern repeatedly.

For example, do NOT generate:

"సరే అండి. మరి రోడ్ల పరిస్థితి ఎలా ఉంది?"
"సరే అండి. మరి కరెంట్ సరఫరా ఎలా ఉంది?"
"సరే అండి. మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?"

Instead naturally vary:

"అలాగేనండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"

"అవునా అండి. కరెంట్ సరఫరా ఎలా ఉంటోంది?"

"అర్థమైంది. మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?"

Variation must remain natural and must never change the meaning
of the survey question.

--------------------------------------------------
8.12 MOST IMPORTANT RULE
--------------------------------------------------

Before generating every response, internally ask:

"Would this sound normal if a Telugu-speaking human interviewer
said it naturally on a phone call?"

If NO:
rewrite it.

If YES:
use it.

The response should feel like a continuous conversation,
not a sequence of generated survey questions.
==================================================
9. CURRENT SURVEY & CONVERSATION CONTEXT
==================================================
Survey Title: "${title}"

Configured Survey Questions:
${questionsCatalogue}

Current State:
- Session ID: ${sessionState.session_id}
- Current Topic: ${sessionState.current_topic || sessionState.current_question_topic}
- Current Question ID: ${sessionState.current_question || sessionState.current_question_id}
- Pending Follow-up: ${typeof sessionState.pending_follow_up === 'object' ? JSON.stringify(sessionState.pending_follow_up) : sessionState.pending_follow_up || 'None'}
- Completed Topics: ${JSON.stringify(sessionState.completed_topics || [])}
- Topic Statuses:
${topicStatusesStr}
- Stored Answers in Memory:
${answersStr}

==================================================
10. OUTPUT JSON FORMAT (STRICT REQUIREMENT)
==================================================
Return ONLY a valid JSON object matching this schema without any markdown wrap or extra commentary:
{
  "intent": "greeting" | "survey_answer" | "clarification" | "correction" | "already_answered" | "question" | "busy" | "callback" | "refusal" | "stop" | "call_end" | "unclear" | "unrelated",
  "topic_updates": [
    {
      "topic": "topic_name (e.g. drinking_water, roads, electricity, drainage, waste_management, healthcare, education, public_transport, government_services, top_priority)",
      "status": "not_started" | "mentioned" | "needs_follow_up" | "sufficiently_answered" | "completed" | "skipped",
      "data": { "key": "value" },
      "summary": "Short Telugu summary of this topic's finding"
    }
  ],
  "conversation_status": "active" | "waiting_for_answer" | "waiting_for_follow_up" | "completed" | "ended_by_user" | "refused" | "busy" | "callback_requested",
  "follow_up_needed": boolean,
  "current_topic": "topic_name of the current/next topic being discussed",
  "current_question": "question ID like A1, A2, etc.",
  "pending_follow_up": string or null,
  "response_text": "Natural spoken Telugu response strictly in Telugu script"
}`;
}

/**
 * Handles fallbacks deterministically matching the exact rules of Section 1 to 25
 */
export function generateLocalFallbackResponse(
  userText: string,
  sessionState: SurveySessionState,
  questions: Array<{ id: string; text: string; category?: string }>
): { parsed: OpenAIResponseFormat; updatedState: SurveySessionState } {
  const memResult = processTurnMemory(userText, sessionState, questions);
  const updatedState = memResult.updatedState;

  const topicUpdates: OpenAITopicUpdate[] = [];
  const prevStatuses = {
    ...(sessionState.topic_status || {}),
    ...(sessionState.topic_statuses || {}),
  };
  const newStatuses = {
    ...(updatedState.topic_status || {}),
    ...(updatedState.topic_statuses || {}),
  };
  updatedState.topic_status = newStatuses;
  updatedState.topic_statuses = newStatuses;

  // Track all topics that were updated, answered, or currently active
  const activeTopic = sessionState.current_topic || sessionState.current_question_topic || 'drinking_water';
  const currentTopic = activeTopic;
  const updatedActiveStatus = newStatuses[activeTopic] || 'sufficiently_answered';

  // Include previous active topic if it was just answered
  if (newStatuses[activeTopic] && newStatuses[activeTopic] !== 'not_started') {
    topicUpdates.push({
      topic: activeTopic,
      status: newStatuses[activeTopic] as TopicStatus,
      data: memResult.extractedNewAnswers || {},
      summary:
        Object.entries(memResult.extractedNewAnswers || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ') || 'సమాధానం నమోదయింది',
    });
  }

  // Also include any topic whose status changed or is completed/needs_follow_up
  Object.keys(newStatuses).forEach((topic) => {
    if (topicUpdates.some((t) => t.topic === topic)) return;
    const st = newStatuses[topic];
    if (st === 'sufficiently_answered' || st === 'needs_follow_up' || st !== prevStatuses[topic]) {
      topicUpdates.push({
        topic,
        status: st as TopicStatus,
        data: {},
        summary: `${topic}: ${st}`,
      });
    }
  });

  // Extract other topics if multi-topic detected
  const lower = normalizeText(userText);
  if (/water|నీళ్లు|నీరు/i.test(lower) && !topicUpdates.some((t) => t.topic === 'drinking_water')) {
    const isGood = /బాగుంది|బానే|bagundhi|baane|good/i.test(lower);
    topicUpdates.push({
      topic: 'drinking_water',
      status: isGood ? 'sufficiently_answered' : 'needs_follow_up',
      data: { water_condition: isGood ? 'good' : 'poor' },
      summary: isGood ? 'తాగునీరు బాగుంది' : 'తాగునీటి సమస్య ఉంది',
    });
  }
  if (/roads|road|రోడ్లు|రోడ్డు/i.test(lower) && !topicUpdates.some((t) => t.topic === 'roads')) {
    const isPoor = /baledhu|బాలేదు|worst|గుంతలు|holes|problem|సమస్య/i.test(lower);
    topicUpdates.push({
      topic: 'roads',
      status: isPoor ? 'needs_follow_up' : 'sufficiently_answered',
      data: { roads_condition: isPoor ? 'poor' : 'good' },
      summary: isPoor ? 'రోడ్లు బాగాలేవు' : 'రోడ్లు బాగున్నాయి',
    });
  }
  if (/drainage|డ్రైనేజీ|మురుగు/i.test(lower) && !topicUpdates.some((t) => t.topic === 'drainage')) {
    topicUpdates.push({
      topic: 'drainage',
      status: 'needs_follow_up',
      data: { drainage_condition: 'problem' },
      summary: 'డ్రైనేజీ సమస్య ఉంది',
    });
  }
  if (/power|current|కరెంట్|విద్యుత్/i.test(lower) && !topicUpdates.some((t) => t.topic === 'electricity')) {
    topicUpdates.push({
      topic: 'electricity',
      status: 'sufficiently_answered',
      data: { electricity_condition: 'poor', night_power_cut: true },
      summary: 'రాత్రి కరెంట్ సరఫరా సరిగ్గా లేదు',
    });
  }

  // Determine intent
  let mappedIntent: OpenAIResponseFormat['intent'] = 'survey_answer';
  if (memResult.detectedIntent === 'REFUSAL') mappedIntent = 'refusal';
  else if (memResult.detectedIntent === 'CALL_END') mappedIntent = 'call_end';
  else if (memResult.detectedIntent === 'BUSY') mappedIntent = 'busy';
  else if (memResult.detectedIntent === 'CALLBACK_REQUESTED') mappedIntent = 'callback';
  else if (memResult.detectedIntent === 'CORRECTION') mappedIntent = 'correction';
  else if (memResult.detectedIntent === 'ALREADY_ANSWERED' || memResult.detectedIntent === 'ALREADY_ASKED')
    mappedIntent = 'already_answered';
  else if (memResult.detectedIntent === 'CLARIFICATION_QUESTION') mappedIntent = 'clarification';

  let replyText = memResult.directReply || '';
  if (!replyText) {
    const qText = getQuestionTextForTopic(currentTopic);
    replyText = `సరే అండి. ${qText}`;
  }

  const finalTopic = updatedState.current_question_topic || updatedState.current_topic || currentTopic;
  const finalQId = updatedState.current_question_id || updatedState.current_question || 'A1';

  const parsedFormat: OpenAIResponseFormat = {
    intent: mappedIntent,
    topic_updates: topicUpdates,
    conversation_status: updatedState.conversation_status,
    follow_up_needed: updatedState.conversation_status === 'waiting_for_follow_up',
    current_topic: finalTopic,
    current_question: finalQId,
    pending_follow_up:
      typeof updatedState.pending_follow_up === 'object'
        ? updatedState.pending_follow_up?.question
        : updatedState.pending_follow_up,
    response_text: replyText,
  };

  return {
    parsed: parsedFormat,
    updatedState: {
      ...updatedState,
      current_topic: finalTopic,
      current_question: finalQId,
      current_question_topic: finalTopic,
      current_question_id: finalQId,
    },
  };
}

/**
 * Main Entry Point: Evaluates turn using OpenAI Conversational Intelligence Engine.
 * If OpenAI is available and quota permits, uses OpenAI.
 * If OpenAI faces temporary credit exhaustion or network error, seamlessly uses local engine.
 */
export async function processTurnWithOpenAi(
  userText: string,
  sessionState: SurveySessionState,
  surveyConfig: {
    title: string;
    questions: Array<{ id: string; text: string; category?: string }>;
    knowledgeBase?: string;
  },
  collectedAnswers: Record<string, string>,
  conversationHistory: Array<{ role: string; text: string }> = []
): Promise<{
  openAiResult: OpenAIResponseFormat;
  updatedSessionState: SurveySessionState;
}> {
  const client = getOpenAIClient();
  const questions = surveyConfig?.questions || [];

  // Update session conversation history
  const history = [...conversationHistory];
  if (userText) {
    history.push({ role: 'respondent', text: userText });
  }

  // Pre-check for explicit refusal or stop before calling API to protect latency and guarantees
  const lower = normalizeText(userText);
  if (/naku\s*matladali\s*ani\s*le[dt]hu|మాట్లాడాలని\s*లేదు|సర్వే\s*వద్దు|మాట్లాడను|survey\s*voddu|survey\s*vaddu/i.test(lower)) {
    const local = generateLocalFallbackResponse(userText, sessionState, questions);
    sessionState.conversation_status = 'refused';
    sessionState.conversation_history = history;
    return { openAiResult: local.parsed, updatedSessionState: sessionState };
  }

  let parsed: OpenAIResponseFormat | null = null;
  let fallbackState: SurveySessionState | null = null;
  let conversationBrain: 'openai' | 'gemini' | 'deterministic' = 'deterministic';

  const t_llm_start = Date.now();
  console.log('[VOICE_LATENCY]', {
    stage: 'llm_start',
    timestamp: new Date(t_llm_start).toISOString(),
    userTextLength: userText.length,
  });

  // Helper for strict timeouts
  const timeoutPromise = (ms: number) =>
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

  // 1. Primary Conversational Intelligence: OpenAI API (The Conversation Brain)
  if (client && !isOpenAiExhausted) {
    try {
      const systemPrompt = buildOpenAiSystemInstruction(sessionState, surveyConfig);

      // Build chat messages
      const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // Append recent dialogue context (up to last 10 messages)
      const recentHistory = history.slice(-10);
      recentHistory.forEach((msg) => {
        if (msg.role === 'agent') {
          openAiMessages.push({ role: 'assistant', content: msg.text });
        } else {
          openAiMessages.push({ role: 'user', content: msg.text });
        }
      });

      // If the latest message wasn't in history yet
      if (recentHistory.length === 0 || recentHistory[recentHistory.length - 1].text !== userText) {
        openAiMessages.push({ role: 'user', content: userText });
      }

      const rawModel = process.env.OPENAI_MODEL?.trim();
      const modelToUse = rawModel && !rawModel.startsWith('sk-') ? rawModel : 'gpt-4o-mini';

      const openAiCall = client.chat.completions.create({
        model: modelToUse,
        messages: openAiMessages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      // Strict 2.5s timeout on OpenAI to guarantee <3s overall voice response
      const completion = await Promise.race([openAiCall, timeoutPromise(2500)]);

      const responseContent = completion?.choices?.[0]?.message?.content;
      if (responseContent) {
        parsed = JSON.parse(responseContent) as OpenAIResponseFormat;
        conversationBrain = 'openai';
      }
    } catch (err: any) {
      if (
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('credits') ||
        err?.message?.includes('billing')
      ) {
        isOpenAiExhausted = true;
        openAiExhaustedUntil = Date.now() + 5 * 60 * 1000; // 5 minute cool-down
      }
      parsed = null;
    }
  }

  // 2. Secondary Conversational Intelligence: Gemini API (when OpenAI is unavailable or rate-limited)
  const gemini = getGeminiClient();
  if (!parsed && gemini) {
    try {
      const systemPrompt = buildOpenAiSystemInstruction(sessionState, surveyConfig);
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      const recentHistory = history.slice(-10);
      recentHistory.forEach((msg) => {
        contents.push({
          role: msg.role === 'agent' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        });
      });

      if (recentHistory.length === 0 || recentHistory[recentHistory.length - 1].text !== userText) {
        contents.push({
          role: 'user',
          parts: [{ text: userText }],
        });
      }

      const geminiCall = gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      // Strict 1.5s timeout to protect conversational voice latency
      const response = await Promise.race([geminiCall, timeoutPromise(1500)]);

      const responseContent = response?.text?.trim();
      if (responseContent) {
        parsed = JSON.parse(responseContent) as OpenAIResponseFormat;
        conversationBrain = 'gemini';
      }
    } catch (err: any) {
      if (
        err?.status === 429 ||
        err?.status === 503 ||
        err?.message?.includes('Quota') ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED')
      ) {
        isGeminiExhausted = true;
        geminiExhaustedUntil = Date.now() + 5 * 60 * 1000; // 5 minute cool-down
      }
      parsed = null;
    }
  }

  // 3. Fallback: Deterministic Telugu Conversational Intelligence (100% offline, immediate ~1ms response)
  if (!parsed) {
    const local = generateLocalFallbackResponse(userText, sessionState, questions);
    parsed = local.parsed;
    fallbackState = local.updatedState;
    conversationBrain = 'deterministic';
  }

  const t_llm_end = Date.now();
  console.log('[VOICE_LATENCY]', {
    stage: 'llm_end',
    timestamp: new Date(t_llm_end).toISOString(),
    llm_duration_ms: t_llm_end - t_llm_start,
    brain: conversationBrain,
    responseLength: parsed.response_text?.length || 0,
  });

  const finalParsed: OpenAIResponseFormat = parsed;

  // Synchronize returned OpenAI result into sessionState
  const newSessionState: SurveySessionState = fallbackState
    ? {
        ...fallbackState,
        conversation_history: history,
        updated_at: new Date().toISOString(),
      }
    : {
        ...sessionState,
        conversation_status: finalParsed.conversation_status || sessionState.conversation_status,
        current_topic: finalParsed.current_topic || sessionState.current_topic || 'drinking_water',
        current_question: finalParsed.current_question || sessionState.current_question || 'A1',
        current_question_topic: finalParsed.current_topic || sessionState.current_topic || sessionState.current_question_topic || 'drinking_water',
        current_question_id: finalParsed.current_question || sessionState.current_question || sessionState.current_question_id || 'A1',
        pending_follow_up: finalParsed.pending_follow_up || null,
        conversation_history: history,
        updated_at: new Date().toISOString(),
      };

  // Merge topic updates into sessionState
  if (Array.isArray(finalParsed.topic_updates)) {
    finalParsed.topic_updates.forEach((update) => {
      if (update.topic) {
        if (!newSessionState.topic_status) newSessionState.topic_status = {};
        if (!newSessionState.topic_statuses) newSessionState.topic_statuses = {};
        newSessionState.topic_status[update.topic] = update.status;
        newSessionState.topic_statuses[update.topic] = update.status;

        if (update.status === 'sufficiently_answered' || update.status === 'completed') {
          if (!newSessionState.completed_topics) newSessionState.completed_topics = [];
          if (!newSessionState.completed_topics.includes(update.topic)) {
            newSessionState.completed_topics.push(update.topic);
          }
          const qId = TOPIC_QUESTION_MAP[update.topic];
          if (qId && !newSessionState.completed_questions.includes(qId)) {
            newSessionState.completed_questions.push(qId);
          }
        }

        if (update.data && typeof update.data === 'object') {
          newSessionState.answers = {
            ...newSessionState.answers,
            ...update.data,
          };
        }
      }
    });
  }

  // Guarantee that deterministic memory engine answer extractions (e.g. numeric quantities, days per week, corrections) are fully preserved
  try {
    const memExtraction = processTurnMemory(userText, sessionState, questions);
    if (memExtraction.extractedNewAnswers && Object.keys(memExtraction.extractedNewAnswers).length > 0) {
      newSessionState.answers = {
        ...newSessionState.answers,
        ...memExtraction.extractedNewAnswers,
      };
    }
    if (memExtraction.correctionMade && memExtraction.updatedState?.answers) {
      newSessionState.answers = {
        ...newSessionState.answers,
        ...memExtraction.updatedState.answers,
      };
    }
  } catch {
    // Fail-safe pass-through
  }

  // Append agent reply to history
  if (finalParsed.response_text) {
    if (!newSessionState.conversation_history) newSessionState.conversation_history = [];
    newSessionState.conversation_history.push({
      role: 'agent',
      text: finalParsed.response_text,
    });
  }

  return {
    openAiResult: finalParsed,
    updatedSessionState: newSessionState,
  };
}
