import { z } from "zod";
import { pool } from "@/lib/pg";
import { json, withAuth } from "@/lib/api";

// Prefix full-text search (uses the GIN index): /api/assets?q=bit
export const GET = withAuth("any", async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[^a-zA-Z0-9]/g, "");
  const { rows } = q
    ? await pool.query(
        `SELECT asset_id, symbol, name, asset_type FROM asset
          WHERE to_tsvector('simple', symbol || ' ' || name) @@ to_tsquery('simple', $1 || ':*')
          ORDER BY symbol`, [q])
    : await pool.query(`SELECT asset_id, symbol, name, asset_type FROM asset ORDER BY symbol`);
  return json({ assets: rows });
});

const Body = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(12),
  name: z.string().trim().min(1).max(80),
  assetType: z.enum(["crypto", "stablecoin", "token"]).default("crypto"),
});

export const POST = withAuth(["admin"], async (req) => {
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(
    `INSERT INTO asset (symbol, name, asset_type) VALUES ($1, $2, $3) RETURNING *`,
    [b.symbol, b.name, b.assetType],
  );
  return json({ asset: rows[0] }, 201);
});
