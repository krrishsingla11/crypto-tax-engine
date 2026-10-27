import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { RegisterForm } from "@/components/AuthForms";

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  return <RegisterForm />;
}
