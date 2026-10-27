import { pool } from "@/lib/pg";
import { json, withAuth } from "@/lib/api";

export const GET = withAuth(["admin", "auditor"], async () => {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.role, u.country, u.cost_method, u.created_at,
            (SELECT COUNT(*) FROM txn t JOIN wallet_exchange w ON w.wallet_id = t.wallet_id WHERE w.user_id = u.user_id)::int AS txn_count
       FROM app_user u ORDER BY u.user_id`,
  );
  return json({ users: rows });
});
