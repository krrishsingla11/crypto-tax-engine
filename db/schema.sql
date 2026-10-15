-- =====================================================================
-- Crypto-Asset Portfolio & Tax Liability Engine  |  PostgreSQL schema
-- Run:  psql -U postgres -d cryptotax -f db/schema.sql
-- =====================================================================

-- ---------- USERS ----------------------------------------------------
CREATE TABLE app_user (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  NOT NULL UNIQUE,
    password_hash  VARCHAR(100)  NOT NULL,
    tax_id         VARCHAR(20),                       -- PAN / tax id
    country        CHAR(2)       NOT NULL DEFAULT 'IN',
    role           VARCHAR(10)   NOT NULL DEFAULT 'user',
    cost_method    VARCHAR(4)    NOT NULL DEFAULT 'FIFO',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_role   CHECK (role IN ('user', 'admin', 'auditor')),
    CONSTRAINT chk_cost_method CHECK (cost_method IN ('FIFO', 'LIFO', 'WAVG')),
    CONSTRAINT chk_email_fmt   CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- ---------- WALLETS / EXCHANGES --------------------------------------
CREATE TABLE wallet_exchange (
    wallet_id      SERIAL PRIMARY KEY,
    user_id        INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    platform_name  VARCHAR(60)  NOT NULL,
    wallet_type    VARCHAR(10)  NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_wallet_type CHECK (wallet_type IN ('exchange', 'hot', 'cold')),
    CONSTRAINT uq_wallet_per_user UNIQUE (user_id, platform_name)
);

-- ---------- ASSETS ---------------------------------------------------
CREATE TABLE asset (
    asset_id    SERIAL PRIMARY KEY,
    symbol      VARCHAR(12)  NOT NULL UNIQUE,
    name        VARCHAR(80)  NOT NULL,
    asset_type  VARCHAR(12)  NOT NULL DEFAULT 'crypto',
    CONSTRAINT chk_asset_type CHECK (asset_type IN ('crypto', 'stablecoin', 'token'))
);

-- ---------- TRANSACTIONS ---------------------------------------------
CREATE TABLE txn (
    txn_id          BIGSERIAL PRIMARY KEY,
    wallet_id       INT            NOT NULL REFERENCES wallet_exchange(wallet_id) ON DELETE CASCADE,
    asset_id        INT            NOT NULL REFERENCES asset(asset_id),
    txn_type        VARCHAR(12)    NOT NULL,
    quantity        NUMERIC(28,10) NOT NULL,
    price_per_unit  NUMERIC(20,8)  NOT NULL,
    fees            NUMERIC(20,8)  NOT NULL DEFAULT 0,
    txn_time        TIMESTAMPTZ    NOT NULL,
    linked_txn_id   BIGINT         REFERENCES txn(txn_id) ON DELETE SET NULL,  -- pairs TRANSFER_OUT/IN or SWAP legs
    import_ref      VARCHAR(40),                                              -- MongoDB raw_imports.import_id
    notes           VARCHAR(200),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT chk_txn_type  CHECK (txn_type IN ('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'SWAP_IN', 'SWAP_OUT')),
    CONSTRAINT chk_txn_qty   CHECK (quantity > 0),
    CONSTRAINT chk_txn_price CHECK (price_per_unit >= 0),
    CONSTRAINT chk_txn_fees  CHECK (fees >= 0)
);

-- ---------- TAX LOTS (one per acquisition) ---------------------------
CREATE TABLE tax_lot (
    lot_id         BIGSERIAL PRIMARY KEY,
    txn_id         BIGINT         NOT NULL UNIQUE REFERENCES txn(txn_id) ON DELETE CASCADE,
    user_id        INT            NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    asset_id       INT            NOT NULL REFERENCES asset(asset_id),
    acquired_at    TIMESTAMPTZ    NOT NULL,
    original_qty   NUMERIC(28,10) NOT NULL,
    remaining_qty  NUMERIC(28,10) NOT NULL,
    unit_cost      NUMERIC(20,8)  NOT NULL,           -- includes pro-rated fees
    CONSTRAINT chk_lot_orig  CHECK (original_qty > 0),
    CONSTRAINT chk_lot_rem   CHECK (remaining_qty >= 0 AND remaining_qty <= original_qty),
    CONSTRAINT chk_lot_cost  CHECK (unit_cost >= 0)
);

-- ---------- LOT DISPOSALS (sell consumes lots) -----------------------
CREATE TABLE lot_disposal (
    disposal_id   BIGSERIAL PRIMARY KEY,
    sell_txn_id   BIGINT         NOT NULL REFERENCES txn(txn_id) ON DELETE CASCADE,
    lot_id        BIGINT         NOT NULL REFERENCES tax_lot(lot_id),
    qty_consumed  NUMERIC(28,10) NOT NULL,
    proceeds      NUMERIC(24,8)  NOT NULL,
    cost_basis    NUMERIC(24,8)  NOT NULL,
    gain          NUMERIC(24,8)  NOT NULL,
    term          VARCHAR(5)     NOT NULL,
    disposed_at   TIMESTAMPTZ    NOT NULL,
    CONSTRAINT chk_disp_qty  CHECK (qty_consumed > 0),
    CONSTRAINT chk_disp_term CHECK (term IN ('SHORT', 'LONG'))
);

-- ---------- PRICE HISTORY --------------------------------------------
CREATE TABLE price_history (
    asset_id       INT           NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
    price_date     DATE          NOT NULL,
    closing_price  NUMERIC(20,8) NOT NULL,
    PRIMARY KEY (asset_id, price_date),
    CONSTRAINT chk_price_pos CHECK (closing_price > 0)
);

-- ---------- TAX RULES (admin-managed) --------------------------------
CREATE TABLE tax_rule (
    rule_id         SERIAL PRIMARY KEY,
    country         CHAR(2)      NOT NULL,
    financial_year  VARCHAR(7)   NOT NULL,            -- e.g. 2025-26
    term            VARCHAR(5)   NOT NULL,
    long_term_days  INT          NOT NULL DEFAULT 365,
    rate            NUMERIC(5,2) NOT NULL,            -- percent
    description     VARCHAR(200),
    CONSTRAINT chk_rule_term CHECK (term IN ('SHORT', 'LONG')),
    CONSTRAINT chk_rule_rate CHECK (rate >= 0 AND rate <= 100),
    CONSTRAINT chk_rule_days CHECK (long_term_days > 0),
    CONSTRAINT chk_rule_fy   CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
    CONSTRAINT uq_rule UNIQUE (country, financial_year, term)
);

-- ---------- HOLDINGS (maintained by trigger) -------------------------
CREATE TABLE holding (
    user_id         INT            NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    asset_id        INT            NOT NULL REFERENCES asset(asset_id),
    quantity        NUMERIC(28,10) NOT NULL DEFAULT 0,
    avg_cost_basis  NUMERIC(20,8)  NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, asset_id),
    CONSTRAINT chk_hold_qty CHECK (quantity >= 0)
);

-- ---------- TAX REPORTS ----------------------------------------------
CREATE TABLE tax_report (
    report_id         SERIAL PRIMARY KEY,
    user_id           INT           NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    financial_year    VARCHAR(7)    NOT NULL,
    short_term_gain   NUMERIC(24,8) NOT NULL DEFAULT 0,
    long_term_gain    NUMERIC(24,8) NOT NULL DEFAULT 0,
    tax_payable       NUMERIC(24,8) NOT NULL DEFAULT 0,
    generated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_report_fy CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
    CONSTRAINT chk_report_tax CHECK (tax_payable >= 0),
    CONSTRAINT uq_report UNIQUE (user_id, financial_year)
);

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX idx_txn_wallet_asset_time ON txn (wallet_id, asset_id, txn_time);
CREATE INDEX idx_txn_asset_time        ON txn (asset_id, txn_time);
CREATE INDEX idx_txn_import_ref        ON txn (import_ref) WHERE import_ref IS NOT NULL;

-- open lots only, ordered for FIFO / LIFO matching
CREATE INDEX idx_lot_open_fifo ON tax_lot (user_id, asset_id, acquired_at, lot_id) WHERE remaining_qty > 0;

CREATE INDEX idx_disposal_sell ON lot_disposal (sell_txn_id);
CREATE INDEX idx_disposal_lot  ON lot_disposal (lot_id);
CREATE INDEX idx_disposal_time ON lot_disposal (disposed_at);

CREATE INDEX idx_price_latest ON price_history (asset_id, price_date DESC);

-- full-text search on assets (symbol + name)
CREATE INDEX idx_asset_fts ON asset USING GIN (to_tsvector('simple', symbol || ' ' || name));
