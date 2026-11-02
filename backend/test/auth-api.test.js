const test = require("node:test");
const assert = require("node:assert/strict");
const { after, before } = require("node:test");
const { app } = require("../server");

let server;
let baseUrl;
let originalDatabase;
let originalAuthDisabled;
let accounts;
let sessions;
let nextUserId;
let nextSessionId;

const deviceId = "6bcb1ee7-9b52-44ac-9125-e32fc8a53499";

function makeDatabase() {
  accounts = new Map();
  sessions = new Map();
  nextUserId = 1;
  nextSessionId = 1;
  return {
    query(sql, values, callback) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT user_id FROM users WHERE LOWER(TRIM(email))")) {
        const account = [...accounts.values()].find((row) => row.email.trim().toLowerCase() === values[0]);
        return callback(null, account ? [{ user_id: account.user_id }] : []);
      }
      if (normalized.startsWith("INSERT INTO users")) {
        if ([...accounts.values()].some((row) => row.email === values[1])) return callback(Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }));
        const account = { user_id: nextUserId++, name: values[0], email: values[1], password_hash: values[2] };
        accounts.set(account.user_id, account);
        return callback(null, { insertId: account.user_id });
      }
      if (normalized.startsWith("SELECT user_id, name, email, password_hash FROM users")) {
        const account = [...accounts.values()].find((row) => row.email.toLowerCase() === values[0]);
        return callback(null, account ? [account] : []);
      }
      if (normalized.startsWith("DELETE FROM user_sessions WHERE expires_at")) {
        for (const [sessionId, session] of sessions) {
          if (session.user_id === values[0] && session.device_id === values[1]) sessions.delete(sessionId);
        }
        return callback(null, { affectedRows: 1 });
      }
      if (normalized.startsWith("INSERT INTO user_sessions")) {
        const [user_id, device_id, device_name, token_hash] = values;
        const session = { session_id: nextSessionId++, user_id, device_id, device_name, token_hash, expires_at: "2099-01-01 00:00:00", last_seen: "2026-11-02 12:00:00" };
        sessions.set(session.session_id, session);
        return callback(null, { insertId: session.session_id });
      }
      if (normalized.startsWith("SELECT s.session_id")) {
        const session = [...sessions.values()].find((row) => row.token_hash === values[0] && row.device_id === values[1]);
        const account = session && accounts.get(session.user_id);
        return callback(null, session && account ? [{ ...session, name: account.name, email: account.email }] : []);
      }
      if (normalized.startsWith("UPDATE user_sessions SET last_seen")) return callback(null, { affectedRows: 1 });
      if (normalized.startsWith("SELECT session_id, device_id, device_name")) {
        return callback(null, [...sessions.values()].filter((row) => row.user_id === values[0]));
      }
      if (normalized.startsWith("DELETE FROM user_sessions WHERE session_id")) {
        const session = sessions.get(values[0]);
        if (session && session.user_id === values[1]) sessions.delete(values[0]);
        return callback(null, { affectedRows: session ? 1 : 0 });
      }
      if (normalized.startsWith("DELETE FROM user_sessions WHERE user_id")) {
        for (const [sessionId, session] of sessions) if (session.user_id === values[0]) sessions.delete(sessionId);
        return callback(null, { affectedRows: 1 });
      }
      if (normalized.startsWith("SELECT user_id FROM group_members")) {
        return callback(null, Number(values[0]) === 3 && Number(values[1]) === 1 ? [{ user_id: 1 }] : []);
      }
      throw new Error(`Unexpected auth API SQL: ${normalized}`);
    },
  };
}

async function request(path, { method = "GET", body, cookie, device = deviceId } = {}) {
  const headers = { "X-Device-ID": device };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, body: await response.json() };
}

before(async () => {
  originalDatabase = app.locals.database;
  originalAuthDisabled = app.locals.authDisabled;
  app.locals.authDisabled = false;
  app.locals.database = makeDatabase();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  app.locals.database = originalDatabase;
  app.locals.authDisabled = originalAuthDisabled;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("signup creates a hashed account and a device session, then protected routes require it", async () => {
  const signup = await request("/api/auth/register", { method: "POST", body: { name: "Ari", email: "Ari@example.com", password: "a long and unique password", device_name: "This browser · Windows" } });
  assert.equal(signup.response.status, 201);
  assert.equal(accounts.get(1).password_hash.includes("a long and unique password"), false);
  const cookie = signup.response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(cookie.includes([...sessions.values()][0].token_hash), false);

  const anonymous = await request("/api/groups");
  assert.equal(anonymous.response.status, 401);
  const current = await request("/api/auth/me", { cookie, device: deviceId });
  assert.equal(current.response.status, 200);
  assert.deepEqual(current.body.user, { user_id: 1, name: "Ari", email: "ari@example.com" });
  const wrongDevice = await request("/api/auth/me", { cookie, device: "dc033478-53a2-4654-af7f-aed9310fbf13" });
  assert.equal(wrongDevice.response.status, 401);
  const outsideGroup = await request("/api/groups/4", { cookie });
  assert.equal(outsideGroup.response.status, 403);
});

test("login uses a generic error and binds a replacement session to the same browser", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "ARI@example.com", password: "a long and unique password", device_name: "This browser · Windows" } });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.equal(sessions.size, 1);
  const rejected = await request("/api/auth/login", { method: "POST", body: { email: "ari@example.com", password: "incorrect password", device_name: "This browser" } });
  assert.equal(rejected.response.status, 401);
  assert.equal(rejected.body.error, "Email or password is incorrect.");
});

test("logout revokes the server-side device session", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "ari@example.com", password: "a long and unique password", device_name: "This browser" } });
  const cookie = login.response.headers.get("set-cookie");
  const logout = await request("/api/auth/logout", { method: "POST", cookie });
  assert.equal(logout.response.status, 200);
  assert.equal(sessions.size, 0);
  const current = await request("/api/auth/me", { cookie });
  assert.equal(current.response.status, 401);
});
