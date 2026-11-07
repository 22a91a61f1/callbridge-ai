import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  CheckCircle2,
  PhoneOff,
  Clock,
  Download,
  PhoneForwarded,
  Heart,
  Vote,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';

interface AnalyticsViewProps {
  eventId: string;
  eventName?: string;
  eventType?: string;
  clientId?: string;
}

export function AnalyticsView({
  eventId,
  eventName,
  eventType = 'public_survey',
  clientId,
}: AnalyticsViewProps) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/analytics?t=${Date.now()}`);
      const data = await res.json();
      if (data.analytics) {
        setAnalytics(data.analytics);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.warn('Analytics fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 2500);
    return () => clearInterval(interval);
  }, [eventId, clientId]);

  const resolvedEventType = analytics?.moduleType || eventType;

  // 1. Core Telephony Metrics
  const totalCallsMade = analytics?.essentialMetrics?.totalCallsMade ?? analytics?.essentialMetrics?.callsInitiated ?? 0;
  const callsAttended =
    analytics?.moduleSpecificMetrics?.marriageRsvp?.answeredCalls ??
    analytics?.metrics?.answeredCalls ??
    analytics?.essentialMetrics?.callsAttended ??
    0;
  const attendedPercent = analytics?.essentialMetrics?.attendedPercent ?? (totalCallsMade > 0 ? Math.round((callsAttended / totalCallsMade) * 100) : 0);
  const callsNotAttended = analytics?.essentialMetrics?.callsNotAttended ?? 0;
  const notAttendedPercent = analytics?.essentialMetrics?.notAttendedPercent ?? (totalCallsMade > 0 ? Math.round((callsNotAttended / totalCallsMade) * 100) : 0);
  const callsFailedOrBusy = analytics?.essentialMetrics?.callsFailedOrBusy ?? ((analytics?.essentialMetrics?.callsRejected ?? 0) + (analytics?.essentialMetrics?.callsFailed ?? 0));
  const failedOrBusyPercent = analytics?.essentialMetrics?.failedOrBusyPercent ?? (totalCallsMade > 0 ? Math.round((callsFailedOrBusy / totalCallsMade) * 100) : 0);
  const callsRejected = analytics?.essentialMetrics?.callsRejected ?? 0;
  const rejectedPercent = analytics?.essentialMetrics?.rejectedPercent ?? 0;
  const finishedCalls =
    analytics?.essentialMetrics?.finishedCalls ??
    analytics?.metrics?.finishedCalls ??
    analytics?.moduleSpecificMetrics?.politicalCampaign?.finishedCalls ??
    (callsAttended + callsNotAttended + callsFailedOrBusy);

  // 2. Module Specific Metrics
  const politicalMetrics = analytics?.moduleSpecificMetrics?.politicalCampaign;
  const marriageMetrics = analytics?.moduleSpecificMetrics?.marriageRsvp;
  const surveyMetrics = analytics?.moduleSpecificMetrics?.publicSurvey;

  const isPolitical = resolvedEventType === 'political_campaign' || resolvedEventType === 'political_survey';

  const formatMarriagePercent = (count: number, denom: number, fallback: number = 0) => {
    if (!denom || denom <= 0) return '0';
    const val = (count / denom) * 100;
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header with Title & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">
              {eventName ? `${eventName} — Analytics` : 'Campaign Performance Analytics'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              {resolvedEventType.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
            <span>Anonymous aggregate metrics with backend-enforced data privacy retention.</span>
            {lastRefreshed && (
              <span className="text-slate-400 font-mono text-[10px]">
                (Updated: {lastRefreshed})
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href={`/api/callbridge/events/${eventId}/export/call-history.csv`}
            download
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Summary (CSV)</span>
          </a>

          <a
            href={`/api/callbridge/events/${eventId}/export/contacts.csv`}
            download
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Contacts (CSV)</span>
          </a>
        </div>
      </div>

      {/* POLITICAL CAMPAIGN METRICS */}
      {isPolitical ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* 1. Calls Initiated */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Calls Initiated
              </span>
              <PhoneForwarded className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-extrabold text-slate-800">{totalCallsMade}</div>
            <div className="text-xs text-slate-500 font-medium">Total initiated calls</div>
          </div>

          {/* 2. Finished Calls */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Finished Calls
              </span>
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-extrabold text-slate-800">{finishedCalls}</div>
            <div className="text-xs text-slate-500 font-medium">Completed provider calls</div>
          </div>

          {/* 3. Answered % */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Answered %
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-emerald-600">{attendedPercent}%</span>
              <span className="text-xs font-semibold text-slate-500">({callsAttended} calls)</span>
            </div>
            <div className="text-xs text-emerald-700 font-medium">Denominator: Calls Initiated</div>
          </div>

          {/* 3. Unanswered % */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Unanswered %
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-amber-600">{notAttendedPercent}%</span>
              <span className="text-xs font-semibold text-slate-500">({callsNotAttended} calls)</span>
            </div>
            <div className="text-xs text-amber-700 font-medium">Denominator: Calls Initiated</div>
          </div>

          {/* 4. Busy / Failed % */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Busy / Failed %
              </span>
              <PhoneOff className="w-4 h-4 text-rose-600" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-rose-600">{failedOrBusyPercent}%</span>
              <span className="text-xs font-semibold text-slate-500">({callsFailedOrBusy} calls)</span>
            </div>
            <div className="text-xs text-rose-700 font-medium">Denominator: Calls Initiated</div>
          </div>

          {/* 5. Pressed 1 % */}
          {(() => {
            const p1Count = politicalMetrics?.pressed1Count ?? analytics?.essentialMetrics?.pressed1Count ?? analytics?.politicalCampaign?.keypad1Count ?? 0;
            const p1Percent = callsAttended > 0 ? Math.round((p1Count / callsAttended) * 100) : 0;
            return (
              <div className="p-5 rounded-2xl bg-white border border-purple-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-purple-400 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-800">
                    Pressed 1 %
                  </span>
                  <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-extrabold text-xs flex items-center justify-center">
                    1
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-purple-700">{p1Percent}%</span>
                  <span className="text-xs font-semibold text-slate-500">({p1Count} calls)</span>
                </div>
                <div className="text-xs text-purple-700 font-semibold">Denominator: Answered Calls</div>
              </div>
            );
          })()}

          {/* 6. Pressed 2 % */}
          {(() => {
            const p2Count = politicalMetrics?.pressed2Count ?? analytics?.essentialMetrics?.pressed2Count ?? analytics?.politicalCampaign?.keypad2Count ?? 0;
            const p2Percent = callsAttended > 0 ? Math.round((p2Count / callsAttended) * 100) : 0;
            return (
              <div className="p-5 rounded-2xl bg-white border border-indigo-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-indigo-400 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                    Pressed 2 %
                  </span>
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center">
                    2
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-indigo-700">{p2Percent}%</span>
                  <span className="text-xs font-semibold text-slate-500">({p2Count} calls)</span>
                </div>
                <div className="text-xs text-indigo-700 font-semibold">Denominator: Answered Calls</div>
              </div>
            );
          })()}
        </div>
      ) : resolvedEventType === 'public_survey' ? (
        /* PUBLIC SURVEY: EXACT 6 SIMPLE OPERATIONAL CARDS ONLY (NO PERCENTAGES, NO RSVP) */
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Total Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Total Calls
                </span>
                <PhoneForwarded className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-3xl font-extrabold text-slate-800">
                {analytics?.publicSurveyCounters?.totalCalls ?? totalCallsMade}
              </div>
              <div className="text-xs text-slate-500 font-medium">All queued and dialed survey calls</div>
            </div>

            {/* 2. Answered Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Answered Calls
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-3xl font-extrabold text-emerald-600">
                {analytics?.publicSurveyCounters?.answeredCalls ?? callsAttended}
              </div>
              <div className="text-xs text-emerald-700 font-medium">Calls answered by citizen</div>
            </div>

            {/* 3. Unanswered Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Unanswered Calls
                </span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-3xl font-extrabold text-amber-600">
                {analytics?.publicSurveyCounters?.unansweredCalls ?? callsNotAttended}
              </div>
              <div className="text-xs text-amber-700 font-medium">No answer, busy, or timeout</div>
            </div>

            {/* 4. Disconnected Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  Disconnected Calls
                </span>
                <PhoneOff className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-3xl font-extrabold text-rose-600">
                {analytics?.publicSurveyCounters?.disconnectedCalls ?? (analytics?.essentialMetrics?.incompleteSurveyCalls ?? 0)}
              </div>
              <div className="text-xs text-rose-700 font-medium">Disconnected / interrupted midway</div>
            </div>

            {/* 5. Completed Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Completed Calls
                </span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-3xl font-extrabold text-blue-600">
                {analytics?.publicSurveyCounters?.completedCalls ?? (analytics?.essentialMetrics?.completedSurveyCalls ?? 0)}
              </div>
              <div className="text-xs text-blue-700 font-medium">All survey questions completed</div>
            </div>

            {/* 6. Callback Scheduled Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  Callback Scheduled Calls
                </span>
                <PhoneForwarded className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-3xl font-extrabold text-purple-600">
                {analytics?.publicSurveyCounters?.callbackScheduledCalls ?? (analytics?.moduleSpecificMetrics?.publicSurvey?.callbackScheduledCalls ?? 0)}
              </div>
              <div className="text-xs text-purple-700 font-medium">Citizen scheduled call at later time</div>
            </div>
          </div>
        </div>
      ) : (
        /* MARRIAGE EVENT LAYOUT */
        <div className="space-y-6">
          {/* 4 Core Telephony Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Calls Made */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Total Calls Made
                </span>
                <PhoneForwarded className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-3xl font-extrabold text-slate-800">{totalCallsMade}</div>
              <div className="text-xs text-slate-500 font-medium">Outbound telephony dispatches</div>
            </div>

            {/* Answered Calls & Answered % */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Answered Calls
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-emerald-600">{callsAttended}</span>
                <span className="text-sm font-bold text-emerald-700">({attendedPercent}%)</span>
              </div>
              <div className="text-xs text-emerald-700 font-medium">Answered calls</div>
            </div>

            {/* Unanswered Calls & Unanswered % */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Calls Not Attended
                </span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-amber-600">{callsNotAttended}</span>
                <span className="text-sm font-bold text-amber-700">({notAttendedPercent}%)</span>
              </div>
              <div className="text-xs text-amber-700 font-medium">Unanswered, busy, or timeout</div>
            </div>

            {/* Finished Calls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Finished Calls
                </span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-3xl font-extrabold text-slate-800">{finishedCalls}</div>
              <div className="text-xs text-slate-500 font-medium">Completed provider calls</div>
            </div>
          </div>

          {/* Marriage Event RSVP Distribution */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-100" />
                <h3 className="text-sm font-bold text-slate-800">
                  Marriage Event RSVP Distribution (Spoken Telugu Responses)
                </h3>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                100% Spoken Natural Classification (No Keypad)
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Guest responses are classified naturally from spoken Telugu into YES (Attending), NO (Not Attending), or MAYBE (Tentative), followed by polite conversational closing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Attending (YES) */}
              <div className="p-5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    YES — Attending
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]">
                    వస్తాము
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-emerald-700">
                    {marriageMetrics?.attendingCount ?? 0}
                  </span>
                  <span className="text-sm font-bold text-emerald-800">
                    ({formatMarriagePercent(marriageMetrics?.attendingCount ?? 0, callsAttended, marriageMetrics?.attendingPercent ?? 0)}%)
                  </span>
                </div>
                <p className="text-xs text-emerald-700 font-medium">
                  Guests confirmed attending the wedding celebration
                </p>
              </div>

              {/* Not Attending (NO) */}
              <div className="p-5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    NO — Not Attending
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                    రాలేము
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-rose-700">
                    {marriageMetrics?.notAttendingCount ?? 0}
                  </span>
                  <span className="text-sm font-bold text-rose-800">
                    ({formatMarriagePercent(marriageMetrics?.notAttendingCount ?? 0, callsAttended, marriageMetrics?.notAttendingPercent ?? 0)}%)
                  </span>
                </div>
                <p className="text-xs text-rose-700 font-medium">
                  Guests unable to attend; sent respectful blessings
                </p>
              </div>

              {/* Maybe (MAYBE) */}
              <div className="p-5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    MAYBE — Tentative
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px]">
                    చూద్దాం
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-amber-700">
                    {marriageMetrics?.maybeCount ?? marriageMetrics?.maybeAttendingCount ?? 0}
                  </span>
                  <span className="text-sm font-bold text-amber-800">
                    ({formatMarriagePercent(marriageMetrics?.maybeCount ?? marriageMetrics?.maybeAttendingCount ?? 0, callsAttended, marriageMetrics?.maybePercent ?? marriageMetrics?.maybeAttendingPercent ?? 0)}%)
                  </span>
                </div>
                <p className="text-xs text-amber-700 font-medium">
                  Guests tentatively planning or uncertain
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
