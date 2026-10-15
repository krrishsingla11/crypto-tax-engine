-- =====================================================================
-- views.sql : reporting views.  Run AFTER schema.sql and logic.sql.
-- =====================================================================

-- Latest known price per asset
CREATE OR REPLACE VIEW v_latest_price AS
SELECT DISTINCT ON (asset_id) asset_id, price_date, closing_price
FROM price_history
ORDER BY asset_id, price_date DESC;

-- Portfolio valuation per user + asset (current value vs cost)
CREATE OR REPLACE VIEW v_portfolio_valuation AS
SELECT h.user_id, a.asset_id, a.symbol, a.name,
       h.quantity, h.avg_cost_basis,
       p.closing_price                               AS latest_price,
       h.quantity * p.closing_price                  AS market_value,
       h.quantity * h.avg_cost_basis                 AS cost_value,
       h.quantity * (p.closing_price - h.avg_cost_basis) AS unrealized_gain
FROM holding h
JOIN asset a          ON a.asset_id = h.asset_id
JOIN v_latest_price p ON p.asset_id = h.asset_id
WHERE h.quantity > 0;

-- Every realized disposal with its financial year
CREATE OR REPLACE VIEW v_realized_gains AS
SELECT w.user_id, fin_year(d.disposed_at) AS financial_year,
       a.symbol, d.sell_txn_id, d.lot_id, d.qty_consumed,
       d.proceeds, d.cost_basis, d.gain, d.term, d.disposed_at
FROM lot_disposal d
JOIN txn t             ON t.txn_id = d.sell_txn_id
JOIN wallet_exchange w ON w.wallet_id = t.wallet_id
JOIN asset a           ON a.asset_id = t.asset_id;

-- Unrealized gain per open lot, with short/long classification today
CREATE OR REPLACE VIEW v_unrealized_gains AS
SELECT l.user_id, a.symbol, l.lot_id, l.acquired_at, l.remaining_qty, l.unit_cost,
       p.closing_price AS latest_price,
       l.remaining_qty * (p.closing_price - l.unit_cost) AS unrealized_gain,
       CASE WHEN now() - l.acquired_at > INTERVAL '365 days' THEN 'LONG' ELSE 'SHORT' END AS term_if_sold_today
FROM tax_lot l
JOIN asset a          ON a.asset_id = l.asset_id
JOIN v_latest_price p ON p.asset_id = l.asset_id
WHERE l.remaining_qty > 0;

-- One-row-per-user dashboard summary
CREATE OR REPLACE VIEW v_user_summary AS
SELECT u.user_id, u.name,
       COALESCE((SELECT SUM(market_value)    FROM v_portfolio_valuation v WHERE v.user_id = u.user_id), 0) AS portfolio_value,
       COALESCE((SELECT SUM(cost_value)      FROM v_portfolio_valuation v WHERE v.user_id = u.user_id), 0) AS portfolio_cost,
       COALESCE((SELECT SUM(unrealized_gain) FROM v_portfolio_valuation v WHERE v.user_id = u.user_id), 0) AS unrealized_gain,
       COALESCE((SELECT SUM(gain)            FROM v_realized_gains r      WHERE r.user_id = u.user_id), 0) AS realized_gain
FROM app_user u
WHERE u.role = 'user';
