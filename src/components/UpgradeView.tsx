import React, { useState, useEffect } from 'react';
import {
  Check,
  Zap,
  Shield,
  Crown,
  Sparkles,
  PhoneCall,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Building2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  PlanConfig,
  UserSubscription,
  SubscriptionPlanId,
  TenantUser,
} from '../types/callbridge';

interface UpgradeViewProps {
  currentTenant: TenantUser | null;
  subscription: UserSubscription | null;
  onRefreshSubscription: () => void;
  onBackToDashboard: () => void;
}

export function UpgradeView({
  currentTenant,
  subscription,
  onRefreshSubscription,
  onBackToDashboard,
}: UpgradeViewProps) {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanConfig | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = useState<string | null>(null);

  const [testingUsage, setTestingUsage] = useState<{
    active: boolean;
    completedTestCalls: number;
    totalTestCalls: number;
    policy: string;
  } | null>(null);

  // Fetch plans and testing usage from existing backend records
  const fetchPlansAndUsage = async () => {
    setIsLoadingPlans(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch('/api/callbridge/billing/plans'),
        fetch(`/api/callbridge/billing/subscription?userId=${encodeURIComponent(currentTenant?.id || 'client_001')}`),
      ]);
      const plansData = await plansRes.json();
      if (plansData.plans && Array.isArray(plansData.plans)) {
        setPlans(plansData.plans);
      }
      const subData = await subRes.json();
      if (subData.testingMode) {
        setTestingUsage(subData.testingMode);
      }
    } catch (e) {
      console.warn('Failed to load plans or testing usage:', e);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  useEffect(() => {
    fetchPlansAndUsage();
  }, [currentTenant?.id]);

  const handleStartCheckout = (plan: PlanConfig) => {
    setCheckoutError(null);
    setCheckoutSuccessMessage(null);
    setSelectedPlanForCheckout(plan);
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleConfirmPayment = async (forceDirect = false) => {
    if (!selectedPlanForCheckout || !currentTenant) return;
    setIsProcessingCheckout(true);
    setCheckoutError(null);
    setCheckoutSuccessMessage(null);

    try {
      // 1. Create Authoritative Order via Backend
      const orderRes = await fetch('/api/callbridge/billing/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanForCheckout.id,
          userId: currentTenant.id,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.order) {
        throw new Error(orderData.error || 'Failed to initialize payment order');
      }

      const { orderId, amount, currency, keyId } = orderData.order;

      // 2. Open official Razorpay Checkout modal unless forced direct
      if (!forceDirect) {
        await loadRazorpayScript();
      }

      if (!forceDirect && typeof (window as any).Razorpay !== 'undefined') {
        const options = {
          key: keyId || 'rzp_test_callbridge_demo',
          amount: (amount || selectedPlanForCheckout.price) * 100, // paise
          currency: currency || 'INR',
          name: 'CallBridge AI',
          description: `${selectedPlanForCheckout.name} — ${Math.floor(selectedPlanForCheckout.includedSeconds / 60)} Mins (${selectedPlanForCheckout.includedSeconds}s)`,
          order_id: orderId,
          prefill: {
            name: currentTenant.name || 'CallBridge Enterprise Client',
            email: currentTenant.email || 'billing@callbridge.ai',
            contact: '+919876543210',
          },
          theme: {
            color: '#4f46e5',
          },
          modal: {
            ondismiss: () => {
              setIsProcessingCheckout(false);
              setCheckoutError('Payment cancelled. Your subscription was not changed.');
            },
          },
          handler: async (response: any) => {
            try {
              setIsProcessingCheckout(true);
              const verifyRes = await fetch('/api/callbridge/billing/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId,
                  paymentId: response.razorpay_payment_id || `pay_${Date.now()}`,
                  signature: response.razorpay_signature || `sig_${Date.now()}`,
                  planId: selectedPlanForCheckout.id,
                  userId: currentTenant.id,
                }),
              });

              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.error || 'Payment signature verification failed.');
              }

              setCheckoutSuccessMessage(
                `Payment successful! Upgraded to ${selectedPlanForCheckout.name}. ${Math.floor(
                  selectedPlanForCheckout.includedSeconds / 60
                )} minutes (${selectedPlanForCheckout.includedSeconds} seconds) talk time credited to your account.`
              );
              onRefreshSubscription();

              setTimeout(() => {
                setSelectedPlanForCheckout(null);
                setCheckoutSuccessMessage(null);
              }, 2500);
            } catch (err: any) {
              setCheckoutError(err.message || 'Payment verification failed');
            } finally {
              setIsProcessingCheckout(false);
            }
          },
        };

        const razorpayInstance = new (window as any).Razorpay(options);
        razorpayInstance.on('payment.failed', (resp: any) => {
          setIsProcessingCheckout(false);
          setCheckoutError(resp.error?.description || 'Payment failed. Please try another payment method.');
        });
        razorpayInstance.open();
      } else {
        // Direct / Sandbox Verification Flow
        const verifyRes = await fetch('/api/callbridge/billing/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            paymentId: `pay_sandbox_${Date.now()}`,
            signature: `sig_sandbox_${Date.now()}`,
            planId: selectedPlanForCheckout.id,
            userId: currentTenant.id,
          }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error || 'Payment verification failed');
        }

        setCheckoutSuccessMessage(
          `Successfully upgraded to ${selectedPlanForCheckout.name}! ${Math.floor(
            selectedPlanForCheckout.includedSeconds / 60
          )} minutes (${selectedPlanForCheckout.includedSeconds} seconds) credited to your account.`
        );
        onRefreshSubscription();

        setTimeout(() => {
          setSelectedPlanForCheckout(null);
          setCheckoutSuccessMessage(null);
        }, 2000);
        setIsProcessingCheckout(false);
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Payment processing failed');
      setIsProcessingCheckout(false);
    }
  };

  const formatSecondsToMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (mins === 0) return `${remainingSecs}s`;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins} mins`;
  };

  const currentPlanId = subscription?.planId || 'free';
  const remainingSeconds = subscription?.remainingSeconds ?? 0;
  const totalSeconds = subscription?.totalSeconds ?? 0;
  const usedSeconds = subscription?.usedSeconds ?? 0;
  const usagePercent = totalSeconds > 0 ? Math.min(100, Math.round((usedSeconds / totalSeconds) * 100)) : 0;
  const completedTestCalls = testingUsage?.completedTestCalls ?? subscription?.completedTestCalls ?? 2;
  const productionCallsCount = (subscription as any)?.productionCallsCount ?? 0;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-400/30">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>High-Fidelity Outbound Telephony Calling Plans</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Transparent, Duration-Based Pricing
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Pay only for connected call time in exact seconds. No per-seat license fees. Zero charges for unanswered, busy, or failed numbers.
          </p>
        </div>
      </div>

      {/* Testing Mode & Usage Separation Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Environment:</span>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Testing Mode Active</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                {currentPlanId.toUpperCase()} PLAN
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Internal test calls do not consume paid production quota or force a paid subscription upgrade.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs font-semibold text-slate-400">Account Client: </span>
            <span className="text-xs font-bold text-slate-800">{currentTenant?.organizationName || 'Client Account'}</span>
          </div>
        </div>

        {/* 3-Way Strict Separation: 1. Internal Test Calls | 2. Actual Customer Calls | 3. Paid Subscription Usage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Internal Test Calls */}
          <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200/90 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                1. Internal Test Calls
              </span>
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-indigo-700">{completedTestCalls}</span>
              <span className="text-xs font-semibold text-indigo-600">Completed Calls</span>
            </div>
            <p className="text-[11px] text-indigo-800/80 leading-relaxed">
              Authorized testing mode active. Completed test calls are exempt from credit deductions and do not trigger forced upgrades.
            </p>
          </div>

          {/* 2. Customer / Production Calls */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Customer / Production Calls
              </span>
              <Building2 className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-slate-800">{productionCallsCount}</span>
              <span className="text-xs font-semibold text-slate-500">Live Campaign Calls</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Real outbound broadcasts to citizens, voters, and wedding guests dispatched via live campaigns.
            </p>
          </div>

          {/* 3. Paid Subscription Usage */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                3. Paid Subscription Usage
              </span>
              <CreditCard className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-slate-800">
                {currentPlanId === 'free' ? 'Free Tier Active' : `${formatSecondsToMinutes(remainingSeconds)}`}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {currentPlanId === 'free' ? 'No Upgrade Required' : 'Remaining Balance'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {currentPlanId === 'free'
                ? 'Your free trial status is preserved. Upgrade only when you wish to purchase production minutes.'
                : `${usedSeconds}s used of ${totalSeconds}s purchased talk time.`}
            </p>
          </div>
        </div>
      </div>

      {/* 3-Tier SaaS Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tier 1: Free Plan */}
        <div
          className={`rounded-3xl border p-6 flex flex-col justify-between transition-all ${
            currentPlanId === 'free'
              ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-white shadow-lg'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                <PhoneCall className="w-5 h-5" />
              </div>
              {currentPlanId === 'free' && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                  Current Plan
                </span>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">Free Plan</h3>
              <p className="text-xs text-slate-500 mt-0.5">Explore CallBridge AI telephony features</p>
            </div>

            <div className="pt-2">
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-extrabold text-slate-900">₹0</span>
                <span className="text-xs text-slate-400">/ forever</span>
              </div>
              <div className="text-xs font-semibold text-indigo-600 mt-1">2 Completed Calls Allowance</div>
            </div>

            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>2 completed live telephone calls for verification</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Public Survey (10 Telugu civic amenity questions)</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Political outreach DTMF keypad capture</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Standard voice playback</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            {currentPlanId === 'free' ? (
              <button
                disabled
                className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold cursor-default"
              >
                Current Active Plan
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-400 text-xs font-semibold"
              >
                Base Tier
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Pro Plan (Recommended) */}
        <div
          className={`rounded-3xl border-2 p-6 flex flex-col justify-between relative transition-all ${
            currentPlanId === 'pro'
              ? 'border-indigo-600 ring-4 ring-indigo-500/20 bg-gradient-to-b from-indigo-50/40 to-white shadow-xl'
              : 'border-indigo-500 bg-white hover:shadow-xl shadow-md'
          }`}
        >
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white shadow-md shadow-indigo-500/30">
              ⭐ Most Popular / Recommended
            </span>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/30">
                <Zap className="w-5 h-5" />
              </div>
              {currentPlanId === 'pro' && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  Current Plan
                </span>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">Pro Plan</h3>
              <p className="text-xs text-slate-500 mt-0.5">High-volume outbound campaign operations</p>
            </div>

            <div className="pt-2">
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-extrabold text-slate-900">₹2,499</span>
                <span className="text-xs text-slate-400">/ 30 days</span>
              </div>
              <div className="text-xs font-extrabold text-indigo-600 mt-1">
                30 Minutes Connected Talk Time (1,800s)
              </div>
            </div>

            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>1,800 seconds (30 mins)</strong> connected call duration
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>Exact integer-second billing with zero waste</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>ElevenLabs authentic cloned voices</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>Sequential queue manager with instant Stop &amp; Cancel</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>Full CSV / Excel contact import &amp; export</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            {currentPlanId === 'pro' ? (
              <button
                disabled
                className="w-full py-2.5 rounded-xl bg-indigo-100 text-indigo-800 text-xs font-bold cursor-default"
              >
                Current Active Plan
              </button>
            ) : (
              <button
                onClick={() => {
                  const p = plans.find((x) => x.id === 'pro') || {
                    id: 'pro',
                    name: 'Pro Plan',
                    price: 2499,
                    currency: 'INR',
                    includedSeconds: 1800,
                    validityDays: 30,
                    features: [],
                  };
                  handleStartCheckout(p);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Upgrade to Pro Plan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tier 3: Max Pro Plan */}
        <div
          className={`rounded-3xl border p-6 flex flex-col justify-between transition-all ${
            currentPlanId === 'max_pro'
              ? 'border-purple-600 ring-2 ring-purple-500/20 bg-white shadow-lg'
              : 'border-slate-200 bg-white hover:border-purple-300 shadow-sm'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-500/25">
                <Crown className="w-5 h-5" />
              </div>
              {currentPlanId === 'max_pro' && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                  Current Plan
                </span>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">Max Pro Plan</h3>
              <p className="text-xs text-slate-500 mt-0.5">Large-scale civic surveys &amp; party campaigns</p>
            </div>

            <div className="pt-2">
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-extrabold text-slate-900">₹5,999</span>
                <span className="text-xs text-slate-400">/ 60 days</span>
              </div>
              <div className="text-xs font-extrabold text-purple-600 mt-1">
                90 Minutes Connected Talk Time (5,400s)
              </div>
            </div>

            <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>5,400 seconds (90 mins)</strong> connected call duration
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>Dedicated carrier trunking and priority queue dispatch</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>All 3 modules: Public Survey, Political Campaign, Marriage</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>Multi-tenant isolation &amp; custom voice profiles</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>Priority live transcript generation and audio exports</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            {currentPlanId === 'max_pro' ? (
              <button
                disabled
                className="w-full py-2.5 rounded-xl bg-purple-100 text-purple-800 text-xs font-bold cursor-default"
              >
                Current Active Plan
              </button>
            ) : (
              <button
                onClick={() => {
                  const p = plans.find((x) => x.id === 'max_pro') || {
                    id: 'max_pro',
                    name: 'Max Pro Plan',
                    price: 5999,
                    currency: 'INR',
                    includedSeconds: 5400,
                    validityDays: 60,
                    features: [],
                  };
                  handleStartCheckout(p);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Upgrade to Max Pro</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Checkout Modal */}
      {selectedPlanForCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 border border-slate-200 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Secure SaaS Checkout</h3>
                  <p className="text-[11px] text-slate-400">Order &amp; Activation Gateway</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlanForCheckout(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Selected Plan:</span>
                <span className="font-bold text-slate-900">{selectedPlanForCheckout.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Included Calling Duration:</span>
                <span className="font-bold text-indigo-700">
                  {Math.floor(selectedPlanForCheckout.includedSeconds / 60)} minutes ({selectedPlanForCheckout.includedSeconds} seconds)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Validity:</span>
                <span className="font-medium text-slate-700">{selectedPlanForCheckout.validityDays} Days</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-800">Total Payable:</span>
                <span className="font-extrabold text-lg text-slate-900">
                  ₹{selectedPlanForCheckout.price.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="text-[11px] font-bold uppercase text-slate-500">Payment Gateway: Razorpay Standard Checkout</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Supports instant payment via <strong>UPI (Google Pay, PhonePe, Paytm), Credit &amp; Debit Cards, and Netbanking</strong>. Upon successful payment verification, {selectedPlanForCheckout.includedSeconds} seconds talk time is credited to your active account immediately.
              </p>
            </div>

            {checkoutError && (
              <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            {checkoutSuccessMessage && (
              <div className="flex items-center space-x-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{checkoutSuccessMessage}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleConfirmPayment(true)}
                disabled={isProcessingCheckout}
                className="text-[11px] text-slate-400 hover:text-indigo-600 font-medium underline cursor-pointer"
                title="Direct activation for automated test or sandbox mode"
              >
                Sandbox Direct Activation
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedPlanForCheckout(null)}
                  disabled={isProcessingCheckout}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmPayment(false)}
                  disabled={isProcessingCheckout}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-50"
                >
                  {isProcessingCheckout ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Opening Gateway...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pay ₹{selectedPlanForCheckout.price.toLocaleString()} With Razorpay</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
