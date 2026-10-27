"use client";
import { useState } from "react";
import { api, useFetch } from "@/lib/client";
import { dateOnly } from "@/lib/format";
import { Banner, Card, Msg, Th, field } from "./ui";

type User = { user_id: number; name: string; email: string; role: "user" | "admin" | "auditor"; country: string; cost_method: string; created_at: string; txn_count: number };

export default function UsersTab({ selfId }: { selfId: number }) {
  const { data, loading, error, reload } = useFetch<{ users: User[] }>("/api/admin/users");
  const [msg, setMsg] = useState<Msg>(null);

  async function setRole(u: User, role: string) {
    setMsg(null);
    try {
      await api(`/api/admin/users/${u.user_id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setMsg({ ok: true, text: `${u.name} is now ${role}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      reload();
    }
  }

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <Card title="Users" subtitle="Roles: user (own data), auditor (read-only across users), admin (reference data and access)">
        {error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {loading && <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>}
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><Th>ID</Th><Th>Name</Th><Th>Email</Th><Th>Country</Th><Th>Cost method</Th><Th right>Txns</Th><Th>Joined</Th><Th>Role</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((u) => (
                  <tr key={u.user_id}>
                    <td className="px-3 py-2.5 text-slate-500">{u.user_id}</td>
                    <td className="px-3 py-2.5 font-medium">{u.name}{u.user_id === selfId && <span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{u.email}</td>
                    <td className="px-3 py-2.5">{u.country}</td>
                    <td className="px-3 py-2.5">{u.cost_method}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.txn_count}</td>
                    <td className="px-3 py-2.5 text-slate-500">{dateOnly(u.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <select value={u.role} disabled={u.user_id === selfId} onChange={(e) => setRole(u, e.target.value)} className={field} aria-label={`role for ${u.name}`}>
                        <option value="user">user</option><option value="auditor">auditor</option><option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
