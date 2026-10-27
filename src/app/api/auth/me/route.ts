import { z } from "zod";
import { pool } from "@/lib/pg";
import { logAudit } from "@/lib/audit";
import { json, withAuth } from "@/lib/api";

export const GET = withAuth("any", async (_req, _ctx, s) => {
  const { rows } = await pool.query(
    `SELECT user_id, name, email, role, cost_method, country FROM app_user WHERE user_id = $1`,
    [s.userId],
  );
  return json({ user: rows[0] });
});

const Body = z.object({ costMethod: z.enum(["FIFO", "LIFO", "WAVG"]) });

// Cost-basis method used to match FUTURE sales to lots. Past disposals are not recalculated.
export const PATCH = withAuth("any", async (req, _ctx, s) => {
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(
    `UPDATE app_user SET cost_method = $2 WHERE user_id = $1 RETURNING user_id, name, email, role, cost_method, country`,
    [s.userId, b.costMethod],
  );
  await logAudit({ userId: s.userId, role: s.role, action: "COST_METHOD_CHANGE", entity: "app_user", entityId: s.userId, details: { costMethod: b.costMethod } });
  return json({ user: rows[0] });
});
