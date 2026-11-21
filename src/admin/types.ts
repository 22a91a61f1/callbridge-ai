export interface AdminSessionUser {
  email: string;
  role: 'admin';
  csrfToken: string;
  expiresAt: string;
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

export interface AdminCustomerRow {
  customerId: string;
  maskedEmail: string;
  registrationDate: string;
  planId: 'free' | 'pro' | 'max_pro';
  planName: 'Free' | 'Pro' | 'Max Pro';
  subscriptionStatus: 'active' | 'exhausted' | 'expired';
  creditsPurchasedSeconds: number;
  creditsUsedSeconds: number;
  remainingCreditsSeconds: number;
  freeAllowanceSeconds: number;
  source: 'firebase_auth' | 'legacy_tenant';
}

export interface AdminCustomersResponse {
  success: boolean;
  customers: AdminCustomerRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    search: string;
    plan: 'all' | 'free' | 'pro' | 'max_pro';
    status: 'all' | 'active' | 'exhausted' | 'expired';
    sort: 'newest' | 'oldest';
  };
}
