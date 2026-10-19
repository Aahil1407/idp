require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const mysql = require("mysql2");

// Explicit DB_* values take precedence; Railway's MYSQL* variables and URL
// provide compatible fallbacks for the private service connection.
let urlConfig = {};
if (process.env.MYSQL_URL) {
    try {
        const parsed = new URL(process.env.MYSQL_URL);
        urlConfig = {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : undefined,
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            database: decodeURIComponent(parsed.pathname.replace(/^\//, ""))
        };
    } catch {
        throw new Error("MYSQL_URL is not a valid MySQL connection URL");
    }
}

const ssl = process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: true,
        ...(process.env.DB_SSL_CA_PATH
            ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8") }
            : {})
    }
    : undefined;

const db = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST || urlConfig.host || "localhost",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || urlConfig.port || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || urlConfig.user || "root",
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? urlConfig.password,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || urlConfig.database || "smartsplit",
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db;
