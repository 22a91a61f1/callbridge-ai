import { SurveyConfig } from './types';

// ==================================================
// SURVEY A — PUBLIC FACILITIES (ప్రజా సదుపాయాల సర్వే)
// ==================================================
export const SURVEY_A_PUBLIC_FACILITIES: SurveyConfig = {
  id: 'survey-a-public-facilities',
  surveyType: 'PUBLIC_FACILITIES',
  title: 'ప్రజా సదుపాయాల సర్వే (SURVEY A — PUBLIC FACILITIES)',
  description: 'తాగునీరు, రోడ్లు, విద్యుత్, డ్రైనేజీ, చెత్త సేకరణ, ఆరోగ్యం, విద్య, రవాణా మరియు ప్రజా సేవలపై పౌర సర్వే.',
  targetLanguage: 'Telugu',
  questions: [
    {
      id: 'A1',
      text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
      category: 'తాగునీరు'
    },
    {
      id: 'A2',
      text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
      category: 'రోడ్లు'
    },
    {
      id: 'A3',
      text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?',
      category: 'విద్యుత్'
    },
    {
      id: 'A4',
      text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?',
      category: 'డ్రైనేజీ'
    },
    {
      id: 'A5',
      text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?',
      category: 'చెత్త సేకరణ & పారిశుధ్యం'
    },
    {
      id: 'A6',
      text: 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?',
      category: 'ఆరోగ్య సేవలు'
    },
    {
      id: 'A7',
      text: 'మీ ప్రాంతంలోని ప్రభుత్వ విద్యా సదుపాయాల గురించి మీ అభిప్రాయం ఏమిటి?',
      category: 'విద్యా సదుపాయాలు'
    },
    {
      id: 'A8',
      text: 'మీ ప్రాంతంలో ప్రజా రవాణా సౌకర్యం ఎలా ఉంది?',
      category: 'ప్రజా రవాణా'
    },
    {
      id: 'A9',
      text: 'ప్రభుత్వ సేవలను పొందడంలో మీకు సాధారణంగా ఎలాంటి సమస్యలు ఎదురవుతున్నాయి?',
      category: 'ప్రభుత్వ సేవలు'
    },
    {
      id: 'A10',
      text: 'మీ ప్రాంతంలో వెంటనే మెరుగుపరచాల్సిన ఒక ముఖ్యమైన విషయం ఏది అని మీరు భావిస్తున్నారు?',
      category: 'ప్రధాన ప్రాధాన్యత'
    }
  ],
  knowledgeBase: `==================================================
SURVEY A — PUBLIC FACILITIES KNOWLEDGE BASE
==================================================
PURPOSE:
Understand residents' experiences and opinions about public facilities and local services.

INTRODUCTION PROTOCOL:
"నమస్కారం. మీ ప్రాంతంలోని ప్రజా సదుపాయాలు మరియు సేవల గురించి మీ అభిప్రాయాలను తెలుసుకోవడానికి ఈ చిన్న సర్వే నిర్వహిస్తున్నాం. మీకు కొన్ని ప్రశ్నలు అడుగుతాను."

QUESTIONS & DYNAMIC FOLLOW-UPS:
- Question A1 (Drinking Water):
  "మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?"
  Possible responses: చాలా బాగుంది, బాగుంది, సాధారణంగా ఉంది, బాగోలేదు, చాలా బాగోలేదు, తెలియదు.
  If the respondent says the water supply is poor or irregular:
  Follow-up: "నీటి సమస్య ప్రధానంగా ఏ విధంగా ఉంది?" (సరఫరా సరిగ్గా లేకపోవడం, నీటి నాణ్యత, సమయానికి నీరు రాకపోవడం, తగినంత నీరు లేకపోవడం, ఇతర సమస్య).
  If irregular supply mentioned: "సాధారణంగా వారానికి ఎన్ని రోజులు నీటి సమస్య ఎదురవుతోంది?"

- Question A2 (Roads):
  "మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?"
  If poor: "రోడ్ల విషయంలో ప్రధానంగా ఏ సమస్యను మీరు ఎదుర్కొంటున్నారు?" (గుంతలు, వర్షం సమయంలో సమస్య, రోడ్లు సరిగ్గా లేకపోవడం, ట్రాఫిక్, డ్రైనేజీ సమస్య, ఇతర సమస్య).

- Question A3 (Electricity):
  "మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?"
  If frequent problems reported: "విద్యుత్ సమస్యలు సాధారణంగా ఎంత తరచుగా ఎదురవుతున్నాయి?"

- Question A4 (Drainage):
  "మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?"
  If poor: "డ్రైనేజీ విషయంలో ప్రధాన సమస్య ఏమిటి?"

- Question A5 (Waste Management):
  "మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?"
  If poor: "చెత్త సేకరణలో ప్రధానంగా ఏ సమస్య ఉంది?"

- Question A6 (Healthcare):
  "మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?"
  If no: "ఆరోగ్య సేవల్లో ప్రధానంగా ఏ విషయం మెరుగుపడాలి అని మీరు భావిస్తున్నారు?"

- Question A7 (Education):
  "మీ ప్రాంతంలోని ప్రభుత్వ విద్యా సదుపాయాల గురించి మీ అభిప్రాయం ఏమిటి?"
  Follow-up: "విద్యా రంగంలో ఏ విషయం మెరుగుపడాలి అని మీరు భావిస్తున్నారు?"

- Question A8 (Public Transport):
  "మీ ప్రాంతంలో ప్రజా రవాణా సౌకర్యం ఎలా ఉంది?"
  If poor: "ప్రజా రవాణాలో ప్రధాన సమస్య ఏమిటి?"

- Question A9 (Government Services):
  "ప్రభుత్వ సేవలను పొందడంలో మీకు సాధారణంగా ఎలాంటి సమస్యలు ఎదురవుతున్నాయి?"
  If they describe a problem: Ask one relevant clarification question. Do not invent government procedures or policies.

- Question A10 (Overall Priority):
  "మీ ప్రాంతంలో వెంటనే మెరుగుపరచాల్సిన ఒక ముఖ్యమైన విషయం ఏది అని మీరు భావిస్తున్నారు?"
  Do not suggest an answer. Allow the respondent to answer freely.

SURVEY A COMPLETION:
After all required questions are completed:
"మీ సమయానికి ధన్యవాదాలు. ప్రజా సదుపాయాలపై మీ అభిప్రాయాలను నమోదు చేశాం."
Then end the survey.`
};

// ==================================================
// SURVEY B — ELECTION AND VOTER OPINION (ఎన్నికలు మరియు ఓటరు అభిప్రాయ సర్వే)
// ==================================================
export const SURVEY_B_ELECTION_VOTER_OPINION: SurveyConfig = {
  id: 'survey-b-election-voter-opinion',
  surveyType: 'ELECTION_VOTER_OPINION',
  title: 'ఎన్నికలు మరియు ఓటరు అభిప్రాయ సర్వే (SURVEY B — ELECTION AND VOTER OPINION)',
  description: 'రాబోయే ఎన్నికల అంశాలు, ప్రజా సేవలు, ప్రాధాన్యతలు మరియు ఓటరు నిర్ణయాలపై తటస్థ సర్వే.',
  targetLanguage: 'Telugu',
  questions: [
    {
      id: 'B1',
      text: 'రాబోయే ఎన్నికల్లో మీ ప్రాంతానికి సంబంధించిన ఏ సమస్యలు మీకు ముఖ్యంగా అనిపిస్తున్నాయి?',
      category: 'ముఖ్య సమస్యలు'
    },
    {
      id: 'B2',
      text: 'ప్రస్తుతం మీ ప్రాంతంలోని ప్రజా సేవల గురించి మీ అభిప్రాయం ఏమిటి?',
      category: 'ప్రజా సేవలు'
    },
    {
      id: 'B3',
      text: 'తదుపరి ప్రభుత్వ కాలంలో మీ ప్రాంతంలో ఏ అంశాలకు ఎక్కువ ప్రాధాన్యత ఇవ్వాలని మీరు భావిస్తున్నారు?',
      category: 'భవిష్యత్ ప్రాధాన్యతలు'
    },
    {
      id: 'B4',
      text: 'ఒక అభ్యర్థిని అంచనా వేసేటప్పుడు మీకు ముఖ్యంగా అనిపించే లక్షణాలు ఏమిటి?',
      category: 'అభ్యర్థి లక్షణాలు'
    },
    {
      id: 'B5',
      text: 'ఎన్నికల్లో పోటీ చేస్తున్న అభ్యర్థులు లేదా పార్టీల గురించి మీకు తగినంత సమాచారం ఉందని అనుకుంటున్నారా?',
      category: 'అభ్యర్థి/పార్టీ సమాచారం'
    },
    {
      id: 'B6',
      text: 'మీ ఓటు నిర్ణయించుకునేటప్పుడు మీరు సాధారణంగా ఏ అంశాలను పరిగణలోకి తీసుకుంటారు?',
      category: 'ఓటు నిర్ణయం'
    },
    {
      id: 'B7',
      text: 'ఓటు వేయడానికి మీకు ఏవైనా సౌకర్య సమస్యలు లేదా అడ్డంకులు ఎదురవుతున్నాయా?',
      category: 'ఓటింగ్ సౌలభ్యం'
    },
    {
      id: 'B8',
      text: 'ఎన్నికల గురించి ప్రజలకు మరింత సమాచారం అందించాల్సిన అవసరం ఉందని మీరు భావిస్తున్నారా?',
      category: 'ఓటరు సమాచార అవసరం'
    },
    {
      id: 'B9',
      text: 'ఎన్నికల ప్రక్రియ గురించి మీరు చెప్పాలనుకునే మరేదైనా అభిప్రాయం ఉందా?',
      category: 'సాధారణ ఎన్నికల అభిప్రాయం'
    }
  ],
  knowledgeBase: `==================================================
SURVEY B — ELECTION AND VOTER OPINION KNOWLEDGE BASE
==================================================
PURPOSE:
Understand respondents' views about election-related issues and priorities in a neutral, non-persuasive way.

CRITICAL POLITICAL NEUTRALITY MANDATE:
- This survey is strictly for collecting opinions, not changing opinions.
- The agent must remain completely neutral and listen without judgment.
- NEVER persuade the respondent to support or oppose any candidate, political party, ideology, or political position.
- NEVER tell the respondent whom to vote for.
- NEVER suggest that one answer is better than another.
- NEVER manipulate the respondent's political opinion.
- NEVER campaign, recommend a candidate, or recommend a political party.
- NEVER pressure someone to reveal their vote.
- NEVER use caste, religion, community, language, or other protected/group identity as a basis for persuasion.
- IF A RESPONDENT ASKS: "నేను ఎవరికి ఓటు వేయాలి?" (Whom should I vote for?)
  MANDATORY RESPONSE:
  "ఎవరికి ఓటు వేయాలనే నిర్ణయం మీదే. నేను మీకు ఏ అభ్యర్థిని లేదా పార్టీని ఎంచుకోమని చెప్పలేను."
  Then return to the survey if appropriate.

QUESTIONS & PROTOCOLS:
- Question B1 (Important Issues):
  "రాబోయే ఎన్నికల్లో మీ ప్రాంతానికి సంబంధించిన ఏ సమస్యలు మీకు ముఖ్యంగా అనిపిస్తున్నాయి?"
  Allow an open-ended answer. Do not suggest a preferred issue.
  If the respondent mentions an issue, ask one relevant neutral follow-up.
  Example: Respondent says "ఉద్యోగాలు." Agent: "అర్థమైంది. ఉద్యోగాల విషయంలో మీ ప్రాంతంలో ఏ మార్పు అవసరమని మీరు భావిస్తున్నారు?"

- Question B2 (Public Services):
  "ప్రస్తుతం మీ ప్రాంతంలోని ప్రజా సేవల గురించి మీ అభిప్రాయం ఏమిటి?"
  Allow the respondent to express positive, negative, or neutral opinions. Do not argue.

- Question B3 (Priorities):
  "తదుపరి ప్రభుత్వ కాలంలో మీ ప్రాంతంలో ఏ అంశాలకు ఎక్కువ ప్రాధాన్యత ఇవ్వాలని మీరు భావిస్తున్నారు?"
  Allow an open-ended response. Do not provide suggested political answers.

- Question B4 (Candidate Qualities):
  "ఒక అభ్యర్థిని అంచనా వేసేటప్పుడు మీకు ముఖ్యంగా అనిపించే లక్షణాలు ఏమిటి?"
  Possible respondent-generated answers: నిజాయితీ, ప్రజా సేవ, అభివృద్ధి, అనుభవం, స్థానిక సమస్యలపై అవగాహన, ఇతర లక్షణాలు. Do not rank these qualities.

- Question B5 (Candidate/Party Information):
  "ఎన్నికల్లో పోటీ చేస్తున్న అభ్యర్థులు లేదా పార్టీల గురించి మీకు తగినంత సమాచారం ఉందని అనుకుంటున్నారా?"
  If no: "మీకు ఏ రకమైన సమాచారం మరింత అవసరమని మీరు భావిస్తున్నారు?"

- Question B6 (Voting Decision):
  "మీ ఓటు నిర్ణయించుకునేటప్పుడు మీరు సాధారణంగా ఏ అంశాలను పరిగణలోకి తీసుకుంటారు?"
  Do not ask the respondent to reveal their specific vote unless voluntarily provided. Do not attempt to influence.

- Question B7 (Election Access):
  "ఓటు వేయడానికి మీకు ఏవైనా సౌకర్య సమస్యలు లేదా అడ్డంకులు ఎదురవుతున్నాయా?"
  If yes: "ఆ సమస్య ఏమిటో వివరించగలరా?" Do not invent election procedures.

- Question B8 (Voter Information):
  "ఎన్నికల గురించి ప్రజలకు మరింత సమాచారం అందించాల్సిన అవసరం ఉందని మీరు భావిస్తున్నారా?"
  If yes: "ఏ రకమైన సమాచారం ప్రజలకు ఉపయోగకరంగా ఉంటుందని మీరు భావిస్తున్నారు?"

- Question B9 (General Election Feedback):
  "ఎన్నికల ప్రక్రియ గురించి మీరు చెప్పాలనుకునే మరేదైనా అభిప్రాయం ఉందా?"
  Allow an open-ended response. Do not lead the respondent.

SURVEY B COMPLETION:
After all required questions are completed:
"మీ అభిప్రాయాలను పంచుకున్నందుకు ధన్యవాదాలు. మీ సమాధానాలు నమోదు చేయబడ్డాయి."
End the survey politely.`
};

// ==================================================
// ALL PRESETS LIST
// ==================================================
export const PRESET_SURVEYS: SurveyConfig[] = [
  SURVEY_A_PUBLIC_FACILITIES,
  SURVEY_B_ELECTION_VOTER_OPINION,
  {
    id: 'unconfigured-dev-phase',
    surveyType: 'DEVELOPMENT_UNCONFIGURED',
    title: 'డెవలప్‌మెంట్ దశ (ప్రశ్నలు ఇంకా కాన్ఫిగర్ చేయబడలేదు)',
    description: 'సర్వే ప్రశ్నలు ఇంకా అందించబడని ప్రారంభ దశ. ఏజెంట్ ఎటువంటి ప్రశ్నను సొంతంగా సృష్టించకుండా తెలియజేస్తుంది.',
    targetLanguage: 'Telugu',
    questions: [],
    knowledgeBase: ''
  }
];
