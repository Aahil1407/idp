const MAX_AMOUNT_PAISE = 999_999_999_999;
const MAX_UNSIGNED_INT = 4_294_967_295;

function parseAmountToPaise(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const amountText = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) return null;

    const [whole, fraction = ""] = amountText.split(".");
    const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(paise) && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

function parsePositiveId(value) {
    const id = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    return Number.isSafeInteger(id) && id > 0 && id <= MAX_UNSIGNED_INT ? id : null;
}

function validateExpensePayload(body = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "A valid expense request body is required" };
    }

    const paidBy = parsePositiveId(body.paid_by);
    if (!paidBy) return { error: "paid_by must be a positive integer user ID" };
    if (typeof body.description !== "string" || !body.description.trim()) {
        return { error: "description is required" };
    }

    const description = body.description.trim();
    if (description.length > 500) return { error: "description must be 500 characters or fewer" };
    const amountPaise = parseAmountToPaise(body.amount);
    if (amountPaise === null || amountPaise <= 0) {
        return { error: "amount must be greater than 0 and have at most two decimal places" };
    }
    if (!Array.isArray(body.splits) || body.splits.length === 0) {
        return { error: "splits must be a non-empty array" };
    }

    const seenUserIds = new Set();
    let splitTotalPaise = 0;
    const splits = [];
    for (const split of body.splits) {
        if (!split || typeof split !== "object" || Array.isArray(split)) {
            return { error: "Each split must contain user_id and amount_owed" };
        }
        const userId = parsePositiveId(split.user_id);
        if (!userId || split.amount_owed === undefined) {
            return { error: "Each split must contain a valid user_id and amount_owed" };
        }
        if (seenUserIds.has(userId)) return { error: `User ${userId} appears more than once in splits` };
        seenUserIds.add(userId);

        const amountOwedPaise = parseAmountToPaise(split.amount_owed);
        if (amountOwedPaise === null || amountOwedPaise <= 0) {
            return { error: "Each amount_owed must be greater than 0 and have at most two decimal places" };
        }
        splitTotalPaise += amountOwedPaise;
        if (!Number.isSafeInteger(splitTotalPaise)) return { error: "Split total is too large" };
        splits.push({ user_id: userId, amount_owed_paise: amountOwedPaise });
    }

    if (splitTotalPaise !== amountPaise) {
        return { error: "Split amounts must equal the expense amount exactly to the paise" };
    }

    return { value: { paidBy, description, amountPaise, splits } };
}

function validateExpenseMembership(expense, memberIds) {
    if (!memberIds || memberIds.size === 0) return "Group has no members";
    if (!memberIds.has(expense.paidBy)) return "paid_by user is not a member of this group";
    for (const split of expense.splits) {
        if (!memberIds.has(split.user_id)) return `User ${split.user_id} is not a member of this group`;
    }
    return "";
}

module.exports = { parseAmountToPaise, validateExpensePayload, validateExpenseMembership };
