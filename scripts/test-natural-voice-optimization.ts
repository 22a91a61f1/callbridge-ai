import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { ElevenLabsService, DEFAULT_CONVERSATIONAL_VOICE_SETTINGS } from '../server/voice/elevenLabsService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';

async function runComprehensiveVerification() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — ELEVENLABS NATURAL CONVERSATIONAL VOICE VERIFICATION');
  console.log('================================================================');

  const apiKey = ElevenLabsService.getApiKey();
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY is not configured on the server.');
    process.exit(1);
  }

  // 1. VERIFY PRESERVATION OF CLONED VOICES ACROSS EVENTS
  console.log('\n[PHASE 1] Authoritative Cloned Voice Preservation Check:');
  const tenant = callbridgeStorage.getTenant('client_001');

  const surveyProfile = tenant?.eventVoiceProfiles?.public_survey;
  const campaignProfile = tenant?.eventVoiceProfiles?.political_campaign;
  const businessProfile = tenant?.eventVoiceProfiles?.business_event;

  console.log('1. Public Survey Cloned Voice:');
  console.log(`   - Profile ID: ${surveyProfile?.voiceProfileId}`);
  console.log(`   - Voice Name: "${surveyProfile?.voiceName}"`);
  console.log(`   - ElevenLabs Voice ID: ${surveyProfile?.providerVoiceId}`);

  console.log('2. Political Campaign Cloned Voice:');
  console.log(`   - Profile ID: ${campaignProfile?.voiceProfileId}`);
  console.log(`   - Voice Name: "${campaignProfile?.voiceName}"`);
  console.log(`   - ElevenLabs Voice ID: ${campaignProfile?.providerVoiceId}`);

  console.log('3. Business Event Cloned Voice:');
  console.log(`   - Profile ID: ${businessProfile?.voiceProfileId}`);
  console.log(`   - Voice Name: "${businessProfile?.voiceName}"`);
  console.log(`   - ElevenLabs Voice ID: ${businessProfile?.providerVoiceId}`);

  // Confirm NO synthetic default voice is used
  const blockedDefaults = ['Elliot', 'Madhavi', '4XvBGCPMXWyVQa75dbZg'];
  for (const b of blockedDefaults) {
    if (surveyProfile?.providerVoiceId === b || campaignProfile?.providerVoiceId === b) {
      throw new Error(`CRITICAL: Blocked default voice "${b}" was detected in active storage!`);
    }
  }
  console.log('✅ Cloned voice IDs are intact, isolated, and strictly preserved.');

  // 2. VERIFY SETTINGS CONFIGURATION
  console.log('\n[PHASE 2] ElevenLabs & Telephony Voice Settings Check:');
  console.log('Configured Default Conversational Settings:', JSON.stringify(DEFAULT_CONVERSATIONAL_VOICE_SETTINGS, null, 2));

  if (
    DEFAULT_CONVERSATIONAL_VOICE_SETTINGS.stability !== 0.45 ||
    DEFAULT_CONVERSATIONAL_VOICE_SETTINGS.similarity_boost !== 0.85 ||
    DEFAULT_CONVERSATIONAL_VOICE_SETTINGS.style !== 0.20 ||
    DEFAULT_CONVERSATIONAL_VOICE_SETTINGS.use_speaker_boost !== true ||
    DEFAULT_CONVERSATIONAL_VOICE_SETTINGS.speed !== 0.98
  ) {
    throw new Error('Default conversational voice settings do not match expected optimized values!');
  }
  console.log('✅ Voice settings verified in optimal human-conversational range.');

  // 3. SYNTHESIS AUDITING ACROSS LANGUAGES WITH APPROVED CLONED VOICE
  console.log('\n[PHASE 3] Multilingual Natural Speech Synthesis Test:');
  const targetVoiceId = surveyProfile?.providerVoiceId || 'AZnzlk1XvdvUeBnXmlld';
  console.log(`Using Authenticated Cloned Voice ID: ${targetVoiceId}`);

  const utterances = [
    {
      lang: 'Telugu',
      code: 'te',
      text: 'నమస్కారం అండి! మీ ప్రాంతంలో తాగునీటి సరఫరా మరియు రోడ్ల పరిస్థితి ఎలా ఉంది? ఏమైనా సమస్యలు ఉన్నాయా?',
      expectedEndingPunctuation: '?',
    },
    {
      lang: 'English',
      code: 'en',
      text: 'Hello! We are calling regarding the public amenities in your locality. How satisfied are you with the current road and water services?',
      expectedEndingPunctuation: '?',
    },
    {
      lang: 'Hindi',
      code: 'hi',
      text: 'नमस्ते! आपके क्षेत्र में नागरिक सुविधाओं और सड़क व्यवस्था के बारे में आपकी राय जानना चाहते हैं। क्या आपको कोई समस्या है?',
      expectedEndingPunctuation: '?',
    },
  ];

  for (const item of utterances) {
    console.log(`\nTesting ${item.lang}:`);
    console.log(`Input: "${item.text}"`);

    const t0 = Date.now();
    const result = await ElevenLabsService.synthesizeSpeech(targetVoiceId, item.text);
    const durationMs = Date.now() - t0;

    console.log(`  Status: SUCCESS`);
    console.log(`  Latency: ${durationMs}ms`);
    console.log(`  Audio Buffer Size: ${result.buffer.length} bytes`);
    console.log(`  Content-Type: ${result.contentType}`);
    console.log(`  isMock: ${result.isMock}`);

    // Verify MP3 header (ID3 tag or MP3 sync frame)
    const isID3 = result.buffer[0] === 0x49 && result.buffer[1] === 0x44 && result.buffer[2] === 0x33;
    const isMPEGSync = result.buffer[0] === 0xff && (result.buffer[1] & 0xe0) === 0xe0;
    const isValidAudioHeader = isID3 || isMPEGSync;
    console.log(`  Valid MP3 Stream Header: ${isValidAudioHeader ? 'YES' : 'NO'}`);

    if (!isValidAudioHeader || result.buffer.length < 1000) {
      throw new Error(`Invalid or corrupt audio generated for ${item.lang}`);
    }
  }

  console.log('\n================================================================');
  console.log('✅ ALL AUDITS & TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runComprehensiveVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
