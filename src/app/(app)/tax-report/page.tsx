import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import TaxReport from "@/components/TaxReport";

export default async function TaxReportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <TaxReport role={session.role} />;
}
