"use client";
import { useMemo, useState } from "react";
import { useFetch } from "@/lib/client";
import { dateTime } from "@/lib/format";
import { actionColor, EventsChart, ImportsChart, type DayEvent, type PlatformRow } from "./Charts";

type Analytics = {
  importsByPlatform: PlatformRow[];
  eventsPerDay: DayEvent[];
  topUsers: { user_id: number; events: number; lastSeen: string; distinctActions: number }[];
  actionTotals: { action: string; count: number }[];
};
type Log = { id: string; ts: string; user_id: number | null; role: string | null; action: string; entity: string | null; entity_id: string | number | null; details: Record<string, unknown> };
type UserRow = { user_id: number; name: string; role: string };

const field = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500";
const lbl = "mb-1 block text-xs font-medium text-slate-600";

type Filters = { action: string; userId: string; from: string; to: string };
const EMPTY: Filters = { action: "", userId: "", from: "", to: "" };

function logQuery(f: Filters) {
  const p = new URLSearchParams({ limit: "100" });
  if (f.action) p.set("action", f.action);
  if (f.userId) p.set("userId", f.userId);
  if (f.from) p.set("from", `${f.from}T00:00:00+05:30`);
  if (f.to) {
    const next = new Date(`${f.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    p.set("to", `${next.toISOString().slice(0, 10)}T00:00:00+05:30`);
  }
  return p.toString();
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function AuditPanel() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const stats = useFetch<Analytics>("/api/analytics");
  const logs = useFetch<{ total: number; logs: Log[] }>(`/api/audit-logs?${logQuery(filters)}`);
  const users = useFetch<{ users: UserRow[] }>("/api/admin/users");

  const names = useMemo(() => new Map((users.data?.users ?? []).map((u) => [u.user_id, u.name])), [users.data]);
  const who = (id: number | null) => (id === null ? "anonymous" : names.get(id) ? `${names.get(id)} (#${id})` : `#${id}`);

  const a = stats.data;
  const totalEvents = a?.actionTotals.reduce((s, x) => s + x.count, 0) ?? 0;
  const failedLogins = a?.actionTotals.find((x) => x.action === "LOGIN_FAILED")?.count ?? 0;
  const imp = (s: string) => a?.importsByPlatform.filter((x) => x.status === s).reduce((n, x) => n + x.rows, 0) ?? 0;
  const actionOptions = a?.actionTotals.map((x) => x.action).sort() ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit &amp; analytics</h1>
        <p className="text-sm text-slate-500">Events and CSV imports stored in MongoDB, summarised with aggregation pipelines</p>
      </div>

      {stats.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{stats.error}</p>}
      {stats.loading && <p className="text-sm text-slate-500">Loading…</p>}

      {a && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Audit events" value={totalEvents} />
            <Stat label="Failed logins" value={failedLogins} tone={failedLogins ? "text-rose-600" : undefined} />
            <Stat label="Import rows OK" value={imp("imported")} tone="text-emerald-600" />
            <Stat label="Import rows failed" value={imp("error")} tone={imp("error") ? "text-rose-600" : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Events per day <span className="font-normal text-slate-500">(last 14 days)</span></h2>
              {a.eventsPerDay.length ? <EventsChart events={a.eventsPerDay} /> : <p className="py-6 text-center text-sm text-slate-500">No events in the last 30 days.</p>}
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Imports by exchange</h2>
              <ImportsChart data={a.importsByPlatform} />
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Most active users</h2>
              {a.topUsers.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">No activity yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 text-left font-medium">User</th><th className="px-3 py-2 text-right font-medium">Events</th><th className="px-3 py-2 text-right font-medium">Action types</th><th className="px-3 py-2 text-left font-medium">Last seen</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.topUsers.map((u) => (
                      <tr key={u.user_id}>
                        <td className="px-3 py-2.5 font-medium">{who(u.user_id)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{u.events}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{u.distinctActions}</td>
                        <td className="px-3 py-2.5 text-slate-500">{dateTime(u.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Events by action</h2>
              <ul className="space-y-2">
                {a.actionTotals.map((x) => (
                  <li key={x.action} className="text-sm">
                    <div className="mb-0.5 flex justify-between"><span>{x.action}</span><span className="tabular-nums text-slate-500">{x.count}</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${(x.count / (a.actionTotals[0]?.count || 1)) * 100}%`, background: actionColor(x.action) }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Audit log</h2>
          <form onSubmit={(e) => { e.preventDefault(); setFilters(draft); }} className="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-6">
            <div><label className={lbl}>Action</label>
              <select value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} className={`${field} w-full`}>
                <option value="">All</option>{actionOptions.map((x) => <option key={x}>{x}</option>)}
              </select></div>
            <div><label className={lbl}>User ID</label>
              <input value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })} inputMode="numeric" className={`${field} w-full`} /></div>
            <div><label className={lbl}>From</label><input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${field} w-full`} /></div>
            <div><label className={lbl}>To</label><input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${field} w-full`} /></div>
            <div className="col-span-2 flex gap-2">
              <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Filter</button>
              <button type="button" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Reset</button>
            </div>
          </form>
        </div>
        {logs.error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{logs.error}</p>}
        {logs.loading && <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>}
        {logs.data && (logs.data.logs.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No events match.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2 text-left font-medium">When</th><th className="px-3 py-2 text-left font-medium">User</th><th className="px-3 py-2 text-left font-medium">Action</th><th className="px-3 py-2 text-left font-medium">Entity</th><th className="px-3 py-2 text-left font-medium">Details</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.data.logs.map((l) => {
                  const d = JSON.stringify(l.details ?? {});
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateTime(l.ts)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{who(l.user_id)}{l.role && <span className="ml-1 text-xs text-slate-400">{l.role}</span>}</td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="h-2 w-2 rounded-full" style={{ background: actionColor(l.action) }} />{l.action}</span></td>
                      <td className="px-3 py-2.5 text-slate-600">{l.entity ? `${l.entity}${l.entity_id !== null ? ` #${l.entity_id}` : ""}` : "–"}</td>
                      <td className="max-w-xs truncate px-3 py-2.5 font-mono text-xs text-slate-500" title={d}>{d === "{}" ? "" : d}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {logs.data && <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">Showing {logs.data.logs.length} of {logs.data.total} matching events (newest first)</p>}
      </section>
    </div>
  );
}
