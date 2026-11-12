export interface TemplateFieldDefinition {
  key: string;
  label: string;
  placeholderText: string;
  required: boolean;
  type: 'text' | 'textarea' | 'date' | 'time';
  description?: string;
}

export interface CustomPlaceholderField {
  key: string;
  label: string;
  value: string;
}

export interface EventTemplateRecord {
  id: string;
  category:
    | 'public_survey'
    | 'political_campaign'
    | 'political_survey'
    | 'business_event'
    | 'marriage_event'
    | string;
  name: string;
  description: string;
  isDefault: boolean;
  isCustom?: boolean;
  scriptTemplate: {
    te: string;
    hi: string;
    en: string;
  };
  fields: TemplateFieldDefinition[];
  defaultValues: Record<string, string>;
  questions?: Array<{ id: string; text: string; category?: string; allowFollowUp?: boolean }>;
  dtmfOptions?: Array<{ digit: string; labelEn: string; spokenPrompt: { te: string; hi: string; en: string } }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Escapes unsafe characters in values while preserving genuine punctuation and Indian language unicode
 */
export function escapePlaceholderValue(val: string): string {
  if (!val) return '';
  return String(val)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips unresolved placeholders like {{field_name}} so they are never spoken aloud
 * by TTS voice synthesis engines.
 */
export function sanitizeScriptForSpeech(script: string): string {
  if (!script) return '';
  return script.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Renders a script template by replacing {{field_name}} placeholders with values.
 * Supports standard values and custom user-defined placeholder fields.
 * Identifies unresolved placeholders to prevent them from being spoken in calls.
 */
export function renderTemplateScript(
  templateString: string,
  values: Record<string, string>,
  customFields?: CustomPlaceholderField[]
): {
  renderedText: string;
  unresolvedPlaceholders: string[];
  isValid: boolean;
  highlightedPreviewHtml: string;
} {
  if (!templateString) {
    return { renderedText: '', unresolvedPlaceholders: [], isValid: true, highlightedPreviewHtml: '' };
  }

  const combinedValues: Record<string, string> = { ...(values || {}) };
  if (customFields && Array.isArray(customFields)) {
    for (const cf of customFields) {
      if (cf.key && cf.value) {
        combinedValues[cf.key] = cf.value;
      }
    }
  }

  const unresolvedSet = new Set<string>();

  const renderedText = templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = combinedValues[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return escapePlaceholderValue(val);
    }
    unresolvedSet.add(key);
    return `{{${key}}}`;
  });

  const highlightedPreviewHtml = templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = combinedValues[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return `<span class="bg-emerald-100 text-emerald-800 font-semibold px-1 py-0.5 rounded">${escapePlaceholderValue(val)}</span>`;
    }
    return `<span class="bg-rose-100 text-rose-700 font-semibold px-1 py-0.5 rounded border border-rose-300">{{${key}}}</span>`;
  });

  const unresolved = Array.from(unresolvedSet);
  return {
    renderedText,
    unresolvedPlaceholders: unresolved,
    isValid: unresolved.length === 0,
    highlightedPreviewHtml,
  };
}

export function validateRequiredFields(
  fields: TemplateFieldDefinition[],
  values: Record<string, string>,
  customFields?: CustomPlaceholderField[]
): {
  isValid: boolean;
  missingFields: string[];
} {
  const combined: Record<string, string> = { ...(values || {}) };
  if (customFields) {
    customFields.forEach((cf) => {
      if (cf.key) combined[cf.key] = cf.value;
    });
  }

  const missing: string[] = [];
  for (const f of fields) {
    if (f.required) {
      const v = combined[f.key];
      if (!v || !String(v).trim()) {
        missing.push(f.key);
      }
    }
  }
  return {
    isValid: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Generic Built-in Default Templates
 * NO hardcoded customer names, party names, candidates, or cities.
 */
export const DEFAULT_TEMPLATES: EventTemplateRecord[] = [
  // 1. PUBLIC SURVEY TEMPLATES
  {
    id: 'tpl_public_amenities',
    category: 'public_survey',
    name: 'Public Amenities Survey',
    description: 'Civic feedback survey covering drinking water, electricity, sanitation, and municipal amenities.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం అండి! {{organization_name}} తరపున {{locality_name}} పరిధిలోని ప్రజా సదుపాయాల గురించి మీ అభిప్రాయం తెలుసుకోవడానికి మాట్లాడుతున్నాం. {{survey_purpose}} కోసం కొన్ని ప్రశ్నలు అడుగుతున్నాము.',
      hi: 'नमस्ते! {{organization_name}} की ओर से {{locality_name}} क्षेत्र में जन सुविधाओं पर आपकी राय जानने के लिए कॉल किया गया है। {{survey_purpose}} के लिए कुछ संक्षिप्त प्रश्न पूछ रहे हैं।',
      en: 'Hello! Calling on behalf of {{organization_name}} regarding public amenities in {{locality_name}}. We would like to ask a few questions for {{survey_purpose}}.',
    },
    fields: [
      { key: 'survey_name', label: 'Survey Name', placeholderText: 'e.g. Ward Public Amenities Survey', required: true, type: 'text' },
      { key: 'organization_name', label: 'Organization / Department', placeholderText: 'e.g. Municipal Civic Committee', required: true, type: 'text' },
      { key: 'locality_name', label: 'Locality / Area', placeholderText: 'e.g. Sector 4, North Zone', required: true, type: 'text' },
      { key: 'survey_purpose', label: 'Survey Purpose', placeholderText: 'e.g. civic infrastructure improvement', required: true, type: 'text' },
      { key: 'survey_introduction', label: 'Survey Introduction', placeholderText: 'Introductory greeting message', required: false, type: 'textarea' },
    ],
    defaultValues: {
      survey_name: '',
      organization_name: '',
      locality_name: '',
      survey_purpose: '',
      survey_introduction: '',
    },
    questions: [
      { id: 'Q1', text: 'మీ ప్రాంతంలో తాగునీటి సరఫరా మరియు నాణ్యత ఎలా ఉంది అండి?', category: 'drinking_water', allowFollowUp: true },
      { id: 'Q2', text: 'మరి మీ ప్రాంతంలోని రోడ్ల నిర్వహణ ఎలా ఉంది అండి?', category: 'roads', allowFollowUp: true },
      { id: 'Q3', text: 'మీ పరిధిలో విద్యుత్ సరఫరా క్రమంగా అందుతోందా?', category: 'electricity', allowFollowUp: true },
      { id: 'Q4', text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?', category: 'sanitation', allowFollowUp: true },
      { id: 'Q5', text: 'ముఖ్యంగా వెంటనే పరిష్కరించాల్సిన సమస్య ఏది అని మీరు భావిస్తున్నారు?', category: 'priority', allowFollowUp: true },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl_infrastructure',
    category: 'public_survey',
    name: 'Infrastructure Survey',
    description: 'Focused survey measuring transport connectivity, drainage networks, and road infrastructure.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం! {{organization_name}} ద్వారా {{locality_name}} లోని రహదారులు మరియు డ్రైనేజీ మౌలిక వసతుల అధ్యయనం కోసం కాల్ చేస్తున్నాం. {{survey_purpose}} పై మీ విలువైన స్పందన తెలియజేయండి.',
      hi: 'नमस्ते! {{organization_name}} द्वारा {{locality_name}} में सड़कों एवं बुनियादी ढांचे के अध्ययन हेतु कॉल किया गया है।',
      en: 'Hello! Calling on behalf of {{organization_name}} for an infrastructure study in {{locality_name}}.',
    },
    fields: [
      { key: 'survey_name', label: 'Survey Name', placeholderText: 'e.g. Road & Drainage Assessment Survey', required: true, type: 'text' },
      { key: 'organization_name', label: 'Planning Authority', placeholderText: 'e.g. Regional Development Agency', required: true, type: 'text' },
      { key: 'locality_name', label: 'Constituency / Zone', placeholderText: 'e.g. Central Zone', required: true, type: 'text' },
      { key: 'survey_purpose', label: 'Study Purpose', placeholderText: 'e.g. drainage and public transit upgrade', required: true, type: 'text' },
    ],
    defaultValues: {
      survey_name: '',
      organization_name: '',
      locality_name: '',
      survey_purpose: '',
    },
    questions: [
      { id: 'Q1', text: 'వర్షాకాలంలో మీ ప్రాంతంలో డ్రైనేజీ సమస్య లేదా వరద నీరు నిల్వ ఉంటుందా?', category: 'drainage', allowFollowUp: true },
      { id: 'Q2', text: 'మీ ప్రాంతంలో బస్సు లేదా పబ్లిక్ ట్రాన్స్‌పోర్ట్ సదుపాయాలు సరిపడా ఉన్నాయా?', category: 'transport', allowFollowUp: true },
      { id: 'Q3', text: 'రహదారి భద్రత లేదా వీధి దీపాల విషయంలో ఎలాంటి సమస్యలు ఎదురవుతున్నాయి?', category: 'safety', allowFollowUp: true },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },

  // 2. POLITICAL CAMPAIGN TEMPLATE
  {
    id: 'tpl_constituency_outreach',
    category: 'political_campaign',
    name: 'Constituency Outreach',
    description: 'Generic, neutral template for authorized candidate campaign outreach and interactive voter feedback collection.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం! నేను {{party_name}} తరపున {{constituency_name}} నియోజకవర్గ అభ్యర్థి {{candidate_name}} మాట్లాడుతున్నాను. {{campaign_message}} మన నియోజకవర్గ అభివృద్ధి లక్ష్యాలకు మీ మద్దతు ఉంటే మీ ఫోన్ కీప్యాడ్‌లో 1 నొక్కండి, మరిన్ని వివరాల కోసం 2 నొక్కండి. {{closing_message}}',
      hi: 'नमस्ते! मैं {{party_name}} की ओर से {{constituency_name}} क्षेत्र के प्रत्याशी {{candidate_name}} बोल रहा हूँ। {{campaign_message}} हमारे विकास एजेंडा का समर्थन करने के लिए फोन पर 1 दबाएं, अधिक जानकारी के लिए 2 दबाएं। {{closing_message}}',
      en: 'Hello! This is {{candidate_name}}, candidate representing {{party_name}} for {{constituency_name}}. {{campaign_message}} To support our development initiatives, please press 1 on your phone keypad, or press 2 for more information. {{closing_message}}',
    },
    fields: [
      { key: 'campaign_name', label: 'Campaign Name', placeholderText: 'e.g. General Assembly Outreach 2026', required: true, type: 'text' },
      { key: 'candidate_name', label: 'Candidate Name', placeholderText: 'Enter candidate full name', required: true, type: 'text' },
      { key: 'party_name', label: 'Party Name', placeholderText: 'Enter political party or independent organization', required: true, type: 'text' },
      { key: 'constituency_name', label: 'Constituency Name', placeholderText: 'Enter constituency or district name', required: true, type: 'text' },
      { key: 'campaign_message', label: 'Core Campaign Message', placeholderText: 'Enter approved campaign agenda or manifesto summary', required: true, type: 'textarea' },
      { key: 'closing_message', label: 'Closing Message', placeholderText: 'e.g. Thank you for your valuable time and civic participation.', required: false, type: 'text' },
    ],
    defaultValues: {
      campaign_name: '',
      candidate_name: '',
      party_name: '',
      constituency_name: '',
      campaign_message: '',
      closing_message: '',
    },
    dtmfOptions: [
      {
        digit: '1',
        labelEn: 'Support Candidate Agenda',
        spokenPrompt: {
          te: 'మద్దతు కోసం 1 నొక్కండి',
          hi: 'समर्थन के लिए 1 दबाएं',
          en: 'Press 1 to support the candidate',
        },
      },
      {
        digit: '2',
        labelEn: 'Request Information / Callback',
        spokenPrompt: {
          te: 'మరిన్ని వివరాల కోసం 2 నొక్కండి',
          hi: 'अधिक जानकारी के लिए 2 दबाएं',
          en: 'Press 2 for more information',
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },

  // 3. MARRIAGE EVENT TEMPLATE
  {
    id: 'tpl_wedding_invitation',
    category: 'marriage_event',
    name: 'Wedding Invitation',
    description: 'Generic, elegant wedding and reception announcement template populated exclusively with host-provided details.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం అండి! {{family_name}} తరపున సంతోషంగా ఆహ్వానిస్తున్నాము. మా చిరంజీవి {{groom_name}} మరియు చిరంజీవలక్ష్మి {{bride_name}} ల వివాహ మహోత్సవం {{wedding_date}} నాడు {{wedding_time}} కు {{venue_name}}, {{venue_address}} లో జరగనుంది. {{reception_date}} సాయంత్రం {{reception_time}} కు రిసెప్షన్ నిర్వహించబడుతుంది. {{invitation_message}} మీరు మీ కుటుంబ సమేతంగా విచ్చేసి నూతన వధూవరులను ఆశీర్వదించగలరని మనస్ఫూర్తిగా కోరుకుంటున్నాము.',
      hi: 'नमस्ते! {{family_name}} की ओर से आपको सादर आमंत्रित करते हैं। हमारे सुपुत्र {{groom_name}} एवं सुपुत्री {{bride_name}} का शुभ विवाह {{wedding_date}} को {{wedding_time}} पर {{venue_name}}, {{venue_address}} में संपन्न होगा। {{invitation_message}} आप सपरिवार पधारकर वर-वधु को आशीर्वाद प्रदान करें।',
      en: 'Warm greetings! On behalf of {{family_name}}, we cordially invite you to the wedding of {{groom_name}} and {{bride_name}} on {{wedding_date}} at {{wedding_time}} at {{venue_name}}, {{venue_address}}. {{invitation_message}} Please grace the occasion with your family and bless the couple.',
    },
    fields: [
      { key: 'bride_name', label: "Bride's Name", placeholderText: 'Enter bride full name', required: true, type: 'text' },
      { key: 'groom_name', label: "Groom's Name", placeholderText: 'Enter groom full name', required: true, type: 'text' },
      { key: 'wedding_date', label: 'Wedding Date', placeholderText: 'e.g. 24 November 2026', required: true, type: 'text' },
      { key: 'wedding_time', label: 'Wedding Time', placeholderText: 'e.g. 10:15 AM (సుముహూర్తం)', required: true, type: 'text' },
      { key: 'reception_date', label: 'Reception Date', placeholderText: 'e.g. 25 November 2026', required: false, type: 'text' },
      { key: 'reception_time', label: 'Reception Time', placeholderText: 'e.g. 7:00 PM', required: false, type: 'text' },
      { key: 'venue_name', label: 'Venue Name', placeholderText: 'Enter convention hall / venue name', required: true, type: 'text' },
      { key: 'venue_address', label: 'Venue Address', placeholderText: 'Enter full street, town / city address', required: true, type: 'text' },
      { key: 'family_name', label: 'Host Family Name', placeholderText: 'e.g. The Sharma Family', required: true, type: 'text' },
      { key: 'invitation_message', label: 'Custom Invitation Message', placeholderText: 'Optional warm message for relatives and friends', required: false, type: 'textarea' },
    ],
    defaultValues: {
      bride_name: '',
      groom_name: '',
      wedding_date: '',
      wedding_time: '',
      reception_date: '',
      reception_time: '',
      venue_name: '',
      venue_address: '',
      family_name: '',
      invitation_message: '',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // 4. POLITICAL SURVEY TEMPLATE
  {
    id: 'tpl_political_voter_survey',
    category: 'political_survey',
    name: 'Constituency Voter Sentiment Survey',
    description: 'Constituency-wide public opinion and voter priority feedback survey.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం! {{organization_name}} నిర్వహించే ప్రజాభిప్రాయ సర్వే కోసం మాట్లాడుతున్నాం. {{constituency_name}} నియోజకవర్గంలో అభివృద్ధి ప్రాధాన్యతలపై మీ విలువైన అభిప్రాయం తెలియజేయగలరు.',
      hi: 'नमस्ते! {{organization_name}} द्वारा आयोजित जनमत सर्वेक्षण के लिए कॉल किया गया है। {{constituency_name}} में विकास प्राथमिकताओं पर अपनी राय दें।',
      en: 'Hello! Calling on behalf of {{organization_name}} for a constituency opinion survey regarding development priorities in {{constituency_name}}.',
    },
    fields: [
      { key: 'survey_name', label: 'Survey Name', placeholderText: 'e.g. 2026 Voter Sentiment Survey', required: true, type: 'text' },
      { key: 'organization_name', label: 'Research Organization', placeholderText: 'e.g. Civic Research Foundation', required: true, type: 'text' },
      { key: 'constituency_name', label: 'Constituency Name', placeholderText: 'Enter constituency name', required: true, type: 'text' },
    ],
    defaultValues: {
      survey_name: '',
      organization_name: '',
      constituency_name: '',
    },
    questions: [
      { id: 'PS1', text: 'మీ నియోజకవర్గంలో ప్రస్తుతం అత్యంత ప్రాధాన్యత ఇవ్వాల్సిన ప్రధాన సమస్య ఏమిటి?', category: 'priorities', allowFollowUp: true },
      { id: 'PS2', text: 'గత ఐదేళ్లలో మీ ప్రాంతంలో జరిగిన అభివృద్ధి కార్యక్రమాలపై మీ సంతృప్తి ఎంత?', category: 'satisfaction', allowFollowUp: true },
      { id: 'PS3', text: 'భవిష్యత్తు నాయకత్వంలో మీరు ఎలాంటి అర్హతలు ముఖ్యంగా కోరుకుంటున్నారు?', category: 'leadership', allowFollowUp: true },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // 5. BUSINESS EVENT TEMPLATE
  {
    id: 'tpl_business_conference',
    category: 'business_event',
    name: 'Corporate & Business Event Invitation',
    description: 'Formal executive invitation and RSVP confirmation for conferences, seminars, and product launches.',
    isDefault: true,
    scriptTemplate: {
      te: 'నమస్కారం అండి! {{company_name}} తరపున {{event_title}} కు మిమ్మల్ని సాదరంగా ఆహ్వానిస్తున్నాము. ఈ సదస్సు {{event_date}} నాడు {{event_time}} కు {{venue_name}} లో జరుగుతుంది. మీ హాజరును ధృవీకరించడానికి 1 నొక్కండి.',
      hi: 'नमस्ते! {{company_name}} की ओर से {{event_title}} हेतु आपको आमंत्रित किया जा रहा है। यह कार्यक्रम {{event_date}} को {{event_time}} पर {{venue_name}} में आयोजित होगा। उपस्थिति की पुष्टि के लिए 1 दबाएं।',
      en: 'Greetings! On behalf of {{company_name}}, we cordially invite you to {{event_title}} scheduled on {{event_date}} at {{event_time}} at {{venue_name}}. Please press 1 to confirm your attendance.',
    },
    fields: [
      { key: 'company_name', label: 'Company / Host Organization', placeholderText: 'e.g. Apex Tech Enterprises', required: true, type: 'text' },
      { key: 'event_title', label: 'Event Title', placeholderText: 'e.g. Annual Leadership Summit 2026', required: true, type: 'text' },
      { key: 'event_date', label: 'Event Date', placeholderText: 'e.g. 15 December 2026', required: true, type: 'text' },
      { key: 'event_time', label: 'Event Time', placeholderText: 'e.g. 9:30 AM', required: true, type: 'text' },
      { key: 'venue_name', label: 'Venue & City', placeholderText: 'e.g. HICC Grand Ballroom, Hyderabad', required: true, type: 'text' },
    ],
    defaultValues: {
      company_name: '',
      event_title: '',
      event_date: '',
      event_time: '',
      venue_name: '',
    },
    dtmfOptions: [
      {
        digit: '1',
        labelEn: 'Confirm Attendance (RSVP Yes)',
        spokenPrompt: {
          te: 'హాజరు ధృవీకరణ కోసం 1 నొక్కండి',
          hi: 'उपस्थिति पुष्टि के लिए 1 दबाएं',
          en: 'Press 1 to confirm attendance',
        },
      },
      {
        digit: '2',
        labelEn: 'Cannot Attend / Request Recording',
        spokenPrompt: {
          te: 'హాజరు కాలేనప్పుడు 2 నొక్కండి',
          hi: 'अनुपस्थिति हेतु 2 दबाएं',
          en: 'Press 2 if unable to attend',
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

