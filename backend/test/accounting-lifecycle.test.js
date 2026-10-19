const test = require("node:test");
const assert = require("node:assert/strict");
const { createGroupWithCreator, validateGroupInput } = require("../group-creation");
const { addGroupMember } = require("../group-membership");
const { validateExpensePayload, validateExpenseMembership } = require("../expense-validation");
const { createExpenseWithSplits } = require("../expense-write");
const { recordGroupPayment } = require("../group-payments");
const { loadGroupBalances } = require("../group-balances");
const { buildSettlementPlan } = require("../settlement-optimizer");
const { markPaymentSettled } = require("../payment-state");

test("mocked lifecycle persists each split mode, settles the optimized payment, and scopes groups", async () => {
    const { calculateExpenseSplits } = await import("../../frontend/src/expense-splits.js");
    const db = createLedgerDb();
    const groupInput = validateGroupInput({ group_name: "  Lifecycle  ", created_by: 1 });
    assert.equal(groupInput.error, undefined);
    const groupId = await createGroup(db, groupInput.value);
    assert.deepEqual([...db.state.members.get(groupId)], [1]);

    await addMember(db, groupId, 2);
    await assert.rejects(addMember(db, groupId, 2), (error) => error.code === "ER_DUP_ENTRY");

    const splitCases = [
        ["Equal", {}, {}, [501, 500]],
        ["Exact", { 1: "3.00", 2: "7.01" }, {}, [300, 701]],
        ["Percentage", {}, { 1: "49.99", 2: "50.01" }, [500, 501]],
        ["Custom", { 1: "6.75", 2: "3.26" }, {}, [675, 326]],
    ];

    for (const [splitType, amountEntries, percentageEntries, expectedPaise] of splitCases) {
        const calculation = calculateExpenseSplits({
            splitType,
            amountPaise: 1001,
            participantIds: [1, 2],
            amountEntries,
            percentageEntries,
        });
        assert.equal(calculation.totalError, "", `${splitType} frontend allocation should be valid`);
        assert.deepEqual(calculation.splits.map((split) => Math.round(split.amount_owed * 100)), expectedPaise);

        const payload = {
            paid_by: 1,
            description: `${splitType} allocation`,
            amount: 10.01,
            splits: calculation.splits,
        };
        const validation = validateExpensePayload(payload);
        assert.equal(validation.error, undefined);
        assert.equal(validateExpenseMembership(validation.value, db.state.members.get(groupId)), "");
        await createExpense(db, groupId, validation.value);
        const persisted = db.state.splits.filter((split) => split.group_id === groupId && split.description === payload.description);
        assert.equal(persisted.reduce((sum, split) => sum + split.amountPaise, 0), 1001);
    }

    const balancesBefore = await loadBalances(db, groupId);
    assert.deepEqual(balancesBefore.map((user) => user.balance), [20.28, -20.28]);
    assert.equal(Math.round(balancesBefore.reduce((sum, user) => sum + user.balance, 0) * 100), 0);

    const plan = buildSettlementPlan(groupId, balancesBefore);
    assert.equal(plan.settlements.length, 1);
    assert.equal(plan.settlements[0].amount, 20.28);
    assert.ok(plan.settlements.every((payment) => payment.amount <= Math.abs(balancesBefore.find((user) => user.user_id === payment.from_user).balance)));

    const payment = await recordPayment(db, {
        groupId,
        fromUser: plan.settlements[0].from_user,
        toUser: plan.settlements[0].to_user,
        amountPaise: Math.round(plan.settlements[0].amount * 100),
    });
    assert.ok(payment.paymentId);
    assert.equal(db.state.payments.get(payment.paymentId).group_id, groupId);
    assert.deepEqual((await loadBalances(db, groupId)).map((user) => user.balance), [20.28, -20.28], "pending payments do not reduce balances");

    assert.equal(await settlePayment(db, payment.paymentId), true);
    assert.equal(await settlePayment(db, payment.paymentId), false, "a settled payment cannot be settled twice");
    assert.deepEqual((await loadBalances(db, groupId)).map((user) => user.balance), [0, 0]);
    assert.deepEqual(buildSettlementPlan(groupId, await loadBalances(db, groupId)).settlements, []);

    const otherGroupId = await createGroup(db, { groupName: "Separate group", createdBy: 1 });
    await addMember(db, otherGroupId, 2);
    const otherExpense = validateExpensePayload({
        paid_by: 1,
        description: "Other group cent balance",
        amount: 0.02,
        splits: [{ user_id: 1, amount_owed: 0.01 }, { user_id: 2, amount_owed: 0.01 }],
    });
    await createExpense(db, otherGroupId, otherExpense.value);
    const otherPlan = buildSettlementPlan(otherGroupId, await loadBalances(db, otherGroupId));
    assert.equal(otherPlan.settlements[0].amount, 0.01);
    assert.deepEqual(await tryRecordPayment(db, {
        groupId: otherGroupId,
        fromUser: 99,
        toUser: 1,
        amountPaise: 1,
    }), { invalidMembers: true }, "settlements reject users outside the group");
    const otherPayment = await recordPayment(db, {
        groupId: otherGroupId,
        fromUser: 2,
        toUser: 1,
        amountPaise: 1,
    });
    await settlePayment(db, otherPayment.paymentId);

    assert.deepEqual((await loadBalances(db, groupId)).map((user) => user.balance), [0, 0], "settlement in another group has no effect");
    assert.deepEqual((await loadBalances(db, otherGroupId)).map((user) => user.balance), [0, 0]);
});

test("mocked lifecycle rejects invalid members and rolls back failed expense and settlement writes", async () => {
    const db = createLedgerDb({ failSplitInsert: true, failPaymentUpdate: true });
    const groupId = await createGroup(db, { groupName: "Failure case", createdBy: 1 });
    await addMember(db, groupId, 2);

    const invalid = validateExpensePayload({
        paid_by: 1,
        description: "Invalid member",
        amount: 1,
        splits: [{ user_id: 99, amount_owed: 1 }],
    });
    assert.equal(validateExpenseMembership(invalid.value, db.state.members.get(groupId)), "User 99 is not a member of this group");

    const expense = validateExpensePayload({
        paid_by: 1,
        description: "Will fail during split insert",
        amount: 1,
        splits: [{ user_id: 1, amount_owed: 0.5 }, { user_id: 2, amount_owed: 0.5 }],
    });
    await assert.rejects(createExpense(db, groupId, expense.value), /simulated split insert failure/);
    assert.equal(db.state.expenses.length, 0, "failed split persistence rolls the expense back");

    db.state.expenses.push({ group_id: groupId, paid_by: 1, amountPaise: 100 });
    db.state.splits.push({ group_id: groupId, user_id: 2, amountPaise: 100 });
    db.state.payments.set(99, { group_id: groupId, from_user: 2, to_user: 1, amount: "1.00", status: "pending" });
    await assert.rejects(settlePayment(db, 99), /simulated settlement update failure/);
    assert.equal(db.state.payments.get(99).status, "pending", "failed update leaves payment pending");
});

test("the optimizer includes a one-paise debt", () => {
    const plan = buildSettlementPlan(1, [
        { user_id: 1, name: "Creditor", balance: 0.01 },
        { user_id: 2, name: "Debtor", balance: -0.01 },
    ]);
    assert.deepEqual(plan.settlements.map((payment) => payment.amount), [0.01]);
});

function createLedgerDb({ failSplitInsert = false, failPaymentUpdate = false } = {}) {
    const state = {
        users: new Map([[1, "Creator"], [2, "Participant"]]),
        groups: new Map(),
        members: new Map(),
        expenses: [],
        splits: [],
        payments: new Map(),
        nextGroupId: 1,
        nextExpenseId: 1,
        nextPaymentId: 1,
    };
    let transactionSnapshot = null;

    return {
        state,
        beginTransaction(callback) {
            transactionSnapshot = structuredClone(state);
            callback(null);
        },
        commit(callback) {
            transactionSnapshot = null;
            callback(null);
        },
        rollback(callback) {
            if (transactionSnapshot) {
                for (const key of Object.keys(state)) state[key] = transactionSnapshot[key];
                transactionSnapshot = null;
            }
            callback(null);
        },
        query(sql, values, callback) {
            const query = sql.replace(/\s+/g, " ").trim();
            if (query.startsWith("INSERT INTO groups_table")) {
                const id = state.nextGroupId++;
                state.groups.set(id, { group_name: values[0], created_by: values[1] });
                state.members.set(id, new Set());
                return callback(null, { insertId: id });
            }
            if (query.startsWith("INSERT INTO group_members")) {
                const [groupId, userId] = values;
                const members = state.members.get(Number(groupId));
                if (members?.has(Number(userId))) return callback(Object.assign(new Error("duplicate member"), { code: "ER_DUP_ENTRY" }));
                if (!members || !state.users.has(Number(userId))) return callback(new Error("invalid member foreign key"));
                members.add(Number(userId));
                return callback(null, { affectedRows: 1 });
            }
            if (query.startsWith("INSERT INTO expenses")) {
                const id = state.nextExpenseId++;
                state.expenses.push({ expense_id: id, group_id: values[0], paid_by: values[1], description: values[2], amountPaise: Math.round(values[3] * 100) });
                return callback(null, { insertId: id });
            }
            if (query.startsWith("INSERT INTO expense_splits")) {
                if (failSplitInsert) return callback(new Error("simulated split insert failure"));
                for (const [expenseId, userId, amount] of values[0]) {
                    const expense = state.expenses.find((row) => row.expense_id === expenseId);
                    state.splits.push({ expense_id: expenseId, group_id: expense.group_id, description: expense.description, user_id: userId, amountPaise: Math.round(amount * 100) });
                }
                return callback(null, { affectedRows: values[0].length });
            }
            if (query.startsWith("SELECT g.group_id, gm.user_id")) {
                const [fromUser, toUser, groupId] = values;
                if (!state.groups.has(groupId)) return callback(null, []);
                const members = state.members.get(groupId);
                const rows = [fromUser, toUser].filter((id, index, ids) => ids.indexOf(id) === index && members.has(id)).map((user_id) => ({ group_id: groupId, user_id }));
                return callback(null, rows.length ? rows : [{ group_id: groupId, user_id: null }]);
            }
            if (query.startsWith("INSERT INTO payments")) {
                const id = state.nextPaymentId++;
                state.payments.set(id, { group_id: values[0], from_user: values[1], to_user: values[2], amount: values[3].toFixed(2), status: "pending" });
                return callback(null, { insertId: id });
            }
            if (query.startsWith("SELECT payment_id, group_id, from_user, to_user, amount FROM payments")) {
                const payment = state.payments.get(Number(values[0]));
                return callback(null, payment?.status === "pending" ? [{ payment_id: Number(values[0]), ...payment }] : []);
            }
            if (query.startsWith("SELECT group_id FROM groups_table")) {
                return callback(null, state.groups.has(Number(values[0])) ? [{ group_id: Number(values[0]) }] : []);
            }
            if (query.startsWith("UPDATE payments")) {
                if (failPaymentUpdate) return callback(new Error("simulated settlement update failure"));
                const payment = state.payments.get(Number(values[0]));
                if (!payment || payment.status !== "pending") return callback(null, { affectedRows: 0 });
                payment.status = "settled";
                return callback(null, { affectedRows: 1 });
            }
            if (query.includes("COALESCE(paid.total_paid, 0) AS total_paid")) {
                const [groupId] = values;
                const rows = [...(state.members.get(groupId) || [])].map((userId) => {
                    const paid = state.expenses.filter((expense) => expense.group_id === groupId && expense.paid_by === userId).reduce((sum, expense) => sum + expense.amountPaise, 0);
                    const owed = state.splits.filter((split) => split.group_id === groupId && split.user_id === userId).reduce((sum, split) => sum + split.amountPaise, 0);
                    return { user_id: userId, name: state.users.get(userId), total_paid: formatMoney(paid), total_owed: formatMoney(owed) };
                });
                return callback(null, rows);
            }
            if (query.startsWith("SELECT group_id, from_user, to_user, amount, status FROM payments")) {
                const [groupId] = values;
                return callback(null, [...state.payments.values()].filter((payment) => payment.group_id === groupId && payment.status === "settled"));
            }
            callback(new Error(`Unexpected mock query: ${query}`));
        },
    };
}

function formatMoney(paise) {
    return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function createGroup(db, input) {
    return new Promise((resolve, reject) => createGroupWithCreator(db, input, (error, id) => error ? reject(error) : resolve(id)));
}

function addMember(db, groupId, userId) {
    return new Promise((resolve, reject) => addGroupMember(db, groupId, userId, (error, result) => error ? reject(error) : resolve(result)));
}

function createExpense(db, groupId, expense) {
    return new Promise((resolve, reject) => createExpenseWithSplits(db, groupId, expense, (error, id) => error ? reject(error) : resolve(id)));
}

function recordPayment(db, paymentData) {
    return new Promise((resolve, reject) => recordGroupPayment(db, paymentData, (error, result) => error ? reject(error) : result?.paymentId ? resolve(result) : reject(new Error("Group payment rejected"))));
}

function tryRecordPayment(db, paymentData) {
    return new Promise((resolve, reject) => recordGroupPayment(db, paymentData, (error, result) => error ? reject(error) : resolve(result)));
}

function loadBalances(db, groupId) {
    return new Promise((resolve, reject) => loadGroupBalances(db, groupId, (error, balances) => error ? reject(error) : resolve(balances)));
}

function settlePayment(db, paymentId) {
    return new Promise((resolve, reject) => markPaymentSettled(db, paymentId, (error, wasSettled) => error ? reject(error) : resolve(wasSettled)));
}
