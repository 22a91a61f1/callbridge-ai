import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, getApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { authIdentityStorage, type CustomerAuthIdentity } from './authIdentityStorage.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: CustomerAuthIdentity;
  firebaseToken?: DecodedIdToken;
}

interface FirebaseAppletConfig {
  projectId?: string;
  authDomain?: string;
  apiKey?: string;
  appId?: string;
}

export const AUTH_COOKIE_NAME = 'cb_id_token';

let cachedConfig: FirebaseAppletConfig | null | undefined;
let adminApp: App | null = null;

export function loadFirebaseAppletConfig(): FirebaseAppletConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) {
      cachedConfig = null;
      return null;
    }
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseAppletConfig;
    if (!parsed?.projectId || parsed.projectId === 'remixed-project-id') {
      cachedConfig = null;
      return null;
    }
    cachedConfig = parsed;
    return parsed;
  } catch (err) {
    console.error('[FIREBASE_AUTH] Failed to read firebase-applet-config.json:', err);
    cachedConfig = null;
    return null;
  }
}

export function isFirebaseAuthConfigured(): boolean {
  const cfg = loadFirebaseAppletConfig();
  return Boolean(cfg?.projectId && cfg?.apiKey);
}

function getFirebaseAdminApp(): App | null {
  if (adminApp) return adminApp;
  const cfg = loadFirebaseAppletConfig();
  if (!cfg?.projectId) return null;

  // Verifying Firebase ID tokens with verifyIdToken(token) requires only projectId
  // and needs no service account keys or IAM roles.
  adminApp = getApps().length
    ? getApp()
    : initializeApp({ projectId: cfg.projectId });
  return adminApp;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // Fallback to HttpOnly token cookie issued strictly after server-side verifyIdToken() on /api/auth/sync
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[AUTH_COOKIE_NAME]) {
    return cookies[AUTH_COOKIE_NAME];
  }

  return null;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error('Firebase Authentication is not provisioned on the server.');
  }
  return getAuth(app).verifyIdToken(idToken);
}

function isPublicWebhookPath(req: Request): boolean {
  const fullPath = (req.originalUrl || req.path || '').split('?')[0];
  return (
    fullPath === '/api/health' ||
    fullPath === '/vapi/webhook' ||
    fullPath === '/api/vapi/webhook' ||
    fullPath === '/api/callbridge/vapi/webhook' ||
    fullPath === '/telephony/webhook' ||
    fullPath === '/api/callbridge/telephony/webhook' ||
    fullPath === '/api/auth/config-status' ||
    fullPath === '/api/auth/logout'
  );
}

/**
 * Mandatory server-side customer authentication & anti-spoofing middleware.
 * - Keeps provider webhooks (/vapi/webhook, /telephony/webhook, /api/callbridge/vapi/webhook) open.
 * - Verifies Firebase ID token using firebase-admin verifyIdToken().
 * - Derives customer identity strictly from the verified token.
 * - Strips untrusted headers (x-client-id, x-user-id) and binds clientId/userId to the verified tenant.
 * - Blocks customers from accessing admin-only endpoints or elevating their role.
 */
export async function requireCustomerAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Never require customer login tokens for provider webhooks or public health/config endpoints
  if (isPublicWebhookPath(req)) {
    return next();
  }

  if (!isFirebaseAuthConfigured()) {
    res.status(503).json({
      success: false,
      error: 'Authentication provider is not configured on the server.',
    });
    return;
  }

  const token = extractBearerOrCookieToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to continue.',
    });
    return;
  }

  try {
    const decoded = await verifyFirebaseIdToken(token);
    const provider = decoded.firebase?.sign_in_provider || 'password';

    const { identity } = authIdentityStorage.resolveOrCreateCustomer({
      uid: decoded.uid,
      email: decoded.email || '',
      fullName: typeof decoded.name === 'string' ? decoded.name : undefined,
      provider,
      emailVerified: Boolean(decoded.email_verified),
    });

    req.firebaseToken = decoded;
    req.authUser = identity;

    // Anti-spoofing: remove untrusted identity headers
    delete req.headers['x-client-id'];
    delete req.headers['x-user-id'];

    // Block customer access to admin-only routes
    const cleanPath = (req.originalUrl || req.path || '').split('?')[0];
    if (cleanPath.startsWith('/api/callbridge/billing/admin/')) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Customer accounts cannot access administrative endpoints.',
      });
      return;
    }

    // Bind query user/client identifiers strictly to the verified customer's tenantId
    if (req.query && typeof req.query === 'object') {
      if ('userId' in req.query || 'clientId' in req.query || 'client_id' in req.query || 'user_id' in req.query) {
        (req.query as Record<string, any>).userId = identity.tenantId;
        (req.query as Record<string, any>).clientId = identity.tenantId;
        (req.query as Record<string, any>).client_id = identity.tenantId;
        (req.query as Record<string, any>).user_id = identity.tenantId;
      }
    }

    // Bind body user/client identifiers to verified tenantId and strip any role-escalation fields
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('role' in req.body) delete req.body.role;
      if ('isAdmin' in req.body) delete req.body.isAdmin;
      if ('userId' in req.body) req.body.userId = identity.tenantId;
      if ('clientId' in req.body) req.body.clientId = identity.tenantId;
      if ('client_id' in req.body) req.body.client_id = identity.tenantId;
      if ('user_id' in req.body) req.body.user_id = identity.tenantId;
    }

    next();
  } catch (err: any) {
    console.warn('[FIREBASE_AUTH_REJECTED]', {
      path: req.originalUrl,
      reason: err?.code || err?.message || 'Invalid token',
    });
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token. Please sign in again.',
    });
  }
}
