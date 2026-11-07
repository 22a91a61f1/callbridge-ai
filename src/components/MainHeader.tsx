import React from 'react';
import {
  PhoneCall,
  LayoutDashboard,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { EventRecord, TenantUser, UserSubscription } from '../types/callbridge';

interface MainHeaderProps {
  currentView: 'dashboard' | 'event' | 'upgrade' | string;
  selectedEvent: EventRecord | null;
  currentTenant: TenantUser | null;
  subscription?: UserSubscription | null;
  tenants: TenantUser[];
  onSelectTenant: (tenant: TenantUser) => void;
  onRefreshTenants: () => void;
  onNavigate: (view: 'dashboard' | 'event' | 'upgrade') => void;
  onOpenVoiceStudio?: () => void;
}

export function MainHeader({
  currentView,
  selectedEvent,
  subscription,
  onNavigate,
}: MainHeaderProps) {
  const planId = subscription?.planId || 'free';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Branding & Breadcrumbs */}
        <div className="flex items-center space-x-3">
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                CallBridge <span className="text-indigo-600">AI</span>
              </span>
              <span className="block text-[10px] text-slate-400 font-medium -mt-1">
                Enterprise Voice Telephony
              </span>
            </div>
          </div>

          {selectedEvent && currentView === 'event' && (
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 pl-3 border-l border-slate-200">
              <ChevronRight className="w-4 h-4" />
              <span className="font-semibold text-slate-700 truncate max-w-xs">{selectedEvent.name}</span>
            </div>
          )}
        </div>

        {/* Center Navigation Tabs: Strictly Dashboard and Upgrade only (No Settings) */}
        <nav className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'dashboard'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onNavigate('upgrade')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'upgrade'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Upgrade</span>
          </button>
        </nav>

        {/* Right Section: Verified Account Subscription Status Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-tight border ${
                planId === 'pro'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : planId === 'max_pro'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {planId === 'pro'
                ? 'Pro Plan'
                : planId === 'max_pro'
                ? 'Max Pro Plan'
                : 'Free Plan'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
