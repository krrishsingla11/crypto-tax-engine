"use client";
import { useMemo, useState } from "react";
import { api, useFetch } from "@/lib/client";
import { dateOnly, dateTime, gainColor, money, qty, signedMoney } from "@/lib/format";

type Report = { report_id: number; financial_year: string; short_term_gain: string; long_term_gain: string; tax_payable: string; generated_at: string };
type Disposal = {
  symbol: string; sell_txn_id: string; lot_id: string; qty_consumed: string; proceeds: string;
  cost_basis: string; gain: string; term: "SHORT" | "LONG"; disposed_at: string;
};
type Rule = { rule_id: number; financial_year: string; term: "SHORT" | "LONG"; rate: string; long_term_days: number };

/** Current Indian financial year label, e.g. 2026-27 (1 Apr - 31 Mar, IST). */
function currentFy() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

function downloadCsv(fy: string, rows: Disposal[]) {
  const head = ["Asset", "Sold on", "Sell txn", "Lot", "Quantity", "Proceeds", "Cost basis", "Gain", "Term"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((d) =>
    [d.symbol, new Date(d.disposed_at).toISOString(), d.sell_txn_id, d.lot_id, d.qty_consumed, d.proceeds, d.cost_basis, d.gain, d.term].map(esc).join(","),
  );
  const blob = new Blob([[head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tax-report-${fy}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${right ? "text-right" : "text-left"}`}>{children}</th>
);

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function TaxReport({ role }: { role: "user" | "admin" | "auditor" }) {
  const canGenerate = role === "user";
  const [viewDraft, setViewDraft] = useState("");
  const [viewUser, setViewUser] = useState("");
  const [chosenFy, setChosenFy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const uq = viewUser ? `?userId=${encodeURIComponent(viewUser)}` : "";

  const rules = useFetch<{ country: string; rules: Rule[] }>("/api/tax-rules");
  const me = useFetch<{ user: { cost_method: "FIFO" | "LIFO" | "WAVG" } }>("/api/auth/me");
  const list = useFetch<{ reports: Report[] }>(`/api/tax-report${uq}`);

  const years = useMemo(() => {
    const set = new Set<string>([currentFy()]);
    rules.data?.rules.forEach((r) => set.add(r.financial_year));
    list.data?.reports.forEach((r) => set.add(r.financial_year));
    return [...set].sort().reverse();
  }, [rules.data, list.data]);

  const fy = chosenFy || (years.includes(currentFy()) ? currentFy() : years[0]);
  const detail = useFetch<{ report: Report; disposals: Disposal[] }>(`/api/tax-report/${fy}${uq}`);
  const notGenerated = detail.error?.startsWith("No report generated");
  const fyRules = (rules.data?.rules ?? []).filter((r) => r.financial_year === fy);
  const rate = (t: "SHORT" | "LONG") => fyRules.find((r) => r.term === t)?.rate;

  const byAsset = useMemo(() => {
    const m = new Map<string, { gain: number; st: number; lt: number }>();
    (detail.data?.disposals ?? []).forEach((d) => {
      const e = m.get(d.symbol) ?? { gain: 0, st: 0, lt: 0 };
      e.gain += Number(d.gain);
      if (d.term === "SHORT") e.st += Number(d.gain); else e.lt += Number(d.gain);
      m.set(d.symbol, e);
    });
    return [...m.entries()].sort((a, b) => b[1].gain - a[1].gain);
  }, [detail.data]);

  async function changeMethod(costMethod: string) {
    setMsg(null);
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ costMethod }) });
      setMsg({ ok: true, text: `Cost-basis method set to ${costMethod}. It applies to sales you record from now on.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      me.reload();
    }
  }

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/tax-report", { method: "POST", body: JSON.stringify({ financialYear: fy }) });
      setMsg({ ok: true, text: `Report for FY ${fy} generated.` });
      detail.reload();
      list.reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const r = detail.data?.report;
  const disposals = detail.data?.disposals ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tax report</h1>
          <p className="text-sm text-slate-500">Capital gains on every disposal, matched lot by lot, taxed at the configured rates</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!canGenerate && (
            <form onSubmit={(e) => { e.preventDefault(); setViewUser(viewDraft.trim()); }} className="flex items-center gap-2 text-sm">
              <label className="text-slate-600">View user ID</label>
              <input value={viewDraft} onChange={(e) => setViewDraft(e.target.value)} inputMode="numeric" placeholder="e.g. 3"
                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5" />
              <button className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">Load</button>
            </form>
          )}
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Financial year</label>
            <select value={fy} onChange={(e) => { setChosenFy(e.target.value); setMsg(null); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          {canGenerate && me.data && (
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-600">Cost basis</label>
              <select value={me.data.user.cost_method} onChange={(e) => changeMethod(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm" title="How a sale is matched to your purchase lots. Applies to future sales.">
                <option value="FIFO">FIFO</option><option value="LIFO">LIFO</option><option value="WAVG">Weighted avg</option>
              </select>
            </div>
          )}
          {canGenerate && (
            <button onClick={generate} disabled={busy} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "Calculating…" : r ? "Regenerate" : "Generate report"}
            </button>
          )}
        </div>
      </div>

      {msg && <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      {detail.error && !notGenerated && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{detail.error}</p>}
      {detail.loading && <p className="text-sm text-slate-500">Loading…</p>}

      {notGenerated && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
          No report for FY {fy} yet.{canGenerate ? " Press “Generate report” to calculate it from your transactions." : ""}
        </div>
      )}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Short-term gain" value={signedMoney(r.short_term_gain)} tone={gainColor(r.short_term_gain)}
              sub={rate("SHORT") ? `taxed at ${Number(rate("SHORT"))}%` : undefined} />
            <Stat label="Long-term gain" value={signedMoney(r.long_term_gain)} tone={gainColor(r.long_term_gain)}
              sub={rate("LONG") ? `held over ${fyRules.find((x) => x.term === "LONG")?.long_term_days} days · taxed at ${Number(rate("LONG"))}%` : undefined} />
            <Stat label="Total realized" value={signedMoney(Number(r.short_term_gain) + Number(r.long_term_gain))} tone={gainColor(Number(r.short_term_gain) + Number(r.long_term_gain))} />
            <Stat label="Estimated tax payable" value={money(r.tax_payable)} tone="text-indigo-700" sub={`generated ${dateTime(r.generated_at)}`} />
          </div>
          <p className="text-xs text-slate-500">
            Estimate only. Gains are netted within each term; a net loss in one term is not set off against the other and produces no tax.
            Regenerate after adding or deleting transactions.
          </p>

          {byAsset.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">By asset</h2>
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><Th>Asset</Th><Th right>Short-term</Th><Th right>Long-term</Th><Th right>Total</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {byAsset.map(([sym, v]) => (
                    <tr key={sym}>
                      <td className="px-3 py-2.5 font-medium">{sym}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(v.st)}`}>{signedMoney(v.st)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(v.lt)}`}>{signedMoney(v.lt)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${gainColor(v.gain)}`}>{signedMoney(v.gain)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Disposals in FY {fy}</h2>
                <p className="text-xs text-slate-500">Each sale split across the lots it consumed</p>
              </div>
              <button disabled={!disposals.length} onClick={() => downloadCsv(fy, disposals)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Export CSV
              </button>
            </div>
            {disposals.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No sales in this financial year.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr><Th>Sold on</Th><Th>Asset</Th><Th right>Quantity</Th><Th right>Proceeds</Th><Th right>Cost basis</Th><Th right>Gain</Th><Th>Term</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {disposals.map((d, i) => (
                      <tr key={`${d.sell_txn_id}-${d.lot_id}-${i}`}>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateOnly(d.disposed_at)}</td>
                        <td className="px-3 py-2.5 font-medium">{d.symbol}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{qty(d.qty_consumed)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(d.proceeds)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(d.cost_basis)}</td>
                        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${gainColor(d.gain)}`}>{signedMoney(d.gain)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.term === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {d.term === "LONG" ? "Long-term" : "Short-term"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {(list.data?.reports.length ?? 0) > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Generated reports</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><Th>Financial year</Th><Th right>Short-term</Th><Th right>Long-term</Th><Th right>Tax payable</Th><Th>Generated</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data!.reports.map((x) => (
                <tr key={x.report_id} onClick={() => setChosenFy(x.financial_year)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium">{x.financial_year}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(x.short_term_gain)}`}>{signedMoney(x.short_term_gain)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(x.long_term_gain)}`}>{signedMoney(x.long_term_gain)}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(x.tax_payable)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{dateTime(x.generated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
