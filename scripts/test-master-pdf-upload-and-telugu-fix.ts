import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ContactService } from '../server/contacts/contactService.ts';
import { ExportService } from '../server/reporting/exportService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import { execSync } from 'child_process';

async function runMasterVerification() {
  console.log('========================================================================');
  console.log('CALLBRIDGE AI — MASTER TEST: PDF UPLOAD API + EXTRACTION + TELUGU PDF');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error('   Details:', details);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // ISSUE 1: PDF UPLOAD API ERROR HANDLING & JSON RESPONSE INTEGRITY
  // --------------------------------------------------------------------------
  console.log('--- ISSUE 1: PDF UPLOAD API ERROR HANDLING & JSON RESPONSES ---');

  // Test 1.1: Invalid Contact Name Filtering
  assert(ContactService.isInvalidContactName('Total'), 'Rejects "Total" as contact name');
  assert(ContactService.isInvalidContactName('Subtotal'), 'Rejects "Subtotal" as contact name');
  assert(ContactService.isInvalidContactName('Grand Total'), 'Rejects "Grand Total" as contact name');
  assert(ContactService.isInvalidContactName('Report ID'), 'Rejects "Report ID" as contact name');
  assert(ContactService.isInvalidContactName('Balance'), 'Rejects "Balance" as contact name');
  assert(ContactService.isInvalidContactName('Tax'), 'Rejects "Tax" as contact name');
  assert(ContactService.isInvalidContactName('Reference ID'), 'Rejects "Reference ID" as contact name');
  assert(!ContactService.isInvalidContactName('Ravi Kumar'), 'Accepts "Ravi Kumar" as valid contact name');
  assert(!ContactService.isInvalidContactName('రాజేష్'), 'Accepts Telugu name "రాజేష్" as valid contact name');

  // Test 1.2: Strict Phone Normalization Rejections
  const r1 = ContactService.normalizePhoneNumber('8802400000');
  assert(!r1.isValid, 'Rejects "8802400000" (ends in 5 zeros: accounting balance/coordinate)', r1.reason);

  const r2 = ContactService.normalizePhoneNumber('8805100000');
  assert(!r2.isValid, 'Rejects "8805100000" (ends in 5 zeros)', r2.reason);

  const r3 = ContactService.normalizePhoneNumber('8807800000');
  assert(!r3.isValid, 'Rejects "8807800000" (ends in 5 zeros)', r3.reason);

  const r4 = ContactService.normalizePhoneNumber('6111123435');
  assert(!r4.isValid, 'Rejects "6111123435" (61-series landline/STD exchange code, not mobile)', r4.reason);

  const r5 = ContactService.normalizePhoneNumber('9876543210');
  assert(r5.isValid && r5.normalized === '+919876543210', 'Accepts valid mobile "9876543210" -> "+919876543210"');

  const r6 = ContactService.normalizePhoneNumber('9123456780');
  assert(r6.isValid && r6.normalized === '+919123456780', 'Accepts valid mobile "9123456780" -> "+919123456780"');

  // --------------------------------------------------------------------------
  // ISSUE 2: PDF CONTACT EXTRACTION ACCURACY & ZERO NUMBER INVENTION
  // --------------------------------------------------------------------------
  console.log('\n--- ISSUE 2: PDF CONTACT EXTRACTION (THE 2-CONTACT REPRODUCER) ---');

  // Create a real PDF document with only TWO intended contacts and deceptive metadata lines
  const docTwoContacts = new PDFDocument({ margin: 50 });
  const pdfChunks: Buffer[] = [];
  docTwoContacts.on('data', (c) => pdfChunks.push(c));

  docTwoContacts.fontSize(16).text('CALLBRIDGE AI CITIZEN DIRECTORY', { align: 'center' });
  docTwoContacts.moveDown(0.5);
  docTwoContacts.fontSize(10).text('Document Ref: DOC-2026-99881');
  docTwoContacts.text('Generated Date: 2026-11-12 14:00:00');
  docTwoContacts.text('Page 1 of 1');
  docTwoContacts.moveDown(1);

  docTwoContacts.fontSize(12).text('Contacts List:');
  docTwoContacts.fontSize(10).text('1. Ravi – 9876543210');
  docTwoContacts.fontSize(10).text('2. Suresh – 9123456780');
  docTwoContacts.moveDown(1.5);

  docTwoContacts.fontSize(10).text('Accounting & Document Summary:');
  docTwoContacts.text('Report ID: 6111123435');
  docTwoContacts.text('Subtotal: 8802400000');
  docTwoContacts.text('Tax: 8805100000');
  docTwoContacts.text('Total Balance: 8807800000');
  docTwoContacts.text('PIN Code: 500081');
  docTwoContacts.text('Confidential - All Rights Reserved CallBridge AI');
  docTwoContacts.end();

  const twoContactPdfBuffer = await new Promise<Buffer>((resolve) => {
    docTwoContacts.on('end', () => resolve(Buffer.concat(pdfChunks)));
  });

  const twoContactParseResult = await ContactService.parsePdfBuffer(twoContactPdfBuffer, 'event_test_two_contacts');

  assert(twoContactParseResult.records.length === 2, 'Exactly 2 contacts extracted from document with 2 contacts', {
    count: twoContactParseResult.records.length,
    names: twoContactParseResult.records.map((r) => r.name),
  });

  const parsedNames = twoContactParseResult.records.map((r) => r.name);
  const parsedPhones = twoContactParseResult.records.map((r) => r.phone);

  assert(parsedNames[0] === 'Ravi' && parsedPhones[0] === '+919876543210', 'First contact is Ravi (+919876543210)');
  assert(parsedNames[1] === 'Suresh' && parsedPhones[1] === '+919123456780', 'Second contact is Suresh (+919123456780)');

  assert(!parsedPhones.includes('+916111123435'), 'Does NOT invent or extract "+916111123435"');
  assert(!parsedPhones.includes('+918802400000'), 'Does NOT invent or extract "+918802400000"');
  assert(!parsedPhones.includes('+918805100000'), 'Does NOT invent or extract "+918805100000"');
  assert(!parsedPhones.includes('+918807800000'), 'Does NOT invent or extract "+918807800000"');

  // Format 1: Numbered list with en-dash
  console.log('\n--- VERIFYING FORMAT 1: NUMBERED LIST ---');
  const format1Text = `
1. Ravi – 9876543210
2. Suresh – 9123456780
3. Geetha – 9988776655
Page 1 of 1
`;
  const f1Res = ContactService.parsePdfText(format1Text, 'event_f1');
  assert(f1Res.records.length === 3, 'Format 1: Exactly 3 contacts extracted', { count: f1Res.records.length });
  assert(f1Res.records[0].name === 'Ravi' && f1Res.records[0].phone === '+919876543210', 'Format 1: Ravi exact order 1');
  assert(f1Res.records[1].name === 'Suresh' && f1Res.records[1].phone === '+919123456780', 'Format 1: Suresh exact order 2');
  assert(f1Res.records[2].name === 'Geetha' && f1Res.records[2].phone === '+919988776655', 'Format 1: Geetha exact order 3');

  // Format 2: Multi-line name and number
  console.log('\n--- VERIFYING FORMAT 2: MULTI-LINE NAME AND NUMBER ---');
  const format2Text = `
1.
Name: Ravi
Number: 9876543210
2.
Name: Suresh
Number: 9123456780
`;
  const f2Res = ContactService.parsePdfText(format2Text, 'event_f2');
  assert(f2Res.records.length === 2, 'Format 2: Exactly 2 contacts extracted', { count: f2Res.records.length });
  assert(f2Res.records[0].name === 'Ravi' && f2Res.records[0].phone === '+919876543210', 'Format 2: Ravi exact order 1');
  assert(f2Res.records[1].name === 'Suresh' && f2Res.records[1].phone === '+919123456780', 'Format 2: Suresh exact order 2');

  // Format 3: Tabular PDF with columns
  console.log('\n--- VERIFYING FORMAT 3: TABULAR PDF ---');
  const format3Text = `
S.No\tName\tPhone Number
1\tRavi\t9876543210
2\tSuresh\t9123456780
3\tGeetha\t9988776655
Total: 8802400000
`;
  const f3Res = ContactService.parsePdfText(format3Text, 'event_f3');
  assert(f3Res.records.length === 3, 'Format 3: Exactly 3 contacts extracted and total row ignored', { count: f3Res.records.length });
  assert(f3Res.records[0].name === 'Ravi' && f3Res.records[0].phone === '+919876543210', 'Format 3: Ravi exact order 1');
  assert(f3Res.records[1].name === 'Suresh' && f3Res.records[1].phone === '+919123456780', 'Format 3: Suresh exact order 2');
  assert(f3Res.records[2].name === 'Geetha' && f3Res.records[2].phone === '+919988776655', 'Format 3: Geetha exact order 3');

  // Verify across the THREE modules: Public Survey, Political Campaign, Marriage Event
  console.log('\n--- VERIFYING ISOLATION ACROSS THE THREE SUPPORTED MODULES ---');
  const modules = ['public_survey', 'political_campaign', 'marriage_event'] as const;

  for (const mod of modules) {
    const modEventId = `event_test_${mod}_${Date.now()}`;
    callbridgeStorage.saveEvent({
      id: modEventId,
      name: `Test Event ${mod}`,
      type: mod,
      language: 'te',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {},
    });

    const parsed = ContactService.parsePdfText(format1Text, modEventId);
    assert(parsed.records.length === 3, `Module [${mod}]: Extracts exactly 3 contacts from PDF`);

    // Bulk save contacts
    const baseTime = Date.now();
    const recordsToSave = parsed.records.map((c, idx) => ({
      id: `cnt_${mod}_${idx}_${Date.now()}`,
      userId: 'user_default',
      eventId: modEventId,
      name: c.name,
      phone: c.phone,
      originalPhone: c.rawPhone,
      consentStatus: 'granted' as const,
      optOut: false,
      importSource: 'pdf' as const,
      createdAt: new Date(baseTime + idx * 50).toISOString(),
      updatedAt: new Date(baseTime + idx * 50).toISOString(),
    }));
    callbridgeStorage.saveContactsBulk(recordsToSave);

    const savedContacts = callbridgeStorage.getContacts(modEventId);
    assert(savedContacts.length === 3, `Module [${mod}]: Saved exactly 3 contacts to DB`);
    assert(savedContacts[0].name === 'Ravi', `Module [${mod}]: Contact 1 order preserved as Ravi`);
    assert(savedContacts[1].name === 'Suresh', `Module [${mod}]: Contact 2 order preserved as Suresh`);
    assert(savedContacts[2].name === 'Geetha', `Module [${mod}]: Contact 3 order preserved as Geetha`);

    // Queue manager preserves exact order
    const campId = `camp_${mod}_test_${Date.now()}`;
    callbridgeStorage.saveCampaign({
      id: campId,
      eventId: modEventId,
      name: `Test Campaign ${mod}`,
      status: 'idle',
      concurrencyLimit: 1,
      totalContacts: 3,
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      optOutCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const jobs = queueManager.createCampaignJobs(
      campId,
      modEventId,
      savedContacts.map((c) => c.id)
    );
    assert(jobs.length === 3, `Module [${mod}]: Campaign queue created 3 jobs`);
    assert(jobs[0].contactPhone === '+919876543210', `Module [${mod}]: Queue job 1 is +919876543210 (Ravi)`);
    assert(jobs[1].contactPhone === '+919123456780', `Module [${mod}]: Queue job 2 is +919123456780 (Suresh)`);
    assert(jobs[2].contactPhone === '+919988776655', `Module [${mod}]: Queue job 3 is +919988776655 (Geetha)`);
  }

  // --------------------------------------------------------------------------
  // ISSUE 3: PUBLIC SURVEY TRANSCRIPT PDF RENDERING & VISUAL VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- ISSUE 3: TELUGU TRANSCRIPT PDF GENERATION & VISUAL RENDERING ---');

  const multiTurnJob = {
    id: 'job_survey_telugu_master_verified',
    eventId: 'event_public_survey_master',
    campaignId: 'camp_survey_master',
    contactName: 'రాజేష్ కుమార్ (Rajesh Kumar)',
    contactPhone: '+919876543210',
    durationSeconds: 142,
    status: 'completed',
    createdAt: '2026-11-12T10:30:00.000Z',
    surveyAnswers: {
      A1: {
        questionText: 'మీ ప్రాంతంలో తాగునీటి సరఫరా ఎలా ఉంది?',
        answerText: 'ప్రస్తుతం పర్వాలేదు, రోజూ ఉదయం ఒక గంట వస్తుంది.',
      },
      A2: {
        questionText: 'మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ పరిస్థితి ఎలా ఉంది?',
        answerText: 'రోడ్లు చాలా అధ్వానంగా ఉన్నాయి. వర్షం వస్తే మురుగునీరు నిలిచిపోతుంది.',
        followUps: [
          {
            question: 'ఈ సమస్యపై అధికారులకు ఫిర్యాదు చేశారా?',
            answer: 'అవును, మునిసిపల్ ఆఫీసులో అర్జీ ఇచ్చాము కానీ ఇంకా పరిష్కారం కాలేదు.',
          },
        ],
      },
      A3: {
        questionText: 'వీధి దీపాలు సక్రమంగా వెలుగుతున్నాయా?',
        answerText: 'కొన్ని స్తంభాలకు లైట్లు లేవు, రాత్రి వేళల్లో చీకటిగా ఉంటోంది.',
      },
    },
    transcript: [
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'greeting',
        text: 'నమస్కారమండి! కాల్‌బ్రిడ్జ్ ప్రజా సర్వే విభాగం నుండి మాట్లాడుతున్నాము. మీ ప్రాంతంలోని ప్రజా సదుపాయాలపై మీ అభిప్రాయం తెలుసుకోవడానికి ఈ కాల్ చేసాము.',
        timestamp: Date.now() - 130000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        turnType: 'answer',
        text: 'నమస్కారం అండి, తప్పకుండా అడగండి.',
        timestamp: Date.now() - 115000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'main_question',
        questionOrder: 1,
        text: 'మొదటి ప్రశ్న: మీ ప్రాంతంలో తాగునీటి సరఫరా ఎలా ఉంది?',
        timestamp: Date.now() - 100000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        turnType: 'answer',
        text: 'ప్రస్తుతం పర్వాలేదు, రోజూ ఉదయం ఒక గంట వస్తుంది.',
        timestamp: Date.now() - 85000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'main_question',
        questionOrder: 2,
        text: 'సరేనండి, నమోదు చేసుకున్నాము. ఇక రెండవ ప్రశ్న: మీ వీధిలో రోడ్లు మరియు డ్రైనేజీ పరిస్థితి ఎలా ఉంది?',
        timestamp: Date.now() - 70000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        turnType: 'answer',
        text: 'రోడ్లు చాలా అధ్వానంగా ఉన్నాయి. వర్షం వస్తే మురుగునీరు నిలిచిపోతుంది.',
        timestamp: Date.now() - 55000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'follow_up',
        text: 'ఈ సమస్యపై అధికారులకు ఫిర్యాదు చేశారా?',
        timestamp: Date.now() - 40000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        turnType: 'clarification_response',
        text: 'అవును, మునిసిపల్ ఆఫీసులో అర్జీ ఇచ్చాము కానీ ఇంకా పరిష్కారం కాలేదు.',
        timestamp: Date.now() - 30000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'main_question',
        questionOrder: 3,
        text: 'ధన్యవాదాలు. ఇక మూడవ ప్రశ్న: వీధి దీపాలు సక్రమంగా వెలుగుతున్నాయా?',
        timestamp: Date.now() - 20000,
      },
      {
        speaker: 'respondent',
        role: 'respondent',
        turnType: 'answer',
        text: 'కొన్ని స్తంభాలకు లైట్లు లేవు, రాత్రి వేళల్లో చీకటిగా ఉంటోంది.',
        timestamp: Date.now() - 10000,
      },
      {
        speaker: 'agent',
        role: 'agent',
        turnType: 'closing',
        text: 'సరేనండి. మీ ప్రాంత సమస్యలపై మీ అమూల్యమైన సమయాన్ని వెచ్చించి అభిప్రాయాలను పంచుకున్నందుకు చాలా ధన్యవాదాలు. నమస్కారం.',
        timestamp: Date.now() - 2000,
      },
    ],
  };

  const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(multiTurnJob);
  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 10000, 'Survey transcript PDF generated with valid byte length', {
    bytes: pdfBuffer.length,
  });

  // Write output PDF to sample_out.pdf
  fs.writeFileSync('sample_out.pdf', pdfBuffer);
  assert(fs.existsSync('sample_out.pdf'), 'sample_out.pdf written successfully');

  // Render sample_out.pdf to PNG images using Ghostscript
  execSync('gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r150 -sOutputFile=sample_out_page%d.png sample_out.pdf', {
    stdio: 'inherit',
  });

  const page1Exists = fs.existsSync('sample_out_page1.png');
  const page2Exists = fs.existsSync('sample_out_page2.png');
  assert(page1Exists, 'sample_out_page1.png rendered successfully');

  if (page1Exists) {
    const p1Stats = fs.statSync('sample_out_page1.png');
    assert(p1Stats.size > 20000, 'sample_out_page1.png has substantial non-blank content', { size: p1Stats.size });
  }

  console.log('\n========================================================================');
  console.log(`MASTER VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
