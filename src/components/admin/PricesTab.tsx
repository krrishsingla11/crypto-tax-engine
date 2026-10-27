"use client";
import { useRef, useState } from "react";
import { api, useFetch } from "@/lib/client";
import { money } from "@/lib/format";
import { Banner, Card, Msg, Th, btnDark } from "./ui";

type Coverage = { symbol: string; name: string; days: number; first_date: string | null; last_date: string | null; latest_close: string | null };
type Result = { inserted: number; updated: number; invalid: { line: number; error: string }[]; unknownSymbols: string[] };

export default function PricesTab() {
  const { data, loading, error, reload } = useFetch<{ coverage: Coverage[] }>("/api/admin/prices");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: "Choose a CSV file first" });
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const r = await api<Result>("/api/admin/prices", { method: "POST", body: JSON.stringify({ csv: await file.text() }) });
      setResult(r);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <Card title="Upload daily closing prices" subtitle="CSV with columns Symbol, Date (YYYY-MM-DD or DD-MM-YYYY) and Close. Existing days are overwritten.">
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3 p-4">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm" />
          <button disabled={busy} className={btnDark}>{busy ? "Uploading…" : "Upload prices"}</button>
        </form>
        {result && (
          <div className="border-t border-slate-100 p-4 text-sm">
            <p>
              <span className="font-medium text-emerald-700">{result.inserted} added</span>{" · "}
              <span className="font-medium text-indigo-700">{result.updated} updated</span>{" · "}
              <span className={result.invalid.length ? "font-medium text-rose-700" : "text-slate-500"}>{result.invalid.length} invalid</span>
            </p>
            {result.unknownSymbols.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">Skipped unknown assets (add them in the Assets tab first): {result.unknownSymbols.join(", ")}</p>
            )}
            {result.invalid.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-rose-700">
                {result.invalid.map((x) => <li key={x.line}>Line {x.line}: {x.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>
      <Card title="Price coverage" subtitle="Valuation uses the latest stored close for each asset">
        {error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {loading && <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>}
        {data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><Th>Asset</Th><Th right>Days</Th><Th>From</Th><Th>To</Th><Th right>Latest close</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.coverage.map((c) => (
                <tr key={c.symbol}>
                  <td className="px-3 py-2.5"><span className="font-medium">{c.symbol}</span> <span className="text-slate-500">{c.name}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.days}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.first_date ?? "–"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.last_date ?? "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.latest_close ? money(c.latest_close, 2) : <span className="text-amber-700">no prices</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
