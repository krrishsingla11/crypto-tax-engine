-- =====================================================================
-- logic.sql : helper functions, triggers, stored procedures
-- Run AFTER schema.sql (and seed_base.sql).  Safe to re-run (CREATE OR REPLACE).
-- =====================================================================

-- ---------- Financial year helpers (India: 1 Apr - 31 Mar, IST) --------
CREATE OR REPLACE FUNCTION fin_year(ts TIMESTAMPTZ) RETURNS VARCHAR AS $$
DECLARE
    d DATE := (ts AT TIME ZONE 'Asia/Kolkata')::DATE;
    y INT  := EXTRACT(YEAR FROM d);
BEGIN
    IF EXTRACT(MONTH FROM d) >= 4 THEN
        RETURN y || '-' || LPAD(((y + 1) % 100)::TEXT, 2, '0');
    ELSE
        RETURN (y - 1) || '-' || LPAD((y % 100)::TEXT, 2, '0');
    END IF;
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fy_start(fy VARCHAR) RETURNS TIMESTAMPTZ AS $$
    SELECT make_timestamptz(LEFT(fy, 4)::INT, 4, 1, 0, 0, 0, 'Asia/Kolkata');
$$ LANGUAGE sql IMMUTABLE;

-- ---------- Rebuild a holding row from open lots ----------------------
CREATE OR REPLACE FUNCTION recompute_holding(p_user INT, p_asset INT) RETURNS VOID AS $$
BEGIN
    INSERT INTO holding (user_id, asset_id, quantity, avg_cost_basis, updated_at)
    SELECT p_user, p_asset,
           COALESCE(SUM(l.remaining_qty), 0),
           CASE WHEN COALESCE(SUM(l.remaining_qty), 0) > 0
                THEN SUM(l.remaining_qty * l.unit_cost) / SUM(l.remaining_qty) ELSE 0 END,
           now()
    FROM tax_lot l
    JOIN txn t ON t.txn_id = l.txn_id            -- ignores lots whose txn is being deleted
    WHERE l.user_id = p_user AND l.asset_id = p_asset
    ON CONFLICT (user_id, asset_id) DO UPDATE
        SET quantity       = EXCLUDED.quantity,
            avg_cost_basis = EXCLUDED.avg_cost_basis,
            updated_at     = now();
END $$ LANGUAGE plpgsql;

-- ---------- process_sell : match a disposal against lots ---------------
-- Uses the user's cost method: FIFO, LIFO or WAVG (weighted average cost).
-- Writes one lot_disposal row per lot touched, shrinks tax_lot.remaining_qty.
CREATE OR REPLACE PROCEDURE process_sell(p_txn_id BIGINT) AS $$
DECLARE
    t          txn%ROWTYPE;
    v_user     INT;
    v_method   VARCHAR(4);
    v_country  CHAR(2);
    v_lt_days  INT;
    v_avg      NUMERIC;
    v_left     NUMERIC;
    v_take     NUMERIC;
    v_unit     NUMERIC;
    v_proceeds NUMERIC;
    v_cost     NUMERIC;
    lot        RECORD;
BEGIN
    SELECT * INTO t FROM txn WHERE txn_id = p_txn_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'process_sell: txn % not found', p_txn_id; END IF;

    SELECT u.user_id, u.cost_method, u.country INTO v_user, v_method, v_country
    FROM wallet_exchange w JOIN app_user u ON u.user_id = w.user_id
    WHERE w.wallet_id = t.wallet_id;

    SELECT COALESCE(MAX(long_term_days), 365) INTO v_lt_days
    FROM tax_rule
    WHERE country = v_country AND financial_year = fin_year(t.txn_time) AND term = 'LONG';

    IF v_method = 'WAVG' THEN
        SELECT SUM(remaining_qty * unit_cost) / NULLIF(SUM(remaining_qty), 0) INTO v_avg
        FROM tax_lot
        WHERE user_id = v_user AND asset_id = t.asset_id
          AND remaining_qty > 0 AND acquired_at <= t.txn_time;
    END IF;

    v_left := t.quantity;

    FOR lot IN
        SELECT * FROM tax_lot
        WHERE user_id = v_user AND asset_id = t.asset_id
          AND remaining_qty > 0 AND acquired_at <= t.txn_time
        ORDER BY CASE WHEN v_method = 'LIFO' THEN -EXTRACT(EPOCH FROM acquired_at)
                      ELSE EXTRACT(EPOCH FROM acquired_at) END,
                 CASE WHEN v_method = 'LIFO' THEN -lot_id ELSE lot_id END
        FOR UPDATE
    LOOP
        v_take     := LEAST(lot.remaining_qty, v_left);
        v_unit     := CASE WHEN v_method = 'WAVG' THEN v_avg ELSE lot.unit_cost END;
        v_proceeds := v_take * t.price_per_unit - t.fees * (v_take / t.quantity);
        v_cost     := v_take * v_unit;

        INSERT INTO lot_disposal (sell_txn_id, lot_id, qty_consumed, proceeds, cost_basis, gain, term, disposed_at)
        VALUES (t.txn_id, lot.lot_id, v_take, v_proceeds, v_cost, v_proceeds - v_cost,
                CASE WHEN t.txn_time - lot.acquired_at > v_lt_days * INTERVAL '1 day'
                     THEN 'LONG' ELSE 'SHORT' END,
                t.txn_time);

        UPDATE tax_lot SET remaining_qty = remaining_qty - v_take WHERE lot_id = lot.lot_id;

        v_left := v_left - v_take;
        EXIT WHEN v_left <= 0;
    END LOOP;

    IF v_left > 0 THEN
        RAISE EXCEPTION 'Insufficient holdings: % units short for txn %', v_left, p_txn_id;
    END IF;
END $$ LANGUAGE plpgsql;

-- ---------- TRIGGER 1 : BEFORE INSERT on txn (guard) -------------------
-- Serialises trades per (user, asset) and rejects selling more than held.
CREATE OR REPLACE FUNCTION trg_txn_guard() RETURNS TRIGGER AS $$
DECLARE
    v_user      INT;
    v_available NUMERIC;
BEGIN
    SELECT user_id INTO v_user FROM wallet_exchange WHERE wallet_id = NEW.wallet_id;

    PERFORM pg_advisory_xact_lock(v_user, NEW.asset_id);   -- no concurrent over-selling

    IF NEW.txn_type IN ('SELL', 'SWAP_OUT') THEN
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_available
        FROM tax_lot
        WHERE user_id = v_user AND asset_id = NEW.asset_id
          AND remaining_qty > 0 AND acquired_at <= NEW.txn_time;

        IF NEW.quantity > v_available THEN
            RAISE EXCEPTION 'Cannot sell % : only % available at that time', NEW.quantity, v_available
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_guard ON txn;
CREATE TRIGGER txn_guard BEFORE INSERT ON txn
    FOR EACH ROW EXECUTE FUNCTION trg_txn_guard();

-- ---------- TRIGGER 2 : AFTER INSERT on txn (lots / disposals / holding)
-- BUY, SWAP_IN       -> new tax lot (unit cost includes fees)
-- SELL, SWAP_OUT     -> process_sell()
-- TRANSFER_*         -> no tax effect (own wallets), nothing to do
CREATE OR REPLACE FUNCTION trg_txn_apply() RETURNS TRIGGER AS $$
DECLARE
    v_user INT;
BEGIN
    SELECT user_id INTO v_user FROM wallet_exchange WHERE wallet_id = NEW.wallet_id;

    IF NEW.txn_type IN ('BUY', 'SWAP_IN') THEN
        INSERT INTO tax_lot (txn_id, user_id, asset_id, acquired_at, original_qty, remaining_qty, unit_cost)
        VALUES (NEW.txn_id, v_user, NEW.asset_id, NEW.txn_time, NEW.quantity, NEW.quantity,
                NEW.price_per_unit + NEW.fees / NEW.quantity);
    ELSIF NEW.txn_type IN ('SELL', 'SWAP_OUT') THEN
        CALL process_sell(NEW.txn_id);
    ELSE
        RETURN NULL;
    END IF;

    PERFORM recompute_holding(v_user, NEW.asset_id);
    RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_apply ON txn;
CREATE TRIGGER txn_apply AFTER INSERT ON txn
    FOR EACH ROW EXECUTE FUNCTION trg_txn_apply();

-- ---------- TRIGGER 3 : ledger rows are immutable ----------------------
CREATE OR REPLACE FUNCTION trg_txn_immutable() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Transactions cannot be edited; delete and re-enter instead (txn %)', OLD.txn_id;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_immutable ON txn;
CREATE TRIGGER txn_immutable BEFORE UPDATE OF wallet_id, asset_id, txn_type, quantity, price_per_unit, fees, txn_time
    ON txn FOR EACH ROW EXECUTE FUNCTION trg_txn_immutable();

-- ---------- TRIGGER 4 : DELETE rolls lots back -------------------------
CREATE OR REPLACE FUNCTION trg_txn_before_delete() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.txn_type IN ('BUY', 'SWAP_IN') THEN
        IF EXISTS (SELECT 1 FROM tax_lot l JOIN lot_disposal d ON d.lot_id = l.lot_id
                   WHERE l.txn_id = OLD.txn_id) THEN
            RAISE EXCEPTION 'Cannot delete txn %: units from it were already sold. Delete the sells first.', OLD.txn_id;
        END IF;
    ELSIF OLD.txn_type IN ('SELL', 'SWAP_OUT') THEN
        UPDATE tax_lot l
           SET remaining_qty = l.remaining_qty + d.qty_consumed
          FROM lot_disposal d
         WHERE d.sell_txn_id = OLD.txn_id AND d.lot_id = l.lot_id;
    END IF;
    RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_before_delete ON txn;
CREATE TRIGGER txn_before_delete BEFORE DELETE ON txn
    FOR EACH ROW EXECUTE FUNCTION trg_txn_before_delete();

CREATE OR REPLACE FUNCTION trg_txn_after_delete() RETURNS TRIGGER AS $$
DECLARE
    v_user INT;
BEGIN
    SELECT user_id INTO v_user FROM wallet_exchange WHERE wallet_id = OLD.wallet_id;
    IF FOUND THEN PERFORM recompute_holding(v_user, OLD.asset_id); END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_after_delete ON txn;
CREATE TRIGGER txn_after_delete AFTER DELETE ON txn
    FOR EACH ROW EXECUTE FUNCTION trg_txn_after_delete();

-- ---------- generate_tax_report : one row per user per FY --------------
-- Gains are netted per term (short / long) and taxed at the admin-defined rate.
-- Net losses in a term are not carried or set off (tax for that term = 0).
CREATE OR REPLACE FUNCTION generate_tax_report(p_user INT, p_fy VARCHAR) RETURNS tax_report AS $$
DECLARE
    v_country CHAR(2);
    v_start   TIMESTAMPTZ := fy_start(p_fy);
    v_end     TIMESTAMPTZ := fy_start(p_fy) + INTERVAL '1 year';
    v_st      NUMERIC;
    v_lt      NUMERIC;
    v_rate_st NUMERIC;
    v_rate_lt NUMERIC;
    r         tax_report;
BEGIN
    SELECT country INTO v_country FROM app_user WHERE user_id = p_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_user; END IF;

    SELECT rate INTO v_rate_st FROM tax_rule WHERE country = v_country AND financial_year = p_fy AND term = 'SHORT';
    SELECT rate INTO v_rate_lt FROM tax_rule WHERE country = v_country AND financial_year = p_fy AND term = 'LONG';
    IF v_rate_st IS NULL OR v_rate_lt IS NULL THEN
        RAISE EXCEPTION 'No tax rules defined for % / %', v_country, p_fy;
    END IF;

    SELECT COALESCE(SUM(d.gain) FILTER (WHERE d.term = 'SHORT'), 0),
           COALESCE(SUM(d.gain) FILTER (WHERE d.term = 'LONG'),  0)
      INTO v_st, v_lt
      FROM lot_disposal d
      JOIN txn t              ON t.txn_id = d.sell_txn_id
      JOIN wallet_exchange w  ON w.wallet_id = t.wallet_id
     WHERE w.user_id = p_user AND d.disposed_at >= v_start AND d.disposed_at < v_end;

    INSERT INTO tax_report (user_id, financial_year, short_term_gain, long_term_gain, tax_payable, generated_at)
    VALUES (p_user, p_fy, v_st, v_lt,
            GREATEST(v_st, 0) * v_rate_st / 100 + GREATEST(v_lt, 0) * v_rate_lt / 100, now())
    ON CONFLICT (user_id, financial_year) DO UPDATE
        SET short_term_gain = EXCLUDED.short_term_gain,
            long_term_gain  = EXCLUDED.long_term_gain,
            tax_payable     = EXCLUDED.tax_payable,
            generated_at    = now()
    RETURNING * INTO r;
    RETURN r;
END $$ LANGUAGE plpgsql;
