const { withTransaction } = require("./transaction");

function createExpenseWithSplits(db, groupId, expense, callback) {
    withTransaction(db, (connection, done) => {
        connection.query(
            `INSERT INTO expenses (group_id, paid_by, description, amount) VALUES (?, ?, ?, ?)`,
            [groupId, expense.paidBy, expense.description, expense.amountPaise / 100],
            (expenseError, expenseResult) => {
                if (expenseError) return done(expenseError);

                const splitValues = expense.splits.map((split) => [
                    expenseResult.insertId,
                    split.user_id,
                    split.amount_owed_paise / 100,
                ]);
                connection.query(
                    "INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ?",
                    [splitValues],
                    (splitError) => {
                        if (splitError) return done(splitError);
                        done(null, expenseResult.insertId);
                    }
                );
            }
        );
    }, callback);
}

module.exports = { createExpenseWithSplits };
