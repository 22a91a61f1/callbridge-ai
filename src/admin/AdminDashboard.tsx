import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  RefreshCw,
  Search,
  AlertCircle,
} from 'lucide-react';
import type {
  AdminCustomerRow,
  AdminCustomersResponse,
  AdminOverviewMetrics,
  AdminSessionUser,
} from './types';

interface AdminDashboardProps {
  admin: AdminSessionUser;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
}

function formatDurationCredits(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  if (safeSeconds === 0) return '0s';
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins.toLocaleString()}m ${secs}s`;
}

function formatDate(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStatusLabel(status: AdminCustomerRow['subscriptionStatus']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'text-emerald-700 font-medium' };
    case 'exhausted':
      return { label: 'Exhausted', className: 'text-amber-700 font-medium' };
    case 'expired':
      return { label: 'Expired', className: 'text-red-700 font-medium' };
    default:
      return { label: 'Active', className: 'text-slate-700 font-medium' };
  }
}

function formatPlanClass(planId: AdminCustomerRow['planId']): string {
  if (planId === 'max_pro') return 'text-slate-900 font-semibold';
  if (planId === 'pro') return 'text-slate-900 font-medium';
  return 'text-slate-600 font-normal';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  admin,
  onLogout,
  onSessionExpired,
}) => {
  const [overview, setOverview] = useState<AdminOverviewMetrics | null>(null);
  const [customers, setCustomers] = useState<AdminCustomerRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro' | 'max_pro'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'exhausted' | 'expired'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounce search input cleanly
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/admin/overview', {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        onSessionExpired();
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load platform overview.');
      }
      setOverview(data.overview);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load platform overview.');
    } finally {
      setLoadingOverview(false);
    }
  }, [onSessionExpired]);

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const qs = new URLSearchParams({
        search: appliedSearch,
        plan: planFilter,
        status: statusFilter,
        sort: sortOrder,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/customers?${qs.toString()}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        onSessionExpired();
        return;
      }
      const data = (await res.json()) as AdminCustomersResponse & { error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load customer subscriptions.');
      }
      setCustomers(data.customers);
      setPagination(data.pagination);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load customer subscription records.');
    } finally {
      setLoadingCustomers(false);
    }
  }, [appliedSearch, planFilter, statusFilter, sortOrder, page, pageSize, onSessionExpired]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleRefresh = () => {
    fetchOverview();
    fetchCustomers();
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setPlanFilter('all');
    setStatusFilter('all');
    setSortOrder('newest');
    setPage(1);
  };

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const hasActiveFilters =
    Boolean(appliedSearch) || planFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            CallBridge AI Admin
          </span>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 min-w-0">
            <span className="truncate">{admin.email}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap shrink-0">Read-only overview</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingOverview || loadingCustomers}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingOverview || loadingCustomers ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleLogoutClick}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5" />
              {loggingOut ? 'Signing out...' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Platform Subscriptions &amp; Credits
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Aggregated customer registrations, plan tiers, and call duration credit balances (1 minute = 60 seconds).
            </p>
          </div>
          {overview?.generatedAt && (
            <p className="text-xs text-slate-500 whitespace-nowrap">
              Updated {new Date(overview.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 rounded-md hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* 6 Required Overview Metric Cards */}
        <section aria-label="Platform Overview Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Registered Customers</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview ? '—' : (overview?.totalRegisteredCustomers ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Registered customer accounts only
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Free Plan Customers</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview ? '—' : (overview?.freePlanCustomers ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                On Free Trial tier (120s allowance)
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Upgraded Customers</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview ? '—' : (overview?.upgradedCustomers ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                Pro: {(overview?.proPlanCustomers ?? 0).toLocaleString()} · Max Pro: {(overview?.maxProPlanCustomers ?? 0).toLocaleString()}
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Credits Purchased</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview
                  ? '—'
                  : formatDurationCredits(overview?.totalCreditsPurchasedSeconds ?? 0)}
              </p>
              <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {(overview?.totalCreditsPurchasedSeconds ?? 0).toLocaleString()} seconds paid
              </p>
            </div>

            {/* Card 5 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Credits Used</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview
                  ? '—'
                  : formatDurationCredits(overview?.totalCreditsUsedSeconds ?? 0)}
              </p>
              <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {(overview?.totalCreditsUsedSeconds ?? 0).toLocaleString()} seconds consumed
              </p>
            </div>

            {/* Card 6 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Credits Remaining</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums">
                {loadingOverview && !overview
                  ? '—'
                  : formatDurationCredits(overview?.totalCreditsRemainingSeconds ?? 0)}
              </p>
              <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {(overview?.totalCreditsRemainingSeconds ?? 0).toLocaleString()} seconds available
              </p>
            </div>
          </div>
        </section>

        {/* Customer Subscription Table Section */}
        <section
          aria-label="Customer Subscription Table"
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          {/* Toolbar: Search, Plan Filter, Status Filter, Sort */}
          <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Customer Subscriptions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {customers.length} of {pagination.totalItems.toLocaleString()} matching customer account{pagination.totalItems === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative flex-1 sm:flex-none sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search Customer ID or email"
                  aria-label="Search by Customer ID or email"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>

              {/* Plan Filter */}
              <select
                value={planFilter}
                onChange={(e) => {
                  setPlanFilter(e.target.value as 'all' | 'free' | 'pro' | 'max_pro');
                  setPage(1);
                }}
                aria-label="Filter by subscription plan"
                className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 cursor-pointer"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="max_pro">Max Pro</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'active' | 'exhausted' | 'expired');
                  setPage(1);
                }}
                aria-label="Filter by subscription status"
                className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="exhausted">Exhausted</option>
                <option value="expired">Expired</option>
              </select>

              {/* Sort Toggle */}
              <button
                type="button"
                onClick={() => {
                  setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
                  setPage(1);
                }}
                className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
              </button>
            </div>
          </div>

          {/* Data Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">Customer ID</th>
                  <th className="py-3 px-4 whitespace-nowrap">Customer Email</th>
                  <th className="py-3 px-4 whitespace-nowrap">Registration Date</th>
                  <th className="py-3 px-4 whitespace-nowrap">Subscription Plan</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Credits Purchased</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Credits Used</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Remaining Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loadingCustomers ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="h-12">
                      <td className="py-3 px-4"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-40 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                      <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 px-6 text-center">
                      <p className="text-sm font-medium text-slate-900">
                        {hasActiveFilters
                          ? 'No customers match the selected filters.'
                          : 'No registered customers found.'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {hasActiveFilters
                          ? 'Adjust your search query, plan filter, or status filter to see more records.'
                          : 'Registered customer accounts and their credit balances will appear here automatically.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-4 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  customers.map((row) => {
                    const statusStyle = formatStatusLabel(row.subscriptionStatus);
                    return (
                      <tr
                        key={row.customerId}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {row.customerId}
                        </td>
                        <td className="py-3.5 px-4 text-slate-900 whitespace-nowrap">
                          {row.maskedEmail}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDate(row.registrationDate)}
                        </td>
                        <td className={`py-3.5 px-4 whitespace-nowrap ${formatPlanClass(row.planId)}`}>
                          {row.planName}
                        </td>
                        <td className={`py-3.5 px-4 whitespace-nowrap ${statusStyle.className}`}>
                          {statusStyle.label}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900">
                            {formatDurationCredits(row.creditsPurchasedSeconds)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.planId === 'free' && row.creditsPurchasedSeconds === 0
                              ? `Free trial: ${formatDurationCredits(row.freeAllowanceSeconds)}`
                              : `${row.creditsPurchasedSeconds.toLocaleString()}s`}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900">
                            {formatDurationCredits(row.creditsUsedSeconds)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.creditsUsedSeconds.toLocaleString()}s
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900 font-medium">
                            {formatDurationCredits(row.remainingCreditsSeconds)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.remainingCreditsSeconds.toLocaleString()}s
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-5 py-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Rows per page"
                className="h-8 px-2 rounded-md border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1 || loadingCustomers}
                  aria-label="Previous page"
                  className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages || loadingCustomers}
                  aria-label="Next page"
                  className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
