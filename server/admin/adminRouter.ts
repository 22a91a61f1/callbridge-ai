import express from 'express';
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminAuthService,
  isAdminAuthConfigured,
} from './adminAuthService.ts';
import {
  applyAdminSecurityHeaders,
  getClientIp,
  isSecureRequest,
  parseCookieValue,
  requireAdminCsrf,
  requireAdminSession,
  verifySameOriginRequest,
  type AdminAuthenticatedRequest,
} from './adminAuthMiddleware.ts';
import { getAdminCustomersList, getAdminOverviewMetrics } from './adminDataService.ts';

export const adminRouter = express.Router();

adminRouter.use(applyAdminSecurityHeaders);

function buildAdminCookieHeader(value: string, maxAgeSeconds: number, isSecure: boolean): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecure) {
    parts.push('SameSite=None');
    parts.push('Secure');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

/**
 * Minimal public readiness flag (exposes ZERO credentials, emails, or secrets).
 */
adminRouter.get('/auth/status', (_req, res) => {
  return res.json({
    success: true,
    configured: isAdminAuthConfigured(),
  });
});

/**
 * Fixed-credential Admin login (Email + Password only).
 * Strictly no signup, no password reset, no OAuth.
 */
adminRouter.post('/auth/login', async (req, res) => {
  if (!verifySameOriginRequest(req)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Cross-origin login request rejected.',
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const existingCookie = parseCookieValue(req.headers.cookie, ADMIN_SESSION_COOKIE_NAME);

  const result = await adminAuthService.authenticate({
    email,
    password,
    ip: getClientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
    existingCookieValue: existingCookie,
  });

  if (!result.ok) {
    if (result.status === 429 && result.retryAfterSeconds) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
    }
    return res.status(result.status).json({
      success: false,
      error: result.error,
    });
  }

  res.setHeader(
    'Set-Cookie',
    buildAdminCookieHeader(result.cookieValue, result.ttlSeconds, isSecureRequest(req))
  );

  return res.status(200).json({
    success: true,
    admin: {
      email: result.session.email,
      role: 'admin',
    },
    csrfToken: result.session.csrfToken,
    expiresAt: result.session.expiresAt,
  });
});

/**
 * Validates active Admin session and returns minimal Admin identity + CSRF token.
 */
adminRouter.get('/auth/me', requireAdminSession, (req: AdminAuthenticatedRequest, res) => {
  const session = req.adminSession!;
  return res.json({
    success: true,
    admin: {
      email: session.email,
      role: 'admin',
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
});

/**
 * Explicit Admin logout: revokes server-side session immediately and clears cookie.
 */
adminRouter.post('/auth/logout', requireAdminSession, requireAdminCsrf, (req: AdminAuthenticatedRequest, res) => {
  const cookieValue = parseCookieValue(req.headers.cookie, ADMIN_SESSION_COOKIE_NAME);
  adminAuthService.revokeByCookieValue(cookieValue, getClientIp(req));
  res.setHeader('Set-Cookie', buildAdminCookieHeader('', 0, isSecureRequest(req)));
  return res.json({ success: true });
});

/**
 * Read-only high-level platform overview metrics (6 required cards).
 */
adminRouter.get('/overview', requireAdminSession, (_req: AdminAuthenticatedRequest, res) => {
  const overview = getAdminOverviewMetrics();
  return res.json({
    success: true,
    overview,
  });
});

/**
 * Read-only paginated, searchable, filterable, sortable customer subscription & credit list.
 * Strictly excludes contacts, scripts, recordings, transcripts, survey answers, and secrets.
 */
adminRouter.get('/customers', requireAdminSession, (req: AdminAuthenticatedRequest, res) => {
  const result = getAdminCustomersList({
    search: typeof req.query.search === 'string' ? req.query.search : '',
    plan: typeof req.query.plan === 'string' ? req.query.plan : 'all',
    status: typeof req.query.status === 'string' ? req.query.status : 'all',
    sort: typeof req.query.sort === 'string' ? req.query.sort : 'newest',
    page: typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1,
    pageSize: typeof req.query.pageSize === 'string' ? parseInt(req.query.pageSize, 10) : 10,
  });

  return res.json({
    success: true,
    ...result,
  });
});
