import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminPanel from "@/components/admin/AdminPanel";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard"); // the API enforces this again
  return <AdminPanel selfId={session.userId} />;
}
