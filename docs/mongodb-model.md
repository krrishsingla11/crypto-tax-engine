# MongoDB data model (database: cryptotax)

## raw_imports  (one document per uploaded CSV / API pull)
```json
{
  "import_id": "imp_20261014_001",
  "user_id": 3,
  "platform": "Binance",
  "file_name": "binance_trades.csv",
  "uploaded_at": "2026-10-14T10:00:00Z",
  "status": "completed",
  "rows": [
    { "raw": { "...original exchange columns, untouched..." }, "status": "mapped", "mapped_txn_id": 101 },
    { "raw": { "...": "..." }, "status": "error", "error": "unknown symbol" }
  ]
}
```
Indexes: `{ user_id: 1, uploaded_at: -1 }`, `{ platform: 1 }`, `{ import_id: 1 } (unique)`

## audit_logs  (append-only event trail)
```json
{ "ts": "2026-10-14T10:05:00Z", "user_id": 3, "role": "user",
  "action": "TXN_CREATE", "entity": "txn", "entity_id": 101, "details": { "type": "SELL", "qty": 0.4 } }
```
Indexes: `{ user_id: 1, ts: -1 }`, `{ action: 1, ts: -1 }`

## Why MongoDB here
Every exchange exports different columns, so raw rows stay as documents instead of forcing a fixed table.
Audit logs are append-only and read in aggregate (counts per action/day), which fits aggregation pipelines.

## Aggregations (NoSQL advanced feature)
1. Imports per platform with success / error row counts (`$unwind` rows, `$group` by platform + status)
2. Events per day per action (`$group` on `$dateToString`)
3. Most active users (`$group` by user_id, `$sort`, `$limit`)
