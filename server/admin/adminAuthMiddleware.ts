import type { Request, Response, NextFunction } from 'express';
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminAuthService,
  auditAdminEvent,
  type AdminSessionRecord,
} from './adminAuthService.ts';

export interface AdminAuthenticatedRequest extends Request {
  adminSession?: AdminSessionRecord;
}

/**
 * Extracts a single named cookie from the raw Cookie header without relying on external middleware.
 */
export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key === name) {
      try {
        return decodeURIComponent(trimmed.slice(eqIndex + 1).trim());
      } catch {
        return trimmed.slice(eqIndex + 1).trim();
      }
    }
  }
  return null;
}

/**
 * Extracts normalized client IP for rate limiting and audit logging.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Determines whether the incoming request targets the dedicated Admin hostname
 * (e.g., admin.callbridgeai.com or a custom ADMIN_HOSTNAME env value).
 */
export function isAdminHost(req: Request): boolean {
  const rawHostHeader =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    (typeof req.headers.host === 'string' && req.headers.host) ||
    '';

  const firstHost = rawHostHeader.split(',')[0].trim().toLowerCase();
  const hostname = firstHost.replace(/:\d+$/, '');
  if (!hostname) return false;

  const configuredHostsRaw = (process.env.ADMIN_HOSTNAME || '').trim();
  if (configuredHostsRaw) {
    const configuredHosts = configuredHostsRaw
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''))
      .filter(Boolean);
    if (configuredHosts.includes(hostname)) {
      return true;
    }
  }

  return hostname.startsWith('admin.');
}

/**
 * Checks whether the current request is over HTTPS (directly or behind a reverse proxy).
 */
export function isSecureRequest(req: Request): boolean {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || '';
  return req.secure || forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
}

/**
 * Validates Origin/Referer host on state-changing Admin endpoints to block cross-site POST attacks.
 */
export function verifySameOriginRequest(req: Request): boolean {
  const expectedHostRaw =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    (typeof req.headers.host === 'string' && req.headers.host) ||
    '';
  const expectedHost = expectedHostRaw.split(',')[0].trim().toLowerCase();
  if (!expectedHost) return true;

  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';

  const checkUrlHost = (urlStr: string): boolean => {
    try {
      const parsed = new URL(urlStr);
      return parsed.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  };

  if (originHeader) {
    return checkUrlHost(originHeader);
  }
  if (refererHeader) {
    return checkUrlHost(refererHeader);
  }
  return true;
}

/**
 * Attaches security headers to all Admin API responses (never cache Admin data).
 */
export function applyAdminSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

/**
 * Strictly enforces a valid server-side Admin session cookie (`cb_admin_session`).
 * - NEVER accepts Firebase customer Bearer tokens, customer `cb_id_token` cookies,
 *   spoofed `x-user-id` / `x-client-id` headers, or frontend `role` fields.
 */
export function requireAdminSession(req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const adminCookie = parseCookieValue(req.headers.cookie, ADMIN_SESSION_COOKIE_NAME);
  const session = adminAuthService.verifySessionFromCookie(adminCookie);

  if (!session) {
    const hasCustomerAuthAttempt = Boolean(
      req.headers.authorization ||
      parseCookieValue(req.headers.cookie, 'cb_id_token') ||
      req.headers['x-user-id'] ||
      req.headers['x-client-id']
    );

    if (hasCustomerAuthAttempt) {
      auditAdminEvent('customer_token_rejected', {
        ip,
        path: req.originalUrl,
        reason: 'customer_credentials_not_accepted_for_admin_api',
      });
      res.status(403).json({
        success: false,
        error: 'Forbidden: Customer credentials cannot access Admin endpoints.',
      });
      return;
    }

    auditAdminEvent('unauthorized_access', {
      ip,
      path: req.originalUrl,
      reason: 'missing_or_invalid_admin_session',
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid Admin session required.',
    });
    return;
  }

  req.adminSession = session;
  next();
}

/**
 * Enforces CSRF token validation and same-origin checks on state-changing authenticated Admin endpoints.
 */
export function requireAdminCsrf(req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void {
  const session = req.adminSession;
  const ip = getClientIp(req);

  if (!session) {
    res.status(401).json({ success: false, error: 'Unauthorized: Valid Admin session required.' });
    return;
  }

  if (!verifySameOriginRequest(req)) {
    auditAdminEvent('csrf_rejected', {
      ip,
      email: session.email,
      path: req.originalUrl,
      reason: 'origin_mismatch',
    });
    res.status(403).json({ success: false, error: 'Forbidden: Cross-origin request rejected.' });
    return;
  }

  const providedCsrf = typeof req.headers['x-admin-csrf-token'] === 'string'
    ? req.headers['x-admin-csrf-token']
    : undefined;

  if (!adminAuthService.verifyCsrfToken(session, providedCsrf)) {
    auditAdminEvent('csrf_rejected', {
      ip,
      email: session.email,
      path: req.originalUrl,
      reason: 'invalid_csrf_token',
    });
    res.status(403).json({ success: false, error: 'Forbidden: Invalid CSRF token.' });
    return;
  }

  next();
}
