import { pool } from "@/lib/pg";
import { json, withAuth } from "@/lib/api";

export const GET = withAuth("any", async (_req, _ctx, s) => {
  const { rows } = await pool.query(
    `SELECT user_id, name, email, role, cost_method, country FROM app_user WHERE user_id = $1`,
    [s.userId],
  );
  return json({ user: rows[0] });
});
