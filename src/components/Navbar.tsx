"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Role = "user" | "admin" | "auditor";

// Add entries here as pages get built. `roles` controls who sees the link.
const LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["user", "admin", "auditor"] },
  { href: "/transactions", label: "Transactions", roles: ["user", "admin", "auditor"] },
];

export default function Navbar({ name, role }: { name: string; role: Role }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm text-white">₿</span>
            CryptoTax
          </Link>
          <nav className="flex gap-1">
            {LINKS.filter((l) => l.roles.includes(role)).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname.startsWith(l.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{role}</span>
          <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
