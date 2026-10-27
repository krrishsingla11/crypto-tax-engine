import { pool } from "@/lib/pg";
import { json, targetUserId, withAuth } from "@/lib/api";

export const GET = withAuth("any", async (req, _ctx, s) => {
  const uid = targetUserId(req, s);
  const [holdings, summary, lots] = await Promise.all([
    pool.query(`SELECT symbol, name, quantity, avg_cost_basis, latest_price, market_value, cost_value, unrealized_gain
                  FROM v_portfolio_valuation WHERE user_id = $1 ORDER BY market_value DESC`, [uid]),
    pool.query(`SELECT portfolio_value, portfolio_cost, unrealized_gain, realized_gain FROM v_user_summary WHERE user_id = $1`, [uid]),
    pool.query(`SELECT symbol, lot_id, acquired_at, remaining_qty, unit_cost, unrealized_gain, term_if_sold_today
                  FROM v_unrealized_gains WHERE user_id = $1 ORDER BY symbol, acquired_at`, [uid]),
  ]);
  return json({ summary: summary.rows[0] ?? null, holdings: holdings.rows, openLots: lots.rows });
});
