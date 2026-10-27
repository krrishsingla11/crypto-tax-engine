import { randomBytes } from "crypto";
import { z } from "zod";
import { pool } from "@/lib/pg";
import { getMongoDb } from "@/lib/mongo";
import { COLL, ensureMongoIndexes, logAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csvImport";
import { fail, json, withAuth } from "@/lib/api";

const Body = z.object({
  walletId: z.number().int().positive(),
  fileName: z.string().max(120).default("upload.csv"),
  csv: z.string().min(1).max(2_000_000),
});

/**
 * CSV import.
 *  1. Raw rows are stored untouched in MongoDB (raw_imports) - exchanges all export different columns.
 *  2. Valid rows are inserted into PostgreSQL in ONE database transaction, one INSERT per row,
 *     each wrapped in a SAVEPOINT: a bad row (oversell, unknown asset, duplicate) is rolled back
 *     alone and reported; the good rows are committed together.
 *  3. The per-row result is written back to the MongoDB document.
 */
export const POST = withAuth(["user"], async (req, _ctx, s) => {
  const b = Body.parse(await req.json());

  const w = await pool.query(`SELECT platform_name FROM wallet_exchange WHERE wallet_id = $1 AND user_id = $2`, [b.walletId, s.userId]);
  if (!w.rowCount) return fail("Wallet not found", 404);
  const platform: string = w.rows[0].platform_name;

  const { rows, fileError } = parseCsv(b.csv);
  if (fileError) return fail(fileError, 400);

  const importId = `imp_${Date.now()}_${randomBytes(3).toString("hex")}`;
  await ensureMongoIndexes();
  const coll = (await getMongoDb()).collection(COLL.imports);
  await coll.insertOne({
    import_id: importId, user_id: s.userId, wallet_id: b.walletId, platform, file_name: b.fileName,
    uploaded_at: new Date(), status: "processing",
    rows: rows.map((r) => ({ line: r.line, raw: r.raw, status: r.error ? "error" : "pending", error: r.error ?? null, txn_id: null })),
  });

  // chronological order so a SELL always sees the BUYs before it
  const order = rows.filter((r) => r.txn).sort((a, c) => a.txn!.txnTime.localeCompare(c.txn!.txnTime) || a.line - c.line);
  const results = new Map<number, { status: string; txn_id: string | null; error: string | null }>();
  rows.filter((r) => r.error).forEach((r) => results.set(r.line, { status: "error", txn_id: null, error: r.error! }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of order) {
      const t = r.txn!;
      await client.query("SAVEPOINT row_sp");
      try {
        const dup = await client.query(
          `SELECT 1 FROM txn x JOIN asset a ON a.asset_id = x.asset_id
            WHERE x.wallet_id = $1 AND a.symbol = $2 AND x.txn_type = $3 AND x.quantity = $4 AND x.txn_time = $5`,
          [b.walletId, t.symbol, t.txnType, t.quantity, t.txnTime],
        );
        if (dup.rowCount) throw new Error("duplicate of an existing transaction");

        const ins = await client.query(
          `INSERT INTO txn (wallet_id, asset_id, txn_type, quantity, price_per_unit, fees, txn_time, import_ref)
           SELECT $1, a.asset_id, $3, $4, $5, $6, $7, $8 FROM asset a WHERE a.symbol = $2
           RETURNING txn_id`,
          [b.walletId, t.symbol, t.txnType, t.quantity, t.pricePerUnit, t.fees, t.txnTime, importId],
        );
        if (!ins.rowCount) throw new Error(`unknown asset ${t.symbol}`);
        await client.query("RELEASE SAVEPOINT row_sp");
        results.set(r.line, { status: "imported", txn_id: String(ins.rows[0].txn_id), error: null });
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT row_sp");
        results.set(r.line, { status: "error", txn_id: null, error: (e as Error).message });
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    await coll.updateOne({ import_id: importId }, { $set: { status: "failed", error: (e as Error).message } });
    throw e;
  } finally {
    client.release();
  }

  const outRows = rows.map((r) => ({ line: r.line, raw: r.raw, ...results.get(r.line)! }));
  const imported = outRows.filter((r) => r.status === "imported").length;
  const failed = outRows.length - imported;
  await coll.updateOne(
    { import_id: importId },
    { $set: { rows: outRows, status: "completed", imported_count: imported, failed_count: failed, completed_at: new Date() } },
  );
  await logAudit({ userId: s.userId, role: s.role, action: "IMPORT", entity: "raw_imports", entityId: importId, details: { platform, file: b.fileName, imported, failed } });

  return json({
    importId, platform, total: outRows.length, imported, failed,
    errors: outRows.filter((r) => r.status === "error").map((r) => ({ line: r.line, error: r.error })),
  }, 201);
});
