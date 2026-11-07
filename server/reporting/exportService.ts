import { callbridgeStorage } from '../storage/callbridgeStorage.ts';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import fs from 'fs';

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

        // Header
        doc.fontSize(18).fillColor('#1e293b').text(event?.name || 'Contact Directory', { align: 'left' });
        doc.fontSize(9).fillColor('#64748b').text(`Event Type: ${(event?.type || '').replace('_', ' ').toUpperCase()} | Total Contacts: ${contacts.length} | Export Date: ${new Date().toLocaleDateString()}`);
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
        doc.fontSize(8).fillColor('#1e293b');
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

    const p1Count = sourceAgg.politicalCampaign?.keypad1Count ?? campaign?.keypad1Count ?? 0;
    const p2Count = sourceAgg.politicalCampaign?.keypad2Count ?? campaign?.keypad2Count ?? 0;

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

    // Political Campaign: Keypad percentages MUST have answeredCalls (callsAttended) as denominator
    const pressed1Count = p1Count;
    const pressed1Percent = callsAttended > 0 ? Math.round((pressed1Count / callsAttended) * 100) : 0;
    const pressed2Count = p2Count;
    const pressed2Percent = callsAttended > 0 ? Math.round((pressed2Count / callsAttended) * 100) : 0;
    const noInputCount = Math.max(0, callsAttended - (pressed1Count + pressed2Count));
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
        totalValidDtmf: pressed1Count + pressed2Count,
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
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const teluguRegular = '/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf';
        const teluguBold = '/usr/share/fonts/truetype/noto/NotoSansTelugu-Bold.ttf';
        const hasTelugu = fs.existsSync(teluguRegular);
        const hasTeluguBold = fs.existsSync(teluguBold);

        if (hasTelugu) {
          doc.registerFont('Telugu', teluguRegular);
        }
        if (hasTeluguBold) {
          doc.registerFont('TeluguBold', teluguBold);
        }

        const fontRegular = hasTelugu ? 'Telugu' : 'Helvetica';
        const fontBold = hasTeluguBold ? 'TeluguBold' : (hasTelugu ? 'Telugu' : 'Helvetica-Bold');

        // Document Title
        doc.font(fontBold).fontSize(18).fillColor('#1e3a8a')
          .text('కాల్‌బ్రిడ్జ్ AI — ప్రజా సర్వే ట్రాన్స్‌క్రిప్ట్ నివేదిక', { align: 'left' });

        doc.font('Helvetica').fontSize(9).fillColor('#64748b')
          .text('CallBridge AI — Public Survey Citizen Response & Dialogue Report');
        doc.moveDown(0.5);

        // Divider
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.8);

        // Metadata Grid
        const startY = doc.y;
        doc.rect(40, startY, 515, 75).fillAndStroke('#f8fafc', '#e2e8f0');

        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text(`Respondent: ${job.contactName || 'Citizen'}`, 50, startY + 10);
        doc.font('Helvetica').fontSize(9).fillColor('#334155');
        doc.text(`Phone: ${job.contactPhone || '—'}`, 50, startY + 25);
        doc.text(`Call ID: ${job.id || '—'}`, 50, startY + 40);
        doc.text(`Date & Time: ${job.createdAt ? new Date(job.createdAt).toLocaleString() : new Date().toLocaleString()}`, 50, startY + 55);

        doc.font('Helvetica').fontSize(9).fillColor('#334155');
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
          doc.font(fontBold).fontSize(12).fillColor('#1e3a8a')
            .text('నమోదైన సర్వే సమాధానాలు (Recorded Survey Answers)');
          doc.moveDown(0.3);

          for (const [qKey, val] of Object.entries(rawAnswers)) {
            if (doc.y > 740) doc.addPage();
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
        doc.font(fontBold).fontSize(12).fillColor('#1e3a8a')
          .text('పూర్తి సంభాషణ వివరాలు (Full Chronological Dialogue)');
        doc.moveDown(0.5);

        const turns = Array.isArray(job.transcript) && job.transcript.length > 0
          ? job.transcript
          : Array.isArray(job.originalTranscript)
          ? job.originalTranscript
          : [];

        if (turns.length === 0) {
          doc.font('Helvetica').fontSize(9).fillColor('#64748b')
            .text('No transcript records available for this call.');
        } else {
          for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const isAgent = turn.role === 'agent' || (turn as any).speaker === 'agent';
            const speakerTitle = isAgent
              ? 'AI Voice Agent (కాల్‌బ్రిడ్జ్ వాయిస్ అసిస్టెంట్)'
              : 'Respondent (పౌరుడు / ప్రతిస్పందనకర్త)';

            if (doc.y > 720) doc.addPage();

            // Speaker badge header
            doc.font(fontBold).fontSize(9)
              .fillColor(isAgent ? '#2563eb' : '#047857')
              .text(speakerTitle, { continued: true });

            let badge = '';
            if (turn.turnType === 'main_question' || turn.questionOrder) {
              badge = ` [ప్రశ్న ${turn.questionOrder || ''}]`;
            } else if (turn.turnType === 'follow_up') {
              badge = ' [తదుపరి ప్రశ్న]';
            } else if (turn.turnType === 'greeting') {
              badge = ' [ప్రారంభం]';
            } else if (turn.turnType === 'callback') {
              badge = ' [కాల్‌బ్యాక్]';
            } else if (turn.turnType === 'closing') {
              badge = ' [ముగింపు]';
            }

            if (badge) {
              doc.font(fontBold).fontSize(8).fillColor('#6366f1')
                .text(` ${badge}`, { continued: true });
            }

            if (turn.timestamp) {
              doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
                .text(`  •  ${new Date(turn.timestamp).toLocaleTimeString()}`);
            } else {
              doc.text('');
            }

            // Dialogue content
            doc.font(fontRegular).fontSize(9).fillColor('#1e293b')
              .text(turn.text || '—', { indent: 12, lineGap: 2 });

            // Check if this turn was revised
            const revision = Array.isArray(job.transcriptRevisions)
              ? job.transcriptRevisions.find((r: any) => r.turnIndex === i || r.turnId === (turn as any).turnId)
              : null;
            if (revision) {
              doc.font('Helvetica').fontSize(7.5).fillColor('#d97706')
                .text(`[Revised by ${revision.editor || 'Admin'} on ${new Date(revision.editedAt).toLocaleDateString()} — Reason: ${revision.reason || 'Correction'}]`, { indent: 12 });
            }

            doc.moveDown(0.6);
          }
        }

        // Footer
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
          .text(`Generated by CallBridge AI Platform  •  ${new Date().toISOString()}`, 40, 800, { align: 'center', width: 515 });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
