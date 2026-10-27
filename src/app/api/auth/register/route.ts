import { z } from "zod";
import { pool } from "@/lib/pg";
import { createSession, hashPassword } from "@/lib/auth";
import { json, publicRoute } from "@/lib/api";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8, "at least 8 characters").max(72),
  taxId: z.string().trim().max(20).optional(),
  country: z.string().length(2).toUpperCase().default("IN"),
});

export const POST = publicRoute(async (req) => {
  const b = Body.parse(await req.json());
  const hash = await hashPassword(b.password);

  // role is NEVER taken from the client: self-registration is always 'user'
  const { rows } = await pool.query(
    `INSERT INTO app_user (name, email, password_hash, tax_id, country, role)
     VALUES ($1, $2, $3, $4, $5, 'user')
     RETURNING user_id, name, email, role, cost_method`,
    [b.name, b.email, hash, b.taxId ?? null, b.country],
  );
  const u = rows[0];
  await createSession({ userId: u.user_id, role: u.role, name: u.name });
  return json({ user: u }, 201);
});
