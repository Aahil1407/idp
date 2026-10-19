const express = require("express");
const cors = require("cors");
const databaseConnection = require("./db");
const { loadGroupBalances } = require("./group-balances");
const { markPaymentSettled } = require("./payment-state");
const { buildSettlementPlan } = require("./settlement-optimizer");
const { validateGroupInput, createGroupWithCreator } = require("./group-creation");
const { isDuplicateMembershipError, addGroupMember } = require("./group-membership");
const { validateExpensePayload, validateExpenseMembership, parseAmountToPaise } = require("./expense-validation");
const { createExpenseWithSplits } = require("./expense-write");
const { recordGroupPayment } = require("./group-payments");
const MAX_UNSIGNED_INT = 4_294_967_295;

const app = express();

app.use(cors());
app.use(express.json());
app.locals.database = null;

// The proxy allows tests to inject a fake database and production requests to
// share a pool without sharing transaction state across concurrent requests.
const db = new Proxy({}, {
    get(_target, property) {
        const activeDatabase = app.locals.database || databaseConnection;
        const value = activeDatabase[property];
        return typeof value === "function" ? value.bind(activeDatabase) : value;
    }
});


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
    const validation = validateGroupInput(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error });
    }

    createGroupWithCreator(db, validation.value, (err, groupId) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Could not create group and add creator" });
        }

        res.status(201).json({
            message: "Group created successfully!",
            group_id: groupId
        });
    });
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

    addGroupMember(db, groupId, user_id, (err) => {

            if (err) {
                console.log(err);

                if (isDuplicateMembershipError(err)) {
                    return res.status(409).json({
                        error: "This user is already a member of the group"
                    });
                }

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
    if (!Number.isSafeInteger(groupId) || groupId <= 0 || groupId > MAX_UNSIGNED_INT) {
        return res.status(400).json({ error: "Group ID must be a positive integer" });
    }

    const validation = validateExpensePayload(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error });
    }
    const { paidBy, description, amountPaise, splits } = validation.value;


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


            const membershipError = validateExpenseMembership({ paidBy, splits }, memberIds);
            if (membershipError) return res.status(400).json({ error: membershipError });


            createExpenseWithSplits(db, groupId, { paidBy, description, amountPaise, splits }, (expenseErr, expenseId) => {
                if (expenseErr) {
                    console.log(expenseErr);
                    return res.status(500).json({ error: "Could not save expense and splits" });
                }

                res.status(201).json({
                    message: "Expense created successfully!",
                    expense_id: expenseId
                });
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

    loadGroupBalances(db, groupId, (err, balances) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json(balances);
    });
});


// ==========================================
// SETTLEMENT OPTIMIZATION
// ==========================================

app.post("/api/groups/:id/settlements/optimize", (req, res) => {

    const groupId = req.params.id;

    loadGroupBalances(db, groupId, (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                error: "Could not calculate balances"
            });
        }

        res.json(buildSettlementPlan(groupId, results));
    });
});


// ==========================================
// RECORD PAYMENT
// ==========================================

app.post("/api/settlements/pay", (req, res) => {

    const {
        group_id,
        from_user,
        to_user,
        amount
    } = req.body || {};


    // ==========================================
    // VALIDATION
    // ==========================================

    const groupId = Number(group_id);
    const fromUser = Number(from_user);
    const toUser = Number(to_user);

    if (group_id === undefined || !from_user || !to_user || amount === undefined) {
        return res.status(400).json({
            error: "group_id, from_user, to_user and amount are required"
        });
    }

    if (
        !Number.isSafeInteger(groupId) || groupId <= 0 || groupId > MAX_UNSIGNED_INT ||
        !Number.isSafeInteger(fromUser) || fromUser <= 0 || fromUser > MAX_UNSIGNED_INT ||
        !Number.isSafeInteger(toUser) || toUser <= 0 || toUser > MAX_UNSIGNED_INT ||
        fromUser === toUser
    ) {
        return res.status(400).json({
            error: "group_id, from_user and to_user must be distinct positive integer IDs"
        });
    }

    const paymentAmountPaise = parseAmountToPaise(amount);

    if (paymentAmountPaise === null || paymentAmountPaise <= 0) {
        return res.status(400).json({
            error: "amount must be greater than 0 and have at most two decimal places"
        });
    }


    // ==========================================
    // Verify the group exists and both users are members before recording a payment.
    // ==========================================

    recordGroupPayment(db, {
        groupId,
        fromUser,
        toUser,
        amountPaise: paymentAmountPaise,
    }, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Could not create payment" });
        }
        if (result.notFound) return res.status(404).json({ error: "Group not found" });
        if (result.invalidMembers) {
            return res.status(400).json({ error: "Both payment users must be members of the group" });
        }
        if (result.invalidSettlement) {
            return res.status(400).json({ error: "Payment must follow a current group debt and cannot exceed it" });
        }

        res.status(201).json({
            message: "Payment created",
            payment_id: result.paymentId,
            group_id: groupId,
            status: "pending"
        });
    });
});

// ==========================================
// MARK PAYMENT AS SETTLED
// ==========================================

app.put("/api/settlements/:id/settle", (req, res) => {

    const paymentId = req.params.id;

    markPaymentSettled(db, paymentId, (err, wasSettled) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Could not update payment" });
        }

        if (!wasSettled) {
            return res.status(404).json({
                error: "Pending payment not found"
            });
        }

        res.json({
            message: "Payment marked as settled",
            payment_id: Number(paymentId),
            status: "settled"
        });

    });
});


// ==========================================
// START SERVER
// ==========================================

const PORT = Number(process.env.PORT || 5000);

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`SmartSplit server listening on port ${PORT}`);
    });
}

module.exports = { app };
