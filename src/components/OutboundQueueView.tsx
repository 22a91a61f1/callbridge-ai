import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  Play,
  Pause,
  Square,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  PhoneOff,
  AlertTriangle,
  FileText,
  Sliders,
  ChevronRight,
  X,
  StopCircle,
  Trash2,
  Download,
  Edit2,
  Check,
  Loader2,
} from 'lucide-react';
import { CallJobRecord, CampaignRecord } from '../types/callbridge';

interface OutboundQueueViewProps {
  eventId: string;
  eventName: string;
  eventType?: string;
  voiceProfileId?: string;
}

export function OutboundQueueView({
  eventId,
  eventName,
  eventType,
  voiceProfileId,
}: OutboundQueueViewProps) {
  const [resolvedEventType, setResolvedEventType] = useState<string>(eventType || '');
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRecord | null>(null);
  const [callJobs, setCallJobs] = useState<CallJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [concurrency, setConcurrency] = useState(1); // Strict sequential calling by default
  const [campaignName, setCampaignName] = useState('Sequential Campaign Batch 1');
  const [selectedTranscriptJob, setSelectedTranscriptJob] = useState<CallJobRecord | null>(null);
  const [terminatingJobId, setTerminatingJobId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const [editingTurnIndex, setEditingTurnIndex] = useState<number | null>(null);
  const [editedTurnText, setEditedTurnText] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [isSavingTurn, setIsSavingTurn] = useState<boolean>(false);
  const [turnEditFeedback, setTurnEditFeedback] = useState<string | null>(null);

  const [isStartingSequence, setIsStartingSequence] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const handleDownloadPdf = async (jobId: string, phone?: string) => {
    try {
      setDownloadingPdfId(jobId);
      setActionFeedback('Generating Telugu transcript PDF report...');
      let res = await fetch(`/api/callbridge/calls/${jobId}/transcript.pdf`);
      if (!res.ok) {
        res = await fetch(`/calls/${jobId}/transcript.pdf`);
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setActionFeedback(`Could not download PDF: ${errJson.error || res.statusText || 'Record not found'}`);
        return;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) {
        setActionFeedback('Server returned an invalid response format instead of a PDF document.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safePhone = (phone || jobId).replace(/[^0-9a-zA-Z_-]/g, '_');
      a.download = `survey_transcript_${safePhone}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 5000);
      setActionFeedback('Transcript PDF downloaded successfully.');
    } catch (err: any) {
      setActionFeedback(`Failed to download PDF: ${err?.message || err}`);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleStartEditTurn = (idx: number, currentText: string) => {
    setEditingTurnIndex(idx);
    setEditedTurnText(currentText);
    setEditReason('Manual transcription correction');
    setTurnEditFeedback(null);
  };

  const handleSaveTurnEdit = async (jobId: string, idx: number) => {
    setIsSavingTurn(true);
    setTurnEditFeedback(null);
    try {
      const res = await fetch(`/api/callbridge/calls/${jobId}/transcript`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnIndex: idx,
          editedText: editedTurnText,
          reason: editReason || 'Manual transcription correction',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update transcript turn');
      }
      setSelectedTranscriptJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          transcript: data.transcript,
          transcriptRevisions: data.transcriptRevisions,
        };
      });
      setCallJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, transcript: data.transcript, transcriptRevisions: data.transcriptRevisions }
            : j
        )
      );
      setEditingTurnIndex(null);
      setTurnEditFeedback('Turn revised successfully. Original text preserved in audit history.');
    } catch (err: any) {
      setTurnEditFeedback(`Error: ${err.message}`);
    } finally {
      setIsSavingTurn(false);
    }
  };

  useEffect(() => {
    if (eventType) {
      setResolvedEventType(eventType);
    } else if (eventId && typeof eventId === 'string' && eventId.trim()) {
      fetch(`/api/callbridge/events/${encodeURIComponent(eventId.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.event?.type) setResolvedEventType(d.event.type);
        })
        .catch(() => null);
    }
  }, [eventId, eventType]);

  const isPoliticalCampaign = resolvedEventType === 'political_campaign' || resolvedEventType === 'political_survey';

  const fetchCampaigns = async () => {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/callbridge/events/${encodeURIComponent(eventId.trim())}/campaigns?t=${Date.now()}`);
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data && data.campaigns) {
        setCampaigns(data.campaigns);
        setSelectedCampaign((prev) => {
          if (!prev) return data.campaigns[0] || null;
          const fresh = data.campaigns.find((c: any) => c.id === prev.id);
          return fresh || prev;
        });
      }
    } catch (e) {
      console.warn('Error fetching campaigns:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchJobs = async (campaignId?: string | null) => {
    const validCampId = (campaignId || selectedCampaign?.id || '')?.trim();
    if (!eventId || typeof eventId !== 'string' || !eventId.trim() || !validCampId) {
      return;
    }
    try {
      const res = await fetch(`/api/callbridge/events/${encodeURIComponent(eventId.trim())}/campaigns/${encodeURIComponent(validCampId)}/jobs`);
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data && data.jobs) {
        setCallJobs(data.jobs);
      }
    } catch (e) {
      console.warn('Error fetching jobs:', e);
    }
  };

  useEffect(() => {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) return;
    fetchCampaigns();
  }, [eventId]);

  useEffect(() => {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim() || !selectedCampaign?.id) return;
    const campId = selectedCampaign.id;
    fetchJobs(campId);
    const interval = setInterval(() => {
      fetchJobs(campId);
      fetchCampaigns();
    }, 2000);
    return () => clearInterval(interval);
  }, [eventId, selectedCampaign?.id, selectedCampaign?.status]);

  const handleCreateCampaign = async () => {
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`,
          concurrencyLimit: concurrency,
        }),
      });
      const data = await res.json();
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
        await fetchCampaigns();
      }
    } catch (e) {
      console.warn('Create campaign error:', e);
    }
  };

  const handleStartSequence = async () => {
    if (isStartingSequence) return;
    setIsStartingSequence(true);
    setSequenceError(null);
    setActionFeedback(null);
    try {
      let endpoint = `/api/callbridge/events/${eventId}/sequence/start`;
      let bodyData: any = {};
      if (selectedCampaign) {
        endpoint = `/api/callbridge/events/${eventId}/campaigns/${selectedCampaign.id}/start`;
        bodyData = { campaignId: selectedCampaign.id };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start sequential calling');
      }

      setActionFeedback(data.message || 'Sequential calling started successfully.');
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
      await fetchCampaigns();
      if (data.campaign?.id) {
        await fetchJobs(data.campaign.id);
      } else if (selectedCampaign) {
        await fetchJobs(selectedCampaign.id);
      }
    } catch (e: any) {
      console.warn('Start sequence error:', e);
      setSequenceError(e.message || 'Failed to start sequential calling.');
    } finally {
      setIsStartingSequence(false);
    }
  };

  const handlePauseCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/${selectedCampaign.id}/pause`, { method: 'POST' });
      const data = await res.json();
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
      setActionFeedback('Queue paused. Current active call will finish naturally; no new calls will be placed.');
      await fetchCampaigns();
      await fetchJobs(selectedCampaign.id);
    } catch (e) {
      console.warn('Pause campaign error:', e);
    }
  };

  const handleContinueCampaign = async () => {
    if (!selectedCampaign || isContinuing) return;
    setIsContinuing(true);
    setActionFeedback(null);
    setSequenceError(null);
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/${selectedCampaign.id}/resume`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resume queue');
      }
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
      setActionFeedback('Queue resumed. Sequential calling is picking up from the next pending contact.');
      await fetchCampaigns();
      await fetchJobs(selectedCampaign.id);
    } catch (e: any) {
      console.warn('Continue campaign error:', e);
      setSequenceError(e.message || 'Failed to continue campaign.');
    } finally {
      setIsContinuing(false);
    }
  };

  const handleStopCampaign = async () => {
    if (!selectedCampaign || isStopping) return;
    setIsStopping(true);
    setActionFeedback('Stopping sequential queue...');
    // Immediate optimistic update to STOPPED state
    setSelectedCampaign((prev) => (prev ? { ...prev, status: 'stopped' } : null));
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/${selectedCampaign.id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to stop campaign');
      }
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
      setActionFeedback('Sequential queue stopped. New call initiation paused; active call preserved.');
      fetchCampaigns();
      fetchJobs(selectedCampaign.id);
    } catch (e: any) {
      console.warn('Stop campaign error:', e);
      setActionFeedback(`Notice: ${e.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const handleCancelCampaign = async () => {
    if (!selectedCampaign || isCancelling) return;
    setIsCancelling(true);
    setActionFeedback('Cancelling sequential queue...');
    // Immediate optimistic update to CANCELLED state and clear active call
    setSelectedCampaign((prev) => (prev ? { ...prev, status: 'cancelled', activeCalls: 0, activeCallId: null } : null));
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/${selectedCampaign.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel campaign');
      }
      if (data.campaign) {
        setSelectedCampaign(data.campaign);
      }
      setActionFeedback('Campaign cancelled. Pending calls removed and active call line hung up.');
      fetchCampaigns();
      fetchJobs(selectedCampaign.id);
    } catch (e: any) {
      console.warn('Cancel campaign error:', e);
      setActionFeedback(`Notice: ${e.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign || isDeletingCampaign) return;
    setIsDeletingCampaign(true);
    setActionFeedback('Deleting campaign record...');
    const campaignIdToDelete = selectedCampaign.id;
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/${campaignIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete campaign');
      }
      setSelectedCampaign(null);
      setCallJobs([]);
      setActionFeedback('Campaign record deleted successfully.');
      await fetchCampaigns();
    } catch (e: any) {
      console.warn('Delete campaign error:', e);
      setSequenceError(e.message || 'Failed to delete campaign');
    } finally {
      setIsDeletingCampaign(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleTerminateCall = async (jobId: string) => {
    setTerminatingJobId(jobId);
    try {
      await fetch(`/api/callbridge/calls/${jobId}/terminate`, { method: 'POST' });
      if (selectedCampaign) {
        await fetchJobs(selectedCampaign.id);
      }
    } catch (e) {
      console.warn('Error terminating call:', e);
    } finally {
      setTerminatingJobId(null);
    }
  };

  const completedCount = isPoliticalCampaign
    ? (selectedCampaign?.completedCount ?? (selectedCampaign?.processedCount ?? 0))
    : callJobs.filter((j) => j.status === 'completed').length;
  const inProgressCount = isPoliticalCampaign
    ? (selectedCampaign?.status === 'running' ? (selectedCampaign?.activeCalls ?? 0) : 0)
    : callJobs.filter((j) => ['in_progress', 'calling', 'ringing', 'initiating'].includes(j.status)).length;
  const pendingCount = callJobs.filter((j) => j.status === 'pending').length;
  const failedCount = isPoliticalCampaign
    ? (selectedCampaign?.failedCount ?? 0)
    : callJobs.filter((j) => ['failed', 'no_answer', 'busy', 'cancelled'].includes(j.status)).length;

  return (
    <div className="space-y-6">
      {/* Control panel & summary */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <PhoneCall className="w-5 h-5 text-blue-600" />
              <span>Sequential Outbound Queue Manager</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Order-preserving sequential telephone dispatch. Strictly executes one call at a time and automatically terminates on completion.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              Strict Sequential Queue (1 Call / Time)
            </span>
          </div>
        </div>

        {/* Existing Campaign or Create New */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">Active Campaign Batch</label>
            <select
              value={selectedCampaign?.id || ''}
              onChange={(e) => {
                const found = campaigns.find((c) => c.id === e.target.value);
                if (found) setSelectedCampaign(found);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status.toUpperCase()})
                </option>
              ))}
              {campaigns.length === 0 && <option value="">No campaigns created yet</option>}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">
              Queue Concurrency ({concurrency} call at a time)
            </label>
            <div className="flex items-center space-x-3 pt-1">
              <input
                type="range"
                min="1"
                max="5"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-slate-700 w-6 text-right">{concurrency}</span>
            </div>
          </div>

          <div className="flex items-end space-x-2">
            <button
              onClick={handleCreateCampaign}
              className="w-full px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition-colors cursor-pointer"
            >
              Create New Queue Batch
            </button>
          </div>
        </div>

        {/* Error Feedback */}
        {sequenceError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>{sequenceError}</span>
            <button onClick={() => setSequenceError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Action Feedback */}
        {actionFeedback && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <span>{actionFeedback}</span>
            <button onClick={() => setActionFeedback(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Campaign Action Buttons */}
        {selectedCampaign ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-slate-600">Current Queue State:</span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                  selectedCampaign.status === 'running'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                    : selectedCampaign.status === 'paused'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : selectedCampaign.status === 'stopped'
                    ? 'bg-slate-200 text-slate-800 border border-slate-300'
                    : selectedCampaign.status === 'cancelled'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : selectedCampaign.status === 'completed'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {selectedCampaign.status}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* When RUNNING: Show Pause Queue */}
              {selectedCampaign.status === 'running' && (
                <button
                  onClick={handlePauseCampaign}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-white" />
                  <span>Pause Queue</span>
                </button>
              )}

              {/* When PAUSED: Show Continue Queue */}
              {selectedCampaign.status === 'paused' && (
                <button
                  onClick={handleContinueCampaign}
                  disabled={isContinuing}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isContinuing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-white" />
                  )}
                  <span>{isContinuing ? 'Resuming Queue...' : 'Continue Queue'}</span>
                </button>
              )}

              {/* When STOPPED, DRAFT, CANCELLED, or COMPLETED: Show Start Queue */}
              {selectedCampaign.status !== 'running' && selectedCampaign.status !== 'paused' && (
                <button
                  onClick={handleStartSequence}
                  disabled={isStartingSequence}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isStartingSequence ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-white" />
                  )}
                  <span>
                    {isStartingSequence
                      ? 'Starting Queue...'
                      : selectedCampaign.status === 'stopped'
                      ? 'Resume Queue'
                      : 'Start Queue'}
                  </span>
                </button>
              )}

              {/* Stop Queue button: Preserves active call, stops placing new calls */}
              <button
                onClick={handleStopCampaign}
                disabled={isStopping || selectedCampaign.status === 'stopped' || selectedCampaign.status === 'cancelled' || selectedCampaign.status === 'completed'}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
                title="Stop initiating new calls. Preserves all call records and active call."
              >
                <Square className="w-3.5 h-3.5 text-slate-600" />
                <span>{isStopping ? 'Stopping...' : 'Stop Queue'}</span>
              </button>

              {/* Cancel Queue button: Cancels pending calls and terminates in-flight active calls immediately */}
              <button
                onClick={handleCancelCampaign}
                disabled={isCancelling || selectedCampaign.status === 'cancelled' || selectedCampaign.status === 'completed'}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold disabled:opacity-40 transition-colors cursor-pointer"
                title="Permanently cancel remaining queue and immediately terminate active carrier call."
              >
                <X className="w-3.5 h-3.5" />
                <span>{isCancelling ? 'Cancelling...' : 'Cancel Queue'}</span>
              </button>

              {/* Delete Campaign Record button */}
              <button
                onClick={handleDeleteCampaign}
                disabled={isDeletingCampaign || selectedCampaign.status === 'running'}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold disabled:opacity-40 transition-colors cursor-pointer"
                title="Delete this campaign record permanently"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingCampaign ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl">
            <div>
              <div className="text-xs font-bold text-slate-800">Sequential Calling Queue Ready</div>
              <div className="text-[11px] text-slate-500">
                Click Start Sequence to initialize the queue with all event contacts and begin sequential telephone calls.
              </div>
            </div>
            <button
              onClick={handleStartSequence}
              disabled={isStartingSequence}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isStartingSequence ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-white" />
              )}
              <span>{isStartingSequence ? 'Starting Sequence...' : 'Start Sequence'}</span>
            </button>
          </div>
        )}

        {actionFeedback && (
          <div className="flex items-center space-x-2 p-3 rounded-xl bg-blue-50 text-blue-800 text-xs border border-blue-200 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* POLITICAL CAMPAIGN: AGGREGATE CAMPAIGN PROGRESS (ZERO-PII & NO HISTORY TABLE) */}
      {isPoliticalCampaign ? (
        <div className="space-y-6">
          {/* Simple Aggregate Progress Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                  <PhoneCall className="w-4 h-4 text-purple-600" />
                  <span>Sequential Campaign Progress</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated sequential dispatch running strictly 1 call at a time. Keypad 1 or 2 immediately terminates active call.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-purple-50 text-purple-700 border border-purple-200">
                  {selectedCampaign?.status || 'READY'}
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            {(() => {
              const total = selectedCampaign?.totalContacts || (pendingCount + inProgressCount + completedCount + failedCount) || 0;
              const processed = (selectedCampaign?.processedCount ?? (completedCount + failedCount)) || 0;
              const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Campaign Completion</span>
                    <span className="font-mono font-bold text-purple-700">{pct}% ({processed} / {total})</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                    <div
                      className="bg-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Aggregate Progress Counter Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total in Queue</div>
                <div className="text-2xl font-extrabold text-slate-800 mt-1">
                  {selectedCampaign?.totalContacts || (pendingCount + inProgressCount + completedCount + failedCount) || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Eligible contacts queued</div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Active Calling</div>
                <div className="text-2xl font-extrabold text-amber-700 mt-1">
                  {selectedCampaign?.activeCalls !== undefined ? selectedCampaign.activeCalls : (inProgressCount > 0 ? 1 : 0)}
                </div>
                <div className="text-[11px] text-amber-600 mt-0.5">
                  {(selectedCampaign?.activeCalls !== undefined ? selectedCampaign.activeCalls : (inProgressCount > 0 ? 1 : 0)) > 0 ? 'Call active on line' : 'Telephony line idle'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Finished Calls</div>
                <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {selectedCampaign?.processedCount ?? (completedCount + failedCount)}
                </div>
                <div className="text-[11px] text-emerald-600 mt-0.5">Calls finished &amp; recorded</div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Remaining Pending</div>
                <div className="text-2xl font-extrabold text-blue-700 mt-1">
                  {selectedCampaign?.pendingCount !== undefined ? selectedCampaign.pendingCount : pendingCount}
                </div>
                <div className="text-[11px] text-blue-600 mt-0.5">Next in sequential order</div>
              </div>
            </div>

            {/* Active Telephony Line Indicator */}
            <div className={`p-4 rounded-xl border flex items-center space-x-3 text-xs ${
              inProgressCount > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : selectedCampaign?.status === 'running'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : selectedCampaign?.status === 'completed'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              {inProgressCount > 0 ? (
                <PhoneCall className="w-5 h-5 text-amber-600 animate-pulse shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              )}
              <div className="flex-1">
                <div className="font-bold">
                  {inProgressCount > 0
                    ? 'Active Telephony Dispatch in Progress'
                    : selectedCampaign?.status === 'running'
                    ? 'Sequential Queue Running — Advancing to next contact'
                    : selectedCampaign?.status === 'completed'
                    ? 'Sequential Campaign Batch Completed'
                    : selectedCampaign?.status === 'paused'
                    ? 'Sequential Queue Paused'
                    : 'Sequential Calling Ready'}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {inProgressCount > 0
                    ? 'Strict sequential mode: One call is actively connected. Live line terminates immediately upon detecting Keypad 1 or 2.'
                    : selectedCampaign?.status === 'running'
                    ? 'One call at a time. The next pending contact initiates as soon as the previous call terminates.'
                    : selectedCampaign?.status === 'completed'
                    ? 'All contacts have been dialed. See the Analytics tab for anonymous aggregate response percentages.'
                    : 'Click Start Sequence to begin automatic one-at-a-time telephone dispatch.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* PUBLIC SURVEY & MARRIAGE EVENT: FULL HISTORY TABLE */
        <>
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-800">{pendingCount}</div>
                <div className="text-[11px] font-medium text-slate-500 uppercase">Pending In Queue</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                <PhoneCall className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="text-xl font-bold text-amber-700">{inProgressCount}</div>
                <div className="text-[11px] font-medium text-amber-600 uppercase">Calling Now (Active)</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-700">{completedCount}</div>
                <div className="text-[11px] font-medium text-emerald-600 uppercase">Completed</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                <PhoneOff className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-red-700">{failedCount}</div>
                <div className="text-[11px] font-medium text-red-600 uppercase">Failed / Busy</div>
              </div>
            </div>
          </div>

          {/* Live Calls Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-800">Sequential Calling Queue</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700">
                  {callJobs.length} Contacts
                </span>
              </div>
              <button
                onClick={() => selectedCampaign && fetchJobs(selectedCampaign.id)}
                className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3 w-14">Order</th>
                    <th className="px-3.5 py-3">Date &amp; Time</th>
                    <th className="px-3.5 py-3">Contact</th>
                    <th className="px-3.5 py-3">Phone</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3">Duration</th>
                    <th className="px-3.5 py-3">
                      {resolvedEventType === 'public_survey' ? 'Questions Answered' : 'Recorded Response / DTMF'}
                    </th>
                    <th className="px-3.5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No contacts queued in this campaign yet. Please import contacts from the Contacts tab.
                      </td>
                    </tr>
                  ) : (
                    callJobs.map((job, idx) => {
                      const answersCount = job.surveyAnswers ? Object.keys(job.surveyAnswers).length : 0;
                      return (
                        <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-3 font-mono text-slate-400 font-bold">
                            #{idx + 1}
                          </td>
                          <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                            {job.createdAt
                              ? new Date(job.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="px-3.5 py-3 font-medium text-slate-800">{job.contactName}</td>
                          <td className="px-3.5 py-3 font-mono text-slate-600">
                            <div>{job.contactPhone}</div>
                            {job.vapiCallId && (
                              <div className="text-[10px] text-slate-400 font-mono" title="Telephony Call ID">
                                ID: {job.vapiCallId.slice(0, 8)}...
                              </div>
                            )}
                            {job.failureReason && (job.status === 'failed' || job.status === 'no_answer') && (
                              <div className="text-[10px] text-rose-600 font-sans font-medium mt-0.5 line-clamp-2 max-w-xs" title={job.failureReason}>
                                ⚠️ {job.failureReason}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                job.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : job.status === 'callback_scheduled' || job.status === 'callback_requested'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : job.status === 'interrupted'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : job.status === 'in_progress'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 animate-pulse'
                                  : job.status === 'ringing'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200 animate-pulse'
                                  : job.status === 'calling'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                                  : job.status === 'initiating'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                                  : job.status === 'pending'
                                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                  : job.status === 'no_answer'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : job.status === 'busy'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : job.status === 'cancelled'
                                  ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {job.status === 'in_progress'
                                ? 'CONNECTED'
                                : job.status === 'callback_scheduled'
                                ? 'CALLBACK SCHEDULED'
                                : job.status === 'interrupted'
                                ? 'INTERRUPTED'
                                : job.status === 'ringing'
                                ? 'RINGING'
                                : job.status === 'calling'
                                ? 'CALLING'
                                : job.status === 'initiating'
                                ? 'INITIATING'
                                : job.status === 'no_answer'
                                ? 'UNANSWERED'
                                : job.status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 font-mono">{job.durationSeconds ? `${job.durationSeconds}s` : '—'}</td>
                          <td className="px-3.5 py-3">
                            {resolvedEventType === 'public_survey' ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-200">
                                  {answersCount} / {job.surveyState?.totalActiveQuestions || 10} Questions
                                </span>
                                {job.status === 'callback_scheduled' && job.callbackDetails && (
                                  <div className="text-[10px] text-purple-700 font-medium">
                                    Callback: {job.callbackDetails.requestedDate || ''} {job.callbackDetails.requestedTime || ''}
                                  </div>
                                )}
                              </div>
                            ) : job.dtmfOptionLabel ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium text-[11px] border border-purple-200">
                                Key [{job.dtmfDigitReceived}]: {job.dtmfOptionLabel}
                              </span>
                            ) : job.rsvpStatus ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium text-[11px] border border-emerald-200 uppercase">
                                RSVP: {job.rsvpStatus.replace(/_/g, ' ')}
                              </span>
                            ) : answersCount > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-200">
                                {answersCount} Answers Recorded
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-right space-x-1.5 whitespace-nowrap">
                            {(job.status === 'in_progress' || job.status === 'calling' || job.status === 'ringing' || job.status === 'initiating') && (
                              <button
                                onClick={() => handleTerminateCall(job.id)}
                                disabled={terminatingJobId === job.id}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Terminate call immediately via carrier hangup API"
                              >
                                <StopCircle className="w-3 h-3" />
                                <span>{terminatingJobId === job.id ? 'Ending...' : 'Terminate'}</span>
                              </button>
                            )}
                            {job.transcript && job.transcript.length > 0 ? (
                              <button
                                onClick={() => {
                                  setSelectedTranscriptJob(job);
                                  setEditingTurnIndex(null);
                                  setTurnEditFeedback(null);
                                }}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="View chronological dialogue"
                              >
                                <FileText className="w-3 h-3 text-slate-500" />
                                <span>Transcript</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={downloadingPdfId === job.id}
                              onClick={() => handleDownloadPdf(job.id, job.contactPhone)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition-colors cursor-pointer border border-blue-200 disabled:opacity-50"
                              title="Download PDF Transcript"
                            >
                              {downloadingPdfId === job.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                              ) : (
                                <Download className="w-3 h-3 text-blue-600" />
                              )}
                              <span>{downloadingPdfId === job.id ? '...' : 'PDF'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* View Transcript & Edit Modal */}
          {selectedTranscriptJob && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Call Transcript: {selectedTranscriptJob.contactName}
                    </h3>
                    <span className="text-xs font-mono text-slate-500">
                      Phone: {selectedTranscriptJob.contactPhone} | Duration: {selectedTranscriptJob.durationSeconds || 0}s | Status: {selectedTranscriptJob.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTranscriptJob(null);
                      setEditingTurnIndex(null);
                      setTurnEditFeedback(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {turnEditFeedback && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{turnEditFeedback}</span>
                  </div>
                )}

                {/* If survey answers present */}
                {selectedTranscriptJob.surveyAnswers && Object.keys(selectedTranscriptJob.surveyAnswers).length > 0 && (
                  <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                    <div className="font-bold text-blue-900">Recorded Survey Feedback:</div>
                    <div className="grid grid-cols-1 gap-1.5 text-blue-950 font-sans">
                      {Object.entries(selectedTranscriptJob.surveyAnswers).map(([key, val]) => (
                        <div key={key} className="flex space-x-2 text-[11px]">
                          <span className="font-bold uppercase text-blue-800 shrink-0">{key}:</span>
                          <span>{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chronological Dialogue: AI Agent on blue/left, Respondent on white/right */}
                <div className="max-h-96 overflow-y-auto space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                  {selectedTranscriptJob.transcript?.map((msg, i) => {
                    const isAgent = msg.role === 'agent' || (msg as any).speaker === 'agent' || (msg as any).speakerRole === 'assistant' || (msg.role as string) === 'assistant';
                    const isSystem = msg.role === 'system';
                    const isEditing = editingTurnIndex === i;

                    return (
                      <div
                        key={i}
                        className={`p-3.5 rounded-2xl max-w-[85%] leading-relaxed ${
                          isSystem
                            ? 'bg-slate-200 text-slate-700 mx-auto text-center font-mono text-[11px]'
                            : isAgent
                            ? 'bg-blue-600 text-white mr-auto shadow-sm text-left'
                            : 'bg-white text-slate-800 ml-auto border border-slate-200 shadow-sm text-left'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase opacity-75 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span>{isAgent ? 'AI Voice Agent' : isSystem ? 'System' : 'Respondent'}</span>
                            {(msg as any).questionOrder && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${isAgent ? 'bg-blue-800 text-blue-100' : 'bg-slate-100 text-slate-700'}`}>
                                Q{(msg as any).questionOrder}
                              </span>
                            )}
                            {(msg as any).turnType === 'follow_up' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-200">
                                Follow-up
                              </span>
                            )}
                            {(msg as any).turnType === 'callback' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-200">
                                Callback
                              </span>
                            )}
                          </div>
                          {msg.timestamp && (
                            <span className="font-mono text-[9px] opacity-70">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 mt-2 pt-2 border-t border-slate-200/40">
                            <textarea
                              value={editedTurnText}
                              onChange={(e) => setEditedTurnText(e.target.value)}
                              className="w-full p-2 text-xs rounded-lg border border-slate-300 text-slate-900 bg-white"
                              rows={2}
                            />
                            <input
                              type="text"
                              placeholder="Reason for revision (e.g. Speech recognition typo)"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              className="w-full p-1.5 text-[11px] rounded-lg border border-slate-300 text-slate-800 bg-white"
                            />
                            <div className="flex space-x-2 justify-end">
                              <button
                                onClick={() => setEditingTurnIndex(null)}
                                className="px-2.5 py-1 text-[11px] rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveTurnEdit(selectedTranscriptJob.id, i)}
                                disabled={isSavingTurn}
                                className="px-3 py-1 text-[11px] font-bold rounded bg-blue-700 hover:bg-blue-800 text-white cursor-pointer disabled:opacity-50"
                              >
                                {isSavingTurn ? 'Saving...' : 'Save Turn'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="leading-relaxed flex-1">{(msg as any).transcriptText || msg.text}</div>
                            {!isSystem && (
                              <button
                                onClick={() => handleStartEditTurn(i, msg.text)}
                                className="p-1 rounded hover:bg-black/10 text-current opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                                title="Edit this turn text"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {selectedTranscriptJob.transcriptRevisions && (
                          (() => {
                            const rev = selectedTranscriptJob.transcriptRevisions.find((r) => r.turnIndex === i);
                            if (rev) {
                              return (
                                <div className={`text-[10px] mt-1.5 pt-1 border-t ${isAgent ? 'border-blue-500/50 text-blue-100' : 'border-slate-100 text-amber-700'}`}>
                                  ✎ Revised by {rev.editor || 'Admin'}: "{rev.newText}" (Reason: {rev.reason || 'Correction'})
                                </div>
                              );
                            }
                            return null;
                          })()
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={downloadingPdfId === selectedTranscriptJob.id}
                    onClick={() => handleDownloadPdf(selectedTranscriptJob.id, selectedTranscriptJob.contactPhone)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {downloadingPdfId === selectedTranscriptJob.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{downloadingPdfId === selectedTranscriptJob.id ? 'Generating PDF...' : 'Download PDF'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTranscriptJob(null);
                      setEditingTurnIndex(null);
                      setTurnEditFeedback(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    Close Transcript
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
