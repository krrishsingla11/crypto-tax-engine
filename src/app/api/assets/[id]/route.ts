import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  assetType: z.enum(["crypto", "stablecoin", "token"]),
});

export const PUT = withAuth(["admin"], async (req, ctx, s) => {
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(`UPDATE asset SET name = $2, asset_type = $3 WHERE asset_id = $1 RETURNING *`, [Number(id), b.name, b.assetType]);
  if (!rows.length) return fail("Asset not found", 404);
  await logAudit({ userId: s.userId, role: s.role, action: "ASSET_UPDATE", entity: "asset", entityId: id, details: b });
  return json({ asset: rows[0] });
});

// An asset that has transactions / lots can't be deleted (foreign keys); its prices are removed with it.
export const DELETE = withAuth(["admin"], async (_req, ctx, s) => {
  const { id } = await ctx.params;
  try {
    const { rows } = await pool.query(`DELETE FROM asset WHERE asset_id = $1 RETURNING symbol`, [Number(id)]);
    if (!rows.length) return fail("Asset not found", 404);
    await logAudit({ userId: s.userId, role: s.role, action: "ASSET_DELETE", entity: "asset", entityId: id, details: rows[0] });
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return fail("Asset is used by transactions and can't be deleted", 409);
    throw e;
  }
});
