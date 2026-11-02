-- SmartSplit accounts and per-browser sessions.
-- Do not run against production until the email duplicate preflight is reviewed.
-- Existing users receive NULL password_hash values and cannot sign in until an
-- email-verified account-activation flow is available. Do not copy or reset
-- their credentials automatically.

-- Preflight: resolve duplicate email addresses before adding the unique key.
SELECT LOWER(TRIM(email)) AS normalized_email, COUNT(*) AS account_count
FROM users
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;

ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER email,
    ADD UNIQUE KEY uq_users_email (email);

CREATE TABLE user_sessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    device_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (session_id),
    UNIQUE KEY uq_user_sessions_token_hash (token_hash),
    UNIQUE KEY uq_user_sessions_user_device (user_id, device_id),
    KEY idx_user_sessions_expiry (expires_at),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
