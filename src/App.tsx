import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MainHeader } from './components/MainHeader';
import { DashboardCards } from './components/DashboardCards';
import { EventWorkspace } from './components/EventWorkspace';
import { UpgradeView } from './components/UpgradeView';
import { VoiceStudioModal } from './components/VoiceStudioModal';
import { AuthPages, EmailVerificationScreen } from './components/AuthPages';
import { useAuth } from './context/AuthContext';
import { EventRecord, TenantUser, UserSubscription } from './types/callbridge';

type AppView = 'dashboard' | 'event' | 'upgrade';
type AuthRouteMode = 'login' | 'signup';

interface ParsedRoute {
  view: AppView | 'auth';
  authMode?: AuthRouteMode;
  eventType?: EventRecord['type'];
  eventId?: string;
}

const EVENT_TYPE_PATHS: Record<EventRecord['type'], string> = {
  public_survey: '/public-survey',
  political_campaign: '/political-campaign',
  marriage_event: '/marriage-event',
};

const CANONICAL_EVENT_IDS: Record<EventRecord['type'], string> = {
  public_survey: 'event_public_survey',
  political_campaign: 'event_political_campaign',
  marriage_event: 'event_marriage_event',
};

function parseRouteFromLocation(): ParsedRoute {
  if (typeof window === 'undefined') return { view: 'dashboard' };
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (rawPath === '/login') {
    return { view: 'auth', authMode: 'login' };
  }
  if (rawPath === '/signup') {
    return { view: 'auth', authMode: 'signup' };
  }
  if (rawPath === '/' || rawPath === '/dashboard') {
    return { view: 'dashboard' };
  }
  if (rawPath === '/upgrade') {
    return { view: 'upgrade' };
  }
  if (rawPath === '/public-survey') {
    return { view: 'event', eventType: 'public_survey' };
  }
  if (rawPath === '/political-campaign') {
    return { view: 'event', eventType: 'political_campaign' };
  }
  if (rawPath === '/marriage-event') {
    return { view: 'event', eventType: 'marriage_event' };
  }
  if (rawPath.startsWith('/events/')) {
    const id = decodeURIComponent(rawPath.slice('/events/'.length));
    if (id) return { view: 'event', eventId: id };
  }
  return { view: 'dashboard' };
}

function getPathForEvent(event: EventRecord): string {
  const canonicalId = CANONICAL_EVENT_IDS[event.type];
  if (!canonicalId || event.id === canonicalId) {
    return EVENT_TYPE_PATHS[event.type] || `/events/${encodeURIComponent(event.id)}`;
  }
  return `/events/${encodeURIComponent(event.id)}`;
}

function resolveEventForRoute(route: ParsedRoute, eventList: EventRecord[]): EventRecord | null {
  if (route.view !== 'event' || eventList.length === 0) return null;
  if (route.eventId) {
    return eventList.find((e) => e.id === route.eventId) || null;
  }
  if (route.eventType) {
    const canonicalId = CANONICAL_EVENT_IDS[route.eventType];
    return (
      eventList.find((e) => e.id === canonicalId) ||
      eventList.find((e) => e.type === route.eventType) ||
      null
    );
  }
  return null;
}

export default function App() {
  const {
    customerProfile,
    authenticatedTenant,
    isLoading: isAuthLoading,
    isAuthenticated,
    requiresEmailVerification,
    logout,
  } = useAuth();

  const [initialRoute] = useState<ParsedRoute>(() => parseRouteFromLocation());
  const [authMode, setAuthMode] = useState<AuthRouteMode>(
    initialRoute.view === 'auth' && initialRoute.authMode ? initialRoute.authMode : 'login'
  );
  const intendedProtectedPathRef = useRef<string>(
    initialRoute.view !== 'auth' && typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/dashboard'
  );

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [currentView, setCurrentView] = useState<AppView>(
    initialRoute.view === 'auth' ? 'dashboard' : initialRoute.view
  );
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);

  // Multi-Tenant SaaS State
  const [tenants, setTenants] = useState<TenantUser[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantUser | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  const pushBrowserUrl = useCallback((targetPath: string) => {
    if (typeof window === 'undefined') return;
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, []);

  const replaceBrowserUrl = useCallback((targetPath: string) => {
    if (typeof window === 'undefined') return;
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
  }, []);

  // Fetch all 3 canonical events (only when authenticated)
  const fetchEvents = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingEvents(true);
    try {
      const res = await fetch('/api/callbridge/events');
      if (!res.ok) return;
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err) {
      console.warn('Failed to load events:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [isAuthenticated]);

  // Fetch authenticated customer's own tenant
  const fetchTenants = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/callbridge/tenants');
      if (!res.ok) return;
      const data = await res.json();
      if (data.tenants && Array.isArray(data.tenants) && data.tenants.length > 0) {
        setTenants(data.tenants);
        setCurrentTenant(data.tenants[0]);
      }
    } catch (err) {
      console.warn('Failed to load tenants:', err);
    }
  }, [isAuthenticated]);

  // Fetch subscription for authenticated customer (server derives identity from verified token)
  const fetchSubscription = useCallback(async (tenantId?: string) => {
    if (!isAuthenticated) return;
    const id = tenantId || currentTenant?.id || customerProfile?.tenantId;
    if (!id) return;
    try {
      const res = await fetch(`/api/callbridge/billing/subscription?userId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.subscription) {
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.warn('Failed to load subscription:', err);
    }
  }, [isAuthenticated, currentTenant?.id, customerProfile?.tenantId]);

  // Enforce route redirects between unauthenticated (/login, /signup) and protected customer routes
  useEffect(() => {
    if (isAuthLoading) return;

    const route = parseRouteFromLocation();
    if (!isAuthenticated && !requiresEmailVerification) {
      if (route.view !== 'auth') {
        const currentFull = `${window.location.pathname}${window.location.search}`;
        if (currentFull && currentFull !== '/' && currentFull !== '/login' && currentFull !== '/signup') {
          intendedProtectedPathRef.current = currentFull;
        } else {
          intendedProtectedPathRef.current = '/dashboard';
        }
        setAuthMode('login');
        replaceBrowserUrl('/login');
      } else if (route.authMode) {
        setAuthMode(route.authMode);
      }
      setEvents([]);
      setSelectedEvent(null);
      setTenants([]);
      setCurrentTenant(null);
      setSubscription(null);
      return;
    }

    if (isAuthenticated && route.view === 'auth') {
      const target = intendedProtectedPathRef.current || '/dashboard';
      intendedProtectedPathRef.current = '/dashboard';
      replaceBrowserUrl(target);
      const nextRoute = parseRouteFromLocation();
      setCurrentView(nextRoute.view === 'auth' ? 'dashboard' : nextRoute.view);
    }
  }, [isAuthLoading, isAuthenticated, requiresEmailVerification, replaceBrowserUrl]);

  // Load customer data once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    if (authenticatedTenant) {
      setCurrentTenant(authenticatedTenant);
      setTenants([authenticatedTenant]);
    }
    fetchEvents();
    fetchTenants();
  }, [isAuthenticated, authenticatedTenant, fetchEvents, fetchTenants]);

  useEffect(() => {
    if (isAuthenticated && (currentTenant?.id || customerProfile?.tenantId)) {
      fetchSubscription(currentTenant?.id || customerProfile?.tenantId);
    }
  }, [isAuthenticated, currentTenant?.id, customerProfile?.tenantId, fetchSubscription]);

  // Restore module route on initial load / browser refresh once events load
  useEffect(() => {
    if (!isAuthenticated) return;
    const route = parseRouteFromLocation();
    if (route.view === 'event') {
      if (events.length > 0) {
        const matched = resolveEventForRoute(route, events);
        if (matched) {
          setSelectedEvent((prev) => (prev?.id === matched.id ? prev : matched));
          setCurrentView('event');
        } else if (!isLoadingEvents) {
          setSelectedEvent(null);
          setCurrentView('dashboard');
          replaceBrowserUrl('/dashboard');
        }
      }
    } else if (route.view === 'upgrade') {
      setSelectedEvent(null);
      setCurrentView('upgrade');
    } else if (route.view === 'dashboard') {
      setSelectedEvent(null);
      setCurrentView('dashboard');
    }
  }, [isAuthenticated, events, isLoadingEvents, replaceBrowserUrl]);

  // Keep view synchronized with Browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const route = parseRouteFromLocation();
      if (!isAuthenticated) {
        if (route.view === 'auth' && route.authMode) {
          setAuthMode(route.authMode);
        } else {
          setAuthMode('login');
          replaceBrowserUrl('/login');
        }
        return;
      }

      if (route.view === 'auth') {
        setSelectedEvent(null);
        setCurrentView('dashboard');
        replaceBrowserUrl('/dashboard');
        return;
      }

      if (route.view === 'event') {
        const matched = resolveEventForRoute(route, events);
        if (matched) {
          setSelectedEvent(matched);
          setCurrentView('event');
        } else {
          setSelectedEvent(null);
          setCurrentView('dashboard');
        }
      } else {
        setSelectedEvent(null);
        setCurrentView(route.view);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated, events, replaceBrowserUrl]);

  const handleSelectEvent = (event: EventRecord) => {
    setSelectedEvent(event);
    setCurrentView('event');
    pushBrowserUrl(getPathForEvent(event));
    fetchEvents();
    fetchTenants();
  };

  const handleUpdateEvent = (updated: EventRecord) => {
    setSelectedEvent(updated);
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleNavigateView = (view: AppView) => {
    setCurrentView(view);
    if (view === 'dashboard') {
      setSelectedEvent(null);
      pushBrowserUrl('/dashboard');
      fetchEvents();
      fetchTenants();
      if (currentTenant) fetchSubscription(currentTenant.id);
    } else if (view === 'upgrade') {
      setSelectedEvent(null);
      pushBrowserUrl('/upgrade');
    }
  };

  const handleLogout = async () => {
    await logout();
    intendedProtectedPathRef.current = '/dashboard';
    setSelectedEvent(null);
    setCurrentView('dashboard');
    setAuthMode('login');
    pushBrowserUrl('/login');
  };

  // Initial authentication session check
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-500 flex items-center justify-center text-sm font-medium">
        Verifying session...
      </div>
    );
  }

  // Enforce email verification for Email/Password customer accounts
  if (requiresEmailVerification) {
    return <EmailVerificationScreen />;
  }

  // Protected access gate: unauthenticated visitors see Login / Signup experience
  if (!isAuthenticated) {
    return (
      <AuthPages
        mode={authMode}
        onSwitchMode={(nextMode) => {
          setAuthMode(nextMode);
          pushBrowserUrl(nextMode === 'signup' ? '/signup' : '/login');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Simplified SaaS Navigation Header: Dashboard, Upgrade, Plan Status, and Logout */}
      <MainHeader
        currentView={currentView}
        selectedEvent={selectedEvent}
        currentTenant={currentTenant}
        subscription={subscription}
        tenants={tenants}
        onSelectTenant={(t) => {
          setCurrentTenant(t);
          fetchSubscription(t.id);
        }}
        onRefreshTenants={fetchTenants}
        onNavigate={handleNavigateView}
        onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
        customerEmail={customerProfile?.email}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardCards
            events={events}
            onSelectEvent={handleSelectEvent}
            subscription={subscription}
            currentTenant={currentTenant}
            onNavigateToUpgrade={() => handleNavigateView('upgrade')}
          />
        )}

        {currentView === 'upgrade' && (
          <UpgradeView
            currentTenant={currentTenant}
            subscription={subscription}
            onRefreshSubscription={() => {
              if (currentTenant) fetchSubscription(currentTenant.id);
            }}
            onBackToDashboard={() => handleNavigateView('dashboard')}
          />
        )}

        {currentView === 'event' && selectedEvent && (
          <EventWorkspace
            key={selectedEvent.id}
            event={selectedEvent}
            currentTenant={currentTenant}
            onBackToDashboard={() => handleNavigateView('dashboard')}
            onUpdateEvent={handleUpdateEvent}
          />
        )}

        {currentView === 'event' && !selectedEvent && isLoadingEvents && (
          <div className="py-20 text-center text-sm text-slate-500">
            Loading workspace...
          </div>
        )}
      </main>

      {/* Global Shared Voice Studio Modal */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => {
          setIsVoiceStudioOpen(false);
          fetchEvents();
          fetchTenants();
        }}
        currentTenant={currentTenant}
        onTenantUpdated={fetchTenants}
        eventType={selectedEvent?.type}
        eventId={selectedEvent?.id}
        language={selectedEvent?.language}
        selectedVoiceId={selectedEvent?.selectedVoiceProfileId}
        voiceSelectionType={selectedEvent?.voiceSelectionType}
        onSelectVoice={(profile) => {
          const voiceId = profile.providerVoiceId || profile.elevenLabsVoiceId || profile.id;
          if (selectedEvent) {
            handleUpdateEvent({
              ...selectedEvent,
              selectedVoiceProfileId: voiceId,
              voiceSelectionType: 'cloned',
              selectedVoiceName: profile.name || profile.voiceName,
              selectedVoiceSlotLabel: undefined,
            });
          }
          fetchEvents();
          fetchTenants();
        }}
        onEventVoiceUpdated={(updatedEvent) => {
          handleUpdateEvent(updatedEvent);
        }}
      />
    </div>
  );
}
