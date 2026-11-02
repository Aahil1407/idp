const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { app } = require("../server");

let server;
let baseUrl;
let originalDatabase;
let originalAuthDisabled;
let originalTestUser;
let invites;
let memberships;

function makeDatabase() {
  invites = new Map();
  memberships = new Set();
  return {
    query(sql, values, callback) {
      if (typeof values === "function") { callback = values; values = []; }
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("DELETE FROM group_invites")) return callback(null, { affectedRows: 0 });
      if (normalized.startsWith("INSERT INTO group_invites")) {
        const [tokenHash, groupId, createdBy] = values;
        invites.set(tokenHash, { group_id: groupId, created_by: createdBy });
        return callback(null, { insertId: invites.size });
      }
      if (normalized.startsWith("SELECT group_id FROM group_invites")) {
        const invite = invites.get(values[0]);
        return callback(null, invite ? [{ group_id: invite.group_id }] : []);
      }
      if (normalized.startsWith("INSERT INTO group_members")) {
        const key = `${values[0]}:${values[1]}`;
        if (memberships.has(key)) return callback(Object.assign(new Error("duplicate membership"), { code: "ER_DUP_ENTRY" }));
        memberships.add(key);
        return callback(null, { affectedRows: 1 });
      }
      return callback(new Error(`Unexpected SQL in invite test: ${normalized}`));
    },
  };
}

test("group invite links join only through their stored token digest", async (t) => {
  originalDatabase = app.locals.database;
  originalAuthDisabled = app.locals.authDisabled;
  originalTestUser = app.locals.testUser;
  app.locals.database = makeDatabase();
  app.locals.authDisabled = true;
  app.locals.testUser = { user_id: 8, name: "Invite tester", email: "invite@example.test" };
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    app.locals.database = originalDatabase;
    app.locals.authDisabled = originalAuthDisabled;
    app.locals.testUser = originalTestUser;
  });

  const createResponse = await fetch(`${baseUrl}/api/groups/5/invites`, { method: "POST" });
  assert.equal(createResponse.status, 201);
  const invite = await createResponse.json();
  assert.match(invite.token, /^[a-f0-9]{64}$/);
  assert.equal(invite.expires_in_days, 30);
  const tokenHash = crypto.createHash("sha256").update(invite.token).digest("hex");
  assert.equal(invites.has(tokenHash), true);
  assert.equal(invites.has(invite.token), false);

  const joinResponse = await fetch(`${baseUrl}/api/group-invites/${invite.token}/join`, { method: "POST" });
  assert.equal(joinResponse.status, 200);
  assert.deepEqual(await joinResponse.json(), { group_id: 5, already_member: false });
  assert.equal(memberships.has("5:8"), true);

  const duplicateResponse = await fetch(`${baseUrl}/api/group-invites/${invite.token}/join`, { method: "POST" });
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(await duplicateResponse.json(), { group_id: 5, already_member: true });
});

test("invalid invite tokens are rejected before database lookup", async () => {
  const previousAuthDisabled = app.locals.authDisabled;
  app.locals.authDisabled = true;
  const localServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => localServer.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${localServer.address().port}/api/group-invites/nope/join`, { method: "POST" });
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
    app.locals.authDisabled = previousAuthDisabled;
  }
});
