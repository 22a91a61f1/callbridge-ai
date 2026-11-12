import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { ElevenLabsService, resolveVoiceId, ACTIVE_RISHI_CLONED_VOICE_ID } from '../server/voice/elevenLabsService.ts';
import { SurveySequentialEngine } from '../server/survey/surveySequentialEngine.ts';
import { VapiService } from '../server/telephony/vapiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAuditCorrectionsTest() {
  console.log('=== CALLBRIDGE AI — FINAL AUDIT FINDINGS CORRECTIONS VERIFICATION ===\n');

  // --------------------------------------------------------------------------
  // TEST 1: Transcription Confidence Fallback Removed
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Transcription Confidence Handling ---');

  // A) Engine appendTurn without confidence
  const testSessionState: any = {
    callId: 'test_conf_call_1',
    sessionId: 'test_conf_sess_1',
    providerCallId: 'test_conf_call_1',
    transcripts: [],
    originalTranscript: [],
    currentQuestionIndex: 0,
    currentQuestionId: 'A1',
  };

  const respondentTurnNoConf = SurveySequentialEngine.appendTurn(
    testSessionState,
    'respondent',
    'నీటి సరఫరా బాగానే ఉంది',
    { questionId: 'A1', questionOrder: 1 }
  );

  assert(respondentTurnNoConf !== null, 'Turn created');
  assert.strictEqual(
    respondentTurnNoConf.confidence,
    undefined,
    'Confidence must be undefined when not supplied by STT provider'
  );
  assert.strictEqual(
    'confidence' in respondentTurnNoConf ? respondentTurnNoConf.confidence : undefined,
    undefined,
    'No artificial 1.0 confidence on respondent turn'
  );

  // B) Engine appendTurn with authentic provider confidence
  const respondentTurnWithConf = SurveySequentialEngine.appendTurn(
    testSessionState,
    'respondent',
    'కానీ వేసవిలో కొంచెం ఇబ్బందిగా ఉంటుంది',
    { questionId: 'A1', questionOrder: 1, confidence: 0.89 }
  );

  assert(respondentTurnWithConf !== null, 'Turn created');
  assert.strictEqual(
    respondentTurnWithConf.confidence,
    0.89,
    'Authentic provider confidence 0.89 must be preserved'
  );

  // C) Engine appendTurn for AI agent/assistant utterance
  const assistantTurn = SurveySequentialEngine.appendTurn(
    testSessionState,
    'agent',
    'సరే అండి, ధన్యవాదాలు. తర్వాతి ప్రశ్న...',
    { questionId: 'A2', questionOrder: 2, confidence: 1.0 as any }
  );

  assert(assistantTurn !== null, 'Assistant turn created');
  assert.strictEqual(
    assistantTurn.confidence,
    undefined,
    'AI utterances must never have confidence assigned'
  );

  // D) Tracked transcript array behavior
  const trackedState: any = { sessionId: 'test_tracked_sess', transcripts: [] };
  const trackedArr = SurveySequentialEngine.createTrackedTranscriptArray(trackedState);

  (trackedArr as any).push({
    role: 'respondent',
    speakerRole: 'respondent',
    text: 'రోడ్లు బాగాలేవు',
    timestamp: new Date().toISOString(),
  });
  assert.strictEqual(
    trackedArr[0].confidence,
    undefined,
    'createTrackedTranscriptArray must not assign artificial 1.0 confidence'
  );

  (trackedArr as any).push({
    role: 'respondent',
    speakerRole: 'respondent',
    text: 'గుంతలు ఎక్కువగా ఉన్నాయి',
    confidence: 0.94,
    timestamp: new Date().toISOString(),
  });
  assert.strictEqual(
    trackedArr[1].confidence,
    0.94,
    'createTrackedTranscriptArray preserves genuine provider confidence'
  );

  (trackedArr as any).push({
    role: 'agent',
    speakerRole: 'assistant',
    text: 'సరే అండి, ధన్యవాదాలు.',
    confidence: 1.0,
    timestamp: new Date().toISOString(),
  });
  assert.strictEqual(
    trackedArr[2].confidence,
    undefined,
    'createTrackedTranscriptArray does not assign confidence to AI speech'
  );

  // E) VapiService appendSurveyTranscriptTurn
  const mockJob: any = {
    id: 'test_job_conf_1',
    providerCallId: 'test_prov_conf_1',
    transcript: [],
    originalTranscript: [],
    surveyState: { currentQuestionId: 'A1' },
  };

  VapiService.appendSurveyTranscriptTurn(mockJob, 'respondent', 'తాగునీటి సౌకర్యం బాగుంది');
  assert.strictEqual(
    mockJob.transcript[0].confidence,
    undefined,
    'VapiService: Confidence must be undefined when not supplied'
  );

  VapiService.appendSurveyTranscriptTurn(
    mockJob,
    'respondent',
    'ప్రతిరోజూ నీరు వస్తుంది',
    'A1',
    0.92
  );
  assert.strictEqual(
    mockJob.transcript[1].confidence,
    0.92,
    'VapiService: Authentic provider confidence 0.92 preserved'
  );

  VapiService.appendSurveyTranscriptTurn(mockJob, 'agent', 'సరే అండి, ధన్యవాదాలు.');
  assert.strictEqual(
    mockJob.transcript[2].confidence,
    undefined,
    'VapiService: AI agent turn has no confidence assigned'
  );

  console.log('✓ Test 1 Passed: False 1.0 confidence removed; authentic provider confidence preserved.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Voice Resolution Strictly Isolated to Public Survey
  // --------------------------------------------------------------------------
  console.log('--- 2. Testing Voice Resolution Module Isolation ---');

  // A) Public Survey resolves stale/legacy IDs to Rishi
  const surveyResolved = ElevenLabsService.resolveVoiceId('AZnzlk1XvdvUeBnXmlld', 'public_survey');
  assert.strictEqual(
    surveyResolved,
    ACTIVE_RISHI_CLONED_VOICE_ID,
    'Public Survey resolves stale voice to Rishi'
  );

  const surveyDefaultResolved = ElevenLabsService.resolveVoiceId(undefined, 'public_survey');
  assert.strictEqual(
    surveyDefaultResolved,
    ACTIVE_RISHI_CLONED_VOICE_ID,
    'Public Survey with undefined voiceId resolves to Rishi'
  );

  // B) Business Event retains its configured voice ID (5IASxvpUK3p2EFjhO3pn)
  const businessResolved = ElevenLabsService.resolveVoiceId('5IASxvpUK3p2EFjhO3pn', 'business_event');
  assert.strictEqual(
    businessResolved,
    '5IASxvpUK3p2EFjhO3pn',
    'Business Event preserves 5IASxvpUK3p2EFjhO3pn without silently substituting Rishi'
  );

  const businessObjectContext = ElevenLabsService.resolveVoiceId('5IASxvpUK3p2EFjhO3pn', {
    eventId: 'event_business_event',
    eventType: 'business_event',
  });
  assert.strictEqual(
    businessObjectContext,
    '5IASxvpUK3p2EFjhO3pn',
    'Business Event with object context preserves voice ID'
  );

  // C) Marriage Event and Political Campaign retain their voice IDs
  const marriageEvent = callbridgeStorage.getEvent('event_marriage_event');
  assert(Boolean(marriageEvent), 'event_marriage_event exists in storage');
  const marriageResolved = ElevenLabsService.resolveVoiceId(
    marriageEvent?.selectedVoiceProfileId,
    'marriage_event'
  );
  assert.strictEqual(
    marriageResolved,
    'Txde0pZ5tVhXE6HUspcf',
    'Marriage event retains its configured voice ID'
  );

  const politicalEvent = callbridgeStorage.getEvent('event_political_campaign');
  assert(Boolean(politicalEvent), 'event_political_campaign exists in storage');
  const politicalResolved = ElevenLabsService.resolveVoiceId(
    politicalEvent?.selectedVoiceProfileId,
    'political_campaign'
  );
  assert.strictEqual(
    politicalResolved,
    'Txde0pZ5tVhXE6HUspcf',
    'Political campaign retains its configured voice ID'
  );

  console.log('✓ Test 2 Passed: Public survey voice isolated; other modules retain voice IDs.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Verification of the 6 Saved Questions in data/callbridge_db.json
  // --------------------------------------------------------------------------
  console.log('--- 3. Verifying the 6 Saved Public Survey Questions ---');

  const dbPath = path.resolve(__dirname, '../data/callbridge_db.json');
  const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  const surveyQuestions = rawDb.events?.event_public_survey?.config?.questions;

  assert(Array.isArray(surveyQuestions), 'Survey questions must be an array');
  assert.strictEqual(surveyQuestions.length, 6, 'Must have exactly 6 saved questions');

  const expectedQuestions = [
    {
      id: 'A1',
      order: 1,
      category: 'తాగునీరు',
      text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?',
    },
    {
      id: 'A2',
      order: 2,
      category: 'రోడ్లు',
      text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?',
    },
    {
      id: 'A3',
      order: 3,
      category: 'విద్యుత్',
      text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?',
    },
    {
      id: 'A4',
      order: 4,
      category: 'డ్రైనేజీ',
      text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?',
    },
    {
      id: 'A5',
      order: 5,
      category: 'చెత్త సేకరణ & పారిశుధ్యం',
      text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?',
    },
    {
      id: 'A6',
      order: 6,
      category: 'ఆరోగ్య సేవలు',
      text: 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?',
    },
  ];

  for (let i = 0; i < 6; i++) {
    const actual: any = surveyQuestions[i];
    const expected = expectedQuestions[i];

    assert.strictEqual(actual.id, expected.id, `Question ${i + 1} ID must be ${expected.id}`);
    assert.strictEqual(actual.questionOrder, expected.order, `Question ${i + 1} order must be ${expected.order}`);
    assert.strictEqual(actual.category, expected.category, `Question ${i + 1} category must be ${expected.category}`);
    assert.strictEqual(actual.text, expected.text, `Question ${i + 1} text must match exactly`);
    assert.strictEqual(actual.questionText, expected.text, `Question ${i + 1} questionText must match exactly`);

    console.log(`  [Q${i + 1}] (${actual.id}) Order: ${actual.questionOrder} | Category: ${actual.category}`);
    console.log(`       Text: "${actual.text}"`);
  }

  console.log('✓ Test 3 Passed: All 6 questions intact with exact order and Telugu text.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Verification of OutboundQueueView Component Guards
  // --------------------------------------------------------------------------
  console.log('--- 4. Verifying OutboundQueueView Component Source Guards ---');

  const queueViewPath = path.resolve(__dirname, '../src/components/OutboundQueueView.tsx');
  const queueViewContent = fs.readFileSync(queueViewPath, 'utf-8');

  // Check fetchCampaigns guard
  assert(
    queueViewContent.includes('if (!eventId || typeof eventId !== \'string\' || !eventId.trim())'),
    'fetchCampaigns has guard for empty eventId'
  );

  // Check fetchJobs guard
  assert(
    queueViewContent.includes('const validCampId = (campaignId || selectedCampaign?.id || \'\')?.trim()'),
    'fetchJobs validates campaign ID'
  );
  assert(
    queueViewContent.includes('if (!eventId || typeof eventId !== \'string\' || !eventId.trim() || !validCampId)'),
    'fetchJobs guards against empty eventId or campaignId'
  );

  // Check useEffect guards
  assert(
    queueViewContent.includes('if (!eventId || typeof eventId !== \'string\' || !eventId.trim()) return;\n    fetchCampaigns();'),
    'useEffect for fetchCampaigns guards against empty eventId'
  );

  console.log('✓ Test 4 Passed: OutboundQueueView empty parameter guards verified in source.\n');

  console.log('=== ALL AUDIT CORRECTION VERIFICATION TESTS PASSED SUCCESSFULLY ===');
}

runAuditCorrectionsTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
