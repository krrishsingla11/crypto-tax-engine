-- Demonstrates ALTER (required by the project spec). Safe to run once after schema.sql.

-- 1. add a column
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

-- 2. add a constraint
ALTER TABLE app_user
    ADD CONSTRAINT chk_phone_fmt CHECK (phone IS NULL OR phone ~ '^[0-9+\- ]{7,15}$');

-- 3. change a column
ALTER TABLE wallet_exchange ALTER COLUMN platform_name TYPE VARCHAR(80);

-- 4. add a column with default to existing table
ALTER TABLE txn ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual';
ALTER TABLE txn ADD CONSTRAINT chk_txn_source CHECK (source IN ('manual', 'csv'));
