import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_HASH_PREFIX_RE = /^\$2[aby]\$\d{2}\$.{53}$/;
const SCRYPT_HASH_PREFIX = 'scrypt$';
const DEFAULT_BCRYPT_ROUNDS = 12;

export type SupportedPasswordHashFormat = 'bcrypt' | 'scrypt' | 'invalid';

/**
 * Validates that a configured ADMIN_PASSWORD_HASH uses an approved salted slow hash format
 * (bcrypt $2a$/$2b$/$2y$ or scrypt$N$r$p$saltHex$hashHex). Never accepts plaintext.
 */
export function detectPasswordHashFormat(storedHash: string | undefined): SupportedPasswordHashFormat {
  if (!storedHash || typeof storedHash !== 'string') return 'invalid';
  const trimmed = storedHash.trim();
  if (BCRYPT_HASH_PREFIX_RE.test(trimmed)) {
    return 'bcrypt';
  }
  if (trimmed.startsWith(SCRYPT_HASH_PREFIX)) {
    const parts = trimmed.split('$');
    if (parts.length === 6) {
      const n = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      if (
        Number.isInteger(n) && n >= 16384 &&
        Number.isInteger(r) && r >= 8 &&
        Number.isInteger(p) && p >= 1 &&
        /^[0-9a-f]{32,}$/i.test(parts[4]) &&
        /^[0-9a-f]{64,}$/i.test(parts[5])
      ) {
        return 'scrypt';
      }
    }
  }
  return 'invalid';
}

/**
 * Generates a salted bcrypt hash (cost 12) suitable for Admin password storage.
 */
export async function hashAdminPasswordBcrypt(plaintextPassword: string, rounds = DEFAULT_BCRYPT_ROUNDS): Promise<string> {
  if (!plaintextPassword || plaintextPassword.length < 6) {
    throw new Error('Admin password must be at least 6 characters long.');
  }
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(plaintextPassword, salt);
}

/**
 * Generates a salted scrypt hash (N=16384, r=8, p=1, 16-byte random salt, 64-byte key)
 * for automatic in-memory Admin credential hashing.
 */
export function hashAdminPasswordScrypt(plaintextPassword: string): string {
  if (!plaintextPassword || plaintextPassword.length < 6) {
    throw new Error('Admin password must be at least 6 characters long.');
  }
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plaintextPassword, salt, 64, { N, r, p }).toString('hex');
  return `scrypt$${N}$${r}$${p}$${salt}$${derived}`;
}

/**
 * Precomputed dummy bcrypt hash used to equalize response timing when the supplied
 * email does not match ADMIN_EMAIL.
 */
const DUMMY_BCRYPT_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKxGhu6D6Y7Q9m4t1Z3J7v8w1R5n2K9p0L4eC';

/**
 * Verifies a candidate password against a stored bcrypt or scrypt hash using constant-time comparison.
 */
export async function verifyAdminPassword(candidatePassword: string, storedHash: string): Promise<boolean> {
  if (!candidatePassword || typeof candidatePassword !== 'string') {
    await bcrypt.compare('dummy-password', DUMMY_BCRYPT_HASH);
    return false;
  }

  const trimmedHash = (storedHash || '').trim();
  const format = detectPasswordHashFormat(trimmedHash);

  if (format === 'bcrypt') {
    try {
      return await bcrypt.compare(candidatePassword, trimmedHash);
    } catch {
      return false;
    }
  }

  if (format === 'scrypt') {
    try {
      const parts = trimmedHash.split('$');
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      const salt = parts[4];
      const expectedHex = parts[5];
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const derivedBuf = crypto.scryptSync(candidatePassword, salt, expectedBuf.length, { N, r, p });
      if (derivedBuf.length !== expectedBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(derivedBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  await bcrypt.compare(candidatePassword, DUMMY_BCRYPT_HASH);
  return false;
}

/**
 * Equalizes timing when the submitted email does not match ADMIN_EMAIL.
 */
export async function burnTimingBudget(): Promise<void> {
  await bcrypt.compare('invalid-admin-attempt', DUMMY_BCRYPT_HASH);
}

/**
 * Constant-time string comparison for normalized identifiers / tokens.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against self to keep branch work symmetrical before returning false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
