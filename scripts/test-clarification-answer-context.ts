import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_clarify_session'): SurveySessionState {
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
console.log('TESTING CLARIFICATION → ANSWER CONTEXT INTELLIGENCE');
console.log('================================================================\n');

// ====================================================================
// SUITE 1: EXACT USER TEST CASE
// ====================================================================
console.log('--- SUITE 1: Exact User Test Case ---');
let s1 = createFreshSession('s1');

// Turn 1: Respondent says "ok"
const r1 = processTurnMemory('ok', s1);
console.log('Turn 1 Agent:', r1.directReply);
if (!r1.directReply?.includes('నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?')) {
  throw new Error(`FAIL: Expected binary clarification question, got: ${r1.directReply}`);
}
console.log('>> PASS Turn 1: Clarification asked for "ok"');

// Turn 2: Respondent says "baney vundhi"
const r2 = processTurnMemory('baney vundhi', r1.updatedState);
console.log('Turn 2 Agent:', r2.directReply);
console.log('Topic Statuses:', r2.updatedState.topic_statuses);
console.log('Answers:', r2.updatedState.answers);

if (r2.directReply !== 'సరే అండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?') {
  throw new Error(`FAIL: Expected exact transition "సరే అండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?", got: "${r2.directReply}"`);
}
if (r2.updatedState.topic_statuses?.drinking_water !== 'sufficiently_answered') {
  throw new Error(`FAIL: drinking_water should be sufficiently_answered, got: ${r2.updatedState.topic_statuses?.drinking_water}`);
}
if (r2.updatedState.answers.water_service !== 'good') {
  throw new Error(`FAIL: water_service should be good, got: ${r2.updatedState.answers.water_service}`);
}
if (r2.directReply.includes('సమస్య ఎక్కువగా ఉంది')) {
  throw new Error('FAIL: Agent asked water problem question instead of moving forward!');
}
console.log('>> PASS SUITE 1: Exact test passed with 100% precision!\n');

// ====================================================================
// SUITE 2: ALL USER LISTED VARIATIONS FOR DRINKING WATER CLARIFICATION
// ====================================================================
console.log('--- SUITE 2: All User Listed Positive Variations ---');
const positiveVariations = [
  'baney vundhi',
  'baane undhi',
  'బానే ఉంది',
  'బాగానే ఉంది',
  'haa baane undhi',
  'yes, baane undhi',
  'baane untadi',
  'good',
  'fine',
  'no problem',
  'సమస్య లేదు',
];

for (const variant of positiveVariations) {
  let s = createFreshSession(`var_${variant}`);
  const clarRes = processTurnMemory('ok', s);
  const ansRes = processTurnMemory(variant, clarRes.updatedState);

  if (ansRes.updatedState.topic_statuses?.drinking_water !== 'sufficiently_answered') {
    throw new Error(`FAIL: Variant "${variant}" did not mark drinking_water sufficiently_answered`);
  }
  if (!ansRes.directReply?.includes('రోడ్ల పరిస్థితి')) {
    throw new Error(`FAIL: Variant "${variant}" did not move to roads. Reply: ${ansRes.directReply}`);
  }
  if (ansRes.directReply?.includes('సమస్య ఎక్కువగా ఉంది')) {
    throw new Error(`FAIL: Variant "${variant}" prompted for water problem follow-up!`);
  }
  console.log(`>> PASS Variant "${variant}" -> sufficiently_answered & moved to roads naturally.`);
}
console.log('>> PASS SUITE 2: All 11 positive variations passed!\n');

// ====================================================================
// SUITE 3: ELECTRICITY CLARIFICATION ("baane undhi")
// ====================================================================
console.log('--- SUITE 3: Electricity Clarification ("baane undhi") ---');
let s3 = createFreshSession('s3');
s3.current_question_id = 'A3';
s3.current_question_topic = 'electricity';
s3.topic_statuses!.drinking_water = 'sufficiently_answered';
s3.topic_statuses!.roads = 'sufficiently_answered';

const r3_1 = processTurnMemory('ok', s3);
console.log('Electricity Clarify Q:', r3_1.directReply);

const r3_2 = processTurnMemory('baane undhi', r3_1.updatedState);
console.log('Electricity Reply:', r3_2.directReply);
console.log('Electricity Status:', r3_2.updatedState.topic_statuses?.electricity);
console.log('Electricity Answer:', r3_2.updatedState.answers.electricity_status);

if (r3_2.updatedState.topic_statuses?.electricity !== 'sufficiently_answered') {
  throw new Error('FAIL: Electricity should be sufficiently_answered');
}
if (r3_2.updatedState.answers.electricity_status !== 'good') {
  throw new Error('FAIL: electricity_status should be good');
}
if (!r3_2.directReply?.includes('డ్రైనేజీ')) {
  throw new Error(`FAIL: Expected move to drainage, got: ${r3_2.directReply}`);
}
console.log('>> PASS SUITE 3: Electricity clarification passed!\n');

// ====================================================================
// SUITE 4: PROBLEM INQUIRY QUESTIONS ("సమస్య ఉందా?")
// ====================================================================
console.log('--- SUITE 4: Problem Inquiry ("సమస్య ఉందా?") with "ledu" vs "undi" ---');

// 4A: "ledu" -> No problem -> condition = positive, sufficiently_answered
let s4A = createFreshSession('s4A');
s4A.current_question_id = 'A3';
s4A.current_question_topic = 'electricity';
s4A.topic_statuses!.drinking_water = 'sufficiently_answered';
s4A.topic_statuses!.roads = 'sufficiently_answered';

// Agent asked: "కరెంట్ సరఫరాలో ఏమైనా సమస్య ఉందా?"
s4A.pending_follow_up = {
  topic: 'electricity',
  field: 'electricity_clarify',
  question: 'కరెంట్ సరఫరాలో ఏమైనా సమస్య ఉందా?',
  status: 'waiting_for_answer',
};

const r4A = processTurnMemory('ledu', s4A);
console.log('4A Agent Reply (ledu):', r4A.directReply);
if (r4A.updatedState.topic_statuses?.electricity !== 'sufficiently_answered') {
  throw new Error('FAIL 4A: "ledu" to "సమస్య ఉందా?" should be sufficiently_answered');
}
if (r4A.updatedState.answers.electricity_status !== 'good') {
  throw new Error('FAIL 4A: electricity_status should be good');
}
if (!r4A.directReply?.includes('డ్రైనేజీ')) {
  throw new Error(`FAIL 4A: Expected move to drainage, got: ${r4A.directReply}`);
}
console.log('>> PASS 4A: "ledu" interpreted as NO PROBLEM (positive).\n');

// 4B: "undi" -> Problem exists -> needs_follow_up
let s4B = createFreshSession('s4B');
s4B.current_question_id = 'A3';
s4B.current_question_topic = 'electricity';
s4B.topic_statuses!.drinking_water = 'sufficiently_answered';
s4B.topic_statuses!.roads = 'sufficiently_answered';

s4B.pending_follow_up = {
  topic: 'electricity',
  field: 'electricity_clarify',
  question: 'కరెంట్ సరఫరాలో ఏమైనా సమస్య ఉందా?',
  status: 'waiting_for_answer',
};

const r4B = processTurnMemory('undi', s4B);
console.log('4B Agent Reply (undi):', r4B.directReply);
if (r4B.updatedState.topic_statuses?.electricity !== 'needs_follow_up') {
  throw new Error('FAIL 4B: "undi" to "సమస్య ఉందా?" should be needs_follow_up');
}
if (!r4B.directReply?.includes('ఏ ఇబ్బంది వస్తోంది')) {
  throw new Error(`FAIL 4B: Expected follow-up question for electricity problem, got: ${r4B.directReply}`);
}
console.log('>> PASS 4B: "undi" interpreted as PROBLEM EXISTS -> asked follow-up.\n');

// 4C: "నీళ్ల విషయంలో సమస్య ఉందని చెబుతున్నారా?" + "ledu, baane vastunnai"
let s4C = createFreshSession('s4C');
s4C.pending_follow_up = {
  topic: 'drinking_water',
  field: 'drinking_water_clarify',
  question: 'నీళ్ల విషయంలో సమస్య ఉందని చెబుతున్నారా?',
  status: 'waiting_for_answer',
};

const r4C = processTurnMemory('ledu, baane vastunnai', s4C);
console.log('4C Agent Reply:', r4C.directReply);
if (r4C.updatedState.topic_statuses?.drinking_water !== 'sufficiently_answered') {
  throw new Error('FAIL 4C: drinking_water should be sufficiently_answered');
}
if (!r4C.directReply?.includes('రోడ్ల పరిస్థితి')) {
  throw new Error(`FAIL 4C: Expected move to roads, got: ${r4C.directReply}`);
}
console.log('>> PASS 4C: "ledu, baane vastunnai" interpreted as WATER GOOD -> no problem follow-up!\n');

console.log('================================================================');
console.log('ALL CLARIFICATION → ANSWER CONTEXT TESTS PASSED 100%!');
console.log('================================================================');
