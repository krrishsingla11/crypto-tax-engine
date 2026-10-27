import { getMongoDb } from "@/lib/mongo";
import { COLL, ensureMongoIndexes } from "@/lib/audit";
import { json, targetUserId, withAuth } from "@/lib/api";

// Import history from MongoDB (without the raw rows).
export const GET = withAuth("any", async (req, _ctx, s) => {
  await ensureMongoIndexes();
  const docs = await (await getMongoDb()).collection(COLL.imports)
    .find({ user_id: targetUserId(req, s) }, { projection: { rows: 0 } })
    .sort({ uploaded_at: -1 }).limit(20).toArray();
  return json({ imports: docs.map(({ _id, ...d }) => ({ ...d, id: String(_id) })) });
});
