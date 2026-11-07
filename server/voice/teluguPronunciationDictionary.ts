/**
 * Telugu Pronunciation & Natural Conversation Layer
 *
 * IMPORTANT:
 * - Never split valid Telugu words.
 * - Never insert spaces inside Telugu compound words.
 * - Do not force artificial pauses.
 * - Preserve the AI-generated Telugu wording and meaning.
 * - Keep punctuation natural for conversational TTS.
 */

export interface PronunciationEntry {
  word: string;
  normalized_telugu: string;
  category?: 'public_facility' | 'conversational' | 'administration';
  notes?: string;
}

/**
 * Reference vocabulary.
 *
 * The normalized form intentionally remains identical to the
 * original Telugu word. This prevents accidental word splitting.
 */
export const TELUGU_PRONUNCIATION_DICTIONARY: Record<
  string,
  PronunciationEntry
> = {
  నమస్కారం: {
    word: 'నమస్కారం',
    normalized_telugu: 'నమస్కారం',
    category: 'conversational',
  },

  అండి: {
    word: 'అండి',
    normalized_telugu: 'అండి',
    category: 'conversational',
  },

  గారు: {
    word: 'గారు',
    normalized_telugu: 'గారు',
    category: 'conversational',
  },

  అవునండి: {
    word: 'అవునండి',
    normalized_telugu: 'అవునండి',
    category: 'conversational',
  },

  సరేనండి: {
    word: 'సరేనండి',
    normalized_telugu: 'సరేనండి',
    category: 'conversational',
  },

  ఓకేనండి: {
    word: 'ఓకేనండి',
    normalized_telugu: 'ఓకేనండి',
    category: 'conversational',
  },

  అలాగేనండి: {
    word: 'అలాగేనండి',
    normalized_telugu: 'అలాగేనండి',
    category: 'conversational',
  },

  బాగానే: {
    word: 'బాగానే',
    normalized_telugu: 'బాగానే',
    category: 'conversational',
  },

  తాగునీటి: {
    word: 'తాగునీటి',
    normalized_telugu: 'తాగునీటి',
    category: 'public_facility',
  },

  తాగునీరు: {
    word: 'తాగునీరు',
    normalized_telugu: 'తాగునీరు',
    category: 'public_facility',
  },

  సౌకర్యం: {
    word: 'సౌకర్యం',
    normalized_telugu: 'సౌకర్యం',
    category: 'public_facility',
  },

  సౌకర్యాలు: {
    word: 'సౌకర్యాలు',
    normalized_telugu: 'సౌకర్యాలు',
    category: 'public_facility',
  },

  ప్రాంతంలో: {
    word: 'ప్రాంతంలో',
    normalized_telugu: 'ప్రాంతంలో',
    category: 'public_facility',
  },

  ప్రజాసదుపాయాలు: {
    word: 'ప్రజాసదుపాయాలు',
    normalized_telugu: 'ప్రజాసదుపాయాలు',
    category: 'public_facility',
  },

  ఆరోగ్యసదుపాయాలు: {
    word: 'ఆరోగ్యసదుపాయాలు',
    normalized_telugu: 'ఆరోగ్యసదుపాయాలు',
    category: 'public_facility',
  },

  విద్యాసదుపాయాలు: {
    word: 'విద్యాసదుపాయాలు',
    normalized_telugu: 'విద్యాసదుపాయాలు',
    category: 'public_facility',
  },

  రోడ్లు: {
    word: 'రోడ్లు',
    normalized_telugu: 'రోడ్లు',
    category: 'public_facility',
  },

  రోడ్ల: {
    word: 'రోడ్ల',
    normalized_telugu: 'రోడ్ల',
    category: 'public_facility',
  },

  విద్యుత్: {
    word: 'విద్యుత్',
    normalized_telugu: 'విద్యుత్',
    category: 'public_facility',
  },

  డ్రైనేజీ: {
    word: 'డ్రైనేజీ',
    normalized_telugu: 'డ్రైనేజీ',
    category: 'public_facility',
  },

  చెత్త: {
    word: 'చెత్త',
    normalized_telugu: 'చెత్త',
    category: 'public_facility',
  },

  పారిశుధ్యం: {
    word: 'పారిశుధ్యం',
    normalized_telugu: 'పారిశుధ్యం',
    category: 'public_facility',
  },

  ఆరోగ్య: {
    word: 'ఆరోగ్య',
    normalized_telugu: 'ఆరోగ్య',
    category: 'public_facility',
  },

  విద్య: {
    word: 'విద్య',
    normalized_telugu: 'విద్య',
    category: 'public_facility',
  },

  రవాణా: {
    word: 'రవాణా',
    normalized_telugu: 'రవాణా',
    category: 'public_facility',
  },

  ప్రభుత్వ: {
    word: 'ప్రభుత్వ',
    normalized_telugu: 'ప్రభుత్వ',
    category: 'administration',
  },

  సేవలు: {
    word: 'సేవలు',
    normalized_telugu: 'సేవలు',
    category: 'public_facility',
  },

  సమస్య: {
    word: 'సమస్య',
    normalized_telugu: 'సమస్య',
    category: 'public_facility',
  },

  సమస్యలు: {
    word: 'సమస్యలు',
    normalized_telugu: 'సమస్యలు',
    category: 'public_facility',
  },

  మెరుగుపరచాలి: {
    word: 'మెరుగుపరచాలి',
    normalized_telugu: 'మెరుగుపరచాలి',
    category: 'public_facility',
  },

  అభిప్రాయం: {
    word: 'అభిప్రాయం',
    normalized_telugu: 'అభిప్రాయం',
    category: 'public_facility',
  },

  అవసరం: {
    word: 'అవసరం',
    normalized_telugu: 'అవసరం',
    category: 'public_facility',
  },

  సాధారణంగా: {
    word: 'సాధారణంగా',
    normalized_telugu: 'సాధారణంగా',
    category: 'conversational',
  },

  సరఫరా: {
    word: 'సరఫరా',
    normalized_telugu: 'సరఫరా',
    category: 'public_facility',
  },

  పరిస్థితి: {
    word: 'పరిస్థితి',
    normalized_telugu: 'పరిస్థితి',
    category: 'public_facility',
  },

  ఇబ్బంది: {
    word: 'ఇబ్బంది',
    normalized_telugu: 'ఇబ్బంది',
    category: 'public_facility',
  },

  గుంతలు: {
    word: 'గుంతలు',
    normalized_telugu: 'గుంతలు',
    category: 'public_facility',
  },

  ఆసుపత్రి: {
    word: 'ఆసుపత్రి',
    normalized_telugu: 'ఆసుపత్రి',
    category: 'public_facility',
  },

  పాఠశాలలు: {
    word: 'పాఠశాలలు',
    normalized_telugu: 'పాఠశాలలు',
    category: 'public_facility',
  },
};

/**
 * Normalize Telugu text for ElevenLabs TTS.
 *
 * The goal is NOT to rewrite Telugu.
 * The goal is to remove formatting artifacts that can cause
 * unnatural pauses while preserving the original wording.
 */
export function normalizeTeluguPronunciation(rawText: string): {
  normalizedText: string;
  appliedRules: string[];
} {
  if (!rawText || !rawText.trim()) {
    return {
      normalizedText: '',
      appliedRules: [],
    };
  }

  let text = rawText.trim();
  const appliedRules: string[] = [];

  // ---------------------------------------------------------
  // 1. Remove survey/form artifacts ONLY when they appear
  //    at the beginning of the generated response.
  // ---------------------------------------------------------

  const beforeArtifacts = text;

  text = text
    .replace(
      /(^|నమస్కారం\s*(అండి)?\s*[,!]?\s*)(ఇది\s*)?(మొదటి|రెండవ|మూడవ|తదుపరి)\s*ప్రశ్న\s*[:.]?\s*/u,
      '$1'
    )
    .replace(
      /(^|\s+)నెక్స్ట్\s*(క్వశ్చన్|ప్రశ్న)\s*[:.]?\s*/u,
      '$1'
    )
    .replace(
      /(^|\s+)ప్రశ్న\s*\d+\s*[:.]?\s*/u,
      '$1'
    )
    .trim();

  if (beforeArtifacts !== text) {
    appliedRules.push('remove_survey_artifacts');
  }

  // ---------------------------------------------------------
  // 2. Remove artificial punctuation.
  //
  // IMPORTANT:
  // Do NOT add commas or spaces inside Telugu words.
  // ---------------------------------------------------------

  const beforePunctuation = text;

  text = text
    // Ellipsis / repeated dots -> single natural full stop
    .replace(/\.{2,}/g, '.')
    // Repeated commas -> one comma
    .replace(/,{2,}/g, ',')
    // Repeated dashes -> normal space
    .replace(/\s*--+\s*/g, ' ')
    // Unicode ellipsis -> normal space
    .replace(/\s*…\s*/g, ' ')
    // Remove stray brackets / formatting characters
    .replace(/[\[\]\(\)\{\}<>"]/g, '')
    // Semicolon -> conversational sentence break
    .replace(/\s*;\s*/g, '. ')
    // Remove accidental spaces before punctuation
    .replace(/\s+([,.!?])/g, '$1')
    // Normalize excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();

  if (beforePunctuation !== text) {
    appliedRules.push('remove_artificial_pauses');
  }

  // ---------------------------------------------------------
  // 3. Natural polite Telugu.
  //
  // Do NOT force pauses around అండి / గారు.
  // ---------------------------------------------------------

  const beforePolite = text;

  text = text
    // "అండి ," -> "అండి,"
    .replace(/\s+(,)/gu, '$1')
    // ", అండి" remains natural; do not remove the comma globally
    // because the AI may intentionally use it at a sentence boundary.
    .replace(/\s+/g, ' ')
    .trim();

  if (beforePolite !== text) {
    appliedRules.push('natural_polite_speech');
  }

  // ---------------------------------------------------------
  // 4. Greeting normalization.
  //
  // Only normalize punctuation.
  // Never split "నమస్కారం", "అండి", or greeting compounds.
  // ---------------------------------------------------------

  const beforeGreeting = text;

  text = text
    .replace(/^నమస్కారం\s*!\s*/u, 'నమస్కారం! ')
    .replace(/^నమస్కారం\s*,\s*/u, 'నమస్కారం, ')
    .replace(/^నమస్కారం\s*\.\s*/u, 'నమస్కారం! ')
    .replace(/^నమస్కారం\s+అండి!\s*/u, 'నమస్కారం అండి! ')
    .replace(/^నమస్కారం\s+అండి,\s*/u, 'నమస్కారం అండి, ')
    .replace(/^నమస్కారం\s+అండి\.\s*/u, 'నమస్కారం అండి! ')
    .replace(/^నమస్తే\s*!\s*/u, 'నమస్తే! ')
    .replace(/^నమస్తే\s*,\s*/u, 'నమస్తే, ')
    .replace(/^శుభోదయం\s*!\s*/u, 'శుభోదయం! ')
    .replace(/^శుభోదయం\s*,\s*/u, 'శుభోదయం, ');

  if (beforeGreeting !== text) {
    appliedRules.push('natural_greeting');
  }

  // ---------------------------------------------------------
  // 5. CRITICAL:
  // NEVER split Telugu compound words.
  //
  // The previous version incorrectly changed:
  //   తాగునీటి -> తాగు నీటి
  //   తాగునీరు -> తాగు నీరు
  //   ప్రజాసదుపాయాలు -> ప్రజా సదుపాయాలు
  //
  // That behavior has been completely removed.
  // ---------------------------------------------------------

  // No replacements here intentionally.

  // ---------------------------------------------------------
  // 6. Preserve natural question punctuation & intonation.
  //
  // Applies rising conversational intonation (?) to Telugu,
  // Hindi, and English interrogative sentences.
  // ---------------------------------------------------------

  const questionPattern =
    /(ఎలా ఉంది|ఎన్ని రోజులు|ఏమైనా సమస్య ఉందా|చెప్పగలరా|ఎక్కడ ఉంది|ఎందుకు|ఎవరు|ఏమిటి|ఎలా ఉన్నాయి|ఏం సమస్య|ఏమైనా ఇబ్బంది ఉందా|ఉన్నాయా|సరిపోతున్నాయా|సరిపోతాయా|చేస్తారా|తీసుకుంటారా|అవుతుందా|వస్తుందా|చేశారా)$/u;

  const hindiQuestionPattern =
    /(क्या|कैसा है|कैसी है|कैसे हैं|सकते हैं|क्या है|होगा क्या|चाहते हैं|मिल रही है|सुविधा है)$/u;

  const englishInterrogativePattern =
    /^(How|What|Why|Where|When|Who|Could|Would|Can|Do|Does|Did|Is|Are|Will)\b/i;

  if (
    (questionPattern.test(text) ||
      hindiQuestionPattern.test(text) ||
      englishInterrogativePattern.test(text)) &&
    !text.endsWith('?')
  ) {
    text = text.replace(/[.!]?$/, '?');
    appliedRules.push('natural_question_intonation');
  }

  // ---------------------------------------------------------
  // 7. Remove hidden Unicode artifacts (preserve ZWNJ & ZWJ for Indian scripts).
  //
  // CRITICAL: \u200C (ZWNJ) and \u200D (ZWJ) must NEVER be stripped,
  // as they govern ligatures, halants, and conjuncts in Telugu and Hindi.
  // Only remove zero-width space (\u200B) and BOM (\uFEFF).
  // ---------------------------------------------------------

  const beforeUnicode = text;

  text = text
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/[*_#`~]/g, '') // Strip markdown formatting tokens from LLM output
    .replace(/\s+/g, ' ')
    .trim();

  if (beforeUnicode !== text) {
    appliedRules.push('clean_unicode');
  }

  // ---------------------------------------------------------
  // 8. Final safety cleanup.
  //
  // Never modify Telugu word boundaries.
  // ---------------------------------------------------------

  text = text
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([,.!?]){2,}/g, '$1')
    .trim();

  return {
    normalizedText: text,
    appliedRules,
  };
}

/**
 * Robust classifier for spoken Marriage Event RSVP responses in natural conversational Telugu, English, and Hindi.
 * Strictly distinguishes between ATTENDING, NOT_ATTENDING, and MAYBE_ATTENDING.
 * Genuinely ambiguous or greeting-only responses are flagged as UNCLEAR to trigger polite clarification without false classification.
 */
export type MarriageRsvpCategory = 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING' | 'UNCLEAR';
export type MarriageRsvpOutcome = MarriageRsvpCategory;

export function classifyMarriageRsvp(text?: string | null): MarriageRsvpOutcome {
  if (!text || typeof text !== 'string') return 'UNCLEAR';
  const t = text.trim();
  if (t.length === 0) return 'UNCLEAR';

  // Standalone greeting / clarification request should remain UNCLEAR
  if (
    /^(హలో|నమస్కారం|నమస్తే|శుభోదయం|ఏమిటి|ఏంటి|హాయ్|hello|hi|hey|pardon|what|repeat|can you repeat)[\s.,!]*$/iu.test(
      t
    )
  ) {
    return 'UNCLEAR';
  }

  // Normalize lower-case string for Latin script regex matching
  const lower = t.toLowerCase().replace(/[\s\-_]+/g, ' ');

  // 1. Spoken MAYBE_ATTENDING (Tentative / Conditional / Unsure / Unclear decision)
  // Must precede positive matching so phrases like "కుదిరితే వస్తాను" or "టైం బట్టి వస్తాను" or "maybe I will come" become MAYBE_ATTENDING
  if (
    // Telugu tentative / conditional
    /చూస్తాను|చూద్దాం|చూస్తాం|చూస్తామండి|కుదిరితే\s*వస్తాను|కుదిరితే\s*వస్తున్నాను|కుదిరితే\s*వస్తున్నా|కుదిరితే\s*వస్తా|కుదిరితే\s*వస్తాం|కుదిరితే\s*వస్తాము|కుదిరితే|ప్రయత్నిస్తాను|ప్రయత్నిస్తాం|ప్రయత్నిస్తాము|రావడానికి\s*ప్రయత్నిస్తాను|టైం\s*బట్టి|సమయం\s*బట్టి|సమయాన్ని\s*బట్టి|సమయం\s*కుదిరితే|ఇంకా\s*తెలియదు|తెలియదు|ఆలోచించి\s*చెప్తాను|ఆలోచించి\s*చెప్తాం|ఆలోచించి\s*చెబుతాను|తర్వాత\s*చెప్తాను|తరువాత\s*చెప్తాను|తర్వాత\s*చెబుతాను|తర్వాత\s*చెప్తాం|ఖచ్చితంగా\s*చెప్పలేను|ఖచ్చితంగా\s*చెప్పలేము|చెప్పలేను|చెప్పలేము|బహుశా|బహుశ|రావచ్చు|రావచ్చండి|వీలైతే|వీలైతే\s*వస్తాను|ఇంకా\s*ఖరారు\s*కాలేదు|వస్తామో\s*లేదో|ఇంకా\s*నిర్ణయించుకోలేదు|ఆ\s*సమయానికి\s*చూస్తాం|ఆ\s*సమయానికి\s*చూస్తాను/iu.test(
      t
    ) ||
    /^(చూస్తాను|చూద్దాం|చూస్తాం|ప్రయత్నిస్తాను|ప్రయత్నిస్తాం|కుదిరితే|కుదిరితే\s*వస్తాను|వీలైతే|రావచ్చు|తెలియదు|ఇంకా\s*తెలియదు|చెప్పలేను|టైం\s*బట్టి|సమయం\s*బట్టి)[\s.,!]*$/iu.test(
      t
    ) ||
    // English tentative / conditional
    /\b(maybe|perhaps|tentative|i will try|we will try|will try|will try to come|will try to attend|not sure|not sure yet|i am not sure|i'm not sure|we are not sure|uncertain|depends on time|depend on time|time permit|depends|let me see|i will confirm later|we will confirm later|confirm later|i might come|we might come|might come|might attend|hopefully|probably|not decided|let you know later)\b/i.test(
      lower
    ) ||
    /^(maybe|perhaps|not sure|not sure yet|i will try|we will try|depends on time|depends|let me see|hopefully|probably)[\s.,!]*$/i.test(
      lower
    ) ||
    // Hindi tentative / conditional
    /\b(dekhenge|dekhta hoon|dekhte hain|shayad|koshish karunga|koshish karungi|koshish karenge|abhi pata nahi|pata nahi|baad mein bataunga|baad mein bataungi|baad me bataunga|baad me bataungi|pakka nahi pata|time pe depend)\b/i.test(
      lower
    ) ||
    /^(dekhenge|shayad|koshish karunga|koshish karungi|koshish karenge|abhi pata nahi)[\s.,!]*$/i.test(
      lower
    ) ||
    // Phonetic / Romanized Telugu
    /\b(choostha|chustha|chustanu|choostanu|chuddam|kudirite|kudurthe|kudirithe|time batti|bahusha|kudirithe vastanu|kudirthe vastanu)\b/i.test(
      lower
    )
  ) {
    return 'MAYBE_ATTENDING';
  }

  // 2. Spoken NOT_ATTENDING (Definite Negative - Strict Negation Handling)
  // Ensures phrases like "రాను", "రాలేను", "రావడం లేదు", "రావడం కుదరదు", "లేదు", "No", "Nahi" NEVER become ATTENDING
  if (
    // Telugu negatives
    /రాను\s*అనుకుంటున్నాను|పెళ్లికి\s*రాలేను|పెళ్ళికి\s*రాలేను|పెళ్లికి\s*రాను|పెళ్ళికి\s*రాను|హాజరు\s*కాలేను|హాజరు\s*కాలేము|హాజరు\s*కాను|హాజరు\s*కాము|అటెండ్\s*అవ్వను|అటెండ్\s*కాలేను|అటెండ్\s*కాను|రావడం\s*లేదు|రావటం\s*లేదు|రావడం\s*కుదరదు|రావడం\s*వీలుకాదు|రావడానికి\s*వీలు\s*లేదు|లేదు,?\s*రావడం\s*కుదరదు|లేదు,?\s*రాలేను|లేదు,?\s*రాను|లేదు\s*నేను\s*రాను|నేను\s*రాను|మేము\s*రాము|రావట్లేదు|రావట్లేదండి|రాలేను|రాలేనండి|రాలేము|రాలేమండి|రాను|రానండి|రాము|రామండి|కుదరదు|కుదరదండి|వీలుకాదు|వీలుపడదు|రాలేకపోతున్నాను|రాలేకపోతున్నాం|రాలేకపోతున్నాము|పని\s*ఉంది.*రాలే|వేరే\s*పని\s*ఉంది/iu.test(
      t
    ) ||
    /^(లేదు|లేదు\s*అండి|రాను|రానండి|రాము|రామండి|రాలేను|రాలేము|రావట్లేదు|రావడం\s*లేదు|రావటం\s*లేదు|రావడం\s*కుదరదు|కుదరదు|వీలుపడదు|వీలుకాదు|నేను\s*రాను|లేదు\s*రాను|రాలేను\s*అండి|లేదు,?\s*రాలేను|లేదు,?\s*రావడం\s*కుదరదు)[\s.,!]*$/iu.test(
      t
    ) ||
    // English negatives
    /\b(cannot come|cannot attend|can'?t attend|can'?t come|won'?t come|won'?t attend|will not be attending|will not attend|will not come|unable to attend|unable to come|sorry.*cannot come|sorry.*cannot make it|sorry.*can'?t come|sorry.*can'?t make it|can'?t make it|cannot make it|not coming|not attending|i am not attending|we are not attending|no i cannot come|no i cannot attend|no i can'?t attend|no i can'?t come)\b/i.test(
      lower
    ) ||
    /^(no|nope|nah|not attending|cannot attend|cannot come|can'?t come|can'?t attend|unable to attend|i cannot come|i can'?t attend|i won'?t come|sorry,?\s*i cannot make it)[\s.,!]*$/i.test(
      lower
    ) ||
    // Hindi negatives
    /\b(nahi|nahin|nahi aa sakta|nahi aa sakti|nahi aa paunga|nahi aa paungi|main nahi aaunga|main nahi aaungi|nahi aaunga|nahi aaungi|hum nahi aayenge|nahi aayenge|aana mushkil hai|nahi ho payega)\b/i.test(
      lower
    ) ||
    /^(nahi|nahin|nahi aa sakta|nahi aa sakti|main nahi aaunga|main nahi aaungi|nahi aaunga|nahi aaungi|nahi aa paunga|hum nahi aayenge)[\s.,!]*$/i.test(
      lower
    ) ||
    // Romanized Telugu negatives
    /\b(ledhu|ledu|raanu|ranu|raalenu|ralenu|raavatledu|ravatledu|ravadam ledu|raavadam ledu|ravadam kudaradu|raavadam kudaradu|kudaradu|kudardu|attend avvanu)\b/i.test(
      lower
    )
  ) {
    return 'NOT_ATTENDING';
  }

  // 3. Spoken ATTENDING (Definite Positive)
  if (
    // Telugu positives
    /వస్తున్నాము|వస్తున్నాం|వస్తున్నాను|వస్తున్నా|వస్తాను|వస్తాము|వస్తాం|వస్తానండి|వస్తామండి|వస్తా|నేను\s*వస్తాను|నేను\s*వస్తున్నాను|నేను\s*వస్తున్నా|నేను\s*వస్తా|మేము\s*వస్తున్నాము|మేము\s*వస్తున్నాం|మేము\s*వస్తాము|మేము\s*వస్తాం|తప్పకుండా\s*వస్తాను|తప్పకుండా\s*వస్తున్నాను|తప్పకుండా\s*వస్తున్నా|తప్పకుండా\s*వస్తాము|తప్పకుండా\s*వస్తాం|తప్పకుండా|తప్పక\s*వస్తాను|తప్పక\s*వస్తున్నాను|తప్పక\s*వస్తాము|తప్పక\s*వస్తాం|తప్పక|ఖచ్చితంగా\s*వస్తాను|ఖచ్చితంగా\s*వస్తున్నాను|ఖచ్చితంగా\s*వస్తున్నా|ఖచ్చితంగా\s*వస్తాము|ఖచ్చితంగా\s*వస్తాం|ఖచ్చితంగా|పెళ్లికి\s*వస్తాను|పెళ్లికి\s*వస్తున్నాను|పెళ్లికి\s*వస్తున్నా|పెళ్లికి\s*వస్తాము|పెళ్లికి\s*వస్తాం|పెళ్ళికి\s*వస్తాను|పెళ్ళికి\s*వస్తున్నాను|పెళ్ళికి\s*వస్తాము|మేమందరం\s*వస్తాము|మేమందరం\s*వస్తున్నాం|మేమందరం\s*వస్తాం|మేమందరం\s*వస్తున్నాము|అందరం\s*వస్తాము|అందరం\s*వస్తాం|అందరం\s*వస్తున్నాం|అందరం\s*వస్తున్నాము|హాజరవుతాను|హాజరవుతాము|హాజరవుతాం|హాజరవుతా|అటెండ్\s*అవుతాను|అటెండ్\s*అవుతాము|అటెండ్\s*అవుతాం|అటెండ్\s*అవుతా|హా,?\s*వస్తున్నాను|హా,?\s*వస్తున్నా|హా,?\s*వస్తాను|హా,?\s*వస్తాము|హా,?\s*వస్తాం|హా\s*అవును|హా,?\s*అవును|అవును,?\s*నేను\s*వస్తాను|అవును,?\s*వస్తాను|అవును,?\s*వస్తున్నాను|అవును,?\s*వస్తున్నా|అవును,?\s*వస్తాము|అవును,?\s*వస్తాం|విచ్చేస్తాను|విచ్చేస్తాము|విచ్చేస్తాం|కుటుంబంతో\s*వస్తాం|కుటుంబంతో\s*వస్తాను|కుటుంబంతో\s*వస్తున్నాం|కుటుంబంతో\s*వస్తున్నాము/iu.test(
      t
    ) ||
    /^(హా|హా,?\s*వస్తాను|హా,?\s*వస్తున్నాను|హా,?\s*వస్తున్నా|హా,?\s*వస్తాము|హా,?\s*వస్తాం|అవును|అవునండి|అవును,?\s*వస్తాను|అవును,?\s*వస్తున్నాను|వస్తున్నాను|వస్తున్నా|వస్తాను|వస్తాము|వస్తాం|వస్తా|నేను\s*వస్తాను|హాజరవుతాను|హాజరవుతాము|హాజరవుతాం|హాజరవుతా|తప్పకుండా|ఖచ్చితంగా|తప్పకుండా\s*వస్తాను|తప్పకుండా\s*వస్తాము|తప్పకుండా\s*వస్తున్నాను)[\s.,!]*$/iu.test(
      t
    ) ||
    // English positives
    /\b(yes i will come|yes we will come|i will come|we will come|i am coming|we are coming|i will attend|we will attend|will attend|i am attending|we are attending|count me in|count us in|we will be there|i will be there|will be there|definitely|sure|absolutely|yes.*come|yes.*attend|sure thing|sure we will come|sure i will come)\b/i.test(
      lower
    ) ||
    /^(yes|yeah|yup|yep|sure|definitely|absolutely|count me in|we will be there|i will attend|we will attend|i am coming|we are coming|yes,?\s*i will come)[\s.,!]*$/i.test(
      lower
    ) ||
    // Hindi positives
    /\b(haan|ji haan|haan ji|zaroor|zaroor aaunga|zaroor aaungi|zaroor aayenge|main aaunga|main aaungi|hum aayenge|pakka aayenge|pakka aaunga|pakka aaungi|aaunga|aaungi|aayenge)\b/i.test(
      lower
    ) ||
    /^(haan|ji haan|zaroor|hum aayenge|main aaunga|main aaungi|pakka aayenge|pakka aaunga)[\s.,!]*$/i.test(
      lower
    ) ||
    // Romanized Telugu
    /\b(haa|ha|avunu|vastunnanu|vasthunnanu|vastunna|vasthunna|vastunnamu|vasthunnamu|vastanu|vasthamu|vastamu|vastam|vastaa|ha vastanu|ha vastunnanu|avunu vastanu|attend avutha|attend avutanu|attend avuthamu)\b/i.test(
      lower
    )
  ) {
    return 'ATTENDING';
  }

  return 'UNCLEAR';
}