import React from 'react';
import {
  Vote,
  ClipboardList,
  Heart,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  EventRecord,
  UserSubscription,
  TenantUser,
} from '../types/callbridge';

interface DashboardCardsProps {
  events: EventRecord[];
  onSelectEvent: (event: EventRecord) => void;
  subscription: UserSubscription | null;
  currentTenant: TenantUser | null;
  onNavigateToUpgrade: () => void;
  onOpenModelPlayground?: () => void;
}

export function DashboardCards({
  events,
  onSelectEvent,
}: DashboardCardsProps) {
  // Exactly 3 Core Modules:
  // 1. Public Survey
  // 2. Political Campaign
  // 3. Marriage Event
  const publicSurveyEvent = events.find((e) => e.type === 'public_survey') || events[0];
  const politicalCampaignEvent = events.find((e) => e.type === 'political_campaign') || events[1];
  const marriageEvent = events.find((e) => e.type === 'marriage_event') || events[2];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-400/30">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Autonomous Outbound Voice Operations</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            CallBridge AI Voice Platform
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Enterprise outbound telephony with authentic ElevenLabs cloned voices, sequential queue calling, dynamic Telugu civic surveys, and interactive DTMF political outreach.
          </p>
        </div>
      </div>

      {/* The 3 Core Modules: Public Survey, Political Campaign, Marriage Event */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Application Modules</h2>
            <p className="text-xs text-slate-500">
              Select an operational workspace to manage questions, contacts, and sequential outbound calling.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Public Survey */}
          <div
            onClick={() => publicSurveyEvent && onSelectEvent(publicSurveyEvent)}
            className="group relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between cursor-pointer hover:border-blue-400 hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  Module 1
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Public Survey
                </h3>
                <p className="text-xs font-medium text-blue-600 mt-0.5">
                  10 Restored Civic Survey Questions &amp; Response Tracking
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Conduct structured civic amenities and municipal feedback surveys. Features the 10 canonical Telugu survey questions (drinking water, roads, electricity, sanitation) with add, edit, reorder, and enable/disable controls.
              </p>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700">Core Capabilities:</div>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span>10 Canonical Telugu civic questions restored</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span>Question management: Edit, Delete, Reorder, Enable</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span>Sequential outbound queue calling (1 at a time)</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span>Question-wise analytics and Excel/CSV export</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between text-blue-600 font-semibold text-xs group-hover:translate-x-1 transition-transform">
              <span>Open Public Survey Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* 2. Political Campaign */}
          <div
            onClick={() => politicalCampaignEvent && onSelectEvent(politicalCampaignEvent)}
            className="group relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between cursor-pointer hover:border-purple-400 hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-600 to-purple-700 text-white shadow-md">
                  <Vote className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                  Module 2
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                  Political Campaign
                </h3>
                <p className="text-xs font-medium text-purple-600 mt-0.5">
                  Constituency Voter Outreach &amp; Keypad Responses
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Deliver authorized candidate outreach messages directly to registered constituents with approved ElevenLabs cloned voices. Automatically captures interactive DTMF keypad feedback (Press 1 to support, 2 for callback).
              </p>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700">Core Capabilities:</div>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span>Authentic approved candidate voice cloning</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span>DTMF Keypad capture with instant hangup API</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span>Multi-format contact import (Excel, CSV, PDF, Paste)</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span>Real-time constituency feedback analytics</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between text-purple-600 font-semibold text-xs group-hover:translate-x-1 transition-transform">
              <span>Open Political Campaign Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* 3. Marriage Event */}
          <div
            onClick={() => marriageEvent && onSelectEvent(marriageEvent)}
            className="group relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between cursor-pointer hover:border-rose-400 hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-rose-700 text-white shadow-md">
                  <Heart className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  Module 3
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
                  Marriage Event
                </h3>
                <p className="text-xs font-medium text-rose-600 mt-0.5">
                  Personalized Wedding Invitations &amp; RSVP Tracking
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Deliver warm, personalized audio wedding invitations directly to guests and family. AI voice agent warmly conveys wedding details and captures RSVP attendance feedback (Attending, Not Attending, Maybe, Callback).
              </p>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700">Core Capabilities:</div>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span>Personalized bride &amp; groom wedding invitation scripts</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span>Telugu conversational speech delivery</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span>RSVP Attendance capture (Attending / Not Attending / Maybe)</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span>Sequential outbound calling &amp; contact queue</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between text-rose-600 font-semibold text-xs group-hover:translate-x-1 transition-transform">
              <span>Open Marriage Event Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
