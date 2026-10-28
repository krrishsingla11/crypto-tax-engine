-- =====================================================================
-- explain_demo.sql : proves what the indexes buy us (EXPLAIN ANALYZE, before vs after)
-- Uses its own scratch tables (bench_*), so your real data is NOT touched.
-- Run:  psql -U postgres -d cryptotax -f db/explain_demo.sql
-- Screenshot the "BEFORE" and "AFTER" plans of each demo for the report.
-- =====================================================================
\set ECHO queries
\pset pager off
DROP TABLE IF EXISTS bench_txn, bench_lot, bench_asset;

-- ---------------------------------------------------------------------
-- DEMO 1: composite index idx_txn_wallet_asset_time (the transaction list / filters)
-- ---------------------------------------------------------------------
CREATE TABLE bench_txn AS
SELECT g AS txn_id,
       1 + (random() * 199)::int AS wallet_id,
       1 + (random() * 4)::int   AS asset_id,
       timestamptz '2025-01-01' + random() * interval '700 days' AS txn_time,
       (random() * 5)::numeric(10,4) AS quantity
FROM generate_series(1, 400000) g;
ANALYZE bench_txn;

\echo '=== DEMO 1 BEFORE: no index -> sequential scan of 400,000 rows'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM bench_txn
WHERE wallet_id = 57 AND asset_id = 2 AND txn_time >= '2026-01-01';

CREATE INDEX bench_txn_idx ON bench_txn (wallet_id, asset_id, txn_time);
ANALYZE bench_txn;

\echo '=== DEMO 1 AFTER: composite index (same shape as idx_txn_wallet_asset_time)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM bench_txn
WHERE wallet_id = 57 AND asset_id = 2 AND txn_time >= '2026-01-01';

-- ---------------------------------------------------------------------
-- DEMO 2: partial index idx_lot_open_fifo (open lots only, FIFO / LIFO matching)
-- 95% of lots are fully sold (remaining_qty = 0); sells only ever look at the open 5%
-- ---------------------------------------------------------------------
CREATE TABLE bench_lot AS
SELECT g AS lot_id,
       1 + (random() * 999)::int AS user_id,
       1 + (random() * 4)::int   AS asset_id,
       timestamptz '2024-01-01' + random() * interval '900 days' AS acquired_at,
       CASE WHEN random() < 0.05 THEN (1 + random() * 5)::numeric(10,4) ELSE 0 END AS remaining_qty
FROM generate_series(1, 500000) g;
ANALYZE bench_lot;

\echo '=== DEMO 2 BEFORE: no index'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM bench_lot
WHERE user_id = 42 AND asset_id = 1 AND remaining_qty > 0
ORDER BY acquired_at, lot_id;

CREATE INDEX bench_lot_full ON bench_lot (user_id, asset_id, acquired_at, lot_id);
CREATE INDEX bench_lot_open ON bench_lot (user_id, asset_id, acquired_at, lot_id) WHERE remaining_qty > 0;
ANALYZE bench_lot;

\echo '=== DEMO 2 AFTER: partial index (WHERE remaining_qty > 0), as in idx_lot_open_fifo'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM bench_lot
WHERE user_id = 42 AND asset_id = 1 AND remaining_qty > 0
ORDER BY acquired_at, lot_id;

\echo '=== DEMO 2 SIZE: the partial index only stores the open lots'
SELECT indexrelid::regclass AS index_name, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_index WHERE indrelid = 'bench_lot'::regclass AND indexrelid::regclass::text IN ('bench_lot_full', 'bench_lot_open')
ORDER BY 1;

-- ---------------------------------------------------------------------
-- DEMO 3: GIN full-text index on assets (idx_asset_fts), prefix search like the UI uses
-- ---------------------------------------------------------------------
CREATE TABLE bench_asset AS
SELECT g AS asset_id,
       upper(substr(md5(g::text), 1, 5)) AS symbol,
       'Token ' || md5((g * 7)::text) AS name
FROM generate_series(1, 100000) g;
INSERT INTO bench_asset VALUES (900001, 'BTC', 'Bitcoin');
ANALYZE bench_asset;

\echo '=== DEMO 3 BEFORE: full-text search without a GIN index'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT symbol, name FROM bench_asset
WHERE to_tsvector('simple', symbol || ' ' || name) @@ to_tsquery('simple', 'bitcoin:*');

CREATE INDEX bench_asset_fts ON bench_asset USING GIN (to_tsvector('simple', symbol || ' ' || name));
ANALYZE bench_asset;

\echo '=== DEMO 3 AFTER: GIN index'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT symbol, name FROM bench_asset
WHERE to_tsvector('simple', symbol || ' ' || name) @@ to_tsquery('simple', 'bitcoin:*');

DROP TABLE bench_txn, bench_lot, bench_asset;
\echo '=== done: scratch tables dropped'
