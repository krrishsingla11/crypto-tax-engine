import { pool } from "@/lib/pg";
import { fail, json, targetUserId, withAuth } from "@/lib/api";

// Report + every disposal that feeds it (for the detail table / CSV export).
export const GET = withAuth("any", async (req, ctx, s) => {
  const { fy } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(fy)) return fail("Invalid financial year", 400);
  const uid = targetUserId(req, s);

  const [report, disposals] = await Promise.all([
    pool.query(`SELECT * FROM tax_report WHERE user_id = $1 AND financial_year = $2`, [uid, fy]),
    pool.query(`SELECT symbol, sell_txn_id, lot_id, qty_consumed, proceeds, cost_basis, gain, term, disposed_at
                  FROM v_realized_gains WHERE user_id = $1 AND financial_year = $2 ORDER BY disposed_at, lot_id`, [uid, fy]),
  ]);
  if (!report.rowCount) return fail("No report generated for this year yet", 404);
  return json({ report: report.rows[0], disposals: disposals.rows });
});
