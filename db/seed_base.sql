-- =====================================================================
-- seed_base.sql : users, assets, wallets, tax rules, price history
-- Run AFTER schema.sql. Transactions are seeded separately (seed_txns.sql)
-- AFTER the triggers exist (Step 4), so lots/holdings are built automatically.
-- Demo logins:  admin@cryptotax.dev / Admin@123
--               auditor@cryptotax.dev / Audit@123
--               krrish@demo.dev / User@123    priya@demo.dev / User@123
-- =====================================================================

INSERT INTO app_user (name, email, password_hash, tax_id, country, role, cost_method) VALUES
 ('Admin',  'admin@cryptotax.dev',   '$2b$10$riffUnVyQhZriF5oG0eIA.A8ltAY4ZGFu47NcE49UnVJ646rAogFS', NULL,         'IN', 'admin',   'FIFO'),
 ('Auditor','auditor@cryptotax.dev', '$2b$10$jTj6TQPQKJIX1hDA.UGtNuzs2lprnW7H4Cc5kFi683cKfxGR18AvK', NULL,         'IN', 'auditor', 'FIFO'),
 ('Krrish', 'krrish@demo.dev',       '$2b$10$SgARjeVMIpz0m.aYudUQquWJJbLlxn65WBdP9xX1yb1Es1DD1JWji', 'ABCDE1234F', 'IN', 'user',    'FIFO'),
 ('Priya',  'priya@demo.dev',        '$2b$10$SgARjeVMIpz0m.aYudUQquWJJbLlxn65WBdP9xX1yb1Es1DD1JWji', 'PQRST5678K', 'IN', 'user',    'LIFO');

INSERT INTO asset (symbol, name, asset_type) VALUES
 ('BTC',   'Bitcoin',  'crypto'),
 ('ETH',   'Ethereum', 'crypto'),
 ('SOL',   'Solana',   'crypto'),
 ('MATIC', 'Polygon',  'token'),
 ('USDT',  'Tether',   'stablecoin');

INSERT INTO wallet_exchange (user_id, platform_name, wallet_type)
SELECT u.user_id, w.platform, w.wtype
FROM (VALUES
  ('krrish@demo.dev', 'Binance',  'exchange'),
  ('krrish@demo.dev', 'CoinDCX',  'exchange'),
  ('krrish@demo.dev', 'Ledger',   'cold'),
  ('priya@demo.dev',  'WazirX',   'exchange'),
  ('priya@demo.dev',  'MetaMask', 'hot')
) AS w(email, platform, wtype)
JOIN app_user u ON u.email = w.email;

-- Tax rules (configurable by admin). Rates are percent.
INSERT INTO tax_rule (country, financial_year, term, long_term_days, rate, description) VALUES
 ('IN', '2025-26', 'SHORT', 365, 30.00, 'Flat rate on short-term crypto gains'),
 ('IN', '2025-26', 'LONG',  365, 30.00, 'Flat rate on long-term crypto gains'),
 ('IN', '2026-27', 'SHORT', 365, 30.00, 'Flat rate on short-term crypto gains'),
 ('IN', '2026-27', 'LONG',  365, 30.00, 'Flat rate on long-term crypto gains'),
 ('US', '2025-26', 'SHORT', 365, 24.00, 'Illustrative ordinary-income bracket'),
 ('US', '2025-26', 'LONG',  365, 15.00, 'Illustrative long-term bracket');

-- Synthetic daily closing prices (INR) from 2025-04-01 to 2026-10-14.
-- Deterministic wave + trend so results are repeatable. Replace with real data later.
INSERT INTO price_history (asset_id, price_date, closing_price)
SELECT a.asset_id,
       d::date,
       ROUND((b.base * (1
            + b.trend * (d::date - DATE '2025-04-01') / 560.0
            + b.amp   * SIN((d::date - DATE '2025-04-01') / b.period)
            + 0.02    * SIN((d::date - DATE '2025-04-01') * 1.7)
       ))::numeric, 4)
FROM generate_series(DATE '2025-04-01', DATE '2026-10-14', INTERVAL '1 day') AS d
JOIN (VALUES
  ('BTC',   7000000.0, 0.35, 0.12, 31.0),
  ('ETH',    220000.0, 0.20, 0.15, 27.0),
  ('SOL',     12000.0, 0.30, 0.18, 23.0),
  ('MATIC',      60.0, -0.10, 0.20, 19.0),
  ('USDT',       85.0, 0.01, 0.01, 41.0)
) AS b(symbol, base, trend, amp, period) ON TRUE
JOIN asset a ON a.symbol = b.symbol;
