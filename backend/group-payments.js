const { loadGroupBalances } = require("./group-balances");

function recordGroupPayment(db, { groupId, fromUser, toUser, amountPaise }, callback) {
    db.query(
        `SELECT g.group_id, gm.user_id
         FROM groups_table g
         LEFT JOIN group_members gm
           ON gm.group_id = g.group_id
          AND gm.user_id IN (?, ?)
         WHERE g.group_id = ?`,
        [fromUser, toUser, groupId],
        (membershipError, membershipRows) => {
            if (membershipError) return callback(membershipError);
            if (membershipRows.length === 0) return callback(null, { notFound: true });

            const memberIds = new Set(
                membershipRows
                    .map((row) => row.user_id)
                    .filter((userId) => userId !== null && userId !== undefined)
                    .map(String)
            );
            if (!memberIds.has(String(fromUser)) || !memberIds.has(String(toUser))) {
                return callback(null, { invalidMembers: true });
            }

            loadGroupBalances(db, groupId, (balanceError, balances) => {
                if (balanceError) return callback(balanceError);

                const sender = balances.find((user) => String(user.user_id) === String(fromUser));
                const recipient = balances.find((user) => String(user.user_id) === String(toUser));
                const senderDebtPaise = Math.round(Math.abs(sender?.balance || 0) * 100);
                const recipientCreditPaise = Math.round((recipient?.balance || 0) * 100);
                if (
                    !sender || !recipient ||
                    sender.balance >= 0 || recipient.balance <= 0 ||
                    amountPaise > senderDebtPaise || amountPaise > recipientCreditPaise
                ) {
                    return callback(null, { invalidSettlement: true });
                }

                db.query(
                    "INSERT INTO payments (group_id, from_user, to_user, amount) VALUES (?, ?, ?, ?)",
                    [groupId, fromUser, toUser, amountPaise / 100],
                    (insertError, result) => {
                        if (insertError) return callback(insertError);
                        callback(null, { paymentId: result.insertId });
                    }
                );
            });
        }
    );
}

module.exports = { recordGroupPayment };
