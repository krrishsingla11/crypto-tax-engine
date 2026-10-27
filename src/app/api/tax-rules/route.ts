import { pool } from "@/lib/pg";
import { json, withAuth } from "@/lib/api";

// Rules for a country (defaults to the logged-in user's country). Read-only here;
// the admin screens add create / update / delete.
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
