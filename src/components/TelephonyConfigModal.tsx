import React, { useState, useEffect } from 'react';
import {
  X,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  Key,
  ShieldCheck,
  Save,
  RefreshCw,
  ExternalLink,
  Cpu,
  Sparkles,
} from 'lucide-react';

interface TelephonyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

interface TelephonyStatus {
  isConfigured?: boolean;
  vapiConfigured?: boolean;
  phoneNumberConfigured?: boolean;
  hasApiKey?: boolean;
  hasPhoneNumberId?: boolean;
  hasAssistantId?: boolean;
  hasElevenlabsCredential?: boolean;
  assistantConfigured?: boolean;
  openaiConfigured?: boolean;
  elevenlabsConfigured?: boolean;
  phoneNumberId?: string;
  assistantId?: string;
  elevenlabsCredentialId?: string;
}

export function TelephonyConfigModal({ isOpen, onClose, onConfigSaved }: TelephonyConfigModalProps) {
  const [status, setStatus] = useState<TelephonyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form fields
  const [privateApiKey, setPrivateApiKey] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [elevenlabsCredentialId, setElevenlabsCredentialId] = useState('');

  const fetchStatus = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/callbridge/telephony/config-status');
      const data = await res.json();
      const statusData = data.status || data;
      if (statusData) {
        setStatus(statusData);
        if (statusData.phoneNumberId) {
          setPhoneNumberId(statusData.phoneNumberId);
        }
        if (statusData.assistantId) {
          setAssistantId(statusData.assistantId);
        }
        if (statusData.elevenlabsCredentialId) {
          setElevenlabsCredentialId(statusData.elevenlabsCredentialId);
        }
      }
    } catch (err: any) {
      setErrorMsg('Failed to check telephony configuration status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/callbridge/telephony/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateApiKey: privateApiKey.trim() || undefined,
          phoneNumberId: phoneNumberId.trim() || undefined,
          assistantId: assistantId.trim() || undefined,
          elevenlabsCredentialId: elevenlabsCredentialId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update telephony configuration.');
      }

      setSuccessMsg(data.message || 'Telephony configuration saved successfully.');
      setPrivateApiKey('');
      await fetchStatus();
      if (onConfigSaved) onConfigSaved();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving telephony configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Telephony & Voice Orchestration</h2>
              <p className="text-[11px] text-slate-500">Vapi + Twilio + ElevenLabs + OpenAI Integration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Provider Readiness Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Vapi Private API</span>
                {status?.vapiConfigured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {status?.vapiConfigured
                  ? 'Active (Telephony ready)'
                  : 'Needs Vapi Private Key'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Twilio / Vapi Number</span>
                {status?.phoneNumberConfigured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono truncate">
                {status?.phoneNumberConfigured
                  ? status.phoneNumberId || 'Configured'
                  : 'Imported Twilio ID needed'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">ElevenLabs Cloned Voice</span>
                {status?.elevenlabsConfigured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {status?.elevenlabsConfigured ? 'Connected (Multilingual v2)' : 'Key missing'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">OpenAI Dialogue Model</span>
                {status?.openaiConfigured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {status?.openaiConfigured ? 'Connected (GPT-4o follow-up)' : 'Key missing'}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Vapi Private API Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={privateApiKey}
                  onChange={(e) => setPrivateApiKey(e.target.value)}
                  placeholder={status?.vapiConfigured ? '•••••••••••••••••••••••••••••••• (Configured)' : 'Enter Vapi Private Key...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-10"
                />
                <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Found in your Vapi Dashboard under Account Settings &gt; API Keys. Kept strictly on the backend.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Vapi Phone Number ID (Imported Twilio Number)
              </label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 81a95e2d-3fa4-460b-8d5b-xxxxxxxxxxxx"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                The Phone Number ID from Vapi Dashboard &gt; Phone Numbers (Twilio imported carrier number).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Vapi ElevenLabs Credential ID (Optional)</span>
                <span className="text-[10px] text-slate-400 font-normal">Auto-detected if already in Vapi</span>
              </label>
              <input
                type="text"
                value={elevenlabsCredentialId}
                onChange={(e) => setElevenlabsCredentialId(e.target.value)}
                placeholder="e.g. cred_xxxxxxxxxxxx or leave blank for auto-linking"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Found in Vapi Dashboard &gt; Provider Credentials &gt; 11labs. Allows Vapi to access your private cloned voices without &ldquo;voice not found&rdquo; errors.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Vapi Assistant ID (Optional)</span>
                <span className="text-[10px] text-slate-400 font-normal">Leave blank for dynamic ephemeral voice</span>
              </label>
              <input
                type="text"
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
                placeholder="Optional custom Assistant ID"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                CallBridge dynamically injects the customer's approved ElevenLabs voice clone and custom script overrides directly into outbound calls.
              </p>
            </div>

            {/* Notifications */}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
