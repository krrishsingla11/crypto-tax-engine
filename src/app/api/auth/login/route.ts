import { z } from "zod";
import { pool } from "@/lib/pg";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, json, publicRoute } from "@/lib/api";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const POST = publicRoute(async (req) => {
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(
    `SELECT user_id, name, email, role, cost_method, password_hash FROM app_user WHERE email = $1`,
    [b.email],
  );
  const u = rows[0];
  // same message for unknown email and wrong password
  if (!u || !(await verifyPassword(b.password, u.password_hash))) {
    return fail("Invalid email or password", 401);
  }
  await createSession({ userId: u.user_id, role: u.role, name: u.name });
  const { password_hash: _omit, ...user } = u;
  return json({ user });
});
