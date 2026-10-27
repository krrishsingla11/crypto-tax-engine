import { getMongoDb } from "@/lib/mongo";
import { COLL } from "@/lib/audit";
import { fail, json, withAuth } from "@/lib/api";

// One import with every raw row and its outcome.
export const GET = withAuth("any", async (_req, ctx, s) => {
  const { id } = await ctx.params;
  const doc = await (await getMongoDb()).collection(COLL.imports).findOne({ import_id: id });
  if (!doc || (s.role === "user" && doc.user_id !== s.userId)) return fail("Import not found", 404);
  const { _id, ...rest } = doc;
  return json({ import: { ...rest, id: String(_id) } });
});
