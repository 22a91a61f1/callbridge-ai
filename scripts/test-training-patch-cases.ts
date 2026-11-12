import { processTurnMemory } from '../server/survey/memoryEngine.js';
import { SurveySessionState } from '../server/survey/sessionManager.js';

function createFreshSession(id: string = 'test_session', currentTopic: string = 'drinking_water', currentQId: string = 'A1'): SurveySessionState {
  return {
    session_id: id,
    survey_id: 'survey-a-public-facilities',
    language: 'te',
    current_question_id: currentQId,
    current_question_topic: currentTopic,
    answers: {},
    pending_follow_up: null,
    asked_follow_ups: [],
    completed_follow_ups: [],
    completed_questions: [],
    conversation_status: 'waiting_for_answer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    topic_statuses: {
      drinking_water: 'not_started',
      roads: 'not_started',
      electricity: 'not_started',
      drainage: 'not_started',
      waste_management: 'not_started',
      healthcare: 'not_started',
      education: 'not_started',
      public_transport: 'not_started',
      government_services: 'not_started',
      top_priority: 'not_started',
    },
  };
}

const mockQuestions = [
  { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'drinking_water' },
  { id: 'A2', text: 'మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'roads' },
  { id: 'A3', text: 'మరి కరెంట్ సరఫరా ఎలా ఉంది?', category: 'electricity' },
  { id: 'A4', text: 'మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?', category: 'drainage' },
  { id: 'A5', text: 'మరి మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య పనులు ఎలా జరుగుతున్నాయి?', category: 'waste_management' },
  { id: 'A6', text: 'మరి మీ ప్రాంతంలో ఆరోగ్య సేవలు ఎలా ఉన్నాయి? ఆసుపత్రులు అందుబాటులో ఉన్నాయా?', category: 'healthcare' },
  { id: 'A7', text: 'మరి మీ ప్రాంతంలోని ప్రభుత్వ విద్యా సదుపాయాలు లేదా పాఠశాలల గురించి మీ అభిప్రాయం ఏమిటి?', category: 'education' },
  { id: 'A8', text: 'మీ ప్రాంతంలో ఆర్టీసీ బస్సు సౌకర్యం ఎలా ఉంది?', category: 'public_transport' },
  { id: 'A9', text: 'మరి మీ ప్రాంతంలో ప్రభుత్వ సేవలు ఎలా ఉన్నాయి?', category: 'government_services' },
  { id: 'A10', text: 'మీ ప్రాంతంలో వెంటనే పరిష్కరించాల్సిన ప్రధాన సమస్య ఏమిటి?', category: 'top_priority' },
];

console.log('================================================================');
console.log('TESTING TRAINING PATCH CASES: INFORMATION-AWARE, NO-INVENTION, BUSY+BYE');
console.log('================================================================\n');

// ==========================================================================
// TEST A: Healthcare Information-Aware Follow-up (Section 1, 4, 8)
// ==========================================================================
console.log('--- TEST A: Healthcare "levvu ma ooru lo oka hospital matramey vundhi" ---');
let sHealthcare = createFreshSession('health_test', 'healthcare', 'A6');
sHealthcare.topic_statuses = {
  drinking_water: 'sufficiently_answered',
  roads: 'sufficiently_answered',
  electricity: 'sufficiently_answered',
  drainage: 'sufficiently_answered',
  waste_management: 'sufficiently_answered',
  healthcare: 'not_started',
  education: 'not_started',
  public_transport: 'not_started',
  government_services: 'not_started',
  top_priority: 'not_started',
};

let rHealth1 = processTurnMemory('levvu ma ooru lo oka hospital matramey vundhi', sHealthcare, mockQuestions);
console.log('Turn 1 Agent reply:', rHealth1.directReply);
console.log('Answers stored:', rHealth1.updatedState.answers);

if (rHealth1.directReply?.includes('ఆరోగ్య సేవల్లో ప్రధానంగా ఏ సమస్య ఎదురవుతోంది?')) {
  throw new Error('FAIL TEST A: Asked generic question instead of specific follow-up!');
}
if (!rHealth1.directReply?.includes('ఒక hospital మాత్రమే ఉందన్నమాట') && !rHealth1.directReply?.includes('ఒక హాస్పిటల్ మాత్రమే')) {
  throw new Error(`FAIL TEST A: Did not acknowledge single hospital in reply: "${rHealth1.directReply}"`);
}
if (!rHealth1.directReply?.includes('doctors availability')) {
  throw new Error(`FAIL TEST A: Did not ask about doctor availability: "${rHealth1.directReply}"`);
}
console.log('>> PASS TEST A Turn 1: Successfully asked specific follow-up connected to single hospital without generic questionnaire.\n');

// Turn 2: Respondent answers doctor availability
let rHealth2 = processTurnMemory('avunu doctors undaru', rHealth1.updatedState, mockQuestions);
console.log('Turn 2 Agent reply:', rHealth2.directReply);
console.log('Answers stored:', rHealth2.updatedState.answers);
if (rHealth2.updatedState.topic_statuses?.healthcare !== 'sufficiently_answered') {
  throw new Error('FAIL TEST A Turn 2: Healthcare not marked sufficiently_answered');
}
if (!rHealth2.directReply?.includes('విద్యా సదుపాయాలు') && !rHealth2.directReply?.includes('పాఠశాల')) {
  throw new Error(`FAIL TEST A Turn 2: Did not transition to next topic (education): "${rHealth2.directReply}"`);
}
console.log('>> PASS TEST A Turn 2: Successfully marked sufficiently_answered and moved to education.\n');

// Test A2: Upfront sufficient info
let sHealthFull = createFreshSession('health_full', 'healthcare', 'A6');
sHealthFull.topic_statuses = { ...sHealthcare.topic_statuses };
let rHealthFull = processTurnMemory('levvu ma ooru lo oka hospital matramey vundhi doctors kuda undaru', sHealthFull, mockQuestions);
console.log('Upfront full reply:', rHealthFull.directReply);
if (rHealthFull.updatedState.topic_statuses?.healthcare !== 'sufficiently_answered') {
  throw new Error('FAIL TEST A2: Full healthcare info not marked sufficiently_answered immediately');
}
if (rHealthFull.directReply?.includes('doctors availability కూడా సమస్యగా ఉందా')) {
  throw new Error('FAIL TEST A2: Re-asked doctor availability when already provided!');
}
console.log('>> PASS TEST A2: Upfront full healthcare info did not ask redundant follow-up.\n');

// ==========================================================================
// TEST B: Drainage Multiple Facts & No Invention (Section 2, 3, 8)
// ==========================================================================
console.log('--- TEST B: Drainage "clean cheyaru varsham vachinapudu road medha ki vastadi" ---');
let sDrainage = createFreshSession('drainage_test', 'drainage', 'A4');
let rDrainage = processTurnMemory('clean cheyaru varsham vachinapudu road medha ki vastadi', sDrainage, mockQuestions);
console.log('Drainage Agent reply:', rDrainage.directReply);
console.log('Drainage Answers stored:', rDrainage.updatedState.answers);

if (rDrainage.updatedState.answers['drainage_cleaning'] !== 'inadequate') {
  throw new Error(`FAIL TEST B: drainage_cleaning not 'inadequate': ${rDrainage.updatedState.answers['drainage_cleaning']}`);
}
if (rDrainage.updatedState.answers['rain_condition'] !== 'mentioned') {
  throw new Error(`FAIL TEST B: rain_condition not 'mentioned': ${rDrainage.updatedState.answers['rain_condition']}`);
}
if (rDrainage.updatedState.answers['drainage_water_reaches_road'] !== 'yes') {
  throw new Error(`FAIL TEST B: drainage_water_reaches_road not 'yes': ${rDrainage.updatedState.answers['drainage_water_reaches_road']}`);
}
if (rDrainage.updatedState.topic_statuses?.drainage !== 'sufficiently_answered') {
  throw new Error(`FAIL TEST B: drainage not marked sufficiently_answered`);
}

// Ensure NO invention
const drainageReply = rDrainage.directReply || '';
if (/accidents|యాక్సిడెంట్|flooding|వరద|traffic|ట్రాఫిక్/i.test(drainageReply)) {
  throw new Error(`FAIL TEST B: Invented details in reply: "${drainageReply}"`);
}
console.log('>> PASS TEST B: All 3 facts stored conceptually and zero unmentioned details invented!\n');

// ==========================================================================
// TEST C: Busy + Bye Handling (Section 5, 6, 8)
// ==========================================================================
console.log('--- TEST C: Busy + Bye Statements ---');
const busyByePhrases = [
  'nenu busy ga vunna bye',
  'busy ga unna bye',
  'నేను busyగా ఉన్నాను bye',
  'ఇప్పుడు busy, bye',
  'నాకు ఇప్పుడు టైం లేదు, bye',
];

for (const phrase of busyByePhrases) {
  let sBusyBye = createFreshSession('busy_bye_test');
  let rBusyBye = processTurnMemory(phrase, sBusyBye, mockQuestions);
  console.log(`Input "${phrase}" -> Reply: "${rBusyBye.directReply}"`);

  if (rBusyBye.updatedState.conversation_status !== 'ended_by_user') {
    throw new Error(`FAIL TEST C: Status not ended_by_user for "${phrase}": ${rBusyBye.updatedState.conversation_status}`);
  }
  if (rBusyBye.updatedState.answers['busy'] !== true) {
    throw new Error(`FAIL TEST C: busy !== true for "${phrase}"`);
  }
  if (rBusyBye.updatedState.answers['call_end'] !== true) {
    throw new Error(`FAIL TEST C: call_end !== true for "${phrase}"`);
  }
  if (rBusyBye.directReply?.includes('ఎప్పుడు సౌకర్యంగా ఉంటుందో చెప్పండి')) {
    throw new Error(`FAIL TEST C: Asked for callback time on busy + bye! Reply: "${rBusyBye.directReply}"`);
  }
  if (!rBusyBye.directReply?.includes('మీరు busyగా ఉన్నారు కాబట్టి ఇక్కడితో ఆపేస్తాను')) {
    throw new Error(`FAIL TEST C: Reply did not match required closing: "${rBusyBye.directReply}"`);
  }
}
console.log('>> PASS TEST C: All Busy + Bye phrases ended survey naturally without requesting callback!\n');

// ==========================================================================
// TEST D: Road Natural Reflection & No Invention (Section 2)
// ==========================================================================
console.log('--- TEST D: Road Natural Reflection ---');
let sRoads = createFreshSession('roads_test', 'roads', 'A2');
let rRoads = processTurnMemory('holes ekkuva ga vunnai varsham vastey water vundipothunai', sRoads, mockQuestions);
console.log('Roads Reply:', rRoads.directReply);

if (rRoads.updatedState.topic_statuses?.roads !== 'sufficiently_answered') {
  throw new Error('FAIL TEST D: Roads not marked sufficiently_answered');
}
if (!rRoads.directReply?.includes('రోడ్లలో గుంతలు ఎక్కువగా ఉండటంతో వర్షం వచ్చినప్పుడు నీళ్లు నిలిచిపోతున్నాయన్నమాట')) {
  throw new Error(`FAIL TEST D: Did not reflect actual issue phrasing: "${rRoads.directReply}"`);
}
if (/accidents|యాక్సిడెంట్/i.test(rRoads.directReply || '')) {
  throw new Error(`FAIL TEST D: Invented accidents when not mentioned! Reply: "${rRoads.directReply}"`);
}
console.log('>> PASS TEST D: Roads acknowledged accurately without inventing accidents.\n');

console.log('================================================================');
console.log('ALL TRAINING PATCH TEST CASES PASSED 100%!');
console.log('================================================================');
