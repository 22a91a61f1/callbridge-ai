import React, { useState } from 'react';
import {
  PhoneCall,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthPagesProps {
  mode: 'login' | 'signup';
  onSwitchMode: (mode: 'login' | 'signup') => void;
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45c-.28 1.48-1.12 2.74-2.38 3.58v2.98h3.85c2.25-2.07 3.57-5.12 3.57-8.59z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.85-2.98c-1.07.72-2.44 1.14-4.08 1.14-3.14 0-5.8-2.12-6.75-4.97H1.27v3.08C3.24 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.28A7.22 7.22 0 0 1 4.87 12c0-.79.14-1.56.38-2.28V6.64H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l3.98-3.08z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.24 2.7 1.27 6.64l3.98 3.08C6.2 6.87 8.86 4.75 12 4.75z"
      />
    </svg>
  );
}

export function EmailVerificationScreen() {
  const {
    firebaseUser,
    resendVerificationEmail,
    refreshEmailVerification,
    logout,
  } = useAuth();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const handleResend = async () => {
    setIsSending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await resendVerificationEmail();
      setStatusMessage('Verification email sent. Please check your inbox and spam folder.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to send verification email right now.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCheckVerified = async () => {
    setIsChecking(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const verified = await refreshEmailVerification();
      if (!verified) {
        setErrorMessage('Your email is not verified yet. Please click the verification link sent to your inbox, then try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to check verification status.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Verify Your Email Address</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-semibold text-slate-800">{firebaseUser?.email}</span>.
              Verify your email to access your CallBridge AI workspace.
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCheckVerified}
            disabled={isChecking}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-60"
          >
            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{isChecking ? 'Checking Status...' : "I've Verified My Email — Continue"}</span>
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={isSending}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            <span>{isSending ? 'Sending...' : 'Resend Verification Email'}</span>
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out &amp; Use Another Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuthPages({ mode, onSwitchMode }: AuthPagesProps) {
  const {
    signupWithEmail,
    loginWithEmail,
    signInWithGoogle,
    requestPasswordReset,
    clearAuthError,
  } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const switchView = (target: 'login' | 'signup') => {
    setLocalError(null);
    setInfoMessage(null);
    setIsForgotPasswordMode(false);
    clearAuthError();
    onSwitchMode(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (isForgotPasswordMode) {
      setIsSubmitting(true);
      try {
        await requestPasswordReset(trimmedEmail);
        setInfoMessage(
          'Password reset link sent. Please check your email inbox (and spam folder) to reset your password.'
        );
      } catch (err: any) {
        setLocalError(err?.message || 'Unable to send password reset email.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setLocalError('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Password and Confirm Password do not match.');
        return;
      }
    } else if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        await signupWithEmail(fullName.trim(), trimmedEmail, password);
      } else {
        await loginWithEmail(trimmedEmail, password);
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLocalError(null);
    setInfoMessage(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setLocalError(err?.message || 'Google sign-in failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center px-4 py-10 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* CallBridge AI Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="font-extrabold text-xl tracking-tight text-slate-900">
                CallBridge <span className="text-indigo-600">AI</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium -mt-0.5">
                Enterprise Voice Telephony
              </div>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/60 p-7 sm:p-8 space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-extrabold text-slate-900">
              {isForgotPasswordMode
                ? 'Reset Your Password'
                : mode === 'signup'
                ? 'Create Customer Account'
                : 'Sign In to CallBridge AI'}
            </h1>
            <p className="text-xs text-slate-500">
              {isForgotPasswordMode
                ? 'Enter your registered email address and we will send a password reset link.'
                : mode === 'signup'
                ? 'Register to access Public Survey, Political Campaign, and Marriage Event workspaces.'
                : 'Access your CallBridge AI dashboard and voice campaign modules.'}
            </p>
          </div>

          {localError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{localError}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">{infoMessage}</span>
            </div>
          )}

          {!isForgotPasswordMode && (
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs flex items-center justify-center space-x-2.5 transition-all cursor-pointer disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                ) : (
                  <GoogleIcon />
                )}
                <span>
                  {isGoogleLoading
                    ? 'Connecting to Google...'
                    : mode === 'signup'
                    ? 'Sign Up with Google'
                    : 'Continue with Google'}
                </span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-slate-200" />
                <span className="px-3 bg-white text-[11px] font-medium text-slate-400 shrink-0">
                  or continue with email
                </span>
                <div className="w-full border-t border-slate-200" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && !isForgotPasswordMode && (
              <div className="space-y-1.5">
                <label htmlFor="auth-fullname" className="block text-xs font-semibold text-slate-700">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-fullname"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
            </div>

            {!isForgotPasswordMode && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError(null);
                        setInfoMessage(null);
                        setIsForgotPasswordMode(true);
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signup' && !isForgotPasswordMode && (
              <div className="space-y-1.5">
                <label htmlFor="auth-confirm-password" className="block text-xs font-semibold text-slate-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isGoogleLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? isForgotPasswordMode
                    ? 'Sending Reset Link...'
                    : mode === 'signup'
                    ? 'Creating Account...'
                    : 'Signing In...'
                  : isForgotPasswordMode
                  ? 'Send Password Reset Email'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Login'}
              </span>
            </button>
          </form>

          {/* Footer Switch Links */}
          <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            {isForgotPasswordMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPasswordMode(false);
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                className="font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                Back to Login
              </button>
            ) : mode === 'signup' ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  Login
                </button>
              </span>
            ) : (
              <span>
                New to CallBridge AI?{' '}
                <button
                  type="button"
                  onClick={() => switchView('signup')}
                  className="font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  Create Account
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
