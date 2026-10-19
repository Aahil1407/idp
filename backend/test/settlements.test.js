const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { app } = require("../server");
const { calculateGroupBalances, EXPENSE_BALANCES_SQL, SETTLED_PAYMENTS_SQL } = require("../group-balances");

let server;
let baseUrl;
let originalDatabase;
let payments;
let insertValues;

function expenseRows(groupId) {
  if (groupId === 202) {
    return [
      { user_id: 8, name: "Debtor", total_paid: "0.00", total_owed: "900.00" },
      { user_id: 9, name: "Creditor", total_paid: "900.00", total_owed: "0.00" },
    ];
  }
  return [
    { user_id: 1, name: "A", total_paid: "100.00", total_owed: "150.00" },
    { user_id: 2, name: "B", total_paid: "50.00", total_owed: "0.00" },
  ];
}

function makeDatabase() {
  payments = new Map([
    [10, { group_id: 101, from_user: 1, to_user: 2, amount: "20.00", status: "settled" }],
    [11, { group_id: null, from_user: 1, to_user: 2, amount: "999.00", status: "settled" }],
    [12, { group_id: null, from_user: 1, to_user: 2, amount: "1.00", status: "settled" }],
    [13, { group_id: null, from_user: 2, to_user: 1, amount: "4.00", status: "settled" }],
    [14, { group_id: 101, from_user: 1, to_user: 2, amount: "2.00", status: "pending" }],
  ]);
  insertValues = [];
  let nextId = 20;

  return {
    beginTransaction(callback) { callback(null); },
    commit(callback) { callback(null); },
    rollback(callback) { callback(null); },
    query(sql, params, callback) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === EXPENSE_BALANCES_SQL.replace(/\s+/g, " ").trim()) {
        return callback(null, expenseRows(Number(params[0])));
      }
      if (normalized === SETTLED_PAYMENTS_SQL.replace(/\s+/g, " ").trim()) {
        return callback(null, [...payments.values()].filter((payment) => Number(payment.group_id) === Number(params[0]) && payment.status === "settled"));
      }
      if (normalized.startsWith("SELECT g.group_id, gm.user_id")) {
        const [fromUser, toUser, groupId] = params.map(Number);
        if (groupId !== 101 && groupId !== 202) return callback(null, []);
        const members = groupId === 101 ? [1, 2] : [8, 9];
        const matches = members.filter((userId) => userId === fromUser || userId === toUser)
          .map((user_id) => ({ group_id: groupId, user_id }));
        return callback(null, matches.length ? matches : [{ group_id: groupId, user_id: null }]);
      }
      if (normalized.startsWith("INSERT INTO payments")) {
        insertValues.push(params);
        const [group_id, from_user, to_user, amount] = params;
        payments.set(nextId, { group_id, from_user, to_user, amount: amount.toFixed(2), status: "pending" });
        return callback(null, { insertId: nextId++ });
      }
      if (normalized.startsWith("SELECT payment_id, group_id, from_user, to_user, amount FROM payments")) {
        const payment = payments.get(Number(params[0]));
        return callback(null, payment?.status === "pending" ? [{ payment_id: Number(params[0]), ...payment }] : []);
      }
      if (normalized.startsWith("SELECT group_id FROM groups_table")) {
        return callback(null, Number(params[0]) === 101 || Number(params[0]) === 202 ? [{ group_id: Number(params[0]) }] : []);
      }
      if (normalized.startsWith("UPDATE payments")) {
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

function jsonBody(body) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

before(async () => {
  originalDatabase = app.locals.database;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  app.locals.database = originalDatabase;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("settled payments adjust balances in the correct direction using integer paise", () => {
  const [debtor, creditor] = calculateGroupBalances([
    { user_id: 1, name: "Debtor", total_paid: "100.00", total_owed: "150.00" },
    { user_id: 2, name: "Creditor", total_paid: "50.00", total_owed: "0.00" },
  ], [{ group_id: 101, from_user: 1, to_user: 2, amount: "20.00", status: "settled" }], 101);
  assert.equal(debtor.balance, -30);
  assert.equal(creditor.balance, 30);
  assert.equal(debtor.balance + creditor.balance, 0);
});

test("balance endpoint scopes settled payments to the requested group and excludes NULL and pending rows", async () => {
  app.locals.database = makeDatabase();
  const { response, body } = await requestJson("/api/groups/101/balances");
  assert.equal(response.status, 200);
  assert.deepEqual(body.map(({ user_id, balance }) => [user_id, balance]), [[1, -30], [2, 30]]);
});

test("settlement optimizer returns the same balances and only group-scoped suggested payments", async () => {
  app.locals.database = makeDatabase();
  const balancesResult = await requestJson("/api/groups/101/balances");
  const planResult = await requestJson("/api/groups/101/settlements/optimize", { method: "POST" });
  assert.equal(balancesResult.response.status, 200);
  assert.equal(planResult.response.status, 200);
  assert.equal(planResult.body.group_id, 101);
  assert.deepEqual(planResult.body.settlements, [
    { from_user: 1, from_name: "A", to_user: 2, to_name: "B", amount: 30 },
  ]);
});

test("payment creation rejects missing groups, nonmembers, wrong direction, and amounts above current debt", async () => {
  app.locals.database = makeDatabase();
  const missing = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ from_user: 1, to_user: 2, amount: 30 }) });
  assert.equal(missing.response.status, 400);

  const nonexistent = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ group_id: 999, from_user: 1, to_user: 2, amount: 30 }) });
  assert.equal(nonexistent.response.status, 404);

  const nonmember = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ group_id: 101, from_user: 1, to_user: 9, amount: 1 }) });
  assert.equal(nonmember.response.status, 400);

  const reversed = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ group_id: 101, from_user: 2, to_user: 1, amount: 1 }) });
  assert.equal(reversed.response.status, 400);

  const excessive = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ group_id: 101, from_user: 1, to_user: 2, amount: 30.01 }) });
  assert.equal(excessive.response.status, 400);

  const overPrecision = await requestJson("/api/settlements/pay", { method: "POST", ...jsonBody({ group_id: 101, from_user: 1, to_user: 2, amount: 1.001 }) });
  assert.equal(overPrecision.response.status, 400);
});

test("valid payment is stored against its group and can transition from pending only once", async () => {
  app.locals.database = makeDatabase();
  const created = await requestJson("/api/settlements/pay", {
    method: "POST",
    ...jsonBody({ group_id: 101, from_user: 1, to_user: 2, amount: 30 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.status, "pending");
  assert.deepEqual(insertValues[0], [101, 1, 2, 30]);

  const firstSettle = await requestJson(`/api/settlements/${created.body.payment_id}/settle`, { method: "PUT" });
  assert.equal(firstSettle.response.status, 200);
  assert.equal(firstSettle.body.status, "settled");

  const repeatedSettle = await requestJson(`/api/settlements/${created.body.payment_id}/settle`, { method: "PUT" });
  assert.equal(repeatedSettle.response.status, 404);
});

test("full migration keeps legacy rows nullable and preserves user foreign keys in the fresh schema", () => {
  const root = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(root, "migrations", "20261015_add_group_id_to_payments.sql"), "utf8");
  const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
  assert.match(migration, /group_id INT UNSIGNED NULL/);
  assert.match(migration, /FOREIGN KEY \(group_id, from_user\)\s+REFERENCES group_members \(group_id, user_id\)/);
  assert.match(migration, /FOREIGN KEY \(group_id, to_user\)\s+REFERENCES group_members \(group_id, user_id\)/);
  assert.match(schema, /KEY idx_payments_group_from_user \(group_id, from_user\)/);
  assert.match(schema, /KEY idx_payments_group_to_user \(group_id, to_user\)/);
  assert.match(schema, /CONSTRAINT fk_payments_from_user/);
  assert.match(schema, /CONSTRAINT fk_payments_to_user/);
  assert.doesNotMatch(migration, /UPDATE\s+payments/i);
  assert.doesNotMatch(migration, /DROP\s+FOREIGN\s+KEY/i);
});
