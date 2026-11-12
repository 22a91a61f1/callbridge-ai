import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_session'): SurveySessionState {
  return {
    session_id: id,
    survey_id: 'public_facilities',
    language: 'te',
    current_question_id: 'A1',
    current_question_topic: 'drinking_water',
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
    answers: {},
    pending_follow_up: null,
    asked_follow_ups: [],
    completed_follow_ups: [],
    completed_questions: [],
    conversation_status: 'waiting_for_answer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

console.log('================================================================');
console.log('TESTING INTENT ACKNOWLEDGEMENT AND AMBIGUOUS ANSWER HANDLING');
console.log('================================================================\n');

// TEST 1: AMBIGUOUS SHORT ANSWER ("ok") ON ROADS
console.log('--- TEST 1: Ambiguous answer "ok" on Roads ---');
let state = createFreshSession('test_ambig_1');
// Move to roads
state.current_question_id = 'A2';
state.current_question_topic = 'roads';
state.topic_statuses!.drinking_water = 'sufficiently_answered';

const res1 = processTurnMemory('ok', state);
console.log('Agent Reply 1:', res1.directReply);
console.log('Topic Statuses 1:', res1.updatedState.topic_statuses);
console.log('Pending Follow-up 1:', res1.updatedState.pending_follow_up);

if (
  res1.updatedState.topic_statuses?.roads !== 'sufficiently_answered' &&
  res1.directReply?.includes('రోడ్ల పరిస్థితి') &&
  res1.directReply?.includes('సమస్య ఉందా')
) {
  console.log('>> PASS TEST 1: "ok" was not treated as positive/negative; clarification was asked.');
} else {
  console.error('>> FAIL TEST 1: Ambiguous response "ok" not handled correctly.');
  process.exit(1);
}

// TEST 2: SIMPLE NEGATIVE ("baledhu") ON ROADS
console.log('\n--- TEST 2: Simple negative "baledhu" on Roads ---');
let state2 = createFreshSession('test_neg_1');
state2.current_question_id = 'A2';
state2.current_question_topic = 'roads';
state2.topic_statuses!.drinking_water = 'sufficiently_answered';

const res2 = processTurnMemory('baledhu', state2);
console.log('Agent Reply 2:', res2.directReply);
console.log('Topic Statuses 2:', res2.updatedState.topic_statuses);
console.log('Pending Follow-up 2:', res2.updatedState.pending_follow_up);

if (
  res2.updatedState.topic_statuses?.roads === 'needs_follow_up' &&
  res2.directReply?.includes('రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది')
) {
  console.log('>> PASS TEST 2: "baledhu" marked as needs_follow_up, asked specific follow-up.');
} else {
  console.error('>> FAIL TEST 2: "baledhu" was not handled correctly.');
  process.exit(1);
}

// Follow-up answer with specific details:
const res2FollowUp = processTurnMemory(
  'holes unnai, varsham lo water nilusthai, accidents kuda avuthai',
  res2.updatedState
);
console.log('Agent Reply 2 Follow-Up:', res2FollowUp.directReply);
console.log('Topic Statuses 2 Follow-Up:', res2FollowUp.updatedState.topic_statuses);
console.log('Answers 2:', res2FollowUp.updatedState.answers);

if (
  res2FollowUp.updatedState.topic_statuses?.roads === 'sufficiently_answered' &&
  res2FollowUp.directReply?.includes('గుంతలు') &&
  (res2FollowUp.directReply?.includes('వర్షం') || res2FollowUp.directReply?.includes('నీళ్లు')) &&
  res2FollowUp.directReply?.includes('యాక్సిడెంట్లు') &&
  res2FollowUp.directReply?.includes('కరెంట్ సరఫరా')
) {
  console.log('>> PASS TEST 2 Follow-Up: Actual information acknowledged contextualizing potholes, water logging, and accidents before moving to electricity!');
} else {
  console.error('>> FAIL TEST 2 Follow-Up: Contextual acknowledgement missing or incorrect.');
  process.exit(1);
}

// TEST 3: DETAILED ROAD ANSWER UPFRONT
console.log('\n--- TEST 3: Detailed answer upfront on Roads ---');
let state3 = createFreshSession('test_road_detailed');
state3.current_question_id = 'A2';
state3.current_question_topic = 'roads';
state3.topic_statuses!.drinking_water = 'sufficiently_answered';

const res3 = processTurnMemory(
  'రోడ్లలో చాలా గుంతలు ఉన్నాయి. వర్షం పడితే నీళ్లు నిలిచిపోతాయి. దాని వల్ల accidents కూడా అవుతున్నాయి.',
  state3
);
console.log('Agent Reply 3:', res3.directReply);
console.log('Answers 3:', res3.updatedState.answers);

if (
  res3.updatedState.topic_statuses?.roads === 'sufficiently_answered' &&
  res3.updatedState.answers.roads_problem === 'potholes' &&
  res3.updatedState.answers.rain_related_problem === true &&
  res3.updatedState.answers.safety_concern === 'accidents' &&
  res3.directReply?.includes('కరెంట్ సరఫరా')
) {
  console.log('>> PASS TEST 3: Detailed road answer immediately marked sufficiently_answered and moved to electricity.');
} else {
  console.error('>> FAIL TEST 3: Detailed upfront road answer failed.');
  process.exit(1);
}

// TEST 4: MULTI-TOPIC ("roads and drainage both bad")
console.log('\n--- TEST 4: Multi-topic ("roads and drainage both bad") ---');
let state4 = createFreshSession('test_multi_1');
state4.current_question_id = 'A2';
state4.current_question_topic = 'roads';
state4.topic_statuses!.drinking_water = 'sufficiently_answered';

const res4 = processTurnMemory('roads and drainage both bad', state4);
console.log('Agent Reply 4:', res4.directReply);
console.log('Answers 4:', res4.updatedState.answers);
console.log('Pending Follow-up 4:', res4.updatedState.pending_follow_up);

if (
  res4.updatedState.answers.roads_condition === 'poor' &&
  res4.updatedState.answers.drainage_condition === 'poor' &&
  res4.directReply?.includes('రోడ్లు మరియు డ్రైనేజీ')
) {
  console.log('>> PASS TEST 4: Multi-topic recognized, both stored as poor, appropriate follow-up asked.');
} else {
  console.error('>> FAIL TEST 4: Multi-topic handling failed.');
  process.exit(1);
}

// TEST 5: WASTE MANAGEMENT IRREGULAR COLLECTION
console.log('\n--- TEST 5: Waste management irregular collection ---');
let state5 = createFreshSession('test_waste_1');
state5.current_question_id = 'A5';
state5.current_question_topic = 'waste_management';
state5.topic_statuses!.drinking_water = 'sufficiently_answered';
state5.topic_statuses!.roads = 'sufficiently_answered';
state5.topic_statuses!.electricity = 'sufficiently_answered';
state5.topic_statuses!.drainage = 'sufficiently_answered';

const res5 = processTurnMemory('చెత్త మూడు నాలుగు రోజులకు ఒకసారి మాత్రమే తీసుకెళ్తారు.', state5);
console.log('Agent Reply 5:', res5.directReply);
console.log('Answers 5:', res5.updatedState.answers);

if (
  res5.updatedState.topic_statuses?.waste_management === 'sufficiently_answered' &&
  res5.directReply?.includes('చెత్త సేకరణ రెగ్యులర్‌గా జరగడం లేదని అర్థమైంది') &&
  res5.directReply?.includes('ఆరోగ్య సేవలు')
) {
  console.log('>> PASS TEST 5: Contextual acknowledgement for irregular waste collection before moving to healthcare.');
} else {
  console.error('>> FAIL TEST 5: Waste management acknowledgement failed.');
  process.exit(1);
}

// TEST 6: HEALTHCARE DOCTORS ISSUE
console.log('\n--- TEST 6: Healthcare doctors issue ---');
let state6 = createFreshSession('test_health_1');
state6.current_question_id = 'A6';
state6.current_question_topic = 'healthcare';
state6.topic_statuses!.drinking_water = 'sufficiently_answered';
state6.topic_statuses!.roads = 'sufficiently_answered';
state6.topic_statuses!.electricity = 'sufficiently_answered';
state6.topic_statuses!.drainage = 'sufficiently_answered';
state6.topic_statuses!.waste_management = 'sufficiently_answered';

const res6 = processTurnMemory('డాక్టర్లు సరిగ్గా ఉండరు.', state6);
console.log('Agent Reply 6:', res6.directReply);
console.log('Pending Follow-up 6:', res6.updatedState.pending_follow_up);

if (
  res6.updatedState.topic_statuses?.healthcare === 'needs_follow_up' &&
  res6.directReply?.includes('డాక్టర్లు అందుబాటులో ఉండటం సమస్యగా ఉందని అర్థమైంది') &&
  res6.directReply?.includes('మందులు లేదా ఇతర ఆరోగ్య సేవల విషయంలో కూడా ఏమైనా ఇబ్బంది ఉందా')
) {
  console.log('>> PASS TEST 6: Contextual acknowledgement of doctor unavailability and specific follow-up on medicines.');
} else {
  console.error('>> FAIL TEST 6: Healthcare doctors issue failed.');
  process.exit(1);
}

console.log('\n================================================================');
console.log('ALL INTENT ACKNOWLEDGEMENT AND AMBIGUITY TESTS PASSED 100%!');
console.log('================================================================');
