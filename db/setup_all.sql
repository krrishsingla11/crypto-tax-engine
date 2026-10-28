-- =====================================================================
-- setup_all.sql : (re)builds the whole PostgreSQL side in the right order.
-- Run from the PROJECT ROOT (paths below are relative to it):
--   psql -U postgres -d cryptotax -f db/setup_all.sql
-- WARNING: reset.sql drops all tables first, so this wipes existing data.
-- =====================================================================
\set ON_ERROR_STOP on
\echo '1/7 reset'
\i db/reset.sql
\echo '2/7 schema'
\i db/schema.sql
\echo '3/7 base seed data'
\i db/seed_base.sql
\echo '4/7 alter examples'
\i db/migrations/001_alter_examples.sql
\echo '5/7 triggers and procedures'
\i db/logic.sql
\echo '6/7 views'
\i db/views.sql
\echo '7/7 sample transactions'
\i db/seed_txns.sql
\echo 'done. Verify with:  psql -U postgres -d cryptotax -f tests/sql_tests.sql'
