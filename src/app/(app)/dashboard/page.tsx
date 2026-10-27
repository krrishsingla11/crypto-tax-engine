import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function DashboardPage() {
  // Next renders the layout and page in parallel, so the page must guard itself too.
  const session = await getSession();
  if (!session) redirect("/login");
  return <Dashboard role={session.role} />;
}
