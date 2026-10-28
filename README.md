# Crypto-Asset Portfolio & Tax Liability Engine

DBMS Experiential Learning, Level 3 project (PES University) · Team 11

A web application that consolidates crypto transactions from several exchanges and wallets, tracks every purchase as a **tax lot**, values the portfolio from stored prices, and calculates short-term / long-term capital gains and the estimated tax for a financial year.

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 16 (App Router, Route Handlers), React, Tailwind CSS |
| Relational database | PostgreSQL (tables, constraints, triggers, stored procedures, views, indexes) |
| Document database | MongoDB (raw exchange imports, audit log, aggregation pipelines) |
| Auth | bcrypt password hashes, signed JWT in an httpOnly cookie, role checks on every route |

## Why two databases
- **PostgreSQL** holds everything that must stay consistent: users, wallets, transactions, lots, disposals, prices, tax rules. Gain calculation needs ACID transactions, foreign keys, constraints and database-side logic.
- **MongoDB** holds data with no fixed shape: every exchange exports a different CSV, so the raw rows are stored untouched as documents (with the per-row import result), plus an append-only audit log analysed with aggregation pipelines.

## Features
- Wallets / exchanges, transactions (buy, sell, transfer, swap) with database-level validation (no overselling, no negative values, immutable ledger)
- CSV import from different exchange formats: raw rows to MongoDB, valid rows to PostgreSQL in one transaction with a SAVEPOINT per row
- Lot-based cost basis: **FIFO, LIFO or weighted average** (chosen per user), short-term vs long-term by holding period
- Portfolio valuation from stored daily prices, unrealized and realized gains
- Tax report per financial year (stored function), disposal-level detail, CSV export
- Admin area: assets, configurable tax rules, price CSV upload, user roles
- Audit & analytics page: aggregation charts and a filterable audit log
- Roles: **user**, **auditor** (read-only across users), **admin**

## Prerequisites
Node.js 20+, PostgreSQL 16+, MongoDB 7+ (Community Server), Git.

## Setup
```bash
git clone <this-repo-url>
cd crypto-tax-engine
npm install
```

1. **Create the database** (once):
   ```sql
   -- in psql
   CREATE DATABASE cryptotax;
   ```
2. **Environment:** copy `.env.example` to `.env.local` and fill it in (never commit `.env.local`):
   ```
   PG_HOST=localhost
   PG_PORT=5432
   PG_USER=postgres
   PG_PASSWORD=<your postgres password>
   PG_DATABASE=cryptotax
   MONGO_URI=mongodb://localhost:27017
   MONGO_DB=cryptotax
   JWT_SECRET=<long random string>
   ```
   Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Load the database** (from the project root; this rebuilds everything and wipes existing data):
   ```bash
   psql -U postgres -d cryptotax -f db/setup_all.sql
   ```
   On Windows, if `psql` isn't on your PATH, use the full path, e.g. `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`.
4. **Run:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 (health check: http://localhost:3000/api/health should show `{"postgres":"ok","mongo":"ok"}`).

MongoDB needs no setup: collections and indexes are created automatically on first use.

## Demo accounts
| Role | Email | Password |
|---|---|---|
| User | krrish@demo.dev | User@123 |
| User | priya@demo.dev | User@123 |
| Auditor | auditor@cryptotax.dev | Audit@123 |
| Admin | admin@cryptotax.dev | Admin@123 |

Sample CSVs to import are in `docs/sample-imports/` (`binance-style.csv` into the Binance wallet, `coindcx-style.csv` into CoinDCX; `prices-sample.csv` via Admin → Prices).

## Tests
```bash
psql -U postgres -d cryptotax -f tests/sql_tests.sql      # 10 database tests, expect T1..T10 PASS (rolls back, data untouched)
```
- API requests: `tests/api-tests.http` (VS Code "REST Client" extension; log in first)
- Index evidence: `psql -U postgres -d cryptotax -f db/explain_demo.sql` (EXPLAIN ANALYZE before and after, on scratch tables)
- Showcase queries (joins, GROUP BY / HAVING, subqueries, window functions, full-text search): `db/queries.sql`

## Project structure
```
db/            schema.sql, seed_base.sql, logic.sql (triggers + procedures), views.sql, seed_txns.sql,
               queries.sql, explain_demo.sql, setup_all.sql, reset.sql, migrations/
tests/         sql_tests.sql, api-tests.http
docs/          er-diagram.dbml, diagrams/ (ER + architecture), mongodb-model.md, sample-imports/
src/app/       pages (login, register, dashboard, transactions, tax-report, admin, audit) and src/app/api/* route handlers
src/lib/       pg.ts, mongo.ts, auth.ts, audit.ts, api.ts, csvImport.ts, format.ts
src/components UI components
```

## Notes on the tax calculation
The default rules are illustrative (India: flat 30 % on both terms; US: 24 % / 15 %) and are editable in Admin → Tax rules. Gains are netted within each term; a net loss in one term is not set off against the other. This is an estimator for a course project, not tax advice. Prices are synthetic demo data unless you upload real ones.

## Team
| Member | Responsibilities |
|---|---|
| PES1UG24AM141 | _fill in honestly from the git history_ |
| PES1UG24AM138 | _fill in honestly from the git history_ |
