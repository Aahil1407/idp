-- Add nullable group scope to payments. Existing rows remain NULL intentionally;
-- do not infer their group from users, amounts, or historical settlement data.
-- This script is safe to re-run when the column, index, and FK already exist.

SET @smart_split_schema = DATABASE();

SET @smart_split_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = @smart_split_schema
       AND table_name = 'payments'
       AND column_name = 'group_id') = 0,
    'ALTER TABLE payments ADD COLUMN group_id INT UNSIGNED NULL AFTER payment_id',
    'SELECT 1'
);
PREPARE smart_split_stmt FROM @smart_split_ddl;
EXECUTE smart_split_stmt;
DEALLOCATE PREPARE smart_split_stmt;

SET @smart_split_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = @smart_split_schema
       AND table_name = 'payments'
       AND index_name = 'idx_payments_group_status') = 0,
    'ALTER TABLE payments ADD INDEX idx_payments_group_status (group_id, status)',
    'SELECT 1'
);
PREPARE smart_split_stmt FROM @smart_split_ddl;
EXECUTE smart_split_stmt;
DEALLOCATE PREPARE smart_split_stmt;

SET @smart_split_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE constraint_schema = @smart_split_schema
       AND table_name = 'payments'
       AND constraint_name = 'fk_payments_group'
       AND constraint_type = 'FOREIGN KEY') = 0,
    'ALTER TABLE payments ADD CONSTRAINT fk_payments_group FOREIGN KEY (group_id) REFERENCES groups_table (group_id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'SELECT 1'
);
PREPARE smart_split_stmt FROM @smart_split_ddl;
EXECUTE smart_split_stmt;
DEALLOCATE PREPARE smart_split_stmt;
