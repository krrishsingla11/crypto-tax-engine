import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

// GET: rules for a country (defaults to the logged-in user's country; admin/auditor may pass ?country=).
export const GET = withAuth("any", async (req, _ctx, s) => {
  const sp = new URL(req.url).searchParams;
  let country = sp.get("country")?.toUpperCase();
  if (!country || s.role === "user") {
    const u = await pool.query(`SELECT country FROM app_user WHERE user_id = $1`, [s.userId]);
    country = u.rows[0].country.trim();
  }
  const { rows } = await pool.query(
    `SELECT rule_id, country, financial_year, term, long_term_days, rate, description
       FROM tax_rule WHERE country = $1 ORDER BY financial_year DESC, term`,
    [country],
  );
  return json({ country, rules: rows });
});

// "2026-27": the second part must be the year after the first
export const fyString = z.string().regex(/^\d{4}-\d{2}$/, "use format 2026-27").refine(
  (v) => (Number(v.slice(0, 4)) + 1) % 100 === Number(v.slice(5)),
  "second part must be the following year (2026-27)",
);

const Body = z.object({
  country: z.string().trim().length(2).toUpperCase(),
  financialYear: fyString,
  term: z.enum(["SHORT", "LONG"]),
  longTermDays: z.number().int().min(1).max(3650).default(365),
  rate: z.number().min(0).max(100),
  description: z.string().max(200).optional(),
});

export const POST = withAuth(["admin"], async (req, _ctx, s) => {
  const b = Body.parse(await req.json());
  try {
    const { rows } = await pool.query(
      `INSERT INTO tax_rule (country, financial_year, term, long_term_days, rate, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [b.country, b.financialYear, b.term, b.longTermDays, b.rate, b.description ?? null],
    );
    await logAudit({ userId: s.userId, role: s.role, action: "TAX_RULE_CREATE", entity: "tax_rule", entityId: rows[0].rule_id, details: b });
    return json({ rule: rows[0] }, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return fail("A rule for that country, year and term already exists", 409);
    throw e;
  }
});
