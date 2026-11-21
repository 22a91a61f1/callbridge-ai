import { processTurnMemory } from '../server/survey/memoryEngine';
import { SurveySessionState } from '../server/survey/sessionManager';

function createFreshSession(id = 'test_session'): SurveySessionState {
  return {
    session_id: id,
    survey_id: 'public_facilities',
    language: 'te',
    current_question_id: 'A1',
    current_question_topic: 'drinking_water',
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
  { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'water' },
  { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'roads' },
  { id: 'A3', text: 'విద్యుత్ సరఫరా పరిస్థితి ఎలా ఉంది?', category: 'electricity' },
  { id: 'A4', text: 'మురుగునీటి డ్రైనేజీ వ్యవస్థ ఎలా ఉంది?', category: 'drainage' },
];

function runAllScenarios() {
  console.log('================================================================');
  console.log('TESTING ALL 10 CONVERSATIONAL INTELLIGENCE SCENARIOS (SECTION 24)');
  console.log('================================================================\n');

  let passedCount = 0;

  // -------------------------------------------------------------------------
  // TEST 1 — WATER IS GOOD
  // Respondent: "మా దగ్గర వాటర్ బాగానే ఉంటది. పెద్దగా ప్రాబ్లెమ్ లేదు."
  // Expected: No unnecessary timing question. Move naturally to roads.
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: WATER IS GOOD ---');
  {
    const session = createFreshSession('t1');
    const res = processTurnMemory('మా దగ్గర వాటర్ బాగానే ఉంటది. పెద్దగా ప్రాబ్లెమ్ లేదు.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Answers:', res.updatedState.answers);

    if (
      (res.updatedState.answers.water_service === 'good' || res.updatedState.answers.water_problem === 'none_reported') &&
      !res.directReply?.includes('టైమింగ్') &&
      !res.directReply?.includes('timing') &&
      res.updatedState.current_question_topic === 'roads'
    ) {
      console.log('>> PASS TEST 1: No timing question asked, recognized good water, moved to roads naturally.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 1: Did not handle water good properly. Reply: ${res.directReply}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2 — WATER IRREGULAR
  // Respondent: "వాటర్ సరిగ్గా రావడం లేదు. వారానికి మూడు రోజులు మాత్రమే వస్తాయి."
  // Expected: Store water_supply = irregular, water_days_per_week = 3. Do NOT ask frequency again.
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: WATER IRREGULAR ---');
  {
    const session = createFreshSession('t2');
    const res = processTurnMemory('వాటర్ సరిగ్గా రావడం లేదు. వారానికి మూడు రోజులు మాత్రమే వస్తాయి.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Answers:', res.updatedState.answers);

    if (
      res.updatedState.answers.water_supply === 'irregular' &&
      res.updatedState.answers.water_days_per_week === 3 &&
      !res.directReply?.includes('ఎన్ని రోజులు')
    ) {
      console.log('>> PASS TEST 2: Stored irregular and 3 days per week. Did not ask frequency again.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 2: Did not handle irregular water frequency. Answers: ${JSON.stringify(res.updatedState.answers)}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3 — TANKER
  // Respondent: "ట్యాంకర్ మీదే ఆధారపడుతున్నాం. మూడు రోజులకు ఒకసారి వస్తుంది."
  // Expected: Store tanker dependency and frequency. Do NOT ask frequency again.
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: TANKER ---');
  {
    const session = createFreshSession('t3');
    const res = processTurnMemory('ట్యాంకర్ మీదే ఆధారపడుతున్నాం. మూడు రోజులకు ఒకసారి వస్తుంది.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Answers:', res.updatedState.answers);

    if (
      res.updatedState.answers.water_source === 'tanker' &&
      res.updatedState.answers.tanker_dependent === true &&
      res.updatedState.answers.tanker_frequency === 'once_every_3_days' &&
      !res.directReply?.includes('ఎన్ని రోజులు')
    ) {
      console.log('>> PASS TEST 3: Stored tanker dependency and frequency. Did not ask frequency again.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 3: Tanker case failed. Answers: ${JSON.stringify(res.updatedState.answers)}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4 — ROAD MULTIPLE PROBLEMS
  // Respondent: "రోడ్లలో గుంతలు ఉన్నాయి. వర్షం వస్తే ఇబ్బంది. యాక్సిడెంట్లు కూడా అవుతున్నాయి."
  // Expected: Recognize all three issues (potholes, rain_problem, accidents).
  // -------------------------------------------------------------------------
  console.log('--- TEST 4: ROAD MULTIPLE PROBLEMS ---');
  {
    const session = createFreshSession('t4');
    session.current_question_id = 'A2';
    session.current_question_topic = 'roads';

    const res = processTurnMemory('రోడ్లలో గుంతలు ఉన్నాయి. వర్షం వస్తే ఇబ్బంది. యాక్సిడెంట్లు కూడా అవుతున్నాయి.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Answers:', res.updatedState.answers);

    if (
      res.updatedState.answers.roads_condition === 'poor' &&
      res.updatedState.answers.roads_problem === 'potholes' &&
      res.updatedState.answers.rain_related_problem === true &&
      res.updatedState.answers.safety_concern === 'accidents'
    ) {
      console.log('>> PASS TEST 4: All 3 road issues recognized (potholes, rain, accidents).\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 4: Road multiple problems failed: ${JSON.stringify(res.updatedState.answers)}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 5 — MULTIPLE TOPICS
  // Respondent: "వాటర్ బాగుంది కానీ రోడ్లు బాగోలేవు, కరెంట్ కూడా తరచుగా పోతుంది."
  // Expected: Recognize water=good, roads=problem, electricity=problem. Do not ask unnecessary water follow-up.
  // -------------------------------------------------------------------------
  console.log('--- TEST 5: MULTIPLE TOPICS ---');
  {
    const session = createFreshSession('t5');
    const res = processTurnMemory('వాటర్ బాగుంది కానీ రోడ్లు బాగోలేవు, కరెంట్ కూడా తరచుగా పోతుంది.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Answers:', res.updatedState.answers);

    if (
      res.updatedState.answers.water_service === 'good' &&
      res.updatedState.answers.roads_condition === 'poor' &&
      res.updatedState.answers.electricity_status === 'frequent_cuts' &&
      res.updatedState.current_question_topic === 'roads'
    ) {
      console.log('>> PASS TEST 5: Water good, roads poor, and frequent electricity cuts all recognized. No water follow-up asked.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 5: Multiple topics failed: ${JSON.stringify(res.updatedState.answers)}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 6 — BUSY
  // Respondent: "నేను ఇప్పుడు బిజీగా ఉన్నాను."
  // Expected: Stop survey questions. Say naturally that they can tell a convenient time for a callback.
  // -------------------------------------------------------------------------
  console.log('--- TEST 6: BUSY ---');
  {
    const session = createFreshSession('t6');
    const res = processTurnMemory('నేను ఇప్పుడు బిజీగా ఉన్నాను.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Status:', res.updatedState.conversation_status);

    if (
      res.updatedState.conversation_status === 'busy' &&
      res.directReply?.includes('ఎప్పుడు') &&
      !res.directReply?.includes('తాగునీటి')
    ) {
      console.log('>> PASS TEST 6: Survey stopped, asked for convenient callback time.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 6: Busy response failed. Reply: ${res.directReply}, Status: ${res.updatedState.conversation_status}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 7 — BUSY + TIME
  // Respondent: "ఇప్పుడు బిజీగా ఉన్నాను. సాయంత్రం 6కి కాల్ చేయండి."
  // Expected: Store callback time. Confirm briefly. End conversation.
  // -------------------------------------------------------------------------
  console.log('--- TEST 7: BUSY + TIME ---');
  {
    const session = createFreshSession('t7');
    const res = processTurnMemory('ఇప్పుడు బిజీగా ఉన్నాను. సాయంత్రం 6కి కాల్ చేయండి.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Status:', res.updatedState.conversation_status);
    console.log('Callback Time:', res.updatedState.callback_time);

    if (
      res.updatedState.conversation_status === 'callback_requested' &&
      res.updatedState.callback_requested === true &&
      res.updatedState.callback_time?.includes('సాయంత్రం') &&
      res.directReply?.includes('సాయంత్రం') &&
      !res.directReply?.includes('తాగునీటి')
    ) {
      console.log('>> PASS TEST 7: Stored callback time, confirmed briefly, ended conversation.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 7: Busy with time failed. Status: ${res.updatedState.conversation_status}, Time: ${res.updatedState.callback_time}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 8 — BYE
  // Respondent: "సరే బై."
  // Expected: Brief polite closing. Do not ask another survey question.
  // -------------------------------------------------------------------------
  console.log('--- TEST 8: BYE ---');
  {
    const session = createFreshSession('t8');
    const res = processTurnMemory('సరే బై.', session, mockQuestions);
    console.log('Agent Reply:', res.directReply);
    console.log('Status:', res.updatedState.conversation_status);

    if (
      res.updatedState.conversation_status === 'ended_by_user' &&
      res.directReply?.includes('ధన్యవాదాలు') &&
      !res.directReply?.includes('ప్రశ్న')
    ) {
      console.log('>> PASS TEST 8: Ended by user, polite closing, no survey question.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 8: Bye failed. Status: ${res.updatedState.conversation_status}, Reply: ${res.directReply}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 9 — RESPONDENT DISCONNECTS
  // No further respondent message (empty string).
  // Expected: End conversation state. Do not generate additional text.
  // -------------------------------------------------------------------------
  console.log('--- TEST 9: RESPONDENT DISCONNECTS ---');
  {
    const session = createFreshSession('t9');
    const res = processTurnMemory('', session, mockQuestions);
    console.log('Agent Reply:', JSON.stringify(res.directReply));
    console.log('Status:', res.updatedState.conversation_status);

    if (res.updatedState.conversation_status === 'ended' && res.directReply === '') {
      console.log('>> PASS TEST 9: Status marked ended, no additional text generated.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 9: Disconnect failed. Status: ${res.updatedState.conversation_status}, Reply: ${res.directReply}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 10 — CORRECTION
  // Respondent: "మూడు రోజులు వస్తాయి."
  // Later: "కాదు, నాలుగు రోజులు వస్తాయి."
  // Expected: Update water_days_per_week = 4. Do not retain 3 as current value.
  // -------------------------------------------------------------------------
  console.log('--- TEST 10: CORRECTION ---');
  {
    const session = createFreshSession('t10');
    // First answer
    const turn1 = processTurnMemory('మూడు రోజులు వస్తాయి.', session, mockQuestions);
    console.log('Turn 1 Answers:', turn1.updatedState.answers);

    // Later correction
    const turn2 = processTurnMemory('కాదు, నాలుగు రోజులు వస్తాయి.', turn1.updatedState, mockQuestions);
    console.log('Turn 2 Agent Reply:', turn2.directReply);
    console.log('Turn 2 Answers:', turn2.updatedState.answers);

    if (turn2.updatedState.answers.water_days_per_week === 4 && turn2.correctionMade) {
      console.log('>> PASS TEST 10: Successfully updated water_days_per_week from 3 to 4 on correction.\n');
      passedCount++;
    } else {
      throw new Error(`FAIL TEST 10: Correction failed. Days: ${turn2.updatedState.answers.water_days_per_week}`);
    }
  }

  console.log('================================================================');
  console.log(`ALL ${passedCount} / 10 SCENARIOS PASSED WITH 100% SUCCESS`);
  console.log('================================================================');
}

runAllScenarios();
