import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_priority_session'): SurveySessionState {
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

function runTests() {
  console.log('================================================================');
  console.log('RUNNING PRIORITY, NO INVENTION & CONVERSATION TESTS');
  console.log('================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------------
  // TEST 1: NO INVENTION & MULTI-TOPIC ("drainage water and holes")
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: NO INVENTION ("drainage water and holes") ---');
  {
    let session = createFreshSession('t1');
    // Turn 1: "badundhi"
    let res = processTurnMemory('badundhi', session, mockQuestions);
    session = res.updatedState;
    console.log('Turn 1 Agent Reply:', res.directReply);

    // Turn 2: "baledhu" on roads
    res = processTurnMemory('baledhu', session, mockQuestions);
    session = res.updatedState;
    console.log('Turn 2 Agent Reply:', res.directReply);
    if (!res.directReply?.includes('రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది')) {
      throw new Error(`FAIL T1 Turn 2: expected road issue question. Got: ${res.directReply}`);
    }

    // Turn 3: "drainage water and holes"
    res = processTurnMemory('drainage water and holes', session, mockQuestions);
    session = res.updatedState;
    console.log('Turn 3 Agent Reply:', res.directReply);
    console.log('Turn 3 Answers:', session.answers);

    // Assertions:
    // A. Must NOT mention rain / varsham because rain was not mentioned
    if (res.directReply?.includes('వర్షం') || res.directReply?.includes('varsham')) {
      throw new Error(`CRITICAL FAIL: Agent invented rain! Reply: ${res.directReply}`);
    }
    // B. Must NOT mention accidents because accidents were not mentioned
    if (res.directReply?.includes('యాక్సిడెంట్లు') || res.directReply?.includes('accidents')) {
      throw new Error(`CRITICAL FAIL: Agent invented accidents! Reply: ${res.directReply}`);
    }
    // C. Must acknowledge potholes and drainage water
    if (!res.directReply?.includes('గుంతలు') || !res.directReply?.includes('డ్రైనేజీ')) {
      throw new Error(`FAIL: Agent did not acknowledge potholes & drainage. Reply: ${res.directReply}`);
    }
    // D. Roads must be sufficiently answered and drainage recorded
    if (session.topic_statuses?.roads !== 'sufficiently_answered') {
      throw new Error(`FAIL: roads topic not marked sufficiently_answered. Got: ${session.topic_statuses?.roads}`);
    }
    if (session.answers.roads_problem !== 'potholes') {
      throw new Error(`FAIL: roads_problem not stored as potholes. Got: ${session.answers.roads_problem}`);
    }
    if (!session.answers.drainage_problem) {
      throw new Error(`FAIL: drainage_problem not stored.`);
    }
    console.log('>> PASS TEST 1: No invention (no rain, no accidents). Correctly recognized both topics.\n');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 2: EXACT REFUSAL ("naku netho matladali ani ledhu")
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: EXACT REFUSAL ---');
  {
    let session = createFreshSession('t2');
    let res = processTurnMemory('naku netho matladali ani ledhu', session, mockQuestions);
    session = res.updatedState;
    console.log('Agent Reply:', res.directReply);
    console.log('Conversation status:', session.conversation_status);
    console.log('Detected intent:', res.detectedIntent);

    if (session.conversation_status !== 'refused') {
      throw new Error(`FAIL T2: Expected status 'refused', got '${session.conversation_status}'`);
    }
    if (!res.directReply?.includes('సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.')) {
      throw new Error(`FAIL T2: Expected polite refusal acknowledgement. Got: ${res.directReply}`);
    }
    // Ensure no survey question is asked
    if (res.directReply?.includes('తాగునీటి') || res.directReply?.includes('రోడ్ల')) {
      throw new Error(`CRITICAL FAIL T2: Survey question was asked after refusal! Reply: ${res.directReply}`);
    }

    // Follow-up: "chepa kadaa" in refusal context
    console.log('--- Subtest: "chepa kadaa" after refusal ---');
    let res2 = processTurnMemory('chepa kadaa', session, mockQuestions);
    console.log('Follow-up Reply:', res2.directReply);
    console.log('Follow-up status:', res2.updatedState.conversation_status);
    if (res2.updatedState.conversation_status !== 'refused') {
      throw new Error(`FAIL T2 follow-up: status should remain 'refused'. Got: ${res2.updatedState.conversation_status}`);
    }
    if (res2.directReply?.includes('తాగునీటి') || res2.directReply?.includes('రోడ్ల')) {
      throw new Error(`CRITICAL FAIL T2 follow-up: Survey question asked! Reply: ${res2.directReply}`);
    }
    console.log('>> PASS TEST 2: Refusal ends survey immediately; subsequent "chepa kadaa" does not restart.\n');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 3: EXACT BUSY WITHOUT TIME ("naku ippudu time ledhu, later call cheyyandi")
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: BUSY WITHOUT TIME ---');
  {
    let session = createFreshSession('t3');
    let res = processTurnMemory('naku ippudu time ledhu, later call cheyyandi', session, mockQuestions);
    session = res.updatedState;
    console.log('Agent Reply:', res.directReply);
    console.log('Conversation status:', session.conversation_status);

    if (session.conversation_status !== 'busy') {
      throw new Error(`FAIL T3: Expected status 'busy', got '${session.conversation_status}'`);
    }
    if (!res.directReply?.includes('ఎప్పుడు') && !res.directReply?.includes('సౌకర్యంగా')) {
      throw new Error(`FAIL T3: Expected asking for convenient callback time. Got: ${res.directReply}`);
    }
    if (res.directReply?.includes('తాగునీటి') || res.directReply?.includes('రోడ్ల')) {
      throw new Error(`CRITICAL FAIL T3: Survey question asked when busy! Reply: ${res.directReply}`);
    }
    console.log('>> PASS TEST 3: Busy status overrides survey questions.\n');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 4: BUSY WITH TIME ("ఇప్పుడు బిజీగా ఉన్నాను. రేపు ఉదయం 10కి కాల్ చేయండి.")
  // -------------------------------------------------------------------------
  console.log('--- TEST 4: BUSY WITH TIME ---');
  {
    let session = createFreshSession('t4');
    let res = processTurnMemory('ఇప్పుడు బిజీగా ఉన్నాను. రేపు ఉదయం 10కి కాల్ చేయండి.', session, mockQuestions);
    session = res.updatedState;
    console.log('Agent Reply:', res.directReply);
    console.log('Conversation status:', session.conversation_status);
    console.log('Callback time:', session.callback_time);

    if (session.conversation_status !== 'callback_requested') {
      throw new Error(`FAIL T4: Expected status 'callback_requested', got '${session.conversation_status}'`);
    }
    if (!session.callback_time) {
      throw new Error(`FAIL T4: Callback time not recorded.`);
    }
    if (res.directReply?.includes('తాగునీటి') || res.directReply?.includes('రోడ్ల')) {
      throw new Error(`CRITICAL FAIL T4: Survey question asked when busy! Reply: ${res.directReply}`);
    }
    console.log('>> PASS TEST 4: Callback time recorded and conversation closed.\n');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 5: EXACT BYE ("bye")
  // -------------------------------------------------------------------------
  console.log('--- TEST 5: EXACT BYE ---');
  {
    let session = createFreshSession('t5');
    let res = processTurnMemory('bye', session, mockQuestions);
    session = res.updatedState;
    console.log('Agent Reply:', res.directReply);
    console.log('Conversation status:', session.conversation_status);

    if (session.conversation_status !== 'ended_by_user') {
      throw new Error(`FAIL T5: Expected status 'ended_by_user', got '${session.conversation_status}'`);
    }
    if (!res.directReply?.includes('ధన్యవాదాలు')) {
      throw new Error(`FAIL T5: Expected polite closing. Got: ${res.directReply}`);
    }
    if (res.directReply?.includes('తాగునీటి') || res.directReply?.includes('రోడ్ల')) {
      throw new Error(`CRITICAL FAIL T5: Survey question asked on bye! Reply: ${res.directReply}`);
    }
    console.log('>> PASS TEST 5: Bye cleanly terminates without survey questions.\n');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 6: AMBIGUOUS "OK"
  // -------------------------------------------------------------------------
  console.log('--- TEST 6: AMBIGUOUS "OK" ---');
  {
    let session = createFreshSession('t6');
    session.current_question_id = 'A3';
    session.current_question_topic = 'electricity';

    // Respondent says "ok"
    let res = processTurnMemory('ok', session, mockQuestions);
    session = res.updatedState;
    console.log('Agent Reply for ok:', res.directReply);
    console.log('Topic status for electricity:', session.topic_statuses?.electricity);
    console.log('Pending follow up:', session.pending_follow_up);

    if (session.topic_statuses?.electricity === 'sufficiently_answered') {
      throw new Error(`FAIL T6: "ok" should not mark electricity as sufficiently_answered!`);
    }
    if (!res.directReply?.includes('బాగానే ఉందని చెబుతున్నారా') && !res.directReply?.includes('బాగుందని')) {
      throw new Error(`FAIL T6: Did not ask clarification for ambiguous "ok". Got: ${res.directReply}`);
    }

    // Now respondent answers: "బాగానే ఉంది"
    let res2 = processTurnMemory('బాగానే ఉంది', session, mockQuestions);
    session = res2.updatedState;
    console.log('Agent Reply after clarify:', res2.directReply);
    console.log('Topic status for electricity after clarify:', session.topic_statuses?.electricity);

    if (session.topic_statuses?.electricity !== 'sufficiently_answered') {
      throw new Error(`FAIL T6: electricity should be marked sufficiently_answered after clarify!`);
    }
    console.log('>> PASS TEST 6: Ambiguous "ok" prompted clarification, resolved cleanly.\n');
    passed++;
  }

  console.log('================================================================');
  console.log(`ALL ${passed} ADVANCED CONVERSATION INTELLIGENCE TESTS PASSED!`);
  console.log('================================================================\n');
}

runTests();
