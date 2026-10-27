"use client";
import { useState } from "react";
import { api, useFetch } from "@/lib/client";
import { dateTime, money, qty } from "@/lib/format";

type Wallet = { wallet_id: number; platform_name: string; wallet_type: string };
type Asset = { asset_id: number; symbol: string; name: string };
type Txn = {
  txn_id: string; txn_type: string; symbol: string; quantity: string; price_per_unit: string; fees: string;
  txn_time: string; wallet_id: number; platform_name: string; notes: string | null;
};
type TxnPage = { total: number; transactions: Txn[] };

const TYPES = ["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT", "SWAP_IN", "SWAP_OUT"];
const PAGE_SIZE = 15;

const field =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const label = "mb-1 block text-xs font-medium text-slate-600";

const badge = (t: string) =>
  t === "BUY" ? "bg-emerald-50 text-emerald-700"
  : t === "SELL" ? "bg-rose-50 text-rose-700"
  : t.startsWith("SWAP") ? "bg-indigo-50 text-indigo-700"
  : "bg-slate-100 text-slate-600";

type Filters = { symbol: string; walletId: string; type: string; from: string; to: string };
const EMPTY: Filters = { symbol: "", walletId: "", type: "", from: "", to: "" };

function buildQuery(f: Filters, page: number, viewUser: string) {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  if (f.symbol) p.set("symbol", f.symbol);
  if (f.walletId) p.set("walletId", f.walletId);
  if (f.type) p.set("type", f.type);
  if (f.from) p.set("from", `${f.from}T00:00:00+05:30`);
  if (f.to) {
    const next = new Date(`${f.to}T00:00:00Z`); // inclusive end date -> exclusive next midnight (IST)
    next.setUTCDate(next.getUTCDate() + 1);
    p.set("to", `${next.toISOString().slice(0, 10)}T00:00:00+05:30`);
  }
  if (viewUser) p.set("userId", viewUser);
  return p.toString();
}

export default function Transactions({ role }: { role: "user" | "admin" | "auditor" }) {
  const canEdit = role === "user";
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [viewDraft, setViewDraft] = useState("");
  const [viewUser, setViewUser] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const txns = useFetch<TxnPage>(`/api/transactions?${buildQuery(filters, page, viewUser)}`);
  const wallets = useFetch<{ wallets: Wallet[] }>(`/api/wallets${viewUser ? `?userId=${encodeURIComponent(viewUser)}` : ""}`);
  const assets = useFetch<{ assets: Asset[] }>("/api/assets");

  const walletList = wallets.data?.wallets ?? [];
  const assetList = assets.data?.assets ?? [];
  const total = txns.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addTxn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          walletId: Number(f.get("walletId")),
          symbol: f.get("symbol"),
          txnType: f.get("txnType"),
          quantity: String(f.get("quantity")).trim(),
          pricePerUnit: String(f.get("pricePerUnit")).trim(),
          fees: String(f.get("fees") || "0").trim(),
          txnTime: new Date(String(f.get("txnTime"))).toISOString(),
          notes: f.get("notes") || undefined,
        }),
      });
      form.reset();
      setMsg({ ok: true, text: "Transaction recorded." });
      setPage(1);
      txns.reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function addWallet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setMsg(null);
    try {
      await api("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ platformName: f.get("platformName"), walletType: f.get("walletType") }),
      });
      form.reset();
      wallets.reload();
      setMsg({ ok: true, text: "Wallet added." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  async function remove(t: Txn) {
    if (!confirm(`Delete this ${t.txn_type} of ${qty(t.quantity)} ${t.symbol}?`)) return;
    setMsg(null);
    try {
      await api(`/api/transactions/${t.txn_id}`, { method: "DELETE" });
      setMsg({ ok: true, text: "Transaction deleted; lots and holdings rolled back." });
      txns.reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-slate-500">
            {canEdit ? "Every buy, sell, transfer and swap across your wallets" : "Read-only view"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!canEdit && (
            <form onSubmit={(e) => { e.preventDefault(); setViewUser(viewDraft.trim()); setPage(1); }} className="flex items-center gap-2 text-sm">
              <label className="text-slate-600">View user ID</label>
              <input value={viewDraft} onChange={(e) => setViewDraft(e.target.value)} inputMode="numeric" placeholder="e.g. 3"
                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5" />
              <button className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">Load</button>
            </form>
          )}
          {canEdit && (
            <button onClick={() => setShowForm((v) => !v)} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              {showForm ? "Close" : "+ Add transaction"}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>
      )}

      {canEdit && showForm && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {walletList.length === 0 ? (
            <div>
              <p className="mb-3 text-sm text-slate-600">Add an exchange or wallet first.</p>
              <WalletForm onSubmit={addWallet} />
            </div>
          ) : (
            <>
              <form onSubmit={addTxn} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><label className={label}>Wallet</label>
                  <select name="walletId" required className={field}>
                    {walletList.map((w) => <option key={w.wallet_id} value={w.wallet_id}>{w.platform_name}</option>)}
                  </select></div>
                <div><label className={label}>Type</label>
                  <select name="txnType" required className={field}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className={label}>Asset</label>
                  <select name="symbol" required className={field}>
                    {assetList.map((a) => <option key={a.asset_id} value={a.symbol}>{a.symbol} – {a.name}</option>)}
                  </select></div>
                <div><label className={label}>Date &amp; time</label>
                  <input name="txnTime" type="datetime-local" required className={field} /></div>
                <div><label className={label}>Quantity</label>
                  <input name="quantity" required inputMode="decimal" pattern="\d+(\.\d{1,10})?" title="Positive number, up to 10 decimals" className={field} /></div>
                <div><label className={label}>Price per unit (₹)</label>
                  <input name="pricePerUnit" required inputMode="decimal" pattern="\d+(\.\d{1,10})?" title="Number, up to 10 decimals" className={field} /></div>
                <div><label className={label}>Fees (₹)</label>
                  <input name="fees" inputMode="decimal" defaultValue="0" pattern="\d+(\.\d{1,10})?" className={field} /></div>
                <div><label className={label}>Notes</label>
                  <input name="notes" maxLength={200} className={field} /></div>
                <div className="col-span-2 flex items-center gap-3 md:col-span-4">
                  <button disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                    {busy ? "Saving…" : "Save transaction"}
                  </button>
                  <span className="text-xs text-slate-500">Selling more than you hold is rejected by the database.</span>
                </div>
              </form>
              <details className="mt-4 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm text-slate-600">Add another exchange / wallet</summary>
                <div className="mt-3"><WalletForm onSubmit={addWallet} /></div>
              </details>
            </>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(1); }}
          className="grid grid-cols-2 items-end gap-3 md:grid-cols-6"
        >
          <div><label className={label}>Asset</label>
            <select value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} className={field}>
              <option value="">All</option>{assetList.map((a) => <option key={a.asset_id}>{a.symbol}</option>)}
            </select></div>
          <div><label className={label}>Wallet</label>
            <select value={draft.walletId} onChange={(e) => setDraft({ ...draft, walletId: e.target.value })} className={field}>
              <option value="">All</option>{walletList.map((w) => <option key={w.wallet_id} value={w.wallet_id}>{w.platform_name}</option>)}
            </select></div>
          <div><label className={label}>Type</label>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className={field}>
              <option value="">All</option>{TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><label className={label}>From</label>
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={field} /></div>
          <div><label className={label}>To</label>
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={field} /></div>
          <div className="flex gap-2">
            <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Filter</button>
            <button type="button" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Reset</button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {txns.error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{txns.error}</p>}
        {txns.loading && <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>}
        {txns.data && (
          txns.data.transactions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No transactions match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Asset</th>
                    <th className="px-3 py-2 text-left font-medium">Wallet</th>
                    <th className="px-3 py-2 text-right font-medium">Quantity</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Fees</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    {canEdit && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.data.transactions.map((t) => (
                    <tr key={t.txn_id}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateTime(t.txn_time)}</td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(t.txn_type)}`}>{t.txn_type.replace("_", " ")}</span></td>
                      <td className="px-3 py-2.5 font-medium">{t.symbol}</td>
                      <td className="px-3 py-2.5 text-slate-600">{t.platform_name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{qty(t.quantity)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(t.price_per_unit)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{money(t.fees, 2)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(Number(t.quantity) * Number(t.price_per_unit))}</td>
                      {canEdit && (
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => remove(t)} className="text-xs font-medium text-rose-600 hover:underline">Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>{total} transaction{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 px-2.5 py-1 disabled:opacity-40">Prev</button>
              <span>Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 px-2.5 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function WalletForm({ onSubmit }: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><label className={label}>Platform name</label>
        <input name="platformName" required maxLength={60} placeholder="e.g. Binance" className={field} /></div>
      <div><label className={label}>Type</label>
        <select name="walletType" className={field}>
          <option value="exchange">Exchange</option><option value="hot">Hot wallet</option><option value="cold">Cold wallet</option>
        </select></div>
      <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Add wallet</button>
    </form>
  );
}
