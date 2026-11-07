import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_intent_priority'): SurveySessionState {
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

function runAllPriorityAndMultiTopicTests() {
  console.log('================================================================');
  console.log('TESTING INTENT PRIORITY, MULTI-TOPIC & NO-INVENTION LOGIC');
  console.log('================================================================\n');

  // ==========================================================================
  // SUITE 1: EXACT FAILURE TEST (SECTION 13)
  // ==========================================================================
  console.log('--- SUITE 1: Exact Failure Test from Section 13 ---');
  let session = createFreshSession('exact_failure_test');

  // Turn 1: Drinking water "badundhi"
  console.log('Turn 1: Water: "badundhi"');
  let res1 = processTurnMemory('badundhi', session, mockQuestions);
  session = res1.updatedState;
  console.log('Agent 1:', res1.directReply);
  if (!res1.directReply?.includes('రోడ్ల')) {
    throw new Error(`FAIL Turn 1: Expected transition to roads, got: ${res1.directReply}`);
  }
  if (session.topic_statuses?.drinking_water !== 'sufficiently_answered') {
    throw new Error('FAIL Turn 1: drinking_water was not marked sufficiently_answered');
  }
  console.log('>> PASS Turn 1: Understood "badundhi" as good, transitioned to roads.\n');

  // Turn 2: Roads "baledhu"
  console.log('Turn 2: Roads: "baledhu"');
  let res2 = processTurnMemory('baledhu', session, mockQuestions);
  session = res2.updatedState;
  console.log('Agent 2:', res2.directReply);
  if (!res2.directReply?.includes('రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది')) {
    throw new Error(`FAIL Turn 2: Expected road follow-up, got: ${res2.directReply}`);
  }
  if (session.topic_statuses?.roads !== 'needs_follow_up') {
    throw new Error('FAIL Turn 2: roads was not marked needs_follow_up');
  }
  console.log('>> PASS Turn 2: "baledhu" marked needs_follow_up, asked specific defect question.\n');

  // Turn 3: "drainage water and holes"
  console.log('Turn 3: Respondent: "drainage water and holes"');
  let res3 = processTurnMemory('drainage water and holes', session, mockQuestions);
  session = res3.updatedState;
  console.log('Agent 3:', res3.directReply);
  console.log('Answers:', session.answers);
  console.log('Topic statuses:', session.topic_statuses);

  // CRITICAL CHECKS FOR TURN 3:
  // 1. Must NOT invent rain
  if (session.answers.rain_related_problem === true || res3.directReply?.includes('వర్షం')) {
    throw new Error(`CRITICAL BUG: Agent invented rain! Reply: ${res3.directReply}`);
  }
  // 2. Must NOT invent water logging because of rain
  if (session.answers.water_logging === true || res3.directReply?.includes('నీళ్లు నిలుస్తున్నాయని')) {
    throw new Error(`CRITICAL BUG: Agent invented water logging! Reply: ${res3.directReply}`);
  }
  // 3. Must NOT invent accidents
  if (session.answers.safety_concern || res3.directReply?.includes('యాక్సిడెంట్లు')) {
    throw new Error(`CRITICAL BUG: Agent invented accidents! Reply: ${res3.directReply}`);
  }
  // 4. Must recognize potholes for roads
  if (session.answers.roads_problem !== 'potholes') {
    throw new Error(`FAIL: roads_problem not recorded as potholes: ${session.answers.roads_problem}`);
  }
  // 5. Must recognize drainage water for drainage
  if (!session.answers.drainage_problem || session.answers.drainage_condition !== 'poor') {
    throw new Error(`FAIL: drainage water problem not recorded: ${JSON.stringify(session.answers)}`);
  }
  // 6. Must acknowledge both potholes and drainage water
  if (!res3.directReply?.includes('గుంతలు') || !res3.directReply?.includes('డ్రైనేజీ')) {
    throw new Error(`FAIL: Reply did not acknowledge both topics: ${res3.directReply}`);
  }
  // 7. Natural follow-up on drainage water
  if (!res3.directReply?.includes('డ్రైనేజీ నీరు రోడ్డుపైకి వస్తుందా')) {
    throw new Error(`FAIL: Expected natural follow up about drainage water reaching road, got: ${res3.directReply}`);
  }
  console.log('>> PASS Turn 3: NO INVENTION of rain, water logging, or accidents. Both potholes and drainage water recognized cleanly!\n');

  // ==========================================================================
  // SUITE 2: REFUSAL HANDLING (SECTION 2 & 11)
  // ==========================================================================
  console.log('--- SUITE 2: Refusal Handling ---');
  const refusalPhrases = [
    'naku netho matladali ani ledhu',
    'నాకు మీతో మాట్లాడాలని లేదు.',
    'నాకు survey వద్దు.',
    'మాట్లాడను.',
    'వద్దు, మాట్లాడను.',
    'Please don\'t call.',
    'Don\'t want to talk.',
    'Stop calling.',
    'natho matladakandi',
    'నాకు ఈ survey అవసరం లేదు',
    'వద్దు అండి',
    'please stop',
  ];

  for (const phrase of refusalPhrases) {
    let s = createFreshSession('refusal_test');
    let r = processTurnMemory(phrase, s, mockQuestions);
    if (r.updatedState.conversation_status !== 'refused') {
      throw new Error(`FAIL Refusal: Status not 'refused' for "${phrase}", got: ${r.updatedState.conversation_status}`);
    }
    if (!r.directReply?.includes('ధన్యవాదాలు') || r.directReply?.includes('ప్రశ్న') || r.directReply?.includes('రోడ్ల') || r.directReply?.includes('కరెంట్')) {
      throw new Error(`FAIL Refusal: Asked survey question or wrong reply for "${phrase}": ${r.directReply}`);
    }
    if (r.directReply !== 'సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.') {
      throw new Error(`FAIL Refusal: Reply did not match exact standard polite close: "${r.directReply}"`);
    }
  }
  console.log(`>> PASS SUITE 2: All ${refusalPhrases.length} refusal variations immediately closed survey with exact polite closing!\n`);

  // ==========================================================================
  // SUITE 3: "CHEPA KADAA" IN REFUSAL CONTEXT (SECTION 3)
  // ==========================================================================
  console.log('--- SUITE 3: "chepa kadaa" in Refusal Context ---');
  let sRefusal = createFreshSession('chepa_kadaa_test');
  let rRefusal1 = processTurnMemory('naku netho matladali ani ledhu', sRefusal, mockQuestions);
  if (rRefusal1.updatedState.conversation_status !== 'refused') {
    throw new Error('FAIL: Refusal step failed');
  }

  const chepaPhrases = [
    'chepa kadaa',
    'చెప్పా కదా',
    'ముందే చెప్పాను కదా',
    'నేను చెప్పాను కదా',
    'already cheppa',
  ];

  for (const chepa of chepaPhrases) {
    let rChepa = processTurnMemory(chepa, rRefusal1.updatedState, mockQuestions);
    if (rChepa.updatedState.conversation_status !== 'refused') {
      throw new Error(`FAIL Chepa kadaa: Status reopened for "${chepa}"! Status: ${rChepa.updatedState.conversation_status}`);
    }
    if (rChepa.directReply?.includes('ప్రశ్న') || rChepa.directReply?.includes('రోడ్ల') || rChepa.directReply?.includes('కరెంట్') || rChepa.directReply?.includes('నీటి')) {
      throw new Error(`FAIL Chepa kadaa: Agent asked survey question for "${chepa}": ${rChepa.directReply}`);
    }
    if (rChepa.directReply !== 'సరే అండి, అర్థమైంది. మీ సమయానికి ధన్యవాదాలు.') {
      throw new Error(`FAIL Chepa kadaa: Reply did not stay in polite refusal close: "${rChepa.directReply}"`);
    }
  }
  console.log(`>> PASS SUITE 3: All ${chepaPhrases.length} "chepa kadaa" variations in refusal context kept conversation ended!\n`);

  // ==========================================================================
  // SUITE 4: BUSY / CALLBACK OVERRIDING SURVEY LOGIC (SECTION 4)
  // ==========================================================================
  console.log('--- SUITE 4: Busy / Callback Overrides ---');
  // 4A: Busy with explicit callback time
  let sBusyTime = createFreshSession('busy_time_test');
  let rBusyTime = processTurnMemory('ఇప్పుడు బిజీగా ఉన్నాను. రేపు ఉదయం 10కి కాల్ చేయండి.', sBusyTime, mockQuestions);
  console.log('Busy + Time Agent:', rBusyTime.directReply);
  if (rBusyTime.updatedState.conversation_status !== 'callback_requested') {
    throw new Error(`FAIL Busy with time: Status not callback_requested: ${rBusyTime.updatedState.conversation_status}`);
  }
  if (!rBusyTime.directReply?.includes('రేపు ఉదయం 10 గంటలకు మళ్లీ కాల్ చేస్తాను')) {
    throw new Error(`FAIL Busy with time: Expected confirmation of callback time, got: ${rBusyTime.directReply}`);
  }
  if (rBusyTime.directReply?.includes('నీటి') || rBusyTime.directReply?.includes('రోడ్ల')) {
    throw new Error(`FAIL Busy with time: Continued asking survey questions! Reply: ${rBusyTime.directReply}`);
  }
  console.log('>> PASS 4A: Busy with time stored callback time and ended conversation.\n');

  // 4B: Busy without time
  const busyNoTimePhrases = [
    'ఇప్పుడు బిజీగా ఉన్నాను.',
    'ఇప్పుడు టైం లేదు.',
    'నేను పని మీద ఉన్నాను.',
    'తర్వాత మాట్లాడండి.',
    'ఇప్పుడు మాట్లాడలేను.',
  ];

  for (const phrase of busyNoTimePhrases) {
    let sBusy = createFreshSession('busy_test');
    let rBusy = processTurnMemory(phrase, sBusy, mockQuestions);
    if (rBusy.updatedState.conversation_status !== 'busy') {
      throw new Error(`FAIL Busy no time: Status not busy for "${phrase}": ${rBusy.updatedState.conversation_status}`);
    }
    if (rBusy.directReply !== 'సరే అండి. మీకు ఎప్పుడు సౌకర్యంగా ఉంటుందో చెప్పండి, ఆ సమయానికి మళ్లీ కాల్ చేస్తాను.') {
      throw new Error(`FAIL Busy no time: Reply did not match prompt specification: "${rBusy.directReply}"`);
    }
  }
  console.log(`>> PASS 4B: All ${busyNoTimePhrases.length} busy statements cleanly stopped survey without asking survey questions!\n`);

  // ==========================================================================
  // SUITE 5: CALL END / BYE (SECTION 5)
  // ==========================================================================
  console.log('--- SUITE 5: Call End / Bye Statements ---');
  const byePhrases = [
    'bye',
    'బై',
    'సరే బై',
    'పెడతాను',
    'ఫోన్ పెట్టేస్తాను',
    'వెళ్తాను',
    'phone pettesthanu',
    'cut chestunna',
  ];

  for (const phrase of byePhrases) {
    let sBye = createFreshSession('bye_test');
    let rBye = processTurnMemory(phrase, sBye, mockQuestions);
    if (rBye.updatedState.conversation_status !== 'ended_by_user') {
      throw new Error(`FAIL Call End: Status not ended_by_user for "${phrase}": ${rBye.updatedState.conversation_status}`);
    }
    if (rBye.directReply !== 'సరే అండి, ధన్యవాదాలు.') {
      throw new Error(`FAIL Call End: Reply did not match "సరే అండి, ధన్యవాదాలు.": "${rBye.directReply}"`);
    }
  }
  console.log(`>> PASS SUITE 5: All ${byePhrases.length} call end variations ended conversation immediately with brief polite reply!\n`);

  // ==========================================================================
  // SUITE 6: INFERENCE VS INVENTION (SECTION 7 & 10)
  // ==========================================================================
  console.log('--- SUITE 6: Inference vs Invention ---');
  // 6A: "drainage water road meedaki vastai" on drainage topic
  let sDrainage = createFreshSession('drainage_overflow_test');
  sDrainage.current_question_id = 'A4';
  sDrainage.current_question_topic = 'drainage';
  let rDrainage = processTurnMemory('drainage water road meedaki vastai', sDrainage, mockQuestions);
  console.log('Drainage Agent:', rDrainage.directReply);
  if (rDrainage.directReply?.includes('వర్షం')) {
    throw new Error(`FAIL: Agent invented rain when user only said "drainage water road meedaki vastai"! Reply: ${rDrainage.directReply}`);
  }
  if (!rDrainage.directReply?.includes('డ్రైనేజీ నీళ్లు రోడ్డుపైకి వస్తున్నాయన్నమాట')) {
    throw new Error(`FAIL: Did not acknowledge drainage water on road correctly: ${rDrainage.directReply}`);
  }
  console.log('>> PASS 6A: Correctly acknowledged drainage water on road without inventing rain!\n');

  // 6B: "రోడ్లు బాగోలేవు, drainage water కూడా road మీదకి వస్తుంది."
  let sRoadDrainage = createFreshSession('road_drainage_test');
  sRoadDrainage.current_question_id = 'A2';
  sRoadDrainage.current_question_topic = 'roads';
  let rRoadDrainage = processTurnMemory('రోడ్లు బాగోలేవు, drainage water కూడా road మీదకి వస్తుంది.', sRoadDrainage, mockQuestions);
  console.log('Road + Drainage Agent:', rRoadDrainage.directReply);
  if (rRoadDrainage.directReply?.includes('వర్షం')) {
    throw new Error(`FAIL: Agent invented rain for roads and drainage! Reply: ${rRoadDrainage.directReply}`);
  }
  if (rRoadDrainage.updatedState.topic_statuses?.roads !== 'sufficiently_answered') {
    throw new Error('FAIL: roads should be marked sufficiently_answered');
  }
  if (rRoadDrainage.updatedState.topic_statuses?.drainage !== 'sufficiently_answered') {
    throw new Error('FAIL: drainage should be marked sufficiently_answered');
  }
  console.log('>> PASS 6B: Handled "రోడ్లు బాగోలేవు, drainage water కూడా road మీదకి వస్తుంది." without inventing rain and moved naturally!\n');

  console.log('================================================================');
  console.log('ALL INTENT PRIORITY, MULTI-TOPIC & NO-INVENTION TESTS PASSED 100%!');
  console.log('================================================================');
}

runAllPriorityAndMultiTopicTests();
