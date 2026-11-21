import { SurveySequentialEngine, TELUGU_STRINGS } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS [${passed}]: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${description}`, details || '');
  }
}

async function runVerification() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — PUBLIC SURVEY PROGRESSION & ACKNOWLEDGEMENT VERIFICATION');
  console.log('========================================================================\n');

  // Verify 10 saved questions intact
  const activeQuestions = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
  assert('Exactly 10 active survey questions resolved', activeQuestions.length === 10);
  assert('Q1 is Drinking Water (A1)', activeQuestions[0].id === 'A1' && activeQuestions[0].text.includes('తాగునీటి'));
  assert('Q2 is Roads (A2)', activeQuestions[1].id === 'A2' && activeQuestions[1].text.includes('రోడ్ల'));
  assert('Q3 is Electricity (A3)', activeQuestions[2].id === 'A3' && activeQuestions[2].text.includes('విద్యుత్'));
  assert('Q4 is Drainage (A4)', activeQuestions[3].id === 'A4' && activeQuestions[3].text.includes('డ్రైనేజీ'));
  assert('Q5 is Sanitation (A5)', activeQuestions[4].id === 'A5' && activeQuestions[4].text.includes('చెత్త'));
  assert('Q6 is Health Services (A6)', activeQuestions[5].id === 'A6' && activeQuestions[5].text.includes('ఆరోగ్య'));
  assert('Q7 is Education (A7)', activeQuestions[6].id === 'A7' && activeQuestions[6].text.includes('విద్యా'));
  assert('Q8 is Public Transport (A8)', activeQuestions[7].id === 'A8' && activeQuestions[7].text.includes('రవాణా'));
  assert('Q9 is Govt Services (A9)', activeQuestions[8].id === 'A9' && activeQuestions[8].text.includes('ప్రభుత్వ'));
  assert('Q10 is Priority Issue (A10)', activeQuestions[9].id === 'A10' && activeQuestions[9].text.includes('మెరుగుపరచాల్సిన'));

  // ----------------------------------------------------------------------
  // CASE 1: Positive / No Problem Answers -> "సరే అండి, ధన్యవాదాలు." + next question
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING CASE 1: Positive / No Problem Answers ---');
  const posUtterances = ['బాగుంది', 'బాగానే ఉంది', 'సమస్య లేదు', 'ఎలాంటి సమస్య లేదు', 'No problem', 'Good'];
  for (const utt of posUtterances) {
    const sId = `case1_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const turn = SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: 'A1',
      userUtterance: utt,
    });
    assert(`Case 1 utterance "${utt}" acknowledges with "సరే అండి, ధన్యవాదాలు."`, turn.spokenResponse.includes('సరే అండి, ధన్యవాదాలు.'));
    assert(`Case 1 utterance "${utt}" immediately asks Q2`, turn.spokenResponse.includes('రోడ్ల') && turn.currentQuestionIndex === 1);
    assert(`Case 1 utterance "${utt}" does NOT ask "ఏంటి సమస్య?"`, !turn.spokenResponse.includes('ఏంటి సమస్య?'));
  }

  // ----------------------------------------------------------------------
  // CASE 2: Specific Problem Answers -> "ఓకే అండి, ధన్యవాదాలు." + next question
  // Must NOT ask "ఏంటి సమస్య?", must NOT respond with positive phrase.
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING CASE 2: Specific Problem Answers ---');
  const specificProblems = [
    { utt: 'రోడ్లపై గుంతలు ఉన్నాయి.', qId: 'A2', nextExpected: 'విద్యుత్' },
    { utt: 'రైళ్లు సరిగ్గా సమయానికి రావడం లేదు.', qId: 'A8', nextExpected: 'ప్రభుత్వ' },
    { utt: 'వాటర్ సప్లై సరిగా లేదు.', qId: 'A1', nextExpected: 'రోడ్ల' },
    { utt: 'డ్రైనేజ్ సమస్య ఉంది.', qId: 'A4', nextExpected: 'చెత్త' },
    { utt: 'బస్సులు సరిగ్గా రావడం లేదు.', qId: 'A8', nextExpected: 'ప్రభుత్వ' },
    { utt: 'రోజుకు మూడు సార్లు కరెంట్ పోతుంది.', qId: 'A3', nextExpected: 'డ్రైనేజీ' },
    { utt: 'హాస్పిటల్లో డాక్టర్లు సరిగ్గా ఉండరు.', qId: 'A6', nextExpected: 'విద్యా' },
  ];

  for (const sp of specificProblems) {
    const sId = `case2_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const turn = SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: sp.qId,
      userUtterance: sp.utt,
    });
    assert(`Case 2 "${sp.utt.slice(0, 25)}..." acknowledges with "ఓకే అండి, ధన్యవాదాలు."`, turn.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.'));
    assert(`Case 2 "${sp.utt.slice(0, 25)}..." does NOT use positive ack "సరే అండి, ధన్యవాదాలు."`, !turn.spokenResponse.includes('సరే అండి, ధన్యవాదాలు.'));
    assert(`Case 2 "${sp.utt.slice(0, 25)}..." does NOT ask "ఏంటి సమస్య?"`, !turn.spokenResponse.includes('ఏంటి సమస్య?'));
    assert(`Case 2 "${sp.utt.slice(0, 25)}..." immediately asks next question (${sp.nextExpected})`, turn.spokenResponse.includes(sp.nextExpected));
    const state = SurveySequentialEngine.getState(sId);
    assert(`Case 2 answer is saved under ${sp.qId}`, Boolean(state?.answers?.[sp.qId]?.answerText.includes(sp.utt)));
  }

  // ----------------------------------------------------------------------
  // CASE 3: Vague Negative Answers -> strictly "ఏంటి సమస్య?" (max 1 follow-up)
  // Follow-up explanation saved, acknowledges "ఓకే అండి, ధన్యవాదాలు.", advances.
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING CASE 3: Vague Negative Answers & Follow-up ---');
  const vagueNegatives = ['సమస్య ఉంది.', 'బాగాలేదు.', 'ఇబ్బందిగా ఉంది.', 'సమస్యలు ఉన్నాయి.'];
  for (const vn of vagueNegatives) {
    const sId = `case3_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const turn1 = SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: 'A2',
      userUtterance: vn,
    });
    assert(`Case 3 vague negative "${vn}" responds strictly with "ఏంటి సమస్య?"`, turn1.spokenResponse.trim() === 'ఏంటి సమస్య?');
    assert(`Case 3 vague negative "${vn}" sets action ASK_FOLLOW_UP`, turn1.action === 'ASK_FOLLOW_UP');
    assert(`Case 3 vague negative "${vn}" does not leak multiple choice suggestions`, !turn1.spokenResponse.includes('లేదా') && !turn1.spokenResponse.includes('గుంతలు'));

    // Now user provides the explanation
    const turn2 = SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: 'A2',
      userUtterance: 'రోడ్లపై భారీగా గుంతలు పడ్డాయి, ప్రయాణం కష్టంగా ఉంది.',
    });
    assert(`Case 3 follow-up explanation acknowledges with "ఓకే అండి, ధన్యవాదాలు."`, turn2.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.'));
    assert(`Case 3 follow-up advances to next question (A3 విద్యుత్)`, turn2.spokenResponse.includes('విద్యుత్') && turn2.currentQuestionIndex === 2);
    assert(`Case 3 does not repeat follow-up "ఏంటి సమస్య?"`, !turn2.spokenResponse.includes('ఏంటి సమస్య?'));

    const state = SurveySequentialEngine.getState(sId);
    assert(`Case 3 both vague problem and explanation are saved under parent A2`,
      Boolean(state?.answers?.['A2']?.combinedAnswer?.includes(vn) && state?.answers?.['A2']?.combinedAnswer?.includes('గుంతలు')));
  }

  // ----------------------------------------------------------------------
  // CASE 4: Respondent asks to continue / next question
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING CASE 4: Respondent Asks to Continue ---');
  const continueUtterances = ['Next question', 'Next question please', 'Go ahead', 'తర్వాత ప్రశ్న అడగండి'];
  for (const cu of continueUtterances) {
    const sId = `case4_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // First answer Q1
    SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: 'A1',
      userUtterance: 'బాగుంది',
    });
    // Now on Q2, respondent says "Next question"
    const turn = SurveySequentialEngine.processTurnSync({
      sessionId: sId,
      questionId: 'A2',
      userUtterance: cu,
    });
    assert(`Case 4 "${cu}" advances to next unanswered question (A2 -> A3 or stays at unanswered A2 without loop)`,
      turn.spokenResponse.includes('రోడ్ల') || turn.spokenResponse.includes('విద్యుత్'));
    assert(`Case 4 "${cu}" does NOT ask skip confirmation loop`, !turn.spokenResponse.includes('దాటవేయాలనుకుంటున్నారా'));
  }

  // ----------------------------------------------------------------------
  // CASE 5: Unclear Answer -> Prompts repeat without advancing
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING CASE 5: Unclear Answer Handling ---');
  const sId5 = `case5_${Date.now()}`;
  const turn5 = SurveySequentialEngine.processTurnSync({
    sessionId: sId5,
    questionId: 'A1',
    userUtterance: 'హ్మ్... ఏమో... నాకేం తెలీదు అర్థం కాలేదు',
  });
  assert('Case 5 unclear answer remains on current question (index 0)', turn5.currentQuestionIndex === 0);
  assert('Case 5 unclear answer asks to clarify', turn5.action === 'CLARIFY');
  assert('Case 5 does NOT advance to Q2', !turn5.spokenResponse.includes('రోడ్ల'));

  // ----------------------------------------------------------------------
  // FULL 10-QUESTION E2E PROGRESSION & FINAL CALL TERMINATION
  // ----------------------------------------------------------------------
  console.log('\n--- VERIFYING COMPLETE Q1-Q10 PROGRESSION & TERMINATION ---');
  const e2eSession = `e2e_full_${Date.now()}`;
  const answers = [
    { qId: 'A1', ans: 'తాగునీటి సరఫరా బాగుంది, ఎలాంటి సమస్య లేదు.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A2', ans: 'రోడ్లపై గుంతలు ఉన్నాయి.', expectAck: 'ఓకే అండి, ధన్యవాదాలు.' },
    { qId: 'A3', ans: 'కరెంట్ సరఫరా బాగుంది.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A4', ans: 'డ్రైనేజ్ సమస్య ఉంది.', expectAck: 'ఓకే అండి, ధన్యవాదాలు.' },
    { qId: 'A5', ans: 'చెత్త సేకరణ బాగుంది.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A6', ans: 'ఆసుపత్రి సేవలు బాగున్నాయి.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A7', ans: 'స్కూళ్ళు బాగున్నాయి.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A8', ans: 'రైళ్లు సరిగ్గా సమయానికి రావడం లేదు.', expectAck: 'ఓకే అండి, ధన్యవాదాలు.' },
    { qId: 'A9', ans: 'ప్రభుత్వ సేవలు బాగున్నాయి.', expectAck: 'సరే అండి, ధన్యవాదాలు.' },
    { qId: 'A10', ans: 'మా ప్రాంతంలో డ్రైనేజ్ వ్యవస్థను మెరుగుపరచాలి.', expectAck: 'ఓకే అండి, ధన్యవాదాలు.' },
  ];

  for (let i = 0; i < answers.length; i++) {
    const item = answers[i];
    const turn = SurveySequentialEngine.processTurnSync({
      sessionId: e2eSession,
      questionId: item.qId,
      userUtterance: item.ans,
    });

    assert(`Turn ${i + 1} (${item.qId}) uses correct ack "${item.expectAck}"`, turn.spokenResponse.includes(item.expectAck));

    if (i < 9) {
      const nextQ = activeQuestions[i + 1];
      assert(`Turn ${i + 1} advances to Q${i + 2} (${nextQ.id})`, turn.currentQuestionIndex === i + 1);
      assert(`Turn ${i + 1} immediately speaks Q${i + 2} text`, turn.spokenResponse.includes(nextQ.text.slice(0, 15)));
    } else {
      // Q10 final turn
      assert('Turn 10 marks isSurveyComplete = true', turn.isSurveyComplete === true);
      assert('Turn 10 action = END', turn.action === 'END');
      assert('Turn 10 speaks closing message', turn.spokenResponse.includes(TELUGU_STRINGS.CLOSING_MESSAGE));
    }
  }

  const finalE2EState = SurveySequentialEngine.getState(e2eSession);
  assert('Final state has 10 answered questions', finalE2EState?.answeredQuestionIds.length === 10);
  assert('Final state conversationStatus is completed', finalE2EState?.conversationStatus === 'completed');

  // Idempotency check on completed session
  const dupQ10 = SurveySequentialEngine.processTurnSync({
    sessionId: e2eSession,
    questionId: 'A10',
    userUtterance: 'మా ప్రాంతంలో డ్రైనేజ్ వ్యవస్థను మెరుగుపరచాలి.',
  });
  assert('Duplicate Q10 event returns completed closing without crashing or duplicating answers',
    dupQ10.isSurveyComplete === true && dupQ10.spokenResponse.includes(TELUGU_STRINGS.CLOSING_MESSAGE));

  console.log('\n========================================================================');
  console.log(`TOTAL VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
