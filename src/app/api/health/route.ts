import { pool } from "@/lib/pg";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  const status: Record<string, string> = {};

  try {
    await pool.query("SELECT 1");
    status.postgres = "ok";
  } catch (e) {
    status.postgres = `error: ${(e as Error).message}`;
  }

  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    status.mongo = "ok";
  } catch (e) {
    status.mongo = `error: ${(e as Error).message}`;
  }

  const allOk = Object.values(status).every((s) => s === "ok");
  return Response.json(status, { status: allOk ? 200 : 500 });
}
