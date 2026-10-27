import { z } from "zod";
import { pool } from "@/lib/pg";
import { decimalString, fail, json, targetUserId, withAuth } from "@/lib/api";

// ---- list with filters + paging ------------------------------------------
export const GET = withAuth("any", async (req, _ctx, s) => {
  const sp = new URL(req.url).searchParams;
  const where: string[] = ["w.user_id = $1"];
  const args: unknown[] = [targetUserId(req, s)];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };

  if (sp.get("symbol")) add("a.symbol = ?", sp.get("symbol")!.toUpperCase());
  if (sp.get("walletId")) add("t.wallet_id = ?", Number(sp.get("walletId")));
  if (sp.get("type")) add("t.txn_type = ?", sp.get("type"));
  if (sp.get("from")) add("t.txn_time >= ?", sp.get("from"));
  if (sp.get("to")) add("t.txn_time < ?", sp.get("to"));

  const limit = Math.min(Number(sp.get("limit")) || 25, 100);
  const offset = (Math.max(Number(sp.get("page")) || 1, 1) - 1) * limit;

  const { rows } = await pool.query(
    `SELECT t.txn_id, t.txn_type, a.symbol, t.quantity, t.price_per_unit, t.fees, t.txn_time,
            w.wallet_id, w.platform_name, t.notes,
            COUNT(*) OVER () AS total
       FROM txn t
       JOIN wallet_exchange w ON w.wallet_id = t.wallet_id
       JOIN asset a ON a.asset_id = t.asset_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.txn_time DESC, t.txn_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    args,
  );
  return json({ total: Number(rows[0]?.total ?? 0), transactions: rows.map(({ total: _t, ...r }) => r) });
});

// ---- create one transaction ----------------------------------------------
const dec = (label: string) =>
  z.union([z.string(), z.number()]).transform(String)
    .refine((v) => decimalString().test(v), `${label} must be a non-negative decimal`);

const Body = z.object({
  walletId: z.number().int().positive(),
  symbol: z.string().trim().toUpperCase().min(1).max(12),
  txnType: z.enum(["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT", "SWAP_IN", "SWAP_OUT"]),
  quantity: dec("quantity"),
  pricePerUnit: dec("pricePerUnit"),
  fees: dec("fees").default("0"),
  txnTime: z.string().datetime({ offset: true }),
  notes: z.string().max(200).optional(),
});

export const POST = withAuth(["user"], async (req, _ctx, s) => {
  const b = Body.parse(await req.json());

  // the wallet must belong to the logged-in user
  const own = await pool.query(`SELECT 1 FROM wallet_exchange WHERE wallet_id = $1 AND user_id = $2`, [b.walletId, s.userId]);
  if (!own.rowCount) return fail("Wallet not found", 404);

  // ONE statement per transaction: the DB triggers create lots / match disposals.
  // Oversell, bad values etc. are rejected by the DB and mapped to a 400.
  const { rows } = await pool.query(
    `INSERT INTO txn (wallet_id, asset_id, txn_type, quantity, price_per_unit, fees, txn_time, notes)
     SELECT $1, a.asset_id, $3, $4, $5, $6, $7, $8 FROM asset a WHERE a.symbol = $2
     RETURNING txn_id, txn_type, quantity, price_per_unit, fees, txn_time`,
    [b.walletId, b.symbol, b.txnType, b.quantity, b.pricePerUnit, b.fees, b.txnTime, b.notes ?? null],
  );
  if (!rows.length) return fail(`Unknown asset ${b.symbol}`, 400);
  return json({ transaction: rows[0] }, 201);
});
