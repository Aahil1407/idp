const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());


// ==========================================
// TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.json({
        message: "SmartSplit backend is running!"
    });
});


// ==========================================
// USERS
// ==========================================

// GET ALL USERS
app.get("/api/users", (req, res) => {

    const sql = "SELECT * FROM users";

    db.query(sql, (err, results) => {

        if (err) {
            console.log(err);

            return res.status(500).json({
                error: "Database error"
            });
        }

        res.json(results);
    });
});


// CREATE USER
app.post("/api/users", (req, res) => {

    const { name, email, phone, upi_id } = req.body;

    if (!name || !email) {
        return res.status(400).json({
            error: "Name and email are required"
        });
    }

    const sql = `
        INSERT INTO users (name, email, phone, upi_id)
        VALUES (?, ?, ?, ?)
    `;

    db.query(
        sql,
        [name, email, phone || null, upi_id || null],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.status(201).json({
                message: "User created successfully!",
                user_id: result.insertId
            });
        }
    );
});


// ==========================================
// GROUPS
// ==========================================

// CREATE GROUP
app.post("/api/groups", (req, res) => {

    const { group_name, created_by } = req.body;

    if (!group_name || !created_by) {
        return res.status(400).json({
            error: "group_name and created_by are required"
        });
    }

    const sql = `
        INSERT INTO groups_table (group_name, created_by)
        VALUES (?, ?)
    `;

    db.query(
        sql,
        [group_name, created_by],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.status(201).json({
                message: "Group created successfully!",
                group_id: result.insertId
            });
        }
    );
});


// GET GROUP DETAILS
app.get("/api/groups/:id", (req, res) => {

    const groupId = req.params.id;

    const sql = `
        SELECT
            g.group_id,
            g.group_name,
            g.created_by,
            g.created_at
        FROM groups_table g
        WHERE g.group_id = ?
    `;

    db.query(sql, [groupId], (err, results) => {

        if (err) {
            console.log(err);

            return res.status(500).json({
                error: "Database error"
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                error: "Group not found"
            });
        }

        res.json(results[0]);
    });
});


// ==========================================
// GROUP MEMBERS
// ==========================================

// ADD MEMBER TO GROUP
app.post("/api/groups/:id/members", (req, res) => {

    const groupId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            error: "user_id is required"
        });
    }

    const sql = `
        INSERT INTO group_members (group_id, user_id)
        VALUES (?, ?)
    `;

    db.query(
        sql,
        [groupId, user_id],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.status(201).json({
                message: "Member added successfully!"
            });
        }
    );
});


// GET GROUP MEMBERS
app.get("/api/groups/:id/members", (req, res) => {

    const groupId = req.params.id;

    const sql = `
        SELECT
            u.user_id,
            u.name,
            u.email,
            u.phone,
            u.upi_id
        FROM group_members gm
        JOIN users u
            ON gm.user_id = u.user_id
        WHERE gm.group_id = ?
    `;

    db.query(sql, [groupId], (err, results) => {

        if (err) {
            console.log(err);

            return res.status(500).json({
                error: "Database error"
            });
        }

        res.json(results);
    });
});


// ==========================================
// EXPENSES
// ==========================================

// CREATE EXPENSE
app.post("/api/groups/:id/expenses", (req, res) => {

    const groupId = Number(req.params.id);

    const {
        paid_by,
        description,
        amount,
        splits
    } = req.body;


    // ==========================================
    // BASIC VALIDATION
    // ==========================================

    if (!paid_by || !description || amount === undefined || !splits) {
        return res.status(400).json({
            error: "paid_by, description, amount and splits are required"
        });
    }

    const expenseAmount = Number(amount);

    if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
        return res.status(400).json({
            error: "amount must be greater than 0"
        });
    }

    if (!Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({
            error: "splits must be a non-empty array"
        });
    }


    // ==========================================
    // VALIDATE SPLITS
    // ==========================================

    let splitTotal = 0;

    for (const split of splits) {

        if (!split.user_id || split.amount_owed === undefined) {
            return res.status(400).json({
                error: "Each split must contain user_id and amount_owed"
            });
        }

        const amountOwed = Number(split.amount_owed);

        if (!Number.isFinite(amountOwed) || amountOwed <= 0) {
            return res.status(400).json({
                error: "Each amount_owed must be greater than 0"
            });
        }

        splitTotal += amountOwed;
    }


    // Check that splits equal expense amount
    if (Math.abs(splitTotal - expenseAmount) > 0.01) {
        return res.status(400).json({
            error: "Split amounts must equal the expense amount"
        });
    }


    // ==========================================
    // CHECK GROUP + MEMBERS
    // ==========================================

    const memberSql = `
        SELECT user_id
        FROM group_members
        WHERE group_id = ?
    `;

    db.query(
        memberSql,
        [groupId],
        (memberErr, memberResults) => {

            if (memberErr) {
                console.log(memberErr);

                return res.status(500).json({
                    error: "Could not verify group members"
                });
            }

            if (memberResults.length === 0) {
                return res.status(400).json({
                    error: "Group has no members"
                });
            }


            const memberIds = new Set(
                memberResults.map(member => member.user_id)
            );


            // Check payer belongs to group
            if (!memberIds.has(Number(paid_by))) {
                return res.status(400).json({
                    error: "paid_by user is not a member of this group"
                });
            }


            // Check every split user belongs to group
            for (const split of splits) {

                if (!memberIds.has(Number(split.user_id))) {
                    return res.status(400).json({
                        error: `User ${split.user_id} is not a member of this group`
                    });
                }
            }


            // ==========================================
            // START DATABASE TRANSACTION
            // ==========================================

            db.beginTransaction((transactionErr) => {

                if (transactionErr) {
                    console.log(transactionErr);

                    return res.status(500).json({
                        error: "Could not start database transaction"
                    });
                }


                // ==========================================
                // CREATE EXPENSE
                // ==========================================

                const expenseSql = `
                    INSERT INTO expenses
                    (group_id, paid_by, description, amount)
                    VALUES (?, ?, ?, ?)
                `;

                db.query(
                    expenseSql,
                    [
                        groupId,
                        paid_by,
                        description,
                        expenseAmount
                    ],
                    (expenseErr, expenseResult) => {

                        if (expenseErr) {

                            return db.rollback(() => {

                                console.log(expenseErr);

                                res.status(500).json({
                                    error: "Could not create expense"
                                });

                            });
                        }


                        const expenseId = expenseResult.insertId;


                        // ==========================================
                        // CREATE EXPENSE SPLITS
                        // ==========================================

                        const splitSql = `
                            INSERT INTO expense_splits
                            (expense_id, user_id, amount_owed)
                            VALUES ?
                        `;

                        const splitValues = splits.map(split => [
                            expenseId,
                            Number(split.user_id),
                            Number(split.amount_owed)
                        ]);


                        db.query(
                            splitSql,
                            [splitValues],
                            (splitErr) => {

                                if (splitErr) {

                                    return db.rollback(() => {

                                        console.log(splitErr);

                                        res.status(500).json({
                                            error: "Could not create expense splits"
                                        });

                                    });
                                }


                                // ==========================================
                                // COMMIT TRANSACTION
                                // ==========================================

                                db.commit((commitErr) => {

                                    if (commitErr) {

                                        return db.rollback(() => {

                                            console.log(commitErr);

                                            res.status(500).json({
                                                error: "Could not save expense"
                                            });

                                        });
                                    }


                                    res.status(201).json({
                                        message: "Expense created successfully!",
                                        expense_id: expenseId
                                    });

                                });

                            }
                        );

                    }
                );

            });

        }
    );
});


// GET GROUP EXPENSES
app.get("/api/groups/:id/expenses", (req, res) => {

    const groupId = req.params.id;

    const sql = `
        SELECT
            e.expense_id,
            e.description,
            e.amount,
            e.paid_by,
            u.name AS paid_by_name,
            e.expense_date
        FROM expenses e
        JOIN users u
            ON e.paid_by = u.user_id
        WHERE e.group_id = ?
        ORDER BY e.expense_date DESC
    `;

    db.query(sql, [groupId], (err, results) => {

        if (err) {
            console.log(err);

            return res.status(500).json({
                error: "Database error"
            });
        }

        res.json(results);
    });
});


// ==========================================
// BALANCE CALCULATION
// ==========================================

app.get("/api/groups/:id/balances", (req, res) => {

    const groupId = req.params.id;

    const sql = `
        SELECT
            u.user_id,
            u.name,

            COALESCE(paid.total_paid, 0) AS total_paid,

            COALESCE(owed.total_owed, 0) AS total_owed

        FROM group_members gm

        JOIN users u
            ON gm.user_id = u.user_id

        LEFT JOIN (

            SELECT
                e.paid_by AS user_id,
                SUM(e.amount) AS total_paid

            FROM expenses e

            WHERE e.group_id = ?

            GROUP BY e.paid_by

        ) paid
            ON u.user_id = paid.user_id

        LEFT JOIN (

            SELECT
                es.user_id,
                SUM(es.amount_owed) AS total_owed

            FROM expense_splits es

            JOIN expenses e
                ON es.expense_id = e.expense_id

            WHERE e.group_id = ?

            GROUP BY es.user_id

        ) owed
            ON u.user_id = owed.user_id;

    `;

    db.query(
        sql,
        [groupId, groupId],
        (err, results) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            const balances = results.map(user => {

                const balance =
                    Number(user.total_paid) -
                    Number(user.total_owed);

                return {
                    user_id: user.user_id,
                    name: user.name,
                    total_paid: Number(user.total_paid),
                    total_owed: Number(user.total_owed),
                    balance: balance
                };
            });

            res.json(balances);
        }
    );
});


// ==========================================
// SETTLEMENT OPTIMIZATION
// ==========================================

app.post("/api/groups/:id/settlements/optimize", (req, res) => {

    const groupId = req.params.id;

    const balanceSql = `
        SELECT
            u.user_id,
            u.name,

            COALESCE(paid.total_paid, 0) AS total_paid,

            COALESCE(owed.total_owed, 0) AS total_owed

        FROM group_members gm

        JOIN users u
            ON gm.user_id = u.user_id

        LEFT JOIN (

            SELECT
                e.paid_by AS user_id,
                SUM(e.amount) AS total_paid

            FROM expenses e

            WHERE e.group_id = ?

            GROUP BY e.paid_by

        ) paid
            ON u.user_id = paid.user_id

        LEFT JOIN (

            SELECT
                es.user_id,
                SUM(es.amount_owed) AS total_owed

            FROM expense_splits es

            JOIN expenses e
                ON es.expense_id = e.expense_id

            WHERE e.group_id = ?

            GROUP BY es.user_id

        ) owed
            ON u.user_id = owed.user_id
    `;

    db.query(
        balanceSql,
        [groupId, groupId],
        (err, results) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Could not calculate balances"
                });
            }

            const creditors = [];
            const debtors = [];

            results.forEach(user => {

                const balance =
                    Number(user.total_paid) -
                    Number(user.total_owed);

                if (balance > 0.01) {

                    creditors.push({
                        user_id: user.user_id,
                        name: user.name,
                        amount: balance
                    });

                } else if (balance < -0.01) {

                    debtors.push({
                        user_id: user.user_id,
                        name: user.name,
                        amount: Math.abs(balance)
                    });

                }
            });

            const settlements = [];

            let i = 0;
            let j = 0;

            while (
                i < debtors.length &&
                j < creditors.length
            ) {

                const debtor = debtors[i];
                const creditor = creditors[j];

                const paymentAmount = Math.min(
                    debtor.amount,
                    creditor.amount
                );

                settlements.push({
                    from_user: debtor.user_id,
                    from_name: debtor.name,
                    to_user: creditor.user_id,
                    to_name: creditor.name,
                    amount: Number(paymentAmount.toFixed(2))
                });

                debtor.amount -= paymentAmount;
                creditor.amount -= paymentAmount;

                if (debtor.amount < 0.01) {
                    i++;
                }

                if (creditor.amount < 0.01) {
                    j++;
                }
            }

            res.json({
                group_id: Number(groupId),
                settlements: settlements
            });
        }
    );
});


// ==========================================
// RECORD PAYMENT
// ==========================================

app.post("/api/settlements/pay", (req, res) => {

    const {
        from_user,
        to_user,
        amount
    } = req.body;


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!from_user || !to_user || amount === undefined) {
        return res.status(400).json({
            error: "from_user, to_user and amount are required"
        });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
            error: "amount must be greater than 0"
        });
    }


    // ==========================================
    // CREATE PAYMENT
    // ==========================================

    const sql = `
        INSERT INTO payments
        (from_user, to_user, amount)
        VALUES (?, ?, ?)
    `;

    db.query(
        sql,
        [from_user, to_user, paymentAmount],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Could not create payment"
                });
            }

            res.status(201).json({
                message: "Payment created",
                payment_id: result.insertId
            });

        }
    );
});

// ==========================================
// MARK PAYMENT AS SETTLED
// ==========================================

app.put("/api/settlements/:id/settle", (req, res) => {

    const paymentId = req.params.id;

    const sql = `
        UPDATE payments
        SET status = 'settled'
        WHERE payment_id = ?
        AND status = 'pending'
    `;

    db.query(
        sql,
        [paymentId],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.status(500).json({
                    error: "Could not update payment"
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Pending payment not found"
                });
            }

            res.json({
                message: "Payment marked as settled",
                payment_id: Number(paymentId),
                status: "settled"
            });

        }
    );
});


// ==========================================
// START SERVER
// ==========================================

const PORT = 5000;

app.listen(PORT, () => {
    console.log(
        `SmartSplit server running on http://localhost:${PORT}`
    );
});