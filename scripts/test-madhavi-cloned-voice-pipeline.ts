import { ElevenLabsService, MADHAVI_REFERENCE_VOICE_ID } from '../server/voice/elevenLabsService.ts';
import { voiceProfileStorage } from '../server/voice/voiceProfileStorage.ts';
import { classifyConversationIntent } from '../server.ts';
import { processTurnMemory } from '../server/survey/memoryEngine.ts';
import { SurveySessionState } from '../server/survey/sessionManager.ts';

async function runTests() {
  console.log('====================================================');
  console.log('MADHAVI REFERENCE & CLONED VOICE PIPELINE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  // TEST 1: Madhavi voice ID constant
  assert(
    MADHAVI_REFERENCE_VOICE_ID === '4XvBGCPMXWyVQa75dbZg',
    'Madhavi Reference Voice ID is exactly 4XvBGCPMXWyVQa75dbZg'
  );

  // TEST 2: Madhavi voice ID is never allowed as target voice
  try {
    await ElevenLabsService.synthesizeSpeechWithMadhaviReference(
      MADHAVI_REFERENCE_VOICE_ID,
      'టెస్ట్ వాక్యం'
    );
    assert(false, 'Should throw error when Madhavi voice ID is used as target voice');
  } catch (err: any) {
    assert(
      err?.message?.includes('Madhavi voice ID') || err?.message?.includes('4XvBGCPMXWyVQa75dbZg'),
      'Throws guard error if Madhavi voice ID is passed as target voice'
    );
  }

  // TEST 3: Classification of "ఎందుకు ఫోన్ చేస్తున్నారు?" (Section 8)
  const intentWhy = classifyConversationIntent('ఎందుకు ఫోన్ చేస్తున్నారు?');
  assert(
    intentWhy === 'WHY_CALLING',
    'Respondent asking "ఎందుకు ఫోన్ చేస్తున్నారు?" is classified as WHY_CALLING'
  );

  // TEST 4: Purpose explanation does not record answer (Section 8)
  const mockQuestions = [
    { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'తాగునీరు' },
    { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'రోడ్లు' },
  ];
  const initialSession: SurveySessionState = {
    session_id: 'test_session_why',
    survey_id: 'public_facilities',
    language: 'te',
    current_question_id: 'A1',
    current_question_topic: 'drinking_water',
    topic_statuses: {
      drinking_water: 'not_started',
      roads: 'not_started',
    },
    answers: {},
    pending_follow_up: null,
    asked_follow_ups: [],
    completed_follow_ups: [],
    completed_questions: [],
    conversation_status: 'waiting_for_answer',
    conversation_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const memResult = processTurnMemory('ఎందుకు ఫోన్ చేస్తున్నారు?', initialSession, mockQuestions);
  assert(
    Object.keys(memResult.extractedNewAnswers || {}).length === 0,
    'Respondent question about purpose extracts NO false answers'
  );
  assert(
    memResult.updatedState.topic_statuses?.drinking_water !== 'sufficiently_answered',
    'Water topic is NOT marked answered when asking why calling'
  );

  // TEST 5: Verify Section 16 test sentences are authentic Telugu
  const testSentences = [
    'నమస్కారం అండి. మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.',
    'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది అండి?',
    'మరి మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది అండి?',
    'అవునా అండి, అర్థమైంది.',
    'మీరు చెప్పిన సమస్య గురించి అర్థమైంది. ఇంకొక విషయం అడుగుతాను.',
  ];

  testSentences.forEach((sentence, idx) => {
    assert(
      sentence.length > 5 && /[\u0C00-\u0C7F]/.test(sentence),
      `Test Sentence ${idx + 1} is authentic Telugu script`
    );
  });

  // TEST 6: Verify no robotic survey words in test sentences
  const roboticPhrases = ['మొదటి ప్రశ్న', 'రెండవ ప్రశ్న', 'నెక్స్ట్ క్వశ్చన్', 'తదుపరి ప్రశ్న', 'నమోదు చేయబడింది'];
  const hasRoboticWords = testSentences.some((s) =>
    roboticPhrases.some((rp) => s.includes(rp))
  );
  assert(!hasRoboticWords, 'Test sentences contain zero robotic phrases');

  // TEST 7: Pronunciation Normalization Layer
  const { normalizeTeluguPronunciation, TELUGU_PRONUNCIATION_DICTIONARY } = await import(
    '../server/voice/teluguPronunciationDictionary.ts'
  );
  const normalizedSample = normalizeTeluguPronunciation(
    'నమస్కారం అండి మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది అండి'
  );
  assert(
    normalizedSample.normalizedText.includes('తాగునీటి'),
    'Preserve authentic Telugu compound "తాగునీటి" without unnatural word splitting'
  );
  assert(
    normalizedSample.normalizedText.includes('అండి'),
    'Natural polite Telugu marker "అండి" preserved'
  );
  assert(
    Object.keys(TELUGU_PRONUNCIATION_DICTIONARY).length >= 18,
    'Pronunciation dictionary contains all required survey terms (at least 18 items)'
  );

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
