const MAX_AMOUNT_PAISE = 999_999_999_999;
const SPLIT_TYPES = new Set(["Equal", "Exact", "Percentage", "Custom"]);

export function parseAmountToPaise(value) {
  const amountText = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) return null;

  const [whole, fraction = ""] = amountText.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

export function parsePercentageToBasisPoints(value) {
  const percentageText = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(percentageText)) return null;
  const [whole, fraction = ""] = percentageText.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(basisPoints) ? basisPoints : null;
}

export function validateExpenseFields({ description, amountPaise, paidBy, participantIds, groupMemberIds, splitType }) {
  if (!String(description ?? "").trim()) return "Enter an expense description.";
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return "Enter a valid amount greater than zero, with no more than two decimal places.";
  if (!paidBy) return "Choose who paid for this expense.";
  if (!Array.isArray(participantIds) || participantIds.length === 0) return "Select at least one expense participant.";

  const validMemberIds = groupMemberIds instanceof Set
    ? groupMemberIds
    : new Set(Array.from(groupMemberIds || [], String));
  if (!validMemberIds.has(String(paidBy)) || !participantIds.every((id) => validMemberIds.has(String(id)))) {
    return "The payer and all participants must be current members of this group. Reload the member list and try again.";
  }
  if (!SPLIT_TYPES.has(splitType)) return "Choose a supported split method.";
  return "";
}

export function syncAllocationEntries(entries, participantIds) {
  const synced = {};
  for (const userId of participantIds) {
    const key = String(userId);
    synced[key] = Object.hasOwn(entries || {}, key) ? entries[key] : "";
  }
  return synced;
}

export function calculateEqualSplits(amountPaise, participantIds) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError("Enter a valid amount greater than zero.");
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new RangeError("Select at least one participant.");
  }
  if (amountPaise < participantIds.length) {
    throw new RangeError("The amount must be at least 1 paise per participant.");
  }

  const basePaise = Math.floor(amountPaise / participantIds.length);
  const remainderPaise = amountPaise % participantIds.length;
  return participantIds.map((userId, index) => ({
    user_id: Number(userId),
    amount_owed: (basePaise + (index < remainderPaise ? 1 : 0)) / 100,
  }));
}

function calculateAmountSplits(amountPaise, participantIds, entries) {
  const fieldErrors = {};
  const parsedAmounts = participantIds.map((userId) => {
    const key = String(userId);
    const paise = parseAmountToPaise(entries?.[key]);
    if (paise === null) fieldErrors[key] = "Enter a valid non-negative amount (up to 2 decimal places).";
    else if (paise < 1) fieldErrors[key] = "Each participant must receive at least ₹0.01.";
    return paise;
  });

  if (Object.keys(fieldErrors).length) {
    return { splits: [], fieldErrors, totalPaise: null, totalError: "Fix the highlighted participant amounts." };
  }

  const totalPaise = parsedAmounts.reduce((sum, paise) => sum + paise, 0);
  const splits = participantIds.map((userId, index) => ({
    user_id: Number(userId),
    amount_owed: parsedAmounts[index] / 100,
  }));
  return {
    splits: totalPaise === amountPaise ? splits : [],
    fieldErrors,
    totalPaise,
    totalError: totalPaise === amountPaise ? "" : `Amounts total ${formatPaise(totalPaise)}; they must equal ${formatPaise(amountPaise)}.`,
  };
}

function calculatePercentageSplits(amountPaise, participantIds, entries) {
  const fieldErrors = {};
  const basisPoints = participantIds.map((userId) => {
    const key = String(userId);
    const value = parsePercentageToBasisPoints(entries?.[key]);
    if (value === null) fieldErrors[key] = "Enter a valid non-negative percentage (up to 2 decimal places).";
    else if (value > 10_000) fieldErrors[key] = "A participant cannot have more than 100.00%.";
    return value;
  });

  if (Object.keys(fieldErrors).length) {
    return { splits: [], fieldErrors, totalBasisPoints: null, totalError: "Fix the highlighted percentages." };
  }

  const totalBasisPoints = basisPoints.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(totalBasisPoints)) {
    return { splits: [], fieldErrors, totalBasisPoints: null, totalError: "The percentage total is too large to validate." };
  }
  if (totalBasisPoints !== 10_000) {
    const totalPercent = (totalBasisPoints / 100).toFixed(2);
    return {
      splits: [],
      fieldErrors,
      totalBasisPoints,
      totalError: `Percentages total ${totalPercent}%; they must equal exactly 100.00%.`,
    };
  }

  const shares = basisPoints.map((percentage, index) => {
    const numerator = BigInt(amountPaise) * BigInt(percentage);
    return { index, paise: numerator / 10_000n, remainder: numerator % 10_000n };
  });
  const leftover = Number(BigInt(amountPaise) - shares.reduce((sum, share) => sum + share.paise, 0n));
  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.index - right.index;
  });
  for (let index = 0; index < leftover; index += 1) {
    shares[remainderOrder[index].index].paise += 1n;
  }

  for (const share of shares) {
    if (share.paise < 1n) fieldErrors[String(participantIds[share.index])] = "This allocation is less than ₹0.01. Adjust the percentages.";
  }
  const splits = fieldErrors && Object.keys(fieldErrors).length === 0
    ? shares.map((share) => ({ user_id: Number(participantIds[share.index]), amount_owed: Number(share.paise) / 100 }))
    : [];

  return {
    splits,
    fieldErrors,
    totalBasisPoints,
    totalError: Object.keys(fieldErrors).length ? "Every participant must receive at least ₹0.01." : "",
  };
}

function formatPaise(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function calculateExpenseSplits({ splitType, amountPaise, participantIds, amountEntries = {}, percentageEntries = {} }) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return { splits: [], fieldErrors: {}, totalError: "Enter a valid amount greater than zero." };
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return { splits: [], fieldErrors: {}, totalError: "Select at least one participant." };
  }

  if (splitType === "Equal") {
    try {
      return { splits: calculateEqualSplits(amountPaise, participantIds), fieldErrors: {}, totalError: "" };
    } catch (error) {
      return { splits: [], fieldErrors: {}, totalError: error.message };
    }
  }
  if (splitType === "Exact" || splitType === "Custom") {
    return calculateAmountSplits(amountPaise, participantIds, amountEntries);
  }
  if (splitType === "Percentage") {
    return calculatePercentageSplits(amountPaise, participantIds, percentageEntries);
  }
  return { splits: [], fieldErrors: {}, totalError: "Choose a supported split method." };
}
