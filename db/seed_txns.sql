-- =====================================================================
-- seed_txns.sql : sample transactions
-- Run ONLY AFTER schema.sql, seed_base.sql, logic.sql and views.sql.
-- Rows are inserted ONE PER STATEMENT, in date order, because the lot-creating
-- trigger fires per statement: a SELL must see lots created by earlier BUYs.
-- (The app's CSV import does the same: a loop of single inserts in one transaction.)
-- Prices come from price_history on the txn date; fees = 0.1% of value.
-- =====================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT w.wallet_id, a.asset_id, v.ttype, v.qty, p.closing_price AS price,
           ROUND(v.qty * p.closing_price * 0.001, 4) AS fee,
           ((v.d::timestamp + INTERVAL '10 hours') AT TIME ZONE 'Asia/Kolkata') AS ts,
           v.note
    FROM (VALUES
      -- user, platform, symbol, type, qty, date, note
      ('krrish@demo.dev','Binance','BTC','BUY',  0.50,  DATE '2025-04-10', 'initial BTC buy'),
      ('krrish@demo.dev','Binance','BTC','BUY',  0.30,  DATE '2025-07-15', NULL),
      ('krrish@demo.dev','Binance','BTC','BUY',  0.20,  DATE '2026-02-20', NULL),
      ('krrish@demo.dev','Binance','BTC','SELL', 0.40,  DATE '2026-05-12', 'partial exit'),
      ('krrish@demo.dev','Binance','BTC','SELL', 0.35,  DATE '2026-09-20', NULL),
      ('krrish@demo.dev','Binance','BTC','SELL', 0.10,  DATE '2026-09-25', NULL),
      ('krrish@demo.dev','Binance','ETH','BUY',  5.00,  DATE '2025-05-05', NULL),
      ('krrish@demo.dev','Binance','ETH','BUY',  3.00,  DATE '2025-11-10', NULL),
      ('krrish@demo.dev','Binance','ETH','SELL', 2.00,  DATE '2026-03-15', NULL),
      ('krrish@demo.dev','Binance','ETH','SELL', 4.00,  DATE '2026-09-10', NULL),
      ('krrish@demo.dev','CoinDCX','SOL','BUY', 50.00,  DATE '2025-06-01', NULL),
      ('krrish@demo.dev','CoinDCX','SOL','SELL',20.00,  DATE '2026-01-10', NULL),
      ('krrish@demo.dev','CoinDCX','SOL','BUY', 30.00,  DATE '2026-02-14', NULL),
      ('krrish@demo.dev','CoinDCX','SOL','SELL',25.00,  DATE '2026-08-20', NULL),
      ('krrish@demo.dev','CoinDCX','MATIC','BUY', 2000, DATE '2025-08-01', NULL),
      ('krrish@demo.dev','CoinDCX','MATIC','SELL',2000, DATE '2026-04-10', 'full exit'),
      ('krrish@demo.dev','Binance','USDT','BUY', 1000,  DATE '2025-04-02', NULL),
      ('krrish@demo.dev','Binance','USDT','SELL', 500,  DATE '2026-07-01', NULL),
      ('priya@demo.dev', 'WazirX','ETH','BUY',   2.00,  DATE '2025-09-01', NULL),
      ('priya@demo.dev', 'WazirX','ETH','BUY',   1.00,  DATE '2026-01-05', NULL),
      ('priya@demo.dev', 'WazirX','ETH','SELL',  1.50,  DATE '2026-04-01', NULL),
      ('priya@demo.dev', 'MetaMask','SOL','BUY',40.00,  DATE '2025-12-01', NULL),
      ('priya@demo.dev', 'MetaMask','SOL','SELL',10.00, DATE '2026-06-15', NULL)
    ) AS v(email, platform, symbol, ttype, qty, d, note)
    JOIN app_user u        ON u.email = v.email
    JOIN wallet_exchange w ON w.user_id = u.user_id AND w.platform_name = v.platform
    JOIN asset a           ON a.symbol = v.symbol
    JOIN price_history p   ON p.asset_id = a.asset_id AND p.price_date = v.d
    ORDER BY v.d, v.email
  LOOP
    INSERT INTO txn (wallet_id, asset_id, txn_type, quantity, price_per_unit, fees, txn_time, notes)
    VALUES (r.wallet_id, r.asset_id, r.ttype, r.qty, r.price, r.fee, r.ts, r.note);
  END LOOP;
END $$;
