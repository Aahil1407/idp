const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { app } = require("../server");
const {
  GROUP_BALANCES_SQL,
  getGroupBalances,
  mapGroupBalances,
} = require("../group-balances");

let server;
let baseUrl;
let originalDatabase;
let payments;
let insertValues;
let lastBalanceQuery;

function rowsForGroup(groupId) {
  if (groupId === 202) {
    return [
      { user_id: 8, name: "Other group payer", total_paid: 900, total_owed: 0, total_settled_outgoing: 0, total_settled_incoming: 0 },
      { user_id: 9, name: "Other group member", total_paid: 0, total_owed: 900, total_settled_outgoing: 0, total_settled_incoming: 0 },
    ];
  }
  return [
    { user_id: 1, name: "A", total_paid: 100, total_owed: 150, total_settled_outgoing: 20, total_settled_incoming: 0 },
    { user_id: 2, name: "B", total_paid: 50, total_owed: 0, total_settled_outgoing: 0, total_settled_incoming: 20 },
  ];
}

function makeDatabase() {
  payments = new Map();
  insertValues = [];
  lastBalanceQuery = null;
  let nextId = 1;

  return {
    query(sql, params, callback) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === GROUP_BALANCES_SQL.replace(/\s+/g, " ").trim()) {
        lastBalanceQuery = { sql, params };
        return callback(null, rowsForGroup(Number(params[0])));
      }

      if (normalized.startsWith("SELECT g.group_id, gm.user_id")) {
        const [fromUser, toUser, groupId] = params.map(Number);
        if (groupId !== 101 && groupId !== 202) return callback(null, []);
        const members = groupId === 101 ? [1, 2] : [8, 9];
        const matches = members
          .filter((userId) => userId === fromUser || userId === toUser)
          .map((user_id) => ({ group_id: groupId, user_id }));
        return callback(null, matches.length ? matches : [{ group_id: groupId, user_id: null }]);
      }

      if (normalized.startsWith("INSERT INTO payments")) {
        insertValues.push(params);
        const [group_id, from_user, to_user, amount] = params;
        payments.set(nextId, { group_id, from_user, to_user, amount, status: "pending" });
        return callback(null, { insertId: nextId++ });
      }

      if (normalized.startsWith("UPDATE payments")) {
        assert.match(normalized, /status = 'settled'.*status = 'pending'/);
        const payment = payments.get(Number(params[0]));
        if (!payment || payment.status !== "pending") return callback(null, { affectedRows: 0 });
        payment.status = "settled";
        return callback(null, { affectedRows: 1 });
      }

      throw new Error(`Unexpected SQL in test: ${normalized}`);
    },
  };
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  return { response, body: await response.json() };
}

before(async () => {
  originalDatabase = app.locals.database;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  app.locals.database = originalDatabase;
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

test("group balance math applies settled outgoing and incoming payments in their correct directions", () => {
  const [a, b] = mapGroupBalances([
    { user_id: 1, name: "A", total_paid: "100.00", total_owed: "150.00", total_settled_outgoing: "20.00", total_settled_incoming: "0.00" },
    { user_id: 2, name: "B", total_paid: "50.00", total_owed: "0.00", total_settled_outgoing: "0.00", total_settled_incoming: "20.00" },
  ]);
  assert.equal(a.balance, -30);
  assert.equal(b.balance, 30);
  assert.equal(a.balance + b.balance, 0);
});

test("balance query is scoped to group and only aggregates settled payments", async () => {
  app.locals.database = makeDatabase();
  const { response, body } = await requestJson("/api/groups/202/balances");
  assert.equal(response.status, 200);
  assert.deepEqual(body.map(({ user_id, balance }) => [user_id, balance]), [[8, 900], [9, -900]]);
  assert.equal(lastBalanceQuery.params.length, 4);
  assert.ok(lastBalanceQuery.params.every((groupId) => groupId === 202));
  assert.match(lastBalanceQuery.sql, /p\.group_id = \? AND p\.status = 'settled'/g);
  assert.doesNotMatch(lastBalanceQuery.sql, /payments[^)]*group_id IS NULL/i);
});

test("legacy NULL-group and pending payments are excluded by the balance query", () => {
  assert.match(GROUP_BALANCES_SQL, /p\.group_id = \? AND p\.status = 'settled'/g);
  assert.doesNotMatch(GROUP_BALANCES_SQL, /COALESCE\(p\.group_id, 0\)|group_id IS NULL/i);
  const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "20261016_add_group_id_to_payments.sql"), "utf8");
  assert.match(migration, /group_id INT UNSIGNED NULL/);
  assert.doesNotMatch(migration, /UPDATE\s+payments/i);
});

test("optimizer uses the same group balance calculation as the balances endpoint", async () => {
  app.locals.database = makeDatabase();
  const balancesResult = await requestJson("/api/groups/101/balances");
  const optimizerResult = await requestJson("/api/groups/101/settlements/optimize", { method: "POST" });
  assert.equal(balancesResult.response.status, 200);
  assert.equal(optimizerResult.response.status, 200);
  assert.equal(lastBalanceQuery.params[0], 101);
  assert.deepEqual(optimizerResult.body.settlements, [
    { from_user: 1, from_name: "A", to_user: 2, to_name: "B", amount: 30 },
  ]);
  const netBalance = balancesResult.body.reduce((total, user) => total + user.balance, 0);
  assert.equal(netBalance, 0);
  assert.equal(optimizerResult.body.group_id, 101);
});

test("payment creation requires a group and both users to be members", async (t) => {
  app.locals.database = makeDatabase();

  await t.test("rejects missing group_id", async () => {
    const { response, body } = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_user: 1, to_user: 2, amount: 10 }),
    });
    assert.equal(response.status, 400);
    assert.match(body.error, /group_id/);
  });

  await t.test("rejects a nonexistent group", async () => {
    const { response } = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 999, from_user: 1, to_user: 2, amount: 10 }),
    });
    assert.equal(response.status, 404);
  });

  await t.test("rejects a user outside the group", async () => {
    const { response } = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 101, from_user: 1, to_user: 9, amount: 10 }),
    });
    assert.equal(response.status, 400);
  });

  await t.test("checks the sender's group membership too", async () => {
    const { response } = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 101, from_user: 9, to_user: 2, amount: 10 }),
    });
    assert.equal(response.status, 400);
  });

  await t.test("rejects payments in the wrong direction or above the current debt", async () => {
    const reversed = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 101, from_user: 2, to_user: 1, amount: 10 }),
    });
    assert.equal(reversed.response.status, 400);

    const excessive = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 101, from_user: 1, to_user: 2, amount: 30.01 }),
    });
    assert.equal(excessive.response.status, 400);
  });

  await t.test("rejects amounts that the DECIMAL column would round", async () => {
    const { response } = await requestJson("/api/settlements/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: 101, from_user: 1, to_user: 2, amount: 1.001 }),
    });
    assert.equal(response.status, 400);
  });
});

test("payment creation stores the requested group and settle transition cannot be repeated", async () => {
  app.locals.database = makeDatabase();
  const created = await requestJson("/api/settlements/pay", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_id: 101, from_user: 1, to_user: 2, amount: 30 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.status, "pending");
  assert.deepEqual(insertValues[0], [101, 1, 2, 30]);

  const firstSettle = await requestJson(`/api/settlements/${created.body.payment_id}/settle`, { method: "PUT" });
  assert.equal(firstSettle.response.status, 200);
  assert.equal(firstSettle.body.status, "settled");

  const repeatSettle = await requestJson(`/api/settlements/${created.body.payment_id}/settle`, { method: "PUT" });
  assert.equal(repeatSettle.response.status, 404);
});
