import type { SurveySessionState, ConversationStatus, FollowUpDetail, TopicStatus } from './sessionManager.ts';

export const SURVEY_TOPICS = [
  'drinking_water',
  'roads',
  'electricity',
  'drainage',
  'waste_management',
  'healthcare',
  'education',
  'public_transport',
  'government_services',
  'top_priority',
] as const;

export const QUESTION_TOPIC_MAP: Record<string, string> = {
  A1: 'drinking_water',
  A2: 'roads',
  A3: 'electricity',
  A4: 'drainage',
  A5: 'waste_management',
  A6: 'healthcare',
  A7: 'education',
  A8: 'public_transport',
  A9: 'government_services',
  A10: 'top_priority',
};

export const TOPIC_QUESTION_MAP: Record<string, string> = {
  drinking_water: 'A1',
  roads: 'A2',
  electricity: 'A3',
  drainage: 'A4',
  waste_management: 'A5',
  sanitation: 'A5',
  healthcare: 'A6',
  education: 'A7',
  public_transport: 'A8',
  government_services: 'A9',
  top_priority: 'A10',
};

export const TOPIC_NAMES_TELUGU: Record<string, string> = {
  drinking_water: 'తాగునీటి సౌకర్యం',
  roads: 'రోడ్ల పరిస్థితి',
  electricity: 'విద్యుత్ సరఫరా',
  drainage: 'డ్రైనేజీ వ్యవస్థ',
  waste_management: 'చెత్త సేకరణ',
  sanitation: 'పారిశుధ్యం',
  healthcare: 'ఆరోగ్య సేవలు',
  education: 'విద్యా సదుపాయాలు',
  public_transport: 'ప్రజా రవాణా',
  government_services: 'ప్రభుత్వ సేవలు',
  top_priority: 'ప్రధాన ప్రాధాన్యత',
};

export interface MemoryProcessingResult {
  updatedState: SurveySessionState;
  detectedIntent: string;
  extractedNewAnswers: Record<string, any>;
  correctionMade: boolean;
  alreadyAnsweredRecognized: boolean;
  directReply?: string;
  shouldAskNextQuestion?: boolean;
  nextQuestionId?: string;
}

/**
 * Normalizes Romanized Telugu and Telugu keywords
 */
export function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Parses numbers expressed in Telugu words or English digits/words
 */
export function parseNumberFromText(text: string): number | null {
  const digitsMatch = text.match(/\b([0-7])\b/);
  if (digitsMatch) return parseInt(digitsMatch[1], 10);

  if (/ఒక|ఒకటి|\bone\b/i.test(text)) return 1;
  if (/రెండు|\btwo\b/i.test(text)) return 2;
  if (/మూడు|\bthree\b/i.test(text)) return 3;
  if (/నాలుగు|\bfour\b/i.test(text)) return 4;
  if (/ఐదు|\bfive\b/i.test(text)) return 5;
  if (/ఆరు|\bsix\b/i.test(text)) return 6;
  if (/ఏడు|\bseven\b/i.test(text)) return 7;

  return null;
}

/**
 * Extracts explicit callback timing if provided by the respondent
 */
export function extractCallbackTime(text: string): string | null {
  const lower = normalizeText(text);

  if (/సాయంత్రం\s*(\d{1,2})\s*(?:గంటలకు|కి|pm)?/i.test(lower)) {
    const num = lower.match(/సాయంత్రం\s*(\d{1,2})/i);
    return num ? `సాయంత్రం ${num[1]} గంటలకు` : 'సాయంత్రం';
  }
  if (/sayant(?:h)?ram\s*(\d{1,2})\s*(?:ki|gantalaku|pm)?/i.test(lower)) {
    const num = lower.match(/sayant(?:h)?ram\s*(\d{1,2})/i);
    return num ? `సాయంత్రం ${num[1]} గంటలకు` : 'సాయంత్రం';
  }
  if (/రేపు\s*(?:ఉదయం\s*)?(\d{1,2})\s*(?:గంటలకు|కి|am)?/i.test(lower)) {
    const num = lower.match(/రేపు\s*(?:ఉదయం\s*)?(\d{1,2})/i);
    return num ? `రేపు ఉదయం ${num[1]} గంటలకు` : 'రేపు ఉదయం';
  }
  if (/repu\s*(?:ud(?:h)?ayam\s*)?(\d{1,2})\s*(?:ki|gantalaku|am)?/i.test(lower)) {
    const num = lower.match(/repu\s*(?:ud(?:h)?ayam\s*)?(\d{1,2})/i);
    return num ? `రేపు ఉదయం ${num[1]} గంటలకు` : 'రేపు ఉదయం';
  }
  if (/ఉదయం\s*(\d{1,2})\s*(?:గంటలకు|కి|am)?/i.test(lower)) {
    const num = lower.match(/ఉదయం\s*(\d{1,2})/i);
    return num ? `ఉదయం ${num[1]} గంటలకు` : 'ఉదయం';
  }
  if (/ud(?:h)?ayam\s*(\d{1,2})\s*(?:ki|gantalaku|am)?/i.test(lower)) {
    const num = lower.match(/ud(?:h)?ayam\s*(\d{1,2})/i);
    return num ? `ఉదయం ${num[1]} గంటలకు` : 'ఉదయం';
  }
  if (/tomorrow\s*(?:morning\s*)?(\d{1,2})/i.test(lower)) {
    const num = lower.match(/tomorrow\s*(?:morning\s*)?(\d{1,2})/i);
    return num ? `రేపు ఉదయం ${num[1]} గంటలకు` : 'రేపు ఉదయం';
  }
  if (/evening\s*(\d{1,2})/i.test(lower)) {
    const num = lower.match(/evening\s*(\d{1,2})/i);
    return num ? `సాయంత్రం ${num[1]} గంటలకు` : 'సాయంత్రం';
  }
  const ampmMatch = lower.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (ampmMatch) {
    return `${ampmMatch[1]} ${ampmMatch[2].toUpperCase()}`;
  }
  const gantaMatch = lower.match(/(\d{1,2})\s*(?:గంటలకు|కి)/i);
  if (gantaMatch) {
    return `${gantaMatch[1]} గంటలకు`;
  }

  return null;
}

/**
 * Checks for CALL END / BYE statements (Priority 1)
 */
export function isCallEndStatement(text: string): boolean {
  const t = normalizeText(text).replace(/[\.\,\!\?]+$/, '').trim();
  return (
    /^(సరే\s*)?బై(\s*బై)?$|^(sare\s*)?bye(\s*bye)?$|^(సరే\s*)?byebye$/i.test(t) ||
    /^(సరే\s*)?వెళ్తాను|^veltanu/i.test(t) ||
    /పెడతాను|పెట్టేస్తాను|ఫోన్\s*పెట్టేస్తాను|ఫోన్\s*పెట్టేస్తున్నాను|ఫోన్\s*కట్|cut\s*chestunna|cut\s*chey|phone\s*pettesthanu|pedathanu/i.test(t) ||
    /end\s*call|quit|exit/i.test(t)
  );
}

/**
 * Checks for BUSY + BYE statements (Priority 1)
 * e.g. "నేను busyగా ఉన్నాను bye", "busy ga unna bye", "ఇప్పుడు busy, bye", "నాకు ఇప్పుడు టైం లేదు, bye", "nenu busy ga vunna bye"
 * Interpreted as busy = true, call_end = true. Ends survey naturally without asking for callback time.
 */
export function isBusyWithBye(text: string): boolean {
  const t = normalizeText(text);
  const hasBusy =
    /బిజీ|busy|టైమ్\s*లేదు|టైం\s*లేదు|time\s*le[dt]hu|సమయం\s*లేదు|పని\s*మీద|పనిలో/i.test(t);
  const hasBye =
    /\b(bye|byebye)\b|బై|వెళ్తాను|పెట్టేస్తాను|పెడతాను|cut\s*chestunna|ఫోన్\s*కట్|ఫోన్\s*పెట్టే/i.test(t);
  const hasExplicitCallback =
    /తర్వాత\s*కాల్|తరువాత\s*కాల్|మళ్లీ\s*కాల్|call\s*me\s*later|call\s*back|రేపు\s*మాట్లాడ|తర్వాత\s*మాట్లాడ|గంటలకు/i.test(t);

  return hasBusy && hasBye && !hasExplicitCallback;
}

/**
 * Checks for REFUSAL statements (Priority 2)
 * Meaning-based recognition: covers explicit refusal to participate or talk, or requests to stop calling
 */
export function isRefusalStatement(text: string): boolean {
  const t = normalizeText(text).replace(/[\.\,\!\?]+$/, '').trim();
  return (
    // Telugu
    /మాట్లాడాలని\s*లేదు|మాట్లాడను|మాట్లాడకండి|నాతో\s*మాట్లాడకండి|నాకు\s*మీతో\s*మాట్లాడాలని\s*లేదు|నాకు\s*మాట్లాడాలని\s*లేదు/i.test(t) ||
    /సర్వే\s*వద్దు|survey\s*వద్దు|సర్వే\s*అవసరం\s*లేదు|ఈ\s*సర్వే\s*అవసరం\s*లేదు|ఈ\s*survey\s*అవసరం\s*లేదు|నాకు\s*survey\s*వద్దు|నాకు\s*ఈ\s*survey\s*వద్దు/i.test(t) ||
    /ఆసక్తి\s*లేదు|ఇంక\s*మాట్లాడను|ఇక\s*మాట్లాడను|వద్దు,?\s*మాట్లాడను|వద్దు\s*అండి|^వద్దు$/i.test(t) ||
    /చెప్పను|సమాధానం\s*చెప్పను|దాటవేయండి|ఆపండి|దయచేసి\s*ఆపండి|ఇక\s*చాలు|చాలు\s*అండి|^చాలు$/i.test(t) ||
    // Romanized Telugu
    /matladal[ai]\s*ani\s*le[dt]hu|matladanu|matladakandi|natho\s*matladakandi|neetho\s*matladali\s*ani\s*le[dt]hu|netho\s*matladali\s*ani\s*le[dt]hu|naku\s*matladali/i.test(t) ||
    /survey\s*va?ddu|survey\s*voddu|survey\s*oddu|survey\s*avasaram\s*ledu|ee\s*survey\s*vaddu/i.test(t) ||
    /asakti\s*le[dt]hu|interest\s*ledu|inka\s*matladanu|ika\s*matladanu|vaddu\s*matladanu|^vaddu(\s*andi)?$/i.test(t) ||
    /cheppanu|samadhanam\s*cheppanu/i.test(t) ||
    // English
    /don'?t\s*want\s*to\s*(talk|speak|answer)|not\s*interested|stop\s*calling|please\s*don'?t\s*call|don'?t\s*call|no\s*survey|please\s*stop|^stop(\s*calling)?$/i.test(t) ||
    /^(skip|refuse|pass)$/i.test(t)
  );
}

/**
 * Checks for BUSY / NO TIME statements (Priority 3)
 */
export function isBusyStatement(text: string): boolean {
  const t = normalizeText(text);
  return (
    /బాయ్|భాయ్|బిజీ|busy|టైమ్\s*లేదు|టైం\s*లేదు|సమయం\s*లేదు|పని\s*మీద\s*ఉన్నా|పని\s*ఉంది|పనిలో\s*ఉన్నా|మాట్లాడలేను|ఇప్పుడు\s*మాట్లాడలేను|తర్వాత\s*మాట్లాడ|తరువాత\s*మాట్లాడ|తర్వాత\s*కాల్/i.test(t) ||
    /time\s*le[dt]hu|work\s*undi|pani\s*(meeda|lo)\s*unna|pani\s*undi|matladalenu|ippudu\s*matladalenu|tarvata\s*matlad|tarvathe\s*matlad|call\s*me\s*later|can'?t\s*talk/i.test(t) ||
    /కాల్\s*(చేయండి|చేయి|చేస్తారా)|call\s*(cheyandi|chey|me|back)/i.test(t)
  );
}

/**
 * Checks for CLARIFICATION QUESTIONS from respondent (Priority 5)
 */
export function isClarificationQuestion(text: string): boolean {
  const t = normalizeText(text);
  return (
    /ఎందుకు\s*(ఫోన్|కాల్|అడుగుతున్నారు|ఈ\s*సర్వే|చేస్తున్నారు)|ఫోన్\s*ఎందుకు|కాల్\s*ఎందుకు|సర్వే\s*ఎందుకు|ఏం\s*కోసం|ఎవరి\s*కోసం|why\s*(are\s*you\s*asking|this\s*survey|calling)|who\s*are\s*you|ఎవరు\s*మీరు/i.test(
      t
    )
  );
}

/**
 * Checks if respondent says "already asked" / "already ee question adigaru kadaa"
 */
export function isAlreadyAskedQuestionStatement(text: string): boolean {
  const t = normalizeText(text);
  return (
    /already\s*(ee\s*question|adigaru|adigaaru|cheppanu)|ee\s*question\s*already|ముందే\s*అడిగారు|ఇదే\s*ప్రశ్న|మళ్లీ\s*అడుగుతున్నారు|second\s*time|once\s*again/i.test(
      t
    )
  );
}

/**
 * Checks if respondent says "I already told you" / "చెప్పా కదా" / "chepa kadaa"
 */
export function isAlreadyAnsweredStatement(text: string): boolean {
  const t = normalizeText(text);
  return (
    /ముందే\s*చెప్పాను|ఇప్పటికే\s*చెప్పాను|చెప్పాను\s*కదా|చెప్పా\s*కదా|ముందే\s*చెప్పా|already\s*(cheppanu|cheppa)|chep[ap]a\s*kada+a*|cheppanu\s*kada|already\s*told|mundhe\s*cheppa|నేను\s*చెప్పాను\s*కదా/i.test(
      t
    )
  );
}

/**
 * Checks if respondent is making a correction
 */
export function isCorrectionStatement(text: string): boolean {
  const t = normalizeText(text);
  return (
    /^కాదు|^తప్పు|కాదండి|సవరణ|మార్చండి|kaadu|kaadhandi|ledu\s*ledu|tappu|correct\s*chey|not\s*3|not\s*three|not\s*two|not\s*morning|not\s*evening/i.test(
      t
    )
  );
}

/**
 * Checks if respondent gives an affirmative response
 */
export function isAffirmativeResponse(text: string): boolean {
  const t = normalizeText(text);
  return (
    /^(haa|ha|avunu|avvunu|yes|yeah|అవును|అవునండి|avunandi|avvunandi|correct|kavochu|ante)(\b|\s|,|$)/iu.test(t) ||
    /^(haa|ha|avunu|avvunu|yes|అవును)/iu.test(t)
  );
}

/**
 * Checks if respondent gives a bare negative statement without specific defect details
 * e.g. "baledhu", "బాగోలేదు", "worst", "చాలా దారుణంగా ఉంది", "problem ఉంది", "సరిగ్గా లేదు"
 */
export function isBareNegative(text: string): boolean {
  const t = normalizeText(text);
  // If specific defect keywords are mentioned, it is NOT bare negative!
  if (
    /గుంతలు|holes|guntalu|వర్షం|varsham|యాక్సిడెంట్|accidents|accident|కోతలు|power\s*cuts|power\s*cut|voltage|వోల్టేజ్|కాలవ|మురుగు|road\s*medha|road\s*meedaki|చెత్త|సరిగ్గా\s*రారు|3\s*days|5\s*days|హాస్పిటల్|ఆసుపత్రి|ఆస్పత్రి|దూరం|dooram|ట్యాంకర్|tanker|వారానికి|week|ఉదయం|సాయంత్రం|morning|evening|బస్సు|bus|స్కూల్|school|టీచర్|teacher|doctor|డాక్టర్|dirty|మురికి|ఉప్పు/i.test(
      t
    )
  ) {
    return false;
  }

  return (
    /^(baledhu|baledu|bagaledu|bagoledhu|బాగోలేదు|బాలేదు|బావోలేదు|worst|దారుణం|చాలా\s*దారుణం|చాలా\s*దారుణంగా\s*ఉంది|చాలా\s*బాగోలేదు|చాలా\s*బాలేదు|సరిగ్గా\s*లేదు|sarigga\s*ledu|poor|bad|kharab|problem\s*undi|issue\s*undi|chaala\s*ebbandi|ఇబ్బందిగా\s*ఉంది|పాడైపోయాయి|చెత్తగా\s*ఉంది)(\s*(అండి|andi))?[.!]?$/i.test(
      t
    ) ||
    /^(roads|road|రోడ్లు|నీళ్లు|water|కరెంట్|power|డ్రైనేజీ|drainage|చెత్త|waste|ఆరోగ్యం|హాస్పిటల్)\s*(baledhu|baledu|bagaledu|బాగోలేదు|బాలేదు|worst|సరిగ్గా\s*లేదు|poor|bad|kharab)(\s*(అండి|andi))?[.!]?$/i.test(
      t
    )
  );
}

/**
 * Checks if respondent gives a bare negative 'no' / 'లేదు'
 */
export function isBareNo(text: string): boolean {
  const t = normalizeText(text);
  return /^(లేదు|లేదండి|ledu|ledhandi|no)(\s*(అండి|andi))?[.!]?$/i.test(t);
}

/**
 * Checks if respondent gives an ambiguous short reply like "ok", "okay", "fine", "సరే", "హా", "yes", "అవును"
 * to an open-ended topic question where meaning is uncertain without context.
 */
export function isAmbiguousTopicResponse(text: string): boolean {
  const t = normalizeText(text);
  if (
    /water|నీళ్లు|నీరు|road|రోడ్|కరెంట్|current|power|drainage|డ్రైనేజీ|చెత్త|waste|hospital|బాగుంది|బాగోలేదు|baledhu|bagundhi|problem|issue|గుంతలు|holes/i.test(
      t
    )
  ) {
    return false;
  }
  return /^(ok|okay|okie|k|fine|సరే|sare|హా|haa|ha|yes|yeah|అవును)(\s*(అండి|andi))?[.!]?$/i.test(t);
}

/**
 * Identifies the semantic topic of a question or statement
 */
export function identifySemanticTopic(text: string): string | null {
  const t = normalizeText(text);
  if (/రోడ్లు|రోడ్డు|గుంతలు|road|roads|pothole/i.test(t)) return 'roads';
  if (/డ్రైనేజీ|మురుగు|కాలవ|drainage/i.test(t)) return 'drainage';
  if (
    /తాగునీరు|నీటి\s*సౌకర్యం|drinking\s*water/i.test(t) ||
    (/నీళ్లు|నీరు|నీటి|water/i.test(t) && !/రోడ్|road|గుంత|drainage|మురుగు|కాలవ/i.test(t))
  ) {
    return 'drinking_water';
  }
  if (/కరెంట్|విద్యుత్|power|electricity/i.test(t)) return 'electricity';
  if (/చెత్త|పారిశుధ్య|waste|garbage|sanitation/i.test(t)) return 'waste_management';
  if (/ఆరోగ్య|హాస్పిటల్|ఆసుపత్రి|ఆస్పత్రి|hospital|clinic|doctor|health/i.test(t)) return 'healthcare';
  if (/విద్య|బడి|పాఠశాల|స్కూల్|school|education/i.test(t)) return 'education';
  if (/రవాణా|బస్సు|bus|transport/i.test(t)) return 'public_transport';
  if (/ప్రభుత్వ\s*సేవలు|government|services/i.test(t)) return 'government_services';
  if (/ప్రాధాన్యత|ముఖ్యమైన|priority/i.test(t)) return 'top_priority';
  return null;
}

/**
 * Returns natural introductory/transition question for a topic
 */
export function getQuestionTextForTopic(topic: string): string {
  switch (topic) {
    case 'drinking_water':
      return 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?';
    case 'roads':
      return 'మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?';
    case 'electricity':
      return 'మరి కరెంట్ సరఫరా ఎలా ఉంది?';
    case 'drainage':
      return 'మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?';
    case 'waste_management':
    case 'sanitation':
      return 'మరి మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య పనులు ఎలా జరుగుతున్నాయి?';
    case 'healthcare':
      return 'మరి మీ ప్రాంతంలో ఆరోగ్య సేవలు ఎలా ఉన్నాయి? ఆసుపత్రులు అందుబాటులో ఉన్నాయా?';
    case 'education':
      return 'మరి మీ ప్రాంతంలోని ప్రభుత్వ విద్యా సదుపాయాలు లేదా పాఠశాలల గురించి మీ అభిప్రాయం ఏమిటి?';
    case 'public_transport':
      return 'మరి మీ ప్రాంతంలో బస్సు లేదా ప్రజా రవాణా సౌకర్యం ఎలా ఉంది?';
    case 'government_services':
      return 'ప్రభుత్వ సేవలను పొందడంలో మీకు సాధారణంగా ఎలాంటి సమస్యలు ఎదురవుతున్నాయి?';
    case 'top_priority':
      return 'మీ ప్రాంతంలో వెంటనే మెరుగుపరచాల్సిన ఒక ముఖ్యమైన సమస్య ఏది అని మీరు భావిస్తున్నారు?';
    default:
      return 'మీ ప్రాంతంలో ఇతర సదుపాయాలు ఎలా ఉన్నాయి?';
  }
}

/**
 * Selects the next topic dynamically according to respondent intent and topic statuses.
 * NEVER selects a topic that is sufficiently_answered, completed, or skipped.
 */
export function selectNextTopic(
  currentTopic: string,
  topicStatuses: Record<string, TopicStatus>
): { nextTopic: string; nextQId: string } | null {
  const publicServiceTopics = [
    'drinking_water',
    'roads',
    'electricity',
    'drainage',
    'waste_management',
    'healthcare',
    'education',
    'public_transport',
  ];

  // 1. Priority 1: Any topic mentioned or flagged by the respondent that needs follow-up
  for (const topic of publicServiceTopics) {
    const status = topicStatuses[topic];
    if (topic !== currentTopic && (status === 'needs_follow_up' || status === 'mentioned')) {
      return { nextTopic: topic, nextQId: TOPIC_QUESTION_MAP[topic] || 'A1' };
    }
  }

  // 2. Priority 2: The next not_started topic from public service issues
  for (const topic of publicServiceTopics) {
    if (topicStatuses[topic] === 'not_started') {
      return { nextTopic: topic, nextQId: TOPIC_QUESTION_MAP[topic] || 'A1' };
    }
  }

  // 3. Priority 3: Government services question
  if (topicStatuses['government_services'] === 'not_started') {
    return { nextTopic: 'government_services', nextQId: 'A9' };
  }

  // 4. Priority 4: Overall top priority question
  if (topicStatuses['top_priority'] === 'not_started') {
    return { nextTopic: 'top_priority', nextQId: 'A10' };
  }

  // All topics covered
  return null;
}

/**
 * Main Conversational Intelligence & Memory Engine
 */
export function processTurnMemory(
  userText: string,
  currentState: SurveySessionState,
  allQuestions: Array<{ id: string; text: string; category?: string }> = []
): MemoryProcessingResult {
  const t = (userText || '').trim();
  const lower = normalizeText(t);

  const answers = { ...currentState.answers };
  const completed = new Set(currentState.completed_questions || []);
  let currentQId = currentState.current_question || currentState.current_question_id || 'A1';
  let currentTopic = currentState.current_topic || currentState.current_question_topic || QUESTION_TOPIC_MAP[currentQId] || 'drinking_water';

  // Ensure topic_statuses exists
  const topicStatuses: Record<string, TopicStatus> = {
    drinking_water: currentState.topic_statuses?.drinking_water || 'not_started',
    roads: currentState.topic_statuses?.roads || 'not_started',
    electricity: currentState.topic_statuses?.electricity || 'not_started',
    drainage: currentState.topic_statuses?.drainage || 'not_started',
    waste_management:
      currentState.topic_statuses?.waste_management ||
      currentState.topic_statuses?.sanitation ||
      'not_started',
    healthcare: currentState.topic_statuses?.healthcare || 'not_started',
    education: currentState.topic_statuses?.education || 'not_started',
    public_transport: currentState.topic_statuses?.public_transport || 'not_started',
    government_services: currentState.topic_statuses?.government_services || 'not_started',
    top_priority: currentState.topic_statuses?.top_priority || 'not_started',
  };

  const askedFollowUps = new Set<string>(currentState.asked_follow_ups || []);
  const completedFollowUps = new Set<string>(currentState.completed_follow_ups || []);

  let pendingFollowUp: FollowUpDetail | string | null = currentState.pending_follow_up || null;
  let activeField =
    pendingFollowUp && typeof pendingFollowUp === 'object'
      ? pendingFollowUp.field
      : typeof pendingFollowUp === 'string'
      ? pendingFollowUp
      : null;

  if (activeField && !activeField.endsWith('_clarify')) {
    const qStr =
      pendingFollowUp && typeof pendingFollowUp === 'object'
        ? pendingFollowUp.question
        : activeField || '';
    if (
      /(బాగానే|బాగుందని).*?(లేక|లేదా).*?(సమస్య|ఇబ్బంది)/i.test(qStr) ||
      /(బాగానే\s*ఉందని|బాగుందని).*?చెబుతున్నారా/i.test(qStr) ||
      /సమస్య\s*ఉందా/i.test(qStr)
    ) {
      activeField = `${currentTopic}_clarify`;
    }
  }

  let conversationStatus: ConversationStatus = currentState.conversation_status || 'active';
  let detectedIntent = 'SURVEY_ANSWER';
  let correctionMade = false;
  let alreadyAnsweredRecognized = false;
  let directReply: string | undefined;
  const extractedNewAnswers: Record<string, any> = {};

  // =========================================================================
  // STEP 1: DISCONNECT / EMPTY INPUT
  // =========================================================================
  if (!t) {
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: 'ended',
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'DISCONNECT',
      extractedNewAnswers: {},
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: '',
    };
  }

  // =========================================================================
  // STEP 1.5: ALREADY REFUSED / ENDED CONVERSATION CHECK ("CHEPA KADAA" IN REFUSAL CONTEXT)
  // =========================================================================
  const wasRefused =
    currentState.conversation_status === 'refused' ||
    currentState.answers?.refusal_noted === true;
  const wasEnded =
    currentState.conversation_status === 'ended_by_user' ||
    currentState.conversation_status === 'ended';

  if (wasRefused || wasEnded) {
    if (wasRefused || isRefusalStatement(t) || isAlreadyAnsweredStatement(t)) {
      return {
        updatedState: {
          ...currentState,
          topic_statuses: topicStatuses,
          conversation_status: 'refused',
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'REFUSAL',
        extractedNewAnswers: {},
        correctionMade: false,
        alreadyAnsweredRecognized: true,
        directReply: 'సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.',
      };
    }
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: 'ended_by_user',
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'CALL_END',
      extractedNewAnswers: {},
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: 'సరే అండి, ధన్యవాదాలు.',
    };
  }

  // =========================================================================
  // STEP 2: PRIORITY 1 — CALL END / BYE / STOP INTENT
  // =========================================================================
  if (isCallEndStatement(t)) {
    conversationStatus = 'ended_by_user';
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: 'ended_by_user',
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'CALL_END',
      extractedNewAnswers: {},
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: 'సరే అండి, ధన్యవాదాలు.',
    };
  }

  // =========================================================================
  // STEP 2.5: PRIORITY 1 — BUSY / CALLBACK WITH OPTIONAL BYE
  // =========================================================================
  if (isBusyWithBye(t)) {
  conversationStatus = 'busy';

  return {
    updatedState: {
      ...currentState,
      topic_statuses: topicStatuses,
      conversation_status: conversationStatus,
      answers: {
        ...answers,
        busy: true,
        call_end: false,
      },
      updated_at: new Date().toISOString(),
    },
    detectedIntent: 'BUSY',
    extractedNewAnswers: {
      busy: true,
      call_end: false,
    },
    correctionMade: false,
    alreadyAnsweredRecognized: false,
    directReply:
      'సరే అండి. మీకు ఎప్పుడు సౌకర్యంగా ఉంటుందో చెప్పండి, ఆ సమయానికి మళ్లీ కాల్ చేస్తాము.',
  };
}

  // =========================================================================
  // STEP 3: PRIORITY 2 — REFUSAL INTENT
  // =========================================================================
  if (isRefusalStatement(t)) {
    conversationStatus = 'refused';
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'REFUSAL',
      extractedNewAnswers: { refusal_noted: true },
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: 'సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.',
    };
  }

  // =========================================================================
  // STEP 4: PRIORITY 3 — BUSY / CALLBACK HANDLING
  // =========================================================================
  const isBusy = isBusyStatement(t);
  const cbTime = extractCallbackTime(t);

  if (isBusy && cbTime) {
    conversationStatus = 'callback_requested';
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: conversationStatus,
        callback_requested: true,
        callback_time: cbTime,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'CALLBACK_REQUESTED',
      extractedNewAnswers: { callback_requested: true, callback_time: cbTime },
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: `సరే అండి, ${cbTime} మళ్లీ కాల్ చేస్తాను.`,
    };
  }

  if (currentState.conversation_status === 'busy' && cbTime) {
    conversationStatus = 'callback_requested';
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: conversationStatus,
        callback_requested: true,
        callback_time: cbTime,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'CALLBACK_REQUESTED',
      extractedNewAnswers: { callback_requested: true, callback_time: cbTime },
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: `సరే అండి, ${cbTime} మళ్లీ కాల్ చేస్తాను.`,
    };
  }

  if (isBusy && !cbTime) {
    conversationStatus = 'busy';
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'BUSY',
      extractedNewAnswers: {},
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply: 'సరే అండి. మీకు ఎప్పుడు సౌకర్యంగా ఉంటుందో చెప్పండి, ఆ సమయానికి మళ్లీ కాల్ చేస్తాను.',
    };
  }

  // =========================================================================
  // STEP 5: RESPONDENT ASKS A QUESTION / CLARIFICATION
  // =========================================================================
  if (isClarificationQuestion(t)) {
    return {
      updatedState: {
        ...currentState,
        topic_statuses: topicStatuses,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'CLARIFICATION_QUESTION',
      extractedNewAnswers: {},
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply:
        'అవును అండి. మీ ప్రాంతంలో తాగునీరు, రోడ్లు, డ్రైనేజీ లాంటి ప్రజా సదుపాయాలు ఎలా ఉన్నాయో తెలుసుకోవడానికి ఈ సర్వే చేస్తున్నాం. మీ ప్రాంతంలో పరిస్థితి ఎలా ఉందో మీ దగ్గర నుంచే తెలుసుకోవడానికి కొన్ని ప్రశ్నలు అడుగుతున్నాం. అయితే మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది అండి?',
    };
  }

  // =========================================================================
  // STEP 6: "ALREADY ASKED" / "ALREADY EE QUESTION ADIGARU KADAA" (Section 24, Item 7)
  // =========================================================================
  if (isAlreadyAskedQuestionStatement(t)) {
    alreadyAnsweredRecognized = true;
    detectedIntent = 'ALREADY_ASKED';

    // Mark current topic as sufficiently answered
    topicStatuses[currentTopic] = 'sufficiently_answered';
    completed.add(currentQId);

    // Pick a genuinely unanswered topic
    const nextObj = selectNextTopic(currentTopic, topicStatuses);
    const teluguTopicName = TOPIC_NAMES_TELUGU[currentTopic] || 'ఈ విషయం';

    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `అవును అండి, ${teluguTopicName} గురించి మనం ముందే మాట్లాడుకున్నాం. ${qText}`;
    } else {
      conversationStatus = 'completed';
      directReply = `అవును అండి, ${teluguTopicName} గురించి మనం ముందే మాట్లాడుకున్నాం. మీ ప్రాంత సమస్యలపై మీ అభిప్రాయాలు పూర్తయ్యాయి, ధన్యవాదాలు!`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: true,
      directReply,
    };
  }

  // =========================================================================
  // STEP 7: CORRECTION HANDLING (Section 16 & Test 10)
  // =========================================================================
  if (isCorrectionStatement(t)) {
    correctionMade = true;
    detectedIntent = 'CORRECTION';

    // Correction of timing
    if (/సాయంత్రం|evening|రాత్రి|night/i.test(t)) {
      answers['water_time'] = 'evening';
      answers['water_timing'] = 'evening';
      extractedNewAnswers['water_time'] = 'evening';
      extractedNewAnswers['water_timing'] = 'evening';
      completedFollowUps.add('water_timing');
      completedFollowUps.add('water_time');
      pendingFollowUp = null;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `సరే అండి, సాయంత్రం వస్తుందని సరిచేస్తాను. ఇక ${qText}`;
      } else {
        conversationStatus = 'completed';
        directReply = 'సరే అండి, సాయంత్రం వస్తుందని సరిచేస్తాను. ధన్యవాదాలు.';
      }

      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent,
        extractedNewAnswers,
        correctionMade: true,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }

    // Correction of days per week (e.g. "కాదు, నాలుగు రోజులు వస్తాయి")
    const days = parseNumberFromText(t);
    if (days !== null) {
      answers['water_days_per_week'] = days;
      extractedNewAnswers['water_days_per_week'] = days;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');
      pendingFollowUp = null;

      const teluguNumberMap: Record<number, string> = {
        1: 'ఒక రోజు',
        2: 'రెండు రోజులు',
        3: 'మూడు రోజులు',
        4: 'నాలుగు రోజులు',
        5: 'ఐదు రోజులు',
        6: 'ఆరు రోజులు',
        7: 'ఏడు రోజులు',
      };
      const daysStr = teluguNumberMap[days] || `${days} రోజులు`;

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `సరే అండి, ${daysStr} వస్తాయని సరిచేస్తున్నాను. ఇక ${qText}`;
      } else {
        conversationStatus = 'completed';
        directReply = `సరే అండి, ${daysStr} వస్తాయని సరిచేస్తున్నాను. ధన్యవాదాలు.`;
      }

      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent,
        extractedNewAnswers,
        correctionMade: true,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }
  }

  // =========================================================================
  // STEP 8: "I ALREADY TOLD YOU" RECOGNITION
  // =========================================================================
  if (isAlreadyAnsweredStatement(t)) {
    alreadyAnsweredRecognized = true;
    detectedIntent = 'ALREADY_ANSWERED';

    // If respondent was refusing or trying to end the call, do NOT interpret as missing survey info
    const isEndingOrRefusalContext =
      currentState.conversation_status === 'refused' ||
      currentState.conversation_status === 'ended_by_user' ||
      currentState.conversation_status === 'ended' ||
      currentState.conversation_status === 'busy' ||
      currentState.conversation_status === 'callback_requested' ||
      answers['refusal_noted'] === true;

    if (isEndingOrRefusalContext) {
      return {
        updatedState: {
          ...currentState,
          conversation_status: currentState.conversation_status || 'refused',
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'REFUSAL',
        extractedNewAnswers: {},
        correctionMade: false,
        alreadyAnsweredRecognized: true,
        directReply: 'సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.',
      };
    }

    let ackMemory = 'అవును అండి, మీరు ముందే చెప్పారు. నేను గుర్తుంచుకున్నాను.';
    if (answers['water_days_per_week']) {
      ackMemory = `అవును అండి, వారానికి ${answers['water_days_per_week']} రోజులు మాత్రమే వస్తాయని మీరు ముందే చెప్పారు. నాకు గుర్తుంది.`;
    } else if (answers['water_supply']) {
      ackMemory = `అవును అండి, నీటి సరఫరా సరిగ్గా లేదని మీరు ముందే చెప్పారు. నాకు గుర్తుంది.`;
    }

    topicStatuses[currentTopic] = 'sufficiently_answered';
    completed.add(currentQId);
    pendingFollowUp = null;

    const nextObj = selectNextTopic(currentTopic, topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `${ackMemory} ${qText}`;
    } else {
      conversationStatus = 'completed';
      directReply = `${ackMemory} సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు!`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: true,
      directReply,
    };
  }

  // =========================================================================
  // STEP 8.5: AMBIGUOUS SHORT RESPONSES TO OPEN-ENDED TOPIC QUESTIONS
  // =========================================================================
  if (
    !activeField &&
    currentTopic &&
    currentTopic !== 'government_services' &&
    currentTopic !== 'top_priority'
  ) {
    // 8.5A: Ambiguous short answers like "ok", "fine", "సరే", "yes", "అవును" (Section 6, 7, 15)
    if (isAmbiguousTopicResponse(t)) {
      const ambiguousTopicText: Record<string, string> = {
        drinking_water: 'నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        roads: 'రోడ్ల పరిస్థితి బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        electricity: 'కరెంట్ సరఫరా బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        drainage: 'డ్రైనేజీ బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        waste_management: 'చెత్త సేకరణ బాగానే జరుగుతోందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        sanitation: 'పారిశుధ్య పనులు బాగానే జరుగుతున్నాయని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        healthcare: 'ఆరోగ్య సేవలు బాగానే ఉన్నాయని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        education: 'పాఠశాలల సౌకర్యాలు బాగానే ఉన్నాయని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
        public_transport: 'రవాణా సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
      };
      directReply =
        ambiguousTopicText[currentTopic] || 'ఈ సదుపాయం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?';
      pendingFollowUp = {
        topic: currentTopic,
        field: `${currentTopic}_clarify`,
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add(`${currentTopic}_clarify`);
      conversationStatus = 'waiting_for_follow_up';

      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'CLARIFICATION_NEEDED',
        extractedNewAnswers,
        correctionMade: false,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }

    // 8.5B: Ambiguous bare "లేదు" to open-ended topic question (Section 12, 13)
    if (isBareNo(t)) {
  // ============================================================
  // BARE "NO" / "లేదు" HANDLING
  //
  // In a public survey, a simple:
  //   లేదు
  //   ledu
  //   ledhu
  //   no
  //
  // normally means "there is no problem" when the agent has just
  // asked about the condition of a public service.
  //
  // Therefore, do NOT automatically interpret "లేదు" as a
  // negative/problem answer.
  // ============================================================

  const topicQuestionMap: Record<string, string> = {
    drinking_water: 'తాగునీటి సౌకర్యం',
    roads: 'రోడ్ల పరిస్థితి',
    electricity: 'విద్యుత్ సరఫరా',
    drainage: 'డ్రైనేజీ వ్యవస్థ',
    waste_management: 'చెత్త సేకరణ',
    sanitation: 'పారిశుధ్య పనులు',
    healthcare: 'ఆరోగ్య సేవలు',
    education: 'విద్యా సదుపాయాలు',
    public_transport: 'ప్రజా రవాణా',
  };

  const topicName = topicQuestionMap[currentTopic] || 'ఈ సౌకర్యం';

  // "లేదు" = no problem / satisfactory
  topicStatuses[currentTopic] = 'sufficiently_answered';

  // Mark the current survey question as completed.
  if (currentQId) {
    completed.add(currentQId);
  }

  // Clear any stale follow-up.
  pendingFollowUp = null;

  // Clear the clarification state if one exists.
  completedFollowUps.add(`${currentTopic}_clarify`);

  const nextObj = selectNextTopic(currentTopic, topicStatuses);

  if (nextObj) {
    currentTopic = nextObj.nextTopic;
    currentQId = nextObj.nextQId;

    const qText = getQuestionTextForTopic(currentTopic);

    directReply = `సరే అండి. ${qText}`;
  } else {
    conversationStatus = 'completed';

    directReply =
      'సరే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. మీ సమయం కేటాయించినందుకు ధన్యవాదాలు.';
  }

  return {
    updatedState: {
      ...currentState,
      current_question_id: currentQId,
      current_question_topic: currentTopic,
      topic_statuses: topicStatuses,
      answers,
      pending_follow_up: pendingFollowUp,
      asked_follow_ups: Array.from(askedFollowUps),
      completed_follow_ups: Array.from(completedFollowUps),
      completed_questions: Array.from(completed),
      conversation_status: conversationStatus,
      updated_at: new Date().toISOString(),
    },
    detectedIntent: 'NO_PROBLEM',
    extractedNewAnswers,
    correctionMade: false,
    alreadyAnsweredRecognized: true,
    directReply,
  };
}
  }

  // =========================================================================
  // STEP 8.7: RESOLUTION OF CLARIFICATION QUESTION (CLARIFICATION → ANSWER CONTEXT)
  // When the AI asks a clarification question about the respondent's previous answer,
  // the respondent's next message must be interpreted in the context of that clarification question.
  // The latest respondent message must NOT be classified independently without considering
  // the immediately preceding agent question.
  // Context priority:
  // 1. Immediately preceding agent question
  // 2. Current conversation topic
  // 3. Previous conversation memory
  // 4. Meaning of the respondent's current words
  // =========================================================================
  if (activeField && activeField.endsWith('_clarify')) {
    const clarifyTopic = activeField.replace('_clarify', '');
    completedFollowUps.add(activeField);

    const pendingQText =
      typeof currentState.pending_follow_up === 'object' && currentState.pending_follow_up
        ? currentState.pending_follow_up.question
        : typeof currentState.pending_follow_up === 'string'
        ? currentState.pending_follow_up
        : '';

    const isBinaryClarifyQ =
      /(బాగానే|బాగుందని).*?(లేక|లేదా).*?(సమస్య|ఇబ్బంది)/i.test(pendingQText) ||
      /(బాగానే\s*ఉందని|బాగుందని).*?చెబుతున్నారా/i.test(pendingQText);

    const isProblemInquiryQ =
      /(సమస్య|ఇబ్బంది)\s*ఉందా/i.test(pendingQText) ||
      /(సమస్య|ఇబ్బంది)\s*ఉందని\s*(చెబుతున్నారా|అంటున్నారా)/i.test(pendingQText);

    const isDefectInquiryQ = /సరిగ్గా\s*లేదని\s*అంటున్నారా/i.test(pendingQText);

    // 1. Explicit Positive Confirmations:
    // e.g. "baney vundhi", "baane undhi", "బానే ఉంది", "బాగానే ఉంది", "haa baane undhi", "yes, baane undhi", "bagundhi", "good", "fine", "no problem", "సమస్య లేదు"
    const isExplicitPositive =
      /బాగానే\s*(ఉంది|ఉంటది|ఉంటుంది|వస్తున్నాయి|వస్తోంది|జరుగుతోంది|ఉన్నాయి|అవుతున్నాయి)|బానే\s*(ఉంది|ఉంటది|ఉంటుంది|వస్తున్నాయి|వస్తోంది|జరుగుతోంది|ఉన్నాయి|అవుతున్నాయి)|బాగుంది|బాగున్నాయి|మంచిగా\s*ఉంది/i.test(
        lower
      ) ||
      /ba+ne+y?\s*(u+n+d[hi]+|v+u+n+d[hi]+|untadi|untundhi|vastu+n+a+i|vasthayi|osthayi|undi|vundi)|ba+ne+y?\s*ga\s*(u+n+d[hi]+|v+u+n+d[hi]+)|ba+ne+y?|bagund[hi]+|bagundi|badundhi/i.test(
        lower
      ) ||
      /\b(good|fine|all\s*good|no\s*problem|no\s*problems|no\s*issue|no\s*issues)\b/i.test(lower) ||
      /సమస్య\s*(ఏమీ\s*)?లేదు|ఇబ్బంది\s*(ఏమీ\s*)?లేదు|లేదు\s*సమస్య\s*లేదు|problem\s*(em\s*)?le[dt]hu|samasya\s*(em\s*)?le[dt]hu/i.test(
        lower
      ) ||
      /(haa|yes|yeah|avunu|avunandi|ledu|ledhu|లేదు)\s*,?\s*(baane|baney|బానే|బాగానే|bagundhi|good)/i.test(
        lower
      );

    // 2. Bare negative "లేదు" / "no" / "ledu" in context of problem inquiry ("సమస్య ఉందా?") means NO PROBLEM!
    const isNoToProblemInquiry =
      isBareNo(t) && (isProblemInquiryQ || isBinaryClarifyQ || isDefectInquiryQ);

    // 2.1 Affirmative "haa" / "yes" / "avunu" to binary clarification ("బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?") means POSITIVE CONFIRMATION (NO PROBLEM)
    const isAffirmativeToBinaryClarify =
      isBinaryClarifyQ && isAffirmativeResponse(lower);

    const isGoodConfirmation = isExplicitPositive || isNoToProblemInquiry || isAffirmativeToBinaryClarify;

    // 3. Explicit Problem Statements:
    const isExplicitProblem =
      !/no\s*problem|సమస్య\s*(ఏమీ\s*)?లేదు|ఇబ్బంది\s*(ఏమీ\s*)?లేదు|problem\s*(em\s*)?le[dt]hu/i.test(lower) &&
      (/సమస్య\s*ఉంది|సమస్యలు\s*ఉన్నాయి|ఇబ్బంది\s*ఉంది|ఇబ్బందులు|బాధలు/i.test(lower) ||
        /problem\s*(u+n+d[hi]+|v+u+n+d[hi]+|undi|vundi)|problems\s*u+n+a+i|issues?\s*u+n+a+i|\bproblems?\b|\bissue\b/i.test(
          lower
        ) ||
        /baledhu|baledu|bagaledu|bagoledhu|బాగోలేదు|బాలేదు|బావోలేదు|worst|దారుణం|చెత్తగా/i.test(lower) ||
        /సరిగ్గా\s*(లేదు|రావడం\s*లేదు|రావు|రావట్లేదు|ఉండదు)|sarigga\s*(ledu|ravatledu|undadu|undaru|raru)/i.test(
          lower
        ));

    // 4. Saying "yes" / "undi" / "avunu" to "సమస్య ఉందా?" or "సరిగ్గా లేదని అంటున్నారా?" confirms problem exists
    const isYesToProblemInquiry =
      (isAffirmativeResponse(lower) || /^(undi|vundhi|ఉంది)$/i.test(lower)) &&
      (isProblemInquiryQ || isDefectInquiryQ);

    // 5. Specific defect details in the answer (e.g. holes, rain, accidents, drainage, cuts):
    const hasPotholes = /గుంతలు|holes|potholes|guntalu/i.test(lower);
    const hasRain = /వర్షం|\bvarsham\b|\b(rain|rains|rainy)\b/i.test(lower);
    const hasWaterLogging =
      /నీళ్లు\s*నిలుస్తాయి|నీళ్లు\s*నిలవడం|water\s*nilusthai|water\s*nilusthundhi|\bwaterlogging\b|\bwater\s*logging\b/i.test(
        lower
      );
    const hasAccident = /\baccidents?\b|యాక్సిడెంట్/i.test(lower);
    const hasRoadDetails =
      clarifyTopic === 'roads' && (hasPotholes || hasRain || hasWaterLogging || hasAccident);
    const hasWasteCollectionDelay =
      clarifyTopic === 'waste_management' &&
      /3\s*days|5\s*days|రారు|raru|వస్తారు|vastaru/i.test(lower);

    // DECISION A: POSITIVE CONFIRMATION (NO PROBLEM)
    if (isGoodConfirmation && !isExplicitProblem && !hasRoadDetails && !hasWasteCollectionDelay) {
      pendingFollowUp = null;
      topicStatuses[clarifyTopic] = 'sufficiently_answered';

      const qIdMap: Record<string, string> = {
        drinking_water: 'A1',
        roads: 'A2',
        electricity: 'A3',
        drainage: 'A4',
        waste_management: 'A5',
        sanitation: 'A5',
        healthcare: 'A6',
        education: 'A7',
        public_transport: 'A8',
      };
      if (qIdMap[clarifyTopic]) completed.add(qIdMap[clarifyTopic]);

      if (clarifyTopic === 'drinking_water') {
        answers['water_service'] = 'good';
        answers['water_problem'] = 'none_reported';
        answers['water_supply'] = 'regular';
        answers['water_condition'] = 'good';
        extractedNewAnswers['water_service'] = 'good';
        extractedNewAnswers['water_problem'] = 'none_reported';
        extractedNewAnswers['water_supply'] = 'regular';
      } else if (clarifyTopic === 'electricity') {
        answers['electricity_status'] = 'good';
        answers['electricity_condition'] = 'good';
        extractedNewAnswers['electricity_status'] = 'good';
      } else {
        answers[`${clarifyTopic}_condition`] = 'good';
        extractedNewAnswers[`${clarifyTopic}_condition`] = 'good';
      }

      const nextObj = selectNextTopic(clarifyTopic, topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `సరే అండి. ${qText}`;
      } else {
        conversationStatus = 'completed';
        directReply = 'సరే అండి, వివరాలు తెలుసుకున్నాను. సర్వే పూర్తయింది, ధన్యవాదాలు!';
      }

      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'SURVEY_ANSWER',
        extractedNewAnswers,
        correctionMade: false,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }

    // DECISION B: DETAILED ROADS ANSWER (e.g. holes, rain, water logging, accidents)
    if (hasRoadDetails) {
      answers['roads_condition'] = 'poor';
      extractedNewAnswers['roads_condition'] = 'poor';
      if (hasPotholes) {
        answers['roads_problem'] = 'potholes';
        answers['road_problem'] = 'potholes';
        answers['roads_main_issue'] = 'potholes';
        extractedNewAnswers['roads_problem'] = 'potholes';
        extractedNewAnswers['road_problem'] = 'potholes';
      }
      if (hasRain) {
        answers['rain_related_problem'] = true;
        extractedNewAnswers['rain_related_problem'] = true;
      }
      if (hasWaterLogging) {
        answers['water_logging'] = true;
        extractedNewAnswers['water_logging'] = true;
      }
      if (hasAccident) {
        answers['safety_concern'] = 'accidents';
        extractedNewAnswers['safety_concern'] = 'accidents';
      }

      // If detailed with rain or waterlogging or accident:
      if (hasPotholes && (hasRain || hasWaterLogging || hasAccident)) {
        pendingFollowUp = null;
        topicStatuses.roads = 'sufficiently_answered';
        completed.add('A2');
        const nextObj = selectNextTopic('roads', topicStatuses);
        if (nextObj) {
          currentTopic = nextObj.nextTopic;
          currentQId = nextObj.nextQId;
          const qText = getQuestionTextForTopic(currentTopic);
          let ack = 'అవునా అండి, రోడ్ల పరిస్థితి గురించి అర్థమైంది.';
          if ((hasWaterLogging || hasRain) && hasAccident) {
            ack =
              'అవునా అండి, రోడ్లలో గుంతలు ఉండటం వల్ల వర్షం సమయంలో నీళ్లు నిలుస్తున్నాయి, దాంతో యాక్సిడెంట్లు కూడా అవుతున్నాయని అర్థమైంది.';
          } else if (hasWaterLogging && hasRain) {
            ack = 'అవునా అండి, గుంతల వల్ల వర్షం సమయంలో నీళ్లు నిలుస్తున్నాయని అర్థమైంది.';
          } else if (hasWaterLogging) {
            ack = 'అవునా అండి, రోడ్లలో గుంతల వల్ల నీళ్లు నిలుస్తున్నాయని అర్థమైంది.';
          } else if (hasRain) {
            ack = 'అవునా అండి, గుంతల వల్ల వర్షం సమయంలో ఇబ్బంది అవుతోందని అర్థమైంది.';
          } else if (hasAccident) {
            ack = 'అవునా అండి, రోడ్లలో గుంతల వల్ల యాక్సిడెంట్లు కూడా జరుగుతున్నాయని అర్థమైంది.';
          }
          directReply = `${ack} ${qText}`;
        }
      } else {
        // Potholes alone -> ask rain follow-up
        directReply = 'అవునా అండి. వర్షం పడినప్పుడు కూడా ఈ గుంతల వల్ల ఇబ్బంది అవుతుందా?';
        pendingFollowUp = {
          topic: 'roads',
          field: 'roads_rain_issue',
          question: directReply,
          status: 'waiting_for_answer',
        };
        askedFollowUps.add('roads_rain_issue');
        conversationStatus = 'waiting_for_follow_up';
      }

      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'SURVEY_ANSWER',
        extractedNewAnswers,
        correctionMade: false,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }

    // DECISION C: DETAILED WASTE MANAGEMENT (e.g. irregular collection delay)
    if (hasWasteCollectionDelay) {
      answers['waste_collection_frequency'] = 'irregular';
      answers['waste_management_problem'] = 'irregular_collection';
      answers['waste_management_condition'] = 'poor';
      extractedNewAnswers['waste_collection_frequency'] = 'irregular';
      extractedNewAnswers['waste_management_problem'] = 'irregular_collection';
      pendingFollowUp = null;
      topicStatuses.waste_management = 'sufficiently_answered';
      completed.add('A5');
      const nextObj = selectNextTopic('waste_management', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `అర్థమైంది అండి, చెత్త సేకరణ రెగ్యులర్గా లేకపోవడం సమస్యగా ఉందని చెప్పారు. ${qText}`;
      }
      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent: 'SURVEY_ANSWER',
        extractedNewAnswers,
        correctionMade: false,
        alreadyAnsweredRecognized: false,
        directReply,
      };
    }

    // DECISION D: EXPLICIT PROBLEM CONFIRMED OR YES TO PROBLEM INQUIRY
    // (e.g. "undi", "problem undi", "baledhu", "సమస్య ఉంది")
    topicStatuses[clarifyTopic] = 'needs_follow_up';
    if (clarifyTopic === 'drinking_water') {
      answers['water_supply'] = 'irregular';
      extractedNewAnswers['water_supply'] = 'irregular';
    } else if (clarifyTopic === 'electricity') {
      answers['electricity_status'] = 'poor';
      extractedNewAnswers['electricity_status'] = 'poor';
    } else {
      answers[`${clarifyTopic}_condition`] = 'poor';
      extractedNewAnswers[`${clarifyTopic}_condition`] = 'poor';
    }

    const followUpByTopic: Record<string, { field: string; q: string }> = {
      roads: { field: 'roads_issue', q: 'అవునా అండి. రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?' },
      electricity: { field: 'electricity_issue', q: 'అవునా అండి. కరెంట్లో ప్రధానంగా ఏ ఇబ్బంది వస్తోంది?' },
      drinking_water: { field: 'water_supply_problem', q: 'అవునా అండి. నీటి supplyలో ఏ సమస్య ఎక్కువగా ఉంది?' },
      drainage: { field: 'drainage_issue', q: 'అవునా అండి. డ్రైనేజీలో ఏ సమస్య ఎక్కువగా ఉంది?' },
      waste_management: { field: 'waste_issue', q: 'అవునా అండి. చెత్త సేకరణలో ఏ ఇబ్బంది ఉంది?' },
      healthcare: { field: 'healthcare_issue', q: 'అవునా అండి. ఆరోగ్య సేవల్లో ప్రధానంగా ఏ సమస్య ఎదురవుతోంది?' },
      education: { field: 'education_issue', q: 'అవునా అండి. పాఠశాలల్లో ప్రధానంగా ఏ ఇబ్బంది ఉంది?' },
      public_transport: { field: 'transport_issue', q: 'అవునా అండి. రవాణా విషయంలో ఎలాంటి ఇబ్బంది ఉంది?' },
    };

    const fu = followUpByTopic[clarifyTopic] || {
      field: `${clarifyTopic}_issue`,
      q: 'అవునా అండి. ప్రధానంగా ఎలాంటి సమస్య ఎదురవుతోంది?',
    };
    directReply = fu.q;
    pendingFollowUp = {
      topic: clarifyTopic,
      field: fu.field,
      question: directReply,
      status: 'waiting_for_answer',
    };
    askedFollowUps.add(fu.field);
    conversationStatus = 'waiting_for_follow_up';

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'SURVEY_ANSWER',
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

  // =========================================================================
  // STEP 9: MULTI-TOPIC & MULTI-INTENT EXTRACTIONS
  // =========================================================================

  // 9.0 MULTI-TOPIC: ROADS + DRAINAGE
  const hasDrainageWater = /drainage\s*wa?ter|డ్రైనేజీ\s*నీ|మురుగు\s*నీ/i.test(lower);
  const hasDrainageMention = hasDrainageWater || /drainage|డ్రైనేజీ|మురుగు|కాలవ/i.test(lower);
  const hasHolesMention = /holes|potholes|guntalu|గుంతలు/i.test(lower);
  const hasRoadsWord = /roads?|రోడ్/i.test(lower);
  const hasRoadsDefect = hasHolesMention || /బాగోలేవు|పాడైపోయాయి|baledu|worst|చెత్తగా/i.test(lower);
  const hasDrainageWaterOnRoad =
    /water\s*road\s*medha|నీళ్లు\s*రోడ్డుపైకి|road\s*meedaki|రోడ్డుపైకి|road\s*మీదకి|రోడ్డు\s*మీదకి|రోడ్డు\s*పైకి|road\s*medhaki|road\s*meeda|రోడ్డుమీదకి/i.test(
      lower
    ) ||
    (/(water|నీళ్లు|నీరు).*?(road|రోడ్డు).*?(మీద|పై|meed|medh)/i.test(lower) &&
      /vast|వస్తు/i.test(lower));

  const mentionsBothRoadsAndDrainage =
    hasRoadsWord &&
    hasDrainageMention &&
    /రెండు|రెండూ|rendu|both|problems|problem|సమస్య/i.test(lower);

  const isSpecificRoadAndDrainageMultiTopic =
    hasDrainageMention &&
    (hasHolesMention ||
      (hasRoadsDefect && hasDrainageWater) ||
      (hasDrainageWaterOnRoad && currentTopic !== 'drainage') ||
      (currentTopic === 'roads' && (hasDrainageWater || hasHolesMention)) ||
      (activeField === 'roads_issue' && hasDrainageMention));

  if (mentionsBothRoadsAndDrainage) {
    answers['roads_condition'] = 'poor';
    answers['drainage_condition'] = 'poor';
    extractedNewAnswers['roads_condition'] = 'poor';
    extractedNewAnswers['drainage_condition'] = 'poor';
    topicStatuses.roads = 'needs_follow_up';
    topicStatuses.drainage = 'needs_follow_up';

    if (currentTopic === 'drinking_water') {
      const isGoodWater = /బాగుంది|బానే|bagundhi|baane|good/i.test(lower);
      if (isGoodWater || !/water|నీళ్లు|నీరు/i.test(lower.replace(/drainage\s*water/, ''))) {
        topicStatuses.drinking_water = 'sufficiently_answered';
        answers['water_service'] = 'good';
        answers['water_problem'] = 'none_reported';
        answers['water_condition'] = 'good';
        extractedNewAnswers['water_service'] = 'good';
        completed.add('A1');
      }
    }

    currentTopic = 'roads';
    currentQId = 'A2';
    directReply =
      'సరే అండి, రోడ్లు మరియు డ్రైనేజీ రెండింటిలోనూ సమస్య ఉందని చెప్పారు. రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?';
    pendingFollowUp = {
      topic: 'roads',
      field: 'roads_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };
    askedFollowUps.add('roads_issue');
    conversationStatus = 'waiting_for_follow_up';

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'MULTI_TOPIC_PROBLEM',
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  } else if (isSpecificRoadAndDrainageMultiTopic) {
    // 1. Roads extraction
    answers['roads_condition'] = 'poor';
    extractedNewAnswers['roads_condition'] = 'poor';
    if (hasHolesMention) {
      answers['roads_problem'] = 'potholes';
      answers['road_problem'] = 'potholes';
      answers['roads_main_issue'] = 'potholes';
      extractedNewAnswers['roads_problem'] = 'potholes';
      extractedNewAnswers['road_problem'] = 'potholes';
    }

    // 2. Drainage extraction
    answers['drainage_condition'] = 'poor';
    extractedNewAnswers['drainage_condition'] = 'poor';
    if (hasDrainageWaterOnRoad) {
      answers['drainage_problem'] = 'water_on_road';
      answers['drainage_water_problem'] = true;
      extractedNewAnswers['drainage_problem'] = 'water_on_road';
      extractedNewAnswers['drainage_water_problem'] = true;
    } else if (hasDrainageWater) {
      answers['drainage_problem'] = 'drainage water';
      answers['drainage_water_problem'] = true;
      extractedNewAnswers['drainage_problem'] = 'drainage water';
      extractedNewAnswers['drainage_water_problem'] = true;
    } else {
      answers['drainage_problem'] = 'drainage_issue';
      extractedNewAnswers['drainage_problem'] = 'drainage_issue';
    }

    // 3. NO INVENTION: Only set rain/waterlogging/accidents if explicitly mentioned
    const hasRainExplicit = /\b(rain|rains|rainy)\b|\bvarsham\b|వర్షం/i.test(lower);
    const hasWaterLoggingExplicit = /నీళ్లు\s*నిలుస్తాయి|నీళ్లు\s*నిలవడం|water\s*nilusthai|water\s*nilusthundhi|\bwaterlogging\b|\bwater\s*logging\b/i.test(lower);
    const hasAccidentExplicit = /\baccidents?\b|యాక్సిడెంట్/i.test(lower);

    if (hasRainExplicit) {
      answers['rain_related_problem'] = true;
      extractedNewAnswers['rain_related_problem'] = true;
    }
    if (hasWaterLoggingExplicit) {
      answers['water_logging'] = true;
      extractedNewAnswers['water_logging'] = true;
    }
    if (hasAccidentExplicit) {
      answers['safety_concern'] = 'accidents';
      extractedNewAnswers['safety_concern'] = 'accidents';
    }

    // Mark roads as sufficiently answered because specific road defect (e.g. potholes) was stated
    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');

    if (currentTopic === 'drinking_water' && !/water|నీళ్లు|నీరు/i.test(lower.replace(/drainage\s*wa?ter/, ''))) {
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');
    }

    if (hasDrainageWaterOnRoad) {
      // Both road and drainage details are fully known
      topicStatuses.drainage = 'sufficiently_answered';
      completed.add('A4');
      const nextObj = selectNextTopic('drainage', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `అవునా అండి, రోడ్లు బాగోలేవని, డ్రైనేజీ నీళ్లు రోడ్డుపైకి వస్తున్నాయని అర్థమైంది. ${qText}`;
      } else {
        conversationStatus = 'completed';
        directReply = 'అవునా అండి, రోడ్లు మరియు డ్రైనేజీ సమస్యల గురించి అర్థమైంది. సర్వే పూర్తయింది, ధన్యవాదాలు!';
      }
      pendingFollowUp = null;
    } else {
      // Roads has potholes; drainage was introduced ("drainage water"). Move naturally to clarify drainage water:
      currentTopic = 'drainage';
      currentQId = 'A4';
      topicStatuses.drainage = 'needs_follow_up';
      directReply = 'అవునా అండి, రోడ్లలో గుంతలు ఉన్నాయని, డ్రైనేజీ నీటి సమస్య కూడా ఉందని అర్థమైంది. డ్రైనేజీ నీరు రోడ్డుపైకి వస్తుందా?';
      pendingFollowUp = {
        topic: 'drainage',
        field: 'drainage_overflow',
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add('drainage_overflow');
      conversationStatus = 'waiting_for_follow_up';
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'MULTI_TOPIC_PROBLEM',
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

// 9.1 GOVERNMENT SERVICES
// A9 = Government services question.
// The respondent's actual answer is stored.
// No problem -> move to A10.
// Clear problem -> store it and move to A10.
// Ambiguous answer -> ask one clarification.

if (
  currentTopic === 'government_services' ||
  currentQId === 'A9'
) {

  // ============================================================
  // 1. CLEAR NO-PROBLEM RESPONSE
  // ============================================================

  const governmentNoProblem =
    isBareNo(t) ||
    /^(ఏ సమస్యా లేదు|ఎలాంటి సమస్యా లేదు|ఏ సమస్య లేదు|సమస్య లేదు)$/i.test(t) ||
    /^(em problem ledu|em problem ledhu|problem ledu|problem ledhu|emi problem ledu|emi problem ledhu|no problem|no issues|no issue|nothing)$/i.test(t);

  if (governmentNoProblem) {

    answers['government_services_response'] =
      'no_problem';

    extractedNewAnswers['government_services_response'] =
      'no_problem';

    topicStatuses.government_services =
      'sufficiently_answered';

    completed.add('A9');

    pendingFollowUp = null;

    currentTopic = 'top_priority';
    currentQId = 'A10';

    directReply =
      `అలాగే అండి. ${getQuestionTextForTopic('top_priority')}`;

    conversationStatus = 'active';

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups:
          Array.from(askedFollowUps),
        completed_follow_ups:
          Array.from(completedFollowUps),
        completed_questions:
          Array.from(completed),
        conversation_status:
          conversationStatus,
        updated_at:
          new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

  // ============================================================
  // 2. CLEAR GOVERNMENT SERVICE PROBLEM / FACILITY SUMMARY
  // ============================================================

  const facilityTokens: string[] = [];
  if (/water|నీళ్లు|నీరు|నీటి/i.test(lower)) facilityTokens.push('water');
  if (/roads?|రోడ్లు|రోడ్డు/i.test(lower)) facilityTokens.push('roads');
  if (/drainage|డ్రైనేజీ/i.test(lower)) facilityTokens.push('drainage');
  if (/current|power|electricity|కరెంట్|విద్యుత్/i.test(lower)) facilityTokens.push('electricity');
  if (/waste|garbage|చెత్త/i.test(lower)) facilityTokens.push('waste');

  if (facilityTokens.length > 0) {
    answers['government_services_response'] = facilityTokens;
    extractedNewAnswers['government_services_response'] = facilityTokens;
    topicStatuses.government_services = 'sufficiently_answered';
    completed.add('A9');
    pendingFollowUp = null;
    currentTopic = 'top_priority';
    currentQId = 'A10';
    directReply = `అలాగే అండి. ${getQuestionTextForTopic('top_priority')}`;
    conversationStatus = 'active';
    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

  const governmentProblem =
    /pension|పెన్షన్/i.test(lower) ||
    /ration|రేషన్/i.test(lower) ||
    /certificate|సర్టిఫికేట్|ధృవపత్రం/i.test(lower) ||
    /aadhaar|ఆధార్/i.test(lower) ||
    /documents?|డాక్యుమెంట్లు|పత్రాలు/i.test(lower) ||
    /government office|ప్రభుత్వ కార్యాలయం/i.test(lower) ||
    /official|officer|అధికారి/i.test(lower) ||
    /scheme|స్కీమ్|పథకం/i.test(lower) ||
    /benefit|లబ్ధి|ప్రయోజనం/i.test(lower) ||
    /delay|ఆలస్యం|ఆలస్యం అవుతుంది/i.test(lower) ||
    /bribe|లంచం/i.test(lower) ||
    /application|అప్లికేషన్/i.test(lower) ||
    /service|సేవ|సేవలు/i.test(lower) ||
    /problem|issue|సమస్య/i.test(lower);

  if (governmentProblem) {

    answers['government_services_response'] =
      t;

    extractedNewAnswers['government_services_response'] =
      t;

    topicStatuses.government_services =
      'sufficiently_answered';

    completed.add('A9');

    pendingFollowUp = null;

    currentTopic = 'top_priority';
    currentQId = 'A10';

    directReply =
      `అలాగే అండి. ${getQuestionTextForTopic('top_priority')}`;

    conversationStatus = 'active';

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups:
          Array.from(askedFollowUps),
        completed_follow_ups:
          Array.from(completedFollowUps),
        completed_questions:
          Array.from(completed),
        conversation_status:
          conversationStatus,
        updated_at:
          new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

  // ============================================================
  // 3. CLEAR POSITIVE / NO MAJOR ISSUE
  // ============================================================

  const governmentPositive =
    /^(బాగుంది|బాగానే ఉంది|బాగున్నాయి|బాగానే ఉన్నాయి|సరే|పర్లేదు|అంతా బాగుంది|అంతా బాగానే ఉంది)$/i.test(t) ||
    /^(bagundi|bagane undi|bagunnayi|baganey unnai|baganey vunnai|bagane vunnai|allgood|all good|good|fine|ok|okay|parledu)$/i.test(t);

  if (governmentPositive) {

    answers['government_services_response'] =
      'good';

    extractedNewAnswers['government_services_response'] =
      'good';

    topicStatuses.government_services =
      'sufficiently_answered';

    completed.add('A9');

    pendingFollowUp = null;

    currentTopic = 'top_priority';
    currentQId = 'A10';

    directReply =
      `అలాగే అండి. ${getQuestionTextForTopic('top_priority')}`;

    conversationStatus = 'active';

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups:
          Array.from(askedFollowUps),
        completed_follow_ups:
          Array.from(completedFollowUps),
        completed_questions:
          Array.from(completed),
        conversation_status:
          conversationStatus,
        updated_at:
          new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  }

  // ============================================================
  // 4. AMBIGUOUS RESPONSE
  // ============================================================

  answers['government_services_response'] =
    t;

  extractedNewAnswers['government_services_response'] =
    t;

  topicStatuses.government_services =
    'needs_follow_up';

  directReply =
    'అవునా అండి. ప్రభుత్వ సేవలను పొందడంలో మీకు ప్రధానంగా ఏ సమస్య ఎదురవుతోంది?';

  pendingFollowUp = {
    topic: 'government_services',
    field: 'government_services_clarify',
    question: directReply,
    status: 'waiting_for_answer',
  };

  askedFollowUps.add(
    'government_services_clarify'
  );

  conversationStatus =
    'waiting_for_follow_up';

  return {
    updatedState: {
      ...currentState,
      current_question_id: currentQId,
      current_question_topic: currentTopic,
      topic_statuses: topicStatuses,
      answers,
      pending_follow_up: pendingFollowUp,
      asked_follow_ups:
        Array.from(askedFollowUps),
      completed_follow_ups:
        Array.from(completedFollowUps),
      completed_questions:
        Array.from(completed),
      conversation_status:
        conversationStatus,
      updated_at:
        new Date().toISOString(),
    },
    detectedIntent,
    extractedNewAnswers,
    correctionMade: false,
    alreadyAnsweredRecognized: false,
    directReply,
  };
}
 // ============================================================
// A10 — OVERALL TOP PRIORITY
// ============================================================
// Final question of the survey.
// Detect the actual priority mentioned by the respondent,
// save it, complete A10, and close the survey naturally.

if (
  currentTopic === 'top_priority' ||
  currentQId === 'A10'
) {
  const priorityItems: string[] = [];

  // ------------------------------------------------------------
  // DETECT ROADS
  // ------------------------------------------------------------

  if (
    /roads?|రోడ్లు|రోడ్డు|road condition|potholes?|గుంతలు/i.test(
      lower
    )
  ) {
    priorityItems.push('roads');
    priorityItems.push('రోడ్ల సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT DRAINAGE
  // ------------------------------------------------------------

  if (
    /drainage|డ్రైనేజీ|మురుగు నీరు|కాలువ/i.test(
      lower
    )
  ) {
    priorityItems.push('drainage');
    priorityItems.push('డ్రైనేజీ సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT WATER
  // ------------------------------------------------------------

  if (
    /water|నీళ్లు|నీరు|నీటి|తాగునీరు|తాగునీటి|neellu|neeru|neeti/i.test(
      lower
    )
  ) {
    priorityItems.push('water');
    priorityItems.push('నీటి సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT ELECTRICITY
  // ------------------------------------------------------------

  if (
    /current|power|electricity|విద్యుత్|కరెంట్/i.test(
      lower
    )
  ) {
    priorityItems.push('electricity');
    priorityItems.push('విద్యుత్ సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT HEALTHCARE
  // ------------------------------------------------------------

  if (
    /hospital|health|healthcare|ఆరోగ్యం|ఆరోగ్య|ఆసుపత్రి|వైద్యం/i.test(
      lower
    )
  ) {
    priorityItems.push('ఆరోగ్య సేవల సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT EDUCATION
  // ------------------------------------------------------------

  if (
    /school|education|పాఠశాల|విద్య|చదువు/i.test(
      lower
    )
  ) {
    priorityItems.push('విద్యా సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT PUBLIC TRANSPORT
  // ------------------------------------------------------------

  if (
    /bus|transport|బస్సు|రవాణా|ప్రజా రవాణా/i.test(
      lower
    )
  ) {
    priorityItems.push('ప్రజా రవాణా సమస్య');
  }

  // ------------------------------------------------------------
  // DETECT GARBAGE / SANITATION
  // ------------------------------------------------------------

  if (
    /garbage|waste|చెత్త|పారిశుధ్యం/i.test(
      lower
    )
  ) {
    priorityItems.push('చెత్త మరియు పారిశుధ్య సమస్య');
  }

  // ------------------------------------------------------------
  // SAVE RESPONDENT ANSWER
  // ------------------------------------------------------------

  answers['top_priority'] =
    priorityItems.length > 0
      ? priorityItems
      : [t];

  extractedNewAnswers['top_priority'] =
    answers['top_priority'];

  topicStatuses.top_priority =
    'sufficiently_answered';

  completed.add('A10');

  pendingFollowUp = null;

  conversationStatus =
    'completed';

  // ------------------------------------------------------------
  // NATURAL FINAL RESPONSE
  // ------------------------------------------------------------

  if (priorityItems.length === 1) {

    directReply =
      `అలాగే అండి. ${priorityItems[0]} మీ ప్రధాన సమస్యగా నమోదు చేసుకున్నాను. మీ సమయం ఇచ్చి మీ అభిప్రాయం చెప్పినందుకు చాలా ధన్యవాదాలు అండి.`;

  } else if (priorityItems.length > 1) {

    directReply =
      `అలాగే అండి. మీరు చెప్పిన సమస్యలన్నీ నమోదు చేసుకున్నాను. మీ సమయం ఇచ్చి మీ అభిప్రాయం చెప్పినందుకు చాలా ధన్యవాదాలు అండి.`;

  } else {

    directReply =
      'అలాగే అండి. మీరు చెప్పిన విషయాన్ని నమోదు చేసుకున్నాను. మీ సమయం ఇచ్చి మీ అభిప్రాయం చెప్పినందుకు చాలా ధన్యవాదాలు అండి.';
  }

  // ------------------------------------------------------------
  // RETURN FINAL A10 STATE
  // ------------------------------------------------------------

  return {
    updatedState: {
      ...currentState,

      current_question_id: '',
      current_question_topic: '',

      topic_statuses:
        topicStatuses,

      answers,

      pending_follow_up:
        null,

      asked_follow_ups:
        Array.from(askedFollowUps),

      completed_follow_ups:
        Array.from(completedFollowUps),

      completed_questions:
        Array.from(completed),

      conversation_status:
        'completed',

      updated_at:
        new Date().toISOString(),
    },

    detectedIntent,

    extractedNewAnswers,

    correctionMade:
      false,

    alreadyAnsweredRecognized:
      false,

    directReply,
  };
}
// ============================================================
// 9.3 DRINKING WATER
// ============================================================

// ------------------------------------------------------------
// POSITIVE / GOOD WATER SERVICE
// ------------------------------------------------------------

const isWaterGood =
  /బాగానే\s*(ఉంటది|ఉంటుంది|ఉంది|ఉన్నాయి)|బానే\s*(ఉంది|ఉన్నాయి)|బాగుంది|బాగున్నాయి/i.test(lower) ||
  /bagundhi|bagundi|baane\s*(undhi|vundhi|untadi|undi|vundi|unnai|vunnai|unnayi|vunnayi)|baney\s*(undhi|vundhi|untadi|undi|vundi|unnai|vunnai|unnayi|vunnayi)|baane|baney/i.test(lower) ||
  /పెద్దగా\s*ప్రాబ్లెమ్\s*లేదు|ఎలాంటి\s*సమస్య\s*లేదు|సమస్య\s*లేదు/i.test(lower) ||
  /no\s*problem|no\s*issue|water\s*is\s*good|water\s*baane|all\s*good|allgood/i.test(lower);

// ------------------------------------------------------------
// EXPLICIT WATER PROBLEM
// ------------------------------------------------------------

const isWaterIrregular =
  /సరిగ్గా\s*(రావడం\s*లేదు|రావు|రావట్లేదు|రాదు|ఉండదు)/i.test(lower) ||
  /రోజూ\s*(రావు|రావడం\s*లేదు|రావట్లేదు|రాదు)/i.test(lower) ||
  /నీళ్లు\s*(రావు|రావడం\s*లేదు|రావట్లేదు|రాదు)/i.test(lower) ||
  /బాగోలేదు/i.test(lower) ||
  /problem|irregular|not\s*regular/i.test(lower) ||
  /daily\s*(ravu|ravvu)/i.test(lower) ||
  /sarigga\s*(ravatledu|undadu)/i.test(lower) ||
  /baledhu|baledu|bagaledu|bagoledhu/i.test(lower);

const lowerWithoutDrainage = lower.replace(/డ్రైనేజీ\s*(నీళ్లు|నీరు|నీటి|వాటర్)|drainage\s*(water|neellu|neeru|neeti)/gi, '');

const isWaterAnswer =
  currentTopic === 'drinking_water' ||
  currentQId === 'A1' ||
  /నీళ్లు|నీరు|నీటి|తాగునీరు|water|neellu|neeru|neeti|drinking\s*water/i.test(
    lowerWithoutDrainage
  );

// ------------------------------------------------------------
// RAIN-DEPENDENT WATER
//
// Example:
// "varsham vachinapudu matram water vachestadi"
// "వర్షం వచ్చినప్పుడు మాత్రమే నీళ్లు వస్తాయి"
// ------------------------------------------------------------

const hasRainDependentWater =
  (
    /వర్షం/i.test(lowerWithoutDrainage) &&
    /(నీళ్లు|నీరు|నీటి|water)/i.test(lowerWithoutDrainage)
  ) ||
  (
    /\bvarsham\b/i.test(lowerWithoutDrainage) &&
    /\bwater\b|\bneellu\b|\bneeru\b|\bneeti\b/i.test(lowerWithoutDrainage)
  );

const hasOnlyWhenRainWater =
  (
    /వర్షం.*?(మాత్రమే|అప్పుడు|వచ్చినప్పుడు|పడినప్పుడు)/i.test(lowerWithoutDrainage) &&
    /(నీళ్లు|నీరు|నీటి|water)/i.test(lowerWithoutDrainage)
  ) ||
  (
    /\bvarsham\b.*?\bmatram\b.*?\b(water|neellu|neeru|neeti)\b/i.test(
      lowerWithoutDrainage
    )
  ) ||
  (
    /\b(water|neellu|neeru|neeti)\b.*?\b(varsham|rain)\b.*?\bmatram\b/i.test(
      lowerWithoutDrainage
    )
  );

const isWaterRainDependent =
  hasRainDependentWater || hasOnlyWhenRainWater;

// ------------------------------------------------------------
// SAVE MAIN WATER CONDITION
// ------------------------------------------------------------

if (isWaterRainDependent && isWaterAnswer) {

  answers['water_supply'] = 'irregular';
  answers['water_service'] = 'irregular';
  answers['water_problem'] = 'rain_dependent_supply';

  extractedNewAnswers['water_supply'] = 'irregular';
  extractedNewAnswers['water_service'] = 'irregular';
  extractedNewAnswers['water_problem'] = 'rain_dependent_supply';

  topicStatuses.drinking_water = 'needs_follow_up';

} else if (
  isWaterIrregular &&
  isWaterAnswer &&
  !isWaterGood
) {

  answers['water_supply'] = 'irregular';

  extractedNewAnswers['water_supply'] = 'irregular';

  topicStatuses.drinking_water = 'needs_follow_up';

} else if (
  isWaterGood &&
  isWaterAnswer &&
  !isWaterIrregular &&
  !isWaterRainDependent
) {

  answers['water_service'] = 'good';
  answers['water_problem'] = 'none_reported';
  answers['water_supply'] = 'regular';

  extractedNewAnswers['water_service'] = 'good';
  extractedNewAnswers['water_problem'] = 'none_reported';
  extractedNewAnswers['water_supply'] = 'regular';

  topicStatuses.drinking_water = 'sufficiently_answered';

  completed.add('A1');
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// WATER FREQUENCY
//
// IMPORTANT:
// Keep these meanings separate:
//
// 1. "రోజూ వస్తాయి"
//    "daily vastayi"
//    "every day"
//    -> regular / 7 days per week
//
// 2. "మూడు రోజులకు ఒకసారి వస్తాయి"
//    "3 days ki oka sari vastayi"
//    "three days once"
//    -> once every 3 days
//
// 3. "వారానికి మూడు రోజులు వస్తాయి"
//    "three days per week"
//    -> 3 days per week
//
// These are NOT the same thing.
// ------------------------------------------------------------

const extractedDays = parseNumberFromText(t);

// ------------------------------------------------------------
// DAILY WATER
// ------------------------------------------------------------

const isDailyWater =
  isWaterAnswer &&
  (
    /రోజూ\s*(వస్తాయి|వస్తుంది|వస్తున్నాయి|వస్తోంది|వస్తాయి)/i.test(lower) ||
    /daily\s*(vastai|vastundi|water\s*vastundi|water\s*vastai)/i.test(lower) ||
    /\bevery\s*day\b/i.test(lower) ||
    /\broju\s*roju\b/i.test(lower) ||
    /\brojuki\s*oka\s*sari\b/i.test(lower)
  );

// ------------------------------------------------------------
// ONCE EVERY N DAYS
//
// Examples:
// "మూడు రోజులకు ఒకసారి"
// "3 రోజులకు ఒకసారి"
// "3 days ki oka sari"
// "three days once"
// "ప్రతి మూడు రోజులకు"
// ------------------------------------------------------------

const isEveryNDaysWater =
  isWaterAnswer &&
  (
    /(\d+|ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు)\s*రోజులకు\s*ఒక\s*సారి/i.test(lower) ||
    /(\d+|ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు)\s*రోజులకి\s*ఒక\s*సారి/i.test(lower) ||
    /(\d+)\s*days?\s*ki\s*oka\s*sari/i.test(lower) ||
    /(\d+)\s*days?\s*once/i.test(lower) ||
    /one\s*time\s*every\s*(\d+)\s*days?/i.test(lower) ||
    /every\s*(\d+)\s*days?/i.test(lower) ||
    /ప్రతి\s*(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|\d+)\s*రోజులకు/i.test(lower)
  );

// ------------------------------------------------------------
// DAYS PER WEEK
//
// Examples:
// "వారానికి మూడు రోజులు వస్తాయి"
// "three days per week"
// "వారం లో మూడు రోజులు"
// ------------------------------------------------------------

const isDaysPerWeekWater =
  isWaterAnswer &&
  (
    /వారానికి\s*(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|\d+)\s*రోజు/i.test(lower) ||
    /వారం\s*లో\s*(ఒక|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|\d+)\s*రోజు/i.test(lower) ||
    /(\d+|one|two|three|four|five|six|seven)\s*days?\s*(per|a)\s*week/i.test(lower) ||
    /\bweek\s*lo\s*(\d+|one|two|three|four|five|six|seven)\s*days?/i.test(lower) ||
    /(?:only\s*)?(\d+)\s*days?\s*vastai/i.test(lower) ||
    /(\d+)\s*రోజులు\s*(వస్తాయి|మాత్రమే)/i.test(lower)
  );

// ------------------------------------------------------------
// APPLY FREQUENCY MEANING
// ------------------------------------------------------------

if (isDailyWater) {

  answers['water_frequency_type'] = 'daily';
  answers['water_frequency_days'] = 1;

  answers['water_supply'] = 'regular';
  answers['water_service'] = 'good';
  answers['water_problem'] = 'none_reported';

  answers['water_days_per_week'] = 7;

  extractedNewAnswers['water_frequency_type'] = 'daily';
  extractedNewAnswers['water_frequency_days'] = 1;

  extractedNewAnswers['water_supply'] = 'regular';
  extractedNewAnswers['water_service'] = 'good';
  extractedNewAnswers['water_problem'] = 'none_reported';
  extractedNewAnswers['water_days_per_week'] = 7;

  topicStatuses.drinking_water = 'sufficiently_answered';
  completed.add('A1');

} else if (isEveryNDaysWater && extractedDays !== null) {

  answers['water_frequency_type'] = 'every_n_days';
  answers['water_frequency_days'] = extractedDays;

  answers['water_supply'] = 'irregular';
  answers['water_service'] = 'irregular';
  answers['water_problem'] = 'irregular_supply';

  extractedNewAnswers['water_frequency_type'] = 'every_n_days';
  extractedNewAnswers['water_frequency_days'] = extractedDays;

  extractedNewAnswers['water_supply'] = 'irregular';
  extractedNewAnswers['water_service'] = 'irregular';
  extractedNewAnswers['water_problem'] = 'irregular_supply';

  // Do NOT store this as water_days_per_week.
  topicStatuses.drinking_water = 'needs_follow_up';

} else if (isDaysPerWeekWater && extractedDays !== null) {

  answers['water_frequency_type'] = 'days_per_week';
  answers['water_frequency_days'] = extractedDays;

  answers['water_days_per_week'] = extractedDays;

  answers['water_supply'] = 'irregular';

  extractedNewAnswers['water_frequency_type'] = 'days_per_week';
  extractedNewAnswers['water_frequency_days'] = extractedDays;

  extractedNewAnswers['water_days_per_week'] = extractedDays;
  extractedNewAnswers['water_supply'] = 'irregular';

  topicStatuses.drinking_water = 'needs_follow_up';
}
// ------------------------------------------------------------
// WATER TIMING
// ------------------------------------------------------------

const hasUpfrontTiming =
  isWaterAnswer &&
  (
    /ఉదయం|morning|సాయంత్రం|evening/i.test(lower) &&
    /మాత్రమే|వస్తాయి|వస్తుంది|timing|time/i.test(lower)
  );

if (hasUpfrontTiming) {

  const timeVal =
    /ఉదయం|morning/i.test(lower)
      ? 'morning'
      : 'evening';

  answers['water_timing'] = timeVal;
  answers['water_timing_issue'] = true;

  extractedNewAnswers['water_timing'] = timeVal;
  extractedNewAnswers['water_timing_issue'] = true;

  completedFollowUps.add('water_timing');
}

// ------------------------------------------------------------
// TANKER / TRUCK WATER
//
// Examples:
// "ట్యాంకర్ ద్వారా వస్తాయి"
// "ట్రక్ ద్వారా నీళ్లు వస్తాయి"
// "tanker dwara water vastayi"
// ------------------------------------------------------------

const hasTankerMention =
  /ట్యాంకర్|ట్రక్|వాటర్\s*ట్రక్|tanker|truck|water\s*truck/i.test(
    lower
  );

const hasTankerFrequency =
  /మూడు\s*రోజులకు\s*ఒకసారి|3\s*days\s*ki\s*oka\s*sari|three\s*days\s*once|alternate\s*day/i.test(
    lower
  );

const hasTankerDaily =
  /ట్యాంకర్.*?రోజూ|రోజూ.*?ట్యాంకర్|tanker.*?daily|daily.*?tanker/i.test(
    lower
  );

const hasTankerIrregularTiming =
  /టైమింగ్\s*కూడా\s*ఫిక్స్\s*ఉండదు|టైమింగ్\s*ఫిక్స్\s*ఉండదు|timing\s*fix\s*undadu|no\s*fixed\s*time|irregular\s*timing|ఎప్పుడు\s*వస్తుందో\s*తెలియదు/i.test(
    lower
  );

if (hasTankerMention) {

  answers['water_source'] = 'tanker';
  answers['tanker_dependent'] = true;

  extractedNewAnswers['water_source'] = 'tanker';
  extractedNewAnswers['tanker_dependent'] = true;

  if (hasTankerDaily) {

    answers['tanker_frequency'] = 'daily';

    extractedNewAnswers['tanker_frequency'] = 'daily';

  } else if (hasTankerFrequency) {

    answers['tanker_frequency'] = 'once_every_3_days';

    extractedNewAnswers['tanker_frequency'] =
      'once_every_3_days';
  }

  if (hasTankerIrregularTiming) {

    answers['tanker_timing'] = 'irregular';
    answers['water_timing'] = 'no_fixed_time';

    extractedNewAnswers['tanker_timing'] =
      'irregular';

    extractedNewAnswers['water_timing'] =
      'no_fixed_time';
  }

  // Only complete the water topic when we have enough
  // tanker information.
  if (
    hasTankerFrequency ||
    hasTankerDaily ||
    hasTankerIrregularTiming
  ) {

    topicStatuses.drinking_water =
      'sufficiently_answered';

    completed.add('A1');
  } else {

    topicStatuses.drinking_water =
      'needs_follow_up';
  }
}
  // 9.4 ROADS
  const hasPotholes = /గుంతలు|holes|guntalu|potholes/i.test(lower);
  const hasRainProblem = /వర్షం|వర్షం\s*వస్తే|వర్షం\s*పడినప్పుడు|వర్షం\s*లో|\bvarsham\b|\b(rain|rains|rainy)\b/i.test(lower);
  const hasWaterLogging =
    /నీళ్లు\s*(నిలుస్తాయి|నిలవడం|నిలిచిపోతాయి|ఉండిపోతాయి)|water\s*(nilusthai|nilusthundhi|nilusthundi|nilusthayi|nilusthadhi|vundipothun|undipothun|aagipothun)|\bwaterlogging\b|\bwater\s*logging\b/i.test(
      lower
    );
  const hasAccidents = /యాక్సిడెంట్లు|యాక్సిడెంట్|\baccidents?\b/i.test(lower);
  const hasBadRoads = /బాగోలేవు|పాడైపోయాయి|దారుణంగా|చెత్తగా|baledu|baaledhu|worst|kharab|ebbandi/i.test(lower);
  const hasGoodRoads =
    /రోడ్లు\s*బాగున్నాయి|బాగానే\s*ఉన్నాయి|roads\s*good/i.test(lower) ||
    ((currentTopic === 'roads' || currentQId === 'A2') &&
      /^(బాగుంది|బాగున్నాయి|bagundhi|good)(\s*(అండి|andi))?$/i.test(lower) &&
      !hasBadRoads &&
      !hasPotholes);

  const isRoadContext =
    currentTopic === 'roads' ||
    currentQId === 'A2' ||
    hasPotholes ||
    (/రోడ్ల|రోడ్డు|roads/i.test(lower) && currentTopic !== 'drainage');

  if (isRoadContext && (hasPotholes || (hasRainProblem && currentTopic === 'roads') || hasWaterLogging || hasAccidents || hasBadRoads || (currentTopic === 'roads' && isBareNegative(t)))) {
    answers['roads_condition'] = 'poor';
    extractedNewAnswers['roads_condition'] = 'poor';
    if (hasPotholes) {
      answers['roads_problem'] = 'potholes';
      answers['road_problem'] = 'potholes';
      answers['roads_main_issue'] = 'potholes';
      extractedNewAnswers['roads_problem'] = 'potholes';
      extractedNewAnswers['road_problem'] = 'potholes';
    }
    if (hasRainProblem) {
      answers['rain_related_problem'] = true;
      extractedNewAnswers['rain_related_problem'] = true;
    }
    if (hasWaterLogging) {
      answers['water_logging'] = true;
      extractedNewAnswers['water_logging'] = true;
    }
    if (hasAccidents) {
      answers['safety_concern'] = 'accidents';
      extractedNewAnswers['safety_concern'] = 'accidents';
    }

    // Only if specific details (potholes + rain/accidents/water logging) are present, mark sufficiently answered!
    if (hasPotholes && (hasRainProblem || hasWaterLogging || hasAccidents)) {
      topicStatuses.roads = 'sufficiently_answered';
      completed.add('A2');
    } else if (topicStatuses.roads !== 'sufficiently_answered') {
      topicStatuses.roads = 'needs_follow_up';
    }
  } else if (isRoadContext && hasGoodRoads) {
    answers['roads_condition'] = 'good';
    extractedNewAnswers['roads_condition'] = 'good';
    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');
  }

  // 9.5 ELECTRICITY
  const hasSpontaneousNightPower =
    /night\s*(power|current)|రాత్రి.*?కరెంట్|రాత్రిపూట.*?కరెంట్|power\s*sarig[ag]\s*(vundat|undat)|current\s*sarig[ag]\s*(vundat|undat)/i.test(lower);
  const hasComplaintNoUse =
    /complaint\s*(ichina|ichana|pettina).*?(no\s*use|use\s*ledu|upayogam\s*ledu|labham\s*ledu)/i.test(lower) || /complaint/i.test(lower);

  const hasPowerCuts = hasSpontaneousNightPower || /తరచుగా\s*పోతుంది|కరెంట్\s*పోతుంది|కోతలు|current\s*pothundi|frequent\s*ga\s*pothundi|power\s*cuts/i.test(
    lower
  );
  const hasGoodElectricity =
    /కరెంట్\s*బాగుంది|కోతలు\s*లేవు|power\s*good|no\s*cuts|current\s*baney\s*vundhi|current\s*baane\s*undhi|ledhu\s*current\s*baney|baane\s*(undhi|vundhi|undi)|baney\s*(undhi|vundhi|undi)|బానే\s*ఉంది|బాగానే\s*ఉంది/i.test(
      lower
    ) ||
    ((currentTopic === 'electricity' || currentQId === 'A3') &&
      /^(బాగుంది|bagundhi|good|current\s*baney\s*vundhi|baane\s*undhi|baney\s*vundhi)(\s*(అండి|andi))?$/i.test(lower));

  if (hasSpontaneousNightPower && (currentTopic === 'roads' || currentQId === 'A2')) {
    answers['electricity_status'] = 'night_cuts_inadequate';
    answers['electricity_night_problem'] = true;
    extractedNewAnswers['electricity_status'] = 'night_cuts_inadequate';
    extractedNewAnswers['electricity_night_problem'] = true;
    if (hasComplaintNoUse) {
      answers['complaint_status'] = 'complaint_filed_unresolved';
      extractedNewAnswers['complaint_status'] = 'complaint_filed_unresolved';
    }
    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');

    directReply =
      'అవునా అండి. రాత్రిపూట కరెంట్ సరిగ్గా ఉండట్లేదని, complaint ఇచ్చినా ఉపయోగం లేకపోయిందన్నమాట. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?';

    return {
      updatedState: {
        ...currentState,
        current_question_id: 'A2',
        current_question_topic: 'roads',
        current_topic: 'roads',
        current_question: 'A2',
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: null,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'SPONTANEOUS_TOPIC',
      extractedNewAnswers,
      correctionMade: false,
      alreadyAnsweredRecognized: false,
      directReply,
    };
  } else if (hasPowerCuts) {
    answers['electricity_status'] = 'frequent_cuts';
    extractedNewAnswers['electricity_status'] = 'frequent_cuts';
    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');
  } else if (hasGoodElectricity) {
    answers['electricity_status'] = 'good';
    extractedNewAnswers['electricity_status'] = 'good';
    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');
  } else if (
    topicStatuses.electricity !== 'sufficiently_answered' &&
    ((currentTopic === 'electricity' || currentQId === 'A3') && (isBareNegative(t) || /baledhu|బాగోలేదు/i.test(lower)))
  ) {
    answers['electricity_status'] = 'poor';
    extractedNewAnswers['electricity_status'] = 'poor';
    topicStatuses.electricity = 'needs_follow_up';
  }

  // 9.6 DRAINAGE
  const hasDrainageIssue = /drainage|మురుగు|కాలవ|డ్రైనేజీ/i.test(lower);
  const hasDrainageCleaningIssue =
    /clean\s*(cheyaru|cheyyaru|cheyadam|cheyatam|cheyatledu)|క్లీన్\s*(చేయరు|చేయడం\s*లేదు)|శుభ్రం\s*(చేయరు|చేయడం\s*లేదు)|not\s*clean/i.test(
      lower
    );
  const hasDrainageRainMention = /\b(rain|rains|rainy)\b|\bvarsham\b|వర్షం/i.test(lower);
  const isDrainageWaterOnRoad =
    /water\s*road\s*medha|నీళ్లు\s*రోడ్డుపైకి|road\s*meedaki|రోడ్డుపైకి|road\s*మీదకి|రోడ్డు\s*మీదకి|రోడ్డు\s*పైకి|road\s*medhaki|road\s*medha\s*ki|road\s*meeda|రోడ్డుమీదకి/i.test(
      lower
    ) ||
    (/(water|నీళ్లు|నీరు|road|రోడ్డు).*?(road|రోడ్డు|medha|meed|మీద|పై).*?(vast|వస్తు)/i.test(lower));
  if (
    hasDrainageIssue ||
    isDrainageWaterOnRoad ||
    hasDrainageCleaningIssue ||
    (currentTopic === 'drainage' && (isBareNegative(t) || /baledhu|బాగోలేదు/i.test(lower)))
  ) {
    answers['drainage_condition'] = 'poor';
    extractedNewAnswers['drainage_condition'] = 'poor';

    if (hasDrainageCleaningIssue) {
      answers['drainage_cleaning'] = 'inadequate';
      extractedNewAnswers['drainage_cleaning'] = 'inadequate';
    }
    if (hasDrainageRainMention) {
      answers['rain_condition'] = 'mentioned';
      answers['rain_related_problem'] = true;
      extractedNewAnswers['rain_condition'] = 'mentioned';
      extractedNewAnswers['rain_related_problem'] = true;
    }

    if (isDrainageWaterOnRoad) {
      answers['drainage_water_reaches_road'] = 'yes';
      answers['drainage_problem'] = 'water_on_road';
      answers['drainage_water_problem'] = true;
      extractedNewAnswers['drainage_water_reaches_road'] = 'yes';
      extractedNewAnswers['drainage_problem'] = 'water_on_road';
      extractedNewAnswers['drainage_water_problem'] = true;
      topicStatuses.drainage = 'sufficiently_answered';
      completed.add('A4');
    } else if (hasDrainageCleaningIssue) {
      answers['drainage_problem'] = 'cleaning_issue';
      extractedNewAnswers['drainage_problem'] = 'cleaning_issue';
      topicStatuses.drainage = 'sufficiently_answered';
      completed.add('A4');
    } else if (/బాగుంది|baane|good/i.test(lower) && !isBareNegative(t)) {
      answers['drainage_condition'] = 'good';
      topicStatuses.drainage = 'sufficiently_answered';
      completed.add('A4');
    } else if (topicStatuses.drainage !== 'sufficiently_answered') {
      topicStatuses.drainage = 'needs_follow_up';
    }
  }

  // 9.7 WASTE MANAGEMENT / SANITATION
  const isWasteContext =
    currentTopic === 'waste_management' ||
    currentTopic === 'sanitation' ||
    currentQId === 'A5' ||
    /vallu\s*sari\s*ga\s*raru|చెత్త|పారిశుధ్య|waste|garbage/i.test(lower);

  const hasWasteIrregularPattern =
    isWasteContext &&
    (/మూడు\s*రోజులకు\s*ఒకసారి|3\s*days|ఐదు\s*రోజులు|5\s*days|మూడు\s*నాలుగు\s*రోజులకు|3-4\s*days|రెగ్యులర్\s*గా\s*(రారు|రాదు|తీసుకెళ్లరు)|sari\s*ga\s*raru|vallu\s*sari\s*ga\s*raru/i.test(
      lower
    ) ||
      (/3\s*days|5\s*days/i.test(lower) && !/water|నీళ్లు|నీరు/i.test(lower)));

  const has5DaysDelay = /ఐదు\s*రోజులు|5\s*days|five\s*days/i.test(lower);

  const hasWasteIssue =
    isWasteContext &&
    (hasWasteIrregularPattern ||
      /vallu\s*sari\s*ga\s*raru|చెత్త|సరిగ్గా\s*రారు|waste|garbage|పారిశుధ్య|baledhu|బాగోలేదు/i.test(lower) ||
      isBareNegative(t));

  if (hasWasteIssue) {
    if (hasWasteIrregularPattern) {
      answers['waste_collection_frequency'] = 'irregular';
      answers['waste_management_problem'] = 'irregular_collection';
      answers['waste_management_condition'] = 'poor';
      extractedNewAnswers['waste_collection_frequency'] = 'irregular';
      extractedNewAnswers['waste_management_problem'] = 'irregular_collection';
      if (has5DaysDelay) {
        answers['waste_collection_delay'] = 'up to 5 days';
        extractedNewAnswers['waste_collection_delay'] = 'up to 5 days';
      }
      topicStatuses.waste_management = 'sufficiently_answered';
      completed.add('A5');
    } else if (/బాగుంది|good|daily|రోజూ/i.test(lower) && !isBareNegative(t)) {
      answers['waste_management_condition'] = 'good';
      topicStatuses.waste_management = 'sufficiently_answered';
      completed.add('A5');
    } else if (topicStatuses.waste_management !== 'sufficiently_answered') {
      answers['waste_management_condition'] = 'poor';
      topicStatuses.waste_management = 'needs_follow_up';
    }
  }

  // 9.8 HEALTHCARE
  const hasHospitalMention = /హాస్పిటల్|ఆసుపత్రి|ఆస్పత్రి|hospital/i.test(lower);
  const hasLimitedHospital =
    /ఒక\s*(హాస్పిటల్|ఆసుపత్రి|ఆస్పత్రి|hospital)\s*మాత్రమే|oka\s*hospital\s*matram|ఒక్కటే\s*ఆసుపత్రి|ఒకటే\s*ఆసుపత్రి|ఒక్క\s*ఆసుపత్రి|single\s*hospital|only\s*one\s*hospital|1\s*hospital|hospital\s*matrame/i.test(
      lower
    ) ||
    (/hospital|ఆసుపత్రి|ఆస్పత్రి/i.test(lower) && /(^|\s)(ఒక|oka|one|ఒక్కటే|ఒకటే)(\s|$)/i.test(lower) && /మాత్రమే|matram|matramey|only/i.test(lower)) ||
    (/hospital/i.test(lower) && /oka\s*hospital/i.test(lower));
  const hasFarHospital = /చాలా\s*దూరంగా|దూరం|dooram|far/i.test(lower);
  const hasDoctorsIssue =
    /డాక్టర్లు\s*(సరిగ్గా\s*)?ఉండరు|డాక్టర్లు\s*అందుబాటులో\s*ఉండరు|doctors?\s*(kuda\s*)?(sari\s*ga\s*)?undaru|doctors?\s*not\s*available|డాక్టర్ల\s*కొరత|doctor\s*problem/i.test(
      lower
    );

  if (hasLimitedHospital) {
    answers['hospital_count'] = 'one';
    answers['hospital_availability'] = 'limited';
    answers['healthcare_access'] = 'only_one_hospital';
    answers['healthcare_problem'] = 'only_one_hospital';
    extractedNewAnswers['hospital_count'] = 'one';
    extractedNewAnswers['hospital_availability'] = 'limited';
    extractedNewAnswers['healthcare_access'] = 'only_one_hospital';
    extractedNewAnswers['healthcare_problem'] = 'only_one_hospital';
    if (hasDoctorsIssue) {
      answers['doctors_availability'] = 'unavailable';
      extractedNewAnswers['doctors_availability'] = 'unavailable';
      topicStatuses.healthcare = 'sufficiently_answered';
      completed.add('A6');
    } else {
      topicStatuses.healthcare = 'needs_follow_up';
    }
  } else if (hasHospitalMention) {
    answers['healthcare_access'] = hasFarHospital ? 'far_away' : 'insufficient';
    extractedNewAnswers['healthcare_access'] = answers['healthcare_access'];
    topicStatuses.healthcare = hasFarHospital ? 'sufficiently_answered' : 'needs_follow_up';
    if (hasFarHospital) completed.add('A6');
  } else if (hasDoctorsIssue) {
    answers['healthcare_access'] = 'doctors_unavailable';
    answers['healthcare_problem'] = 'doctors_unavailable';
    extractedNewAnswers['healthcare_access'] = 'doctors_unavailable';
    extractedNewAnswers['healthcare_problem'] = 'doctors_unavailable';
    topicStatuses.healthcare = 'needs_follow_up';
  } else if (currentTopic === 'healthcare' || currentQId === 'A6') {

  // ============================================================
  // HEALTHCARE: CLEAR POSITIVE / NO-PROBLEM ANSWERS
  // ============================================================
  const healthcarePositive =
    /బాగుంది|బాగున్నాయి|బాగానే ఉంది|బాగానే ఉన్నాయి|బానే ఉంది|బానే ఉన్నాయి/i.test(lower) ||
    /bagundi|bagundhi|baganey|bagane|baane|baagaane/i.test(lower) ||
    /good|fine|all\s*good|allgood|no\s*problem|no\s*problems|no\s*issue|no\s*issues/i.test(lower);

  const healthcareNegative =
    /బాగోలేదు|బాలేదు|బావోలేదు/i.test(lower) ||
    /baledhu|baledu|bagaledu|bagoledhu|bagoledhu/i.test(lower) ||
    /problem|issue|సమస్య|ఇబ్బంది/i.test(lower);

  // A positive answer must win over the generic "bare negative"
  // handling. Example:
  // "baganey vunnai"
  // "bagane vunnai"
  // "allgood"
  // "good"
  if (healthcarePositive && !healthcareNegative) {
    answers['healthcare_condition'] = 'good';
    extractedNewAnswers['healthcare_condition'] = 'good';

    topicStatuses.healthcare = 'sufficiently_answered';
    completed.add('A6');

    // If this was a clarification, close it.
    pendingFollowUp = null;
    completedFollowUps.add('healthcare_clarify');

  } else if (
    topicStatuses.healthcare !== 'sufficiently_answered' &&
    (
      healthcareNegative ||
      /బాగోలేదు|బాలేదు/i.test(lower)
    )
  ) {

    answers['healthcare_condition'] = 'poor';
    extractedNewAnswers['healthcare_condition'] = 'poor';

    topicStatuses.healthcare = 'needs_follow_up';
  }
}

  // =========================================================================
  // STEP 10: ACTIVE PENDING FOLLOW-UP RESOLUTION
  // =========================================================================
  if (activeField === 'water_timing') {
    const isTimingIrregular =
      /roju\s*(oka\s*time|okatime)\s*ki\s*(ravvu|ravu|radhu|ledu)|time\s*ki\s*(ravvu|ravu|radhu|ledu)|(ravvu|ravu)\s*(time|timeki)|no\s*fixed\s*time|irregular/i.test(
        lower
      );
    const isTimingProblemMentioned =
      /timing\s*(kuda\s*)?(problem|issue)|time\s*problem|టైమింగ్\s*సమస్య|సమయం\s*సరిగ్గా/i.test(lower);
    const isSpecificHour = lower.match(/(\d{1,2})\s*(am|pm|గంటల|gantalu|o'clock)/i);

    if (isTimingIrregular || isTimingProblemMentioned) {
      const timingVal = isTimingIrregular ? 'no_fixed_time' : 'timing_problem';
      answers['water_timing'] = timingVal;
      answers['water_timing_issue'] = true;
      extractedNewAnswers['water_timing'] = timingVal;
      extractedNewAnswers['water_timing_issue'] = true;

      completedFollowUps.add('water_timing');
      pendingFollowUp = null;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        directReply =
          'సరే అండి, నీటి సమస్య అర్థమైంది. మీ ప్రాంతంలో ఇంకేమైనా ముఖ్యమైన సమస్యలు ఉన్నాయా? రోడ్లు, డ్రైనేజీ, చెత్త సేకరణ లాంటివి ఎలా ఉన్నాయి?';
      }
    } else if (isSpecificHour || /ఉదయం|morning|సాయంత్రం|evening|రాత్రి|night/i.test(lower)) {
      const timeVal = /ఉదయం|morning/i.test(lower) ? 'morning' : 'evening';
      answers['water_timing'] = timeVal;
      answers['water_timing_issue'] = true;
      if (isSpecificHour) answers['water_time'] = isSpecificHour[0];
      extractedNewAnswers['water_timing'] = timeVal;

      completedFollowUps.add('water_timing');
      completedFollowUps.add('water_time');
      pendingFollowUp = null;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `అర్థమైంది అండి. నీటి సమస్య గురించి తెలుసుకున్నాను. ${qText}`;
      }
    } else if (isAffirmativeResponse(lower)) {
      answers['water_timing_issue'] = true;
      extractedNewAnswers['water_timing_issue'] = true;
      completedFollowUps.add('water_timing');

      directReply = 'అవునా అండి. సాధారణంగా ఏ సమయానికి నీళ్లు వస్తాయి?';
      pendingFollowUp = {
        topic: 'drinking_water',
        field: 'water_time',
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add('water_time');
      conversationStatus = 'waiting_for_follow_up';
    } else {
      answers['water_timing_issue'] = false;
      completedFollowUps.add('water_timing');
      pendingFollowUp = null;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `సరే అండి, నీటి సమస్య వివరాలు గుర్తించాను. ${qText}`;
      }
    }

    if (directReply) {
      return {
        updatedState: {
          ...currentState,
          current_question_id: currentQId,
          current_question_topic: currentTopic,
          topic_statuses: topicStatuses,
          answers,
          pending_follow_up: pendingFollowUp,
          asked_follow_ups: Array.from(askedFollowUps),
          completed_follow_ups: Array.from(completedFollowUps),
          completed_questions: Array.from(completed),
          conversation_status: conversationStatus,
          updated_at: new Date().toISOString(),
        },
        detectedIntent,
        extractedNewAnswers,
        correctionMade,
        alreadyAnsweredRecognized,
        directReply,
      };
    }
  } else if (activeField === 'water_time') {
    answers['water_time'] = t;
    extractedNewAnswers['water_time'] = t;
    if (/ఉదయం|morning/i.test(lower)) answers['water_timing'] = 'morning';
    else if (/సాయంత్రం|evening/i.test(lower)) answers['water_timing'] = 'evening';
    else if (/రాత్రి|night/i.test(lower)) answers['water_timing'] = 'night';
    completedFollowUps.add('water_timing');
pendingFollowUp = null;
topicStatuses.drinking_water = 'sufficiently_answered';
completed.add('A1');

const nextObj = selectNextTopic('drinking_water', topicStatuses);
if (nextObj) {
  currentTopic = nextObj.nextTopic;
  currentQId = nextObj.nextQId;
  const qText = getQuestionTextForTopic(currentTopic);
  directReply = `అలాగే అండి. ${qText}`;
}

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'water_supply_problem' || activeField === 'water_main_issue') {
    const days = parseNumberFromText(t);
    const hasDaysMention = days !== null || /రోజులు|days/i.test(t);

    if (hasDaysMention && !answers['water_days_per_week']) {
      const daysCount = days !== null ? days : 3;
      answers['water_days_per_week'] = daysCount;
      answers['water_supply'] = 'irregular';
      extractedNewAnswers['water_days_per_week'] = daysCount;
      extractedNewAnswers['water_supply'] = 'irregular';
      completedFollowUps.add('water_supply_problem');
      completedFollowUps.add('water_frequency');
      pendingFollowUp = null;
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');

      const nextObj = selectNextTopic('drinking_water', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `అలాగే అండి. ${qText}`;
      }
    } else {
      const isAffirm = isAffirmativeResponse(lower) || /supply|సరఫరా|సరిగ్గా|problem/i.test(lower);
      answers['water_main_issue'] = isAffirm ? 'supply' : 'other';
      extractedNewAnswers['water_main_issue'] = answers['water_main_issue'];
      completedFollowUps.add('water_supply_problem');
      completedFollowUps.add('water_main_issue');
      pendingFollowUp = null;

      if (!completedFollowUps.has('water_timing') && !askedFollowUps.has('water_timing') && answers['water_days_per_week']) {
        directReply = 'అర్థమైంది అండి. నీళ్లు వచ్చే రోజుల్లో కూడా timing ఏమైనా ఇబ్బందిగా ఉంటుందా?';
        pendingFollowUp = {
          topic: 'drinking_water',
          field: 'water_timing',
          question: directReply,
          status: 'waiting_for_answer',
        };
        askedFollowUps.add('water_timing');
        conversationStatus = 'waiting_for_follow_up';
      } else {
        topicStatuses.drinking_water = 'sufficiently_answered';
        completed.add('A1');
        const nextObj = selectNextTopic('drinking_water', topicStatuses);
        if (nextObj) {
          currentTopic = nextObj.nextTopic;
          currentQId = nextObj.nextQId;
          const qText = getQuestionTextForTopic(currentTopic);
          directReply = `అలాగే అండి. ${qText}`;
        }
      }
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'water_frequency') {
    completedFollowUps.add('water_frequency');
    pendingFollowUp = null;

    const days = parseNumberFromText(t);
    const daysCount = days !== null ? days : 3;
    answers['water_days_per_week'] = daysCount;
    answers['water_supply'] = 'irregular';
    extractedNewAnswers['water_days_per_week'] = daysCount;

    topicStatuses.drinking_water = 'sufficiently_answered';
    completed.add('A1');

    const nextObj = selectNextTopic('drinking_water', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      const teluguNumberMap: Record<number, string> = {
        1: 'ఒక రోజు',
        2: 'రెండు రోజులు',
        3: 'మూడు రోజులు',
        4: 'నాలుగు రోజులు',
        5: 'ఐదు రోజులు',
        6: 'ఆరు రోజులు',
        7: 'ఏడు రోజులు',
      };
      const daysStr = teluguNumberMap[daysCount] || `${daysCount} రోజులు`;
      directReply = `అర్థమైంది అండి. వారానికి ${daysStr} మాత్రమే నీళ్లు వస్తున్నాయని తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'roads_issue') {
    completedFollowUps.add('roads_issue');
    const hasPotholes = /గుంతలు|holes|guntalu|potholes/i.test(lower);
    const hasRain = /వర్షం|\bvarsham\b|\b(rain|rains|rainy)\b/i.test(lower);
    const hasWaterLogging = /నీళ్లు\s*నిలుస్తాయి|నీళ్లు\s*నిలవడం|నీళ్లు\s*నిలిచిపోతాయి|నీళ్లు\s*ఉండిపోతున్నాయి|water\s*nilusthai|water\s*nilusthundhi|water\s*vundipothunai|water\s*undipothunai|water\s*vundi|\bwaterlogging\b|\bwater\s*logging\b/i.test(lower);
    const hasAccident = /\baccidents?\b|యాక్సిడెంట్/i.test(lower);

    if (hasPotholes) {
      answers['roads_problem'] = 'potholes';
      answers['road_problem'] = 'potholes';
      answers['roads_main_issue'] = 'potholes';
      extractedNewAnswers['roads_problem'] = 'potholes';
      extractedNewAnswers['road_problem'] = 'potholes';
    } else {
      answers['roads_problem'] = t;
      answers['road_problem'] = t;
      extractedNewAnswers['roads_problem'] = t;
      extractedNewAnswers['road_problem'] = t;
    }

    if (hasRain) {
      answers['rain_related_problem'] = true;
      extractedNewAnswers['rain_related_problem'] = true;
    }
    if (hasWaterLogging) {
      answers['water_logging'] = true;
      extractedNewAnswers['water_logging'] = true;
    }
    if (hasAccident) {
      answers['safety_concern'] = 'accidents';
      extractedNewAnswers['safety_concern'] = 'accidents';
    }

    // If pothole alone, ask rain follow up (Section 9 & 16)
    if (hasPotholes && !hasRain && !hasWaterLogging && !hasAccident && !askedFollowUps.has('roads_rain_issue')) {
      directReply = 'అవునా అండి. వర్షం పడినప్పుడు కూడా ఈ గుంతల వల్ల ఇబ్బంది అవుతుందా?';
      pendingFollowUp = {
        topic: 'roads',
        field: 'roads_rain_issue',
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add('roads_rain_issue');
      conversationStatus = 'waiting_for_follow_up';
    } else {
      pendingFollowUp = null;
      topicStatuses.roads = 'sufficiently_answered';
      completed.add('A2');

      const nextObj = selectNextTopic('roads', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);

             let ack = 'అవునా అండి.';
        if (hasPotholes && (hasWaterLogging || hasRain) && hasAccident) {
          ack = 'అలాగే అండి, గుంతల వల్ల వర్షం సమయంలో నీళ్లు నిలవడంతో పాటు యాక్సిడెంట్లు కూడా అవుతున్నాయన్నమాట.';
        } else if (hasPotholes && hasRain && hasWaterLogging) {
          ack = 'అలాగే అండి, గుంతల వల్ల వర్షం సమయంలో నీళ్లు నిలుస్తున్నాయన్నమాట.';
        } else if (hasPotholes && hasWaterLogging) {
          ack = 'అలాగే అండి, గుంతల వల్ల నీళ్లు నిలుస్తున్నాయన్నమాట.';
        } else if (hasPotholes && hasRain) {
          ack = 'అలాగే అండి, వర్షం సమయంలో గుంతల వల్ల ఇబ్బంది అవుతోందన్నమాట.';
        } else if (hasPotholes && hasAccident) {
          ack = 'అలాగే అండి, గుంతల వల్ల యాక్సిడెంట్లు కూడా అవుతున్నాయన్నమాట.';
        } else if (hasPotholes) {
          ack = 'అలాగే అండి, రోడ్లలో గుంతల సమస్య ఉందన్నమాట.';
        }

        directReply = `${ack} ${qText}`;
      }
    }
    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'drainage_overflow') {
    completedFollowUps.add('drainage_overflow');
    pendingFollowUp = null;
    const isAffirm = isAffirmativeResponse(lower) || /vastundi|vastai|road|meedaki|రోడ్డుపైకి|అవును/i.test(lower);
    if (isAffirm) {
      answers['drainage_problem'] = 'water_on_road';
      extractedNewAnswers['drainage_problem'] = 'water_on_road';
    } else {
      answers['drainage_problem'] = 'drainage_water_no_overflow';
      extractedNewAnswers['drainage_problem'] = 'drainage_water_no_overflow';
    }
    topicStatuses.drainage = 'sufficiently_answered';
    completed.add('A4');

    const nextObj = selectNextTopic('drainage', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      if (isAffirm) {
        directReply = `అర్థమైంది అండి. డ్రైనేజీ నీళ్లు రోడ్డుపైకి వస్తున్నాయని తెలుసుకున్నాను. ${qText}`;
      } else {
        directReply = `సరే అండి, డ్రైనేజీ సమస్య గురించి తెలుసుకున్నాను. ${qText}`;
      }
    } else {
      conversationStatus = 'completed';
      directReply = 'ధన్యవాదాలు అండి, మీ ప్రాంత సమస్యల వివరాలు నమోదు చేసుకున్నాను.';
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'roads_rain_issue') {
    completedFollowUps.add('roads_rain_issue');
    pendingFollowUp = null;
    const isAffirm = isAffirmativeResponse(lower) || /వర్షం|varsham|ibbandi|ఇబ్బంది|water|నీళ్లు/i.test(lower);
    answers['rain_related_problem'] = isAffirm;
    extractedNewAnswers['rain_related_problem'] = isAffirm;
    if (/water\s*nilusthundhi|water\s*nilusthai|నీళ్లు\s*నిలుస్తాయి/i.test(lower)) {
      answers['water_logging'] = true;
      extractedNewAnswers['water_logging'] = true;
    }

    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');

    const nextObj = selectNextTopic('roads', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      if (isAffirm) {
        directReply = `అవునా అండి, గుంతల వల్ల వర్షం సమయంలో నీళ్లు నిలుస్తున్నాయని అర్థమైంది. ${qText}`;
      } else {
        directReply = `సరే అండి, వివరాలు తెలుసుకున్నాను. ${qText}`;
      }
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'roads_defect_detail') {
    completedFollowUps.add('roads_defect_detail');
    pendingFollowUp = null;
    answers['roads_defect_detail'] = t;
    extractedNewAnswers['roads_defect_detail'] = t;
    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');

    const nextObj = selectNextTopic('roads', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `అర్థమైంది అండి. రోడ్ల సమస్య గురించి తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'electricity_issue') {
    completedFollowUps.add('electricity_issue');
    pendingFollowUp = null;
    const hasPowerCuts = /కోతలు|cuts|cut|పోతుంది|frequent/i.test(lower);
    answers['electricity_status'] = hasPowerCuts ? 'frequent_cuts' : 'power_issues';
    answers['electricity_problem'] = t;
    extractedNewAnswers['electricity_problem'] = t;

    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');

    const nextObj = selectNextTopic('electricity', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `అర్థమైంది అండి. కరెంట్ సరఫరా సమస్యలను తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'drainage_issue') {
    completedFollowUps.add('drainage_issue');
    pendingFollowUp = null;
    answers['drainage_problem'] = t;
    extractedNewAnswers['drainage_problem'] = t;

    topicStatuses.drainage = 'sufficiently_answered';
    completed.add('A4');

    const nextObj = selectNextTopic('drainage', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `అర్థమైంది అండి. డ్రైనేజీ సమస్య వివరాలు తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'waste_issue') {
    completedFollowUps.add('waste_issue');
    pendingFollowUp = null;
    answers['waste_management_problem'] = t;
    extractedNewAnswers['waste_management_problem'] = t;

    const has5DaysDelay = /ఐదు\s*రోజులు|5\s*days|five\s*days/i.test(lower);
    if (/3\s*days|5\s*days|irregular|రారు/i.test(lower)) {
      answers['waste_collection_frequency'] = 'irregular';
      extractedNewAnswers['waste_collection_frequency'] = 'irregular';
      if (has5DaysDelay) {
        answers['waste_collection_delay'] = 'up to 5 days';
        extractedNewAnswers['waste_collection_delay'] = 'up to 5 days';
      }
    }

    topicStatuses.waste_management = 'sufficiently_answered';
    completed.add('A5');

    const nextObj = selectNextTopic('waste_management', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      if (answers['waste_collection_frequency']) {
        directReply = `అర్థమైంది అండి, చెత్త సేకరణ రెగ్యులర్గా లేకపోవడం సమస్యగా ఉందని చెప్పారు. ${qText}`;
      } else {
        directReply = `సరే అండి, చెత్త సేకరణ సమస్యల గురించి అర్థమైంది. ${qText}`;
      }
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'healthcare_doctors_availability') {
    completedFollowUps.add('healthcare_doctors_availability');
    const hasDoctorIssue =
      /సమస్య|problem|issue|undaru|ఉండరు|లేరు|leru|sarigga\s*undaru|avunu|అవును|haa|yes|undi|ఉంది|rare|matrame/i.test(lower);
    const hasDoctorGood =
      /బాగుంది|good|untaru|ఉంటారు|no\s*problem|ledu|లేదు|పర్లేదు/i.test(lower) && !hasDoctorIssue;

    if (hasDoctorIssue) {
      answers['doctors_availability'] = 'unavailable';
      extractedNewAnswers['doctors_availability'] = 'unavailable';
    } else if (hasDoctorGood) {
      answers['doctors_availability'] = 'available';
      extractedNewAnswers['doctors_availability'] = 'available';
    } else {
      answers['doctors_availability'] = t;
      extractedNewAnswers['doctors_availability'] = t;
    }

    pendingFollowUp = null;
    topicStatuses.healthcare = 'sufficiently_answered';
    completed.add('A6');

    const nextObj = selectNextTopic('healthcare', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      if (answers['doctors_availability'] === 'unavailable') {
        directReply = `సరే అండి, డాక్టర్ల లభ్యత కూడా సమస్యగా ఉందని అర్థమైంది. ${qText}`;
      } else {
        directReply = `సరే అండి. ${qText}`;
      }
    } else {
      conversationStatus = 'completed';
      directReply = 'ధన్యవాదాలు అండి!';
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent: 'FOLLOW_UP_ANSWER',
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'healthcare_issue') {
    completedFollowUps.add('healthcare_issue');
    const hasDoctorsIssue =
      /డాక్టర్లు\s*సరిగ్గా\s*ఉండరు|డాక్టర్లు\s*ఉండరు|డాక్టర్లు\s*అందుబాటులో\s*ఉండరు|doctor\s*undaru|doctor\s*sari\s*ga\s*undaru|doctors\s*not\s*available/i.test(
        lower
      );

    if (hasDoctorsIssue && !askedFollowUps.has('healthcare_medicines')) {
      answers['healthcare_access'] = 'doctors_unavailable';
      answers['healthcare_problem'] = 'doctors_unavailable';
      extractedNewAnswers['healthcare_access'] = 'doctors_unavailable';
      extractedNewAnswers['healthcare_problem'] = 'doctors_unavailable';
      directReply =
        'అవునా అండి, డాక్టర్లు అందుబాటులో ఉండటం సమస్యగా ఉందని అర్థమైంది. మరి అక్కడ మందులు లేదా ఇతర ఆరోగ్య సేవల విషయంలో కూడా ఏమైనా ఇబ్బంది ఉందా?';
      pendingFollowUp = {
        topic: 'healthcare',
        field: 'healthcare_medicines',
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add('healthcare_medicines');
      conversationStatus = 'waiting_for_follow_up';
    } else {
      pendingFollowUp = null;
      answers['healthcare_problem'] = t;
      extractedNewAnswers['healthcare_problem'] = t;

      topicStatuses.healthcare = 'sufficiently_answered';
      completed.add('A6');

      const nextObj = selectNextTopic('healthcare', topicStatuses);
      if (nextObj) {
        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;
        const qText = getQuestionTextForTopic(currentTopic);
        directReply = `అర్థమైంది అండి, ఆరోగ్య సేవల సమస్యల గురించి అర్థమైంది. ${qText}`;
      }
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'healthcare_medicines') {
    completedFollowUps.add('healthcare_medicines');
    pendingFollowUp = null;
    answers['healthcare_medicines'] = t;
    extractedNewAnswers['healthcare_medicines'] = t;

    topicStatuses.healthcare = 'sufficiently_answered';
    completed.add('A6');

    const nextObj = selectNextTopic('healthcare', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `సరే అండి, వివరాలు తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'education_issue') {
    completedFollowUps.add('education_issue');
    pendingFollowUp = null;
    answers['education_problem'] = t;
    extractedNewAnswers['education_problem'] = t;

    topicStatuses.education = 'sufficiently_answered';
    completed.add('A7');

    const nextObj = selectNextTopic('education', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `అర్థమైంది అండి. విద్యా సదుపాయాల వివరాలు తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  } else if (activeField === 'transport_issue') {
    completedFollowUps.add('transport_issue');
    pendingFollowUp = null;
    answers['public_transport_problem'] = t;
    extractedNewAnswers['public_transport_problem'] = t;

    topicStatuses.public_transport = 'sufficiently_answered';
    completed.add('A8');

    const nextObj = selectNextTopic('public_transport', topicStatuses);
    if (nextObj) {
      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;
      const qText = getQuestionTextForTopic(currentTopic);
      directReply = `సరే అండి. ప్రజా రవాణా వివరాలు తెలుసుకున్నాను. ${qText}`;
    }

    return {
      updatedState: {
        ...currentState,
        current_question_id: currentQId,
        current_question_topic: currentTopic,
        topic_statuses: topicStatuses,
        answers,
        pending_follow_up: pendingFollowUp,
        asked_follow_ups: Array.from(askedFollowUps),
        completed_follow_ups: Array.from(completedFollowUps),
        completed_questions: Array.from(completed),
        conversation_status: conversationStatus,
        updated_at: new Date().toISOString(),
      },
      detectedIntent,
      extractedNewAnswers,
      correctionMade,
      alreadyAnsweredRecognized,
      directReply,
    };
  }

  // =========================================================================
  // STEP 11: DYNAMIC NEXT QUESTION SELECTION (SEMANTIC TOPIC PRIORITIZATION)
  // =========================================================================

  // 11.1 RESPONDENT INTRODUCED HEALTHCARE (Section 9 & Section 21)
  if (
    (currentTopic === 'drinking_water' || currentQId === 'A1') &&
    answers['healthcare_access'] &&
    topicStatuses.healthcare !== 'sufficiently_answered'
  ) {
    topicStatuses.drinking_water = 'sufficiently_answered';
    completed.add('A1');
    currentTopic = 'healthcare';
    currentQId = 'A6';
    directReply =
      'సరే అండి, నీటి సమస్య లేదన్నమాట. హాస్పిటల్ దూరంగా ఉందన్నారు కదా. ఆరోగ్య సేవల విషయంలో మీకు ప్రధానంగా అదే సమస్యగా ఉందా?';
    pendingFollowUp = {
      topic: 'healthcare',
      field: 'healthcare_details',
      question: directReply,
      status: 'waiting_for_answer',
    };
  }

  // 11.2 MULTIPLE TOPICS IN ONE SENTENCE: ROADS + ELECTRICITY (Test 5)
  else if (
    (currentTopic === 'drinking_water' || currentQId === 'A1') &&
    answers['roads_condition'] === 'poor' &&
    answers['electricity_status'] === 'frequent_cuts'
  ) {
    topicStatuses.drinking_water = 'sufficiently_answered';
    completed.add('A1');
    currentTopic = 'roads';
    currentQId = 'A2';
    directReply =
      'సరే అండి, నీటి సమస్య లేదని, రోడ్లు బాగోలేవని మరియు కరెంట్ తరచుగా పోతుందని చెప్పారు. రోడ్లలో ప్రధానంగా గుంతల సమస్య ఉందా అండి?';
    pendingFollowUp = {
      topic: 'roads',
      field: 'roads_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };
    askedFollowUps.add('roads_issue');
    conversationStatus = 'waiting_for_follow_up';
  }

 // 11.3 RESPONDENT INTRODUCED ROADS
// Only switch from WATER to ROADS when the CURRENT respondent message
// clearly contains road-related information.
//
// IMPORTANT:
// Do not use old/stored roads_condition alone.
// This prevents an old road problem from hijacking a new water answer.

else if (
  (currentTopic === 'drinking_water' || currentQId === 'A1') &&
  topicStatuses.roads !== 'sufficiently_answered' &&
  (
    /రోడ్లు|రోడ్డు|roads?|potholes?|గుంతలు|గుంత|guntalu/i.test(lower) ||
    /రోడ్లు\s*(బాగోలేవు|బాగాలేవు|పాడైపోయాయి|చెత్తగా|దారుణంగా)/i.test(lower)
  ) &&
  !(
    /నీళ్లు|నీరు|నీటి|water|neellu|neeru|neeti|వర్షం|varsham|rain/i.test(lower) &&
    !/రోడ్లు|రోడ్డు|roads?|potholes?|గుంతలు|గుంత|guntalu/i.test(lower)
  )
) {
  topicStatuses.drinking_water = 'sufficiently_answered';
  completed.add('A1');

  currentTopic = 'roads';
  currentQId = 'A2';

  directReply =
    'సరే అండి. రోడ్ల పరిస్థితి గురించి చెప్పారు. రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?';

  pendingFollowUp = {
    topic: 'roads',
    field: 'roads_issue',
    question: directReply,
    status: 'waiting_for_answer',
  };

  askedFollowUps.add('roads_issue');
  conversationStatus = 'waiting_for_follow_up';
}


 // 11.4 WATER WAS THE CURRENT TOPIC
else if (currentTopic === 'drinking_water' || currentQId === 'A1') {

  // ============================================================
  // 1. WATER IS GOOD / NO PROBLEM
  // ============================================================

  if (
    answers['water_service'] === 'good' ||
    answers['water_problem'] === 'none_reported' ||
    answers['water_frequency_type'] === 'daily'
  ) {

    topicStatuses.drinking_water = 'sufficiently_answered';
    completed.add('A1');
    pendingFollowUp = null;

    const nextObj = selectNextTopic('drinking_water', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText = getQuestionTextForTopic(currentTopic);

      let waterInfo =
        'సరే అండి. నీటి సౌకర్యం బాగానే ఉందని తెలుసుకున్నాను.';

      if (answers['water_frequency_type'] === 'daily') {
        waterInfo =
          'సరే అండి. రోజూ నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.';
      }

      directReply = `${waterInfo} ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'సరే అండి. నీటి సౌకర్యం బాగానే ఉందని తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. మీ సమయం కేటాయించినందుకు ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. TANKER / TRUCK WATER
  // ============================================================

  else if (answers['water_source'] === 'tanker') {

    // Frequency already known
    if (
      answers['tanker_frequency'] ||
      answers['water_frequency_type'] ||
      answers['water_days_per_week']
    ) {

      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');
      pendingFollowUp = null;

      const nextObj =
        selectNextTopic('drinking_water', topicStatuses);

      let tankerInfo =
        'ట్యాంకర్ ద్వారా నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.';

      if (
        answers['tanker_frequency'] === 'once_every_3_days'
      ) {

        tankerInfo =
          'ట్యాంకర్ ద్వారా మూడు రోజులకు ఒకసారి నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.';

      } else if (
        answers['tanker_frequency'] === 'daily' ||
        answers['water_frequency_type'] === 'daily'
      ) {

        tankerInfo =
          'ట్యాంకర్ ద్వారా రోజూ నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.';

      } else if (
        answers['water_frequency_type'] === 'every_n_days' &&
        answers['water_frequency_days']
      ) {

        const days = Number(
          answers['water_frequency_days']
        );

        const teluguNumberMap: Record<number, string> = {
          1: 'ఒక',
          2: 'రెండు',
          3: 'మూడు',
          4: 'నాలుగు',
          5: 'ఐదు',
          6: 'ఆరు',
          7: 'ఏడు',
        };

        const daysText =
          teluguNumberMap[days] || `${days}`;

        tankerInfo =
          `ట్యాంకర్ ద్వారా ${daysText} రోజులకు ఒకసారి నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.`;

      } else if (
        answers['water_frequency_type'] === 'days_per_week' &&
        answers['water_frequency_days']
      ) {

        const days = Number(
          answers['water_frequency_days']
        );

        const teluguNumberMap: Record<number, string> = {
          1: 'ఒక',
          2: 'రెండు',
          3: 'మూడు',
          4: 'నాలుగు',
          5: 'ఐదు',
          6: 'ఆరు',
          7: 'ఏడు',
        };

        const daysText =
          teluguNumberMap[days] || `${days}`;

        tankerInfo =
          `ట్యాంకర్ ద్వారా వారానికి ${daysText} రోజులు నీళ్లు వస్తున్నాయని తెలుసుకున్నాను.`;
      }

      if (
        answers['tanker_timing'] === 'irregular'
      ) {

        tankerInfo +=
          ' ట్యాంకర్ టైమింగ్ కూడా ఫిక్స్‌గా ఉండదని చెప్పారు.';
      }

      if (nextObj) {

        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;

        const qText =
          getQuestionTextForTopic(currentTopic);

        directReply =
          `${tankerInfo} ${qText}`;

      } else {

        conversationStatus = 'completed';

        directReply =
          `${tankerInfo} సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.`;
      }

    } else {

      directReply =
        'అర్థమైంది అండి. ట్యాంకర్ ద్వారా నీళ్లు వస్తున్నాయి. సాధారణంగా ఎన్ని రోజులకు ఒకసారి ట్యాంకర్ వస్తుంది?';

      pendingFollowUp = {
        topic: 'drinking_water',
        field: 'tanker_frequency',
        question: directReply,
        status: 'waiting_for_answer',
      };

      askedFollowUps.add('tanker_frequency');

      conversationStatus = 'waiting_for_follow_up';
    }
  }

  // ============================================================
  // 3. ONCE EVERY N DAYS
  // Example:
  // "మూడు రోజులకు ఒకసారి"
  // ============================================================

  else if (
    answers['water_frequency_type'] === 'every_n_days' &&
    answers['water_frequency_days']
  ) {

    topicStatuses.drinking_water = 'sufficiently_answered';
    completed.add('A1');
    pendingFollowUp = null;

    const days = Number(
      answers['water_frequency_days']
    );

    const teluguNumberMap: Record<number, string> = {
      1: 'ఒక',
      2: 'రెండు',
      3: 'మూడు',
      4: 'నాలుగు',
      5: 'ఐదు',
      6: 'ఆరు',
      7: 'ఏడు',
    };

    const daysText =
      teluguNumberMap[days] || `${days}`;

    const nextObj =
      selectNextTopic('drinking_water', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అర్థమైంది అండి. ${daysText} రోజులకు ఒకసారి నీళ్లు వస్తున్నాయని తెలుసుకున్నాను. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        `అర్థమైంది అండి. ${daysText} రోజులకు ఒకసారి నీళ్లు వస్తున్నాయని తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.`;
    }
  }

  // ============================================================
  // 4. DAYS PER WEEK
  // Example:
  // "వారానికి మూడు రోజులు"
  // ============================================================

  else if (
    answers['water_frequency_type'] === 'days_per_week' &&
    answers['water_frequency_days']
  ) {

    const days = Number(
      answers['water_frequency_days']
    );

    const teluguNumberMap: Record<number, string> = {
      1: 'ఒక',
      2: 'రెండు',
      3: 'మూడు',
      4: 'నాలుగు',
      5: 'ఐదు',
      6: 'ఆరు',
      7: 'ఏడు',
    };

    const daysText =
      teluguNumberMap[days] || `${days}`;

    if (answers['water_supply'] === 'irregular' && !answers['water_main_issue']) {
      directReply = `అర్థమైంది అండి. నీటి సరఫరా సరిగ్గా ఉండదా?`;
      pendingFollowUp = {
        topic: 'drinking_water',
        field: 'water_main_issue',
        question: directReply,
        status: 'waiting_for_answer',
      };
      askedFollowUps.add('water_main_issue');
      conversationStatus = 'waiting_for_follow_up';
      topicStatuses.drinking_water = 'needs_follow_up';
    } else {
      topicStatuses.drinking_water = 'sufficiently_answered';
      completed.add('A1');
      pendingFollowUp = null;

      const nextObj =
        selectNextTopic('drinking_water', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అర్థమైంది అండి. వారానికి ${daysText} రోజులు నీళ్లు వస్తున్నాయని తెలుసుకున్నాను. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        `అర్థమైంది అండి. వారానికి ${daysText} రోజులు నీళ్లు వస్తున్నాయని తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.`;
    }
  }
}

  // ============================================================
  // 5. IRREGULAR WATER WITHOUT FREQUENCY
  // ============================================================

  else if (
    answers['water_supply'] === 'irregular' ||
    answers['water_problem'] === 'rain_dependent_supply'
  ) {

    directReply =
      'అవునా అండి. సాధారణంగా ఎన్ని రోజులకు ఒకసారి నీళ్లు వస్తాయి?';

    pendingFollowUp = {
      topic: 'drinking_water',
      field: 'water_frequency',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('water_frequency');

    conversationStatus = 'waiting_for_follow_up';
  }

  // ============================================================
  // 6. WATER INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.drinking_water =
      'sufficiently_answered';

    completed.add('A1');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('drinking_water', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `సరే అండి. నీటి సౌకర్యం గురించి తెలుసుకున్నాను. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'సరే అండి. నీటి సౌకర్యం గురించి తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. మీ సమయం కేటాయించినందుకు ధన్యవాదాలు.';
    }
  }
}
// 11.5 ROADS WAS THE CURRENT TOPIC
else if (currentTopic === 'roads' || currentQId === 'A2') {

  // ============================================================
  // 1. ROADS ARE GOOD / NO PROBLEM
  // ============================================================

  if (
    answers['roads_condition'] === 'good' ||
    (
      isBareNo(t) &&
      !answers['roads_problem'] &&
      !answers['rain_related_problem'] &&
      !answers['water_logging'] &&
      !answers['safety_concern']
    )
  ) {

    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');
    pendingFollowUp = null;

    const nextObj = selectNextTopic('roads', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `సరే అండి. రోడ్ల పరిస్థితి బాగానే ఉందని తెలుసుకున్నాను. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'సరే అండి. రోడ్ల పరిస్థితి బాగానే ఉందని తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. FULL ROAD PROBLEM DETAILS ALREADY KNOWN
  // ============================================================

  else if (
    answers['roads_problem'] === 'potholes' &&
    (
      answers['rain_related_problem'] ||
      answers['safety_concern'] ||
      answers['water_logging']
    )
  ) {

    topicStatuses.roads = 'sufficiently_answered';
    completed.add('A2');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('roads', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      const hasRainDetail =
        answers['rain_related_problem'] === true;

      const hasWaterLogDetail =
        answers['water_logging'] === true;

      const hasAccidentDetail =
        !!answers['safety_concern'];

      let ack =
        'అవునా అండి, రోడ్ల సమస్య గురించి అర్థమైంది.';

      if (
        (hasWaterLogDetail || hasRainDetail) &&
        hasAccidentDetail
      ) {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల వల్ల వర్షం సమయంలో ఇబ్బంది అవుతోందని, యాక్సిడెంట్లు కూడా జరుగుతున్నాయని అర్థమైంది.';

      } else if (
        hasWaterLogDetail &&
        hasRainDetail
      ) {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల వల్ల వర్షం వచ్చినప్పుడు నీళ్లు నిలిచిపోతున్నాయని అర్థమైంది.';

      } else if (hasWaterLogDetail) {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల వల్ల నీళ్లు నిలుస్తున్నాయని అర్థమైంది.';

      } else if (hasRainDetail) {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల వల్ల వర్షం సమయంలో ఇబ్బంది అవుతోందని అర్థమైంది.';

      } else if (hasAccidentDetail) {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల వల్ల యాక్సిడెంట్లు కూడా జరుగుతున్నాయని అర్థమైంది.';

      } else {

        ack =
          'అవునా అండి, రోడ్లలో గుంతల సమస్య ఉందని అర్థమైంది.';
      }

      directReply =
        `${ack} ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'అవునా అండి, రోడ్ల సమస్య గురించి అర్థమైంది. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 3. RAIN / WATER LOGGING MENTIONED
  // BUT EXACT ROAD PROBLEM IS NOT KNOWN
  // ============================================================

  else if (
    answers['rain_related_problem'] &&
    !answers['roads_problem']
  ) {

    directReply =
      'అవునా అండి. రోడ్లలో గుంతలు, నీళ్లు నిలవడం లాంటి సమస్య ఉందా, లేక ఇంకేదైనా ఇబ్బందా?';

    pendingFollowUp = {
      topic: 'roads',
      field: 'roads_defect_detail',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('roads_defect_detail');

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 4. POTHOLES ONLY
  // ASK ONE RELEVANT FOLLOW-UP
  // ============================================================

  else if (
    answers['roads_problem'] === 'potholes' &&
    !answers['rain_related_problem'] &&
    !answers['water_logging'] &&
    !answers['safety_concern'] &&
    !askedFollowUps.has('roads_rain_issue')
  ) {

    directReply =
      'అవునా అండి. వర్షం పడినప్పుడు కూడా ఈ గుంతల వల్ల ఇబ్బంది అవుతుందా?';

    pendingFollowUp = {
      topic: 'roads',
      field: 'roads_rain_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('roads_rain_issue');

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 5. ROAD PROBLEM EXISTS BUT DETAILS ARE MISSING
  // ============================================================

  else if (
    answers['roads_condition'] === 'poor' ||
    topicStatuses.roads === 'needs_follow_up'
  ) {

    directReply =
      'అవునా అండి. రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?';

    pendingFollowUp = {
      topic: 'roads',
      field: 'roads_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('roads_issue');

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 6. ROAD INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.roads =
      'sufficiently_answered';

    completed.add('A2');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('roads', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `సరే అండి. రోడ్ల పరిస్థితి గురించి తెలుసుకున్నాను. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'సరే అండి. రోడ్ల పరిస్థితి గురించి తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}

 // 11.6 ELECTRICITY WAS THE CURRENT TOPIC
else if (currentTopic === 'electricity' || currentQId === 'A3') {

  // ============================================================
  // 1. ELECTRICITY IS GOOD / NO PROBLEM
  // ============================================================

  if (
    answers['electricity_status'] === 'good' ||
    (
      isBareNo(t) &&
      !answers['electricity_issue']
    )
  ) {

    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('electricity', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. FREQUENT POWER CUTS / CLEAR PROBLEM
  // ============================================================

  else if (
    answers['electricity_status'] === 'frequent_cuts' ||
    answers['electricity_issue'] === 'frequent_cuts'
  ) {

    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('electricity', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 3. ELECTRICITY PROBLEM IS CLEAR
  // ============================================================

  else if (
    answers['electricity_status'] === 'poor' ||
    (
      answers['electricity_issue'] &&
      !isBareNo(String(answers['electricity_issue']))
    )
  ) {

    topicStatuses.electricity = 'sufficiently_answered';
    completed.add('A3');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('electricity', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 4. CLEAR NEGATIVE / PROBLEM BUT DETAILS MISSING
  // ============================================================

  else if (
    topicStatuses.electricity === 'needs_follow_up' ||
    answers['electricity_status'] === 'poor' ||
    isBareNegative(t)
  ) {

    directReply =
      'అవునా అండి. కరెంట్లో ప్రధానంగా ఏ ఇబ్బంది వస్తోంది?';

    pendingFollowUp = {
      topic: 'electricity',
      field: 'electricity_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('electricity_issue');

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 5. ELECTRICITY INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.electricity =
      'sufficiently_answered';

    completed.add('A3');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('electricity', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}
  // 11.7 DRAINAGE WAS THE CURRENT TOPIC
else if (currentTopic === 'drainage' || currentQId === 'A4') {

  // ============================================================
  // 1. DRAINAGE IS GOOD / NO PROBLEM
  // ============================================================

  if (
    answers['drainage_condition'] === 'good' ||
    (
      isBareNo(t) &&
      !answers['drainage_problem'] &&
      !answers['drainage_cleaning'] &&
      !answers['drainage_water_reaches_road']
    )
  ) {

    topicStatuses.draining = 'sufficiently_answered';
    topicStatuses.drainage = 'sufficiently_answered';

    completed.add('A4');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('drainage', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
  `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'సరే అండి. డ్రైనేజీ పరిస్థితి బాగానే ఉందని తెలుసుకున్నాను. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

 // ============================================================
// 2. DRAINAGE WATER REACHES ROAD
// ============================================================

else if (
  answers['drainage_problem'] === 'water_on_road' ||
  answers['drainage_water_reaches_road'] === 'yes'
) {

  topicStatuses.drainage = 'sufficiently_answered';

  completed.add('A4');
  pendingFollowUp = null;

  const nextObj =
    selectNextTopic('drainage', topicStatuses);

  if (nextObj) {

    currentTopic = nextObj.nextTopic;
    currentQId = nextObj.nextQId;

    const qText =
      getQuestionTextForTopic(currentTopic);

    let ack =
      'అలాగే అండి.';

    if (
      answers['drainage_cleaning'] === 'inadequate'
    ) {

      ack =
        'అలాగే అండి.';
    }

    if (
      lower.includes('varsham') ||
      lower.includes('వర్షం')
    ) {

      ack =
        'అలాగే అండి.';
    }

    directReply =
      `${ack} ${qText}`;

  } else {

    conversationStatus = 'completed';

    directReply =
      'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
  }
}

// ============================================================
// 3. OTHER CLEAR DRAINAGE PROBLEM
// ============================================================

else if (
  answers['drainage_problem'] &&
  !isBareNo(String(answers['drainage_problem']))
) {

  topicStatuses.drainage =
    'sufficiently_answered';

  completed.add('A4');
  pendingFollowUp = null;

  const nextObj =
    selectNextTopic('drainage', topicStatuses);

  if (nextObj) {

    currentTopic = nextObj.nextTopic;
    currentQId = nextObj.nextQId;

    const qText =
      getQuestionTextForTopic(currentTopic);

    directReply =
      `అలాగే అండి. ${qText}`;

  } else {

    conversationStatus =
      'completed';

    directReply =
      'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
  }
}

// ============================================================
// 4. DRAINAGE PROBLEM EXISTS BUT DETAILS ARE MISSING
// ============================================================

else if (
  topicStatuses.drainage === 'needs_follow_up' ||
  answers['drainage_condition'] === 'poor'
) {

  directReply =
    'అవునా అండి. డ్రైనేజీలో ఏ సమస్య ఎక్కువగా ఉంది?';

  pendingFollowUp = {
    topic: 'drainage',
    field: 'drainage_issue',
    question: directReply,
    status: 'waiting_for_answer',
  };

  askedFollowUps.add('drainage_issue');

  conversationStatus =
    'waiting_for_follow_up';
}

// ============================================================
// 5. DRAINAGE INFORMATION NOT COMPLETE
// ============================================================

else {

  topicStatuses.drainage =
    'sufficiently_answered';

  completed.add('A4');
  pendingFollowUp = null;

  const nextObj =
    selectNextTopic('drainage', topicStatuses);

  if (nextObj) {

    currentTopic = nextObj.nextTopic;
    currentQId = nextObj.nextQId;

    const qText =
      getQuestionTextForTopic(currentTopic);

    directReply =
      `అలాగే అండి. ${qText}`;

  } else {

    conversationStatus =
      'completed';

    directReply =
      'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
  }
}
}

  // 11.8 WASTE MANAGEMENT / SANITATION WAS CURRENT TOPIC
else if (
  currentTopic === 'waste_management' ||
  currentTopic === 'sanitation' ||
  currentQId === 'A5'
) {

  // ============================================================
  // 1. WASTE MANAGEMENT IS GOOD / NO PROBLEM
  // ============================================================

  if (
    answers['waste_management_condition'] === 'good' ||
    (
      isBareNo(t) &&
      !answers['waste_management_problem'] &&
      !answers['waste_collection_frequency']
    )
  ) {

    topicStatuses.waste_management =
      'sufficiently_answered';

    completed.add('A5');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'waste_management',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus = 'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. CLEAR WASTE COLLECTION PROBLEM
  // ============================================================

  else if (
    answers['waste_collection_frequency'] ||
    (
      answers['waste_management_problem'] &&
      !isBareNo(
        String(answers['waste_management_problem'])
      )
    )
  ) {

    topicStatuses.waste_management =
      'sufficiently_answered';

    completed.add('A5');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'waste_management',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      let ack =
        'అలాగే అండి.';

      if (answers['waste_collection_frequency']) {

        ack =
          'అలాగే అండి.';
      }

      directReply =
        `${ack} ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 3. PROBLEM EXISTS BUT DETAILS ARE MISSING
  // ============================================================

  else if (
    topicStatuses.waste_management ===
      'needs_follow_up' ||
    answers['waste_management_condition'] ===
      'poor'
  ) {

    directReply =
      'అవునా అండి. చెత్త సేకరణలో ఏ ఇబ్బంది ఉంది?';

    pendingFollowUp = {
      topic: 'waste_management',
      field: 'waste_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add('waste_issue');

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 4. WASTE INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.waste_management =
      'sufficiently_answered';

    completed.add('A5');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'waste_management',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}
  // 11.9 HEALTHCARE WAS CURRENT TOPIC
else if (currentTopic === 'healthcare' || currentQId === 'A6') {

  // ============================================================
  // 1. HEALTHCARE IS GOOD / NO PROBLEM
  // ============================================================

  const healthcarePositive =
    answers['healthcare_condition'] === 'good' ||
    /^(బాగుంది|బాగానే ఉంది|బాగున్నాయి|బాగానే ఉన్నాయి|బాగున్నాయి అండి|సరే|పర్లేదు|అంతా బాగుంది|అంతా బాగానే ఉంది)$/i.test(t) ||
    /^(bagundi|bagane undi|bagunnayi|baganey unnai|baganey vunnai|bagane vunnai|allgood|all good|good|fine|ok|okay|parledu)$/i.test(t);

  const healthcareNoProblem =
    isBareNo(t) &&
    !answers['healthcare_problem'] &&
    !answers['healthcare_access'];

  if (
    healthcarePositive ||
    healthcareNoProblem
  ) {

    topicStatuses.healthcare =
      'sufficiently_answered';

    completed.add('A6');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic('healthcare', topicStatuses);

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. DOCTORS NOT AVAILABLE
  // ============================================================

  else if (
    answers['healthcare_access'] ===
      'doctors_unavailable' &&
    !askedFollowUps.has('healthcare_medicines')
  ) {

    directReply =
      'అవునా అండి. డాక్టర్లు అందుబాటులో లేకపోవడం సమస్యగా ఉందన్నమాట. మరి మందులు లేదా ఇతర ఆరోగ్య సేవల విషయంలో కూడా ఏమైనా ఇబ్బంది ఉందా?';

    pendingFollowUp = {
      topic: 'healthcare',
      field: 'healthcare_medicines',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add(
      'healthcare_medicines'
    );

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 3. ONLY ONE HOSPITAL
  // ============================================================

  else if (
    answers['healthcare_access'] ===
      'only_one_hospital'
  ) {

    if (
      answers['doctors_availability']
    ) {

      topicStatuses.healthcare =
        'sufficiently_answered';

      completed.add('A6');
      pendingFollowUp = null;

      const nextObj =
        selectNextTopic(
          'healthcare',
          topicStatuses
        );

      if (nextObj) {

        currentTopic = nextObj.nextTopic;
        currentQId = nextObj.nextQId;

        const qText =
          getQuestionTextForTopic(currentTopic);

        directReply =
          `అలాగే అండి. ${qText}`;
      }

    } else {

      directReply =
        'అవునా అండి. మీ ఊరిలో ఒక hospital మాత్రమే ఉందన్నమాట. అక్కడ doctors availability కూడా సమస్యగా ఉందా?';

      pendingFollowUp = {
        topic: 'healthcare',
        field: 'healthcare_doctors_availability',
        question: directReply,
        status: 'waiting_for_answer',
      };

      askedFollowUps.add(
        'healthcare_doctors_availability'
      );

      topicStatuses.healthcare =
        'needs_follow_up';

      conversationStatus =
        'waiting_for_follow_up';
    }
  }

  // ============================================================
  // 4. HEALTHCARE ACCESS / CLEAR PROBLEM
  // ============================================================

  else if (
    answers['healthcare_access'] === 'far_away' ||
    (
      answers['healthcare_problem'] &&
      !isBareNo(
        String(answers['healthcare_problem'])
      )
    )
  ) {

    topicStatuses.healthcare =
      'sufficiently_answered';

    completed.add('A6');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'healthcare',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 5. HEALTHCARE PROBLEM EXISTS BUT DETAILS ARE MISSING
  // ============================================================

  else if (
    topicStatuses.healthcare ===
      'needs_follow_up' ||
    answers['healthcare_condition'] ===
      'poor'
  ) {

    directReply =
      'అవునా అండి. ఆరోగ్య సేవల్లో ప్రధానంగా ఏ సమస్య ఎదురవుతోంది?';

    pendingFollowUp = {
      topic: 'healthcare',
      field: 'healthcare_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add(
      'healthcare_issue'
    );

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 6. HEALTHCARE INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.healthcare =
      'sufficiently_answered';

    completed.add('A6');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'healthcare',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}
  // 11.10 EDUCATION WAS CURRENT TOPIC
else if (currentTopic === 'education' || currentQId === 'A7') {

  // ============================================================
  // 1. EDUCATION IS GOOD / NO PROBLEM
  // ============================================================

  const educationPositive =
    answers['education_condition'] === 'good' ||
    /^(బాగుంది|బాగానే ఉంది|బాగున్నాయి|బాగానే ఉన్నాయి|సరే|పర్లేదు|అంతా బాగుంది|అంతా బాగానే ఉంది)$/i.test(t) ||
    /^(bagundi|bagane undi|bagunnayi|baganey unnai|baganey vunnai|bagane vunnai|allgood|all good|good|fine|ok|okay|parledu)$/i.test(t);

  const educationNoProblem =
    isBareNo(t) &&
    !answers['education_problem'];

  if (
    educationPositive ||
    educationNoProblem
  ) {

    topicStatuses.education =
      'sufficiently_answered';

    completed.add('A7');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'education',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. CLEAR EDUCATION PROBLEM
  // ============================================================

  else if (
    answers['education_problem'] &&
    !isBareNo(
      String(answers['education_problem'])
    )
  ) {

    topicStatuses.education =
      'sufficiently_answered';

    completed.add('A7');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'education',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 3. PROBLEM EXISTS BUT DETAILS ARE MISSING
  // ============================================================

  else if (
    topicStatuses.education ===
      'needs_follow_up' ||
    answers['education_condition'] ===
      'poor'
  ) {

    directReply =
      'అవునా అండి. పాఠశాలల్లో ప్రధానంగా ఏ సమస్య ఎదురవుతోంది?';

    pendingFollowUp = {
      topic: 'education',
      field: 'education_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add(
      'education_issue'
    );

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 4. EDUCATION INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.education =
      'sufficiently_answered';

    completed.add('A7');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'education',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}

 // 11.11 PUBLIC TRANSPORT WAS CURRENT TOPIC
else if (
  currentTopic === 'public_transport' ||
  currentQId === 'A8'
) {

  // ============================================================
  // 1. PUBLIC TRANSPORT IS GOOD / NO PROBLEM
  // ============================================================

  const transportPositive =
    answers['public_transport_condition'] === 'good' ||
    /^(బాగుంది|బాగానే ఉంది|బాగున్నాయి|బాగానే ఉన్నాయి|సరే|పర్లేదు|అంతా బాగుంది|అంతా బాగానే ఉంది)$/i.test(t) ||
    /^(bagundi|bagane undi|bagunnayi|baganey unnai|baganey vunnai|bagane vunnai|allgood|all good|good|fine|ok|okay|parledu)$/i.test(t);

  const transportNoProblem =
    isBareNo(t) &&
    !answers['public_transport_problem'];

  if (
    transportPositive ||
    transportNoProblem
  ) {

    topicStatuses.public_transport =
      'sufficiently_answered';

    completed.add('A8');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'public_transport',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 2. CLEAR TRANSPORT PROBLEM
  // ============================================================

  else if (
    answers['public_transport_problem'] &&
    !isBareNo(
      String(answers['public_transport_problem'])
    )
  ) {

    topicStatuses.public_transport =
      'sufficiently_answered';

    completed.add('A8');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'public_transport',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }

  // ============================================================
  // 3. PROBLEM EXISTS BUT DETAILS ARE MISSING
  // ============================================================

  else if (
    topicStatuses.public_transport ===
      'needs_follow_up' ||
    answers['public_transport_condition'] ===
      'poor'
  ) {

    directReply =
      'అవునా అండి. బస్సు లేదా రవాణా సౌకర్యాల్లో ప్రధానంగా ఏ సమస్య ఉంది?';

    pendingFollowUp = {
      topic: 'public_transport',
      field: 'transport_issue',
      question: directReply,
      status: 'waiting_for_answer',
    };

    askedFollowUps.add(
      'transport_issue'
    );

    conversationStatus =
      'waiting_for_follow_up';
  }

  // ============================================================
  // 4. PUBLIC TRANSPORT INFORMATION NOT COMPLETE
  // ============================================================

  else {

    topicStatuses.public_transport =
      'sufficiently_answered';

    completed.add('A8');
    pendingFollowUp = null;

    const nextObj =
      selectNextTopic(
        'public_transport',
        topicStatuses
      );

    if (nextObj) {

      currentTopic = nextObj.nextTopic;
      currentQId = nextObj.nextQId;

      const qText =
        getQuestionTextForTopic(currentTopic);

      directReply =
        `అలాగే అండి. ${qText}`;

    } else {

      conversationStatus =
        'completed';

      directReply =
        'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
    }
  }
}
  // 11.12 GENERAL FALLBACK TRANSITION
  if (!directReply) {
  topicStatuses[currentTopic] = 'sufficiently_answered';
  completed.add(currentQId);

  const nextObj = selectNextTopic(currentTopic, topicStatuses);
  if (nextObj) {
    currentTopic = nextObj.nextTopic;
    currentQId = nextObj.nextQId;
    const qText = getQuestionTextForTopic(currentTopic);
    directReply = `అలాగే అండి. ${qText}`;
  } else {
    conversationStatus = 'completed';
    directReply =
  'అలాగే అండి. సర్వే ప్రశ్నలు పూర్తయ్యాయి. ధన్యవాదాలు.';
  }
}

  // =========================================================================
  // STEP 12: CRITICAL SEMANTIC DUPLICATE SAFETY CHECK (Section 1 & 15)
  // =========================================================================
  // If directReply accidentally formulated a question about a completed topic, rectify immediately!
  // (Do not alter if a pending follow-up was purposefully scheduled for the current topic)
  if (!pendingFollowUp) {
    const parts = directReply.split(/[.?!]/).map((s) => s.trim()).filter(Boolean);
    const questionPart = parts[parts.length - 1] || directReply;
    const targetTopic = identifySemanticTopic(questionPart);
    if (targetTopic && topicStatuses[targetTopic] === 'sufficiently_answered' && targetTopic !== currentTopic) {
      const nextSafeObj = selectNextTopic(targetTopic, topicStatuses);
      if (nextSafeObj) {
        currentTopic = nextSafeObj.nextTopic;
        currentQId = nextSafeObj.nextQId;
        directReply = `సరే అండి. ${getQuestionTextForTopic(currentTopic)}`;
      }
    }
  }

  const updatedState: SurveySessionState = {
    ...currentState,
    current_question_id: currentQId,
    current_question_topic: currentTopic,
    topic_statuses: topicStatuses,
    answers,
    pending_follow_up: pendingFollowUp,
    asked_follow_ups: Array.from(askedFollowUps),
    completed_follow_ups: Array.from(completedFollowUps),
    completed_questions: Array.from(completed),
    conversation_status: conversationStatus,
    updated_at: new Date().toISOString(),
  };

  return {
    updatedState,
    detectedIntent,
    extractedNewAnswers,
    correctionMade,
    alreadyAnsweredRecognized,
    directReply,
  };
}
