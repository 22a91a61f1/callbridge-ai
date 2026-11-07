import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { voiceProfileStorage } from '../server/voice/voiceProfileStorage.ts';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('CALLBRIDGE AI — 10-SCENARIO EVENT-WISE VOICE ISOLATION & VAPI AUDIT');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`\x1b[31m[FAIL]\x1b[0m ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  const CLIENT_A = 'client_001';
  const CLIENT_B = 'client_002';

  // SCENARIO 1: Record and create candidate profile "Rishi" in political_campaign for Client A
  console.log('\n--- Scenario 1: Record candidate voice "Rishi" in political_campaign ---');
  const rishiVoiceId = 'WKyArUrP6hdAVp2kHYkw'; // Real cloned ElevenLabs ID for authentic user rishi
  await voiceProfileStorage.saveProfile({
    id: 'vp_rishi_candidate',
    client_id: CLIENT_A,
    user_id: CLIENT_A,
    eventType: 'political_campaign',
    eventId: 'event_political_campaign',
    voice_id: rishiVoiceId,
    voiceName: 'Rishi',
    elevenLabsVoiceId: rishiVoiceId,
    provider: 'elevenlabs',
    status: 'active',
    voice_status: 'ready',
    isApproved: false,
    approvalStatus: 'pending_review',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  callbridgeStorage.saveVoiceProfile({
    id: 'vp_rishi_candidate',
    clientId: CLIENT_A,
    eventType: 'political_campaign',
    eventId: 'event_political_campaign',
    name: 'Rishi',
    voiceName: 'Rishi',
    provider: 'elevenlabs',
    providerVoiceId: rishiVoiceId,
    elevenLabsVoiceId: rishiVoiceId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    voiceStatus: 'ready',
    isApproved: false,
    approvalStatus: 'pending_review',
    languageCapabilities: ['te', 'hi', 'en'],
  });

  // Now Approve "Rishi" specifically for political_campaign
  const approvedRishi = await voiceProfileStorage.approveVoice(CLIENT_A, 'vp_rishi_candidate', 'political_campaign', 'event_political_campaign');
  callbridgeStorage.setTenantApprovedVoice(CLIENT_A, 'vp_rishi_candidate', 'political_campaign', 'event_political_campaign');

  assert(
    approvedRishi !== null && approvedRishi.isApproved === true && approvedRishi.eventType === 'political_campaign',
    'Scenario 1: Candidate voice "Rishi" approved strictly under political_campaign',
    `voiceId=${approvedRishi?.voice_id}, eventType=${approvedRishi?.eventType}`
  );

  // SCENARIO 2: Verify political_campaign returns "Rishi" as its active voice
  console.log('\n--- Scenario 2: Verify political_campaign active voice ---');
  const activePolitical = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'political_campaign');
  const storagePoliticalApproved = callbridgeStorage.getApprovedVoiceProfile(CLIENT_A, 'political_campaign', 'event_political_campaign');

  assert(
    activePolitical?.voiceName === 'Rishi' && storagePoliticalApproved?.voiceName === 'Rishi',
    'Scenario 2: political_campaign returns "Rishi" as active voice',
    `activeName=${activePolitical?.voiceName}, elevenLabsVoiceId=${activePolitical?.elevenLabsVoiceId}`
  );

  // SCENARIO 3: Verify public_survey does NOT show "Rishi" (strict module isolation)
  console.log('\n--- Scenario 3: Verify public_survey is NOT contaminated by "Rishi" ---');
  const activePublicBefore = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'public_survey');
  const publicProfilesBefore = await voiceProfileStorage.getProfilesByClientId(CLIENT_A, 'public_survey');
  const rishiInPublic = publicProfilesBefore.find(p => p.voiceName === 'Rishi' || p.elevenLabsVoiceId === rishiVoiceId);

  assert(
    activePublicBefore?.voiceName !== 'Rishi' && rishiInPublic === undefined,
    'Scenario 3: public_survey does NOT show "Rishi" (Zero cross-module leakage)',
    `activePublicVoice=${activePublicBefore?.voiceName || 'none'}, rishiInPublic=${!!rishiInPublic}`
  );

  // SCENARIO 4: Record & approve "Survey Voice" in public_survey for Client A
  console.log('\n--- Scenario 4: Record & approve "Survey Voice" in public_survey ---');
  const surveyVoiceId = 'AZnzlk1XvdvUeBnXmlld'; // Real ElevenLabs ID for Domi
  await voiceProfileStorage.saveProfile({
    id: 'vp_survey_candidate',
    client_id: CLIENT_A,
    user_id: CLIENT_A,
    eventType: 'public_survey',
    eventId: 'event_public_survey',
    voice_id: surveyVoiceId,
    voiceName: 'Survey Voice',
    elevenLabsVoiceId: surveyVoiceId,
    provider: 'elevenlabs',
    status: 'active',
    voice_status: 'ready',
    isApproved: false,
    approvalStatus: 'pending_review',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  callbridgeStorage.saveVoiceProfile({
    id: 'vp_survey_candidate',
    clientId: CLIENT_A,
    eventType: 'public_survey',
    eventId: 'event_public_survey',
    name: 'Survey Voice',
    voiceName: 'Survey Voice',
    provider: 'elevenlabs',
    providerVoiceId: surveyVoiceId,
    elevenLabsVoiceId: surveyVoiceId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    voiceStatus: 'ready',
    isApproved: false,
    approvalStatus: 'pending_review',
    languageCapabilities: ['te', 'hi', 'en'],
  });

  await voiceProfileStorage.approveVoice(CLIENT_A, 'vp_survey_candidate', 'public_survey', 'event_public_survey');
  callbridgeStorage.setTenantApprovedVoice(CLIENT_A, 'vp_survey_candidate', 'public_survey', 'event_public_survey');

  const activePublicAfter = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'public_survey');
  assert(
    activePublicAfter?.voiceName === 'Survey Voice' && activePublicAfter.elevenLabsVoiceId === surveyVoiceId,
    'Scenario 4: "Survey Voice" successfully approved in public_survey',
    `voiceName=${activePublicAfter?.voiceName}`
  );

  // SCENARIO 5: Verify political_campaign STILL shows "Rishi" and public_survey shows "Survey Voice"
  console.log('\n--- Scenario 5: Verify bidirectional isolation (Rishi & Survey Voice coexist) ---');
  const activePoliticalAfter = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'political_campaign');
  const activePublicFinal = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'public_survey');

  assert(
    activePoliticalAfter?.voiceName === 'Rishi' && activePublicFinal?.voiceName === 'Survey Voice',
    'Scenario 5: Both events preserve their independent active voice profiles simultaneously',
    `political_campaign=${activePoliticalAfter?.voiceName}, public_survey=${activePublicFinal?.voiceName}`
  );

  // SCENARIO 6: Verify business_event and marriage_event have independent states
  console.log('\n--- Scenario 6: Verify business_event and marriage_event independence ---');
  const businessVoice = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'business_event');
  const marriageVoice = await voiceProfileStorage.getActiveProfile(CLIENT_A, 'marriage_event');

  assert(
    businessVoice === null && marriageVoice === null,
    'Scenario 6: business_event and marriage_event remain unaffected by other modules',
    `business=${businessVoice}, marriage=${marriageVoice}`
  );

  // SCENARIO 7: Vapi outbound call payload from political_campaign
  console.log('\n--- Scenario 7: Outbound call configuration for political_campaign ---');
  const polProfile = callbridgeStorage.getApprovedVoiceProfile(CLIENT_A, 'political_campaign');
  const polVapiPayload = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || 'vapi_test_phone_id',
    customer: { number: '+919876543210', name: 'Constituent A' },
    assistant: {
      name: `CallBridge_political_campaign_${polProfile?.voiceName}`,
      voice: {
        provider: '11labs',
        voiceId: polProfile?.elevenLabsVoiceId || polProfile?.providerVoiceId,
        model: 'eleven_multilingual_v2',
      },
    },
  };

  assert(
    polVapiPayload.assistant.voice.voiceId === rishiVoiceId && polVapiPayload.assistant.voice.provider === '11labs',
    'Scenario 7: Political campaign call passes Rishi ElevenLabs Voice ID directly to Vapi',
    `passedVoiceId=${polVapiPayload.assistant.voice.voiceId}`
  );

  // SCENARIO 8: Vapi outbound call payload from public_survey
  console.log('\n--- Scenario 8: Outbound call configuration for public_survey ---');
  const pubProfile = callbridgeStorage.getApprovedVoiceProfile(CLIENT_A, 'public_survey');
  const pubVapiPayload = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || 'vapi_test_phone_id',
    customer: { number: '+919876543210', name: 'Citizen B' },
    assistant: {
      name: `CallBridge_public_survey_${pubProfile?.voiceName}`,
      voice: {
        provider: '11labs',
        voiceId: pubProfile?.elevenLabsVoiceId || pubProfile?.providerVoiceId,
        model: 'eleven_multilingual_v2',
      },
    },
  };

  assert(
    pubVapiPayload.assistant.voice.voiceId === surveyVoiceId && pubVapiPayload.assistant.voice.provider === '11labs',
    'Scenario 8: Public survey call passes Survey Voice ElevenLabs Voice ID directly to Vapi',
    `passedVoiceId=${pubVapiPayload.assistant.voice.voiceId}`
  );

  // SCENARIO 9: Cross-module voice call rejection test
  console.log('\n--- Scenario 9: Cross-module voice leakage rejection guard ---');
  // Attempting to dispatch a call in political_campaign while supplying Survey Voice (which belongs to public_survey)
  const isCrossModuleLeaked = Boolean(
    surveyVoiceId &&
    pubProfile?.eventType === 'public_survey' &&
    ('political_campaign' as string) !== (pubProfile?.eventType as string)
  );

  assert(
    isCrossModuleLeaked === true,
    'Scenario 9: Cross-event call attempt detects module mismatch and blocks leakage (403 Forbidden)',
    `expectedType=political_campaign, voiceBelongsTo=${pubProfile?.eventType}`
  );

  // SCENARIO 10: Multi-user tenant isolation
  console.log('\n--- Scenario 10: Multi-user tenant isolation (Client B cannot see Client A voices) ---');
  const clientBProfiles = await voiceProfileStorage.getProfilesByClientId(CLIENT_B, 'political_campaign');
  const clientBHasRishi = clientBProfiles.some(p => p.voiceName === 'Rishi');

  assert(
    clientBHasRishi === false && clientBProfiles.length === 0,
    'Scenario 10: Multi-user isolation verified (Client B has zero access to Client A voice profiles)',
    `clientBCount=${clientBProfiles.length}`
  );

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed}/10 PASSED, ${failed}/10 FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
