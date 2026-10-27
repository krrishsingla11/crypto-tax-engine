import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

const Body = z.object({
  longTermDays: z.number().int().min(1).max(3650),
  rate: z.number().min(0).max(100),
  description: z.string().max(200).nullable().optional(),
});

// Country / year / term identify a rule and can't be edited; delete and re-create instead.
export const PUT = withAuth(["admin"], async (req, ctx, s) => {
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(
    `UPDATE tax_rule SET long_term_days = $2, rate = $3, description = $4 WHERE rule_id = $1 RETURNING *`,
    [Number(id), b.longTermDays, b.rate, b.description ?? null],
  );
  if (!rows.length) return fail("Rule not found", 404);
  await logAudit({ userId: s.userId, role: s.role, action: "TAX_RULE_UPDATE", entity: "tax_rule", entityId: id, details: b });
  return json({ rule: rows[0] });
});

export const DELETE = withAuth(["admin"], async (_req, ctx, s) => {
  const { id } = await ctx.params;
  const { rows } = await pool.query(`DELETE FROM tax_rule WHERE rule_id = $1 RETURNING country, financial_year, term`, [Number(id)]);
  if (!rows.length) return fail("Rule not found", 404);
  await logAudit({ userId: s.userId, role: s.role, action: "TAX_RULE_DELETE", entity: "tax_rule", entityId: id, details: rows[0] });
  return json({ ok: true });
});
