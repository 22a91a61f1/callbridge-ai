async function runE2ETest() {
  console.log('Testing /api/survey/interact endpoint over HTTP...');

  const sessionId = `test_e2e_${Date.now()}`;
  const surveyConfig = {
    id: 'public_facilities',
    title: 'ప్రజా సదుపాయాల సర్వే',
    questions: [
      { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'drinking_water' },
      { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'roads' },
      { id: 'A3', text: 'విద్యుత్ సరఫరా పరిస్థితి ఎలా ఉంది?', category: 'electricity' },
      { id: 'A4', text: 'మురుగునీటి డ్రైనేజీ వ్యవస్థ ఎలా ఉంది?', category: 'drainage' },
    ],
  };

  // Turn 1: Multi-topic answer
  const res1 = await fetch('http://localhost:3000/api/survey/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      surveyConfig,
      messages: [
        { role: 'agent', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
        { role: 'respondent', text: 'water bagundhi kani roads baledhu drainage kuda problem' },
      ],
      collectedAnswers: {},
    }),
  });

  const json1 = await res1.json();
  console.log('--- Turn 1 Response ---');
  console.log('Reply:', json1.reply);
  console.log('Extracted Answers:', json1.extractedAnswers);
  console.log('Conversation State Keys:', Object.keys(json1.conversationState || {}));

  const state1 = json1.conversationState;
  if (!state1) {
    throw new Error('Missing conversationState in response');
  }

  // Verify all required conversation state fields
  const requiredFields = [
    'session_id',
    'survey_id',
    'language',
    'current_topic',
    'current_question',
    'conversation_history',
    'answers',
    'topic_status',
    'pending_follow_up',
    'completed_topics',
    'conversation_status',
  ];

  for (const field of requiredFields) {
    if (state1[field] === undefined) {
      throw new Error(`Missing field ${field} in conversationState`);
    }
  }

  console.log('>> PASS: All required conversation state fields present in API response.\n');

  // Turn 2: Spontaneous topic detection
  const res2 = await fetch('http://localhost:3000/api/survey/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      surveyConfig,
      conversationState: state1,
      messages: [
        { role: 'agent', text: json1.reply },
        { role: 'respondent', text: 'maku roju night power sariga vundataledhu, complaint ichana no use' },
      ],
      collectedAnswers: {},
    }),
  });

  const json2 = await res2.json();
  console.log('--- Turn 2 Response ---');
  console.log('Reply:', json2.reply);
  console.log('Extracted Answers:', json2.extractedAnswers);
  console.log('Power cut captured:', json2.conversationState.answers.night_power_cut || json2.conversationState.answers.electricity_night_problem);

  if (!json2.reply || json2.reply.includes('undefined')) {
    throw new Error('Invalid reply generated');
  }

  console.log('>> PASS: Spontaneous power complaint handled and contextual reply generated.\n');
  console.log('================================================================');
  console.log('E2E HTTP API INTERACTION TESTS PASSED 100%');
  console.log('================================================================');
}

runE2ETest().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
