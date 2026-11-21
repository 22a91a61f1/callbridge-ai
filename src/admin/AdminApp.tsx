import React, { useCallback, useEffect, useState } from 'react';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminDashboard } from './AdminDashboard';
import type { AdminSessionUser } from './types';

export const AdminApp: React.FC = () => {
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    try {
      const [statusRes, meRes] = await Promise.all([
        fetch('/api/admin/auth/status', { credentials: 'include' }).catch(() => null),
        fetch('/api/admin/auth/me', { credentials: 'include' }).catch(() => null),
      ]);

      if (statusRes && statusRes.ok) {
        const statusJson = await statusRes.json().catch(() => null);
        if (statusJson && typeof statusJson.configured === 'boolean') {
          setConfigured(statusJson.configured);
        }
      }

      if (meRes && meRes.ok) {
        const meJson = await meRes.json().catch(() => null);
        if (meJson?.success && meJson?.admin?.role === 'admin') {
          setAdminUser({
            email: meJson.admin.email,
            role: 'admin',
            csrfToken: meJson.csrfToken,
            expiresAt: meJson.expiresAt,
          });
          setCheckingSession(false);
          return;
        }
      }

      setAdminUser(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogout = useCallback(async () => {
    try {
      if (adminUser?.csrfToken) {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-CSRF-Token': adminUser.csrfToken,
          },
        });
      }
    } finally {
      setAdminUser(null);
    }
  }, [adminUser]);

  const handleSessionExpired = useCallback(() => {
    setAdminUser(null);
  }, []);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Verifying Admin session...</div>
      </div>
    );
  }

  if (!adminUser) {
    return (
      <AdminLoginPage
        configured={configured}
        onLoginSuccess={(user) => setAdminUser(user)}
      />
    );
  }

  return (
    <AdminDashboard
      admin={adminUser}
      onLogout={handleLogout}
      onSessionExpired={handleSessionExpired}
    />
  );
};

export default AdminApp;
