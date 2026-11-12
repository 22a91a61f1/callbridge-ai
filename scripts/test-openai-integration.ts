import { processTurnWithOpenAi, buildOpenAiSystemInstruction } from '../server/survey/openAiEngine';
import { SurveySessionState, surveySessionStore } from '../server/survey/sessionManager';

function createMockSession(id = 'test_openai_session'): SurveySessionState {
  return surveySessionStore.resetSession(id, 'public_facilities', 'te');
}

const mockSurveyConfig = {
  id: 'public_facilities',
  title: 'ప్రజా సౌకర్యాల సర్వే (Public Facilities Survey)',
  questions: [
    { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'drinking_water' },
    { id: 'A2', text: 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'roads' },
    { id: 'A3', text: 'కరెంట్ లేదా విద్యుత్ సరఫరా ఎలా ఉంది?', category: 'electricity' },
    { id: 'A4', text: 'మురుగునీటి డ్రైనేజీ వ్యవస్థ ఎలా ఉంది?', category: 'drainage' },
  ],
  knowledgeBase: '',
};

async function runOpenAiIntegrationSuite() {
  console.log('================================================================');
  console.log('TESTING OPENAI CONVERSATION INTELLIGENCE INTEGRATION');
  console.log('================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------
  // SCENARIO 1: CONTEXTUAL YES/NO UNDERSTANDING
  // Agent: "నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?"
  // Respondent: "haa"
  // Expected:
  // - haa = yes, water is good, water problem = no
  // - Water topic is sufficiently answered
  // - Next question is NOT "నీటి supplyలో ఏ సమస్య ఉంది?"
  // - Natural move to next topic (e.g. roads)
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 1: Contextual Yes/No ("haa" to binary clarification) ---');
  {
    const session = createMockSession('s1');
    session.current_topic = 'drinking_water';
    session.current_question = 'A1';
    session.current_question_topic = 'drinking_water';
    session.pending_follow_up = {
      topic: 'drinking_water',
      field: 'drinking_water_clarify',
      question: 'నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?',
      status: 'waiting_for_answer',
    };

    const history = [
      { role: 'agent', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
      { role: 'respondent', text: 'ok' },
      { role: 'agent', text: 'నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?' },
    ];

    const res = await processTurnWithOpenAi('haa', session, mockSurveyConfig, session.answers, history);
    console.log('Reply:', res.openAiResult.response_text);
    console.log('Topic Updates:', res.openAiResult.topic_updates);
    console.log('Session Answers:', res.updatedSessionState.answers);

    const waterUpdate = res.openAiResult.topic_updates.find((t) => t.topic === 'drinking_water');
    const isWaterComplete =
      waterUpdate?.status === 'sufficiently_answered' ||
      res.updatedSessionState.topic_status?.drinking_water === 'sufficiently_answered' ||
      res.updatedSessionState.topic_status?.drinking_water === 'completed';

    const notAskingWaterProblem =
      !res.openAiResult.response_text.includes('సప్లై') &&
      !res.openAiResult.response_text.includes('supply') &&
      !res.openAiResult.response_text.includes('నీటి సమస్య');

    if (isWaterComplete && notAskingWaterProblem) {
      console.log('>> PASS SCENARIO 1: "haa" in context correctly resolved water to good without redundant problem inquiry.\n');
      passed++;
    } else {
      throw new Error(`FAIL SCENARIO 1: ${res.openAiResult.response_text}`);
    }
  }

  // -------------------------------------------------------------------
  // SCENARIO 2: SPONTANEOUS TOPIC DETECTION
  // Agent: "మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"
  // Respondent: "maku roju night power sariga vundataledhu, complaint ichana no use"
  // Expected:
  // - topic = electricity detected
  // - problem: power not adequate at night, complaint filed with no use
  // - electricity marked answered
  // - agent does NOT ask "కరెంట్ సరఫరా ఎలా ఉంది?"
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 2: Spontaneous Topic Detection (Power complaint when road asked) ---');
  {
    const session = createMockSession('s2');
    session.current_topic = 'roads';
    session.current_question = 'A2';
    session.current_question_topic = 'roads';

    const history = [
      { role: 'agent', text: 'మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?' },
    ];

    const userMsg = 'maku roju night power sariga vundataledhu, complaint ichana no use';
    const res = await processTurnWithOpenAi(userMsg, session, mockSurveyConfig, session.answers, history);
    console.log('Reply:', res.openAiResult.response_text);
    console.log('Topic Updates:', res.openAiResult.topic_updates);
    console.log('Session Answers:', res.updatedSessionState.answers);

    const powerUpdate = res.openAiResult.topic_updates.find((t) => t.topic === 'electricity');
    const powerRegistered =
      powerUpdate !== undefined ||
      res.updatedSessionState.answers.night_power_cut !== undefined ||
      res.updatedSessionState.answers.electricity_problem !== undefined ||
      res.updatedSessionState.answers.complaint_status !== undefined;

    const didNotAskGenericPowerQ =
      !res.openAiResult.response_text.includes('విద్యుత్ సరఫరా పరిస్థితి ఎలా ఉంది') &&
      !res.openAiResult.response_text.includes('కరెంట్ సరఫరా ఎలా ఉంది');

    if (powerRegistered && didNotAskGenericPowerQ) {
      console.log('>> PASS SCENARIO 2: Spontaneous electricity topic recognized with complaints; avoided redundant power question.\n');
      passed++;
    } else {
      throw new Error(`FAIL SCENARIO 2: ${res.openAiResult.response_text}`);
    }
  }

  // -------------------------------------------------------------------
  // SCENARIO 3: MULTIPLE TOPICS IN ONE RESPONSE
  // Respondent: "water bagundhi kani roads baledhu drainage kuda problem"
  // Expected:
  // - water = good (sufficiently_answered)
  // - roads = poor (needs_follow_up or sufficiently_answered)
  // - drainage = problem (needs_follow_up)
  // - All preserved in conversation state
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 3: Multiple Topics in Single Sentence ---');
  {
    const session = createMockSession('s3');
    const userMsg = 'water bagundhi kani roads baledhu drainage kuda problem';
    const res = await processTurnWithOpenAi(userMsg, session, mockSurveyConfig, session.answers, []);

    console.log('Reply:', res.openAiResult.response_text);
    console.log('Topic Updates:', res.openAiResult.topic_updates);
    console.log('Session Statuses:', res.updatedSessionState.topic_status);

    const topicsMentioned = res.openAiResult.topic_updates.map((t) => t.topic);
    const hasWater = topicsMentioned.includes('drinking_water');
    const hasRoads = topicsMentioned.includes('roads');
    const hasDrainage = topicsMentioned.includes('drainage');

    if (hasWater && hasRoads && hasDrainage) {
      console.log('>> PASS SCENARIO 3: All 3 topics (drinking_water, roads, drainage) extracted and preserved.\n');
      passed++;
    } else {
      throw new Error(`FAIL SCENARIO 3: Missing topics: ${topicsMentioned.join(', ')}`);
    }
  }

  // -------------------------------------------------------------------
  // SCENARIO 4: NO UNNECESSARY TRIGGERS (CALM & PROFESSIONAL)
  // Respondent: "naku kopam vastundi kani survey cheptha"
  // Expected:
  // - Does NOT treat as refusal
  // - Polite, calm response
  // - Continues survey normally
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 4: Frustration Without Refusal ("naku kopam vastundi kani survey cheptha") ---');
  {
    const session = createMockSession('s4');
    session.current_topic = 'drinking_water';
    session.current_question = 'A1';

    const userMsg = 'naku kopam vastundi kani survey cheptha';
    const res = await processTurnWithOpenAi(userMsg, session, mockSurveyConfig, session.answers, []);

    console.log('Reply:', res.openAiResult.response_text);
    console.log('Conversation Status:', res.updatedSessionState.conversation_status);

    const isNotRefused =
      res.updatedSessionState.conversation_status !== 'refused' &&
      res.updatedSessionState.conversation_status !== 'ended_by_user';

    if (isNotRefused) {
      console.log('>> PASS SCENARIO 4: Expressed frustration was handled calmly and survey continued without refusal.\n');
      passed++;
    } else {
      throw new Error(`FAIL SCENARIO 4: Falsely marked as refusal: ${res.updatedSessionState.conversation_status}`);
    }
  }

  // -------------------------------------------------------------------
  // SCENARIO 5: EXPLICIT REFUSAL
  // Respondent: "నాకు మాట్లాడాలని లేదు, కాల్ పెట్టేయండి"
  // Expected:
  // - Recognized as refusal
  // - Conversation ended politely without further questions
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 5: Explicit Refusal ---');
  {
    const session = createMockSession('s5');
    const userMsg = 'నాకు మాట్లాడాలని లేదు, కాల్ పెట్టేయండి';
    const res = await processTurnWithOpenAi(userMsg, session, mockSurveyConfig, session.answers, []);

    console.log('Reply:', res.openAiResult.response_text);
    console.log('Conversation Status:', res.updatedSessionState.conversation_status);

    if (res.updatedSessionState.conversation_status === 'refused') {
      console.log('>> PASS SCENARIO 5: Explicit refusal marked properly and closed with respect.\n');
      passed++;
    } else {
      throw new Error(`FAIL SCENARIO 5: Refusal not identified: ${res.updatedSessionState.conversation_status}`);
    }
  }

  // -------------------------------------------------------------------
  // SCENARIO 6: SYSTEM INSTRUCTION PROMPT CONTENT VERIFICATION
  // Verify that buildOpenAiSystemInstruction includes all requested guidelines
  // -------------------------------------------------------------------
  console.log('--- SCENARIO 6: System Instruction Verification ---');
  {
    const session = createMockSession('s6');
    const instruction = buildOpenAiSystemInstruction(session, mockSurveyConfig);

    const checks = [
      { name: 'Romanized Telugu', ok: instruction.includes('Romanized Telugu') },
      { name: 'colloquial', ok: instruction.toLowerCase().includes('colloquial') },
      { name: 'haa', ok: instruction.includes('haa') },
      { name: 'SPONTANEOUS TOPIC DETECTION', ok: instruction.includes('SPONTANEOUS TOPIC DETECTION') },
      { name: 'MULTIPLE TOPICS', ok: instruction.includes('MULTIPLE TOPICS') },
      { name: 'DYNAMIC FOLLOW-UP', ok: instruction.includes('DYNAMIC FOLLOW-UP') },
      { name: 'NO UNNECESSARY TRIGGERS', ok: instruction.includes('NO UNNECESSARY TRIGGERS') },
      { name: 'CURRENT SURVEY & CONVERSATION CONTEXT', ok: instruction.includes('CURRENT SURVEY & CONVERSATION CONTEXT') },
      { name: 'OUTPUT JSON FORMAT', ok: instruction.includes('OUTPUT JSON FORMAT') },
    ];

    checks.forEach((c) => {
      if (!c.ok) console.log('Failed check:', c.name);
    });

    if (checks.every((c) => c.ok)) {
      console.log('>> PASS SCENARIO 6: OpenAI System Instruction contains all essential survey intelligence rules.\n');
      passed++;
    } else {
      throw new Error('FAIL SCENARIO 6: System Instruction missing critical sections.');
    }
  }

  console.log('================================================================');
  console.log(`ALL ${passed} / 6 OPENAI INTEGRATION TESTS PASSED WITH 100% SUCCESS`);
  console.log('================================================================');
}

runOpenAiIntegrationSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
