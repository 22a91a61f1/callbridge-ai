import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  burnTimingBudget,
  detectPasswordHashFormat,
  hashAdminPasswordScrypt,
  timingSafeStringEqual,
  verifyAdminPassword,
} from './adminPasswordUtil.ts';

export const ADMIN_SESSION_COOKIE_NAME = 'cb_admin_session';

export interface AdminSessionRecord {
  sessionIdHash: string;
  email: string;
  role: 'admin';
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ip: string;
  userAgent: string;
}

interface AdminSessionDatabase {
  sessions: Record<string, AdminSessionRecord>;
}

interface RateLimitBucket {
  failedTimestamps: number[];
  blockedUntil: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'admin_sessions.json');
const PERSISTED_SESSION_SECRET_FILE = path.join(DATA_DIR, '.admin_session_secret');

// Stable server-side deployment secrets that may already exist in the environment.
// Used ONLY as HKDF input key material (never used directly) to derive an isolated,
// restart-stable Admin session signing key when ADMIN_SESSION_SECRET is not explicitly set.
const EXISTING_STABLE_SECRET_ENV_KEYS = [
  'SESSION_SECRET',
  'JWT_SECRET',
  'RAZORPAY_KEY_SECRET',
  'VAPI_PRIVATE_KEY',
  'VAPI_PRIVATE_API_KEY',
  'VAPI_WEBHOOK_SECRET',
  'VAPI_SECRET',
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
] as const;

let cachedSessionSecret: string | null = null;
let cachedSessionSecretSource: 'explicit_env' | 'derived_hkdf' | 'persisted_file' | null = null;

// In-memory salted hash derived automatically from ADMIN_PASSWORD (or validated ADMIN_PASSWORD_HASH).
// Never written to disk, database, logs, or frontend.
let runtimeAdminPasswordHash: string | null = null;
let runtimePasswordSource: 'auto_hashed_env' | 'prehashed_env' | null = null;
let warnedWeakPasswordLength = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Resolves a restart-stable 256-bit Admin session signing secret without requiring manual configuration:
 * 1. Explicit ADMIN_SESSION_SECRET env var (>= 32 chars), if optionally supplied.
 * 2. HKDF-SHA256 derived key from an existing stable server-side secret already in the deployment environment.
 * 3. Persisted CSPRNG secret stored once on disk (data/.admin_session_secret, mode 0600) so restarts reuse it.
 */
function resolveStableSessionSecret(): string {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  // Priority 1: Explicit optional ADMIN_SESSION_SECRET
  const explicitEnvSecret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (explicitEnvSecret.length >= 32) {
    cachedSessionSecret = explicitEnvSecret;
    cachedSessionSecretSource = 'explicit_env';
    return cachedSessionSecret;
  }

  // Priority 2: Reuse existing stable server-side deployment secret via domain-separated HKDF-SHA256
  for (const envKey of EXISTING_STABLE_SECRET_ENV_KEYS) {
    const value = (process.env[envKey] || '').trim();
    if (value.length >= 16) {
      const salt = Buffer.from('callbridge-ai:admin-session-hkdf-salt:v1', 'utf8');
      const info = Buffer.from(`callbridge-ai:admin-session-signing:${envKey}:v1`, 'utf8');
      const derived = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(value, 'utf8'), salt, info, 32)).toString('hex');
      cachedSessionSecret = derived;
      cachedSessionSecretSource = 'derived_hkdf';
      return cachedSessionSecret;
    }
  }

  // Priority 3: Read or generate & persist a single CSPRNG secret on disk (never regenerated per restart)
  try {
    ensureDataDir();
    if (fs.existsSync(PERSISTED_SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(PERSISTED_SESSION_SECRET_FILE, 'utf8').trim();
      if (/^[0-9a-f]{64,}$/i.test(existing)) {
        cachedSessionSecret = existing;
        cachedSessionSecretSource = 'persisted_file';
        return cachedSessionSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(PERSISTED_SESSION_SECRET_FILE, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
    cachedSessionSecret = generated;
    cachedSessionSecretSource = 'persisted_file';
    return cachedSessionSecret;
  } catch (err) {
    console.error('[ADMIN_AUTH_CONFIG] Failed to persist generated session secret file:', err);
    // Final fallback only if disk is read-only and no stable env secret exists
    cachedSessionSecret = crypto.randomBytes(32).toString('hex');
    cachedSessionSecretSource = 'persisted_file';
    return cachedSessionSecret;
  }
}

function getSessionSecret(): string {
  return resolveStableSessionSecret();
}

/**
 * Automatically bootstraps Admin credentials in server memory from deployment env settings.
 * - Accepts ADMIN_PASSWORD and hashes it immediately in memory using salted scrypt,
 *   then scrubs process.env.ADMIN_PASSWORD so plaintext never lingers in process.env.
 * - Also remains backwards-compatible if ADMIN_PASSWORD_HASH is explicitly provided.
 * - Initializes the restart-stable session signing secret.
 */
export function initializeAdminCredentials(): void {
  resolveStableSessionSecret();

  // Check if a fresh ADMIN_PASSWORD is present in the server environment
  const rawPlaintextPassword = process.env.ADMIN_PASSWORD;
  if (typeof rawPlaintextPassword === 'string' && rawPlaintextPassword.length > 0) {
    const trimmed = rawPlaintextPassword.trim();
    if (trimmed.length >= 6) {
      if (trimmed.length < 12 && !warnedWeakPasswordLength) {
        warnedWeakPasswordLength = true;
        console.warn('[ADMIN_AUTH_CONFIG] ADMIN_PASSWORD is shorter than 12 characters; consider using a longer password.');
      }
      runtimeAdminPasswordHash = hashAdminPasswordScrypt(trimmed);
      runtimePasswordSource = 'auto_hashed_env';
      // Scrub plaintext password from process.env after hashing into memory
      delete process.env.ADMIN_PASSWORD;
      return;
    } else {
      console.warn('[ADMIN_AUTH_CONFIG] ADMIN_PASSWORD must be at least 6 characters long.');
      delete process.env.ADMIN_PASSWORD;
      return;
    }
  }

  // Optional backwards-compatible path if an explicit salted ADMIN_PASSWORD_HASH was configured
  const explicitHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (explicitHash && detectPasswordHashFormat(explicitHash) !== 'invalid') {
    runtimeAdminPasswordHash = explicitHash;
    runtimePasswordSource = 'prehashed_env';
  }
}

export function getAdminSessionSecretSource(): 'explicit_env' | 'derived_hkdf' | 'persisted_file' | null {
  resolveStableSessionSecret();
  return cachedSessionSecretSource;
}

export function getAdminSessionTtlMs(): number {
  const rawHours = Number(process.env.ADMIN_SESSION_TTL_HOURS || '8');
  const clampedHours = Number.isFinite(rawHours) ? Math.min(24, Math.max(1, rawHours)) : 8;
  return Math.round(clampedHours * 60 * 60 * 1000);
}

function getRateLimitConfig(): { maxAttempts: number; windowMs: number; lockoutMs: number } {
  const maxAttemptsRaw = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || '5');
  const windowMsRaw = Number(process.env.ADMIN_LOGIN_WINDOW_MS || String(15 * 60 * 1000));
  const lockoutMsRaw = Number(process.env.ADMIN_LOGIN_LOCKOUT_MS || String(15 * 60 * 1000));
  return {
    maxAttempts: Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw >= 1 ? Math.floor(maxAttemptsRaw) : 5,
    windowMs: Number.isFinite(windowMsRaw) && windowMsRaw >= 1000 ? Math.floor(windowMsRaw) : 15 * 60 * 1000,
    lockoutMs: Number.isFinite(lockoutMsRaw) && lockoutMsRaw >= 1000 ? Math.floor(lockoutMsRaw) : 15 * 60 * 1000,
  };
}

export function getConfiguredAdminEmail(): string | null {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

export function getConfiguredAdminPasswordHash(): string | null {
  // Always check if ADMIN_PASSWORD / ADMIN_PASSWORD_HASH became available after dotenv.config()
  if (process.env.ADMIN_PASSWORD || (!runtimeAdminPasswordHash && process.env.ADMIN_PASSWORD_HASH)) {
    initializeAdminCredentials();
  }
  return runtimeAdminPasswordHash;
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getConfiguredAdminEmail() && getConfiguredAdminPasswordHash());
}

export function getAdminPasswordSource(): 'auto_hashed_env' | 'prehashed_env' | null {
  getConfiguredAdminPasswordHash();
  return runtimePasswordSource;
}

export function auditAdminEvent(
  event:
    | 'login_success'
    | 'login_failed'
    | 'login_rate_limited'
    | 'login_not_configured'
    | 'logout'
    | 'session_expired'
    | 'unauthorized_access'
    | 'customer_token_rejected'
    | 'csrf_rejected',
  details: {
    ip?: string;
    email?: string;
    path?: string;
    reason?: string;
  }
): void {
  // Strictly never log passwords, password hashes, session cookies, tokens, or secrets.
  console.log(
    '[ADMIN_AUDIT]',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ip: details.ip || 'unknown',
      email: details.email ? maskAuditEmail(details.email) : undefined,
      path: details.path,
      reason: details.reason,
    })
  );
}

function maskAuditEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 1) return '***';
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

function hashSessionId(rawSessionId: string): string {
  return crypto.createHash('sha256').update(rawSessionId, 'utf8').digest('hex');
}

function signSessionId(rawSessionId: string): string {
  const mac = crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawSessionId, 'utf8')
    .digest('hex');
  return `${rawSessionId}.${mac}`;
}

function verifySignedCookieValue(cookieValue: string): string | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === cookieValue.length - 1) return null;
  const rawSessionId = cookieValue.slice(0, dotIndex);
  const providedMac = cookieValue.slice(dotIndex + 1);
  if (!/^[0-9a-f]{64}$/i.test(rawSessionId) || !/^[0-9a-f]{64}$/i.test(providedMac)) {
    return null;
  }
  const expectedMac = crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawSessionId, 'utf8')
    .digest('hex');

  if (!timingSafeStringEqual(providedMac, expectedMac)) {
    return null;
  }
  return rawSessionId;
}

class AdminAuthService {
  private sessions: Record<string, AdminSessionRecord> = {};
  private rateLimitsByKey: Map<string, RateLimitBucket> = new Map();

  constructor() {
    this.loadSessions();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadSessions(): void {
    try {
      this.ensureDir();
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
        const parsed = JSON.parse(raw) as AdminSessionDatabase;
        if (parsed && parsed.sessions && typeof parsed.sessions === 'object') {
          this.sessions = parsed.sessions;
          this.pruneExpiredSessions();
          return;
        }
      }
    } catch {
      this.sessions = {};
    }
  }

  private persistSessions(): void {
    try {
      this.ensureDir();
      const payload: AdminSessionDatabase = { sessions: this.sessions };
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.error('[ADMIN_SESSION_STORE] Failed to persist admin sessions:', err);
    }
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, session] of Object.entries(this.sessions)) {
      if (!session || new Date(session.expiresAt).getTime() <= now) {
        delete this.sessions[key];
        changed = true;
      }
    }
    if (changed) {
      this.persistSessions();
    }
  }

  private checkRateLimitBucket(key: string, now: number): { allowed: boolean; retryAfterSeconds: number } {
    const { windowMs } = getRateLimitConfig();
    const bucket = this.rateLimitsByKey.get(key);
    if (!bucket) return { allowed: true, retryAfterSeconds: 0 };

    if (bucket.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
      };
    }

    bucket.failedTimestamps = bucket.failedTimestamps.filter((ts) => now - ts <= windowMs);
    if (bucket.failedTimestamps.length === 0) {
      this.rateLimitsByKey.delete(key);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private recordFailedAttempt(key: string, now: number): void {
    const { maxAttempts, windowMs, lockoutMs } = getRateLimitConfig();
    const bucket = this.rateLimitsByKey.get(key) || { failedTimestamps: [], blockedUntil: 0 };
    bucket.failedTimestamps = bucket.failedTimestamps.filter((ts) => now - ts <= windowMs);
    bucket.failedTimestamps.push(now);
    if (bucket.failedTimestamps.length >= maxAttempts) {
      bucket.blockedUntil = now + lockoutMs;
    }
    this.rateLimitsByKey.set(key, bucket);
  }

  private clearRateLimit(ipKey: string, emailKey: string): void {
    this.rateLimitsByKey.delete(ipKey);
    this.rateLimitsByKey.delete(emailKey);
  }

  async authenticate(params: {
    email: string;
    password: string;
    ip: string;
    userAgent: string;
    existingCookieValue?: string | null;
  }): Promise<
    | {
        ok: true;
        cookieValue: string;
        session: AdminSessionRecord;
        ttlSeconds: number;
      }
    | {
        ok: false;
        status: 400 | 401 | 429 | 503;
        error: string;
        retryAfterSeconds?: number;
      }
  > {
    const now = Date.now();
    const normalizedEmail = (params.email || '').trim().toLowerCase();
    const candidatePassword = typeof params.password === 'string' ? params.password : '';
    const ip = params.ip || 'unknown';

    if (!isAdminAuthConfigured()) {
      auditAdminEvent('login_not_configured', { ip, path: '/api/admin/auth/login', reason: 'missing_or_invalid_admin_env' });
      return {
        ok: false,
        status: 503,
        error:
          'Admin authentication is not configured on the server. Set ADMIN_EMAIL and ADMIN_PASSWORD in your deployment environment settings.',
      };
    }

    if (!normalizedEmail || !candidatePassword) {
      return {
        ok: false,
        status: 400,
        error: 'Email address and password are required.',
      };
    }

    const ipKey = `ip:${ip}`;
    const emailKey = `email:${normalizedEmail}`;

    const ipCheck = this.checkRateLimitBucket(ipKey, now);
    const emailCheck = this.checkRateLimitBucket(emailKey, now);
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, emailCheck.retryAfterSeconds);
      auditAdminEvent('login_rate_limited', {
        ip,
        email: normalizedEmail,
        path: '/api/admin/auth/login',
        reason: `retry_after_${retryAfterSeconds}s`,
      });
      return {
        ok: false,
        status: 429,
        error: `Too many failed login attempts. Please wait ${retryAfterSeconds} seconds and try again.`,
        retryAfterSeconds,
      };
    }

    const configuredEmail = getConfiguredAdminEmail()!;
    const configuredHash = getConfiguredAdminPasswordHash()!;

    const emailMatches = timingSafeStringEqual(normalizedEmail, configuredEmail);
    let passwordMatches = false;

    if (emailMatches) {
      passwordMatches = await verifyAdminPassword(candidatePassword, configuredHash);
    } else {
      await burnTimingBudget();
    }

    if (!emailMatches || !passwordMatches) {
      this.recordFailedAttempt(ipKey, now);
      this.recordFailedAttempt(emailKey, now);
      auditAdminEvent('login_failed', {
        ip,
        email: normalizedEmail,
        path: '/api/admin/auth/login',
        reason: 'invalid_credentials',
      });
      return {
        ok: false,
        status: 401,
        error: 'Invalid email address or password.',
      };
    }

    // Session fixation protection: revoke any pre-existing session cookie before issuing a brand-new session
    if (params.existingCookieValue) {
      this.revokeByCookieValue(params.existingCookieValue);
    }

    this.clearRateLimit(ipKey, emailKey);
    this.pruneExpiredSessions();

    const rawSessionId = crypto.randomBytes(32).toString('hex');
    const sessionIdHash = hashSessionId(rawSessionId);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const ttlMs = getAdminSessionTtlMs();
    const createdAtIso = new Date(now).toISOString();
    const expiresAtIso = new Date(now + ttlMs).toISOString();

    const session: AdminSessionRecord = {
      sessionIdHash,
      email: configuredEmail,
      role: 'admin',
      csrfToken,
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      lastSeenAt: createdAtIso,
      ip,
      userAgent: (params.userAgent || '').slice(0, 200),
    };

    this.sessions[sessionIdHash] = session;
    this.persistSessions();

    auditAdminEvent('login_success', {
      ip,
      email: configuredEmail,
      path: '/api/admin/auth/login',
    });

    return {
      ok: true,
      cookieValue: signSessionId(rawSessionId),
      session,
      ttlSeconds: Math.floor(ttlMs / 1000),
    };
  }

  verifySessionFromCookie(cookieValue: string | null | undefined): AdminSessionRecord | null {
    if (!cookieValue) return null;
    const rawSessionId = verifySignedCookieValue(cookieValue);
    if (!rawSessionId) return null;

    const sessionIdHash = hashSessionId(rawSessionId);
    const session = this.sessions[sessionIdHash];
    if (!session) return null;

    // Enforce exact match with currently configured admin email if configured
    const configuredEmail = getConfiguredAdminEmail();
    if (!configuredEmail || !timingSafeStringEqual(session.email, configuredEmail)) {
      delete this.sessions[sessionIdHash];
      this.persistSessions();
      return null;
    }

    const now = Date.now();
    if (new Date(session.expiresAt).getTime() <= now) {
      delete this.sessions[sessionIdHash];
      this.persistSessions();
      auditAdminEvent('session_expired', { email: session.email, ip: session.ip });
      return null;
    }

    if (session.role !== 'admin') {
      return null;
    }

    session.lastSeenAt = new Date(now).toISOString();
    return session;
  }

  revokeByCookieValue(cookieValue: string | null | undefined, ip?: string): boolean {
    if (!cookieValue) return false;
    const rawSessionId = verifySignedCookieValue(cookieValue);
    if (!rawSessionId) return false;
    const sessionIdHash = hashSessionId(rawSessionId);
    const existing = this.sessions[sessionIdHash];
    if (existing) {
      delete this.sessions[sessionIdHash];
      this.persistSessions();
      auditAdminEvent('logout', { email: existing.email, ip: ip || existing.ip, path: '/api/admin/auth/logout' });
      return true;
    }
    return false;
  }

  verifyCsrfToken(session: AdminSessionRecord, providedToken: string | undefined): boolean {
    if (!providedToken || typeof providedToken !== 'string') return false;
    return timingSafeStringEqual(session.csrfToken, providedToken.trim());
  }

  /**
   * Utility for automated tests to reset in-memory rate limits cleanly without affecting production.
   */
  resetRateLimitsForTest(): void {
    this.rateLimitsByKey.clear();
  }
}

export const adminAuthService = new AdminAuthService();
