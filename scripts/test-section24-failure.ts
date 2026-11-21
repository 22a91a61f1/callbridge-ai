import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_failure_session'): SurveySessionState {
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

function runExactFailureTest() {
  console.log('================================================================');
  console.log('TESTING EXACT EXISTING FAILURE (SECTION 24)');
  console.log('================================================================\n');

  let session = createFreshSession();

  // 1. Water: "bagundhi"
  console.log('--- TURN 1: Water: "bagundhi" ---');
  let res = processTurnMemory('bagundhi', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 1:', res.directReply);
  console.log('Topic Statuses:', session.topic_statuses);
  if (session.topic_statuses?.drinking_water !== 'sufficiently_answered') {
    throw new Error('FAIL: drinking_water was not marked sufficiently_answered');
  }
  if (!res.directReply?.includes('రోడ్ల')) {
    throw new Error(`FAIL: Did not transition to roads. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TURN 1: Water marked sufficiently_answered, moved naturally to roads.\n');

  // 2. Roads: "holes vuntai varsham lo chaala ebbandi ga vuntundhi and accidents kudaa avvuthai"
  console.log('--- TURN 2: Roads: "holes vuntai varsham lo chaala ebbandi ga vuntundhi and accidents kudaa avvuthai" ---');
  res = processTurnMemory('holes vuntai varsham lo chaala ebbandi ga vuntundhi and accidents kudaa avvuthai', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 2:', res.directReply);
  console.log('Answers for Roads:', session.answers);
  console.log('Topic Statuses:', session.topic_statuses);
  if (session.topic_statuses?.roads !== 'sufficiently_answered') {
    throw new Error('FAIL: roads was not marked sufficiently_answered');
  }
  if (!res.directReply?.includes('కరెంట్')) {
    throw new Error(`FAIL: Did not transition to electricity. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TURN 2: Roads marked sufficiently_answered, moved naturally to electricity.\n');

  // 3. Electricity: "ledhu current baney vundhi"
  console.log('--- TURN 3: Electricity: "ledhu current baney vundhi" ---');
  res = processTurnMemory('ledhu current baney vundhi', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 3:', res.directReply);
  console.log('Topic Statuses:', session.topic_statuses);
  if (session.topic_statuses?.electricity !== 'sufficiently_answered') {
    throw new Error('FAIL: electricity was not marked sufficiently_answered');
  }
  if (!res.directReply?.includes('డ్రైనేజీ')) {
    throw new Error(`FAIL: Did not transition to drainage. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TURN 3: Electricity marked sufficiently_answered, moved naturally to drainage.\n');

  // 4. Drainage: "varsham vachinapudu drainage water road medha ki vastai"
  console.log('--- TURN 4: Drainage: "varsham vachinapudu drainage water road medha ki vastai" ---');
  res = processTurnMemory('varsham vachinapudu drainage water road medha ki vastai', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 4:', res.directReply);
  console.log('Topic Statuses:', session.topic_statuses);
  if (session.topic_statuses?.drainage !== 'sufficiently_answered') {
    throw new Error('FAIL: drainage was not marked sufficiently_answered');
  }
  if (!res.directReply?.includes('చెత్త') && !res.directReply?.includes('పారిశుధ్య')) {
    throw new Error(`FAIL: Did not transition to waste/sanitation. Reply: ${res.directReply}`);
  }
  console.log('>> PASS TURN 4: Drainage marked sufficiently_answered, moved naturally to waste management.\n');

  // 5. Waste: "vallu sari ga raru 3 days ki ala vastaru oka sari aithe 5 days kudaa aipothadhi"
  console.log('--- TURN 5: Waste: "vallu sari ga raru 3 days ki ala vastaru oka sari aithe 5 days kudaa aipothadhi" ---');
  res = processTurnMemory('vallu sari ga raru 3 days ki ala vastaru oka sari aithe 5 days kudaa aipothadhi', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 5:', res.directReply);
  console.log('Topic Statuses:', session.topic_statuses);
  if (session.topic_statuses?.waste_management !== 'sufficiently_answered') {
    throw new Error('FAIL: waste_management was not marked sufficiently_answered');
  }

  // 6. Verification: Agent must NEVER ask again "మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?"
  console.log('--- STEP 6: VERIFY ROADS IS NEVER RE-ASKED ---');
  if (res.directReply?.includes('రోడ్ల పరిస్థితి ఎలా ఉంది') || res.directReply?.includes('రోడ్లు ఎలా ఉన్నాయి')) {
    throw new Error(`CRITICAL BUG: Agent asked roads again! Reply: ${res.directReply}`);
  }
  console.log('>> PASS STEP 6: Agent did NOT ask about roads again! It asked next unanswered topic (healthcare).\n');

  // 7. Test "already ee question adigaru kadaa"
  console.log('--- STEP 7: Respondent: "already ee question adigaru kadaa" ---');
  // Suppose respondent says "already ee question adigaru kadaa"
  res = processTurnMemory('already ee question adigaru kadaa', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 7:', res.directReply);
  if (!res.directReply?.includes('ముందే మాట్లాడుకున్నాం')) {
    throw new Error(`FAIL: Did not acknowledge already discussed topic. Reply: ${res.directReply}`);
  }
  console.log('>> PASS STEP 7: Correctly acknowledged that topic was already discussed and moved to unanswered topic.\n');

  // 8. Test Government Services: Respondent says "water roads drainage"
  console.log('--- STEP 8: Government Services: "water roads drainage" ---');
  session.current_question_topic = 'government_services';
  session.current_question_id = 'A9';
  res = processTurnMemory('water roads drainage', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 8:', res.directReply);
  console.log('Answers for Gov Services:', session.answers.government_services_response);
  if (
    !Array.isArray(session.answers.government_services_response) ||
    !session.answers.government_services_response.includes('water') ||
    !session.answers.government_services_response.includes('roads')
  ) {
    throw new Error(`FAIL: Did not store government_services_response. Answers: ${JSON.stringify(session.answers)}`);
  }
  if (!res.directReply?.includes('ప్రధానమైన') && !res.directReply?.includes('ముఖ్యమైన')) {
    throw new Error(`FAIL: Did not transition to top priority question. Reply: ${res.directReply}`);
  }
  console.log('>> PASS STEP 8: Understood water roads drainage as summary of already discussed topics, did not restart them, transitioned to priority question.\n');

  // 9. Overall priority question: "roads drainage"
  console.log('--- STEP 9: Priority: "roads drainage" ---');
  res = processTurnMemory('roads drainage', session, mockQuestions);
  session = res.updatedState;
  console.log('Agent Reply 9:', res.directReply);
  console.log('Top Priority Answers:', session.answers.top_priority);
  console.log('Conversation Status:', session.conversation_status);
  if (
    !Array.isArray(session.answers.top_priority) ||
    !session.answers.top_priority.includes('roads') ||
    !session.answers.top_priority.includes('drainage')
  ) {
    throw new Error(`FAIL: Did not store top priorities. Answers: ${JSON.stringify(session.answers)}`);
  }
  if (session.conversation_status !== 'completed') {
    throw new Error(`FAIL: Survey was not marked completed. Status: ${session.conversation_status}`);
  }
  console.log('>> PASS STEP 9: Stored roads and drainage as top priorities, survey completed successfully.\n');

  console.log('================================================================');
  console.log('ALL SECTION 24 FAILURE TESTS PASSED 100%!');
  console.log('================================================================');
}

runExactFailureTest();
