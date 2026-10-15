-- =====================================================================
-- sql_tests.sql : integrity + logic tests.  Run AFTER schema, seed_base,
-- logic, views and seed_txns.  Everything runs inside a transaction that
-- is rolled back, so your data stays untouched.
-- Each test prints PASS via NOTICE or fails with an exception.
-- =====================================================================
BEGIN;

-- T1: oversell is rejected by the trigger
DO $$
DECLARE w INT; a INT;
BEGIN
  SELECT wallet_id INTO w FROM wallet_exchange WHERE platform_name='Binance' LIMIT 1;
  SELECT asset_id  INTO a FROM asset WHERE symbol='BTC';
  BEGIN
    INSERT INTO txn (wallet_id, asset_id, txn_type, quantity, price_per_unit, txn_time)
    VALUES (w, a, 'SELL', 1000, 1, now());
    RAISE EXCEPTION 'T1 FAIL: oversell was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T1 PASS: oversell rejected';
  END;
END $$;

-- T2: CHECK constraints reject bad data
DO $$
DECLARE w INT; a INT;
BEGIN
  SELECT wallet_id INTO w FROM wallet_exchange LIMIT 1;
  SELECT asset_id  INTO a FROM asset LIMIT 1;
  BEGIN
    INSERT INTO txn (wallet_id, asset_id, txn_type, quantity, price_per_unit, txn_time)
    VALUES (w, a, 'BUY', -5, 100, now());
    RAISE EXCEPTION 'T2 FAIL: negative quantity accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T2 PASS: negative quantity rejected';
  END;
END $$;

-- T3: holdings equal the sum of open lots, and match buys minus sells
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM (
    SELECT h.user_id, h.asset_id FROM holding h
    LEFT JOIN (SELECT user_id, asset_id, SUM(remaining_qty) q FROM tax_lot GROUP BY 1,2) l
           USING (user_id, asset_id)
    WHERE h.quantity <> COALESCE(l.q, 0)
  ) x;
  IF bad > 0 THEN RAISE EXCEPTION 'T3 FAIL: % holdings disagree with lots', bad; END IF;

  SELECT COUNT(*) INTO bad FROM (
    SELECT w.user_id, t.asset_id,
           SUM(CASE WHEN t.txn_type IN ('BUY','SWAP_IN') THEN t.quantity
                    WHEN t.txn_type IN ('SELL','SWAP_OUT') THEN -t.quantity ELSE 0 END) AS net
    FROM txn t JOIN wallet_exchange w ON w.wallet_id = t.wallet_id GROUP BY 1,2
  ) n JOIN holding h USING (user_id, asset_id) WHERE h.quantity <> n.net;
  IF bad > 0 THEN RAISE EXCEPTION 'T3 FAIL: % holdings disagree with txn ledger', bad; END IF;
  RAISE NOTICE 'T3 PASS: holdings consistent with lots and ledger';
END $$;

-- T4: every disposal splits exactly into proceeds - cost = gain, and qty per sell matches
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM lot_disposal WHERE ABS(proceeds - cost_basis - gain) > 0.0001;
  IF bad > 0 THEN RAISE EXCEPTION 'T4 FAIL: % disposals with wrong gain', bad; END IF;

  SELECT COUNT(*) INTO bad FROM txn t
  WHERE t.txn_type IN ('SELL','SWAP_OUT')
    AND t.quantity <> (SELECT COALESCE(SUM(qty_consumed),0) FROM lot_disposal d WHERE d.sell_txn_id = t.txn_id);
  IF bad > 0 THEN RAISE EXCEPTION 'T4 FAIL: % sells not fully matched', bad; END IF;
  RAISE NOTICE 'T4 PASS: disposals fully matched, gain = proceeds - cost';
END $$;

-- T5: short/long boundary (> 365 days is LONG)
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM lot_disposal d JOIN tax_lot l USING (lot_id)
  WHERE (d.term = 'LONG') <> (d.disposed_at - l.acquired_at > INTERVAL '365 days');
  IF bad > 0 THEN RAISE EXCEPTION 'T5 FAIL: % disposals misclassified', bad; END IF;
  RAISE NOTICE 'T5 PASS: short/long classification correct';
END $$;

-- T6: transactions are immutable, notes are editable
DO $$
DECLARE id BIGINT;
BEGIN
  SELECT txn_id INTO id FROM txn LIMIT 1;
  BEGIN
    UPDATE txn SET quantity = quantity + 1 WHERE txn_id = id;
    RAISE EXCEPTION 'T6 FAIL: quantity update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'T6 FAIL%' THEN RAISE; END IF;
  END;
  UPDATE txn SET notes = 'edited' WHERE txn_id = id;
  RAISE NOTICE 'T6 PASS: ledger immutable, notes editable';
END $$;

-- T7: deleting a BUY whose units were sold is blocked
DO $$
DECLARE id BIGINT;
BEGIN
  SELECT t.txn_id INTO id FROM txn t JOIN tax_lot l ON l.txn_id = t.txn_id
  JOIN lot_disposal d ON d.lot_id = l.lot_id LIMIT 1;
  BEGIN
    DELETE FROM txn WHERE txn_id = id;
    RAISE EXCEPTION 'T7 FAIL: delete of sold BUY accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'T7 FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'T7 PASS: delete of sold BUY blocked';
  END;
END $$;

-- T8: deleting a SELL restores lots and holdings
DO $$
DECLARE sid BIGINT; u INT; a INT; before_q NUMERIC; after_q NUMERIC; q NUMERIC;
BEGIN
  SELECT t.txn_id, w.user_id, t.asset_id, t.quantity INTO sid, u, a, q
  FROM txn t JOIN wallet_exchange w USING (wallet_id)
  WHERE t.txn_type = 'SELL' ORDER BY t.txn_time DESC LIMIT 1;
  SELECT quantity INTO before_q FROM holding WHERE user_id = u AND asset_id = a;
  DELETE FROM txn WHERE txn_id = sid;
  SELECT quantity INTO after_q FROM holding WHERE user_id = u AND asset_id = a;
  IF after_q <> before_q + q THEN RAISE EXCEPTION 'T8 FAIL: holding % -> %, expected +%', before_q, after_q, q; END IF;
  RAISE NOTICE 'T8 PASS: delete SELL restores holding';
END $$;

-- T9: tax report equals the sum of disposals and applies the rates
DO $$
DECLARE r tax_report; st NUMERIC; lt NUMERIC;
BEGIN
  r := generate_tax_report((SELECT user_id FROM app_user WHERE email='krrish@demo.dev'), '2026-27');
  SELECT COALESCE(SUM(gain) FILTER (WHERE term='SHORT'),0), COALESCE(SUM(gain) FILTER (WHERE term='LONG'),0)
    INTO st, lt FROM v_realized_gains
   WHERE user_id = r.user_id AND financial_year = '2026-27';
  IF ABS(r.short_term_gain - st) > 0.001 OR ABS(r.long_term_gain - lt) > 0.001 THEN
     RAISE EXCEPTION 'T9 FAIL: report gains do not match disposals'; END IF;
  IF ABS(r.tax_payable - (GREATEST(st,0)*0.30 + GREATEST(lt,0)*0.30)) > 0.001 THEN
     RAISE EXCEPTION 'T9 FAIL: tax payable wrong (%)', r.tax_payable; END IF;
  RAISE NOTICE 'T9 PASS: tax report correct (ST %, LT %, tax %)', round(r.short_term_gain,2), round(r.long_term_gain,2), round(r.tax_payable,2);
END $$;

-- T10: unique email and role check
DO $$
BEGIN
  BEGIN
    INSERT INTO app_user (name,email,password_hash,role) VALUES ('x','krrish@demo.dev','h','user');
    RAISE EXCEPTION 'T10 FAIL: duplicate email accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO app_user (name,email,password_hash,role) VALUES ('x','new@demo.dev','h','superuser');
    RAISE EXCEPTION 'T10 FAIL: bad role accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'T10 PASS: unique email and role check enforced';
END $$;

ROLLBACK;
