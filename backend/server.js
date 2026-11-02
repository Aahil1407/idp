const express = require("express");
const crypto = require("crypto");
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
const {
    DUMMY_HASH,
    SESSION_TTL_DAYS,
    clearSessionCookie,
    createAuthRateLimiter,
    createAuthenticator,
    createGroupMemberGuard,
    createSessionCredentials,
    hashPassword,
    normalizeEmail,
    readCookies,
    sessionCookie,
    validateDeviceId,
    validatePassword,
    verifyPassword,
} = require("./auth");
const MAX_UNSIGNED_INT = 4_294_967_295;

const app = express();
if (/^\d+$/.test(process.env.TRUST_PROXY || "")) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
}

const allowedOrigins = new Set((process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean));
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error("Origin is not allowed by SmartSplit CORS policy"));
    },
    credentials: true,
}));
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
// ACCOUNT AND DEVICE SESSIONS
// ==========================================

const authRateLimit = createAuthRateLimiter();
const authenticate = createAuthenticator(db, app);

function requireMemberForUser(userId, groupId, callback) {
    if (app.locals.authDisabled === true) return callback(null, true);
    db.query("SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1", [groupId, userId], (err, rows) => {
        if (err) return callback(err, false);
        callback(null, rows.length > 0);
    });
}

function normalizeDeviceName(value) {
    const cleaned = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : "";
    return cleaned || "This browser";
}

function createDeviceSession(userId, deviceId, deviceName, res, status = 200) {
    const { token, tokenHash } = createSessionCredentials();
    db.query("DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP() OR (user_id = ? AND device_id = ?)", [userId, deviceId], (deleteError) => {
        if (deleteError) {
            console.error("Could not replace device session:", deleteError.message);
            return res.status(503).json({ error: "Unable to start a secure session. Try again." });
        }
        db.query(`
            INSERT INTO user_sessions (user_id, device_id, device_name, token_hash, expires_at, last_seen)
            VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${SESSION_TTL_DAYS} DAY), UTC_TIMESTAMP())
        `, [userId, deviceId, deviceName, tokenHash], (insertError) => {
            if (insertError) {
                console.error("Could not create device session:", insertError.message);
                return res.status(503).json({ error: "Unable to start a secure session. Try again." });
            }
            res.set("Cache-Control", "no-store");
            res.set("Set-Cookie", sessionCookie(token));
            res.status(status).json({ user: { user_id: Number(userId) } });
        });
    });
}

app.post("/api/auth/register", authRateLimit, async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const deviceId = req.get("X-Device-ID");
    if (!name || name.length > 255) return res.status(400).json({ error: "Enter a name up to 255 characters." });
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (!validateDeviceId(deviceId)) return res.status(400).json({ error: "This browser could not be identified. Refresh and try again." });

    try {
        const passwordHash = await hashPassword(password);
        db.query("SELECT user_id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1", [email], (lookupError, existing) => {
            if (lookupError) {
                console.error("Account lookup failed:", lookupError.message);
                return res.status(503).json({ error: "Unable to create your account right now." });
            }
            if (existing.length) return res.status(409).json({ error: "We could not create an account with those details. Try signing in instead." });
            db.query("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, passwordHash], (insertError, result) => {
                if (insertError) {
                    if (insertError.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "We could not create an account with those details. Try signing in instead." });
                    console.error("Account creation failed:", insertError.message);
                    return res.status(503).json({ error: "Unable to create your account right now." });
                }
                authRateLimit.reset(req);
                createDeviceSession(result.insertId, deviceId, normalizeDeviceName(req.body.device_name), res, 201);
            });
        });
    } catch (error) {
        console.error("Password hashing failed:", error.message);
        res.status(503).json({ error: "Unable to create your account right now." });
    }
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const deviceId = req.get("X-Device-ID");
    if (!email || email.length > 320 || typeof password !== "string" || Buffer.byteLength(password, "utf8") > 256) {
        return res.status(400).json({ error: "Enter a valid email and password." });
    }
    if (!validateDeviceId(deviceId)) return res.status(400).json({ error: "This browser could not be identified. Refresh and try again." });
    db.query("SELECT user_id, name, email, password_hash FROM users WHERE LOWER(email) = ? LIMIT 1", [email], async (lookupError, rows) => {
        if (lookupError) {
            console.error("Account sign-in lookup failed:", lookupError.message);
            return res.status(503).json({ error: "Unable to sign in right now." });
        }
        const account = rows[0];
        try {
            const validPassword = await verifyPassword(password, account?.password_hash || await DUMMY_HASH);
            if (!account || !account.password_hash || !validPassword) return res.status(401).json({ error: "Email or password is incorrect." });
            authRateLimit.reset(req);
            createDeviceSession(account.user_id, deviceId, normalizeDeviceName(req.body.device_name), res);
        } catch (error) {
            console.error("Password verification failed:", error.message);
            res.status(503).json({ error: "Unable to sign in right now." });
        }
    });
});

app.get("/api/auth/me", authenticate, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ user: req.user });
});

app.get("/api/auth/sessions", authenticate, (req, res) => {
    db.query(`
        SELECT session_id, device_id, device_name, created_at, last_seen, expires_at
        FROM user_sessions
        WHERE user_id = ? AND expires_at > UTC_TIMESTAMP()
        ORDER BY last_seen DESC
    `, [req.user.user_id], (err, rows) => {
        if (err) {
            console.error("Device session list failed:", err.message);
            return res.status(503).json({ error: "Unable to load your signed-in devices." });
        }
        res.set("Cache-Control", "no-store");
        res.json(rows.map((row) => ({ ...row, session_id: Number(row.session_id), current: row.device_id === req.authSession.device_id })));
    });
});

app.post("/api/auth/logout", authenticate, (req, res) => {
    db.query("DELETE FROM user_sessions WHERE session_id = ? AND user_id = ?", [req.authSession.session_id, req.user.user_id], (err) => {
        if (err) return res.status(503).json({ error: "Unable to sign out. Try again." });
        res.set("Cache-Control", "no-store");
        res.set("Set-Cookie", clearSessionCookie());
        res.json({ message: "Signed out." });
    });
});

app.post("/api/auth/logout-all", authenticate, (req, res) => {
    db.query("DELETE FROM user_sessions WHERE user_id = ?", [req.user.user_id], (err) => {
        if (err) return res.status(503).json({ error: "Unable to sign out devices. Try again." });
        res.set("Cache-Control", "no-store");
        res.set("Set-Cookie", clearSessionCookie());
        res.json({ message: "All devices have been signed out." });
    });
});

app.delete("/api/auth/sessions/:sessionId", authenticate, (req, res) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return res.status(400).json({ error: "Choose a valid device session." });
    if (sessionId === req.authSession.session_id) return res.status(400).json({ error: "Use Sign out on this device to end your current session." });
    db.query("DELETE FROM user_sessions WHERE session_id = ? AND user_id = ?", [sessionId, req.user.user_id], (err, result) => {
        if (err) return res.status(503).json({ error: "Unable to sign out that device." });
        if (!result.affectedRows) return res.status(404).json({ error: "That device session was not found." });
        res.json({ message: "Device signed out." });
    });
});

app.use("/api", authenticate);
app.use("/api/groups/:id", createGroupMemberGuard(db, app));


// ==========================================
// USERS
// ==========================================

// GET ALL USERS
app.get("/api/users", (req, res) => {

    const sql = "SELECT user_id, name, email FROM users ORDER BY name ASC";

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
    res.status(410).json({ error: "Create an account through /api/auth/register." });
});


// ==========================================
// GROUPS
// ==========================================

// GET ALL GROUPS
app.get("/api/groups", (req, res) => {
    const sql = `
        SELECT group_id, group_name
        FROM groups_table g
        WHERE EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = g.group_id AND gm.user_id = ?
        )
        ORDER BY g.group_id ASC
    `;

    db.query(sql, [req.user.user_id], (err, results) => {
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
    const validation = validateGroupInput({ ...req.body, created_by: req.user.user_id });
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

// CREATE A SHAREABLE, EXPIRING GROUP INVITE
app.post("/api/groups/:id/invites", (req, res) => {
    const groupId = req.params.id;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    db.query("DELETE FROM group_invites WHERE expires_at <= UTC_TIMESTAMP()", (cleanupError) => {
        if (cleanupError) {
            console.error("Could not clean up expired group invites:", cleanupError.message);
            return res.status(503).json({ error: "Unable to create an invite right now." });
        }
        db.query(`
            INSERT INTO group_invites (token_hash, group_id, created_by, expires_at)
            VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))
        `, [tokenHash, groupId, req.user.user_id], (insertError) => {
            if (insertError) {
                console.error("Could not create group invite:", insertError.message);
                return res.status(503).json({ error: "Unable to create an invite right now." });
            }
            res.status(201).json({ token, expires_in_days: 30 });
        });
    });
});

// JOIN A GROUP THROUGH A VALID SHARE LINK
app.post("/api/group-invites/:token/join", (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(404).json({ error: "This invite link is invalid or has expired." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    db.query(`
        SELECT group_id FROM group_invites
        WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()
        LIMIT 1
    `, [tokenHash], (inviteError, rows) => {
        if (inviteError) {
            console.error("Could not verify group invite:", inviteError.message);
            return res.status(503).json({ error: "Unable to verify this invite right now." });
        }
        if (!rows.length) return res.status(404).json({ error: "This invite link is invalid or has expired." });
        const groupId = Number(rows[0].group_id);
        addGroupMember(db, groupId, req.user.user_id, (joinError) => {
            if (joinError && !isDuplicateMembershipError(joinError)) {
                console.error("Could not join group from invite:", joinError.message);
                return res.status(503).json({ error: "Unable to join this group right now." });
            }
            res.json({ group_id: groupId, already_member: Boolean(joinError) });
        });
    });
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

    requireMemberForUser(req.user.user_id, groupId, (membershipError, isMember) => {
        if (membershipError) return res.status(503).json({ error: "Unable to verify group membership." });
        if (!isMember) return res.status(403).json({ error: "You are not a member of this group." });
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
});

// ==========================================
// MARK PAYMENT AS SETTLED
// ==========================================

app.put("/api/settlements/:id/settle", (req, res) => {

    const paymentId = req.params.id;

    const finishSettlement = () => markPaymentSettled(db, paymentId, (err, wasSettled) => {
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
    if (app.locals.authDisabled === true) return finishSettlement();
    db.query(`
        SELECT p.payment_id
        FROM payments p
        JOIN group_members gm ON gm.group_id = p.group_id AND gm.user_id = ?
        WHERE p.payment_id = ? AND p.status = 'pending'
        LIMIT 1
    `, [req.user.user_id, paymentId], (accessError, rows) => {
        if (accessError) return res.status(503).json({ error: "Unable to verify access to this settlement." });
        if (!rows.length) return res.status(404).json({ error: "Pending group settlement not found." });
        finishSettlement();
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
