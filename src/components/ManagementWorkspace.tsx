import React, { useState, useEffect } from 'react';
import {
  User,
  Building,
  Mail,
  Shield,
  Bell,
  Globe,
  Clock,
  CheckCircle2,
  AlertCircle,
  Save,
  Copy,
  Check,
  Headphones,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { TenantUser } from '../types/callbridge';

interface ManagementWorkspaceProps {
  currentTenant: TenantUser | null;
  tenants: TenantUser[];
  onSelectTenant: (tenant: TenantUser) => void;
  onRefreshTenants: () => void;
  onBackToDashboard: () => void;
}

export function ManagementWorkspace({
  currentTenant,
  tenants,
  onSelectTenant,
  onRefreshTenants,
  onBackToDashboard,
}: ManagementWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<'account' | 'preferences' | 'notifications' | 'security' | 'support'>('account');

  // Account State
  const [name, setName] = useState(currentTenant?.name || 'Rishi');
  const [organization, setOrganization] = useState(currentTenant?.organization || 'CallBridge AI');
  const [email, setEmail] = useState(currentTenant?.email || 'client_001@callbridge.ai');
  const [tenantId] = useState(currentTenant?.id || 'client_001');

  // General Preferences
  const [defaultLanguage, setDefaultLanguage] = useState<'te' | 'hi' | 'en'>('te');
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST +5:30)');
  const [maxRetries, setMaxRetries] = useState<number>(2);
  const [callingWindowStart, setCallingWindowStart] = useState('09:00');
  const [callingWindowEnd, setCallingWindowEnd] = useState('20:00');

  // Notification Preferences
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(true);
  const [notifyOnCreditLow, setNotifyOnCreditLow] = useState(true);
  const [notifyDailyDigest, setNotifyDailyDigest] = useState(false);

  // Security & Compliance
  const [enforceConsent, setEnforceConsent] = useState(true);
  const [auditLoggingEnabled, setAuditLoggingEnabled] = useState(true);

  // Feedback State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Billing plan status
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('Free Tier');

  useEffect(() => {
    if (currentTenant) {
      setName(currentTenant.name || '');
      setOrganization(currentTenant.organization || '');
      setEmail(currentTenant.email || '');

      const prefs = (currentTenant as any).preferences;
      if (prefs) {
        if (prefs.defaultLanguage) setDefaultLanguage(prefs.defaultLanguage);
        if (prefs.timezone) setTimezone(prefs.timezone);
        if (prefs.maxRetries !== undefined) setMaxRetries(prefs.maxRetries);
        if (prefs.callingWindowStart) setCallingWindowStart(prefs.callingWindowStart);
        if (prefs.callingWindowEnd) setCallingWindowEnd(prefs.callingWindowEnd);
        if (prefs.notifyOnCompletion !== undefined) setNotifyOnCompletion(prefs.notifyOnCompletion);
        if (prefs.notifyOnCreditLow !== undefined) setNotifyOnCreditLow(prefs.notifyOnCreditLow);
        if (prefs.notifyDailyDigest !== undefined) setNotifyDailyDigest(prefs.notifyDailyDigest);
        if (prefs.enforceConsent !== undefined) setEnforceConsent(prefs.enforceConsent);
      }
    }

    // Load active subscription plan
    fetch(`/api/callbridge/billing/status?clientId=${currentTenant?.id || 'client_001'}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.subscription?.plan) {
          const p = data.subscription.plan;
          setSubscriptionPlan(p === 'max_pro' ? 'Max Pro (Enterprise)' : p === 'pro' ? 'Pro Plan' : 'Free Tier');
        }
      })
      .catch(() => null);
  }, [currentTenant]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(tenantId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const clientId = currentTenant?.id || 'client_001';
      const res = await fetch(`/api/callbridge/tenants/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          organization: organization.trim(),
          email: email.trim(),
          preferences: {
            defaultLanguage,
            timezone,
            maxRetries,
            callingWindowStart,
            callingWindowEnd,
            notifyOnCompletion,
            notifyOnCreditLow,
            notifyDailyDigest,
            enforceConsent,
            auditLoggingEnabled,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSaveSuccess(true);
      onRefreshTenants();
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setSaveError(err.message || 'Error updating settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2.5">
            <User className="w-5 h-5 text-blue-600" />
            <span>Account &amp; Platform Settings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your organization profile, calling preferences, automated retry policies, and notification rules.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Save Feedback Alerts */}
      {saveSuccess && (
        <div className="flex items-center space-x-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Settings updated and persisted successfully across your CallBridge AI workspace.</span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center space-x-2 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm h-fit">
          <button
            onClick={() => setActiveSection('account')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'account'
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Account Profile</span>
          </button>

          <button
            onClick={() => setActiveSection('preferences')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'preferences'
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>General Preferences</span>
          </button>

          <button
            onClick={() => setActiveSection('notifications')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'notifications'
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Notifications</span>
          </button>

          <button
            onClick={() => setActiveSection('security')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'security'
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security &amp; Privacy</span>
          </button>

          <button
            onClick={() => setActiveSection('support')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'support'
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>Help &amp; Support</span>
          </button>
        </div>

        {/* Content Pane */}
        <div className="md:col-span-3 space-y-6">
          {/* SECTION 1: ACCOUNT PROFILE */}
          {activeSection === 'account' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>Account Profile &amp; Identity</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your primary organization and contact details used across campaign dispatches.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Enter your name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Organization / Brand</label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Organization or Candidate Name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Account Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="name@organization.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Active SaaS Plan</label>
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="font-bold text-blue-700">{subscriptionPlan}</span>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Active Subscription</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-slate-600">Client Account ID:</span>
                  <span className="font-mono text-xs font-bold text-slate-800 ml-2 bg-slate-100 px-2 py-0.5 rounded">
                    {tenantId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium cursor-pointer"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId ? 'Copied ID' : 'Copy Account ID'}</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 2: GENERAL PREFERENCES */}
          {activeSection === 'preferences' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>General Calling &amp; Outreach Preferences</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure default regional language, permitted calling hours, and retry rules.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Default Outreach Language</label>
                  <select
                    value={defaultLanguage}
                    onChange={(e) => setDefaultLanguage(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="te">తెలుగు (Telugu - Primary)</option>
                    <option value="hi">हिंदी (Hindi)</option>
                    <option value="en">English (Indian Accent)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Operational Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 text-slate-700"
                    readOnly
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Automated Retries on No-Answer</label>
                  <select
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value={1}>1 Retry attempt</option>
                    <option value={2}>2 Retry attempts (Recommended)</option>
                    <option value={3}>3 Retry attempts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Permitted Outbound Calling Hours (IST)</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="time"
                      value={callingWindowStart}
                      onChange={(e) => setCallingWindowStart(e.target.value)}
                      className="w-1/2 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="time"
                      value={callingWindowEnd}
                      onChange={(e) => setCallingWindowEnd(e.target.value)}
                      className="w-1/2 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: NOTIFICATIONS */}
          {activeSection === 'notifications' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <span>Notification Preferences</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose which alerts and email digests you wish to receive.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Campaign Completion Notifications</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Receive an alert when a sequential calling batch has contacted all queued directory numbers.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnCompletion}
                      onChange={(e) => setNotifyOnCompletion(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Low Calling Duration Credit Warnings</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Notify immediately when remaining calling duration drops below 15 minutes.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnCreditLow}
                      onChange={(e) => setNotifyOnCreditLow(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Daily Performance Digest</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Receive an end-of-day summary of completed calls, citizen feedback, and RSVP confirmations.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyDailyDigest}
                      onChange={(e) => setNotifyDailyDigest(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: SECURITY & DATA PRIVACY */}
          {activeSection === 'security' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Security, Cryptography &amp; Compliance</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Industry-grade tenant isolation, carrier telephony encryption, and consent policies.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start space-x-3">
                  <Lock className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-emerald-900">Carrier Telephony &amp; Audio Encryption</div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      All telephone audio and API payloads are transmitted with TLS 1.3 and stored with AES-256 at rest.
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Strict Consent Verification</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Automatically skip contacts whose consent status is marked 'unconfirmed' or 'revoked'.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enforceConsent}
                      onChange={(e) => setEnforceConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Multi-Tenant Cryptographic Isolation</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Tenant contact directories, call logs, and voice models are strictly segregated per account.
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                    Enforced
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: HELP & SUPPORT */}
          {activeSection === 'support' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Headphones className="w-4 h-4 text-blue-600" />
                  <span>Help, Documentation &amp; Technical Support</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Need assistance with telephony routing, custom voice tuning, or sequential calling?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                  <div className="text-xs font-bold text-slate-800">Technical Support Email</div>
                  <div className="text-xs text-blue-600 font-mono">support@callbridge.ai</div>
                  <div className="text-[11px] text-slate-500">Dedicated assistance for enterprise telephony inquiries.</div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                  <div className="text-xs font-bold text-slate-800">System Telephony Status</div>
                  <div className="flex items-center space-x-1.5 text-xs text-emerald-600 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All Telephony Systems Operational</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Vapi &amp; ElevenLabs neural TTS channels healthy.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
