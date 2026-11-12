import dotenv from 'dotenv';
import { processTurnWithOpenAi } from '../server/survey/openAiEngine';
import { SurveySessionState, surveySessionStore } from '../server/survey/sessionManager';

dotenv.config({ override: true });

const mockSurveyConfig = {
  title: 'పౌర సదుపాయాల సర్వే',
  questions: [
    { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'drinking_water' },
    { id: 'A2', text: 'మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'roads' },
    { id: 'A3', text: 'మరి కరెంట్ సరఫరా ఎలా ఉంది?', category: 'electricity' },
    { id: 'A4', text: 'మరి డ్రైనేజీ పరిస్థితి ఎలా ఉంది?', category: 'drainage' },
    { id: 'A5', text: 'మరి మీ ప్రాంతంలో చెత్త సేకరణ ఎలా జరుగుతోంది?', category: 'waste_management' },
  ],
};

function createCleanSession(id: string): SurveySessionState {
  return surveySessionStore.resetSession(id, 'public_facilities', 'te');
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING SECTION 24: 7 SPECIFIED TEST CONVERSATIONS');
  console.log('================================================================\n');

  let passed = 0;

  // ---------------------------------------------------------------------------
  // TEST 1:
  // Agent: "మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?"
  // Respondent: "ok"
  // Agent: "నీటి సౌకర్యం బాగానే ఉందని చెబుతున్నారా అండి, లేక ఏమైనా సమస్య ఉందా?"
  // Respondent: "haa"
  // Expected: "సరే అండి. మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?" (NOT a water-problem question)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: AMBIGUOUS OK -> CLARIFICATION -> HAA ---');
  {
    const session = createCleanSession('s24_test_1');
    // Turn 1: Respondent says "ok"
    const t1 = await processTurnWithOpenAi('ok', session, mockSurveyConfig, {}, []);
    console.log('Turn 1 Agent Clarification:', t1.openAiResult.response_text);

    // Turn 2: Respondent confirms with "haa"
    const history = [
      { role: 'agent', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
      { role: 'respondent', text: 'ok' },
      { role: 'agent', text: t1.openAiResult.response_text },
    ];
    const t2 = await processTurnWithOpenAi('haa', t1.updatedSessionState, mockSurveyConfig, {}, history);
    console.log('Turn 2 Agent Response:', t2.openAiResult.response_text);
    console.log('Next Topic:', t2.updatedSessionState.current_topic);

    const reply = t2.openAiResult.response_text;
    const isWaterProblemAsked = reply.includes('సమస్య') && (reply.includes('నీటి') || reply.includes('నీరు'));
    const isRoadsMentioned = reply.includes('రోడ్ల') || reply.includes('రోడ్డు');

    if (!isWaterProblemAsked && isRoadsMentioned) {
      console.log('>> PASS TEST 1: Interpreted "haa" as good water, transitioned naturally to roads!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 1: Expected transition to roads without water problem follow-up, got: ${reply}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 2:
  // Agent: "మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"
  // Respondent: "baledhu"
  // Expected: One relevant road follow-up.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: ROAD BARE NEGATIVE (baledhu) ---');
  {
    const session = createCleanSession('s24_test_2');
    session.current_topic = 'roads';
    session.current_question = 'A2';
    session.current_question_topic = 'roads';
    session.current_question_id = 'A2';

    const history = [
      { role: 'agent', text: 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?' },
    ];
    const res = await processTurnWithOpenAi('baledhu', session, mockSurveyConfig, {}, history);
    console.log('Agent Response:', res.openAiResult.response_text);

    const reply = res.openAiResult.response_text;
    if (reply.includes('రోడ్లలో') || reply.includes('రోడ్ల') || reply.includes('సమస్య')) {
      console.log('>> PASS TEST 2: Asked one relevant road follow-up question!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 2: Expected relevant road follow-up, got: ${reply}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 3:
  // Agent: "రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?"
  // Respondent: "holes ekkuva ga vunnai varsham vastey water vundipothunai"
  // Expected: Acknowledge the actual details. Do not ask the generic road question again.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: ROAD DETAILED ANSWER ---');
  {
    const session = createCleanSession('s24_test_3');
    session.current_topic = 'roads';
    session.current_question = 'A2';
    session.pending_follow_up = {
      topic: 'roads',
      field: 'roads_issue',
      question: 'రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?',
      status: 'waiting_for_answer',
    };

    const history = [
      { role: 'agent', text: 'రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది?' },
    ];
    const res = await processTurnWithOpenAi('holes ekkuva ga vunnai varsham vastey water vundipothunai', session, mockSurveyConfig, {}, history);
    console.log('Agent Response:', res.openAiResult.response_text);
    console.log('Stored Answers:', res.updatedSessionState.answers);

    const reply = res.openAiResult.response_text;
    const isGenericRoadAsked = reply === 'రోడ్ల పరిస్థితి ఎలా ఉంది?' || reply === 'మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?';
    if (!isGenericRoadAsked && (reply.includes('గుంతలు') || reply.includes('రోడ్ల') || reply.includes('అర్థమైంది') || reply.includes('నీళ్లు'))) {
      console.log('>> PASS TEST 3: Acknowledged actual details and did not ask generic road question again!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 3: Generic road question repeated or details not acknowledged: ${reply}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 4:
  // Agent: "మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?"
  // Respondent: "maku roju night power sariga vundataledhu complaint ichina no use"
  // Expected: Understand this as electricity information. Do NOT ask "కరెంట్ సరఫరా ఎలా ఉంది?".
  // Instead acknowledge the information and continue naturally with the still-unanswered road topic.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: SPONTANEOUS TOPIC (Roads asked -> Night power cuts reported) ---');
  {
    const session = createCleanSession('s24_test_4');
    session.current_topic = 'roads';
    session.current_question = 'A2';

    const history = [
      { role: 'agent', text: 'మరి మీ ప్రాంతంలో రోడ్ల పరిస్థితి ఎలా ఉంది?' },
    ];
    const res = await processTurnWithOpenAi('maku roju night power sariga vundataledhu complaint ichina no use', session, mockSurveyConfig, {}, history);
    console.log('Agent Response:', res.openAiResult.response_text);
    console.log('Topic Updates:', res.openAiResult.topic_updates);
    console.log('Electricity Status:', res.updatedSessionState.topic_status?.electricity);

    const reply = res.openAiResult.response_text;
    const isGenericElectricityAsked = reply === 'మరి కరెంట్ సరఫరా ఎలా ఉంది?' || reply === 'కరెంట్ సరఫరా ఎలా ఉంది?';
    const isPowerAck = reply.includes('కరెంట్') || reply.includes('విద్యుత్') || reply.includes('రాత్రి') || reply.includes('complaint');
    const isRoadsMentioned = reply.includes('రోడ్ల') || reply.includes('రోడ్డు');

    if (!isGenericElectricityAsked && isPowerAck && isRoadsMentioned) {
      console.log('>> PASS TEST 4: Recognized spontaneous electricity topic, acknowledged, and continued with road topic!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 4: Did not properly handle spontaneous electricity response: ${reply}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 5:
  // Respondent: "water bagundhi kani roads baledhu drainage kuda problem"
  // Expected: Store all three topics. Do not lose any of them.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: MULTI-TOPIC RESPONSE ---');
  {
    const session = createCleanSession('s24_test_5');
    const res = await processTurnWithOpenAi('water bagundhi kani roads baledhu drainage kuda problem', session, mockSurveyConfig, {}, []);
    console.log('Agent Response:', res.openAiResult.response_text);
    console.log('Topic Updates:', res.openAiResult.topic_updates);
    console.log('Topic Statuses:', res.updatedSessionState.topic_status);

    const topicsUpdated = (res.openAiResult.topic_updates || []).map((t) => t.topic);
    const hasWater = topicsUpdated.includes('drinking_water');
    const hasRoads = topicsUpdated.includes('roads');
    const hasDrainage = topicsUpdated.includes('drainage');

    if (hasWater && hasRoads && hasDrainage) {
      console.log('>> PASS TEST 5: All 3 topics (drinking_water, roads, drainage) stored successfully!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 5: Multi-topic not all captured. Topics: ${JSON.stringify(topicsUpdated)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 6:
  // Respondent: "naku kopam vastundi kani survey cheptha"
  // Expected: Remain calm and continue. Do not terminate the call merely because the respondent expresses frustration.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: FRUSTRATION / ANGER WITHOUT REFUSAL ---');
  {
    const session = createCleanSession('s24_test_6');
    const res = await processTurnWithOpenAi('naku kopam vastundi kani survey cheptha', session, mockSurveyConfig, {}, []);
    console.log('Agent Response:', res.openAiResult.response_text);
    console.log('Conversation Status:', res.updatedSessionState.conversation_status);

    const isTerminated =
      res.updatedSessionState.conversation_status === 'refused' ||
      res.updatedSessionState.conversation_status === 'ended_by_user' ||
      res.updatedSessionState.conversation_status === 'ended';

    if (!isTerminated && res.openAiResult.intent !== 'refusal' && res.openAiResult.intent !== 'stop') {
      console.log('>> PASS TEST 6: Remained calm and did not terminate call on respondent frustration!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 6: Incorrectly terminated call when respondent said they will do survey! Status: ${res.updatedSessionState.conversation_status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 7:
  // Respondent: "naku matladali ani ledu"
  // Expected: Recognize explicit refusal and end respectfully.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: EXPLICIT REFUSAL ---');
  {
    const session = createCleanSession('s24_test_7');
    const res = await processTurnWithOpenAi('naku matladali ani ledu', session, mockSurveyConfig, {}, []);
    console.log('Agent Response:', res.openAiResult.response_text);
    console.log('Conversation Status:', res.updatedSessionState.conversation_status);

    if (
      res.updatedSessionState.conversation_status === 'refused' ||
      res.openAiResult.intent === 'refusal'
    ) {
      console.log('>> PASS TEST 7: Recognized explicit refusal and ended respectfully!\n');
      passed++;
    } else {
      throw new Error(`FAIL TEST 7: Expected refusal, got: ${res.updatedSessionState.conversation_status}`);
    }
  }

  console.log('================================================================');
  console.log(`ALL ${passed} / 7 SECTION 24 TEST CONVERSATIONS PASSED!`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
