import { parse } from "csv-parse/sync";
import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

// Coverage per asset: how many days of prices, first / last date, latest close.
export const GET = withAuth(["admin", "auditor"], async () => {
  const { rows } = await pool.query(
    `SELECT a.symbol, a.name, COUNT(p.price_date)::int AS days,
            MIN(p.price_date)::text AS first_date, MAX(p.price_date)::text AS last_date,
            (SELECT closing_price FROM price_history x WHERE x.asset_id = a.asset_id ORDER BY price_date DESC LIMIT 1) AS latest_close
       FROM asset a LEFT JOIN price_history p ON p.asset_id = a.asset_id
      GROUP BY a.asset_id ORDER BY a.symbol`,
  );
  return json({ coverage: rows });
});

const Body = z.object({ csv: z.string().min(1).max(2_000_000) });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const COLS = {
  symbol: ["symbol", "asset", "coin", "ticker"],
  date: ["date", "day", "pricedate", "timestamp"],
  close: ["close", "closingprice", "closeprice", "price"],
};

function parseDay(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y: string, mo: string, d: string;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/))) [, d, mo, y] = m;
  else return null;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== `${y}-${mo}-${d}` ? null : `${y}-${mo}-${d}`;
}

// Upsert daily closing prices from a CSV (symbol, date, close). One statement, all valid rows or none.
export const POST = withAuth(["admin"], async (req, _ctx, s) => {
  const { csv } = Body.parse(await req.json());
  let records: Record<string, string>[];
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    return fail(`Could not read CSV: ${(e as Error).message}`);
  }
  if (!records.length) return fail("CSV has no data rows");
  if (records.length > 20000) return fail("Too many rows (max 20000)");

  const headers = Object.keys(records[0]);
  const col = Object.fromEntries(
    Object.entries(COLS).map(([k, names]) => [k, headers.find((h) => names.includes(norm(h)))]),
  ) as Record<keyof typeof COLS, string | undefined>;
  const missing = (Object.keys(COLS) as (keyof typeof COLS)[]).filter((k) => !col[k]);
  if (missing.length) return fail(`Missing columns: ${missing.join(", ")}. Found: ${headers.join(", ")}`);

  const syms: string[] = [], days: string[] = [], closes: string[] = [];
  const invalid: { line: number; error: string }[] = [];
  records.forEach((r, i) => {
    const sym = (r[col.symbol!] ?? "").toUpperCase();
    const day = parseDay(r[col.date!] ?? "");
    const close = (r[col.close!] ?? "").replace(/[₹$,\s]/g, "");
    if (!sym) invalid.push({ line: i + 2, error: "missing symbol" });
    else if (!day) invalid.push({ line: i + 2, error: `bad date "${r[col.date!]}"` });
    else if (!/^\d+(\.\d{1,8})?$/.test(close) || Number(close) <= 0) invalid.push({ line: i + 2, error: `bad price "${r[col.close!]}"` });
    else { syms.push(sym); days.push(day); closes.push(close); }
  });

  const known = await pool.query(`SELECT symbol FROM asset WHERE symbol = ANY($1)`, [[...new Set(syms)]]);
  const knownSet = new Set(known.rows.map((r) => r.symbol));
  const unknownSymbols = [...new Set(syms.filter((x) => !knownSet.has(x)))];

  const res = await pool.query(
    `INSERT INTO price_history (asset_id, price_date, closing_price)
     SELECT a.asset_id, t.d, t.p
       FROM unnest($1::text[], $2::date[], $3::numeric[]) AS t(sym, d, p)
       JOIN asset a ON a.symbol = t.sym
     ON CONFLICT (asset_id, price_date) DO UPDATE SET closing_price = EXCLUDED.closing_price
     RETURNING (xmax = 0) AS inserted`,
    [syms, days, closes],
  );
  const inserted = res.rows.filter((r) => r.inserted).length;
  const result = { inserted, updated: res.rowCount! - inserted, invalid, unknownSymbols };
  await logAudit({ userId: s.userId, role: s.role, action: "PRICES_UPLOAD", entity: "price_history", details: { inserted, updated: result.updated, invalid: invalid.length, unknownSymbols } });
  return json(result, 201);
});
