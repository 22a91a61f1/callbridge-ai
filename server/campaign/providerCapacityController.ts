import { callbridgeStorage } from '../storage/callbridgeStorage.ts';

export interface ProviderSlotLease {
  jobId: string;
  tenantId: string;
  campaignId: string;
  providerCallId?: string;
  state: 'initiating' | 'active' | 'cancelling';
  acquiredAt: string;
  updatedAt: string;
}

export type AcquireSlotResult =
  | { acquired: true; lease: ProviderSlotLease }
  | {
      acquired: false;
      reason: 'tenant_busy' | 'provider_capacity_full' | 'provider_backoff';
      activeJobId?: string;
      activeCount: number;
      maxConcurrentCalls: number;
      retryAfterMs?: number;
    };

type CapacityListener = () => void;

/**
 * Shared Provider Capacity Controller + Per-Tenant Active-Call Lock.
 *
 * Enforces two strictly separate invariants:
 * 1. Per-tenant sequential lock: Each authenticated customer (tenantId) can have
 *    at most ONE active outbound call across ALL their campaigns.
 * 2. Shared provider capacity limit: Total concurrent outbound calls across all
 *    customers cannot exceed VAPI_MAX_CONCURRENT_CALLS (safe default: 1 until
 *    provider/account concurrency is verified).
 *
 * This controller does NOT enforce global sequential calling or global round-robin:
 * whenever maxConcurrentCalls > 1, different customers execute their own independent
 * FIFO queues simultaneously.
 */
export class ProviderCapacityController {
  private activeLeases = new Map<string, ProviderSlotLease>(); // jobId -> lease
  private tenantActiveJob = new Map<string, string>(); // tenantId -> jobId
  private capacityListeners = new Set<CapacityListener>();
  private runtimeMaxOverride: number | null = null;
  private backoffUntilMs = 0;
  private consecutiveRateLimits = 0;
  private backoffTimer: NodeJS.Timeout | null = null;

  public getMaxConcurrentCalls(): number {
    if (this.runtimeMaxOverride !== null) {
      return this.runtimeMaxOverride;
    }
    const raw = (process.env.VAPI_MAX_CONCURRENT_CALLS || '').trim();
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return parsed;
      }
    }
    // Safe default of 1 when provider/account concurrency has not been explicitly configured & verified
    return 1;
  }

  public isUsingDefaultConcurrency(): boolean {
    if (this.runtimeMaxOverride !== null) return false;
    const raw = (process.env.VAPI_MAX_CONCURRENT_CALLS || '').trim();
    const parsed = parseInt(raw, 10);
    return !(raw && Number.isFinite(parsed) && parsed >= 1);
  }

  /**
   * Optional runtime override (primarily for automated verification or explicit operator adjustment).
   * Pass null to revert to process.env.VAPI_MAX_CONCURRENT_CALLS.
   */
  public setRuntimeMaxConcurrentCalls(limit: number | null): void {
    if (limit === null) {
      this.runtimeMaxOverride = null;
    } else {
      this.runtimeMaxOverride = Math.max(1, Math.floor(limit));
    }
    this.notifyCapacityAvailable();
  }

  public onCapacityAvailable(listener: CapacityListener): () => void {
    this.capacityListeners.add(listener);
    return () => {
      this.capacityListeners.delete(listener);
    };
  }

  private notifyCapacityAvailable(): void {
    for (const listener of this.capacityListeners) {
      try {
        listener();
      } catch (err: any) {
        console.warn('[PROVIDER_CAPACITY_LISTENER_WARN]', err?.message || err);
      }
    }
  }

  public hasActiveTenantCall(tenantId: string): boolean {
    if (!tenantId) return false;
    return this.tenantActiveJob.has(tenantId);
  }

  public getTenantActiveLease(tenantId: string): ProviderSlotLease | undefined {
    const jobId = this.tenantActiveJob.get(tenantId);
    if (!jobId) return undefined;
    return this.activeLeases.get(jobId);
  }

  public getLeaseByJobId(jobId: string): ProviderSlotLease | undefined {
    return this.activeLeases.get(jobId);
  }

  public getActiveCount(): number {
    return this.activeLeases.size;
  }

  public getBackoffRemainingMs(): number {
    const rem = this.backoffUntilMs - Date.now();
    return rem > 0 ? rem : 0;
  }

  /**
   * Atomically checks per-tenant lock AND shared provider concurrency limit.
   * Must be called synchronously right before marking a job 'initiating'.
   */
  public tryAcquire(tenantId: string, jobId: string, campaignId: string): AcquireSlotResult {
    const maxConcurrent = this.getMaxConcurrentCalls();
    const existingTenantJobId = this.tenantActiveJob.get(tenantId);

    // 1. Per-tenant sequential lock: never allow 2 simultaneous calls for the same customer
    if (existingTenantJobId && existingTenantJobId !== jobId) {
      return {
        acquired: false,
        reason: 'tenant_busy',
        activeJobId: existingTenantJobId,
        activeCount: this.activeLeases.size,
        maxConcurrentCalls: maxConcurrent,
      };
    }

    // Re-entrant idempotent check for same job
    const existingLease = this.activeLeases.get(jobId);
    if (existingLease) {
      return { acquired: true, lease: existingLease };
    }

    // 2. Provider rate-limit / HTTP 429 backoff window
    const backoffRem = this.getBackoffRemainingMs();
    if (backoffRem > 0) {
      return {
        acquired: false,
        reason: 'provider_backoff',
        activeCount: this.activeLeases.size,
        maxConcurrentCalls: maxConcurrent,
        retryAfterMs: backoffRem,
      };
    }

    // 3. Shared provider concurrency ceiling across all customers
    if (this.activeLeases.size >= maxConcurrent) {
      return {
        acquired: false,
        reason: 'provider_capacity_full',
        activeCount: this.activeLeases.size,
        maxConcurrentCalls: maxConcurrent,
      };
    }

    const now = new Date().toISOString();
    const lease: ProviderSlotLease = {
      jobId,
      tenantId,
      campaignId,
      state: 'initiating',
      acquiredAt: now,
      updatedAt: now,
    };

    this.activeLeases.set(jobId, lease);
    this.tenantActiveJob.set(tenantId, jobId);

    // Persist tenant active-call lock to disk immediately before provider HTTP call
    callbridgeStorage.setTenantQueueState(tenantId, {
      tenantId,
      activeCampaignId: campaignId,
      activeJobId: jobId,
      activeCallState: 'initiating',
      updatedAt: now,
    });

    return { acquired: true, lease };
  }

  /**
   * Restores a persisted in-flight lease on server restart before any new dispatches occur.
   */
  public restoreLeaseFromPersistence(params: {
    jobId: string;
    tenantId: string;
    campaignId: string;
    providerCallId?: string;
    state?: 'initiating' | 'active' | 'cancelling';
    acquiredAt?: string;
  }): ProviderSlotLease {
    const existing = this.activeLeases.get(params.jobId);
    if (existing) {
      if (params.providerCallId && !existing.providerCallId) {
        existing.providerCallId = params.providerCallId;
      }
      return existing;
    }

    const now = new Date().toISOString();
    const lease: ProviderSlotLease = {
      jobId: params.jobId,
      tenantId: params.tenantId,
      campaignId: params.campaignId,
      providerCallId: params.providerCallId,
      state: params.state || 'active',
      acquiredAt: params.acquiredAt || now,
      updatedAt: now,
    };

    this.activeLeases.set(params.jobId, lease);
    this.tenantActiveJob.set(params.tenantId, params.jobId);

    callbridgeStorage.setTenantQueueState(params.tenantId, {
      tenantId: params.tenantId,
      activeCampaignId: params.campaignId,
      activeJobId: params.jobId,
      activeProviderCallId: params.providerCallId,
      activeCallState: lease.state,
      updatedAt: now,
    });

    return lease;
  }

  /**
   * Attach confirmed providerCallId once Vapi accepts the outbound call.
   */
  public attachProviderCallId(jobId: string, providerCallId: string): void {
    const lease = this.activeLeases.get(jobId);
    if (!lease) return;
    const now = new Date().toISOString();
    lease.providerCallId = providerCallId;
    lease.state = 'active';
    lease.updatedAt = now;
    this.consecutiveRateLimits = 0;

    callbridgeStorage.setTenantQueueState(lease.tenantId, {
      tenantId: lease.tenantId,
      activeCampaignId: lease.campaignId,
      activeJobId: lease.jobId,
      activeProviderCallId: providerCallId,
      activeCallState: 'active',
      updatedAt: now,
    });
  }

  /**
   * Mark lease as cancelling while waiting for provider termination confirmation.
   * Does NOT release the tenant lock or provider slot prematurely!
   */
  public markCancelling(jobId: string): void {
    const lease = this.activeLeases.get(jobId);
    if (!lease) return;
    const now = new Date().toISOString();
    lease.state = 'cancelling';
    lease.updatedAt = now;

    callbridgeStorage.setTenantQueueState(lease.tenantId, {
      tenantId: lease.tenantId,
      activeCampaignId: lease.campaignId,
      activeJobId: lease.jobId,
      activeProviderCallId: lease.providerCallId,
      activeCallState: 'cancelling',
      updatedAt: now,
    });
  }

  /**
   * Releases an unplaced attempt after HTTP 429 / provider concurrency throttling,
   * sets exponential backoff, and schedules wake-up so the job stays pending and retries cleanly.
   */
  public recordProviderRateLimit(jobId: string, retryAfterMs?: number): number {
    this.releaseLeaseInternal(jobId, false);
    this.consecutiveRateLimits = Math.min(this.consecutiveRateLimits + 1, 6);
    const defaultBackoff = Math.min(30000, 1500 * Math.pow(2, this.consecutiveRateLimits - 1));
    const waitMs = Math.max(500, retryAfterMs || defaultBackoff);
    this.backoffUntilMs = Date.now() + waitMs;

    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.backoffUntilMs = 0;
      this.notifyCapacityAvailable();
    }, waitMs);

    console.warn('[PROVIDER_CAPACITY_RATE_LIMIT_BACKOFF]', {
      jobId,
      waitMs,
      consecutiveRateLimits: this.consecutiveRateLimits,
      activeSlots: this.activeLeases.size,
      maxConcurrentCalls: this.getMaxConcurrentCalls(),
    });

    return waitMs;
  }

  /**
   * Releases the tenant lock and shared provider slot ONLY after confirmed terminal provider status
   * (or immediate pre-placement rejection before a provider call was created).
   */
  public releaseOnConfirmedTerminal(jobId: string): boolean {
    const released = this.releaseLeaseInternal(jobId, true);
    if (released) {
      this.notifyCapacityAvailable();
    }
    return released;
  }

  private releaseLeaseInternal(jobId: string, clearPersisted: boolean): boolean {
    const lease = this.activeLeases.get(jobId);
    if (!lease) return false;

    this.activeLeases.delete(jobId);
    if (this.tenantActiveJob.get(lease.tenantId) === jobId) {
      this.tenantActiveJob.delete(lease.tenantId);
      if (clearPersisted) {
        callbridgeStorage.clearTenantQueueState(lease.tenantId, jobId);
      }
    }
    return true;
  }

  /**
   * Reset in-memory lease tracking (used for clean restart simulations in automated tests).
   */
  public resetInMemoryState(): void {
    this.activeLeases.clear();
    this.tenantActiveJob.clear();
    this.backoffUntilMs = 0;
    this.consecutiveRateLimits = 0;
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  public getSnapshot(): {
    maxConcurrentCalls: number;
    activeSlots: number;
    availableSlots: number;
    usingSafeDefault: boolean;
    backoffRemainingMs: number;
    activeTenants: Array<{
      tenantId: string;
      campaignId: string;
      jobId: string;
      providerCallId?: string;
      state: ProviderSlotLease['state'];
    }>;
  } {
    const max = this.getMaxConcurrentCalls();
    const active = this.activeLeases.size;
    return {
      maxConcurrentCalls: max,
      activeSlots: active,
      availableSlots: Math.max(0, max - active),
      usingSafeDefault: this.isUsingDefaultConcurrency(),
      backoffRemainingMs: this.getBackoffRemainingMs(),
      activeTenants: Array.from(this.activeLeases.values()).map((l) => ({
        tenantId: l.tenantId,
        campaignId: l.campaignId,
        jobId: l.jobId,
        providerCallId: l.providerCallId,
        state: l.state,
      })),
    };
  }
}

export const providerCapacityController = new ProviderCapacityController();
