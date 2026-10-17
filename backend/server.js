const express = require("express");
const cors = require("cors");
const { getGroupBalances, optimizeSettlements } = require("./group-balances");
let db;

const app = express();

app.use(cors());
app.use(express.json());
app.locals.database = null;


// ==========================================
// TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.json({
        message: "SmartSplit backend is running!"
    });
});

// Railway readiness check: return healthy only when the configured database responds.
app.get("/health", (req, res) => {
    db.query("SELECT 1 AS database_ready", (err) => {
        if (err) {
            return res.status(503).json({ status: "unavailable" });
        }

        res.json({ status: "ok" });
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

// GET ALL GROUPS
app.get("/api/groups", (req, res) => {
    const sql = `
        SELECT group_id, group_name
        FROM groups_table
        ORDER BY group_id ASC
    `;

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
    const groupId = Number(req.params.id);
    getGroupBalances(app.locals.database, groupId, (err, balances) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(balances);
    });
});


// ==========================================
// SETTLEMENT OPTIMIZATION
// ==========================================

app.post("/api/groups/:id/settlements/optimize", (req, res) => {
    const groupId = Number(req.params.id);
    getGroupBalances(app.locals.database, groupId, (err, balances) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Could not calculate balances" });
        }
        res.json(optimizeSettlements(balances, groupId));
    });
});


// ==========================================
// RECORD PAYMENT
// ==========================================

app.post("/api/settlements/pay", (req, res) => {
    const { group_id, from_user, to_user, amount } = req.body;
    const groupId = Number(group_id);
    const fromUser = Number(from_user);
    const toUser = Number(to_user);
    const paymentAmount = Number(amount);

    if (![groupId, fromUser, toUser].every(Number.isSafeInteger) || groupId <= 0 || fromUser <= 0 || toUser <= 0 || amount === undefined) {
        return res.status(400).json({ error: "group_id, from_user, to_user and amount are required" });
    }
    if (fromUser === toUser) {
        return res.status(400).json({ error: "from_user and to_user must be different group members" });
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > 9999999999.99 || Math.round(paymentAmount * 100) !== paymentAmount * 100) {
        return res.status(400).json({ error: "amount must be a positive amount with at most two decimal places" });
    }

    const membershipSql = `
        SELECT g.group_id, gm.user_id
        FROM groups_table g
        LEFT JOIN group_members gm
            ON gm.group_id = g.group_id
            AND gm.user_id IN (?, ?)
        WHERE g.group_id = ?
    `;

    app.locals.database.query(membershipSql, [fromUser, toUser, groupId], (groupErr, rows) => {
        if (groupErr) {
            console.error(groupErr);
            return res.status(500).json({ error: "Could not verify group members" });
        }
        if (rows.length === 0) {
            return res.status(404).json({ error: "Group not found" });
        }

        const memberIds = new Set(rows.map((row) => Number(row.user_id)).filter(Boolean));
        if (!memberIds.has(fromUser) || !memberIds.has(toUser)) {
            return res.status(400).json({ error: "Both payment users must be members of the group" });
        }

        getGroupBalances(app.locals.database, groupId, (balanceErr, balances) => {
            if (balanceErr) {
                console.error(balanceErr);
                return res.status(500).json({ error: "Could not verify current group balances" });
            }
            const debtor = balances.find((user) => Number(user.user_id) === fromUser);
            const creditor = balances.find((user) => Number(user.user_id) === toUser);
            if (!debtor || !creditor || debtor.balance >= -0.01 || creditor.balance <= 0.01 || paymentAmount > Math.abs(debtor.balance) + 0.005 || paymentAmount > creditor.balance + 0.005) {
                return res.status(400).json({ error: "Payment must match a current debt from the selected member to the selected creditor" });
            }

            const insertSql = `
                INSERT INTO payments (group_id, from_user, to_user, amount)
                VALUES (?, ?, ?, ?)
            `;
            app.locals.database.query(insertSql, [groupId, fromUser, toUser, paymentAmount], (insertErr, result) => {
                if (insertErr) {
                    console.error(insertErr);
                    return res.status(500).json({ error: "Could not create payment" });
                }

                res.status(201).json({
                    message: "Settlement recorded in SmartSplit as pending",
                    payment_id: result.insertId,
                    group_id: groupId,
                    status: "pending",
                });
            });
        });
    });
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

    app.locals.database.query(
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
                message: "Settlement marked as settled in SmartSplit",
                payment_id: Number(paymentId),
                status: "settled"
            });

        }
    );
});


// ==========================================
// START SERVER
// ==========================================

const PORT = Number(process.env.PORT || 5000);

if (require.main === module) {
    db = require("./db");
    app.locals.database = db;
    db.connect((err) => {
        if (err) {
            console.error("MySQL connection failed:", err.code || "connection error");
            return;
        }
        console.log("Connected to SmartSplit MySQL database!");
    });
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`SmartSplit server listening on port ${PORT}`);
    });
}

module.exports = { app };
