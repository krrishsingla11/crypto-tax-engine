# Demo script and viva answers

## A. Demo flow (about 10 minutes)
The evaluation list in the requirements, in order. Have the app running and `psql` open.

1. **Problem and design (1 min).** Show `docs/diagrams/er.png`: "10 tables; the key idea is `tax_lot`: every purchase is a lot, every sale is split across lots in `lot_disposal`."
2. **Database implementation (2 min).** In psql: `\dt`, `\d txn` (constraints, triggers), `\di` (indexes). Mention CREATE / ALTER / DROP (`schema.sql`, `001_alter_examples.sql`, `reset.sql`).
3. **Advanced SQL features (2 min).** Run `tests/sql_tests.sql`: T1 oversell rejected, T6 ledger immutable, T7/T8 delete rules. Then show a trigger and `process_sell()` in `db/logic.sql`.
4. **Important queries (1 min).** `db/queries.sql`: GROUP BY/HAVING, subquery, window functions (running gain, RANK), full-text search.
5. **Indexes (1 min).** `explain_demo.sql`: seq scan 36 ms → index scan 0.4 ms; partial index 19 MB → 1 MB.
6. **Next.js app (3 min).** Log in as Krrish: dashboard → Transactions (add a BUY, try to oversell, show the DB error) → Import CSV (`binance-style.csv`: 3 imported, 2 failed) → Tax report (generate, show disposals) → switch cost basis to LIFO.
   Log in as admin: Admin tabs, change a tax rate, regenerate. Log in as auditor: Audit page, read-only, filter log.
7. **Second database (1 min).** Compass: `raw_imports` document with raw rows + per-row outcome, `audit_logs`, the indexes; the aggregation behind the charts (`src/app/api/analytics/route.ts`).
8. **Security (30 s).** `.env.local` not in git, bcrypt, httpOnly JWT cookie, role checks, parameterised queries.

## B. Likely viva questions
**Why two databases?** Postgres for consistent, relational financial data. MongoDB for raw CSV rows (each exchange has different columns) and an append-only audit log. Forcing those into fixed tables would lose the original data or need constant schema changes.

**What is a tax lot and why a separate table?** One row per purchase with `remaining_qty` and `unit_cost`. A sale can consume part of several lots, and each piece has its own cost and holding period, so the matching must be stored (`lot_disposal`) to compute short vs long term and to audit the result.

**How does FIFO work in your code?** `process_sell()` selects open lots (`remaining_qty > 0`, acquired on or before the sale) ordered by `acquired_at`; for LIFO the order is reversed; for weighted average the unit cost is the average of the open lots. It loops, takes `LEAST(remaining, still-to-sell)`, writes a `lot_disposal` row, reduces the lot, and raises an error if units are missing. The term is LONG when the holding period exceeds the rule's days.

**What stops overselling, including two simultaneous sells?** A BEFORE INSERT trigger checks available lots, and takes `pg_advisory_xact_lock(user, asset)` first, so concurrent trades for the same user and asset run one at a time; the second sees the reduced lots.

**Which advanced SQL concepts did you use?** Triggers (guard, lot creation, immutability, delete rollback), stored procedure and functions (`process_sell`, `generate_tax_report`, `recompute_holding`, `fin_year`), transactions with row locking and savepoints, views (5), indexes (composite, partial, GIN), full-text search, window functions.

**Why is `holding` stored if it can be computed?** It is a maintained summary: rebuilt from open lots by `recompute_holding()` after every change, and test T3 checks it always equals the lots and the ledger. It makes the dashboard fast. This is a deliberate, controlled denormalisation; the lots remain the source of truth.

**Normal form?** Tables are in 3NF: non-key columns depend on the key only (e.g. asset details live in `asset`, not in `txn`; user details in `app_user`). Derived values (`holding`, `tax_report`) are the documented exceptions above.

**Why can't a transaction be edited?** Editing a past trade would silently change lots and disposals. A trigger blocks updates to the financial columns; you delete and re-enter, and delete triggers roll lots back (blocked if units were already sold).

**What does the CSV import do if one row is bad?** Raw rows go to MongoDB first. Valid rows are inserted into Postgres in one transaction, each wrapped in a SAVEPOINT; a bad row (oversell, unknown asset, duplicate) rolls back to its savepoint alone, the rest commit, and each row's result is written back to the Mongo document.

**Why `ON DELETE` rules and constraints?** CHECK constraints enforce validation inside the database (positive quantity, valid enums, remaining ≤ original); foreign keys keep references valid; UNIQUE prevents duplicates (email, one report per user and year).

**How is access control done?** Login verifies a bcrypt hash and sets a signed JWT in an httpOnly cookie. Every API route declares its allowed roles via `withAuth`; users only read their own data; role is never taken from the client (registration always creates a `user`).

**What are the Mongo aggregations?** Rows per platform and outcome (`$unwind`, `$group`, `$addToSet`), events per day and action (`$dateToString`, `$group`), most active users (`$group`, `$sort`, `$limit`), totals by action.

**How were indexes chosen and what did they achieve?** Composite `(wallet_id, asset_id, txn_time)` for the transaction list, partial `(user_id, asset_id, acquired_at) WHERE remaining_qty > 0` for lot matching, GIN for asset search. `explain_demo.sql` shows sequential scans of 36–229 ms becoming sub-millisecond index scans.

**Limitations / future work?** Synthetic prices (real price feed possible), simplified tax rules (no cross-term set-off, no slabs), transfers between wallets carry no cost-basis tracking per wallet, no rate limiting on login, no automated browser tests.

## C. Being able to explain the whole project
Each member should be able to explain every part. Re-read `db/logic.sql` (the trigger flow and `process_sell`) and `src/app/api/transactions/import/route.ts` the night before.
