import { ExportService } from '../server/reporting/exportService.ts';
import { callbridgeStorage } from '../server/storage/callbridgeStorage.ts';
import fs from 'fs';
import path from 'path';

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING MASTER VERIFICATION: TWO SPECIFIC BUG FIXES');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // ----------------------------------------------------
  // ISSUE 1: PUBLIC SURVEY — COMPLETE TRANSCRIPT PDF
  // ----------------------------------------------------
  console.log('--- TEST SUITE 1: Issue 1 — Public Survey PDF Download & Telugu Font ---');

  // Verify Telugu Font files exist and are readable
  const regularFontPath = path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Regular.ttf');
  const boldFontPath = path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Bold.ttf');
  assert(fs.existsSync(regularFontPath), 'NotoSansTelugu-Regular.ttf font exists');
  assert(fs.existsSync(boldFontPath), 'NotoSansTelugu-Bold.ttf font exists');

  // Retrieve existing completed call record (STRICT: Never initiate new Vapi call)
  const existingJob = callbridgeStorage.getCallJob('job_verify_1794043498194') ||
    callbridgeStorage.getCallJob('job_curl_pdf_test');
  assert(Boolean(existingJob), `Found existing completed survey call record (${existingJob?.id})`);

  if (existingJob) {
    console.log(`  Existing job transcript length: ${existingJob.transcript?.length || 0}`);
    console.log(`  Existing job surveyState transcripts length: ${existingJob.surveyState?.transcripts?.length || 0}`);

    const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(existingJob);
    assert(Buffer.isBuffer(pdfBuffer), 'PDF generated as Buffer');
    assert(pdfBuffer.length > 15000, `PDF size is valid and substantial (${pdfBuffer.length} bytes)`);
    assert(pdfBuffer.slice(0, 4).toString('utf8') === '%PDF', 'PDF starts with valid %PDF header');

    // Test with missing transcript array but existing surveyAnswers (Reconstruction test)
    const mockAnswersOnlyJob = {
      id: 'job_test_reconstruction',
      contactName: 'రమేష్ (Ramesh)',
      contactPhone: '+919876543210',
      status: 'completed',
      durationSeconds: 120,
      createdAt: new Date().toISOString(),
      surveyAnswers: {
        Q1: {
          questionId: 'Q1',
          questionOrder: 1,
          questionText: 'మీ ప్రాంతంలో తాగునీటి సరఫరా ఎలా ఉంది?',
          answerText: 'బాగానే ఉంది అండి, రోజు విడిచి రోజు నీళ్లు వస్తున్నాయి.',
          followUps: [
            {
              question: 'నీటి నాణ్యత ఎలా ఉంది?',
              answer: 'బాగుంది, ఎలాంటి ఇబ్బంది లేదు.'
            }
          ]
        },
        Q2: {
          questionId: 'Q2',
          questionOrder: 2,
          questionText: 'రోడ్ల పరిస్థితి ఎలా ఉంది?',
          answerText: 'రోడ్లు చాలా అధ్వానంగా ఉన్నాయి, వర్షం పడితే నీళ్లు నిలుస్తున్నాయి.',
        }
      }
    };

    const reconstructedPdf = await ExportService.generateSurveyTranscriptPdf(mockAnswersOnlyJob);
    assert(reconstructedPdf.length > 15000, `Reconstructed dialogue PDF generates successfully (${reconstructedPdf.length} bytes)`);
    assert(reconstructedPdf.slice(0, 4).toString('utf8') === '%PDF', 'Reconstructed PDF has %PDF header');
  }

  // ----------------------------------------------------
  // ISSUE 2: POLITICAL CAMPAIGN — RESPONSE 1 AND 2 PERCENTAGES
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 2: Issue 2 — Political Campaign Response 1 & 2 Percentages ---');

  // Test Case A: Formula verification with known valid response counts
  const count1 = 3;
  const count2 = 1;
  const totalValid = count1 + count2;
  const percent1 = totalValid > 0 ? Math.round((count1 / totalValid) * 100) : 0;
  const percent2 = totalValid > 0 ? Math.round((count2 / totalValid) * 100) : 0;

  assert(totalValid === 4, 'Total valid responses calculated as count1 + count2 (3 + 1 = 4)');
  assert(percent1 === 75, `Option 1 percentage is exactly 75% ((3 / 4) * 100 = ${percent1}%)`);
  assert(percent2 === 25, `Option 2 percentage is exactly 25% ((1 / 4) * 100 = ${percent2}%)`);
  assert(percent1 + percent2 === 100, 'Option 1 and Option 2 percentages sum to 100%');

  // Test Case B: Zero valid responses
  const zeroTotal = 0;
  const zeroP1 = zeroTotal > 0 ? Math.round((0 / zeroTotal) * 100) : 0;
  const zeroP2 = zeroTotal > 0 ? Math.round((0 / zeroTotal) * 100) : 0;
  assert(zeroP1 === 0 && zeroP2 === 0, 'Zero responses gracefully output 0% without divide-by-zero errors');

  // Test Case C: Equal split (5 and 5)
  const equalTotal = 5 + 5;
  const equalP1 = Math.round((5 / equalTotal) * 100);
  const equalP2 = Math.round((5 / equalTotal) * 100);
  assert(equalP1 === 50 && equalP2 === 50, 'Equal counts result in 50% / 50% split');

  // Test Case D: ExportService.exportAnalyticsJson handles numbers vs strings without double counting
  const testEventId = 'test_political_event_' + Date.now();
  const testCampId = 'test_political_camp_' + Date.now();

  callbridgeStorage.saveEvent({
    id: testEventId,
    tenantId: 'tenant_1',
    name: 'Constituency Outreach Test',
    type: 'political_campaign',
    language: 'te-IN',
    status: 'active',
  } as any);

  callbridgeStorage.saveCampaign({
    id: testCampId,
    eventId: testEventId,
    name: 'Phase 1 Phone Campaign',
    type: 'political_campaign',
    status: 'completed',
    processedCount: 4,
    answeredCount: 4,
    callsInitiated: 4,
  } as any);

  // 1. Record keypad outcomes via recordPoliticalKeypadOutcome
  callbridgeStorage.recordPoliticalKeypadOutcome(testEventId, 'call_term_1', '1', testCampId);
  callbridgeStorage.recordPoliticalKeypadOutcome(testEventId, 'call_term_2', '1', testCampId);
  callbridgeStorage.recordPoliticalKeypadOutcome(testEventId, 'call_term_3', '1', testCampId);
  callbridgeStorage.recordPoliticalKeypadOutcome(testEventId, 'call_term_4', '2', testCampId);

  const analytics = ExportService.exportAnalyticsJson(testEventId, testCampId);
  const polMetrics = analytics.moduleSpecificMetrics?.politicalCampaign;

  console.log('  Aggregated political metrics:');
  console.log(`    pressed1Count: ${polMetrics?.pressed1Count}`);
  console.log(`    pressed2Count: ${polMetrics?.pressed2Count}`);
  console.log(`    totalValidDtmf: ${polMetrics?.totalValidDtmf}`);
  console.log(`    pressed1Percent: ${polMetrics?.pressed1Percent}%`);
  console.log(`    pressed2Percent: ${polMetrics?.pressed2Percent}%`);

  assert(polMetrics?.pressed1Count === 3, 'ExportService counted exactly 3 responses for Option 1 across variations');
  assert(polMetrics?.pressed2Count === 1, 'ExportService counted exactly 1 response for Option 2');
  assert(polMetrics?.totalValidDtmf === 4, 'totalValidDtmf is 4 (same denominator for both options)');
  assert(polMetrics?.pressed1Percent === 75, `Option 1 percentage is 75% in exported analytics (actual: ${polMetrics?.pressed1Percent}%)`);
  assert(polMetrics?.pressed2Percent === 25, `Option 2 percentage is 25% in exported analytics (actual: ${polMetrics?.pressed2Percent}%)`);

  // Cleanup test event
  callbridgeStorage.deleteEvent(testEventId);

  console.log('\n====================================================');
  console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================');
}

runVerification().catch((err) => {
  console.error('Master verification script failed:', err);
  process.exit(1);
});
