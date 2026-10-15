-- =====================================================================
-- queries.sql : showcase queries for the report / demo
-- (JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries, window fns, FTS)
-- Replace :uid with a user id (e.g. 3 for krrish@demo.dev).
-- =====================================================================

-- Q1  JOIN + aggregate: portfolio value per user
SELECT u.name, SUM(v.market_value) AS portfolio_value
FROM v_portfolio_valuation v JOIN app_user u ON u.user_id = v.user_id
GROUP BY u.name ORDER BY portfolio_value DESC;

-- Q2  GROUP BY + HAVING: assets where a user's realized gain exceeds 100000
SELECT symbol, SUM(gain) AS total_gain
FROM v_realized_gains WHERE user_id = 3
GROUP BY symbol HAVING SUM(gain) > 100000
ORDER BY total_gain DESC;

-- Q3  Short vs long term gain per financial year
SELECT financial_year, term, ROUND(SUM(gain), 2) AS gain
FROM v_realized_gains WHERE user_id = 3
GROUP BY financial_year, term ORDER BY financial_year, term;

-- Q4  Subquery: holdings currently at an unrealized loss
SELECT symbol, quantity, unrealized_gain
FROM v_portfolio_valuation
WHERE user_id = 3
  AND unrealized_gain < (SELECT 0);

-- Q5  Window function: running realized gain over time
SELECT disposed_at::date AS day, symbol, gain,
       SUM(gain) OVER (PARTITION BY user_id ORDER BY disposed_at) AS running_gain
FROM v_realized_gains WHERE user_id = 3
ORDER BY disposed_at;

-- Q6  Window function: rank assets by realized gain per user
SELECT user_id, symbol, ROUND(SUM(gain), 2) AS total_gain,
       RANK() OVER (PARTITION BY user_id ORDER BY SUM(gain) DESC) AS gain_rank
FROM v_realized_gains GROUP BY user_id, symbol;

-- Q7  Window function: running quantity of an asset (ledger view)
SELECT t.txn_time::date, t.txn_type, t.quantity,
       SUM(CASE WHEN t.txn_type IN ('BUY','SWAP_IN') THEN t.quantity
                WHEN t.txn_type IN ('SELL','SWAP_OUT') THEN -t.quantity ELSE 0 END)
         OVER (ORDER BY t.txn_time) AS running_qty
FROM txn t JOIN asset a ON a.asset_id = t.asset_id
WHERE a.symbol = 'BTC' AND t.wallet_id IN (SELECT wallet_id FROM wallet_exchange WHERE user_id = 3)
ORDER BY t.txn_time;

-- Q8  Full-text search on assets (uses GIN index)
SELECT symbol, name FROM asset
WHERE to_tsvector('simple', symbol || ' ' || name) @@ plainto_tsquery('simple', 'bitcoin');

-- Q9  Generate and read a tax report (stored function)
SELECT * FROM generate_tax_report(3, '2026-27');
SELECT * FROM tax_report WHERE user_id = 3;

-- Q10 Per-wallet holdings via lots
SELECT w.platform_name, a.symbol, SUM(l.remaining_qty) AS qty_in_open_lots
FROM tax_lot l
JOIN txn t ON t.txn_id = l.txn_id
JOIN wallet_exchange w ON w.wallet_id = t.wallet_id
JOIN asset a ON a.asset_id = l.asset_id
WHERE l.user_id = 3 AND l.remaining_qty > 0
GROUP BY w.platform_name, a.symbol ORDER BY 1, 2;

-- Index demo: compare plans
EXPLAIN ANALYZE SELECT * FROM txn WHERE wallet_id = 1 AND asset_id = 1 AND txn_time >= '2026-01-01';
