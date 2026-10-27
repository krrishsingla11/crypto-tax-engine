import { getMongoDb } from "@/lib/mongo";
import { COLL, ensureMongoIndexes } from "@/lib/audit";
import { json, withAuth } from "@/lib/api";

// Filterable audit trail. Only admin and auditor.
export const GET = withAuth(["admin", "auditor"], async (req) => {
  await ensureMongoIndexes();
  const sp = new URL(req.url).searchParams;
  const q: Record<string, unknown> = {};
  if (sp.get("action")) q.action = sp.get("action");
  if (sp.get("userId")) q.user_id = Number(sp.get("userId"));
  if (sp.get("from") || sp.get("to")) {
    q.ts = {
      ...(sp.get("from") ? { $gte: new Date(sp.get("from")!) } : {}),
      ...(sp.get("to") ? { $lt: new Date(sp.get("to")!) } : {}),
    };
  }
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);
  const coll = (await getMongoDb()).collection(COLL.audit);
  const [logs, total] = await Promise.all([
    coll.find(q).sort({ ts: -1 }).limit(limit).toArray(),
    coll.countDocuments(q),
  ]);
  return json({ total, logs: logs.map(({ _id, ...l }) => ({ id: String(_id), ...l })) });
});
