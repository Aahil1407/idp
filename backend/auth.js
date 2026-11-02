const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const PASSWORD_COST = 32_768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
const PASSWORD_BYTES = 64;
const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-smartsplit_session" : "smartsplit_session";
const SESSION_TTL_DAYS = 30;
const DUMMY_HASH = hashPassword("SmartSplit dummy password used only to equalize login work");

function validatePassword(password) {
    if (typeof password !== "string") return "Enter a password.";
    const bytes = Buffer.byteLength(password, "utf8");
    if (password.length < 12) return "Use a password with at least 12 characters.";
    if (bytes > 256) return "Password must be 256 bytes or fewer.";
    return "";
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, PASSWORD_BYTES, {
        N: PASSWORD_COST,
        r: PASSWORD_BLOCK_SIZE,
        p: PASSWORD_PARALLELISM,
        maxmem: 64 * 1024 * 1024,
    });
    return `scrypt$${PASSWORD_COST}$${PASSWORD_BLOCK_SIZE}$${PASSWORD_PARALLELISM}$${salt.toString("base64url")}$${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const [algorithm, n, r, p, saltText, hashText, extra] = stored.split("$");
    if (extra !== undefined || algorithm !== "scrypt" || n !== String(PASSWORD_COST) || r !== String(PASSWORD_BLOCK_SIZE) || p !== String(PASSWORD_PARALLELISM)) return false;
    if (!/^[a-f\d]{128}$/i.test(hashText || "")) return false;
    let salt;
    try { salt = Buffer.from(saltText, "base64url"); } catch { return false; }
    if (salt.length !== 16) return false;
    const actual = await scrypt(password, salt, PASSWORD_BYTES, {
        N: PASSWORD_COST,
        r: PASSWORD_BLOCK_SIZE,
        p: PASSWORD_PARALLELISM,
        maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, Buffer.from(hashText, "hex"));
}

function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateDeviceId(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readCookies(header = "") {
    const cookies = {};
    for (const part of header.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 1) continue;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key) cookies[key] = value;
    }
    return cookies;
}

function createSessionCredentials() {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    return { token, tokenHash };
}

function sessionCookie(token, maxAge = SESSION_TTL_DAYS * 24 * 60 * 60) {
    const sameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === "production" ? "None" : "Lax");
    const secure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
    if (sameSite.toLowerCase() === "none" && !secure) throw new Error("SameSite=None session cookies require Secure.");
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie() {
    return sessionCookie("", 0);
}

function createAuthenticator(db, app) {
    return (req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (app.locals.authDisabled === true) {
            req.user = app.locals.testUser || { user_id: 1, name: "Test user", email: "test@example.invalid" };
            req.authSession = { session_id: 1, device_id: req.get("X-Device-ID") || "test-device" };
            return next();
        }
        const token = readCookies(req.headers.cookie)[SESSION_COOKIE];
        const deviceId = req.get("X-Device-ID");
        if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || !validateDeviceId(deviceId)) {
            return res.status(401).json({ error: "Sign in to continue." });
        }
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        db.query(`
            SELECT s.session_id, s.user_id, s.device_id, u.name, u.email
            FROM user_sessions s
            JOIN users u ON u.user_id = s.user_id
            WHERE s.token_hash = ? AND s.device_id = ? AND s.expires_at > UTC_TIMESTAMP()
            LIMIT 1
        `, [tokenHash, deviceId], (err, rows) => {
            if (err) {
                console.error("Session lookup failed:", err.message);
                return res.status(503).json({ error: "Unable to verify your sign-in. Try again." });
            }
            if (!rows.length) return res.status(401).json({ error: "Your sign-in expired. Please sign in again." });
            req.user = { user_id: Number(rows[0].user_id), name: rows[0].name, email: rows[0].email };
            req.authSession = { session_id: Number(rows[0].session_id), device_id: rows[0].device_id };
            db.query("UPDATE user_sessions SET last_seen = UTC_TIMESTAMP() WHERE session_id = ? AND last_seen < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)", [req.authSession.session_id], (updateError) => {
                if (updateError) console.error("Device activity update failed:", updateError.message);
                next();
            });
        });
    };
}

function createGroupMemberGuard(db, app) {
    return (req, res, next) => {
        if (app.locals.authDisabled === true) return next();
        const groupId = Number(req.params.id);
        if (!Number.isSafeInteger(groupId) || groupId <= 0) return res.status(400).json({ error: "A valid group ID is required." });
        db.query("SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1", [groupId, req.user.user_id], (err, rows) => {
            if (err) {
                console.error("Group access check failed:", err.message);
                return res.status(503).json({ error: "Unable to verify access to this group." });
            }
            if (!rows.length) return res.status(403).json({ error: "You are not a member of this group." });
            next();
        });
    };
}

function createAuthRateLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 8, now = Date.now } = {}) {
    const attempts = new Map();
    const limiter = (req, res, next) => {
        const key = req.ip || req.socket.remoteAddress || "unknown";
        req.authAttemptKey = key;
        const currentTime = now();
        const recent = (attempts.get(key) || []).filter((at) => currentTime - at < windowMs);
        if (recent.length >= maxAttempts) {
            res.set("Retry-After", String(Math.ceil((windowMs - (currentTime - recent[0])) / 1000)));
            return res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
        }
        recent.push(currentTime);
        attempts.set(key, recent);
        if (attempts.size > 10_000) {
            for (const [address, dates] of attempts) {
                if (!dates.some((at) => currentTime - at < windowMs)) attempts.delete(address);
                if (attempts.size <= 8_000) break;
            }
        }
        next();
    };
    limiter.reset = (req) => attempts.delete(req.authAttemptKey || req.ip || req.socket?.remoteAddress || "unknown");
    return limiter;
}

module.exports = {
    SESSION_COOKIE,
    SESSION_TTL_DAYS,
    DUMMY_HASH,
    hashPassword,
    verifyPassword,
    validatePassword,
    normalizeEmail,
    validateDeviceId,
    readCookies,
    createSessionCredentials,
    sessionCookie,
    clearSessionCookie,
    createAuthenticator,
    createGroupMemberGuard,
    createAuthRateLimiter,
};
