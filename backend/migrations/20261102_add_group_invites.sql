-- Shareable, expiring group invite tokens. Store only the SHA-256 digest.
CREATE TABLE IF NOT EXISTS group_invites (
    invite_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    group_id INT UNSIGNED NOT NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (invite_id),
    UNIQUE KEY uq_group_invites_token_hash (token_hash),
    KEY idx_group_invites_group_expiry (group_id, expires_at),
    CONSTRAINT fk_group_invites_group FOREIGN KEY (group_id)
        REFERENCES groups_table (group_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_group_invites_creator FOREIGN KEY (created_by)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
