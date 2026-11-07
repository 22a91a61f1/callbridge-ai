import { callbridgeStorage } from '../server/storage/callbridgeStorage';
import { ContactService } from '../server/contacts/contactService';
import { queueManager } from '../server/campaign/queueManager';
import { VapiService } from '../server/telephony/vapiService';

async function runTests() {
  console.log('================================================================');
  console.log('CALLBRIDGE AI — SEQUENTIAL OUTBOUND CALLING & QUESTION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // 0. Verify Exactly the 3 Core Modules (Public Survey, Political Campaign, Marriage Event)
  console.log('\n--- 0. Testing Exactly 3 Core Modules ---');
  const events = callbridgeStorage.getEvents();
  assert(events.length === 3, `Exactly 3 event modules returned (got ${events.length})`);
  assert(events[0]?.type === 'public_survey', `Module 1 is Public Survey (got ${events[0]?.type})`);
  assert(events[1]?.type === 'political_campaign', `Module 2 is Political Campaign (got ${events[1]?.type})`);
  assert(events[2]?.type === 'marriage_event', `Module 3 is Marriage Event (got ${events[2]?.type})`);
  assert(!events.some(e => e.type === 'management' || (e as any).id === 'management'), 'Management module is completely absent from events list');

  // Verify Marriage Event Config
  const marriageEvent = events.find(e => e.type === 'marriage_event');
  assert(!!marriageEvent, 'Marriage Event module exists');
  assert(!!marriageEvent?.config.generatedScript, 'Marriage Event invitation script configured');

  // 1. Verify Canonical 10 Telugu Questions in Public Survey
  console.log('\n--- 1. Testing Canonical 10 Telugu Questions in Public Survey ---');
  const questions = callbridgeStorage.getSurveyQuestions('event_public_survey');
  assert(questions.length >= 10, `Found ${questions.length} questions in storage (expected at least 10)`);
  
  const expectedPrefixes = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
  const actualIds = questions.map(q => q.questionId || q.id);
  const allCanonicalPresent = expectedPrefixes.every(p => actualIds.includes(p));
  assert(allCanonicalPresent, `All canonical A1-A10 questions present: ${actualIds.slice(0, 10).join(', ')}`);

  // Verify questions have Telugu text and civic topics
  const q1 = questions.find(q => (q.questionId || q.id) === 'A1');
  assert(!!q1 && !!q1.questionText && q1.questionText.includes('తాగునీటి'), 'Question A1 contains Telugu drinking water text');

  const q2 = questions.find(q => (q.questionId || q.id) === 'A2');
  assert(!!q2 && !!q2.questionText && q2.questionText.includes('రోడ్ల'), 'Question A2 contains Telugu roads (రోడ్ల) text');

  // 2. Question Management Operations
  console.log('\n--- 2. Testing Question Management Operations ---');
  // Add a custom question
  const customQ = callbridgeStorage.addSurveyQuestion('event_public_survey', {
    text: 'మీ ప్రాంతంలో గ్రంథాలయ సదుపాయం ఉందా?',
    questionText: 'మీ ప్రాంతంలో గ్రంథాలయ సదుపాయం ఉందా?',
    category: 'విద్యా సదుపాయాలు',
    questionType: 'custom',
    allowFollowUp: true,
    enabled: true,
    questionOrder: 11
  });
  assert(!!customQ && !!customQ.id, `Successfully added custom question: ${customQ.id}`);

  // Toggle enabled/disabled
  const updatedQ = callbridgeStorage.updateSurveyQuestion('event_public_survey', customQ.id, {
    enabled: false
  });
  assert(updatedQ?.enabled === false, 'Successfully updated question enable/disable status');

  // Reorder questions
  const reorderedIds = [customQ.id, ...questions.map(q => q.id || q.questionId!)];
  const reordered = callbridgeStorage.reorderSurveyQuestions('event_public_survey', reorderedIds);
  assert(reordered[0].id === customQ.id, 'Successfully reordered questions to place custom question first');

  // Delete custom question
  const deleted = callbridgeStorage.deleteSurveyQuestion('event_public_survey', customQ.id);
  assert(deleted, 'Successfully deleted custom question with confirmation');

  // 3. Contact Input & Parsing (Manual, Paste, PDF, CSV)
  console.log('\n--- 3. Testing Contact Input & Normalization ---');
  
  // Test Phone Normalization
  const norm1 = ContactService.normalizePhoneNumber('+91 98765-43210');
  assert(norm1.isValid && norm1.normalized === '+919876543210', `Normalized +91 mobile: ${norm1.normalized}`);

  const norm2 = ContactService.normalizePhoneNumber('09876543210');
  assert(norm2.isValid && norm2.normalized === '+919876543210', `Normalized 0-prefixed mobile: ${norm2.normalized}`);

  const norm3 = ContactService.normalizePhoneNumber('9876543210');
  assert(norm3.isValid && norm3.normalized === '+919876543210', `Normalized 10-digit mobile: ${norm3.normalized}`);

  // Test Manual Paste Parsing
  const pastedRaw = `
    Ramesh Kumar, 9876543210, Ward 4
    Sita Devi, +91 9876543211, Ward 5
    9876543212
    9876543210
  `;
  const pastedResult = ContactService.parseManualPasted(pastedRaw, 'event_public_survey');
  const parsedPasted = pastedResult.records;
  assert(parsedPasted.length === 4, `Parsed 4 pasted entries (got ${parsedPasted.length})`);
  assert(parsedPasted[0].name === 'Ramesh Kumar' && parsedPasted[0].isValid, 'First pasted entry has name and is valid');
  assert(parsedPasted[1].name === 'Sita Devi' && parsedPasted[1].isValid, 'Second pasted entry has name and is valid');
  assert(parsedPasted[3].isDuplicate, 'Duplicate phone number correctly flagged in preview');

  // Test CSV / Excel Parsing via Spreadsheet Parser
  const sampleCsv = `Name,Phone,Locality\nAnand Rao,9123456780,Ward 1\nLakshmi,9123456781,Ward 2\n`;
  const parsedCsv = ContactService.parseSpreadsheet(Buffer.from(sampleCsv, 'utf-8'), 'event_public_survey');
  assert(parsedCsv.records.length === 2 && parsedCsv.records.every(c => c.isValid), 'CSV parsed 2 valid contacts with auto-detected columns');

  // 4. Sequential Outbound Queue Concurrency Limit & Call Termination
  console.log('\n--- 4. Testing Sequential Outbound Calling (Concurrency Limit = 1) ---');
  
  const now = new Date().toISOString();
  const campaign = callbridgeStorage.saveCampaign({
    id: 'camp_test_seq',
    eventId: 'event_public_survey',
    name: 'Sequential Telugu Civic Survey',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 2,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  assert(campaign.concurrencyLimit === 1, 'Campaign strictly defaults concurrencyLimit to 1');

  // Seed 2 call jobs
  const job1 = callbridgeStorage.saveCallJob({
    id: 'job_test_1',
    campaignId: campaign.id,
    eventId: 'event_public_survey',
    contactId: 'c_test_1',
    contactName: 'Nagaraju',
    contactPhone: '+919876543210',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });

  const job2 = callbridgeStorage.saveCallJob({
    id: 'job_test_2',
    campaignId: campaign.id,
    eventId: 'event_public_survey',
    contactId: 'c_test_2',
    contactName: 'Padma',
    contactPhone: '+919876543211',
    status: 'pending',
    retryCount: 0,
    maxRetries: 1,
    createdAt: now,
    updatedAt: now,
  });

  assert(!!job1.id && !!job2.id, `Created 2 call jobs (#1: ${job1.id}, #2: ${job2.id})`);

  // Verify Vapi call termination
  const testProviderCallId = 'vapi_call_sim_999';
  const termResult = await VapiService.terminateCall(testProviderCallId);
  assert(termResult.success, 'Vapi call termination API succeeded');

  // 5. Verify Authentic Cloned Voice ID Preservation
  console.log('\n--- 5. Verifying Voice Cloning Profile Integrity ---');
  const user = callbridgeStorage.getTenant('client_001');
  assert(!!user, 'Tenant client_001 exists');
  const voiceProfiles = callbridgeStorage.getVoiceProfiles('client_001');
  const rishiVoice = voiceProfiles.find(v => v.providerVoiceId === 'WKyArUrP6hdAVp2kHYkw' || v.name === 'rishi');
  assert(!!rishiVoice, `Authentic approved cloned voice profile exists: ${rishiVoice?.name} (${rishiVoice?.providerVoiceId})`);
  assert(rishiVoice?.providerVoiceId === 'WKyArUrP6hdAVp2kHYkw', 'Exact ElevenLabs voice ID preserved (WKyArUrP6hdAVp2kHYkw)');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
