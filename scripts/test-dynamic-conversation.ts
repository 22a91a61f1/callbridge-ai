import http from 'http';

function makeRequest(path: string, method: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

const PUBLIC_FACILITIES_CONFIG = {
  id: 'survey-a-public-facilities',
  surveyType: 'PUBLIC_FACILITIES',
  title: 'ప్రజా సదుపాయాల సర్వే (SURVEY A — PUBLIC FACILITIES)',
  targetLanguage: 'Telugu',
  questions: [
    { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'తాగునీరు' },
    { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'రోడ్లు' },
    { id: 'A3', text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?', category: 'విద్యుత్' },
    { id: 'A4', text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?', category: 'డ్రైనేజీ' },
  ],
  knowledgeBase: 'తాగునీటి మరియు ప్రజా సదుపాయాల సర్వే',
};

async function testDynamicConversation() {
  console.log('================================================================');
  console.log('TESTING DYNAMIC & NATURAL CONVERSATION FOR TELUGU SURVEY AGENT');
  console.log('================================================================\n');

  const sessionId = 'session_dynamic_' + Date.now();
  const messages: Array<{ role: string; text: string }> = [];

  // ===============================================================
  // TURN 0: Start survey call
  // ===============================================================
  console.log('--- TURN 0: Starting survey ---');
  const res0 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages: [],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res0.reply);
  messages.push({ role: 'agent', text: res0.reply });

  // ===============================================================
  // TURN 1: Respondent says: "baledhu only 3 days vastai"
  // ===============================================================
  console.log('\n--- TURN 1: Respondent: "baledhu only 3 days vastai" ---');
  messages.push({ role: 'respondent', text: 'baledhu only 3 days vastai' });
  const res1 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res1.reply);
  console.log('Current Stored Answers:', res1.conversationState?.answers);
  console.log('Current Topic:', res1.conversationState?.current_question_topic);
  console.log('Pending Follow-up:', res1.conversationState?.pending_follow_up);
  messages.push({ role: 'agent', text: res1.reply });

  // Verification 1: Must NOT jump to roads, must understand water_supply = irregular and water_days_per_week = 3
  const answers1 = res1.conversationState?.answers || {};
  if (answers1.water_supply !== 'irregular' || answers1.water_days_per_week !== 3) {
    throw new Error(`FAIL Turn 1: Expected water_supply=irregular and water_days_per_week=3, got: ${JSON.stringify(answers1)}`);
  }
  if (res1.reply.includes('రోడ్ల') || res1.reply.includes('తర్వాతి ప్రశ్న')) {
    throw new Error(`FAIL Turn 1: Agent jumped directly to roads or used robotic "తర్వాతి ప్రశ్న"! Reply: ${res1.reply}`);
  }
  console.log('>> PASS Turn 1: Understood Romanized Telugu answer & asked water follow-up without jumping to roads.');

  // ===============================================================
  // TURN 2: Respondent confirms: "అవును, supply sarigga undadu."
  // ===============================================================
  console.log('\n--- TURN 2: Respondent: "అవును, supply sarigga undadu." ---');
  messages.push({ role: 'respondent', text: 'అవును, supply sarigga undadu.' });
  const res2 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res2.reply);
  console.log('Current Stored Answers:', res2.conversationState?.answers);
  console.log('Pending Follow-up:', res2.conversationState?.pending_follow_up);
  messages.push({ role: 'agent', text: res2.reply });

  // Verification 2: Stored water_main_issue = supply, asks about timing
  const answers2 = res2.conversationState?.answers || {};
  if (answers2.water_main_issue !== 'supply') {
    throw new Error(`FAIL Turn 2: Expected water_main_issue=supply, got: ${JSON.stringify(answers2)}`);
  }
  if (!res2.reply.includes('timing') && !res2.reply.includes('సమయం')) {
    throw new Error(`FAIL Turn 2: Expected timing follow-up, got: ${res2.reply}`);
  }
  console.log('>> PASS Turn 2: Stored supply issue and asked natural timing follow-up.');

  // ===============================================================
  // TURN 3: Respondent says: "timing kuda problem."
  // ===============================================================
  console.log('\n--- TURN 3: Respondent: "timing kuda problem." ---');
  messages.push({ role: 'respondent', text: 'timing kuda problem.' });
  const res3 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res3.reply);
  console.log('Current Stored Answers:', res3.conversationState?.answers);
  console.log('Completed Questions:', res3.conversationState?.completed_questions);
  messages.push({ role: 'agent', text: res3.reply });

  // Verification 3: Water topic now complete, stores timing issue, transitions naturally WITHOUT "తర్వాతి ప్రశ్న"
  const answers3 = res3.conversationState?.answers || {};
  if (!answers3.water_timing_issue && !answers3.water_timing) {
    throw new Error(`FAIL Turn 3: Expected water timing stored, got: ${JSON.stringify(answers3)}`);
  }
  if (res3.reply.includes('తర్వాతి ప్రశ్న') || res3.reply.includes('తదుపరి ప్రశ్న')) {
    throw new Error(`FAIL Turn 3: Agent used robotic "తర్వాతి ప్రశ్న" in transition! Reply: ${res3.reply}`);
  }
  console.log('>> PASS Turn 3: Water topic completed and smoothly transitioned to next civic topics naturally.');

  // ===============================================================
  // TURN 4: Correction test: "కాదు అండి, నాలుగు రోజులు వస్తాయి"
  // ===============================================================
  console.log('\n--- TURN 4: Respondent Correction: "కాదు అండి, నాలుగు రోజులు వస్తాయి" ---');
  messages.push({ role: 'respondent', text: 'కాదు అండి, నాలుగు రోజులు వస్తాయి' });
  const res4 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res4.reply);
  console.log('Current Stored Answers:', res4.conversationState?.answers);
  messages.push({ role: 'agent', text: res4.reply });

  const answers4 = res4.conversationState?.answers || {};
  if (answers4.water_days_per_week !== 4) {
    throw new Error(`FAIL Turn 4: Expected water_days_per_week=4, got: ${answers4.water_days_per_week}`);
  }
  if (!res4.reply.includes('సరిచేస్తున్నాను') && !res4.reply.includes('సరిచేశాను')) {
    throw new Error(`FAIL Turn 4: Expected acknowledgment of correction, got: ${res4.reply}`);
  }
  console.log('>> PASS Turn 4: Corrected value updated in state from 3 to 4 with natural acknowledgment.');

  // ===============================================================
  // TURN 5: "I already told you" test: "నేను ముందే చెప్పాను కదా"
  // ===============================================================
  console.log('\n--- TURN 5: Respondent: "నేను ముందే చెప్పాను కదా" ---');
  messages.push({ role: 'respondent', text: 'నేను ముందే చెప్పాను కదా' });
  const res5 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res5.reply);
  console.log('Current Stored Answers:', res5.conversationState?.answers);
  messages.push({ role: 'agent', text: res5.reply });

  if (!res5.reply.includes('ముందే చెప్పారు') || !res5.reply.includes('గుర్తుంది')) {
    throw new Error(`FAIL Turn 5: Expected agent to remember and acknowledge, got: ${res5.reply}`);
  }
  console.log('>> PASS Turn 5: Recognized "I already told you" statement and recalled stored answers without re-asking.');

  // ===============================================================
  // TURN 6: Cross-topic input: "రోడ్లు కూడా బాగోలేవు, గుంతలు ఎక్కువగా ఉన్నాయి"
  // ===============================================================
  console.log('\n--- TURN 6: Respondent on roads: "రోడ్లు కూడా బాగోలేవు, గుంతలు ఎక్కువగా ఉన్నాయి" ---');
  messages.push({ role: 'respondent', text: 'రోడ్లు కూడా బాగోలేవు, గుంతలు ఎక్కువగా ఉన్నాయి' });
  const res6 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply:', res6.reply);
  console.log('Current Stored Answers:', res6.conversationState?.answers);
  console.log('Completed Questions:', res6.conversationState?.completed_questions);

  const answers6 = res6.conversationState?.answers || {};
  if (answers6.roads_condition !== 'poor' || answers6.roads_main_issue !== 'potholes') {
    throw new Error(`FAIL Turn 6: Expected roads_condition=poor and roads_main_issue=potholes, got: ${JSON.stringify(answers6)}`);
  }
  console.log('>> PASS Turn 6: Stored roads condition and potholes issue, transitioned naturally to electricity.');

  // ===============================================================
  // TEST SCENARIO B: Multi-topic in single sentence (Section 5)
  // "నీళ్లు వారానికి మూడు రోజులు వస్తాయి, రోడ్లు కూడా బాగోలేవు."
  // ===============================================================
  console.log('\n--- SCENARIO B: Multiple information in single sentence ---');
  const sessionBId = 'session_multi_' + Date.now();
  const resB = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionBId,
    messages: [
      { role: 'agent', text: 'నమస్కారం! మొదటి ప్రశ్న: మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
      { role: 'respondent', text: 'నీళ్లు వారానికి మూడు రోజులు వస్తాయి, రోడ్లు కూడా బాగోలేవు.' },
    ],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply B:', resB.reply);
  console.log('Answers B:', resB.conversationState?.answers);
  const answersB = resB.conversationState?.answers || {};
  if (answersB.water_days_per_week !== 3 || answersB.water_supply !== 'irregular' || answersB.roads_condition !== 'poor') {
    throw new Error(`FAIL Scenario B: Expected both water and roads saved, got: ${JSON.stringify(answersB)}`);
  }
  if (!resB.reply.includes('రోడ్లలో ప్రధానంగా ఏ సమస్య ఉంది') && !resB.reply.includes('రోడ్ల పరిస్థితి')) {
    throw new Error(`FAIL Scenario B: Expected agent to smoothly handle current topic and acknowledge roads, got: ${resB.reply}`);
  }
  console.log('>> PASS Scenario B: Stored multiple pieces of information and naturally addressed current and mentioned topic.');

  // ===============================================================
  // TEST SCENARIO C: Complete information upfront (Section 4)
  // "వారానికి మూడు రోజులు మాత్రమే నీళ్లు వస్తాయి, ఉదయం మాత్రమే వస్తాయి."
  // ===============================================================
  console.log('\n--- SCENARIO C: Complete information upfront (no redundant follow-up) ---');
  const sessionCId = 'session_complete_' + Date.now();
  const resC = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionCId,
    messages: [
      { role: 'agent', text: 'నమస్కారం! మొదటి ప్రశ్న: మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?' },
      { role: 'respondent', text: 'వారానికి మూడు రోజులు మాత్రమే నీళ్లు వస్తాయి, ఉదయం మాత్రమే వస్తాయి.' },
    ],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply C:', resC.reply);
  console.log('Answers C:', resC.conversationState?.answers);
  const answersC = resC.conversationState?.answers || {};
  if (answersC.water_days_per_week !== 3 || answersC.water_timing !== 'morning') {
    throw new Error(`FAIL Scenario C: Expected days=3 and timing=morning, got: ${JSON.stringify(answersC)}`);
  }
  if (resC.reply.includes('ఎన్ని రోజులు') || resC.reply.includes('ఏ సమయంలో')) {
    throw new Error(`FAIL Scenario C: Agent redundantly re-asked days or timing! Reply: ${resC.reply}`);
  }
  console.log('>> PASS Scenario C: Acknowledged complete information without asking redundant questions.');

  console.log('\n================================================================');
  console.log('ALL DYNAMIC & NATURAL CONVERSATION TESTS PASSED WITH 100% SUCCESS');
  console.log('================================================================');
}

testDynamicConversation().catch((err) => {
  console.error('\nTEST SUITE ERROR:', err);
  process.exit(1);
});
