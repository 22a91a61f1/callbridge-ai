import React, { useState } from 'react';
import { Eye, EyeOff, Lock, AlertCircle } from 'lucide-react';
import type { AdminSessionUser } from './types';

interface AdminLoginPageProps {
  configured: boolean | null;
  onLoginSuccess: (user: AdminSessionUser) => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  configured,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Enter both your Admin email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.error || 'Authentication failed. Check your credentials and try again.');
        setSubmitting(false);
        return;
      }

      setPassword('');
      onLoginSuccess({
        email: payload.admin.email,
        role: 'admin',
        csrfToken: payload.csrfToken,
        expiresAt: payload.expiresAt,
      });
    } catch {
      setErrorMessage('Unable to reach the Admin authentication server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              CallBridge AI Admin
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Authorized platform administration access
            </p>
          </div>
        </div>

        {configured === false && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Admin credentials are not configured yet on this server. Set{' '}
              <code className="font-mono font-medium">ADMIN_EMAIL</code> and{' '}
              <code className="font-mono font-medium">ADMIN_PASSWORD</code> in your deployment environment settings before signing in.
            </span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="admin-email"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="admin@example.com"
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors disabled:bg-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="Enter Admin password"
                className="w-full h-11 pl-3.5 pr-11 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 mt-2 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};
