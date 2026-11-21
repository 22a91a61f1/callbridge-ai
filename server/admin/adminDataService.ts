import fs from 'fs';
import path from 'path';
import type {
  PlanConfig,
  PaymentRecord,
  SubscriptionPlanId,
  TenantUser,
  UsageTransaction,
  UserSubscription,
} from '../storage/callbridgeStorage.ts';
import type { CustomerAuthIdentity } from '../auth/authIdentityStorage.ts';
import { getConfiguredAdminEmail } from './adminAuthService.ts';

export type AdminPlanFilter = 'all' | 'free' | 'pro' | 'max_pro';
export type AdminStatusFilter = 'all' | 'active' | 'exhausted' | 'expired';
export type AdminSortOrder = 'newest' | 'oldest';

export interface AdminCustomerRow {
  customerId: string;
  maskedEmail: string;
  registrationDate: string;
  planId: SubscriptionPlanId;
  planName: 'Free' | 'Pro' | 'Max Pro';
  subscriptionStatus: 'active' | 'exhausted' | 'expired';
  creditsPurchasedSeconds: number;
  creditsUsedSeconds: number;
  remainingCreditsSeconds: number;
  freeAllowanceSeconds: number;
  source: 'firebase_auth' | 'legacy_tenant';
}

export interface AdminOverviewMetrics {
  totalRegisteredCustomers: number;
  freePlanCustomers: number;
  upgradedCustomers: number;
  proPlanCustomers: number;
  maxProPlanCustomers: number;
  totalCreditsPurchasedSeconds: number;
  totalCreditsUsedSeconds: number;
  totalCreditsRemainingSeconds: number;
  creditUnit: 'seconds';
  generatedAt: string;
}

export interface AdminCustomerListResponse {
  customers: AdminCustomerRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    search: string;
    plan: AdminPlanFilter;
    status: AdminStatusFilter;
    sort: AdminSortOrder;
  };
}

interface InternalCustomerRecord {
  row: AdminCustomerRow;
  rawEmailLower: string;
  registrationTimestamp: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CALLBRIDGE_DB_FILE = path.join(DATA_DIR, 'callbridge_db.json');
const AUTH_IDENTITIES_FILE = path.join(DATA_DIR, 'auth_identities.json');

const FALLBACK_PLAN_SECONDS: Record<SubscriptionPlanId, number> = {
  free: 120,
  pro: 1800,
  max_pro: 5400,
};

const PLAN_LABELS: Record<SubscriptionPlanId, 'Free' | 'Pro' | 'Max Pro'> = {
  free: 'Free',
  pro: 'Pro',
  max_pro: 'Max Pro',
};

/**
 * Masks an email address for privacy-safe display in the Admin dashboard
 * (e.g. "rishithagogula489@gmail.com" -> "ri***@gmail.com").
 */
export function maskCustomerEmail(email: string): string {
  const clean = (email || '').trim().toLowerCase();
  const atIndex = clean.indexOf('@');
  if (atIndex <= 0 || atIndex === clean.length - 1) {
    return '***';
  }
  const local = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);
  if (local.length <= 2) {
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

function readSafeJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePlanId(planId: unknown): SubscriptionPlanId {
  if (planId === 'pro' || planId === 'max_pro' || planId === 'free') {
    return planId;
  }
  return 'free';
}

function resolveSubscriptionStatus(sub: UserSubscription | undefined): 'active' | 'exhausted' | 'expired' {
  if (!sub) return 'active';

  const rawStatus = (sub.planStatus || sub.status || 'active').toString().toLowerCase();
  if (rawStatus === 'expired') return 'expired';

  if (sub.expiryDate) {
    const expiryTime = new Date(sub.expiryDate).getTime();
    if (!Number.isNaN(expiryTime) && expiryTime < Date.now()) {
      return 'expired';
    }
  }

  if (rawStatus === 'exhausted') return 'exhausted';
  return 'active';
}

/**
 * Strictly READ-ONLY loader reading ONLY customer identity, tenant ID/email/createdAt,
 * subscription, planConfig, completed payment, and billed usage totals.
 *
 * PRIVACY GUARANTEE:
 * Never reads or retains contacts, phone numbers, CSV/Excel/PDF imports, campaign scripts,
 * survey answers, marriage event details, voice clones, recordings, call transcripts,
 * call history, passwords, tokens, or API secrets.
 */
function loadCustomerRecordsReadOnly(): InternalCustomerRecord[] {
  const adminEmail = getConfiguredAdminEmail();

  const authFile = readSafeJsonFile<{ identitiesByUid?: Record<string, CustomerAuthIdentity> }>(
    AUTH_IDENTITIES_FILE,
    {}
  );
  const dbFile = readSafeJsonFile<{
    tenants?: Record<string, TenantUser>;
    subscriptions?: Record<string, UserSubscription>;
    planConfigs?: Record<string, PlanConfig>;
    paymentHistory?: Record<string, PaymentRecord>;
    usageTransactions?: Record<string, UsageTransaction>;
  }>(CALLBRIDGE_DB_FILE, {});

  const identitiesByUid = authFile.identitiesByUid || {};
  const tenantsMap = dbFile.tenants || {};
  const subscriptionsMap = dbFile.subscriptions || {};
  const planConfigsMap = dbFile.planConfigs || {};
  const paymentsList = Object.values(dbFile.paymentHistory || {});
  const usageList = Object.values(dbFile.usageTransactions || {});

  const getIncludedSecondsForPlan = (planId: SubscriptionPlanId): number => {
    const cfg = planConfigsMap[planId];
    if (cfg && typeof cfg.includedSeconds === 'number' && cfg.includedSeconds >= 0) {
      return Math.round(cfg.includedSeconds);
    }
    return FALLBACK_PLAN_SECONDS[planId];
  };

  // Pre-aggregate completed payment seconds per customer ID (no double counting)
  const paidSecondsByCustomer = new Map<string, number>();
  for (const payment of paymentsList) {
    if (!payment || payment.paymentStatus !== 'completed' || !payment.userId) continue;
    const pPlanId = normalizePlanId(payment.planId);
    if (pPlanId === 'free') continue;
    const seconds = getIncludedSecondsForPlan(pPlanId);
    paidSecondsByCustomer.set(payment.userId, (paidSecondsByCustomer.get(payment.userId) || 0) + seconds);
  }

  // Pre-aggregate billed usage seconds per customer ID (each tx is already idempotent per callId/vapiCallId)
  const billedUsageSecondsByCustomer = new Map<string, number>();
  for (const tx of usageList) {
    if (!tx || tx.billingStatus !== 'billed' || !tx.userId) continue;
    const deducted = typeof tx.creditDeductionSeconds === 'number' && tx.creditDeductionSeconds > 0
      ? Math.round(tx.creditDeductionSeconds)
      : 0;
    if (deducted > 0) {
      billedUsageSecondsByCustomer.set(tx.userId, (billedUsageSecondsByCustomer.get(tx.userId) || 0) + deducted);
    }
  }

  // Build deduplicated customer directory keyed by tenantId / customerId.
  // Priority 1: Firebase-authenticated customers from auth_identities.json (role === 'customer').
  // Priority 2: Preserved existing tenant accounts from callbridge_db.json (excluding anonymous/orphan records).
  const byCustomerId = new Map<
    string,
    {
      customerId: string;
      email: string;
      registrationDate: string;
      source: 'firebase_auth' | 'legacy_tenant';
    }
  >();

  for (const identity of Object.values(identitiesByUid)) {
    if (!identity || !identity.tenantId) continue;
    if ((identity.role as string) !== 'customer') continue;

    const normalizedEmail = (identity.email || '').trim().toLowerCase();
    if (adminEmail && normalizedEmail === adminEmail) continue;

    const existing = byCustomerId.get(identity.tenantId);
    const createdAt = identity.createdAt || new Date(0).toISOString();
    if (!existing || new Date(createdAt).getTime() < new Date(existing.registrationDate).getTime()) {
      byCustomerId.set(identity.tenantId, {
        customerId: identity.tenantId,
        email: normalizedEmail,
        registrationDate: createdAt,
        source: 'firebase_auth',
      });
    }
  }

  for (const tenant of Object.values(tenantsMap)) {
    if (!tenant || !tenant.id) continue;
    const normalizedEmail = (tenant.email || '').trim().toLowerCase();
    if (adminEmail && normalizedEmail === adminEmail) continue;

    if (!byCustomerId.has(tenant.id)) {
      byCustomerId.set(tenant.id, {
        customerId: tenant.id,
        email: normalizedEmail,
        registrationDate: tenant.createdAt || new Date(0).toISOString(),
        source: 'legacy_tenant',
      });
    }
  }

  const results: InternalCustomerRecord[] = [];

  for (const entry of byCustomerId.values()) {
    const sub = subscriptionsMap[entry.customerId];
    const planId = normalizePlanId(sub?.planId);
    const subscriptionStatus = resolveSubscriptionStatus(sub);

    const paidFromHistory = paidSecondsByCustomer.get(entry.customerId) || 0;
    const subTotalSeconds = sub && typeof sub.totalSeconds === 'number' && sub.totalSeconds > 0
      ? Math.round(sub.totalSeconds)
      : planId === 'free'
        ? FALLBACK_PLAN_SECONDS.free
        : getIncludedSecondsForPlan(planId);

    // Accurate credit accounting aligned with existing Free/Pro/Max Pro rules:
    // - Free plan customers without completed paid orders have 0 paid credits purchased (with 120s free trial allowance).
    // - Upgraded customers (Pro / Max Pro) report cumulative completed payment credits, falling back to
    //   subscription.totalSeconds for preserved pre-existing upgraded records without paymentHistory entries.
    const creditsPurchasedSeconds =
      planId === 'free'
        ? paidFromHistory
        : Math.max(paidFromHistory, subTotalSeconds);

    const freeAllowanceSeconds = planId === 'free' ? subTotalSeconds : 0;

    const subUsedSeconds = sub && typeof sub.usedSeconds === 'number' && sub.usedSeconds > 0
      ? Math.round(sub.usedSeconds)
      : 0;
    const txUsedSeconds = billedUsageSecondsByCustomer.get(entry.customerId) || 0;
    const creditsUsedSeconds = Math.max(subUsedSeconds, txUsedSeconds);

    const remainingCreditsSeconds = sub && typeof sub.remainingSeconds === 'number'
      ? Math.max(0, Math.round(sub.remainingSeconds))
      : planId === 'free'
        ? FALLBACK_PLAN_SECONDS.free
        : 0;

    const regTime = new Date(entry.registrationDate).getTime();

    results.push({
      row: {
        customerId: entry.customerId,
        maskedEmail: maskCustomerEmail(entry.email),
        registrationDate: entry.registrationDate,
        planId,
        planName: PLAN_LABELS[planId],
        subscriptionStatus,
        creditsPurchasedSeconds,
        creditsUsedSeconds,
        remainingCreditsSeconds,
        freeAllowanceSeconds,
        source: entry.source,
      },
      rawEmailLower: entry.email,
      registrationTimestamp: Number.isNaN(regTime) ? 0 : regTime,
    });
  }

  return results;
}

export function getAdminOverviewMetrics(): AdminOverviewMetrics {
  const records = loadCustomerRecordsReadOnly();

  let freePlanCustomers = 0;
  let proPlanCustomers = 0;
  let maxProPlanCustomers = 0;
  let totalCreditsPurchasedSeconds = 0;
  let totalCreditsUsedSeconds = 0;
  let totalCreditsRemainingSeconds = 0;

  for (const { row } of records) {
    if (row.planId === 'free') {
      freePlanCustomers += 1;
    } else if (row.planId === 'pro') {
      proPlanCustomers += 1;
    } else if (row.planId === 'max_pro') {
      maxProPlanCustomers += 1;
    }

    totalCreditsPurchasedSeconds += row.creditsPurchasedSeconds;
    totalCreditsUsedSeconds += row.creditsUsedSeconds;
    totalCreditsRemainingSeconds += row.remainingCreditsSeconds;
  }

  return {
    totalRegisteredCustomers: records.length,
    freePlanCustomers,
    upgradedCustomers: proPlanCustomers + maxProPlanCustomers,
    proPlanCustomers,
    maxProPlanCustomers,
    totalCreditsPurchasedSeconds,
    totalCreditsUsedSeconds,
    totalCreditsRemainingSeconds,
    creditUnit: 'seconds',
    generatedAt: new Date().toISOString(),
  };
}

export function getAdminCustomersList(params: {
  search?: string;
  plan?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}): AdminCustomerListResponse {
  const search = (params.search || '').trim().toLowerCase();
  const plan: AdminPlanFilter =
    params.plan === 'free' || params.plan === 'pro' || params.plan === 'max_pro' ? params.plan : 'all';
  const status: AdminStatusFilter =
    params.status === 'active' || params.status === 'exhausted' || params.status === 'expired'
      ? params.status
      : 'all';
  const sort: AdminSortOrder = params.sort === 'oldest' ? 'oldest' : 'newest';

  const rawPage = Number(params.page || 1);
  const rawPageSize = Number(params.pageSize || 10);
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(1, Math.floor(rawPageSize))) : 10;

  const allRecords = loadCustomerRecordsReadOnly();

  const filtered = allRecords.filter((rec) => {
    if (plan !== 'all' && rec.row.planId !== plan) return false;
    if (status !== 'all' && rec.row.subscriptionStatus !== status) return false;

    if (search) {
      const idMatch = rec.row.customerId.toLowerCase().includes(search);
      const emailMatch = rec.rawEmailLower.includes(search) || rec.row.maskedEmail.toLowerCase().includes(search);
      if (!idMatch && !emailMatch) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'oldest') {
      return a.registrationTimestamp - b.registrationTimestamp;
    }
    return b.registrationTimestamp - a.registrationTimestamp;
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Number.isFinite(rawPage) ? Math.min(totalPages, Math.max(1, Math.floor(rawPage))) : 1;

  const startIdx = (safePage - 1) * pageSize;
  const pagedRows = filtered.slice(startIdx, startIdx + pageSize).map((item) => item.row);

  return {
    customers: pagedRows,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    filters: {
      search: (params.search || '').trim(),
      plan,
      status,
      sort,
    },
  };
}
