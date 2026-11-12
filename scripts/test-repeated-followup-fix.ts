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

async function testRepeatedFollowUpFix() {
  console.log('================================================================');
  console.log('TESTING REPEATED FOLLOW-UP FIX FOR TELUGU PUBLIC SURVEY AGENT');
  console.log('================================================================\n');

  // ==========================================================================
  // SUITE 1: User's Exact Conversation from Section 9
  // ==========================================================================
  console.log('=== SUITE 1: Section 9 Exact Case ===');
  const sessionId = 'session_exact_fix_' + Date.now();
  const messages: Array<{ role: string; text: string }> = [];

  // Turn 0: Survey Call Start
  console.log('Turn 0: Agent starts survey');
  const res0 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages: [],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res0.reply);
  messages.push({ role: 'agent', text: res0.reply });

  // Turn 1: Respondent: "baguundhi kani regular ga ravvu water 3 days vastai anthey"
  console.log('\nTurn 1: Respondent: "baguundhi kani regular ga ravvu water 3 days vastai anthey"');
  messages.push({ role: 'respondent', text: 'baguundhi kani regular ga ravvu water 3 days vastai anthey' });
  const res1 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res1.reply);
  console.log('Answers:', res1.conversationState?.answers);
  console.log('Pending Follow-up:', res1.conversationState?.pending_follow_up);
  console.log('Asked Follow-ups:', res1.conversationState?.asked_follow_ups);
  messages.push({ role: 'agent', text: res1.reply });

  if (
    res1.conversationState?.answers?.water_supply !== 'irregular' ||
    res1.conversationState?.answers?.water_days_per_week !== 3
  ) {
    throw new Error(`FAIL Turn 1: Expected water_supply=irregular and water_days_per_week=3, got: ${JSON.stringify(res1.conversationState?.answers)}`);
  }
  const followUp1 = res1.reply;
  console.log('>> PASS Turn 1: Understood irregular supply and 3 days per week.');

  // Turn 2: Respondent: "haa avvunu"
  console.log('\nTurn 2: Respondent: "haa avvunu"');
  messages.push({ role: 'respondent', text: 'haa avvunu' });
  const res2 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res2.reply);
  console.log('Answers:', res2.conversationState?.answers);
  console.log('Completed Follow-ups:', res2.conversationState?.completed_follow_ups);
  console.log('Pending Follow-up:', res2.conversationState?.pending_follow_up);
  messages.push({ role: 'agent', text: res2.reply });

  if (res2.reply === followUp1) {
    throw new Error(`FAIL Turn 2: Agent REPEATED the same follow-up question!`);
  }
  if (!res2.conversationState?.completed_follow_ups?.includes('water_supply_problem')) {
    throw new Error(`FAIL Turn 2: Expected water_supply_problem in completed_follow_ups`);
  }
  if (!res2.reply.includes('timing')) {
    throw new Error(`FAIL Turn 2: Expected new timing follow-up, got: ${res2.reply}`);
  }
  console.log('>> PASS Turn 2: Supply follow-up marked complete, asked new timing question without repeating.');

  // Turn 3: Respondent: "haa roju okatime ki ravvu"
  console.log('\nTurn 3: Respondent: "haa roju okatime ki ravvu"');
  messages.push({ role: 'respondent', text: 'haa roju okatime ki ravvu' });
  const res3 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res3.reply);
  console.log('Answers:', res3.conversationState?.answers);
  console.log('Completed Follow-ups:', res3.conversationState?.completed_follow_ups);
  console.log('Current Topic:', res3.conversationState?.current_question_topic);
  messages.push({ role: 'agent', text: res3.reply });

  if (res3.reply.includes('timing ఏమైనా ఇబ్బందిగా ఉంటుందా')) {
    throw new Error(`FAIL Turn 3: Agent REPEATED the timing question! Reply: ${res3.reply}`);
  }
  if (!res3.conversationState?.completed_follow_ups?.includes('water_timing')) {
    throw new Error(`FAIL Turn 3: water_timing should be in completed_follow_ups!`);
  }
  if (!res3.conversationState?.answers?.water_timing) {
    throw new Error(`FAIL Turn 3: Expected water_timing stored in answers!`);
  }
  console.log('>> PASS Turn 3: Timing stored as no_fixed_time/irregular, follow-up marked complete, transitioned to roads.');

  // Turn 4: Respondent: "haa"
  console.log('\nTurn 4: Respondent: "haa"');
  messages.push({ role: 'respondent', text: 'haa' });
  const res4 = await makeRequest('/api/survey/interact', 'POST', {
    session_id: sessionId,
    messages,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent:', res4.reply);
  console.log('Answers:', res4.conversationState?.answers);
  console.log('Completed Follow-ups:', res4.conversationState?.completed_follow_ups);
  messages.push({ role: 'agent', text: res4.reply });

  if (res4.reply.includes('timing ఏమైనా ఇబ్బందిగా ఉంటుందా')) {
    throw new Error(`FAIL Turn 4: Agent REPEATED the completed timing question when respondent said "haa"!`);
  }
  console.log('>> PASS Turn 4: When user said "haa", agent did NOT repeat completed timing follow-up!');

  // ==========================================================================
  // SUITE 2: Section 3 — Affirmative "haa" to timing leads to specific time question
  // ==========================================================================
  console.log('\n=== SUITE 2: Section 3 Affirmative Flow ===');
  const session2Id = 'session_aff_fix_' + Date.now();
  const msgs2: Array<{ role: string; text: string }> = [];

  // Turn 0 & 1: Irregular water
  await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: [],
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  msgs2.push({ role: 'respondent', text: 'baledhu only 3 days vastai' });
  await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: msgs2,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  msgs2.push({ role: 'respondent', text: 'avvunu' });
  const resS2_askTiming = await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: msgs2,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent asked:', resS2_askTiming.reply);

  // Respondent says "haa" to timing
  console.log('Respondent: "haa"');
  msgs2.push({ role: 'respondent', text: 'haa' });
  const resS2_afterHaa = await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: msgs2,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent reply after "haa":', resS2_afterHaa.reply);
  console.log('Pending Follow-up:', resS2_afterHaa.conversationState?.pending_follow_up);

  if (resS2_afterHaa.reply.includes('timing ఏమైనా ఇబ్బందిగా ఉంటుందా')) {
    throw new Error(`FAIL Suite 2: Agent repeated the exact same timing question after "haa"!`);
  }
  if (!resS2_afterHaa.reply.includes('సాధారణంగా ఏ సమయానికి')) {
    throw new Error(`FAIL Suite 2: Expected different specific time question, got: ${resS2_afterHaa.reply}`);
  }
  console.log('>> PASS Suite 2: When user said "haa", agent asked a DIFFERENT question ("సాధారణంగా ఏ సమయానికి నీళ్లు వస్తాయి?").');

  // Respondent answers specific time: "ఉదయం 6 గంటలకు"
  console.log('Respondent: "ఉదయం 6 గంటలకు"');
  msgs2.push({ role: 'respondent', text: 'ఉదయం 6 గంటలకు' });
  const resS2_time = await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: msgs2,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent reply after specific time:', resS2_time.reply);
  console.log('Answers:', resS2_time.conversationState?.answers);
  if (!resS2_time.conversationState?.answers?.water_time) {
    throw new Error(`FAIL Suite 2: Expected water_time stored!`);
  }
  console.log('>> PASS Suite 2: Specific time stored and moved to roads naturally.');

  // ==========================================================================
  // SUITE 3: Section 7 — Correction of timing
  // ==========================================================================
  console.log('\n=== SUITE 3: Section 7 Timing Correction ===');
  console.log('Respondent says: "కాదు అండి, timing ఉదయం కాదు, సాయంత్రం వస్తుంది."');
  msgs2.push({ role: 'respondent', text: 'కాదు అండి, timing ఉదయం కాదు, సాయంత్రం వస్తుంది.' });
  const resS3_corr = await makeRequest('/api/survey/interact', 'POST', {
    session_id: session2Id,
    messages: msgs2,
    surveyConfig: PUBLIC_FACILITIES_CONFIG,
    collectedAnswers: {},
  });
  console.log('Agent reply after correction:', resS3_corr.reply);
  console.log('Answers after correction:', resS3_corr.conversationState?.answers);

  if (resS3_corr.reply.includes('timing ఏమైనా ఇబ్బందిగా ఉంటుందా')) {
    throw new Error(`FAIL Suite 3: Agent re-asked the original timing question upon correction!`);
  }
  if (!resS3_corr.reply.includes('సాయంత్రం వస్తుందని సరిచేస్తాను')) {
    throw new Error(`FAIL Suite 3: Expected natural acknowledgment of evening correction, got: ${resS3_corr.reply}`);
  }
  if (resS3_corr.conversationState?.answers?.water_time !== 'evening') {
    throw new Error(`FAIL Suite 3: Expected water_time=evening, got: ${resS3_corr.conversationState?.answers?.water_time}`);
  }
  console.log('>> PASS Suite 3: Timing corrected to evening without repeating the original timing question.');

  console.log('\n================================================================');
  console.log('ALL REPEATED FOLLOW-UP FIX TESTS PASSED WITH 100% SUCCESS');
  console.log('================================================================');
}

testRepeatedFollowUpFix().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
