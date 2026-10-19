const EXPENSE_BALANCES_SQL = `
    SELECT
        u.user_id,
        u.name,
        COALESCE(paid.total_paid, 0) AS total_paid,
        COALESCE(owed.total_owed, 0) AS total_owed
    FROM group_members gm
    JOIN users u ON gm.user_id = u.user_id
    LEFT JOIN (
        SELECT e.paid_by AS user_id, SUM(e.amount) AS total_paid
        FROM expenses e
        WHERE e.group_id = ?
        GROUP BY e.paid_by
    ) paid ON u.user_id = paid.user_id
    LEFT JOIN (
        SELECT es.user_id, SUM(es.amount_owed) AS total_owed
        FROM expense_splits es
        JOIN expenses e ON es.expense_id = e.expense_id
        WHERE e.group_id = ?
        GROUP BY es.user_id
    ) owed ON u.user_id = owed.user_id
`;

const SETTLED_PAYMENTS_SQL = `
    SELECT group_id, from_user, to_user, amount, status
    FROM payments
    WHERE group_id = ? AND status = 'settled'
`;

function decimalToPaise(value) {
    const text = String(value ?? "0").trim();
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) throw new TypeError(`Invalid database monetary value: ${text}`);
    const paise = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0") || "0");
    return match[1] === "-" ? -paise : paise;
}

function paiseToNumber(paise) {
    const amount = Number(paise);
    if (!Number.isSafeInteger(amount)) throw new RangeError("Group monetary total exceeds safe paise precision");
    return amount / 100;
}

function calculateGroupBalances(expenseRows, paymentRows, groupId) {
    const settledByUser = new Map();
    const requestedGroupId = String(groupId);

    for (const payment of paymentRows) {
        if (payment.status !== "settled" || String(payment.group_id) !== requestedGroupId) continue;

        const amountPaise = decimalToPaise(payment.amount);
        if (amountPaise <= 0n) continue;

        const payerId = String(payment.from_user);
        const recipientId = String(payment.to_user);
        const payerTotals = settledByUser.get(payerId) || { sent: 0n, received: 0n };
        const recipientTotals = settledByUser.get(recipientId) || { sent: 0n, received: 0n };
        payerTotals.sent += amountPaise;
        recipientTotals.received += amountPaise;
        settledByUser.set(payerId, payerTotals);
        settledByUser.set(recipientId, recipientTotals);
    }

    return expenseRows.map((user) => {
        const settled = settledByUser.get(String(user.user_id)) || { sent: 0n, received: 0n };
        const totalPaidPaise = decimalToPaise(user.total_paid);
        const totalOwedPaise = decimalToPaise(user.total_owed);
        const balancePaise = totalPaidPaise - totalOwedPaise + settled.sent - settled.received;

        return {
            user_id: user.user_id,
            name: user.name,
            total_paid: paiseToNumber(totalPaidPaise),
            total_owed: paiseToNumber(totalOwedPaise),
            balance: paiseToNumber(balancePaise),
        };
    });
}

function loadGroupBalances(db, groupId, callback) {
    db.query(EXPENSE_BALANCES_SQL, [groupId, groupId], (expenseError, expenseRows) => {
        if (expenseError) return callback(expenseError);

        db.query(SETTLED_PAYMENTS_SQL, [groupId], (paymentError, paymentRows) => {
            if (paymentError) return callback(paymentError);
            try {
                callback(null, calculateGroupBalances(expenseRows, paymentRows, groupId));
            } catch (calculationError) {
                callback(calculationError);
            }
        });
    });
}

module.exports = {
    EXPENSE_BALANCES_SQL,
    SETTLED_PAYMENTS_SQL,
    calculateGroupBalances,
    decimalToPaise,
    loadGroupBalances,
};
