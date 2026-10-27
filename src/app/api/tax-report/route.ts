import { z } from "zod";
import { pool } from "@/lib/pg";
import { json, targetUserId, withAuth } from "@/lib/api";

export const GET = withAuth("any", async (req, _ctx, s) => {
  const { rows } = await pool.query(
    `SELECT report_id, financial_year, short_term_gain, long_term_gain, tax_payable, generated_at
       FROM tax_report WHERE user_id = $1 ORDER BY financial_year DESC`,
    [targetUserId(req, s)],
  );
  return json({ reports: rows });
});

const Body = z.object({ financialYear: z.string().regex(/^\d{4}-\d{2}$/, "use format 2026-27") });

// Runs the generate_tax_report() stored function (upsert) for the logged-in user.
export const POST = withAuth(["user"], async (req, _ctx, s) => {
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(`SELECT * FROM generate_tax_report($1, $2)`, [s.userId, b.financialYear]);
  return json({ report: rows[0] }, 201);
});
