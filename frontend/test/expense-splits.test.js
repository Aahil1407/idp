import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateExpenseSplits,
  parseAmountToPaise,
  parsePercentageToBasisPoints,
  syncAllocationEntries,
  validateExpenseFields,
} from "../src/expense-splits.js";

const userIds = [4, 9, 12];
const amounts = { 4: "3.34", 9: "3.33", 12: "3.33" };

test("money and percentage entry precision are parsed into integer units", () => {
  assert.equal(parseAmountToPaise("12.34"), 1234);
  assert.equal(parseAmountToPaise("0.1"), 10);
  assert.equal(parseAmountToPaise("1.234"), null);
  assert.equal(parseAmountToPaise("-1"), null);
  assert.equal(parseAmountToPaise("10000000000.00"), null);
  assert.equal(parsePercentageToBasisPoints("33.33"), 3333);
  assert.equal(parsePercentageToBasisPoints("33.333"), null);
  assert.equal(parsePercentageToBasisPoints("-1"), null);
});

test("expense validation checks required fields and group membership", () => {
  const valid = {
    description: " Lunch ", amountPaise: 1000, paidBy: "1",
    participantIds: ["2"], groupMemberIds: new Set(["1", "2"]), splitType: "Exact",
  };
  assert.equal(validateExpenseFields({ ...valid, description: "  " }), "Enter an expense description.");
  assert.match(validateExpenseFields({ ...valid, amountPaise: null }), /valid amount greater than zero/);
  assert.equal(validateExpenseFields({ ...valid, paidBy: "" }), "Choose who paid for this expense.");
  assert.equal(validateExpenseFields({ ...valid, participantIds: [] }), "Select at least one expense participant.");
  assert.match(validateExpenseFields({ ...valid, participantIds: ["9"] }), /must be current members/);
  assert.equal(validateExpenseFields(valid), "");
});

test("Equal splits work evenly and distribute remainder paise deterministically", () => {
  const even = calculateExpenseSplits({ splitType: "Equal", amountPaise: 1002, participantIds: [1, 2] });
  assert.deepEqual(even.splits.map((split) => Math.round(split.amount_owed * 100)), [501, 501]);

  const remainder = calculateExpenseSplits({ splitType: "Equal", amountPaise: 1000, participantIds: userIds });
  assert.deepEqual(remainder.splits.map((split) => Math.round(split.amount_owed * 100)), [334, 333, 333]);
  assert.equal(sumPaise(remainder.splits), 1000);
  assert.equal(calculateExpenseSplits({ splitType: "Equal", amountPaise: 2, participantIds: userIds }).totalError, "The amount must be at least 1 paise per participant.");
});

test("Exact and Custom splits require positive valid amounts and exact totals", () => {
  for (const splitType of ["Exact", "Custom"]) {
    const matching = calculateExpenseSplits({ splitType, amountPaise: 1000, participantIds: userIds, amountEntries: amounts });
    assert.equal(matching.totalError, "");
    assert.equal(sumPaise(matching.splits), 1000);

    const mismatch = calculateExpenseSplits({ splitType, amountPaise: 1001, participantIds: userIds, amountEntries: amounts });
    assert.match(mismatch.totalError, /must equal/);
    assert.deepEqual(mismatch.splits, []);
  }
});

test("Exact and Custom reject missing, malformed, negative, and zero allocations", () => {
  for (const splitType of ["Exact", "Custom"]) {
    for (const badEntry of [undefined, "abc", "-0.01", "0", "1.234"]) {
      const result = calculateExpenseSplits({
        splitType,
        amountPaise: 100,
        participantIds: [1],
        amountEntries: badEntry === undefined ? {} : { 1: badEntry },
      });
      assert.notEqual(result.totalError, "", `${splitType} should reject ${String(badEntry)}`);
      assert.equal(result.splits.length, 0);
      assert.ok(result.fieldErrors["1"]);
    }
  }
});

test("Percentage splits reject totals below and above 100 percent", () => {
  const below = calculateExpenseSplits({ splitType: "Percentage", amountPaise: 10000, participantIds: [1, 2], percentageEntries: { 1: "40", 2: "59.99" } });
  assert.match(below.totalError, /99.99%.*100.00%/);
  const above = calculateExpenseSplits({ splitType: "Percentage", amountPaise: 10000, participantIds: [1, 2], percentageEntries: { 1: "40", 2: "60.01" } });
  assert.match(above.totalError, /100.01%.*100.00%/);
});

test("Percentage totals of 100 percent allocate exactly using largest remainders", () => {
  const result = calculateExpenseSplits({
    splitType: "Percentage",
    amountPaise: 10001,
    participantIds: userIds,
    percentageEntries: { 4: "33.33", 9: "33.33", 12: "33.34" },
  });
  assert.equal(result.totalError, "");
  assert.deepEqual(result.splits.map((split) => Math.round(split.amount_owed * 100)), [3333, 3333, 3335]);
  assert.equal(sumPaise(result.splits), 10001);
});

test("Percentage allocations reject malformed entries and shares below one paise", () => {
  for (const percentageEntries of [{ 1: "-1", 2: "101" }, { 1: "abc", 2: "100" }, { 2: "100" }]) {
    const invalid = calculateExpenseSplits({ splitType: "Percentage", amountPaise: 100, participantIds: [1, 2], percentageEntries });
    assert.ok(invalid.fieldErrors["1"]);
    assert.match(invalid.totalError, /Fix the highlighted/);
  }

  const tooSmall = calculateExpenseSplits({ splitType: "Percentage", amountPaise: 1, participantIds: [1, 2], percentageEntries: { 1: "50", 2: "50" } });
  assert.equal(tooSmall.splits.length, 0);
  assert.match(tooSmall.totalError, /at least ₹0.01/);
});

test("manual allocations stay keyed to participant IDs as selection changes", () => {
  assert.deepEqual(syncAllocationEntries({ 4: "12.50", 9: "7.50", 99: "1" }, [9, 12]), {
    9: "7.50",
    12: "",
  });
});

test("all successful split methods produce allocations totaling the expense exactly", () => {
  const cases = [
    calculateExpenseSplits({ splitType: "Equal", amountPaise: 1000, participantIds: userIds }),
    calculateExpenseSplits({ splitType: "Exact", amountPaise: 1000, participantIds: userIds, amountEntries: amounts }),
    calculateExpenseSplits({ splitType: "Custom", amountPaise: 1000, participantIds: userIds, amountEntries: amounts }),
    calculateExpenseSplits({ splitType: "Percentage", amountPaise: 1000, participantIds: userIds, percentageEntries: { 4: "33.34", 9: "33.33", 12: "33.33" } }),
  ];
  for (const result of cases) {
    assert.equal(result.totalError, "");
    assert.equal(sumPaise(result.splits), 1000);
    assert.ok(result.splits.every((split) => Math.round(split.amount_owed * 100) >= 1));
  }
});

function sumPaise(splits) {
  return splits.reduce((sum, split) => sum + Math.round(split.amount_owed * 100), 0);
}
