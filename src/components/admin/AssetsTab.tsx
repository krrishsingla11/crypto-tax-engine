"use client";
import { useState } from "react";
import { api, useFetch } from "@/lib/client";
import { Banner, Card, Msg, Th, btnDark, field, lbl } from "./ui";

type Asset = { asset_id: number; symbol: string; name: string; asset_type: string };

export default function AssetsTab() {
  const { data, loading, error, reload } = useFetch<{ assets: Asset[] }>("/api/assets");
  const [msg, setMsg] = useState<Msg>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setMsg(null);
    try {
      await api("/api/assets", { method: "POST", body: JSON.stringify({ symbol: f.get("symbol"), name: f.get("name"), assetType: f.get("assetType") }) });
      form.reset();
      reload();
      setMsg({ ok: true, text: "Asset added." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete ${a.symbol}? Its stored prices are deleted too.`)) return;
    setMsg(null);
    try {
      await api(`/api/assets/${a.asset_id}`, { method: "DELETE" });
      reload();
      setMsg({ ok: true, text: `${a.symbol} deleted.` });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <Card title="Add asset">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-4">
          <div><label className={lbl}>Symbol</label><input name="symbol" required maxLength={12} placeholder="DOGE" className={`${field} w-28 uppercase`} /></div>
          <div><label className={lbl}>Name</label><input name="name" required maxLength={80} placeholder="Dogecoin" className={`${field} w-56`} /></div>
          <div><label className={lbl}>Type</label>
            <select name="assetType" className={field}><option value="crypto">Crypto</option><option value="token">Token</option><option value="stablecoin">Stablecoin</option></select></div>
          <button className={btnDark}>Add asset</button>
        </form>
      </Card>
      <Card title="Assets" subtitle="Assets with transactions can't be deleted">
        {error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {loading && <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>}
        {data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><Th>Symbol</Th><Th>Name</Th><Th>Type</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.assets.map((a) => (
                <tr key={a.asset_id}>
                  <td className="px-3 py-2.5 font-medium">{a.symbol}</td>
                  <td className="px-3 py-2.5">{a.name}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{a.asset_type}</td>
                  <td className="px-3 py-2.5 text-right"><button onClick={() => remove(a)} className="text-xs font-medium text-rose-600 hover:underline">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
