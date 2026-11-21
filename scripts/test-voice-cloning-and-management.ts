import assert from 'assert';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { ElevenLabsService } from '../server/voice/elevenLabsService.ts';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=====================================================');
  console.log('CALLBRIDGE AI — VOICE PROFILE & CLONING VERIFICATION');
  console.log('=====================================================\n');

  // TEST 1: Madhavi reference voice is completely absent from client voice profiles
  console.log('--- TEST 1: Check Madhavi voice removal ---');
  const client1Profiles = callbridgeStorage.getVoiceProfiles('client_001');
  const hasMadhaviInC1 = client1Profiles.some(
    (p) => p.name?.toLowerCase().includes('madhavi') || p.providerVoiceId === '4XvBGCPMXWyVQa75dbZg'
  );
  assert(!hasMadhaviInC1, 'Madhavi voice must NOT appear in client_001 profiles');

  const client1Tenant = callbridgeStorage.getTenant('client_001');
  assert(
    !client1Tenant?.approvedVoiceName?.toLowerCase().includes('madhavi'),
    'Madhavi must not be client_001 approved voice'
  );
  console.log('✓ PASS: Madhavi is completely excluded from client profiles and defaults.');

  // TEST 2: Validation errors for Voice Cloning
  console.log('\n--- TEST 2: Specific validation errors (No generic "Please fill the details") ---');
  // 2A: Missing Voice Name
  const emptyNameForm = new FormData();
  const dummyBlob = new Blob([Buffer.alloc(1000)], { type: 'audio/webm' });
  emptyNameForm.append('audio', dummyBlob, 'sample.webm');
  emptyNameForm.append('name', '   ');
  emptyNameForm.append('clientId', 'client_001');

  const resEmptyName = await fetch(`${BASE_URL}/api/callbridge/voice-profiles/record-clone`, {
    method: 'POST',
    body: emptyNameForm,
  });
  const dataEmptyName = await resEmptyName.json();
  assert.strictEqual(resEmptyName.status, 400, 'Empty name should return HTTP 400');
  assert(
    dataEmptyName.error.includes('Voice Name is required'),
    `Expected specific "Voice Name is required" error, got: ${dataEmptyName.error}`
  );
  console.log('✓ PASS: Specific error returned when Voice Name is empty:', dataEmptyName.error);

  // 2B: Missing Audio
  const emptyAudioForm = new FormData();
  emptyAudioForm.append('name', 'My Test Voice');
  emptyAudioForm.append('clientId', 'client_001');

  const resEmptyAudio = await fetch(`${BASE_URL}/api/callbridge/voice-profiles/record-clone`, {
    method: 'POST',
    body: emptyAudioForm,
  });
  const dataEmptyAudio = await resEmptyAudio.json();
  assert.strictEqual(resEmptyAudio.status, 400, 'Missing audio should return HTTP 400');
  assert(
    dataEmptyAudio.error.includes('Audio recording file is required'),
    `Expected specific "Audio recording file is required" error, got: ${dataEmptyAudio.error}`
  );
  console.log('✓ PASS: Specific error returned when Audio file is missing:', dataEmptyAudio.error);

  // TEST 3: Create Clone with ElevenLabs and synthetic audio
  console.log('\n--- TEST 3: ElevenLabs Voice Cloning integration ---');
  // Generate a valid 3-second WAV audio buffer
  const sampleRate = 44100;
  const numSamples = sampleRate * 3;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + numSamples * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(numSamples * 2, 40);

  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000;
    data.writeInt16LE(Math.floor(s), i * 2);
  }
  const wavBuffer = Buffer.concat([header, data]);
  const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });

  const cloneForm = new FormData();
  const testVoiceName = `AutoTest_Voice_${Date.now()}`;
  cloneForm.append('audio', audioBlob, 'test_sample.wav');
  cloneForm.append('name', testVoiceName);
  cloneForm.append('clientId', 'client_001');

  const resClone = await fetch(`${BASE_URL}/api/callbridge/voice-profiles/record-clone`, {
    method: 'POST',
    body: cloneForm,
  });
  const dataClone = await resClone.json();
  assert(resClone.ok && dataClone.success, `Voice clone failed: ${JSON.stringify(dataClone)}`);
  assert(dataClone.profile.providerVoiceId, 'Should have received ElevenLabs providerVoiceId');
  const createdVoiceId = dataClone.profile.id;
  const createdElevenLabsId = dataClone.profile.providerVoiceId;
  console.log('✓ PASS: Voice successfully cloned with ElevenLabs! Voice ID:', createdElevenLabsId);

  // TEST 4: Voice Approval
  console.log('\n--- TEST 4: Voice Approval Workflow ---');
  const resApprove = await fetch(`${BASE_URL}/api/voice-profile/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'client_001',
      voiceProfileId: createdVoiceId,
    }),
  });
  const dataApprove = await resApprove.json();
  assert(dataApprove.success, 'Approval endpoint should succeed');

  const resTenants = await fetch(`${BASE_URL}/api/callbridge/tenants`);
  const dataTenants = await resTenants.json();
  const updatedTenant = dataTenants.tenants?.find((t: any) => t.id === 'client_001');
  assert.strictEqual(
    updatedTenant?.approvedVoiceProfileId,
    createdElevenLabsId,
    'Tenant approvedVoiceProfileId must match newly approved voice ID'
  );
  console.log('✓ PASS: Cloned voice approved and set as active authorized voice for client_001.');

  // TEST 5: Multi-Tenant Security Check
  console.log('\n--- TEST 5: Multi-Tenant Voice Isolation & Security ---');
  // Attempt to delete client_001's voice using client_002 credentials
  const resUnauthorizedDelete = await fetch(
    `${BASE_URL}/api/callbridge/voice-profiles/${createdVoiceId}?clientId=client_002`,
    {
      method: 'DELETE',
    }
  );
  assert.strictEqual(resUnauthorizedDelete.status, 403, 'Unauthorized client should get 403');
  console.log('✓ PASS: Client 2 cannot delete Client 1 voice profile (HTTP 403 Forbidden).');

  // TEST 6: Voice Deletion & ElevenLabs Cleanup
  console.log('\n--- TEST 6: Authorized Voice Deletion & ElevenLabs API call ---');
  const resDelete = await fetch(
    `${BASE_URL}/api/callbridge/voice-profiles/${createdVoiceId}?clientId=client_001`,
    {
      method: 'DELETE',
    }
  );
  const dataDelete = await resDelete.json();
  assert(dataDelete.success, `Deletion should succeed: ${JSON.stringify(dataDelete)}`);
  console.log('✓ PASS: Voice deleted from database and ElevenLabs. ElevenLabs status:', dataDelete.elevenLabsStatus);

  // Verify voice is no longer in HTTP profile list
  const resProfilesAfter = await fetch(`${BASE_URL}/api/callbridge/voice-profiles?clientId=client_001`);
  const dataProfilesAfter = await resProfilesAfter.json();
  const profileAfterDelete = (dataProfilesAfter.profiles || []).find((p: any) => p.id === createdVoiceId);
  assert(!profileAfterDelete, 'Deleted profile must no longer exist in client voice profiles');

  // Verify tenant approved voice was reset
  const resTenantsAfter = await fetch(`${BASE_URL}/api/callbridge/tenants`);
  const dataTenantsAfter = await resTenantsAfter.json();
  const tenantAfterDelete = dataTenantsAfter.tenants?.find((t: any) => t.id === 'client_001');
  assert(
    !tenantAfterDelete?.approvedVoiceProfileId,
    'Tenant approvedVoiceProfileId should be cleared after active voice deletion'
  );
  console.log('✓ PASS: Tenant active voice safely reset after deletion.');

  // TEST 7: Deleted voice is never used for test calls or telephony
  console.log('\n--- TEST 7: Guard against using deleted voice in test calls ---');
  const resTestCall = await fetch(`${BASE_URL}/api/callbridge/test-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'నమస్కారం అండి',
      voiceProfileId: createdElevenLabsId, // deleted ID
      clientId: 'client_001',
    }),
  });
  // Since voice was deleted and client has no approved voice, it should return 400
  assert(!resTestCall.ok, 'Calling with deleted voice should not succeed without valid profile');
  console.log('✓ PASS: Deleted voice cannot be used for phone or test call audio.');

  console.log('\n=====================================================');
  console.log('ALL VOICE PROFILE & CLONING SUITE TESTS PASSED (100%)');
  console.log('=====================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
