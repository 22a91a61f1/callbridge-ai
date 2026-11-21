import { ContactService } from '../server/contacts/contactService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import { queueManager } from '../server/campaign/queueManager.ts';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function createPdfBuffer(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica').fontSize(12);
    for (const line of lines) {
      doc.text(line);
      doc.moveDown(0.2);
    }
    doc.end();
  });
}

function createXlsxBuffer(rows: Record<string, any>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('  CONTACT IMPORT ACCURACY TEST SUITE — 3 MODULES VERIFICATION  ');
  console.log('===============================================================\n');

  // Clean setup for test events
  const surveyEvtId = `test_survey_${Date.now()}`;
  const politicalEvtId = `test_political_${Date.now()}`;
  const marriageEvtId = `test_marriage_${Date.now()}`;

  callbridgeStorage.saveEvent({
    id: surveyEvtId,
    name: 'Hyderabad Civic Amenities Survey',
    type: 'public_survey',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  callbridgeStorage.saveEvent({
    id: politicalEvtId,
    name: 'Guntur Constituency Voter Outreach',
    type: 'political_campaign',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  callbridgeStorage.saveEvent({
    id: marriageEvtId,
    name: 'Srinivas & Padmavathi Wedding Invitation',
    type: 'marriage_event',
    language: 'te',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // -------------------------------------------------------------------------
  // TEST 1: Acceptance Test — Two contacts and unrelated phone-like numbers
  // -------------------------------------------------------------------------
  console.log('Test 1: PDF with two contacts and unrelated numbers in headers/footers');
  const test1PdfBuffer = await createPdfBuffer([
    'CallBridge AI Platform - Confidential Report',
    'Date: 12/11/2026',
    'Ravi: 9876543210',
    'Suresh: 9123456780',
    'Document reference: 20261111001234',
    'Invoice number: 8802400000',
    'Account No: 8805100000',
    'Tracking ID: 8807800000',
    'PIN Code: 500001',
    'Page number: 2',
    '-- Page 1 of 1 --',
  ]);

  const test1Result = await ContactService.parsePdfBuffer(test1PdfBuffer, surveyEvtId);
  console.log('  Extracted contacts count:', test1Result.records.length);
  console.log('  Extracted contacts:', test1Result.records.map((r) => ({ name: r.name, phone: r.phone, status: r.status })));

  assert(test1Result.records.length === 2, `Expected EXACTLY 2 contacts, got ${test1Result.records.length}`);
  assert(test1Result.records[0].name === 'Ravi' && test1Result.records[0].phone === '+919876543210', 'First contact is Ravi (+919876543210)');
  assert(test1Result.records[1].name === 'Suresh' && test1Result.records[1].phone === '+919123456780', 'Second contact is Suresh (+919123456780)');
  assert(test1Result.validCount === 2, 'Valid count is exactly 2');
  assert(test1Result.invalidCount === 0, 'Invalid count is 0');
  assert(
    !test1Result.records.some((r) => r.phone.includes('88024') || r.phone.includes('20261111') || r.phone.includes('61111')),
    'No unrelated numbers (8802400000, 20261111001234, 61111...) extracted'
  );

  // -------------------------------------------------------------------------
  // TEST 2: PDF with Numbered Contact List (Format 1)
  // -------------------------------------------------------------------------
  console.log('\nTest 2: PDF with Numbered Contact List (Format 1)');
  const test2PdfBuffer = await createPdfBuffer([
    'Ravi – 9876543210',
    'Suresh – 9123456780',
    'Geetha – 9988776655',
  ]);

  const test2Result = await ContactService.parsePdfBuffer(test2PdfBuffer, politicalEvtId);
  assert(test2Result.records.length === 3, `Expected 3 contacts, got ${test2Result.records.length}`);
  assert(test2Result.records[0].name === 'Ravi' && test2Result.records[0].phone === '+919876543210', 'Order #1: Ravi');
  assert(test2Result.records[1].name === 'Suresh' && test2Result.records[1].phone === '+919123456780', 'Order #2: Suresh');
  assert(test2Result.records[2].name === 'Geetha' && test2Result.records[2].phone === '+919988776655', 'Order #3: Geetha');

  // -------------------------------------------------------------------------
  // TEST 3: PDF with Name and Number on separate lines (Format 2)
  // -------------------------------------------------------------------------
  console.log('\nTest 3: PDF with Name and Number on separate lines (Format 2)');
  const test3PdfBuffer = await createPdfBuffer([
    '1.',
    'Name: Ravi',
    'Number: 9876543210',
    '2.',
    'Name: Suresh',
    'Number: 9123456780',
  ]);

  const test3Result = await ContactService.parsePdfBuffer(test3PdfBuffer, marriageEvtId);
  assert(test3Result.records.length === 2, `Expected 2 contacts, got ${test3Result.records.length}`);
  assert(test3Result.records[0].name === 'Ravi' && test3Result.records[0].phone === '+919876543210', 'Block #1: Ravi (+919876543210)');
  assert(test3Result.records[1].name === 'Suresh' && test3Result.records[1].phone === '+919123456780', 'Block #2: Suresh (+919123456780)');

  // -------------------------------------------------------------------------
  // TEST 4: Tabular PDF (Format 3)
  // -------------------------------------------------------------------------
  console.log('\nTest 4: Tabular PDF with S.No, Name, Phone Number (Format 3)');
  const test4PdfBuffer = await createPdfBuffer([
    'S.No | Name | Phone Number',
    '1 | Ravi | 9876543210',
    '2 | Suresh | 9123456780',
    '3 | Geetha | 9988776655',
  ]);

  const test4Result = await ContactService.parsePdfBuffer(test4PdfBuffer, surveyEvtId);
  assert(test4Result.records.length === 3, `Expected 3 contacts from table, got ${test4Result.records.length}`);
  assert(test4Result.records[0].name === 'Ravi' && test4Result.records[0].phone === '+919876543210', 'Row #1: Ravi (S.No 1 excluded)');
  assert(test4Result.records[1].name === 'Suresh' && test4Result.records[1].phone === '+919123456780', 'Row #2: Suresh (S.No 2 excluded)');
  assert(test4Result.records[2].name === 'Geetha' && test4Result.records[2].phone === '+919988776655', 'Row #3: Geetha (S.No 3 excluded)');

  // -------------------------------------------------------------------------
  // TEST 5: CSV with different column headings (Format 4)
  // -------------------------------------------------------------------------
  console.log('\nTest 5: CSV with varied column headings (Format 4)');
  const csvContent = `Full Name,Mobile Number,Locality\nAnand Kumar,9812345678,Ward 4\nLakshmi Devi,9823456789,Ward 5\n`;
  const csvBuffer = Buffer.from(csvContent, 'utf-8');
  const test5Result = ContactService.parseSpreadsheet(csvBuffer, politicalEvtId);
  assert(test5Result.records.length === 2, `Expected 2 CSV records, got ${test5Result.records.length}`);
  assert(test5Result.records[0].name === 'Anand Kumar' && test5Result.records[0].phone === '+919812345678', 'CSV row 1: Anand Kumar');
  assert(test5Result.records[1].name === 'Lakshmi Devi' && test5Result.records[1].phone === '+919823456789', 'CSV row 2: Lakshmi Devi');

  // -------------------------------------------------------------------------
  // TEST 6: Excel (.xlsx) with different column headings (Format 4)
  // -------------------------------------------------------------------------
  console.log('\nTest 6: Excel (.xlsx) with Contact Name & Phone No headings');
  const xlsxBuffer = createXlsxBuffer([
    { 'Contact Name': 'Venkatesh Rao', 'Phone No': '9701234567', City: 'Vijayawada' },
    { 'Contact Name': 'Padma Reddy', 'Phone No': '9702345678', City: 'Guntur' },
  ]);
  const test6Result = ContactService.parseSpreadsheet(xlsxBuffer, marriageEvtId);
  assert(test6Result.records.length === 2, `Expected 2 XLSX records, got ${test6Result.records.length}`);
  assert(test6Result.records[0].name === 'Venkatesh Rao' && test6Result.records[0].phone === '+919701234567', 'XLSX row 1: Venkatesh Rao');
  assert(test6Result.records[1].name === 'Padma Reddy' && test6Result.records[1].phone === '+919702345678', 'XLSX row 2: Padma Reddy');

  // -------------------------------------------------------------------------
  // TEST 7: Duplicate Phone Numbers Detection
  // -------------------------------------------------------------------------
  console.log('\nTest 7: Duplicate Phone Numbers Detection');
  const dupPasted = `
    Ravi, 9876543210
    Suresh, 9123456780
    Ravi Duplicate, +91 98765 43210
  `;
  const test7Result = ContactService.parseManualPasted(dupPasted, surveyEvtId);
  assert(test7Result.records.length === 3, 'Found 3 records');
  assert(test7Result.records[0].status === 'Valid', '1st occurrence is Valid');
  assert(test7Result.records[2].status === 'Duplicate', '2nd occurrence is marked Duplicate');
  assert(test7Result.records[2].isDuplicate === true, 'isDuplicate flag is true');
  assert(test7Result.records[2].reason.includes('Duplicate'), 'Reason clearly states duplicate status');
  assert(test7Result.validCount === 2, 'Valid count is 2 (duplicates not counted as valid)');
  assert(test7Result.duplicateCount === 1, 'Duplicate count is 1');

  // -------------------------------------------------------------------------
  // TEST 8: Invalid Phone Numbers Detection
  // -------------------------------------------------------------------------
  console.log('\nTest 8: Invalid Phone Numbers Detection');
  const invalidPasted = `
    Short Number, 98765
    Invalid Starting Digit, 1234567890
    Valid Contact, 9876543210
  `;
  const test8Result = ContactService.parseManualPasted(invalidPasted, politicalEvtId);
  assert(test8Result.records[0].status === 'Invalid', 'Short number marked Invalid');
  assert(test8Result.records[0].reason.includes('5 digits'), 'Short number reason mentions digit length');
  assert(test8Result.records[1].status === 'Invalid', '1234567890 marked Invalid (must start with 6-9)');
  assert(test8Result.records[2].status === 'Valid', '9876543210 marked Valid');
  assert(test8Result.invalidCount === 2, 'Invalid count is 2');

  // -------------------------------------------------------------------------
  // TEST 9: Missing Names Handling
  // -------------------------------------------------------------------------
  console.log('\nTest 9: Missing Names Handling');
  const missingNamePasted = `
    9876543210
    Phone: 9123456780
  `;
  const test9Result = ContactService.parseManualPasted(missingNamePasted, marriageEvtId);
  assert(test9Result.records.length === 2, 'Parsed 2 lines');
  assert(test9Result.records[0].status === 'Needs Review', 'Missing name marked Needs Review');
  assert(test9Result.records[0].name === 'Resident', 'Missing name defaulted to Resident');

  // -------------------------------------------------------------------------
  // TEST 10: International Numbers with Country Codes
  // -------------------------------------------------------------------------
  console.log('\nTest 10: International Numbers with Country Codes');
  const intlPasted = `
    John US, +1 415 555 2671
    David UK, +44 7911 123456
    Rashid UAE, +971 50 123 4567
  `;
  const test10Result = ContactService.parseManualPasted(intlPasted, surveyEvtId);
  assert(test10Result.records[0].isValid && test10Result.records[0].phone === '+14155552671', 'US international normalized: +14155552671');
  assert(test10Result.records[1].isValid && test10Result.records[1].phone === '+447911123456', 'UK international normalized: +447911123456');
  assert(test10Result.records[2].isValid && test10Result.records[2].phone === '+971501234567', 'UAE international normalized: +971501234567');

  // -------------------------------------------------------------------------
  // TEST 11: Exact Order Preservation and Sequential Calling Queue Verification
  // -------------------------------------------------------------------------
  console.log('\nTest 11: Exact Source-Document Order Preservation & Sequential Queue (Section G)');
  const orderPdfBuffer = await createPdfBuffer([
    'Ravi – 9876543210',
    'Suresh – 9123456780',
    'Geetha – 9988776655',
  ]);

  const orderParsed = await ContactService.parsePdfBuffer(orderPdfBuffer, surveyEvtId);
  assert(orderParsed.records.length === 3, 'Extracted 3 contacts');

  // Commit bulk contacts
  const baseTime = Date.now();
  const contactsToSave = orderParsed.records.map((r, i) => ({
    id: `cnt_test_order_${baseTime}_${i}`,
    userId: 'user_default',
    eventId: surveyEvtId,
    name: r.name,
    phone: r.phone,
    originalPhone: r.rawPhone,
    consentStatus: 'granted' as const,
    optOut: false,
    importSource: 'pdf' as const,
    createdAt: new Date(baseTime + i * 50).toISOString(),
    updatedAt: new Date(baseTime + i * 50).toISOString(),
  }));

  callbridgeStorage.saveContactsBulk(contactsToSave);

  // Retrieve contacts from storage
  const storedContacts = callbridgeStorage.getContacts(surveyEvtId).filter((c) => c.id.startsWith(`cnt_test_order_${baseTime}`));
  assert(storedContacts.length === 3, 'Retrieved 3 stored contacts');
  assert(storedContacts[0].name === 'Ravi', 'Storage contact #0: Ravi');
  assert(storedContacts[1].name === 'Suresh', 'Storage contact #1: Suresh');
  assert(storedContacts[2].name === 'Geetha', 'Storage contact #2: Geetha');

  // Seed into sequential calling queue
  const campaign = callbridgeStorage.saveCampaign({
    id: `camp_order_test_${Date.now()}`,
    eventId: surveyEvtId,
    name: 'Sequential Calling Verification',
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: 3,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const jobs = queueManager.createCampaignJobs(campaign.id, surveyEvtId, storedContacts.map((c) => c.id));
  assert(jobs.length === 3, 'Created 3 sequential campaign jobs');
  assert(jobs[0].contactName === 'Ravi' && jobs[0].contactPhone === '+919876543210', 'Queue Job #0 is Ravi (+919876543210)');
  assert(jobs[1].contactName === 'Suresh' && jobs[1].contactPhone === '+919123456780', 'Queue Job #1 is Suresh (+919123456780)');
  assert(jobs[2].contactName === 'Geetha' && jobs[2].contactPhone === '+919988776655', 'Queue Job #2 is Geetha (+919988776655)');

  // -------------------------------------------------------------------------
  // TEST 12: Independent verification in all 3 Modules (Public Survey, Political Campaign, Marriage Event)
  // -------------------------------------------------------------------------
  console.log('\nTest 12: Independent Verification Across All 3 Modules');
  const twoContactDoc = await createPdfBuffer([
    'Ravi: 9876543210',
    'Suresh: 9123456780',
    'Document reference: 20261111001234',
    'Page number: 2',
  ]);

  const surveyRun = await ContactService.parsePdfBuffer(twoContactDoc, surveyEvtId);
  const politicalRun = await ContactService.parsePdfBuffer(twoContactDoc, politicalEvtId);
  const marriageRun = await ContactService.parsePdfBuffer(twoContactDoc, marriageEvtId);

  assert(surveyRun.records.length === 2, 'Module 1 (Public Survey): Exactly 2 contacts extracted');
  assert(politicalRun.records.length === 2, 'Module 2 (Political Campaign): Exactly 2 contacts extracted');
  assert(marriageRun.records.length === 2, 'Module 3 (Marriage Event): Exactly 2 contacts extracted');

  console.log('\n===============================================================');
  console.log('  ✓ ALL 12 CONTACT IMPORT ACCURACY TESTS PASSED PERFECTLY!     ');
  console.log('===============================================================');
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
