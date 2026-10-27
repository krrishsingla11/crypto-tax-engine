import { getMongoDb } from "@/lib/mongo";
import { COLL, ensureMongoIndexes } from "@/lib/audit";
import { json, withAuth } from "@/lib/api";

// MongoDB aggregation pipelines (the NoSQL advanced feature). Only admin and auditor.
export const GET = withAuth(["admin", "auditor"], async () => {
  await ensureMongoIndexes();
  const db = await getMongoDb();

  const [importsByPlatform, eventsPerDay, topUsers, actionTotals] = await Promise.all([
    // 1. rows per platform and outcome, across all uploaded CSVs
    db.collection(COLL.imports).aggregate([
      { $unwind: "$rows" },
      { $group: { _id: { platform: "$platform", status: "$rows.status" }, rows: { $sum: 1 }, files: { $addToSet: "$import_id" } } },
      { $project: { _id: 0, platform: "$_id.platform", status: "$_id.status", rows: 1, files: { $size: "$files" } } },
      { $sort: { platform: 1, status: 1 } },
    ]).toArray(),

    // 2. events per day and action (IST days), last 30 days
    db.collection(COLL.audit).aggregate([
      { $match: { ts: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$ts", timezone: "Asia/Kolkata" } }, action: "$action" }, count: { $sum: 1 } } },
      { $project: { _id: 0, day: "$_id.day", action: "$_id.action", count: 1 } },
      { $sort: { day: -1, action: 1 } },
    ]).toArray(),

    // 3. most active users
    db.collection(COLL.audit).aggregate([
      { $match: { user_id: { $ne: null } } },
      { $group: { _id: "$user_id", events: { $sum: 1 }, lastSeen: { $max: "$ts" }, actions: { $addToSet: "$action" } } },
      { $project: { _id: 0, user_id: "$_id", events: 1, lastSeen: 1, distinctActions: { $size: "$actions" } } },
      { $sort: { events: -1 } },
      { $limit: 5 },
    ]).toArray(),

    // 4. totals by action
    db.collection(COLL.audit).aggregate([
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $project: { _id: 0, action: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray(),
  ]);

  return json({ importsByPlatform, eventsPerDay, topUsers, actionTotals });
});
