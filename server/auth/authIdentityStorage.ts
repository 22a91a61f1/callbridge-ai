import fs from 'fs';
import path from 'path';
import { callbridgeStorage, type TenantUser } from '../storage/callbridgeStorage.ts';

export type AuthRole = 'customer';

export interface CustomerAuthIdentity {
  uid: string;
  email: string;
  fullName: string;
  role: AuthRole;
  tenantId: string;
  provider: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

interface AuthIdentityDatabase {
  identitiesByUid: Record<string, CustomerAuthIdentity>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const IDENTITIES_FILE = path.join(DATA_DIR, 'auth_identities.json');

class AuthIdentityStorage {
  private data: AuthIdentityDatabase = { identitiesByUid: {} };

  constructor() {
    this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): void {
    try {
      this.ensureDir();
      if (fs.existsSync(IDENTITIES_FILE)) {
        const raw = fs.readFileSync(IDENTITIES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.identitiesByUid === 'object') {
          this.data = { identitiesByUid: parsed.identitiesByUid };
          return;
        }
      }
    } catch (err) {
      console.warn('[AUTH_IDENTITY_STORAGE] Could not load auth_identities.json, initializing empty map:', err);
    }
    this.data = { identitiesByUid: {} };
  }

  private persist(): void {
    try {
      this.ensureDir();
      fs.writeFileSync(IDENTITIES_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[AUTH_IDENTITY_STORAGE] Failed to persist auth_identities.json:', err);
    }
  }

  getByUid(uid: string): CustomerAuthIdentity | undefined {
    return this.data.identitiesByUid[uid];
  }

  /**
   * Resolve or create the minimal customer identity mapping for an authenticated Firebase user.
   * - ALWAYS assigns role = 'customer' (never grants admin via signup/login).
   * - Preserves existing TenantUser records if email matches an existing tenant.
   * - Otherwise creates a dedicated isolated TenantUser without modifying existing records.
   */
  resolveOrCreateCustomer(params: {
    uid: string;
    email: string;
    fullName?: string;
    provider?: string;
    emailVerified?: boolean;
  }): { identity: CustomerAuthIdentity; tenant: TenantUser } {
    const uid = params.uid.trim();
    const normalizedEmail = (params.email || '').trim().toLowerCase();
    const now = new Date().toISOString();

    const existing = this.data.identitiesByUid[uid];
    if (existing) {
      const updatedName = params.fullName?.trim() || existing.fullName || normalizedEmail.split('@')[0] || 'Customer';
      const updatedIdentity: CustomerAuthIdentity = {
        ...existing,
        email: normalizedEmail || existing.email,
        fullName: updatedName,
        role: 'customer', // Strictly enforce customer role — never self-elevated
        provider: params.provider || existing.provider || 'password',
        emailVerified: typeof params.emailVerified === 'boolean' ? params.emailVerified : existing.emailVerified,
        updatedAt: now,
        lastLoginAt: now,
      };
      this.data.identitiesByUid[uid] = updatedIdentity;
      this.persist();

      let tenant = callbridgeStorage.getTenant(updatedIdentity.tenantId);
      if (!tenant) {
        tenant = this.createDedicatedTenant(updatedIdentity.tenantId, updatedIdentity.fullName, updatedIdentity.email, now);
      }
      return { identity: updatedIdentity, tenant };
    }

    // Check if an existing preserved tenant matches this email (without overwriting existing tenants)
    const allTenants = callbridgeStorage.getTenants();
    const emailMatchedTenant = normalizedEmail
      ? allTenants.find((t) => (t.email || '').trim().toLowerCase() === normalizedEmail)
      : undefined;

    const fallbackName =
      params.fullName?.trim() ||
      emailMatchedTenant?.name ||
      (normalizedEmail ? normalizedEmail.split('@')[0] : 'Customer');

    let tenant: TenantUser;
    if (emailMatchedTenant) {
      tenant = emailMatchedTenant;
    } else {
      const safeUidPart = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || Date.now().toString(36);
      const newTenantId = `cust_${safeUidPart}`;
      tenant = this.createDedicatedTenant(newTenantId, fallbackName, normalizedEmail || `${newTenantId}@callbridge.ai`, now);
    }

    // Ensure Free tier subscription record exists for this customer without touching other customers
    callbridgeStorage.getSubscription(tenant.id);

    const newIdentity: CustomerAuthIdentity = {
      uid,
      email: normalizedEmail || tenant.email,
      fullName: fallbackName,
      role: 'customer',
      tenantId: tenant.id,
      provider: params.provider || 'password',
      emailVerified: Boolean(params.emailVerified),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    this.data.identitiesByUid[uid] = newIdentity;
    this.persist();

    return { identity: newIdentity, tenant };
  }

  private createDedicatedTenant(id: string, name: string, email: string, now: string): TenantUser {
    const tenant: TenantUser = {
      id,
      name,
      email,
      organization: name,
      organizationName: name,
      createdAt: now,
      updatedAt: now,
    };
    return callbridgeStorage.saveTenant(tenant);
  }
}

export const authIdentityStorage = new AuthIdentityStorage();
