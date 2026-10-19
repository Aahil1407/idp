-- SmartSplit forward migration for the confirmed MySQL 8.4.11 schema.
-- Review and run only after the read-only prechecks in
-- STAGING_DATABASE_VERIFICATION.md (adapted for the approved target DB).
-- This is intentionally not rerunnable. If this ALTER fails or its outcome is
-- uncertain, inspect information_schema before deciding on a next step.
-- Existing payment rows retain NULL group_id; do not infer/backfill a group.

ALTER TABLE payments
    ADD COLUMN group_id INT UNSIGNED NULL AFTER payment_id,
    ADD KEY idx_payments_group_status (group_id, status),
    ADD KEY idx_payments_group_from_user (group_id, from_user),
    ADD KEY idx_payments_group_to_user (group_id, to_user),
    ADD CONSTRAINT fk_payments_group FOREIGN KEY (group_id)
        REFERENCES groups_table (group_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_payments_from_group_member FOREIGN KEY (group_id, from_user)
        REFERENCES group_members (group_id, user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_payments_to_group_member FOREIGN KEY (group_id, to_user)
        REFERENCES group_members (group_id, user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;

-- Keep fk_payments_from_user, fk_payments_to_user and their single-column
-- indexes. They predate this migration and serve legacy rows with NULL group_id
-- and user lookups/deletes. The composite membership constraints supplement
-- them; they do not replace them.
