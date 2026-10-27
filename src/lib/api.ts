import { ZodError } from "zod";
import { getSession, type Role, type Session } from "./auth";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: Ctx, session: Session) => Promise<Response>;

/** Wraps a route handler: checks login + role, maps validation / DB errors to clean JSON. */
export function withAuth(roles: Role[] | "any", handler: Handler) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) return fail("Not authenticated", 401);
      if (roles !== "any" && !roles.includes(session.role)) return fail("Forbidden", 403);
      return await handler(req, ctx, session);
    } catch (e) {
      return handleError(e);
    }
  };
}

/** For public routes (login / register) that still want the same error mapping. */
export function publicRoute(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

export function handleError(e: unknown): Response {
  if (e instanceof ZodError) {
    return fail(e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 400);
  }
  if (e instanceof SyntaxError) return fail("Invalid JSON body", 400);

  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case "23505": return fail("Already exists (duplicate value)", 409);
    case "23503": return fail("Referenced record does not exist", 400);
    case "23514": // CHECK violation, includes our oversell guard
    case "P0001": // RAISE EXCEPTION from triggers/procedures
    case "23502": // NOT NULL
      return fail(err.message ?? "Rejected by database", 400);
    case "22P02": case "22003": case "22007": return fail("Invalid value format", 400);
  }
  console.error(e);
  return fail("Internal server error", 500);
}

/** Users only ever see their own data; admin/auditor may pass ?userId=. */
export function targetUserId(req: Request, session: Session): number {
  if (session.role === "user") return session.userId;
  const q = new URL(req.url).searchParams.get("userId");
  return q ? Number(q) : session.userId;
}

/** Decimal string that keeps full precision (no float rounding). */
export const decimalString = (max = 10) =>
  new RegExp(`^\\d+(\\.\\d{1,${max}})?$`);
