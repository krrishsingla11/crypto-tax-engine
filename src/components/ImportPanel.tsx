"use client";
import { useRef, useState } from "react";
import { api, useFetch } from "@/lib/client";
import { dateTime } from "@/lib/format";

type Wallet = { wallet_id: number; platform_name: string };
type Result = { importId: string; platform: string; total: number; imported: number; failed: number; errors: { line: number; error: string }[] };
type PastImport = { import_id: string; platform: string; file_name: string; uploaded_at: string; status: string; imported_count?: number; failed_count?: number };

const field = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500";

export default function ImportPanel({ wallets, onDone }: { wallets: Wallet[]; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const history = useFetch<{ imports: PastImport[] }>("/api/imports");

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a CSV file first");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const csv = await file.text();
      const r = await api<Result>("/api/transactions/import", {
        method: "POST",
        body: JSON.stringify({ walletId: Number(f.get("walletId")), fileName: file.name, csv }),
      });
      setResult(r);
      if (fileRef.current) fileRef.current.value = "";
      history.reload();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold">Import from exchange CSV</h2>
        <p className="text-xs text-slate-500">
          Needs columns for date, type (buy/sell), asset, quantity and price; fee is optional. Different exchange header names are recognised.
          Raw rows are stored in MongoDB; valid rows are loaded into PostgreSQL in one transaction.
        </p>
      </div>

      <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Import into wallet</label>
          <select name="walletId" required className={field}>
            {wallets.map((w) => <option key={w.wallet_id} value={w.wallet_id}>{w.platform_name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">CSV file</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm" />
        </div>
        <button disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? "Importing…" : "Upload & import"}
        </button>
      </form>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {result && (
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p>
            <span className="font-medium text-emerald-700">{result.imported} imported</span>
            {" · "}
            <span className={result.failed ? "font-medium text-rose-700" : "text-slate-500"}>{result.failed} failed</span>
            {" · "}<span className="text-slate-500">{result.total} rows ({result.platform})</span>
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-rose-700">
              {result.errors.map((e) => <li key={e.line}>Line {e.line}: {e.error}</li>)}
            </ul>
          )}
        </div>
      )}

      {history.data && history.data.imports.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Recent imports (from MongoDB)</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {history.data.imports.slice(0, 5).map((i) => (
                <tr key={i.import_id}>
                  <td className="py-1.5 pr-3 font-medium">{i.file_name}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{i.platform}</td>
                  <td className="py-1.5 pr-3 text-slate-500">{dateTime(i.uploaded_at)}</td>
                  <td className="py-1.5 text-right text-xs">
                    <span className="text-emerald-700">{i.imported_count ?? 0} ok</span>
                    {" / "}
                    <span className={i.failed_count ? "text-rose-700" : "text-slate-500"}>{i.failed_count ?? 0} failed</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
