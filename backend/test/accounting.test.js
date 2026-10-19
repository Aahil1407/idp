const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateGroupBalances, EXPENSE_BALANCES_SQL, SETTLED_PAYMENTS_SQL } = require("../group-balances");
const { markPaymentSettled } = require("../payment-state");
const { buildSettlementPlan } = require("../settlement-optimizer");

const expenseBalances = [
    { user_id: 1, name: "Creator", total_paid: "100.00", total_owed: "50.00" },
    { user_id: 3, name: "Member", total_paid: "0.00", total_owed: "50.00" },
];

test("expenses without payments retain their expense-derived balances", () => {
    const balances = calculateGroupBalances(expenseBalances, [], 1);

    assert.deepEqual(balances.map(user => user.balance), [50, -50]);
});

test("pending payments do not change outstanding balances", () => {
    const balances = calculateGroupBalances(expenseBalances, [
        { group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "pending" },
    ], 1);

    assert.deepEqual(balances.map(user => user.balance), [50, -50]);
});

test("settled payments offset payer and recipient balances", () => {
    const balances = calculateGroupBalances(expenseBalances, [
        { group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "settled" },
    ], 1);

    assert.deepEqual(balances.map(user => user.balance), [0, 0]);
});

test("the optimizer does not propose debt already covered by a settled payment", () => {
    const balances = calculateGroupBalances(expenseBalances, [
        { group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "settled" },
    ], 1);

    assert.deepEqual(buildSettlementPlan(1, balances), {
        group_id: 1,
        settlements: [],
    });
});

test("other-group and legacy unassigned payments do not affect this group", () => {
    const balances = calculateGroupBalances(expenseBalances, [
        { group_id: 1, from_user: 3, to_user: 1, amount: "20.00", status: "settled" },
        { group_id: 2, from_user: 3, to_user: 1, amount: "30.00", status: "settled" },
        { group_id: null, from_user: 3, to_user: 1, amount: "50.00", status: "settled" },
    ], 1);

    assert.deepEqual(balances.map(user => user.balance), [30, -30]);
});

test("a payment can transition from pending to settled only once", async () => {
    const payments = new Map([[42, { payment_id: 42, group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "pending" }]]);
    const settled = new Map();
    const fakeDb = {
        beginTransaction(callback) { callback(null); },
        commit(callback) { callback(null); },
        rollback(callback) { callback(null); },
        query(sql, values, callback) {
            const normalized = sql.replace(/\s+/g, " ").trim();
            if (normalized.startsWith("SELECT payment_id, group_id, from_user, to_user, amount")) {
                const payment = payments.get(values[0]);
                return callback(null, payment?.status === "pending" ? [payment] : []);
            }
            if (normalized.startsWith("SELECT group_id FROM groups_table")) return callback(null, [{ group_id: values[0] }]);
            if (normalized === EXPENSE_BALANCES_SQL.replace(/\s+/g, " ").trim()) return callback(null, expenseBalances);
            if (normalized === SETTLED_PAYMENTS_SQL.replace(/\s+/g, " ").trim()) {
                return callback(null, [...settled.values()].filter((payment) => payment.group_id === values[0] && payment.status === "settled"));
            }
            if (normalized.startsWith("UPDATE payments")) {
                const payment = payments.get(values[0]);
                if (!payment || payment.status !== "pending") return callback(null, { affectedRows: 0 });
                payment.status = "settled";
                settled.set(payment.payment_id, payment);
                return callback(null, { affectedRows: 1 });
            }
            callback(new Error(`Unexpected query: ${normalized}`));
        },
    };
    const settle = () => new Promise((resolve, reject) => {
        markPaymentSettled(fakeDb, 42, (error, wasSettled) => {
            if (error) return reject(error);
            resolve(wasSettled);
        });
    });

    assert.equal(await settle(), true);
    assert.equal(await settle(), false);
    assert.equal(payments.get(42).status, "settled");
});

test("a stale pending payment cannot settle after another payment clears the debt", async () => {
    const pending = { payment_id: 42, group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "pending" };
    const settled = { payment_id: 41, group_id: 1, from_user: 3, to_user: 1, amount: "50.00", status: "settled" };
    const queries = {
        beginTransaction(callback) { callback(null); },
        commit(callback) { callback(null); },
        rollback(callback) { callback(null); },
        query(sql, values, callback) {
            const normalized = sql.replace(/\s+/g, " ").trim();
            if (normalized.startsWith("SELECT payment_id, group_id, from_user, to_user, amount")) return callback(null, [pending]);
            if (normalized.startsWith("SELECT group_id FROM groups_table")) return callback(null, [{ group_id: values[0] }]);
            if (normalized === EXPENSE_BALANCES_SQL.replace(/\s+/g, " ").trim()) return callback(null, expenseBalances);
            if (normalized === SETTLED_PAYMENTS_SQL.replace(/\s+/g, " ").trim()) return callback(null, [settled]);
            if (normalized.startsWith("UPDATE payments")) return callback(null, { affectedRows: 1 });
            callback(new Error(`Unexpected query: ${normalized}`));
        },
    };

    const wasSettled = await new Promise((resolve, reject) => markPaymentSettled(queries, 42, (error, result) => error ? reject(error) : resolve(result)));
    assert.equal(wasSettled, false);
    assert.equal(pending.status, "pending");
});
