-- Fresh SmartSplit development schema, derived from server.js and the API spec.
-- Review before applying to an existing database. This script creates tables only.

CREATE TABLE IF NOT EXISTS users (
    user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    phone VARCHAR(32) NULL,
    upi_id VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS groups_table (
    group_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_name VARCHAR(255) NOT NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id),
    KEY idx_groups_created_by (created_by),
    CONSTRAINT fk_groups_created_by FOREIGN KEY (created_by)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
    group_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (group_id, user_id),
    KEY idx_group_members_user (user_id),
    CONSTRAINT fk_group_members_group FOREIGN KEY (group_id)
        REFERENCES groups_table (group_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_group_members_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
    expense_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_id INT UNSIGNED NOT NULL,
    paid_by INT UNSIGNED NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (expense_id),
    KEY idx_expenses_group_date (group_id, expense_date),
    KEY idx_expenses_paid_by (paid_by),
    CONSTRAINT chk_expenses_amount CHECK (amount > 0),
    CONSTRAINT fk_expenses_group FOREIGN KEY (group_id)
        REFERENCES groups_table (group_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_expenses_paid_by FOREIGN KEY (paid_by)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expense_splits (
    expense_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    amount_owed DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (expense_id, user_id),
    KEY idx_expense_splits_user (user_id),
    CONSTRAINT chk_expense_splits_amount CHECK (amount_owed > 0),
    CONSTRAINT fk_expense_splits_expense FOREIGN KEY (expense_id)
        REFERENCES expenses (expense_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_expense_splits_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
    payment_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_id INT UNSIGNED NULL,
    from_user INT UNSIGNED NOT NULL,
    to_user INT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'settled') NOT NULL DEFAULT 'pending',
    PRIMARY KEY (payment_id),
    KEY idx_payments_group_status (group_id, status),
    KEY idx_payments_group_from_user (group_id, from_user),
    KEY idx_payments_group_to_user (group_id, to_user),
    KEY idx_payments_from_user (from_user),
    KEY idx_payments_to_user (to_user),
    KEY idx_payments_status (status),
    CONSTRAINT chk_payments_amount CHECK (amount > 0),
    CONSTRAINT fk_payments_from_user FOREIGN KEY (from_user)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_to_user FOREIGN KEY (to_user)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_group FOREIGN KEY (group_id)
        REFERENCES groups_table (group_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_from_group_member FOREIGN KEY (group_id, from_user)
        REFERENCES group_members (group_id, user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_to_group_member FOREIGN KEY (group_id, to_user)
        REFERENCES group_members (group_id, user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
