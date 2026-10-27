import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

const Body = z.object({ role: z.enum(["user", "admin", "auditor"]) });

// Admin changes a user's role. You can't change your own role (prevents locking yourself out).
export const PATCH = withAuth(["admin"], async (req, ctx, s) => {
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  if (Number(id) === s.userId) return fail("You can't change your own role", 400);
  const { rows } = await pool.query(
    `UPDATE app_user SET role = $2 WHERE user_id = $1 RETURNING user_id, name, email, role`,
    [Number(id), b.role],
  );
  if (!rows.length) return fail("User not found", 404);
  await logAudit({ userId: s.userId, role: s.role, action: "USER_ROLE_CHANGE", entity: "app_user", entityId: id, details: { newRole: b.role } });
  return json({ user: rows[0] });
});
