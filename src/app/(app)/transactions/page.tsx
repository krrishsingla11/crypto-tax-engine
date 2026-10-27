import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Transactions from "@/components/Transactions";

export default async function TransactionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <Transactions role={session.role} />;
}
