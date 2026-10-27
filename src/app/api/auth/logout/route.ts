import { destroySession } from "@/lib/auth";
import { json, publicRoute } from "@/lib/api";

export const POST = publicRoute(async () => {
  await destroySession();
  return json({ ok: true });
});
