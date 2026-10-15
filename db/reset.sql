-- DROP everything (dev reset). Run before schema.sql to rebuild from scratch.
DROP TABLE IF EXISTS tax_report     CASCADE;
DROP TABLE IF EXISTS holding        CASCADE;
DROP TABLE IF EXISTS tax_rule       CASCADE;
DROP TABLE IF EXISTS price_history  CASCADE;
DROP TABLE IF EXISTS lot_disposal   CASCADE;
DROP TABLE IF EXISTS tax_lot        CASCADE;
DROP TABLE IF EXISTS txn            CASCADE;
DROP TABLE IF EXISTS asset          CASCADE;
DROP TABLE IF EXISTS wallet_exchange CASCADE;
DROP TABLE IF EXISTS app_user       CASCADE;
