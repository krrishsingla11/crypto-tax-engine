import { pool } from "@/lib/pg";
import { fail, json, withAuth } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Deleting rolls lots/holdings back via DB triggers (blocked if units from a BUY were already sold).
export const DELETE = withAuth(["user"], async (_req, ctx, s) => {
  const { id } = await ctx.params;
  const { rowCount } = await pool.query(
    `DELETE FROM txn
      WHERE txn_id = $1
        AND wallet_id IN (SELECT wallet_id FROM wallet_exchange WHERE user_id = $2)`,
    [Number(id), s.userId],
  );
  if (!rowCount) return fail("Transaction not found", 404);
  await logAudit({ userId: s.userId, role: s.role, action: "TXN_DELETE", entity: "txn", entityId: id });
  return json({ ok: true });
});
