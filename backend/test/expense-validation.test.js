const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAmountToPaise, validateExpensePayload } = require("../expense-validation");

const base = {
    paid_by: 1,
    description: "Lunch",
    amount: 10,
    splits: [
        { user_id: 1, amount_owed: 3.34 },
        { user_id: 2, amount_owed: 3.33 },
        { user_id: 3, amount_owed: 3.33 },
    ],
};

test("backend converts paise accurately and accepts splits that total exactly", () => {
    assert.equal(parseAmountToPaise(3.34), 334);
    assert.equal(parseAmountToPaise(3.333), null);
    const result = validateExpensePayload(base);
    assert.equal(result.error, undefined);
    assert.equal(result.value.amountPaise, 1000);
    assert.deepEqual(result.value.splits.map((split) => split.amount_owed_paise), [334, 333, 333]);
});

test("backend rejects mismatched totals, duplicate users and zero split rows", () => {
    assert.match(validateExpensePayload({ ...base, splits: [{ user_id: 1, amount_owed: 9.99 }] }).error, /exactly to the paise/);
    assert.match(validateExpensePayload({ ...base, splits: [base.splits[0], base.splits[0], base.splits[2]] }).error, /more than once/);
    assert.match(validateExpensePayload({ ...base, splits: [{ user_id: 1, amount_owed: 0 }, ...base.splits.slice(1)] }).error, /greater than 0/);
});

test("backend rejects malformed, negative and over-precision money values", () => {
    for (const amount of ["", "nope", -1, 1.001, 0]) {
        assert.ok(validateExpensePayload({ ...base, amount }).error, `amount ${String(amount)} should be rejected`);
    }
    assert.ok(validateExpensePayload({ ...base, splits: [{ user_id: 1, amount_owed: -1 }] }).error);
});

test("backend rejects missing descriptions and invalid IDs", () => {
    assert.ok(validateExpensePayload({ ...base, description: "  " }).error);
    assert.ok(validateExpensePayload({ ...base, paid_by: 0 }).error);
    assert.ok(validateExpensePayload({ ...base, splits: [{ user_id: "x", amount_owed: 10 }] }).error);
});
