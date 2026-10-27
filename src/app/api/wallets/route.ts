import { z } from "zod";
import { pool } from "@/lib/pg";
import { json, targetUserId, withAuth } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const GET = withAuth("any", async (req, _ctx, s) => {
  const { rows } = await pool.query(
    `SELECT wallet_id, platform_name, wallet_type, created_at
       FROM wallet_exchange WHERE user_id = $1 ORDER BY platform_name`,
    [targetUserId(req, s)],
  );
  return json({ wallets: rows });
});

const Body = z.object({
  platformName: z.string().trim().min(1).max(60),
  walletType: z.enum(["exchange", "hot", "cold"]),
});

export const POST = withAuth(["user"], async (req, _ctx, s) => {
  const b = Body.parse(await req.json());
  const { rows } = await pool.query(
    `INSERT INTO wallet_exchange (user_id, platform_name, wallet_type)
     VALUES ($1, $2, $3) RETURNING wallet_id, platform_name, wallet_type`,
    [s.userId, b.platformName, b.walletType],
  );
  await logAudit({ userId: s.userId, role: s.role, action: "WALLET_CREATE", entity: "wallet_exchange", entityId: rows[0].wallet_id, details: { platform: b.platformName } });
  return json({ wallet: rows[0] }, 201);
});
