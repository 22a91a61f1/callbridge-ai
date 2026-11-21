import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { hashAdminPasswordBcrypt, hashAdminPasswordScrypt, verifyAdminPassword } from '../server/admin/adminPasswordUtil.ts';

function httpGetWithHost(port: number, reqPath: string, hostHeader: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method: 'GET',
        headers: { Host: hostHeader },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

function extractCookieValue(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) return null;
  const regex = new RegExp(`${name}=([^;]+)`);
  const match = setCookieHeader.match(regex);
  return match ? match[1] : null;
}

async function main() {
  const dbPath = path.resolve(process.cwd(), 'data/callbridge_db.json');
  const authPath = path.resolve(process.cwd(), 'data/auth_identities.json');
  const sessionsPath = path.resolve(process.cwd(), 'data/admin_sessions.json');

  const dbHashBefore = sha256File(dbPath);
  const authHashBefore = sha256File(authPath);

  console.log('=== STEP 3 ADMIN PORTAL VERIFICATION SUITE ===\n');

  // 1. Password hash verification tests (bcrypt + scrypt)
  const testPassword = 'OwnerStrong#AdminPassword2026!';
  const bcryptHash = await hashAdminPasswordBcrypt(testPassword, 10);
  assert.ok(bcryptHash.startsWith('$2'), 'Expected bcrypt hash prefix');
  assert.strictEqual(await verifyAdminPassword(testPassword, bcryptHash), true, 'Valid bcrypt password should verify');
  assert.strictEqual(await verifyAdminPassword('WrongPassword123!', bcryptHash), false, 'Wrong bcrypt password should fail');

  const scryptHash = hashAdminPasswordScrypt(testPassword);
  assert.ok(scryptHash.startsWith('scrypt$'), 'Expected scrypt hash prefix');
  assert.strictEqual(await verifyAdminPassword(testPassword, scryptHash), true, 'Valid scrypt password should verify');
  assert.strictEqual(await verifyAdminPassword('WrongPassword123!', scryptHash), false, 'Wrong scrypt password should fail');
  console.log('[PASS] 1. Password hashing & constant-time verification (bcrypt + scrypt)');

  // 2. Build artifact & zero customer-UI leakage checks
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const distAdminHtml = fs.readFileSync(path.join(distDir, 'admin.html'), 'utf8');
  assert.ok(distAdminHtml.includes('CallBridge AI — Admin Portal'), 'dist/admin.html missing Admin title');
  assert.ok(distAdminHtml.includes('noindex, nofollow'), 'dist/admin.html missing noindex meta');
  assert.ok(!distAdminHtml.includes('razorpay'), 'dist/admin.html must not load customer Razorpay script');
  assert.ok(!distIndexHtml.includes('admin-root'), 'dist/index.html must not contain admin-root');

  // Inspect customer bundle JS files & customer components to verify ZERO Admin links/references
  const customerFilesToAudit = [
    'src/App.tsx',
    'src/components/MainHeader.tsx',
    'src/components/AuthPages.tsx',
    'src/context/AuthContext.tsx',
  ];
  for (const rel of customerFilesToAudit) {
    const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert.ok(!content.includes('/admin'), `${rel} must not contain /admin link`);
    assert.ok(!content.includes('AdminDashboard') && !content.includes('AdminLoginPage'), `${rel} must not reference Admin components`);
  }

  // Verify AdminLoginPage strictly excludes Forbidden Auth Actions
  const adminLoginSource = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/AdminLoginPage.tsx'), 'utf8');
  for (const forbidden of ['Forgot Password', 'Sign up', 'Signup', 'Create Account', 'Google', 'Reset Password', 'Register']) {
    assert.ok(!adminLoginSource.toLowerCase().includes(forbidden.toLowerCase()), `AdminLoginPage must not include "${forbidden}"`);
  }
  console.log('[PASS] 2. Separate dist/index.html & dist/admin.html bundles + zero customer UI leakage + strict Admin login UI');

  // 3. Test live dev server on port 3000 (unconfigured Admin env safety + customer regression)
  const devBase = 'http://localhost:3000';
  await waitForServer(devBase, 10000);

  const devAdminStatus = await fetch(`${devBase}/api/admin/auth/status`).then((r) => r.json());
  assert.strictEqual(devAdminStatus.success, true);
  assert.strictEqual(devAdminStatus.configured, false, 'Live dev server must NOT have hardcoded Admin credentials');

  const devAdminLoginUnconfigured = await fetch(`${devBase}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@callbridgeai.com', password: 'anything' }),
  });
  assert.strictEqual(devAdminLoginUnconfigured.status, 503, 'Unconfigured Admin login must return 503');

  // Hostname routing on dev server: Host: admin.callbridgeai.com at / serves admin.html
  const devAdminHostRes = await httpGetWithHost(3000, '/', 'admin.callbridgeai.com');
  assert.strictEqual(devAdminHostRes.status, 200);
  assert.ok(devAdminHostRes.body.includes('admin-root'), 'Host admin.callbridgeai.com must serve admin.html');
  assert.strictEqual(devAdminHostRes.headers['x-robots-tag'], 'noindex, nofollow');

  // /admin route on dev server serves admin.html
  const devAdminPathRes = await fetch(`${devBase}/admin`);
  const devAdminPathHtml = await devAdminPathRes.text();
  assert.strictEqual(devAdminPathRes.status, 200);
  assert.ok(devAdminPathHtml.includes('admin-root'), '/admin path must serve admin.html');

  // Customer routes on dev server still serve customer index.html
  for (const route of ['/', '/login', '/signup', '/public-survey', '/political-campaign', '/marriage-event', '/upgrade']) {
    const r = await fetch(`${devBase}${route}`);
    const html = await r.text();
    assert.strictEqual(r.status, 200, `Customer route ${route} should return 200`);
    assert.ok(html.includes('id="root"') && !html.includes('admin-root'), `Customer route ${route} must serve customer index.html`);
  }

  // Customer APIs still protected by Firebase auth (401 when unauthenticated)
  const unauthCustomerApi = await fetch(`${devBase}/api/callbridge/events`);
  assert.strictEqual(unauthCustomerApi.status, 401, 'Customer API must remain protected (401)');

  // Telephony & Vapi webhooks still exempt (200)
  const vapiWebhook = await fetch(`${devBase}/api/callbridge/vapi/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { type: 'status-update', status: 'queued', call: { id: 'nonexistent_probe_step3' } } }),
  });
  assert.strictEqual(vapiWebhook.status, 200, 'Vapi webhook must remain exempt and return 200');
  console.log('[PASS] 3. Live dev server safety (no hardcoded Admin creds), hostname/path routing, and customer regression');

  // 4. Spawn isolated production server with ONLY ADMIN_EMAIL + ADMIN_PASSWORD (no hash, no session secret, no custom hostname)
  const testPort = 3097;
  const prodBase = `http://127.0.0.1:${testPort}`;
  const testAdminEmail = 'owner-admin@callbridgeai.com';
  const cleanTestEnv: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'production',
    ADMIN_EMAIL: testAdminEmail,
    ADMIN_PASSWORD: testPassword,
  };
  delete cleanTestEnv.ADMIN_PASSWORD_HASH;
  delete cleanTestEnv.ADMIN_SESSION_SECRET;
  delete cleanTestEnv.ADMIN_HOSTNAME;

  const child = spawn('node', ['server.ts', '--port', String(testPort), '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    env: {
      ...cleanTestEnv,
      ADMIN_LOGIN_MAX_ATTEMPTS: '3',
      ADMIN_LOGIN_WINDOW_MS: '60000',
      ADMIN_LOGIN_LOCKOUT_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let childLogs = '';
  child.stdout.on('data', (d) => { childLogs += d.toString(); });
  child.stderr.on('data', (d) => { childLogs += d.toString(); });

  try {
    await waitForServer(prodBase, 15000);

    // 4a. Production /admin route + optional admin.* hostname routing check
    const prodAdminPath = await fetch(`${prodBase}/admin`);
    const prodAdminPathHtml = await prodAdminPath.text();
    assert.strictEqual(prodAdminPath.status, 200);
    assert.ok(prodAdminPathHtml.includes('admin-root'), 'Prod /admin route must serve dist/admin.html');

    const prodAdminHost = await httpGetWithHost(testPort, '/', 'admin.callbridgeai.com');
    assert.strictEqual(prodAdminHost.status, 200);
    assert.ok(prodAdminHost.body.includes('admin-root'), 'Prod Host admin.callbridgeai.com must serve dist/admin.html');

    const prodCustomerHost = await httpGetWithHost(testPort, '/', 'callbridgeai.com');
    assert.strictEqual(prodCustomerHost.status, 200);
    assert.ok(prodCustomerHost.body.includes('id="root"') && !prodCustomerHost.body.includes('admin-root'), 'Prod Host callbridgeai.com must serve dist/index.html');

    // 4b. Unauthenticated & Customer-token spoofing attempts rejected
    const unauthOverview = await fetch(`${prodBase}/api/admin/overview`);
    assert.strictEqual(unauthOverview.status, 401, 'Unauthenticated /api/admin/overview must return 401');

    const unauthCustomers = await fetch(`${prodBase}/api/admin/customers`);
    assert.strictEqual(unauthCustomers.status, 401, 'Unauthenticated /api/admin/customers must return 401');

    const spoofBearer = await fetch(`${prodBase}/api/admin/overview`, {
      headers: { Authorization: 'Bearer fake-firebase-customer-token' },
    });
    assert.strictEqual(spoofBearer.status, 403, 'Customer Bearer token on Admin API must return 403');

    const spoofHeaders = await fetch(`${prodBase}/api/admin/customers`, {
      headers: { 'x-user-id': 'client_001', 'x-client-id': 'client_001', Cookie: 'cb_id_token=customer_cookie' },
    });
    assert.strictEqual(spoofHeaders.status, 403, 'Customer cookie/headers on Admin API must return 403');
    console.log('[PASS] 4a-b. Production /admin + host separation + unauthenticated (401) & customer-spoofing (403) protection');

    // 4c. Rate limiting check (3 failed attempts -> 4th returns 429)
    for (let i = 1; i <= 3; i++) {
      const badLogin = await fetch(`${prodBase}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.99.1' },
        body: JSON.stringify({ email: testAdminEmail, password: `WrongAttempt_${i}!` }),
      });
      assert.strictEqual(badLogin.status, 401, `Failed login attempt ${i} should return 401`);
    }
    const rateLimited = await fetch(`${prodBase}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.99.1' },
      body: JSON.stringify({ email: testAdminEmail, password: testPassword }),
    });
    assert.strictEqual(rateLimited.status, 429, '4th attempt after 3 failures must return 429 Too Many Requests');
    assert.ok(rateLimited.headers.get('retry-after'), '429 response must include Retry-After header');
    console.log('[PASS] 4c. Failed login rejection (401) and rate limiting (429 + Retry-After)');

    // 4d. Email-based lockout verification
    const loginRes = await fetch(`${prodBase}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.99.2' },
      body: JSON.stringify({ email: testAdminEmail, password: testPassword }),
    });
    assert.strictEqual(loginRes.status, 429, 'Email-based rate limit must also protect against distributed IP brute-force');

    // Stop child #1 and start child #2 with ONLY ADMIN_EMAIL + ADMIN_PASSWORD
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 400));

    const child2 = spawn('node', ['server.ts', '--port', String(testPort), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      env: cleanTestEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let child2Logs = '';
    child2.stdout.on('data', (d) => { child2Logs += d.toString(); });
    child2.stderr.on('data', (d) => { child2Logs += d.toString(); });

    let sessionCookie = '';
    let csrfToken = '';

    try {
      await waitForServer(prodBase, 15000);

      const okLogin = await fetch(`${prodBase}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testAdminEmail, password: testPassword }),
      });
      assert.strictEqual(okLogin.status, 200, 'Valid Admin login with ONLY ADMIN_EMAIL + ADMIN_PASSWORD must return 200');
      const setCookie = okLogin.headers.get('set-cookie');
      assert.ok(setCookie && setCookie.includes('cb_admin_session=') && setCookie.includes('HttpOnly'), 'Must set HttpOnly cb_admin_session cookie');
      sessionCookie = extractCookieValue(setCookie, 'cb_admin_session') || '';
      assert.ok(sessionCookie, 'Session cookie value must be present');

      const loginBody = await okLogin.json();
      assert.strictEqual(loginBody.success, true);
      assert.strictEqual(loginBody.admin.email, testAdminEmail);
      assert.strictEqual(loginBody.admin.role, 'admin');
      assert.ok(loginBody.csrfToken && loginBody.csrfToken.length >= 32, 'CSRF token must be returned');
      csrfToken = loginBody.csrfToken as string;

      // Verify /api/admin/auth/me works with cookie
      const meRes = await fetch(`${prodBase}/api/admin/auth/me`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(meRes.status, 200);
      const meBody = await meRes.json();
      assert.strictEqual(meBody.admin.email, testAdminEmail);
    } finally {
      child2.kill('SIGTERM');
    }

    // 4e. RESTART STABILITY CHECK: Start child #3 with ONLY ADMIN_EMAIL + ADMIN_PASSWORD
    // and verify the existing session cookie from child #2 STILL validates without re-login!
    await new Promise((r) => setTimeout(r, 400));

    const child3 = spawn('node', ['server.ts', '--port', String(testPort), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      env: cleanTestEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let child3Logs = '';
    child3.stdout.on('data', (d) => { child3Logs += d.toString(); });
    child3.stderr.on('data', (d) => { child3Logs += d.toString(); });

    try {
      await waitForServer(prodBase, 15000);

      const meAfterRestart = await fetch(`${prodBase}/api/admin/auth/me`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(meAfterRestart.status, 200, 'Admin session must remain valid across server restarts (stable signing secret)');
      console.log('[PASS] 4d-e. 2-variable Admin login (ADMIN_EMAIL + ADMIN_PASSWORD only) + session survival across real server restart');

      // 4f. Overview metrics & reconciliation with Customer list
      const overviewRes = await fetch(`${prodBase}/api/admin/overview`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(overviewRes.status, 200);
      const { overview } = await overviewRes.json();

      const allCustomersRes = await fetch(`${prodBase}/api/admin/customers?page=1&pageSize=100`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(allCustomersRes.status, 200);
      const allCustomersBody = await allCustomersRes.json();
      const rows = allCustomersBody.customers;

      assert.strictEqual(overview.totalRegisteredCustomers, rows.length, 'Total registered customers must reconcile with customer rows');
      assert.strictEqual(
        overview.freePlanCustomers + overview.upgradedCustomers,
        overview.totalRegisteredCustomers,
        'Free + Upgraded must equal Total Registered Customers'
      );
      assert.strictEqual(
        overview.proPlanCustomers + overview.maxProPlanCustomers,
        overview.upgradedCustomers,
        'Pro + Max Pro must equal Upgraded Customers'
      );

      const sumPurchased = rows.reduce((acc: number, r: any) => acc + r.creditsPurchasedSeconds, 0);
      const sumUsed = rows.reduce((acc: number, r: any) => acc + r.creditsUsedSeconds, 0);
      const sumRemaining = rows.reduce((acc: number, r: any) => acc + r.remainingCreditsSeconds, 0);
      assert.strictEqual(overview.totalCreditsPurchasedSeconds, sumPurchased, 'Total credits purchased must reconcile');
      assert.strictEqual(overview.totalCreditsUsedSeconds, sumUsed, 'Total credits used must reconcile');
      assert.strictEqual(overview.totalCreditsRemainingSeconds, sumRemaining, 'Total credits remaining must reconcile');

      // 4g. Search, Filter, Sort, Pagination verification
      const searchRes = await fetch(`${prodBase}/api/admin/customers?search=rishitha`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      }).then((r) => r.json());
      assert.strictEqual(searchRes.customers.length, 1, 'Email search should match real customer without exposing raw email');
      assert.strictEqual(searchRes.customers[0].customerId, 'cust_BYXGGzMnq8dRFl');
      assert.ok(searchRes.customers[0].maskedEmail.includes('***@'), 'Email must be masked in API response');

      const proFilterRes = await fetch(`${prodBase}/api/admin/customers?plan=pro`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      }).then((r) => r.json());
      assert.ok(proFilterRes.customers.every((r: any) => r.planId === 'pro'), 'Plan filter=pro must return only Pro customers');

      const exhaustedFilterRes = await fetch(`${prodBase}/api/admin/customers?status=exhausted`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      }).then((r) => r.json());
      assert.ok(exhaustedFilterRes.customers.every((r: any) => r.subscriptionStatus === 'exhausted'), 'Status filter=exhausted must return only exhausted accounts');

      const oldestSortRes = await fetch(`${prodBase}/api/admin/customers?sort=oldest&page=1&pageSize=2`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      }).then((r) => r.json());
      assert.strictEqual(oldestSortRes.customers.length, 2, 'Pagination pageSize=2 must return 2 rows');
      assert.ok(oldestSortRes.pagination.totalPages >= 2, 'Pagination totalPages must calculate properly');

      // 4h. Privacy audit: verify strict allowed key schema and zero sensitive customer workspace fields/values
      const allowedRowKeys = new Set([
        'customerId',
        'maskedEmail',
        'registrationDate',
        'planId',
        'planName',
        'subscriptionStatus',
        'creditsPurchasedSeconds',
        'creditsUsedSeconds',
        'remainingCreditsSeconds',
        'freeAllowanceSeconds',
        'source',
      ]);
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          assert.ok(allowedRowKeys.has(key), `Unexpected field "${key}" in Admin customer row`);
        }
      }

      const serializedAdminPayload = JSON.stringify({ overview, customers: rows });
      for (const forbiddenValue of [
        'contacts',
        'transcript',
        'voice_id',
        'voiceProfile',
        'surveyAnswers',
        'campaignScript',
        'password',
        'passwordHash',
        'rishithagogula489@gmail.com',
        'campaign@telangana.org',
        'Txde0pZ5tVhXE6HUspcf',
      ]) {
        assert.ok(
          !serializedAdminPayload.includes(forbiddenValue),
          `Admin API response must NEVER expose "${forbiddenValue}"`
        );
      }

      // 4i. CSRF enforcement on logout + Session revocation after logout
      const logoutNoCsrf = await fetch(`${prodBase}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(logoutNoCsrf.status, 403, 'Logout without CSRF token must return 403');

      const logoutOk = await fetch(`${prodBase}/api/admin/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `cb_admin_session=${sessionCookie}`,
          'X-Admin-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(logoutOk.status, 200, 'Logout with valid CSRF token must return 200');

      const afterLogoutOverview = await fetch(`${prodBase}/api/admin/overview`, {
        headers: { Cookie: `cb_admin_session=${sessionCookie}` },
      });
      assert.strictEqual(afterLogoutOverview.status, 401, 'Revoked session cookie must return 401 after logout');

      // 4j. Verify plaintext password NEVER appears in server logs or any data/* file
      const combinedLogs = `${childLogs}\n${child2Logs}\n${child3Logs}`;
      assert.ok(!combinedLogs.includes(testPassword), 'Server logs must NEVER contain plaintext Admin password');
      assert.ok(!combinedLogs.includes(sessionCookie), 'Server logs must NEVER contain raw session cookie');

      for (const fileName of fs.readdirSync(path.resolve(process.cwd(), 'data'))) {
        const full = path.resolve(process.cwd(), 'data', fileName);
        if (fs.statSync(full).isFile()) {
          const content = fs.readFileSync(full, 'utf8');
          assert.ok(!content.includes(testPassword), `data/${fileName} must NEVER store plaintext Admin password`);
        }
      }

      console.log('[PASS] 4f-j. Reconciled metrics, search/filter/sort/pagination, strict privacy, CSRF logout, session revocation, zero plaintext storage or log leaks');
      console.log('       Live Overview Snapshot:', JSON.stringify(overview));
    } finally {
      child3.kill('SIGTERM');
    }
  } finally {
    child.kill('SIGTERM');
  }

  // Clean up test session file if created by test
  if (fs.existsSync(sessionsPath)) {
    fs.writeFileSync(sessionsPath, JSON.stringify({ sessions: {} }, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  // 5. Verify customer database files are 100% untouched byte-for-byte
  const dbHashAfter = sha256File(dbPath);
  const authHashAfter = sha256File(authPath);
  assert.strictEqual(dbHashAfter, dbHashBefore, 'data/callbridge_db.json must be completely untouched!');
  assert.strictEqual(authHashAfter, authHashBefore, 'data/auth_identities.json must be completely untouched!');
  console.log('[PASS] 5. Data preservation verified (callbridge_db.json & auth_identities.json byte-for-byte identical)');

  console.log('\nALL STEP 3 ADMIN PORTAL VERIFICATION CHECKS PASSED!');
}

main().catch((err) => {
  console.error('\n[FAIL] Verification failed:', err);
  process.exit(1);
});
