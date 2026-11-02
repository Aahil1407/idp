const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAuthRateLimiter,
  createAuthenticator,
  createSessionCredentials,
  hashPassword,
  normalizeEmail,
  readCookies,
  sessionCookie,
  validateDeviceId,
  validatePassword,
  verifyPassword,
} = require("../auth");

const deviceId = "6bcb1ee7-9b52-44ac-9125-e32fc8a53499";

test("password hashes use a fresh salt and verify without storing the password", async () => {
  const first = await hashPassword("a long example password");
  const second = await hashPassword("a long example password");
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword("a long example password", first), true);
  assert.equal(await verifyPassword("a different password", first), false);
  assert.equal(await verifyPassword("password", "invalid hash"), false);
});

test("password, email, and device identifiers are normalized and bounded", () => {
  assert.equal(validatePassword("short"), "Use a password with at least 12 characters.");
  assert.equal(validatePassword("a password with enough length"), "");
  assert.equal(validatePassword("a".repeat(257)), "Password must be 256 bytes or fewer.");
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(validateDeviceId(deviceId), true);
  assert.equal(validateDeviceId("not-a-device"), false);
});

test("session cookie stores only a high-entropy token client-side with safe attributes", () => {
  const credentials = createSessionCredentials();
  assert.equal(credentials.token.length >= 40, true);
  assert.notEqual(credentials.token, credentials.tokenHash);
  assert.equal(readCookies(`other=x; smartsplit_session=${credentials.token}`).smartsplit_session, credentials.token);
  const cookie = sessionCookie(credentials.token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("API authentication requires both the session cookie and the matching device ID", async () => {
  let queryCount = 0;
  const db = { query(sql, values, callback) {
    queryCount += 1;
    if (sql.includes("SELECT s.session_id")) {
      assert.deepEqual(values, [credentials.tokenHash, deviceId]);
      callback(null, [{ session_id: 4, user_id: 9, device_id: deviceId, name: "Member", email: "member@example.com" }]);
    } else callback(null, { affectedRows: 1 });
  } };
  const app = { locals: {} };
  const authenticate = createAuthenticator(db, app);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set() {} };
  let nextCalled = false;
  await authenticate({ headers: {}, get() { return undefined; } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(queryCount, 0);
  const credentials = createSessionCredentials();
  const validResponse = { ...response, statusCode: 200 };
  await authenticate({ headers: { cookie: `smartsplit_session=${credentials.token}` }, get(name) { return name === "X-Device-ID" ? deviceId : undefined; } }, validResponse, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("authentication attempts are rate limited per client", () => {
  let now = 0;
  const limit = createAuthRateLimiter({ maxAttempts: 2, windowMs: 1000, now: () => now });
  const request = { ip: "127.0.0.1", socket: {} };
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set(name, value) { this[name] = value; } };
  let calls = 0;
  limit(request, response, () => { calls += 1; });
  limit(request, response, () => { calls += 1; });
  limit(request, response, () => { calls += 1; });
  assert.equal(calls, 2);
  assert.equal(response.statusCode, 429);
  now = 1001;
  limit(request, response, () => { calls += 1; });
  assert.equal(calls, 3);
});
