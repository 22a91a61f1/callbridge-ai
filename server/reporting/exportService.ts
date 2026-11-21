import { callbridgeStorage } from '../storage/callbridgeStorage.ts';
import { SurveySequentialEngine } from '../survey/surveySequentialEngine.ts';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function ensureFontkitTeluguSupport(): void {
  try {
    const fkMain = require.resolve('fontkit');
    const dir = path.dirname(fkMain);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs'));
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          let content = fs.readFileSync(full, 'utf8');
          if (content.includes('getAnchor(anchor) {') && !content.includes('if (!anchor) return { x: 0, y: 0 };')) {
            content = content.replace(
              /getAnchor\(anchor\)\s*\{/g,
              'getAnchor(anchor) { if (!anchor) return { x: 0, y: 0 };'
            );
            fs.writeFileSync(full, content, 'utf8');
          }
        } catch {}
      }
    }
  } catch (e) {
    // Non-fatal
  }
}
ensureFontkitTeluguSupport();

// Runtime interceptor on PDFDocument to patch fontkit GPOSProcessor in-memory whenever any font is used
try {
  const origDocFont = (PDFDocument.prototype as any).font;
  if (origDocFont && !(PDFDocument.prototype as any).__teluguInterceptorAttached) {
    (PDFDocument.prototype as any).font = function (src: any, family?: any, size?: any) {
      const res = origDocFont.call(this, src, family, size);
      try {
        const fkFont = (this as any)._font?.font;
        const eng = fkFont?._layoutEngine?.engine;
        if (eng?.GPOSProcessor) {
          const proto = Object.getPrototypeOf(eng.GPOSProcessor);
          if (proto && !proto.__teluguAnchorPatched) {
            const origGetAnchor = proto.getAnchor;
            proto.getAnchor = function (anchor: any) {
              if (!anchor) return { x: 0, y: 0 };
              try {
                return origGetAnchor.call(this, anchor);
              } catch {
                return { x: anchor?.xCoordinate || 0, y: anchor?.yCoordinate || 0 };
              }
            };
            const origApplyAnchor = proto.applyAnchor;
            if (origApplyAnchor) {
              proto.applyAnchor = function (markRecord: any, baseAnchor: any, baseGlyphIndex: any) {
                if (!markRecord) return;
                try {
                  return origApplyAnchor.call(this, markRecord, baseAnchor, baseGlyphIndex);
                } catch {
                  // Fallback safe anchor placement
                }
              };
            }
            proto.__teluguAnchorPatched = true;
          }
        }
      } catch (e) {
        // Non-fatal
      }
      return res;
    };
    (PDFDocument.prototype as any).__teluguInterceptorAttached = true;
  }
} catch (e) {
  // Non-fatal
}

export class ExportService {
  /**
   * Export contacts for a specific event as CSV
   */
  public static exportContactsCsv(eventId: string, clientId?: string): string {
    const contacts = callbridgeStorage.getContacts(eventId, clientId);
    const headers = ['Contact ID', 'Name', 'Phone', 'Email', 'Locality', 'Consent Status', 'Opt Out', 'Import Source', 'Created At'];
    const rows = contacts.map((c) => [
      c.id,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      c.phone,
      c.email || '',
      `"${(c.locality || '').replace(/"/g, '""')}"`,
      c.consentStatus,
      c.optOut ? 'Yes' : 'No',
      c.importSource,
      c.createdAt,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Export contacts for a specific event as Excel (.xlsx)
   */
  public static exportContactsExcel(eventId: string, clientId?: string): Buffer {
    const contacts = callbridgeStorage.getContacts(eventId, clientId);
    const rows = contacts.map((c, idx) => ({
      '#': idx + 1,
      'Contact ID': c.id,
      'Name': c.name || 'Resident',
      'Phone': c.phone,
      'Email': c.email || '',
      'Locality': c.locality || '',
      'Consent Status': c.consentStatus,
      'Opt Out': c.optOut ? 'Yes' : 'No',
      'Import Source': c.importSource,
      'Created At': c.createdAt,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
      '#': '',
      'Contact ID': '',
      'Name': 'No contacts available',
      'Phone': '',
      'Email': '',
      'Locality': '',
      'Consent Status': '',
      'Opt Out': '',
      'Import Source': '',
      'Created At': '',
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Export contacts for a specific event as PDF (.pdf)
   */
  public static exportContactsPdf(eventId: string, clientId?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const contacts = callbridgeStorage.getContacts(eventId, clientId);
        const event = callbridgeStorage.getEvent(eventId, clientId);
        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        ensureFontkitTeluguSupport();

        const candidateRegular = [
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Regular.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Regular.ttf'),
          '/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf',
          path.join(process.cwd(), 'server/assets/fonts/Mandali-Regular.ttf'),
        ];
        const candidateBold = [
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Bold.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Bold.ttf'),
          '/usr/share/fonts/truetype/noto/NotoSansTelugu-Bold.ttf',
          path.join(process.cwd(), 'server/assets/fonts/Ramabhadra-Bold.ttf'),
        ];

        const teluguRegular = candidateRegular.find((p) => p && fs.existsSync(p)) || null;
        const teluguBold = candidateBold.find((p) => p && fs.existsSync(p)) || null;

        if (teluguRegular) doc.registerFont('Telugu', teluguRegular);
        if (teluguBold) doc.registerFont('TeluguBold', teluguBold);

        const fontRegular = teluguRegular ? 'Telugu' : 'Helvetica';
        const fontBold = teluguBold ? 'TeluguBold' : (teluguRegular ? 'Telugu' : 'Helvetica-Bold');

        // Header
        doc.font(fontBold).fontSize(18).fillColor('#1e293b').text(event?.name || 'Contact Directory', { align: 'left' });
        doc.font(fontRegular).fontSize(9).fillColor('#64748b').text(`Event Type: ${(event?.type || '').replace('_', ' ').toUpperCase()} | Total Contacts: ${contacts.length} | Export Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown(1);

        // Horizontal Line
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
        doc.moveDown(0.8);

        // Table Header
        const startY = doc.y;
        doc.fontSize(8).fillColor('#475569');
        doc.text('#', 36, startY, { width: 25 });
        doc.text('Name', 65, startY, { width: 140 });
        doc.text('Phone', 210, startY, { width: 110 });
        doc.text('Locality', 325, startY, { width: 110 });
        doc.text('Consent', 440, startY, { width: 60 });
        doc.text('Source', 505, startY, { width: 54 });
        doc.moveDown(0.8);

        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
        doc.moveDown(0.5);

        // Rows
        doc.font(fontRegular).fontSize(8).fillColor('#1e293b');
        if (contacts.length === 0) {
          doc.text('No contacts in this event directory.', 36, doc.y);
        } else {
          for (let i = 0; i < contacts.length; i++) {
            const c = contacts[i];
            if (doc.y > 750) {
              doc.addPage();
            }
            const rowY = doc.y;
            doc.text(String(i + 1), 36, rowY, { width: 25 });
            doc.text(c.name || 'Resident', 65, rowY, { width: 140, lineBreak: false });
            doc.text(c.phone || '', 210, rowY, { width: 110, lineBreak: false });
            doc.text(c.locality || '—', 325, rowY, { width: 110, lineBreak: false });
            doc.text(c.consentStatus === 'granted' ? 'Verified' : 'Unconfirmed', 440, rowY, { width: 60 });
            doc.text(c.importSource || 'manual', 505, rowY, { width: 54 });
            doc.moveDown(0.6);
          }
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Builds a strictly tenant-isolated aggregate across a single customer's campaigns/jobs
   * for an event, NEVER reading the global shared event aggregate key.
   */
  private static buildTenantAggregateMetrics(
    eventId: string,
    eventType: any,
    clientId: string,
    campaignIds: string[]
  ): any {
    const questions = eventType === 'public_survey' ? callbridgeStorage.getSurveyQuestions(eventId, clientId) : [];
    const base: any = {
      eventId: `${eventId}::${clientId}`,
      eventType,
      totalCalls: 0,
      completedCalls: 0,
      answeredCalls: 0,
      unansweredCalls: 0,
      rejectedCalls: 0,
      failedCalls: 0,
      totalDurationSeconds: 0,
      averageDurationSeconds: 0,
      completionRatePercent: 0,
      answerRatePercent: 0,
      publicSurvey:
        eventType === 'public_survey'
          ? {
              totalQuestions: questions.length,
              completedSurveyCalls: 0,
              questions: questions.map((q, idx) => ({
                id: q.id || `A${idx + 1}`,
                questionOrder: idx + 1,
                text: q.text || q.questionText || `Question ${idx + 1}`,
                category: q.category || 'General',
                issueReportedCount: 0,
                issueReportedPercent: 0,
                noIssueReportedCount: 0,
                noIssueReportedPercent: 0,
                unansweredCount: 0,
                totalAnswers: 0,
              })),
            }
          : undefined,
      politicalCampaign:
        eventType === 'political_campaign'
          ? {
              keypad1Count: 0,
              keypad1Percent: 0,
              keypad2Count: 0,
              keypad2Percent: 0,
              noInputCount: 0,
              noInputPercent: 0,
              totalValidDtmf: 0,
            }
          : undefined,
      marriageEvent:
        eventType === 'marriage_event'
          ? {
              attendingCount: 0,
              attendingPercent: 0,
              notAttendingCount: 0,
              notAttendingPercent: 0,
              maybeAttendingCount: 0,
              maybeAttendingPercent: 0,
              totalValidRsvp: 0,
            }
          : undefined,
    };

    const qMap = new Map<string, any>();
    if (base.publicSurvey?.questions) {
      for (const q of base.publicSurvey.questions) {
        qMap.set(q.id, q);
      }
    }

    for (const cid of campaignIds) {
      const cAgg = callbridgeStorage.getAggregateAnalytics(cid);
      if (!cAgg) continue;
      base.totalCalls += cAgg.totalCalls || 0;
      base.completedCalls += cAgg.completedCalls || 0;
      base.answeredCalls += cAgg.answeredCalls || 0;
      base.unansweredCalls += cAgg.unansweredCalls || 0;
      base.rejectedCalls += cAgg.rejectedCalls || 0;
      base.failedCalls += cAgg.failedCalls || 0;
      base.totalDurationSeconds += cAgg.totalDurationSeconds || 0;

      if (base.politicalCampaign && cAgg.politicalCampaign) {
        base.politicalCampaign.keypad1Count += cAgg.politicalCampaign.keypad1Count || 0;
        base.politicalCampaign.keypad2Count += cAgg.politicalCampaign.keypad2Count || 0;
        base.politicalCampaign.noInputCount += cAgg.politicalCampaign.noInputCount || 0;
        base.politicalCampaign.totalValidDtmf += cAgg.politicalCampaign.totalValidDtmf || 0;
      }
      if (base.marriageEvent && cAgg.marriageEvent) {
        base.marriageEvent.attendingCount += cAgg.marriageEvent.attendingCount || 0;
        base.marriageEvent.notAttendingCount += cAgg.marriageEvent.notAttendingCount || 0;
        base.marriageEvent.maybeAttendingCount += cAgg.marriageEvent.maybeAttendingCount || 0;
        base.marriageEvent.totalValidRsvp += cAgg.marriageEvent.totalValidRsvp || 0;
      }
      if (base.publicSurvey && cAgg.publicSurvey) {
        base.publicSurvey.completedSurveyCalls += (cAgg.publicSurvey as any).completedSurveyCalls || 0;
        for (const cq of cAgg.publicSurvey.questions || []) {
          const target = qMap.get(cq.id);
          if (target) {
            target.issueReportedCount += cq.issueReportedCount || 0;
            target.noIssueReportedCount += cq.noIssueReportedCount || 0;
            target.unansweredCount += cq.unansweredCount || 0;
            target.totalAnswers += cq.totalAnswers || 0;
            if (target.totalAnswers > 0) {
              target.issueReportedPercent = Math.round((target.issueReportedCount / target.totalAnswers) * 100);
              target.noIssueReportedPercent = Math.round((target.noIssueReportedCount / target.totalAnswers) * 100);
            }
          }
        }
      }
    }

    if (base.answeredCalls > 0) {
      base.averageDurationSeconds = Math.round(base.totalDurationSeconds / base.answeredCalls);
    } else if (base.totalCalls > 0 && base.totalDurationSeconds > 0) {
      base.averageDurationSeconds = Math.round(base.totalDurationSeconds / base.totalCalls);
    }
    base.completionRatePercent = base.totalCalls > 0 ? Math.round((base.completedCalls / base.totalCalls) * 100) : 0;
    base.answerRatePercent = base.totalCalls > 0 ? Math.round((base.answeredCalls / base.totalCalls) * 100) : 0;

    if (base.politicalCampaign) {
      const valid = base.politicalCampaign.keypad1Count + base.politicalCampaign.keypad2Count;
      base.politicalCampaign.totalValidDtmf = valid;
      base.politicalCampaign.keypad1Percent = valid > 0 ? Math.round((base.politicalCampaign.keypad1Count / valid) * 100) : 0;
      base.politicalCampaign.keypad2Percent = valid > 0 ? Math.round((base.politicalCampaign.keypad2Count / valid) * 100) : 0;
      base.politicalCampaign.noInputPercent = base.answeredCalls > 0 ? Math.round((base.politicalCampaign.noInputCount / base.answeredCalls) * 100) : 0;
    }
    if (base.marriageEvent) {
      base.marriageEvent.attendingPercent = base.answeredCalls > 0 ? Math.round((base.marriageEvent.attendingCount / base.answeredCalls) * 100) : 0;
      base.marriageEvent.notAttendingPercent = base.answeredCalls > 0 ? Math.round((base.marriageEvent.notAttendingCount / base.answeredCalls) * 100) : 0;
      base.marriageEvent.maybeAttendingPercent = base.answeredCalls > 0 ? Math.round((base.marriageEvent.maybeAttendingCount / base.answeredCalls) * 100) : 0;
    }

    return base;
  }

  /**
   * Export call history summary as CSV without storing or exposing personal identifiers or transcripts
   */
  public static exportCallHistoryCsv(eventId: string, clientId?: string): string {
    const event = callbridgeStorage.getEvent(eventId, clientId);
    const tenantCampaigns = clientId ? callbridgeStorage.getCampaigns(eventId, clientId) : [];
    const agg = clientId
      ? ExportService.buildTenantAggregateMetrics(
          eventId,
          event?.type || 'public_survey',
          clientId,
          tenantCampaigns.map((c) => c.id)
        )
      : callbridgeStorage.getAggregateAnalytics(eventId);
    const headers = ['Metric', 'Count / Value', 'Percentage'];
    const rows: Array<[string, string | number, string]> = [
      ['Event Name', event?.name || eventId, '—'],
      ['Event Type', event?.type || agg.eventType, '—'],
      ['Total Calls Made', agg.totalCalls, '100%'],
      ['Calls Attended / Completed', agg.completedCalls, `${agg.completionRatePercent}%`],
      ['Calls Answered', agg.answeredCalls, `${agg.answerRatePercent}%`],
      ['Calls Unanswered / Busy', agg.unansweredCalls, `${agg.totalCalls > 0 ? Math.round((agg.unansweredCalls / agg.totalCalls) * 100) : 0}%`],
      ['Calls Rejected / Disconnected', agg.rejectedCalls, `${agg.totalCalls > 0 ? Math.round((agg.rejectedCalls / agg.totalCalls) * 100) : 0}%`],
      ['Average Duration (Seconds)', `${agg.averageDurationSeconds}s`, '—'],
    ];

    if (agg.eventType === 'political_campaign' && agg.politicalCampaign) {
      rows.push(['Political: Keypad 1 (Support)', agg.politicalCampaign.keypad1Count, `${agg.politicalCampaign.keypad1Percent}%`]);
      rows.push(['Political: Keypad 2 (Callback / Against)', agg.politicalCampaign.keypad2Count, `${agg.politicalCampaign.keypad2Percent}%`]);
      rows.push(['Political: No Input', agg.politicalCampaign.noInputCount, `${agg.politicalCampaign.noInputPercent}%`]);
    } else if (agg.eventType === 'marriage_event' && agg.marriageEvent) {
      rows.push(['Marriage RSVP: Attending (Keypad 1)', agg.marriageEvent.attendingCount, `${agg.marriageEvent.attendingPercent}%`]);
      rows.push(['Marriage RSVP: Not Attending (Keypad 2)', agg.marriageEvent.notAttendingCount, `${agg.marriageEvent.notAttendingPercent}%`]);
    }

    return [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  }

  /**
   * Export full event analytics as anonymous aggregate JSON report with event-specific breakdowns.
   * Strictly adheres to privacy, tenant isolation, & module isolation:
   * - NO personal names, phone numbers, or transcripts.
   * - When clientId is present, NEVER reads or blends the global shared event aggregate.
   */
  public static exportAnalyticsJson(eventId: string, campaignId?: string, clientId?: string): Record<string, any> {
    const event = callbridgeStorage.getEvent(eventId, clientId);
    if (!event) return { error: 'Event not found' };

    const tenantCampaigns = callbridgeStorage.getCampaigns(eventId, clientId);
    let effectiveCampaignId = campaignId;
    if (effectiveCampaignId && clientId) {
      const requestedCamp = callbridgeStorage.getCampaign(effectiveCampaignId);
      if (requestedCamp && requestedCamp.clientId !== clientId) {
        return { error: 'Forbidden: Campaign belongs to another customer' };
      }
    }
    if (!effectiveCampaignId && tenantCampaigns.length > 0) {
      const activeCamp =
        tenantCampaigns.find((c) => c.status === 'running') ||
        tenantCampaigns.find((c) => (c.processedCount || 0) > 0 || (c.callsInitiated || 0) > 0 || (c.completedCount || 0) > 0) ||
        tenantCampaigns[0];
      if (activeCamp) effectiveCampaignId = activeCamp.id;
    }

    // Strict tenant isolation: when clientId is set, NEVER read unscoped global eventId aggregate
    const agg = clientId
      ? ExportService.buildTenantAggregateMetrics(
          eventId,
          event.type,
          clientId,
          campaignId ? [campaignId] : tenantCampaigns.map((c) => c.id)
        )
      : callbridgeStorage.getAggregateAnalytics(eventId);

    const campAgg = effectiveCampaignId ? callbridgeStorage.getAggregateAnalytics(effectiveCampaignId) : null;
    const campaign = effectiveCampaignId ? callbridgeStorage.getCampaign(effectiveCampaignId) : null;
    const contacts = callbridgeStorage.getContacts(eventId, clientId);

    // Pick strictly isolated aggregate source
    const isCampaignScoped = Boolean(campaignId && campAgg);
    const sourceAgg = isCampaignScoped ? campAgg! : agg;

    // Sum campaign-level counters across all of this tenant's campaigns (when viewing event-level dashboard)
    const scopedCampaigns = campaignId
      ? (campaign ? [campaign] : [])
      : tenantCampaigns;
    const sumCampField = (getter: (c: any) => number) =>
      scopedCampaigns.reduce((acc, c) => acc + (getter(c) || 0), 0);

    // Gather candidate jobs strictly scoped to the customer/campaign
    const candidateJobs = campaignId
      ? callbridgeStorage.getCallJobs(campaignId).filter((j) => !clientId || j.clientId === clientId)
      : callbridgeStorage.getCallJobsByEvent(eventId, clientId);

    let jobP1 = 0;
    let jobP2 = 0;
    for (const j of candidateJobs) {
      const val = (j as any).dtmfDigitReceived ?? (j as any).response ?? (j as any).dtmfResponse ?? (j as any).dtmfKey ?? (j as any).keypadResponse ?? (j as any).selectedOption ?? (j as any).metadata?.dtmfDigit ?? (j as any).metadata?.response;
      if (val === '1' || val === 1 || String(val).trim() === '1') {
        jobP1++;
      } else if (val === '2' || val === 2 || String(val).trim() === '2') {
        jobP2++;
      }
    }

    const p1Count = Math.max(jobP1, sourceAgg.politicalCampaign?.keypad1Count ?? 0, sumCampField((c) => c.keypad1Count));
    const p2Count = Math.max(jobP2, sourceAgg.politicalCampaign?.keypad2Count ?? 0, sumCampField((c) => c.keypad2Count));

    // Marriage Event: Spoken RSVP (Attending, Not Attending, Maybe). Denominator: Answered Calls
    const rsvpYes = Math.max(sourceAgg?.marriageEvent?.attendingCount ?? 0, sumCampField((c) => c.attendingCount));
    const rsvpNo = Math.max(sourceAgg?.marriageEvent?.notAttendingCount ?? 0, sumCampField((c) => c.notAttendingCount));
    const rsvpMaybe = Math.max(sourceAgg?.marriageEvent?.maybeAttendingCount ?? 0, sumCampField((c) => c.maybeAttendingCount));
    const totalValidRsvp = rsvpYes + rsvpNo + rsvpMaybe;

    const callsAttended = Math.max(
      sourceAgg.answeredCalls || 0,
      sumCampField((c) => c.answeredCount),
      p1Count + p2Count,
      totalValidRsvp
    );

    const callsNotAttended = Math.max(
      sourceAgg.unansweredCalls || 0,
      sumCampField((c) => c.unansweredCount)
    );

    const callsFailedOrBusy = Math.max(
      sourceAgg.failedCalls || 0,
      sumCampField((c) => c.failedCount)
    );

    const callsRejected = sourceAgg.rejectedCalls || 0;

    const finishedCalls = Math.max(
      callsAttended + callsNotAttended + callsFailedOrBusy,
      sumCampField((c) => c.processedCount),
      sumCampField((c) => c.completedCount),
      (sourceAgg.completedCalls || 0) + (sourceAgg.unansweredCalls || 0) + (sourceAgg.failedCalls || 0)
    );

    const totalCallsMade = Math.max(
      sourceAgg.totalCalls || 0,
      sumCampField((c) => c.callsInitiated),
      finishedCalls
    );

    const attendedPercent = totalCallsMade > 0 ? Math.round((callsAttended / totalCallsMade) * 100) : 0;
    const notAttendedPercent = totalCallsMade > 0 ? Math.round((callsNotAttended / totalCallsMade) * 100) : 0;
    const failedOrBusyPercent = totalCallsMade > 0 ? Math.round((callsFailedOrBusy / totalCallsMade) * 100) : 0;
    const rejectedPercent = totalCallsMade > 0 ? Math.round((callsRejected / totalCallsMade) * 100) : 0;

    // Political Campaign: Keypad percentages MUST calculate (Count / Total Valid Responses) * 100 with same denominator
    const pressed1Count = p1Count;
    const pressed2Count = p2Count;
    const totalValidResponses = pressed1Count + pressed2Count;
    const pressed1Percent = totalValidResponses > 0 ? Math.round((pressed1Count / totalValidResponses) * 100) : 0;
    const pressed2Percent = totalValidResponses > 0 ? Math.round((pressed2Count / totalValidResponses) * 100) : 0;
    const noInputCount = Math.max(0, callsAttended - totalValidResponses);
    const noInputPercent = callsAttended > 0 ? Math.round((noInputCount / callsAttended) * 100) : 0;

    const rsvpYesPercent = callsAttended > 0 ? Math.round((rsvpYes / callsAttended) * 100) : 0;
    const rsvpNoPercent = callsAttended > 0 ? Math.round((rsvpNo / callsAttended) * 100) : 0;
    const rsvpMaybePercent = callsAttended > 0 ? Math.round((rsvpMaybe / callsAttended) * 100) : 0;

    // Public Survey Completion Metrics & Operational Counters (strictly tenant/campaign scoped)
    const psJobs = candidateJobs;

    let psTotalCalls = psJobs.length;
    let psAnsweredCalls = 0;
    let psUnansweredCalls = 0;
    let psDisconnectedCalls = 0;
    let psCompletedCalls = 0;
    let psCallbackScheduledCalls = 0;

    for (const j of psJobs) {
      if (j.status === 'completed') {
        psAnsweredCalls++;
        psCompletedCalls++;
      } else if (j.status === 'callback_scheduled' || j.status === 'callback_requested') {
        psAnsweredCalls++;
        psCallbackScheduledCalls++;
      } else if (j.status === 'interrupted') {
        psAnsweredCalls++;
        psDisconnectedCalls++;
      } else if (j.status === 'in_progress' || j.status === 'calling' || j.status === 'ringing') {
        psAnsweredCalls++;
      } else if (j.status === 'no_answer' || j.status === 'busy' || j.status === 'failed') {
        psUnansweredCalls++;
      }
    }

    if (psTotalCalls === 0 && totalCallsMade > 0) {
      psTotalCalls = totalCallsMade;
      psAnsweredCalls = callsAttended;
      psUnansweredCalls = callsNotAttended;
      psCompletedCalls = sourceAgg.publicSurvey?.completedSurveyCalls ?? (callsAttended > 0 ? callsAttended : 0);
      psDisconnectedCalls = Math.max(0, callsAttended - psCompletedCalls);
    }

    const completedSurveyCalls = psCompletedCalls;
    const incompleteSurveyCalls = psDisconnectedCalls;

    return {
      eventId: event.id,
      campaignId: effectiveCampaignId || undefined,
      eventName: event.name,
      eventType: event.type,
      moduleType: event.type,
      language: event.language,
      dataRetentionPolicy: {
        mode: 'aggregate_only_anonymous',
        individualDataRetained: false,
        personallyIdentifiableInfo: false,
        transcriptsStored: event.type === 'public_survey',
        recordingsStored: false,
      },
      personalDataRetained: false,
      essentialMetrics: {
        totalCallsMade,
        callsInitiated: totalCallsMade,
        finishedCalls,
        callsAttended,
        attendedPercent,
        callsNotAttended,
        notAttendedPercent,
        callsFailedOrBusy,
        failedOrBusyPercent,
        callsRejected,
        rejectedPercent,
        pressed1Count,
        pressed1Percent,
        pressed2Count,
        pressed2Percent,
        totalValidDtmf: totalValidResponses,
        totalValidResponses,
        attendingCount: rsvpYes,
        attendingPercent: rsvpYesPercent,
        notAttendingCount: rsvpNo,
        notAttendingPercent: rsvpNoPercent,
        maybeAttendingCount: rsvpMaybe,
        maybeAttendingPercent: rsvpMaybePercent,
        maybeCount: rsvpMaybe,
        maybePercent: rsvpMaybePercent,
        completedSurveyCalls,
        incompleteSurveyCalls,
        totalDurationSeconds: sourceAgg.totalDurationSeconds || 0,
        averageDurationSeconds: sourceAgg.averageDurationSeconds || 0,
      },
      publicSurveyCounters: {
        totalCalls: psTotalCalls,
        answeredCalls: psAnsweredCalls,
        unansweredCalls: psUnansweredCalls,
        disconnectedCalls: psDisconnectedCalls,
        completedCalls: psCompletedCalls,
        callbackScheduledCalls: psCallbackScheduledCalls,
      },
      moduleSpecificMetrics: {
        politicalCampaign: {
          totalCallsInitiated: totalCallsMade,
          callsInitiated: totalCallsMade,
          finishedCalls,
          answeredCalls: callsAttended,
          answeredPercent: attendedPercent,
          unansweredCalls: callsNotAttended,
          unansweredPercent: notAttendedPercent,
          failedOrBusyCalls: callsFailedOrBusy,
          failedOrBusyPercent,
          pressed1Count,
          pressed1Percent,
          pressed2Count,
          pressed2Percent,
          totalValidDtmf: totalValidResponses,
          totalValidResponses,
          noInputCount,
          noInputPercent,
        },
        marriageRsvp: {
          totalCallsInitiated: totalCallsMade,
          callsInitiated: totalCallsMade,
          finishedCalls,
          answeredCalls: callsAttended,
          attendingCount: rsvpYes,
          attendingPercent: rsvpYesPercent,
          notAttendingCount: rsvpNo,
          notAttendingPercent: rsvpNoPercent,
          maybeCount: rsvpMaybe,
          maybePercent: rsvpMaybePercent,
          maybeAttendingCount: rsvpMaybe,
          maybeAttendingPercent: rsvpMaybePercent,
          unansweredCalls: callsNotAttended,
          unansweredPercent: notAttendedPercent,
          totalValidRsvp,
        },
        publicSurvey: {
          totalCallsInitiated: psTotalCalls,
          totalCalls: psTotalCalls,
          answeredCalls: psAnsweredCalls,
          unansweredCalls: psUnansweredCalls,
          disconnectedCalls: psDisconnectedCalls,
          completedCalls: psCompletedCalls,
          completedSurveyCalls: psCompletedCalls,
          incompleteSurveyCalls: psDisconnectedCalls,
          callbackScheduledCalls: psCallbackScheduledCalls,
          questions: sourceAgg.publicSurvey?.questions || [],
          overallIssueRatePercent: 0,
        },
      },
      metrics: {
        totalCalls: totalCallsMade,
        completedCalls: sourceAgg.completedCalls || 0,
        finishedCalls,
        rejectedCalls: callsRejected,
        answeredCalls: callsAttended,
        noAnswerCalls: callsNotAttended,
        failedCalls: sourceAgg.failedCalls || 0,
        inProgressCalls: 0,
        totalContacts: contacts.length,
        eligibleContacts: contacts.filter((c) => !c.optOut && c.consentStatus !== 'revoked').length,
        callsAttempted: totalCallsMade,
        callsCompleted: sourceAgg.completedCalls || 0,
        callsFailed: sourceAgg.failedCalls || 0,
        optOuts: 0,
        averageCallDurationSeconds: sourceAgg.averageDurationSeconds || 0,
        completionRatePercentage: sourceAgg.completionRatePercent || 0,
        answerRatePercentage: sourceAgg.answerRatePercent || 0,
      },
      publicSurvey: {
        totalCallsInitiated: totalCallsMade,
        answeredCalls: callsAttended,
        unansweredCalls: callsNotAttended,
        completedSurveyCalls,
        incompleteSurveyCalls,
        totalQuestionsConfigured: sourceAgg.publicSurvey?.questions?.length || 0,
        questions: sourceAgg.publicSurvey?.questions || [],
      },
      politicalCampaign: {
        totalCallsInitiated: totalCallsMade,
        callsInitiated: totalCallsMade,
        finishedCalls,
        answeredCalls: callsAttended,
        answeredPercent: attendedPercent,
        unansweredCalls: callsNotAttended,
        unansweredPercent: notAttendedPercent,
        failedOrBusyCalls: callsFailedOrBusy,
        failedOrBusyPercent,
        pressed1Count,
        pressed1Percent,
        pressed2Count,
        pressed2Percent,
        otherKeypadCount: 0,
        totalValidDtmf: totalValidResponses,
        totalValidResponses,
      },
      marriageEvent: {
        totalCallsInitiated: totalCallsMade,
        answeredCalls: callsAttended,
        attendingCount: rsvpYes,
        attendingPercent: rsvpYesPercent,
        notAttendingCount: rsvpNo,
        notAttendingPercent: rsvpNoPercent,
        unansweredCalls: callsNotAttended,
        unansweredPercent: notAttendedPercent,
        totalValidRsvp,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a PDF transcript document with authentic Telugu font rendering and conversation metadata.
   */
  public static async generateSurveyTranscriptPdf(job: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        ensureFontkitTeluguSupport();

        const candidateRegular = [
          path.join(process.cwd(), 'server/assets/fonts/Mandali-Regular.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/Mandali-Regular.ttf'),
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Regular.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Regular.ttf'),
          '/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf',
        ];
        const candidateBold = [
          path.join(process.cwd(), 'server/assets/fonts/Ramabhadra-Bold.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/Ramabhadra-Bold.ttf'),
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Bold.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Bold.ttf'),
          '/usr/share/fonts/truetype/noto/NotoSansTelugu-Bold.ttf',
        ];

        const teluguRegular = candidateRegular.find((p) => p && fs.existsSync(p)) || null;
        const teluguBold = candidateBold.find((p) => p && fs.existsSync(p)) || null;

        const hasTelugu = Boolean(teluguRegular);
        const hasTeluguBold = Boolean(teluguBold);

        if (teluguRegular) {
          doc.registerFont('Telugu', teluguRegular);
          doc.registerFont('NotoTelugu', teluguRegular);
        }
        if (teluguBold) {
          doc.registerFont('TeluguBold', teluguBold);
          doc.registerFont('NotoTeluguBold', teluguBold);
        }

        const fontRegular = hasTelugu ? 'Telugu' : 'Helvetica';
        const fontBold = hasTeluguBold ? 'TeluguBold' : (hasTelugu ? 'Telugu' : 'Helvetica-Bold');

        // Helper to check page break threshold before writing a block
        const checkPageBreak = (neededHeight: number = 45) => {
          if (doc.y + neededHeight > 740) {
            doc.addPage();
          }
        };

        // Document Title
        doc.font(fontBold).fontSize(19).fillColor('#1e3a8a')
          .text('ప్రజా సర్వే నివేదిక (Public Survey Report)', { align: 'left', lineGap: 3 });

        doc.font(fontRegular).fontSize(9.5).fillColor('#64748b')
          .text('CallBridge AI — Enterprise Conversational Voice Agent Platform');
        doc.moveDown(0.4);

        // Divider
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.6);

        // Metadata Grid — Respondent Details
        const startY = doc.y;
        doc.rect(40, startY, 515, 82).fillAndStroke('#f8fafc', '#cbd5e1');

        doc.font(fontBold).fontSize(10).fillColor('#1e3a8a');
        doc.text('ప్రతిస్పందనకర్త వివరాలు (Respondent Details)', 52, startY + 8);

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Respondent: ', 52, startY + 26, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(job.contactName || 'Citizen');

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Phone: ', 52, startY + 41, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(job.contactPhone || '—');

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Call ID: ', 52, startY + 56, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(job.id || '—');

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Date & Time: ', 52, startY + 70, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(job.createdAt ? new Date(job.createdAt).toLocaleString() : new Date().toLocaleString());

        // Right column
        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Call Duration: ', 320, startY + 26, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(`${job.durationSeconds || 0} seconds`);

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Call Status: ', 320, startY + 41, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(String(job.status || 'completed').replace(/_/g, ' ').toUpperCase());

        let rawAnswers = job.surveyAnswers || job.surveyState?.answers;
        if (!rawAnswers || Object.keys(rawAnswers).length === 0) {
          const targetId = job.providerCallId || job.id;
          const sState = SurveySequentialEngine.getState(targetId) || (job.id ? SurveySequentialEngine.getState(job.id) : undefined);
          if (sState?.answers && Object.keys(sState.answers).length > 0) {
            rawAnswers = sState.answers;
          }
        }

        // Reconstruct from transcript if answers object was missing
        if ((!rawAnswers || Object.keys(rawAnswers).length === 0) && Array.isArray(job.transcript)) {
          rawAnswers = {};
          let currentQText = '';
          let currentQKey = '';
          let qCounter = 0;
          for (const turn of job.transcript) {
            if (turn.role === 'agent') {
              if (turn.questionId || turn.turnType === 'main_question' || /మీ ప్రాంతం|పరిస్థితి|ఎలా ఉంది/i.test(turn.text)) {
                qCounter++;
                currentQKey = turn.questionId || `Q${qCounter}`;
                currentQText = (turn.text || '').replace(/^.*?మరి\s*/gi, '').trim();
              }
            } else if ((turn.role === 'respondent' || turn.role === 'user') && currentQKey) {
              rawAnswers[currentQKey] = {
                questionId: currentQKey,
                questionOrder: qCounter,
                questionText: currentQText,
                answerText: turn.text,
              };
            }
          }
        }

        const ansCount = rawAnswers ? Object.keys(rawAnswers).length : 0;
        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('Answers Recorded: ', 320, startY + 56, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(String(ansCount));

        if (job.callbackDetails?.scheduledTimestamp || job.callbackScheduledAt) {
          doc.font(fontBold).fontSize(9).fillColor('#0f172a');
          doc.text('Callback: ', 320, startY + 70, { continued: true });
          doc.font(fontRegular).fillColor('#334155').text(`${job.callbackDetails?.requestedDate || ''} ${job.callbackDetails?.requestedTime || ''}`);
        }

        doc.y = startY + 94;
        doc.x = 40;
        doc.moveDown(0.6);

        // Section: Recorded Survey Questions and Answers
        checkPageBreak(60);
        doc.font(fontBold).fontSize(16).fillColor('#1e3a8a')
          .text('నమోదైన సర్వే ప్రశ్నలు & సమాధానాలు (Recorded Survey Questions and Answers)', { lineGap: 3 });
        doc.moveDown(0.2);
        doc.strokeColor('#cbd5e1').lineWidth(0.8).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.8);

        // Resolve active configured survey questions to guarantee correct order and complete text
        const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(job.eventId || 'event_public_survey', job.clientId);

        interface DisplayQA {
          orderNum: number;
          questionText: string;
          answerText: string;
          followUps?: Array<{ question: string; answer: string }>;
        }
        const qaItems: DisplayQA[] = [];

        if (activeQuestions && activeQuestions.length > 0) {
          activeQuestions.forEach((q, idx) => {
            const key = q.id;
            let ansObj = (rawAnswers as any)?.[key] || (rawAnswers as any)?.[`A${idx + 1}`] || (rawAnswers as any)?.[`Q${idx + 1}`];
            let ansText = '';
            let followUps: Array<{ question: string; answer: string }> | undefined;

            if (ansObj) {
              ansText = typeof ansObj === 'string' ? ansObj : (ansObj.combinedAnswer || ansObj.answerText || ansObj.originalAnswer || String(ansObj));
              if (Array.isArray(ansObj.followUps) && ansObj.followUps.length > 0) {
                followUps = ansObj.followUps;
              }
            } else if (rawAnswers) {
              // Check if found in rawAnswers by searching for matching text or questionId
              for (const [k, v] of Object.entries(rawAnswers)) {
                const vObj = v as any;
                if (
                  k === q.id ||
                  vObj?.questionId === q.id ||
                  (vObj?.questionText && vObj.questionText.includes(q.text.slice(0, 20)))
                ) {
                  ansText = typeof vObj === 'string' ? vObj : (vObj.combinedAnswer || vObj.answerText || vObj.originalAnswer || String(vObj));
                  if (Array.isArray(vObj.followUps) && vObj.followUps.length > 0) {
                    followUps = vObj.followUps;
                  }
                  break;
                }
              }
            }

            if (ansText && ansText.trim()) {
              qaItems.push({
                orderNum: idx + 1,
                questionText: q.text,
                answerText: ansText.trim(),
                followUps,
              });
            }
          });
        }

        // If qaItems is empty but rawAnswers has entries, populate from rawAnswers directly
        if (qaItems.length === 0 && rawAnswers && Object.keys(rawAnswers).length > 0) {
          let idx = 0;
          for (const [qKey, val] of Object.entries(rawAnswers)) {
            idx++;
            const valObj = val as any;
            const qTitle = typeof valObj === 'object' && valObj?.questionText ? valObj.questionText : `ప్రశ్న (${qKey})`;
            const ansText = typeof valObj === 'string' ? valObj : (valObj?.combinedAnswer || valObj?.answerText || valObj?.text || String(valObj));
            const orderNum = typeof valObj === 'object' && typeof valObj?.questionOrder === 'number' ? valObj.questionOrder : idx;
            qaItems.push({
              orderNum,
              questionText: qTitle,
              answerText: ansText,
              followUps: valObj?.followUps,
            });
          }
          qaItems.sort((a, b) => a.orderNum - b.orderNum);
        }

        // Render each question and answer with clear spacing, larger fonts, and full page width
        if (qaItems.length === 0) {
          doc.font(fontRegular).fontSize(13.5).fillColor('#64748b')
            .text('నమోదైన సమాధానాలు ఏవీ అందుబాటులో లేవు (No survey answers recorded for this call).', { width: 515 });
        } else {
          for (let i = 0; i < qaItems.length; i++) {
            const item = qaItems[i];
            checkPageBreak(75);

            // Clean question text: strip redundant internal prefixes if present
            const cleanQ = item.questionText
              .replace(/^(ఇది\s*)?(మొదటి|రెండవ|మూడవ|నాల్గవ|ఐదవ|ఆరవ|ఏడవ|ఎనిమిదవ|తొమ్మిదవ|పదవ|తదుపరి|తర్వాతి)\s*ప్రశ్న\s*[:\.]?\s*/gi, '')
              .replace(/^\d+[\.\)]\s*/, '')
              .trim();

            // 15–16pt bold question text using full page width
            doc.font(fontBold).fontSize(15.5).fillColor('#0f172a')
              .text(`${item.orderNum}. ${cleanQ}`, 40, doc.y, { width: 515, lineGap: 4 });
            doc.moveDown(0.25);

            // 13.5–14pt regular answer body text displayed immediately below question
            doc.font(fontRegular).fontSize(13.5).fillColor('#1e293b')
              .text(item.answerText, 48, doc.y, { width: 507, lineGap: 5 });

            // Follow-up clarifications if recorded
            if (item.followUps && Array.isArray(item.followUps) && item.followUps.length > 0) {
              for (const fu of item.followUps) {
                if (fu?.question && fu?.answer) {
                  checkPageBreak(40);
                  doc.moveDown(0.2);
                  doc.font(fontBold).fontSize(11.5).fillColor('#475569')
                    .text(`• వివరణ ప్రశ్న: ${fu.question}`, { indent: 16, lineGap: 3, width: 495 });
                  doc.font(fontRegular).fontSize(12).fillColor('#334155')
                    .text(`  సమాధానం: ${fu.answer}`, { indent: 22, lineGap: 4, width: 489 });
                }
              }
            }

            doc.moveDown(0.85);
          }
        }

        // Multi-page buffered footer on all pages (rendered safely at y=780 within page margin to prevent auto page-breaks)
        const range = doc.bufferedPageRange();
        const totalPages = range.count;
        for (let i = range.start; i < range.start + totalPages; i++) {
          doc.switchToPage(i);
          doc.font(fontRegular).fontSize(8).fillColor('#94a3b8')
            .text(`పేజీ ${i + 1} / ${totalPages}  •  కాల్‌బ్రిడ్జ్ AI (CallBridge AI Platform)  •  ${new Date().toISOString().split('T')[0]}`, 40, 780, { align: 'center', width: 515, lineBreak: false });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
