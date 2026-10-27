import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AuditPanel from "@/components/audit/AuditPanel";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "user") redirect("/dashboard"); // the API enforces this again
  return <AuditPanel />;
}
