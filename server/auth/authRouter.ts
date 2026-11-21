import { Router, type Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  extractBearerOrCookieToken,
  isFirebaseAuthConfigured,
  loadFirebaseAppletConfig,
  requireCustomerAuth,
  type AuthenticatedRequest,
} from './firebaseAuthMiddleware.ts';
import { authIdentityStorage } from './authIdentityStorage.ts';
import { callbridgeStorage } from '../storage/callbridgeStorage.ts';

export const authRouter = Router();

function buildCookieString(value: string, maxAgeSeconds: number, isSecure: boolean): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    isSecure ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function isHttpsRequest(req: AuthenticatedRequest): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Public read-only status endpoint (no secrets exposed).
 */
authRouter.get('/config-status', (_req, res: Response) => {
  const cfg = loadFirebaseAppletConfig();
  res.json({
    success: true,
    configured: isFirebaseAuthConfigured(),
    provider: 'firebase',
    projectId: cfg?.projectId || null,
    googleEnabled: isFirebaseAuthConfigured(),
  });
});

/**
 * Sync authenticated Firebase customer account into minimal server-side identity mapping.
 * - Verifies Firebase ID token via requireCustomerAuth.
 * - Enforces customer role strictly (ignores any role passed in request body).
 * - Sets HttpOnly cookie strictly from the verified token for authenticated CSV/PDF exports.
 */
authRouter.post('/sync', requireCustomerAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.authUser || !req.firebaseToken) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const requestedFullName =
    typeof req.body?.fullName === 'string' && req.body.fullName.trim().length > 0
      ? req.body.fullName.trim().slice(0, 120)
      : undefined;

  const { identity, tenant } = authIdentityStorage.resolveOrCreateCustomer({
    uid: req.firebaseToken.uid,
    email: req.firebaseToken.email || req.authUser.email,
    fullName: requestedFullName || req.authUser.fullName,
    provider: req.firebaseToken.firebase?.sign_in_provider || req.authUser.provider,
    emailVerified: Boolean(req.firebaseToken.email_verified),
  });

  const token = extractBearerOrCookieToken(req);
  if (token) {
    res.setHeader('Set-Cookie', buildCookieString(token, 3600, isHttpsRequest(req)));
  }

  return res.json({
    success: true,
    user: {
      uid: identity.uid,
      email: identity.email,
      fullName: identity.fullName,
      role: identity.role,
      tenantId: identity.tenantId,
      provider: identity.provider,
      emailVerified: identity.emailVerified,
    },
    tenant,
  });
});

/**
 * Return verified authenticated customer identity & mapped tenant.
 */
authRouter.get('/me', requireCustomerAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.authUser) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const tenant = callbridgeStorage.getTenant(req.authUser.tenantId) || null;
  return res.json({
    success: true,
    user: {
      uid: req.authUser.uid,
      email: req.authUser.email,
      fullName: req.authUser.fullName,
      role: req.authUser.role,
      tenantId: req.authUser.tenantId,
      provider: req.authUser.provider,
      emailVerified: req.authUser.emailVerified,
    },
    tenant,
  });
});

/**
 * Secure Logout: clears the HttpOnly session cookie immediately.
 */
authRouter.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Set-Cookie', buildCookieString('', 0, isHttpsRequest(req)));
  return res.json({ success: true });
});
