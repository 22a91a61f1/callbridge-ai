import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onIdTokenChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';
import type { TenantUser } from '../types/callbridge';

export interface CustomerAuthProfile {
  uid: string;
  email: string;
  fullName: string;
  role: 'customer';
  tenantId: string;
  provider: string;
  emailVerified: boolean;
}

interface AuthContextValue {
  firebaseUser: User | null;
  customerProfile: CustomerAuthProfile | null;
  authenticatedTenant: TenantUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresEmailVerification: boolean;
  isFirebaseReady: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signupWithEmail: (fullName: string, email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Preserve original browser fetch once and install a safe same-origin auth token interceptor
let originalFetchRef: typeof window.fetch | null = null;
let fetchInterceptorInstalled = false;

function isProtectedSameOriginUrl(input: RequestInfo | URL): boolean {
  try {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (rawUrl.startsWith('/api/') || rawUrl.startsWith('/calls/')) return true;
    const parsed = new URL(rawUrl, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/calls/'))
    );
  } catch {
    return false;
  }
}

function installAuthFetchInterceptor(): void {
  if (fetchInterceptorInstalled || typeof window === 'undefined') return;
  try {
    const baseFetch = window.fetch.bind(window);
    originalFetchRef = baseFetch;

    const wrappedFetch: typeof window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      if (!isProtectedSameOriginUrl(input) || !auth?.currentUser) {
        return baseFetch(input, init);
      }

      try {
        const token = await auth.currentUser.getIdToken();
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        );
        if (!headers.has('Authorization') && token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return baseFetch(input, { ...init, headers });
      } catch {
        return baseFetch(input, init);
      }
    };

    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!descriptor || descriptor.writable) {
      window.fetch = wrappedFetch;
      fetchInterceptorInstalled = true;
    } else if (descriptor.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
      });
      fetchInterceptorInstalled = true;
    } else {
      // Environment defines window.fetch as non-configurable/read-only;
      // server-verified HttpOnly session cookie handles authenticated API requests seamlessly.
      fetchInterceptorInstalled = true;
    }
  } catch {
    // Never throw from fetch interception; HttpOnly cookie fallback remains active.
    fetchInterceptorInstalled = true;
  }
}

export function formatFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email address or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completion.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Please enable Authentication > Sign-in method > Email/Password in Firebase Console, or use Google Sign-In.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication service. Please check your connection.';
    default:
      return err?.message || 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerAuthProfile | null>(null);
  const [authenticatedTenant, setAuthenticatedTenant] = useState<TenantUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const pendingFullNameRef = useRef<string | null>(null);

  useEffect(() => {
    installAuthFetchInterceptor();
  }, []);

  const syncWithBackend = useCallback(async (user: User, explicitFullName?: string) => {
    const token = await user.getIdToken();
    const fetchFn = originalFetchRef || window.fetch.bind(window);
    const res = await fetchFn('/api/auth/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fullName: explicitFullName || user.displayName || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify session with server');
    }

    setCustomerProfile(data.user);
    setAuthenticatedTenant(data.tenant || null);
    return data.user as CustomerAuthProfile;
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCustomerProfile(null);
        setAuthenticatedTenant(null);
        setIsLoading(false);
        return;
      }

      try {
        const pendingName = pendingFullNameRef.current || undefined;
        await syncWithBackend(user, pendingName);
        pendingFullNameRef.current = null;
      } catch (err: any) {
        console.warn('[AUTH_SYNC_ERROR]', err);
        setAuthError(err?.message || 'Failed to synchronize authenticated session.');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [syncWithBackend]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const signupWithEmail = useCallback(
    async (fullName: string, email: string, password: string) => {
      if (!auth) throw new Error('Firebase Authentication is not configured.');
      setAuthError(null);
      pendingFullNameRef.current = fullName.trim();
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (fullName.trim()) {
          await updateProfile(cred.user, { displayName: fullName.trim() });
        }
        try {
          await sendEmailVerification(cred.user);
        } catch (verifyErr) {
          console.warn('[EMAIL_VERIFICATION_SEND_WARNING]', verifyErr);
        }
        await syncWithBackend(cred.user, fullName.trim());
      } catch (err: any) {
        pendingFullNameRef.current = null;
        const msg = formatFirebaseAuthError(err);
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [syncWithBackend]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!auth) throw new Error('Firebase Authentication is not configured.');
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await syncWithBackend(cred.user);
      } catch (err: any) {
        const msg = formatFirebaseAuthError(err);
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [syncWithBackend]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) throw new Error('Firebase Google Authentication is not configured.');
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await syncWithBackend(cred.user);
    } catch (err: any) {
      const msg = formatFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, [syncWithBackend]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      const msg = formatFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth?.currentUser) throw new Error('No signed-in account found.');
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: any) {
      const msg = formatFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  const refreshEmailVerification = useCallback(async (): Promise<boolean> => {
    if (!auth?.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setFirebaseUser(auth.currentUser);
    const verified = Boolean(auth.currentUser.emailVerified);
    await syncWithBackend(auth.currentUser);
    return verified;
  }, [syncWithBackend]);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      const fetchFn = originalFetchRef || window.fetch.bind(window);
      await fetchFn('/api/auth/logout', { method: 'POST' }).catch(() => {});
      if (auth) {
        await signOut(auth);
      }
    } finally {
      setFirebaseUser(null);
      setCustomerProfile(null);
      setAuthenticatedTenant(null);
    }
  }, []);

  const isPasswordProvider = Boolean(
    firebaseUser?.providerData?.some((p) => p.providerId === 'password')
  );
  const requiresEmailVerification = Boolean(
    firebaseUser && isPasswordProvider && !firebaseUser.emailVerified
  );
  const isAuthenticated = Boolean(firebaseUser && customerProfile && !requiresEmailVerification);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        customerProfile,
        authenticatedTenant,
        isLoading,
        isAuthenticated,
        requiresEmailVerification,
        isFirebaseReady: isFirebaseConfigured,
        authError,
        clearAuthError,
        signupWithEmail,
        loginWithEmail,
        signInWithGoogle,
        requestPasswordReset,
        resendVerificationEmail,
        refreshEmailVerification,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
