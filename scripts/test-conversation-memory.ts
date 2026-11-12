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
  ],
  knowledgeBase: 'తాగునీటి సర్వే',
};

async function runTest() {
  console.log('====================================================');
  console.log('TESTING CONVERSATION MEMORY & STATE MANAGEMENT');
  console.log('====================================================\n');

  const sessionId = 'test_session_' + Date.now();
  const messages: Array<{ role: string; text: string }> = [];

  // Step 1: Start the survey
  console.log('STEP 1: Starting the survey...');
  const res1 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages: [],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply 1:', res1.reply);
  console.log('Session State 1:', JSON.stringify(res1.conversationState, null, 2));
  messages.push({ role: 'agent', text: res1.reply });

  // Step 2: Answer the water question: "రోజూ నీళ్లు రావు"
  console.log('\nSTEP 2: Answering water question: "రోజూ నీళ్లు రావు"...');
  messages.push({ role: 'respondent', text: 'రోజూ నీళ్లు రావు' });
  const res2 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply 2:', res2.reply);
  console.log('Session State 2 Answers:', JSON.stringify(res2.conversationState?.answers, null, 2));
  console.log('Pending Follow-up:', res2.conversationState?.pending_follow_up);
  console.log('Conversation Status:', res2.conversationState?.conversation_status);
  messages.push({ role: 'agent', text: res2.reply });

  // Step 3: Answer the follow-up: "వారానికి మూడు రోజులు వస్తాయి"
  console.log('\nSTEP 3: Answering follow-up: "వారానికి మూడు రోజులు వస్తాయి"...');
  messages.push({ role: 'respondent', text: 'వారానికి మూడు రోజులు వస్తాయి' });
  const res3 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply 3:', res3.reply);
  console.log('Session State 3 Answers:', JSON.stringify(res3.conversationState?.answers, null, 2));
  messages.push({ role: 'agent', text: res3.reply });

  // Step 4: Say: "నేను ముందే చెప్పాను కదా"
  console.log('\nSTEP 4: Saying: "నేను ముందే చెప్పాను కదా"...');
  messages.push({ role: 'respondent', text: 'నేను ముందే చెప్పాను కదా' });
  const res4 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply 4:', res4.reply);
  console.log('Session State 4 Answers:', JSON.stringify(res4.conversationState?.answers, null, 2));
  messages.push({ role: 'agent', text: res4.reply });

  // Step 5: Correct the answer: "కాదు, నాలుగు రోజులు వస్తాయి"
  console.log('\nSTEP 5: Correcting answer: "కాదు, నాలుగు రోజులు వస్తాయి"...');
  messages.push({ role: 'respondent', text: 'కాదు, నాలుగు రోజులు వస్తాయి' });
  const res5 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent Reply 5:', res5.reply);
  console.log('Session State 5 Full State:', JSON.stringify(res5.conversationState, null, 2));

  // Verification checks
  const finalAnswers = res5.conversationState?.answers || {};
  console.log('\n====================================================');
  console.log('VERIFICATION RESULTS:');
  console.log('====================================================');
  console.log('Final Answers:', finalAnswers);

  const waterSupplyCorrect = finalAnswers.water_supply === 'irregular';
  const waterDaysCorrect = finalAnswers.water_days_per_week === 4;

  console.log('water_supply === "irregular":', waterSupplyCorrect ? 'PASS (Preserved)' : 'FAIL');
  console.log('water_days_per_week === 4:', waterDaysCorrect ? 'PASS (Updated from 3 to 4)' : 'FAIL');

  if (waterSupplyCorrect && waterDaysCorrect) {
    console.log('\nALL CONVERSATION MEMORY & STATE TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\nTEST FAILED: Final state does not match expected memory values.');
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
