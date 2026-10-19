const { withTransaction } = require("./transaction");
const { decimalToPaise, loadGroupBalances } = require("./group-balances");

const GET_PENDING_PAYMENT_SQL = `
    SELECT payment_id, group_id, from_user, to_user, amount
    FROM payments
    WHERE payment_id = ? AND status = 'pending'
    FOR UPDATE
`;

const LOCK_PAYMENT_GROUP_SQL = `
    SELECT group_id
    FROM groups_table
    WHERE group_id = ?
    FOR UPDATE
`;

const MARK_PENDING_PAYMENT_SETTLED_SQL = `
    UPDATE payments
    SET status = 'settled'
    WHERE payment_id = ?
      AND status = 'pending'
`;

function markPaymentSettled(db, paymentId, callback) {
    withTransaction(db, (connection, done) => {
        connection.query(GET_PENDING_PAYMENT_SQL, [paymentId], (paymentError, paymentRows) => {
            if (paymentError) return done(paymentError);
            if (paymentRows.length === 0 || paymentRows[0].group_id === null) return done(null, false);

            const payment = paymentRows[0];
            connection.query(LOCK_PAYMENT_GROUP_SQL, [payment.group_id], (groupError, groupRows) => {
                if (groupError) return done(groupError);
                if (groupRows.length === 0) return done(null, false);

                loadGroupBalances(connection, payment.group_id, (balanceError, balances) => {
                    if (balanceError) return done(balanceError);

                    const sender = balances.find((user) => String(user.user_id) === String(payment.from_user));
                    const recipient = balances.find((user) => String(user.user_id) === String(payment.to_user));
                    const amountPaise = decimalToPaise(payment.amount);
                    const senderDebtPaise = Math.round(Math.abs(sender?.balance || 0) * 100);
                    const recipientCreditPaise = Math.round((recipient?.balance || 0) * 100);
                    if (
                        !sender || !recipient ||
                        sender.balance >= 0 || recipient.balance <= 0 ||
                        amountPaise > BigInt(senderDebtPaise) ||
                        amountPaise > BigInt(recipientCreditPaise)
                    ) {
                        return done(null, false);
                    }

                    connection.query(MARK_PENDING_PAYMENT_SETTLED_SQL, [paymentId], (updateError, result) => {
                        if (updateError) return done(updateError);
                        done(null, result.affectedRows > 0);
                    });
                });
            });
        });
    }, callback);
}

module.exports = { markPaymentSettled };
