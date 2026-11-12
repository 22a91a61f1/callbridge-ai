import { callbridgeStorage } from '../storage/callbridgeStorage.ts';
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
  public static exportContactsCsv(eventId: string): string {
    const contacts = callbridgeStorage.getContacts(eventId);
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
  public static exportContactsExcel(eventId: string): Buffer {
    const contacts = callbridgeStorage.getContacts(eventId);
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
  public static exportContactsPdf(eventId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const contacts = callbridgeStorage.getContacts(eventId);
        const event = callbridgeStorage.getEvent(eventId);
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
   * Export call history summary as CSV without storing or exposing personal identifiers or transcripts
   */
  public static exportCallHistoryCsv(eventId: string): string {
    const agg = callbridgeStorage.getAggregateAnalytics(eventId);
    const event = callbridgeStorage.getEvent(eventId);
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
   * Strictly adheres to privacy & module isolation: NO personal names, phone numbers, or transcripts.
   */
  public static exportAnalyticsJson(eventId: string, campaignId?: string): Record<string, any> {
    const event = callbridgeStorage.getEvent(eventId);
    if (!event) return { error: 'Event not found' };

    let effectiveCampaignId = campaignId;
    if (!effectiveCampaignId) {
      const campaigns = callbridgeStorage.getCampaigns(eventId);
      if (campaigns.length > 0) {
        const activeCamp =
          campaigns.find((c) => c.status === 'running') ||
          campaigns.find((c) => (c.processedCount || 0) > 0 || (c.callsInitiated || 0) > 0 || (c.completedCount || 0) > 0) ||
          campaigns[campaigns.length - 1];
        if (activeCamp) effectiveCampaignId = activeCamp.id;
      }
    }

    const agg = callbridgeStorage.getAggregateAnalytics(eventId);
    const campAgg = effectiveCampaignId ? callbridgeStorage.getAggregateAnalytics(effectiveCampaignId) : null;
    const campaign = effectiveCampaignId ? callbridgeStorage.getCampaign(effectiveCampaignId) : null;
    const contacts = callbridgeStorage.getContacts(eventId);

    // Pick aggregate with actual call activity
    const isCampaignScoped = Boolean(effectiveCampaignId && campAgg);
    const sourceAgg = isCampaignScoped ? campAgg! : agg;

    // Gather candidate jobs for event and campaign to accurately aggregate keypad / DTMF responses
    const candidateJobs = effectiveCampaignId
      ? callbridgeStorage.getCallJobs(effectiveCampaignId)
      : callbridgeStorage.getCallJobsByEvent(eventId);

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

    const p1Count = Math.max(jobP1, sourceAgg.politicalCampaign?.keypad1Count ?? 0, campaign?.keypad1Count ?? 0);
    const p2Count = Math.max(jobP2, sourceAgg.politicalCampaign?.keypad2Count ?? 0, campaign?.keypad2Count ?? 0);

    // Marriage Event: Spoken RSVP (Attending, Not Attending, Maybe). Denominator: Answered Calls
    let rsvpYes = 0;
    let rsvpNo = 0;
    let rsvpMaybe = 0;

    if (campaignId) {
      // Strictly campaign-isolated counts (Different campaigns must have separate RSVP counts)
      rsvpYes = Math.max(campAgg?.marriageEvent?.attendingCount ?? 0, campaign?.attendingCount ?? 0);
      rsvpNo = Math.max(campAgg?.marriageEvent?.notAttendingCount ?? 0, campaign?.notAttendingCount ?? 0);
      rsvpMaybe = Math.max(campAgg?.marriageEvent?.maybeAttendingCount ?? 0, campaign?.maybeAttendingCount ?? 0);
    } else {
      // Event-level aggregated counts across all campaigns
      rsvpYes = Math.max(
        agg?.marriageEvent?.attendingCount ?? 0,
        campAgg?.marriageEvent?.attendingCount ?? 0,
        campaign?.attendingCount ?? 0
      );
      rsvpNo = Math.max(
        agg?.marriageEvent?.notAttendingCount ?? 0,
        campAgg?.marriageEvent?.notAttendingCount ?? 0,
        campaign?.notAttendingCount ?? 0
      );
      rsvpMaybe = Math.max(
        agg?.marriageEvent?.maybeAttendingCount ?? 0,
        campAgg?.marriageEvent?.maybeAttendingCount ?? 0,
        campaign?.maybeAttendingCount ?? 0
      );
    }
    const totalValidRsvp = rsvpYes + rsvpNo + rsvpMaybe;

    let callsAttended = 0;
    if (campaignId) {
      callsAttended = Math.max(
        campAgg?.answeredCalls || 0,
        campaign?.answeredCount || 0,
        p1Count + p2Count,
        totalValidRsvp
      );
    } else {
      callsAttended = Math.max(
        sourceAgg.answeredCalls || 0,
        campAgg?.answeredCalls || 0,
        agg?.answeredCalls || 0,
        campaign?.answeredCount || 0,
        p1Count + p2Count,
        totalValidRsvp
      );
    }

    const callsNotAttended = campaignId
      ? Math.max(campAgg?.unansweredCalls || 0, campaign?.unansweredCount || 0)
      : Math.max(
          sourceAgg.unansweredCalls || 0,
          campAgg?.unansweredCalls || 0,
          agg?.unansweredCalls || 0,
          campaign?.unansweredCount || 0
        );

    const callsFailedOrBusy = campaignId
      ? Math.max(campAgg?.failedCalls || 0, campaign?.failedCount || 0)
      : Math.max(
          sourceAgg.failedCalls || 0,
          campAgg?.failedCalls || 0,
          agg?.failedCalls || 0,
          campaign?.failedCount || 0
        );

    const callsRejected = campaignId
      ? (campAgg?.rejectedCalls || 0)
      : Math.max(sourceAgg.rejectedCalls || 0, agg?.rejectedCalls || 0);

    const finishedCalls = campaignId
      ? Math.max(
          callsAttended + callsNotAttended + callsFailedOrBusy,
          campaign?.processedCount || 0,
          campaign?.completedCount || 0,
          (campAgg?.completedCalls || 0) + (campAgg?.unansweredCalls || 0) + (campAgg?.failedCalls || 0)
        )
      : Math.max(
          callsAttended + callsNotAttended + callsFailedOrBusy,
          campaign?.processedCount || 0,
          campaign?.completedCount || 0,
          (sourceAgg.completedCalls || 0) + (sourceAgg.unansweredCalls || 0) + (sourceAgg.failedCalls || 0)
        );

    const totalCallsMade = campaignId
      ? Math.max(
          campAgg?.totalCalls || 0,
          campaign?.callsInitiated || 0,
          finishedCalls
        )
      : Math.max(
          sourceAgg.totalCalls || 0,
          campAgg?.totalCalls || 0,
          agg?.totalCalls || 0,
          campaign?.callsInitiated || 0,
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

    // Public Survey Completion Metrics & Operational Counters
    const psJobs = effectiveCampaignId
      ? callbridgeStorage.getCallJobs(effectiveCampaignId)
      : callbridgeStorage.getCallJobsByEvent(eventId);

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
        totalDurationSeconds: agg.totalDurationSeconds,
        averageDurationSeconds: agg.averageDurationSeconds,
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
          questions: agg.publicSurvey?.questions || [],
          overallIssueRatePercent: 0,
        },
      },
      metrics: {
        totalCalls: totalCallsMade,
        completedCalls: agg.completedCalls,
        finishedCalls,
        rejectedCalls: callsRejected,
        answeredCalls: callsAttended,
        noAnswerCalls: callsNotAttended,
        failedCalls: agg.failedCalls,
        inProgressCalls: 0,
        totalContacts: contacts.length,
        eligibleContacts: contacts.filter((c) => !c.optOut && c.consentStatus !== 'revoked').length,
        callsAttempted: totalCallsMade,
        callsCompleted: agg.completedCalls,
        callsFailed: agg.failedCalls,
        optOuts: 0,
        averageCallDurationSeconds: agg.averageDurationSeconds,
        completionRatePercentage: agg.completionRatePercent,
        answerRatePercentage: agg.answerRatePercent,
      },
      publicSurvey: {
        totalCallsInitiated: totalCallsMade,
        answeredCalls: callsAttended,
        unansweredCalls: callsNotAttended,
        completedSurveyCalls,
        incompleteSurveyCalls,
        totalQuestionsConfigured: agg.publicSurvey?.questions?.length || 0,
        questions: agg.publicSurvey?.questions || [],
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
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Regular.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Regular.ttf'),
          path.join(process.cwd(), 'server/assets/fonts/Mandali-Regular.ttf'),
          '/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf',
        ];
        const candidateBold = [
          path.join(process.cwd(), 'server/assets/fonts/NotoSansTelugu-Bold.ttf'),
          path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts/NotoSansTelugu-Bold.ttf'),
          path.join(process.cwd(), 'server/assets/fonts/Ramabhadra-Bold.ttf'),
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
        doc.font(fontBold).fontSize(18).fillColor('#1e3a8a')
          .text('కాల్‌బ్రిడ్జ్ AI — ప్రజా సర్వే ట్రాన్స్‌క్రిప్ట్ నివేదిక', { align: 'left' });

        doc.font(fontRegular).fontSize(9).fillColor('#64748b')
          .text('CallBridge AI — Public Survey Citizen Response & Full Dialogue Report');
        doc.moveDown(0.5);

        // Divider
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.8);

        // Metadata Grid
        const startY = doc.y;
        doc.rect(40, startY, 515, 75).fillAndStroke('#f8fafc', '#e2e8f0');

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text(`Respondent: ${job.contactName || 'Citizen'}`, 50, startY + 10);
        doc.font(fontRegular).fontSize(9).fillColor('#334155');
        doc.text(`Phone: ${job.contactPhone || '—'}`, 50, startY + 25);
        doc.text(`Call ID: ${job.id || '—'}`, 50, startY + 40);
        doc.text(`Date & Time: ${job.createdAt ? new Date(job.createdAt).toLocaleString() : new Date().toLocaleString()}`, 50, startY + 55);

        doc.font(fontRegular).fontSize(9).fillColor('#334155');
        doc.text(`Duration: ${job.durationSeconds || 0} seconds`, 320, startY + 10);
        doc.text(`Status: ${String(job.status || 'completed').replace(/_/g, ' ').toUpperCase()}`, 320, startY + 25);
        const ansCount = job.surveyAnswers ? Object.keys(job.surveyAnswers).length : 0;
        doc.text(`Answers Recorded: ${ansCount}`, 320, startY + 40);
        if (job.callbackDetails?.scheduledTimestamp || job.callbackScheduledAt) {
          doc.text(`Callback: ${job.callbackDetails?.requestedDate || ''} ${job.callbackDetails?.requestedTime || ''}`, 320, startY + 55);
        }

        doc.y = startY + 85;
        doc.moveDown(0.5);

        // Section 1: Survey Responses Summary (if available)
        const rawAnswers = job.surveyAnswers || job.surveyState?.answers;
        if (rawAnswers && Object.keys(rawAnswers).length > 0) {
          checkPageBreak(50);
          doc.font(fontBold).fontSize(12).fillColor('#1e3a8a')
            .text('నమోదైన సర్వే సమాధానాలు (Recorded Survey Answers)');
          doc.moveDown(0.3);

          for (const [qKey, val] of Object.entries(rawAnswers)) {
            checkPageBreak(35);
            const valObj = val as any;
            const qTitle = typeof valObj === 'object' && valObj?.questionText ? valObj.questionText : `ప్రశ్న (${qKey})`;
            const ansText = typeof valObj === 'string' ? valObj : (valObj?.answerText || valObj?.text || (typeof valObj === 'object' ? JSON.stringify(valObj) : String(valObj)));

            doc.font(fontBold).fontSize(9).fillColor('#0f172a')
              .text(`${qTitle}:`, { continued: true });
            doc.font(fontRegular).fontSize(9).fillColor('#1e293b')
              .text(` ${ansText}`);

            if (valObj?.followUps && Array.isArray(valObj.followUps) && valObj.followUps.length > 0) {
              for (const fu of valObj.followUps) {
                if (fu?.question && fu?.answer) {
                  checkPageBreak(25);
                  doc.font(fontBold).fontSize(8).fillColor('#475569')
                    .text(`   • తదుపరి ప్రశ్న: ${fu.question}`, { continued: true });
                  doc.font(fontRegular).fontSize(8).fillColor('#334155')
                    .text(`  —  ${fu.answer}`);
                }
              }
            }
            doc.moveDown(0.3);
          }
          doc.moveDown(0.5);
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
          doc.moveDown(0.8);
        }

        // Section 2: Chronological Dialogue
        checkPageBreak(50);
        doc.font(fontBold).fontSize(12).fillColor('#1e3a8a')
          .text('పూర్తి సంభాషణ వివరాలు (Full Chronological Dialogue)');
        doc.moveDown(0.5);

        // Gather turns across all candidate collections to guarantee the most complete dialogue
        let turns: any[] = [];
        if (Array.isArray(job.surveyState?.transcripts) && job.surveyState.transcripts.length > turns.length) {
          turns = job.surveyState.transcripts;
        }
        if (Array.isArray(job.transcript) && job.transcript.length > turns.length) {
          turns = job.transcript;
        }
        if (Array.isArray(job.originalTranscript) && job.originalTranscript.length > turns.length) {
          turns = job.originalTranscript;
        }

        // If turn list is empty but survey answers exist, reconstruct full chronological dialogue
        if (turns.length === 0 && rawAnswers && Object.keys(rawAnswers).length > 0) {
          turns = [];
          // Introduction
          turns.push({
            role: 'agent',
            speaker: 'agent',
            text: 'నమస్కారం అండి! ప్రజా సమస్యలపై ఒక చిన్న సర్వే నిర్వహిస్తున్నాము. మీ అభిప్రాయం మాకు ఎంతో విలువైనది.',
            turnType: 'greeting',
          });

          for (const [qKey, val] of Object.entries(rawAnswers)) {
            const valObj = val as any;
            const qTitle = typeof valObj === 'object' && valObj?.questionText ? valObj.questionText : `ప్రశ్న (${qKey})`;
            const ansText = typeof valObj === 'string' ? valObj : (valObj?.answerText || valObj?.text || String(valObj));
            const qOrder = valObj?.questionOrder;

            turns.push({
              role: 'agent',
              speaker: 'agent',
              text: qTitle,
              turnType: 'main_question',
              questionOrder: qOrder,
            });

            if (ansText) {
              turns.push({
                role: 'respondent',
                speaker: 'respondent',
                text: ansText,
                turnType: 'answer',
                questionOrder: qOrder,
              });
            }

            if (valObj?.followUps && Array.isArray(valObj.followUps)) {
              for (const fu of valObj.followUps) {
                if (fu?.question) {
                  turns.push({
                    role: 'agent',
                    speaker: 'agent',
                    text: fu.question,
                    turnType: 'follow_up',
                    questionOrder: qOrder,
                  });
                }
                if (fu?.answer) {
                  turns.push({
                    role: 'respondent',
                    speaker: 'respondent',
                    text: fu.answer,
                    turnType: 'clarification_response',
                    questionOrder: qOrder,
                  });
                }
              }
            }
          }

          // Closing message
          turns.push({
            role: 'agent',
            speaker: 'agent',
            text: 'అలాగేనండి. మా సర్వేలో పాల్గొని మీ అమూల్యమైన అభిప్రాయాలను పంచుకున్నందుకు చాలా ధన్యవాదాలు. నమస్కారం.',
            turnType: 'closing',
          });
        }

        if (turns.length === 0) {
          doc.font(fontRegular).fontSize(9).fillColor('#64748b')
            .text('No transcript records available for this call.');
        } else {
          for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const isAgent = turn.role === 'agent' || (turn as any).speaker === 'agent';
            const speakerTitle = isAgent
              ? 'AI Voice Agent (కాల్‌బ్రిడ్జ్ వాయిస్ అసిస్టెంట్)'
              : 'Respondent (పౌరుడు / ప్రతిస్పందనకర్త)';

            checkPageBreak(50);

            let badge = '';
            if (turn.turnType === 'main_question' || turn.questionOrder) {
              badge = `[ప్రశ్న ${turn.questionOrder || ''}]`;
            } else if (turn.turnType === 'follow_up' || turn.turnType === 'clarification') {
              badge = '[తదుపరి ప్రశ్న / వివరణ]';
            } else if (turn.turnType === 'greeting') {
              badge = '[ప్రారంభ సంభాషణ]';
            } else if (turn.turnType === 'answer') {
              badge = '[సమాధానం]';
            } else if (turn.turnType === 'clarification_response') {
              badge = '[వివరణ సమాధానం]';
            } else if (turn.turnType === 'closing') {
              badge = '[ముగింపు సందేశం]';
            } else if (turn.turnType === 'callback') {
              badge = '[కాల్‌బ్యాక్ అభ్యర్థన]';
            }

            const timeStr = turn.timestamp
              ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '';

            // Clean single-call speaker header avoids fontkit continuation baseline overlap
            doc.font(fontBold).fontSize(9.5)
              .fillColor(isAgent ? '#1d4ed8' : '#047857');
            const speakerHeader = `${speakerTitle}${badge ? `  ${badge}` : ''}${timeStr ? `   •   ${timeStr}` : ''}`;
            doc.text(speakerHeader, { lineGap: 3 });

            // Dialogue content with 5pt line gap to ensure Telugu conjuncts (vattulu) never collide
            doc.font(fontRegular).fontSize(9.5).fillColor('#1e293b')
              .text(turn.text || '—', { indent: 14, lineGap: 5 });

            // Check if this turn was revised
            const revision = Array.isArray(job.transcriptRevisions)
              ? job.transcriptRevisions.find((r: any) => r.turnIndex === i || r.turnId === (turn as any).turnId)
              : null;
            if (revision) {
              doc.font(fontRegular).fontSize(8).fillColor('#d97706')
                .text(`[సవరింపబడింది: ${revision.editor || 'Admin'}  •  కారణం: ${revision.reason || 'Correction'}]`, { indent: 14, lineGap: 2 });
            }

            doc.moveDown(0.4);
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
