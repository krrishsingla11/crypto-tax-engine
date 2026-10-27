import { getMongoDb } from "./mongo";

/** Collections used in MongoDB (database: cryptotax):
 *   raw_imports : one document per uploaded CSV, raw rows kept exactly as the exchange exported them
 *   audit_logs  : append-only event trail (who did what, when)
 */
export const COLL = { imports: "raw_imports", audit: "audit_logs" } as const;

let indexes: Promise<void> | null = null;

/** Creates the indexes once per server process (idempotent). */
export function ensureMongoIndexes(): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      const db = await getMongoDb();
      await Promise.all([
        db.collection(COLL.audit).createIndex({ user_id: 1, ts: -1 }),
        db.collection(COLL.audit).createIndex({ action: 1, ts: -1 }),
        db.collection(COLL.imports).createIndex({ user_id: 1, uploaded_at: -1 }),
        db.collection(COLL.imports).createIndex({ import_id: 1 }, { unique: true }),
        db.collection(COLL.imports).createIndex({ platform: 1 }),
      ]);
    })().catch((e) => {
      indexes = null; // retry next time
      throw e;
    });
  }
  return indexes;
}

export type AuditEvent = {
  userId: number | null;
  role?: string;
  action: string; // LOGIN, LOGIN_FAILED, REGISTER, TXN_CREATE, TXN_DELETE, WALLET_CREATE, IMPORT, TAX_REPORT, ...
  entity?: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
};

/** Fire-and-forget: an audit failure must never break the user's request. */
export async function logAudit(e: AuditEvent): Promise<void> {
  try {
    await ensureMongoIndexes();
    const db = await getMongoDb();
    await db.collection(COLL.audit).insertOne({
      ts: new Date(),
      user_id: e.userId,
      role: e.role ?? null,
      action: e.action,
      entity: e.entity ?? null,
      entity_id: e.entityId ?? null,
      details: e.details ?? {},
    });
  } catch (err) {
    console.error("audit log failed:", (err as Error).message);
  }
}
