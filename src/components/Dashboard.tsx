"use client";
import { useState } from "react";
import AllocationDonut from "@/components/AllocationDonut";
import { useFetch } from "@/lib/client";
import { dateOnly, gainColor, money, qty, signedMoney } from "@/lib/format";

type Summary = { portfolio_value: string; portfolio_cost: string; unrealized_gain: string; realized_gain: string };
type Holding = {
  symbol: string; name: string; quantity: string; avg_cost_basis: string;
  latest_price: string; market_value: string; cost_value: string; unrealized_gain: string;
};
type Lot = {
  symbol: string; lot_id: string; acquired_at: string; remaining_qty: string; unit_cost: string;
  unrealized_gain: string; term_if_sold_today: "SHORT" | "LONG";
};
type Portfolio = { summary: Summary | null; holdings: Holding[]; openLots: Lot[] };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${right ? "text-right" : "text-left"}`}>{children}</th>
);

export default function Dashboard({ role }: { role: "user" | "admin" | "auditor" }) {
  const [viewId, setViewId] = useState("");
  const [applied, setApplied] = useState("");
  const url = applied ? `/api/portfolio?userId=${encodeURIComponent(applied)}` : "/api/portfolio";
  const { data, error, loading } = useFetch<Portfolio>(url);

  const holdings = data?.holdings ?? [];
  const s = data?.summary;
  const totalGainPct = s && Number(s.portfolio_cost) > 0 ? (Number(s.unrealized_gain) / Number(s.portfolio_cost)) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Portfolio overview</h1>
          <p className="text-sm text-slate-500">Valued at the latest stored closing prices</p>
        </div>
        {role !== "user" && (
          <form
            onSubmit={(e) => { e.preventDefault(); setApplied(viewId.trim()); }}
            className="flex items-center gap-2 text-sm"
          >
            <label className="text-slate-600">View user ID</label>
            <input
              value={viewId} onChange={(e) => setViewId(e.target.value)} inputMode="numeric"
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5"
              placeholder="e.g. 3"
            />
            <button className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">Load</button>
          </form>
        )}
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Portfolio value" value={money(s?.portfolio_value)} />
            <Stat label="Cost basis" value={money(s?.portfolio_cost)} />
            <Stat
              label={`Unrealized gain${totalGainPct ? ` (${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(1)}%)` : ""}`}
              value={signedMoney(s?.unrealized_gain)}
              tone={gainColor(s?.unrealized_gain)}
            />
            <Stat label="Realized gain (all time)" value={signedMoney(s?.realized_gain)} tone={gainColor(s?.realized_gain)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Holdings</h2>
              {holdings.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No holdings yet. Add a transaction to get started.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr><Th>Asset</Th><Th right>Quantity</Th><Th right>Avg cost</Th><Th right>Price</Th><Th right>Value</Th><Th right>Unrealized</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {holdings.map((h) => (
                        <tr key={h.symbol}>
                          <td className="px-3 py-2.5"><span className="font-medium">{h.symbol}</span> <span className="text-slate-500">{h.name}</span></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{qty(h.quantity)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{money(h.avg_cost_basis)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{money(h.latest_price)}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(h.market_value)}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(h.unrealized_gain)}`}>{signedMoney(h.unrealized_gain)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold">Allocation</h2>
              <AllocationDonut slices={holdings.map((h) => ({ label: h.symbol, value: Number(h.market_value) }))} />
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">Open tax lots</h2>
              <p className="text-xs text-slate-500">Each purchase is tracked as a lot; the label shows how a sale today would be taxed</p>
            </div>
            {(data.openLots ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No open lots.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr><Th>Asset</Th><Th>Acquired</Th><Th right>Remaining</Th><Th right>Unit cost</Th><Th right>Unrealized</Th><Th>If sold today</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.openLots.map((l) => (
                      <tr key={l.lot_id}>
                        <td className="px-3 py-2.5 font-medium">{l.symbol}</td>
                        <td className="px-3 py-2.5 text-slate-600">{dateOnly(l.acquired_at)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{qty(l.remaining_qty)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(l.unit_cost)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${gainColor(l.unrealized_gain)}`}>{signedMoney(l.unrealized_gain)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            l.term_if_sold_today === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {l.term_if_sold_today === "LONG" ? "Long-term" : "Short-term"}
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
    </div>
  );
}
