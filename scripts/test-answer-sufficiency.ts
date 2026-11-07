import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_sufficiency_session'): SurveySessionState {
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
    conversation_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const mockQuestions = [
  { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'తాగునీరు' },
  { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'రోడ్లు' },
  { id: 'A3', text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?', category: 'విద్యుత్' },
  { id: 'A4', text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?', category: 'డ్రైనేజీ' },
  { id: 'A5', text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?', category: 'చెత్త సేకరణ & పారిశుధ్యం' },
  { id: 'A6', text: 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?', category: 'ఆరోగ్య సేవలు' },
  { id: 'A7', text: 'మీ ప్రాంతంలోని ప్రభుత్వ విద్యా సదుపాయాల గురించి మీ అభిప్రాయం ఏమిటి?', category: 'విద్యా సదుపాయాలు' },
  { id: 'A8', text: 'మీ ప్రాంతంలో ప్రజా రవాణా సౌకర్యం ఎలా ఉంది?', category: 'ప్రజా రవాణా' },
  { id: 'A9', text: 'ప్రభుత్వ సేవలను పొందడంలో మీకు సాధారణంగా ఎలాంటి సమస్యలు ఎదురవుతున్నాయి?', category: 'ప్రభుత్వ సేవలు' },
  { id: 'A10', text: 'మీ ప్రాంతంలో వెంటనే మెరుగుపరచాల్సిన ఒక ముఖ్యమైన విషయం ఏది అని మీరు భావిస్తున్నారు?', category: 'ప్రధాన ప్రాధాన్యత' },
];

function testAnswerSufficiency() {
  console.log('================================================================');
  console.log('TEST SUITE: ANSWER SUFFICIENCY DECISION LOGIC');
  console.log('================================================================\n');

  // CASE 1: BARE NEGATIVE "baledhu" FOR ROADS
  console.log('--- TEST 1: Bare negative "baledhu" for roads ---');
  let session = createFreshSession();
  session.current_question_topic = 'roads';
  session.current_question_id = 'A2';
  if (session.topic_statuses) session.topic_statuses.drinking_water = 'sufficiently_answered';

  let res = processTurnMemory('baledhu', session, mockQuestions);
  session = res.updatedState;
  console.log('Turn 1 Agent reply:', res.directReply);
  console.log('Roads topic status:', session.topic_statuses?.roads);
  console.log('Pending follow up:', session.pending_follow_up);

  if (session.topic_statuses?.roads === 'sufficiently_answered') {
    throw new Error('FAIL: "baledhu" was marked sufficiently_answered without follow-up!');
  }
  if (session.topic_statuses?.roads !== 'needs_follow_up') {
    throw new Error(`FAIL: Expected roads status to be needs_follow_up, got ${session.topic_statuses?.roads}`);
  }
  if (!res.directReply?.includes('రోడ్ల') || res.directReply?.includes('కరెంట్')) {
    throw new Error(`FAIL: Agent transitioned to electricity instead of asking follow-up on roads! Reply: ${res.directReply}`);
  }
  console.log('>> PASS TEST 1A: Correctly kept roads in needs_follow_up and asked follow-up question.\n');

  // Follow-up answer with details: "holes vuntai"
  console.log('--- TEST 1B: Answering roads follow-up with "holes vuntai" ---');
  res = processTurnMemory('holes vuntai', session, mockQuestions);
  session = res.updatedState;
  console.log('Turn 2 Agent reply:', res.directReply);
  console.log('Pending follow up:', session.pending_follow_up);

  // Now answering rain follow up
  res = processTurnMemory('avunu varsham lo water nilusthundhi', session, mockQuestions);
  session = res.updatedState;
  console.log('Turn 3 Agent reply:', res.directReply);
  console.log('Roads topic status:', session.topic_statuses?.roads);

  if (session.topic_statuses?.roads !== 'sufficiently_answered') {
    throw new Error('FAIL: roads should be sufficiently_answered after defect details provided');
  }
  if (!res.directReply?.includes('కరెంట్')) {
    throw new Error(`FAIL: Expected transition to electricity, got: ${res.directReply}`);
  }
  console.log('>> PASS TEST 1B: Successfully completed roads and transitioned to electricity after details.\n');

  // CASE 2: SIMPLE POSITIVE "బాగుంది" FOR ROADS
  console.log('--- TEST 2: Simple positive "బాగుంది" for roads ---');
  session = createFreshSession();
  session.current_question_topic = 'roads';
  session.current_question_id = 'A2';
  if (session.topic_statuses) session.topic_statuses.drinking_water = 'sufficiently_answered';

  res = processTurnMemory('బాగుంది', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent reply:', res.directReply);
  console.log('Roads topic status:', session.topic_statuses?.roads);

  if (session.topic_statuses?.roads !== 'sufficiently_answered') {
    throw new Error('FAIL: "బాగుంది" was not marked sufficiently_answered');
  }
  if (!res.directReply?.includes('కరెంట్') && !res.directReply?.includes('విద్యుత్')) {
    throw new Error(`FAIL: Did not move naturally to electricity. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TEST 2: Simple positive marked sufficiently_answered and moved naturally.\n');

  // CASE 3: PARTIAL INFORMATION (Rain problem without potholes)
  console.log('--- TEST 3: Partial information "రోడ్లు బాగోలేవు, వర్షం పడితే చాలా ఇబ్బంది" ---');
  session = createFreshSession();
  session.current_question_topic = 'roads';
  session.current_question_id = 'A2';
  if (session.topic_statuses) session.topic_statuses.drinking_water = 'sufficiently_answered';

  res = processTurnMemory('రోడ్లు బాగోలేవు, వర్షం పడితే చాలా ఇబ్బంది', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent reply:', res.directReply);
  console.log('Roads topic status:', session.topic_statuses?.roads);
  console.log('Pending follow up:', session.pending_follow_up);

  if (session.topic_statuses?.roads === 'sufficiently_answered') {
    throw new Error('FAIL: Partial rain info should require follow-up for specific defect');
  }
  if (!res.directReply?.includes('గుంతలు') && !res.directReply?.includes('నీళ్లు')) {
    throw new Error(`FAIL: Expected agent to inquire about potholes or waterlogging. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TEST 3: Partial rain info prompted relevant follow-up for defect details.\n');

  // CASE 4: AMBIGUOUS BARE "లేదు"
  console.log('--- TEST 4: Ambiguous bare "లేదు" to open-ended road question ---');
  session = createFreshSession();
  session.current_question_topic = 'roads';
  session.current_question_id = 'A2';
  if (session.topic_statuses) session.topic_statuses.drinking_water = 'sufficiently_answered';

  res = processTurnMemory('లేదు', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent reply:', res.directReply);
  console.log('Detected intent:', res.detectedIntent);
  const pFollowUp = session.pending_follow_up as { field?: string } | null;
  console.log('Pending follow up field:', pFollowUp?.field);

  if (!res.directReply?.includes('సమస్య ఉందా')) {
    throw new Error(`FAIL: Expected clarification question for ambiguous "లేదు". Reply: ${res.directReply}`);
  }

  // Respondent confirms no problem: "సమస్య లేదు"
  res = processTurnMemory('సమస్య లేదు', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent reply after clarify:', res.directReply);
  console.log('Roads status after clarify:', session.topic_statuses?.roads);

  if (session.topic_statuses?.roads !== 'sufficiently_answered') {
    throw new Error('FAIL: Roads should be sufficiently_answered after confirming no problem');
  }
  if (!res.directReply?.includes('కరెంట్') && !res.directReply?.includes('విద్యుత్')) {
    throw new Error(`FAIL: Did not move to electricity. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TEST 4: Ambiguous "లేదు" clarified cleanly without repetition.\n');

  // CASE 5: WATER BARE NEGATIVE "baledhu"
  console.log('--- TEST 5: Water bare negative "baledhu" ---');
  session = createFreshSession();
  res = processTurnMemory('baledhu', session, mockQuestions);
  session = res.updatedState;
  console.log('Water bare negative agent reply:', res.directReply);
  console.log('Water status:', session.topic_statuses?.drinking_water);

  if (session.topic_statuses?.drinking_water === 'sufficiently_answered') {
    throw new Error('FAIL: Water "baledhu" should not be sufficiently_answered immediately');
  }
  if (res.directReply?.includes('టైమింగ్') || res.directReply?.includes('ఏ టైమింగ్‌')) {
    throw new Error(`FAIL: Agent must NOT ask about timing for bare negative! Reply: ${res.directReply}`);
  }
  console.log('>> PASS TEST 5: Water bare negative prompted for supply issue instead of jumping to roads or asking timing.\n');

  console.log('================================================================');
  console.log('ALL ANSWER SUFFICIENCY TESTS PASSED 100%!');
  console.log('================================================================');
}

testAnswerSufficiency();
