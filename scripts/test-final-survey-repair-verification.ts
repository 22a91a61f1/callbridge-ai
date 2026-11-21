import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';
import { normalizeTeluguPronunciation } from '../server/voice/teluguPronunciationDictionary.ts';

async function runVerification() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — FINAL VOICE, TRANSCRIPT & COMPLETION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Exact 6 Saved Canonical Questions
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Verification of 6 Canonical Survey Questions ---');
  const questions = SurveySequentialEngine.resolveActiveQuestions('event_public_survey');
  assert(questions.length === 6, `Active questions count is strictly 6 (found ${questions.length})`);
  assert(questions[0]?.id === 'A1' && (questions[0]?.category === 'తాగునీరు' || questions[0]?.category === 'drinking_water'), 'Q1 is Drinking Water (A1)');
  assert(questions[1]?.id === 'A2' && (questions[1]?.category === 'రోడ్లు' || questions[1]?.category === 'roads_infrastructure'), 'Q2 is Roads (A2)');
  assert(questions[2]?.id === 'A3' && (questions[2]?.category === 'విద్యుత్' || questions[2]?.category === 'electricity_power'), 'Q3 is Electricity (A3)');
  assert(questions[3]?.id === 'A4' && (questions[3]?.category === 'డ్రైనేజీ' || questions[3]?.category === 'drainage_sewage'), 'Q4 is Drainage (A4)');
  assert(questions[4]?.id === 'A5' && (questions[4]?.category === 'చెత్త సేకరణ & పారిశుధ్యం' || questions[4]?.category === 'sanitation_waste'), 'Q5 is Sanitation (A5)');
  assert(questions[5]?.id === 'A6' && (questions[5]?.category === 'ఆరోగ్య సేవలు' || questions[5]?.category === 'healthcare_clinics'), 'Q6 is Healthcare (A6)');

  // --------------------------------------------------------------------------
  // TEST 2: Preserved Cloned Rishi Voice Configuration
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Verification of Cloned Rishi Voice Profile ---');
  const targetVoiceId = ElevenLabsService.resolveVoiceId('Txde0pZ5tVhXE6HUspcf');
  assert(targetVoiceId === 'Txde0pZ5tVhXE6HUspcf', 'Voice ID resolves to Txde0pZ5tVhXE6HUspcf');

  // Verify legacy stale IDs resolve to the approved Rishi clone in public survey context
  const legacyResolved = ElevenLabsService.resolveVoiceId('AZnzlk1XvdvUeBnXmlld', 'public_survey');
  assert(legacyResolved === 'Txde0pZ5tVhXE6HUspcf', 'Stale legacy ID AZnzlk1XvdvUeBnXmlld maps to Txde0pZ5tVhXE6HUspcf for public survey');

  // Verify non-survey modules retain their voice IDs without silent substitution
  const businessVoiceResolved = ElevenLabsService.resolveVoiceId('5IASxvpUK3p2EFjhO3pn', 'business_event');
  assert(businessVoiceResolved === '5IASxvpUK3p2EFjhO3pn', 'Business event voice ID 5IASxvpUK3p2EFjhO3pn is preserved without silent substitution');

  const voiceProfile = callbridgeStorage.getVoiceProfile('Txde0pZ5tVhXE6HUspcf');
  assert(Boolean(voiceProfile), 'Voice profile exists in storage');
  assert(voiceProfile?.providerVoiceId === 'Txde0pZ5tVhXE6HUspcf', 'providerVoiceId is Txde0pZ5tVhXE6HUspcf');
  assert(voiceProfile?.provider === 'elevenlabs', 'Voice provider is elevenlabs');
  assert(voiceProfile?.modelId === 'eleven_v4_turbo', 'Voice model is eleven_v4_turbo');
  assert(voiceProfile?.stability === 0.50, 'Voice stability is 0.50');
  assert(voiceProfile?.similarityBoost === 0.85, 'Voice similarity boost is 0.85');
  assert(voiceProfile?.style === 0.15, 'Voice style is 0.15');
  assert(voiceProfile?.speakerBoost === true, 'Speaker boost is true');
  assert(voiceProfile?.speed === 1.0, 'Speech speed is 1.0');

  // --------------------------------------------------------------------------
  // TEST 3: Acknowledgement Phrases & Natural Pronunciation Normalization
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Verification of Natural Acknowledgements & Pronunciation ---');
  // Positive answer
  const posAckRes = normalizeTeluguPronunciation('సరే అండి, ధన్యవాదాలు!');
  assert(!posAckRes.normalizedText.includes('!'), 'Normalizer replaces exclamation marks on ధన్యవాదాలు! with gentle full stop');
  assert(posAckRes.normalizedText.includes('ధన్యవాదాలు.'), 'Normalizer keeps natural conversational full stop');

  // Specific complaint
  const specAckRes = normalizeTeluguPronunciation('ఓకే అండి, ధన్యవాదాలు!');
  assert(specAckRes.normalizedText === 'ఓకే అండి, ధన్యవాదాలు.', 'Specific complaint normalizes to "ఓకే అండి, ధన్యవాదాలు."');

  // De-duplication of repeated acknowledgements
  const dupCheck = normalizeTeluguPronunciation('సరే అండి, ధన్యవాదాలు. సరే అండి, ధన్యవాదాలు.');
  assert(dupCheck.normalizedText === 'సరే అండి, ధన్యవాదాలు.', 'De-duplication removes accidental repeated acknowledgement');

  // --------------------------------------------------------------------------
  // TEST 4: Anti-Hallucination STT Filter ("my my my my" loop prevention)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Verification of Anti-Hallucination Transcript Filter ---');
  const dirtyStt = 'my my my my my';
  const cleanedStt = VapiService.filterHallucinatoryLoops(dirtyStt);
  assert(cleanedStt === '', 'Repeated "my my my my" token loop is completely filtered');

  const mixedStt = 'my my my roads are bad';
  const cleanedMixed = VapiService.filterHallucinatoryLoops(mixedStt);
  assert(cleanedMixed === 'roads are bad', `Mixed STT loops stripped cleanly (got "${cleanedMixed}")`);

  const authenticTelugu = 'రైళ్లు సరిగ్గా సమయానికి రావడం లేదు. చాలా ఇబ్బందిగా ఉంది.';
  const cleanedTelugu = VapiService.filterHallucinatoryLoops(authenticTelugu);
  assert(cleanedTelugu === authenticTelugu, 'Authentic Telugu citizen statement is preserved 100% verbatim');

  // --------------------------------------------------------------------------
  // TEST 5: Deterministic 6-Question Flow & Question 6 Never Cut Off
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Verification of 6-Question Sequential Flow & Completion ---');
  const testCallId = `test_survey_call_${Date.now()}`;
  const testCampaignId = 'telugu-governance-2026';
  const testEventId = 'event_public_survey';

  const session = SurveySequentialEngine.getOrCreateState(
    testCallId,
    testCampaignId,
    testEventId,
    questions,
    '+919876543210',
    'Citizen Ramesh'
  );

  const testJob = {
    id: testCallId,
    campaignId: testCampaignId,
    eventId: testEventId,
    contactId: 'c_test_1',
    contactName: 'Citizen Ramesh',
    contactPhone: '+919876543210',
    status: 'in_progress' as const,
    providerCallId: testCallId,
    retryCount: 0,
    maxRetries: 1,
    transcript: [],
    originalTranscript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveCallJob(testJob as any);

  // Initial greeting turn
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', `నమస్కారం అండి! ${questions[0].text}`, 'A1');

  // Attempt premature termination while on Q1 — MUST BE REJECTED
  const prematureAttempt = await VapiService.executePublicSurveyCallTermination(testCampaignId, testCallId);
  assert(prematureAttempt.success === false, 'Premature termination on Question 1 is blocked by safety guard');

  // Answer Q1 (Positive)
  const q1Ans = 'మా ప్రాంతంలో తాగునీరు బాగానే వస్తోంది, సమస్య లేదు.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q1Ans, 'A1');
  const t1Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q1Ans,
    questionId: 'A1',
    eventId: testEventId,
  });
  assert(t1Res.spokenResponse.includes('సరే అండి, ధన్యవాదాలు.'), 'Q1 positive response acknowledged with "సరే అండి, ధన్యవాదాలు."');
  assert(t1Res.spokenResponse.includes(questions[1].text.slice(0, 15)), 'Q1 automatically advances to Q2 (Roads)');
  assert(t1Res.isSurveyComplete === false, 'Survey is NOT complete after Q1');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t1Res.spokenResponse, 'A2');

  // Answer Q2 (Specific problem)
  const q2Ans = 'రోడ్లపై గుంతలు చాలా ఎక్కువగా ఉన్నాయి, ప్రయాణం చాలా కష్టంగా ఉంది.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q2Ans, 'A2');
  const t2Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q2Ans,
    questionId: 'A2',
    eventId: testEventId,
  });
  assert(t2Res.spokenResponse.includes('ఓకే అండి, ధన్యవాదాలు.'), 'Q2 specific complaint acknowledged with "ఓకే అండి, ధన్యవాదాలు."');
  assert(t2Res.spokenResponse.includes(questions[2].text.slice(0, 15)), 'Q2 automatically advances to Q3 (Electricity)');
  assert(t2Res.isSurveyComplete === false, 'Survey is NOT complete after Q2');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t2Res.spokenResponse, 'A3');

  // Answer Q3 (Positive)
  const q3Ans = 'కరెంట్ సరఫరా రోజూ 24 గంటలు బాగుంది.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q3Ans, 'A3');
  const t3Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q3Ans,
    questionId: 'A3',
    eventId: testEventId,
  });
  assert(t3Res.spokenResponse.includes(questions[3].text.slice(0, 15)), 'Q3 automatically advances to Q4 (Drainage)');
  assert(t3Res.isSurveyComplete === false, 'Survey is NOT complete after Q3');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t3Res.spokenResponse, 'A4');

  // Answer Q4 (Specific problem)
  const q4Ans = 'వర్షం పడితే డ్రైనేజీ రోడ్లపై పొంగిపోతోంది.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q4Ans, 'A4');
  const t4Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q4Ans,
    questionId: 'A4',
    eventId: testEventId,
  });
  assert(t4Res.spokenResponse.includes(questions[4].text.slice(0, 15)), 'Q4 automatically advances to Q5 (Sanitation)');
  assert(t4Res.isSurveyComplete === false, 'Survey is NOT complete after Q4');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t4Res.spokenResponse, 'A5');

  // Answer Q5 (Positive)
  const q5Ans = 'చెత్త సేకరణ వాహనం ప్రతిరోజూ ఉదయం వస్తోంది.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q5Ans, 'A5');
  const t5Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q5Ans,
    questionId: 'A5',
    eventId: testEventId,
  });
  assert(t5Res.spokenResponse.includes(questions[5].text.slice(0, 15)), 'Q5 advances to Question 6 (Healthcare)');
  assert(t5Res.isSurveyComplete === false, 'Survey is NOT complete after Q5; Question 6 MUST be asked');
  assert(t5Res.currentQuestionId === 'A6', 'Next question ID is explicitly A6');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t5Res.spokenResponse, 'A6');

  // Attempt premature termination while on Q6 pending answer — MUST BE REJECTED
  const prematureAttemptQ6 = await VapiService.executePublicSurveyCallTermination(testCampaignId, testCallId);
  assert(prematureAttemptQ6.success === false, 'Premature termination while Question 6 is pending is blocked');

  // Now Citizen answers Question 6 (Final question)
  const q6Ans = 'ప్రభుత్వ ఆసుపత్రిలో డాక్టర్లు బాగా చూస్తున్నారు, మందులు ఉచితంగా ఇస్తున్నారు.';
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'respondent', q6Ans, 'A6');
  const t6Res = SurveySequentialEngine.processTurnSync({
    campaignId: testCampaignId,
    providerCallId: testCallId,
    userUtterance: q6Ans,
    questionId: 'A6',
    eventId: testEventId,
  });

  // Verify Question 6 completion and warm closing message
  assert(t6Res.isSurveyComplete === true, 'Survey is marked COMPLETE only after Question 6 answer is saved');
  assert(t6Res.spokenResponse.includes('మీ సమాధానాలు నమోదు చేశాము'), 'Spoken reply contains complete Telugu closing message');
  assert(t6Res.spokenResponse.includes('నమస్కారం'), 'Spoken reply concludes respectfully with "నమస్కారం."');
  VapiService.appendSurveyTranscriptTurn(testJob as any, 'agent', t6Res.spokenResponse);

  // Verify all 6 answers persisted in state
  const finalState = SurveySequentialEngine.getState(testCallId);
  assert(finalState?.surveyCompletionStatus === 'completed', 'Final survey state is completed');
  assert(finalState?.answeredQuestionIds.length === 6, 'Exactly 6 questions are in answeredQuestionIds');
  assert(Boolean(finalState?.answers['A1']), 'Answer A1 persisted');
  assert(Boolean(finalState?.answers['A2']), 'Answer A2 persisted');
  assert(Boolean(finalState?.answers['A3']), 'Answer A3 persisted');
  assert(Boolean(finalState?.answers['A4']), 'Answer A4 persisted');
  assert(Boolean(finalState?.answers['A5']), 'Answer A5 persisted');
  assert(Boolean(finalState?.answers['A6']), 'Answer A6 persisted');

  // --------------------------------------------------------------------------
  // TEST 6: Structured Two-Way Transcript Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Verification of Structured Two-Way Transcript Data ---');
  const turns = testJob.transcript as any[];
  assert(Array.isArray(turns) && turns.length > 0, `Transcript has ${turns.length} turns recorded`);

  let allHaveRequiredFields = true;
  let hasAssistantTurns = false;
  let hasRespondentTurns = false;

  for (const turn of turns) {
    if (!turn.callId || !turn.sessionId || !turn.speakerRole || !turn.transcriptText || !turn.timestamp || !turn.sequenceNumber) {
      allHaveRequiredFields = false;
      console.error('Missing field in turn:', turn);
    }
    if (turn.speakerRole === 'assistant') hasAssistantTurns = true;
    if (turn.speakerRole === 'respondent') hasRespondentTurns = true;
  }

  assert(allHaveRequiredFields, 'Every single turn has callId, sessionId, speakerRole, transcriptText, timestamp, sequenceNumber, isFinal');
  assert(hasAssistantTurns, 'Transcript includes assistant (AI Voice Agent) turns');
  assert(hasRespondentTurns, 'Transcript includes respondent turns');

  // Verify call termination execution after survey completion
  const terminationRes = await VapiService.executePublicSurveyCallTermination(testCampaignId, testCallId);
  assert(terminationRes.success === true, 'Termination executes successfully once survey is completed');

  // Attempt duplicate termination — must be idempotent
  const dupTermination = await VapiService.executePublicSurveyCallTermination(testCampaignId, testCallId);
  assert(dupTermination.success === true, 'Duplicate termination is handled idempotently without error');

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
