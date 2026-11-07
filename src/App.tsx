import React, { useState, useEffect, useCallback } from 'react';
import { MainHeader } from './components/MainHeader';
import { DashboardCards } from './components/DashboardCards';
import { EventWorkspace } from './components/EventWorkspace';
import { UpgradeView } from './components/UpgradeView';
import { VoiceStudioModal } from './components/VoiceStudioModal';
import { EventRecord, TenantUser, UserSubscription } from './types/callbridge';

export default function App() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'event' | 'upgrade'>('dashboard');
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);

  // Multi-Tenant SaaS State
  const [tenants, setTenants] = useState<TenantUser[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantUser | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  // Fetch all 3 canonical events
  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch('/api/callbridge/events');
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err) {
      console.warn('Failed to load events:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/callbridge/tenants');
      const data = await res.json();
      if (data.tenants && Array.isArray(data.tenants) && data.tenants.length > 0) {
        setTenants(data.tenants);
        setCurrentTenant((prev) => {
          if (prev) {
            const updated = data.tenants.find((t: TenantUser) => t.id === prev.id);
            return updated || data.tenants[0];
          }
          return data.tenants[0];
        });
      }
    } catch (err) {
      console.warn('Failed to load tenants:', err);
    }
  }, []);

  // Fetch subscription for current tenant
  const fetchSubscription = useCallback(async (tenantId?: string) => {
    const id = tenantId || currentTenant?.id;
    if (!id) return;
    try {
      const res = await fetch(`/api/callbridge/billing/subscription?userId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.subscription) {
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.warn('Failed to load subscription:', err);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchEvents();
    fetchTenants();
  }, [fetchEvents, fetchTenants]);

  useEffect(() => {
    if (currentTenant?.id) {
      fetchSubscription(currentTenant.id);
    }
  }, [currentTenant?.id, fetchSubscription]);

  const handleSelectEvent = (event: EventRecord) => {
    setSelectedEvent(event);
    setCurrentView('event');
    fetchEvents();
    fetchTenants();
  };

  const handleUpdateEvent = (updated: EventRecord) => {
    setSelectedEvent(updated);
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Simplified SaaS Navigation Header: STRICTLY Dashboard and Upgrade only */}
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
        onNavigate={(view) => {
          setCurrentView(view);
          if (view === 'dashboard') {
            setSelectedEvent(null);
            fetchEvents();
            fetchTenants();
            if (currentTenant) fetchSubscription(currentTenant.id);
          }
        }}
        onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardCards
            events={events}
            onSelectEvent={handleSelectEvent}
            subscription={subscription}
            currentTenant={currentTenant}
            onNavigateToUpgrade={() => setCurrentView('upgrade')}
          />
        )}

        {currentView === 'upgrade' && (
          <UpgradeView
            currentTenant={currentTenant}
            subscription={subscription}
            onRefreshSubscription={() => {
              if (currentTenant) fetchSubscription(currentTenant.id);
            }}
            onBackToDashboard={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'event' && selectedEvent && (
          <EventWorkspace
            event={selectedEvent}
            currentTenant={currentTenant}
            onBackToDashboard={() => {
              setSelectedEvent(null);
              setCurrentView('dashboard');
              fetchEvents();
              fetchTenants();
              if (currentTenant) fetchSubscription(currentTenant.id);
            }}
            onUpdateEvent={handleUpdateEvent}
          />
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
        selectedVoiceId={selectedEvent?.selectedVoiceProfileId}
        onSelectVoice={(profile) => {
          const voiceId = profile.providerVoiceId || profile.elevenLabsVoiceId || profile.id;
          if (selectedEvent) {
            handleUpdateEvent({
              ...selectedEvent,
              selectedVoiceProfileId: voiceId,
            });
          }
          fetchEvents();
          fetchTenants();
        }}
      />
    </div>
  );
}
