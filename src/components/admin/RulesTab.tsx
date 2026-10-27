"use client";
import { useState } from "react";
import { api, useFetch } from "@/lib/client";
import { Banner, Card, Msg, Th, btnDark, btnLight, field, lbl } from "./ui";

type Rule = { rule_id: number; country: string; financial_year: string; term: "SHORT" | "LONG"; long_term_days: number; rate: string; description: string | null };

function RuleRow({ r, onChanged, setMsg }: { r: Rule; onChanged: () => void; setMsg: (m: Msg) => void }) {
  const [rate, setRate] = useState(String(Number(r.rate)));
  const [days, setDays] = useState(String(r.long_term_days));
  const [desc, setDesc] = useState(r.description ?? "");
  const dirty = Number(rate) !== Number(r.rate) || Number(days) !== r.long_term_days || desc !== (r.description ?? "");

  async function save() {
    setMsg(null);
    try {
      await api(`/api/tax-rules/${r.rule_id}`, { method: "PUT", body: JSON.stringify({ rate: Number(rate), longTermDays: Number(days), description: desc || null }) });
      onChanged();
      setMsg({ ok: true, text: `Rule ${r.country} ${r.financial_year} ${r.term} updated.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }
  async function del() {
    if (!confirm(`Delete the ${r.term} rule for ${r.country} ${r.financial_year}? Reports for that year can't be generated without it.`)) return;
    setMsg(null);
    try {
      await api(`/api/tax-rules/${r.rule_id}`, { method: "DELETE" });
      onChanged();
      setMsg({ ok: true, text: "Rule deleted." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <tr>
      <td className="px-3 py-2 font-medium">{r.country}</td>
      <td className="px-3 py-2">{r.financial_year}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.term === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{r.term === "LONG" ? "Long-term" : "Short-term"}</span>
      </td>
      <td className="px-3 py-2"><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className={`${field} w-20 text-right`} aria-label="rate" /> %</td>
      <td className="px-3 py-2"><input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className={`${field} w-20 text-right`} aria-label="days" /></td>
      <td className="px-3 py-2"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={`${field} w-full min-w-40`} aria-label="description" /></td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button disabled={!dirty} onClick={save} className="mr-3 text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline">Save</button>
        <button onClick={del} className="text-xs font-medium text-rose-600 hover:underline">Delete</button>
      </td>
    </tr>
  );
}

export default function RulesTab() {
  const [country, setCountry] = useState("IN");
  const { data, loading, error, reload } = useFetch<{ rules: Rule[] }>(`/api/tax-rules?country=${encodeURIComponent(country)}`);
  const [msg, setMsg] = useState<Msg>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setMsg(null);
    try {
      await api("/api/tax-rules", {
        method: "POST",
        body: JSON.stringify({
          country: f.get("country"), financialYear: f.get("financialYear"), term: f.get("term"),
          rate: Number(f.get("rate")), longTermDays: Number(f.get("longTermDays")), description: f.get("description") || undefined,
        }),
      });
      setCountry(String(f.get("country")).toUpperCase());
      form.reset();
      reload();
      setMsg({ ok: true, text: "Rule added." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <Card title="Add tax rule" subtitle="One rule per country, financial year and term. The holding period (days) is read from the Long-term rule.">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-4">
          <div><label className={lbl}>Country</label><input name="country" required maxLength={2} defaultValue="IN" className={`${field} w-16 uppercase`} /></div>
          <div><label className={lbl}>Financial year</label><input name="financialYear" required pattern="\d{4}-\d{2}" placeholder="2027-28" className={`${field} w-28`} /></div>
          <div><label className={lbl}>Term</label><select name="term" className={field}><option value="SHORT">Short-term</option><option value="LONG">Long-term</option></select></div>
          <div><label className={lbl}>Rate %</label><input name="rate" required inputMode="decimal" className={`${field} w-20`} /></div>
          <div><label className={lbl}>Holding days</label><input name="longTermDays" required defaultValue="365" inputMode="numeric" className={`${field} w-24`} /></div>
          <div className="min-w-48 flex-1"><label className={lbl}>Description</label><input name="description" maxLength={200} className={`${field} w-full`} /></div>
          <button className={btnDark}>Add rule</button>
        </form>
      </Card>

      <Card title="Rules">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
          <span className="text-slate-600">Country</span>
          {["IN", "US"].map((c) => (
            <button key={c} onClick={() => setCountry(c)} className={`${btnLight} ${country === c ? "!border-indigo-500 !text-indigo-700" : ""}`}>{c}</button>
          ))}
        </div>
        {error && <p className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {loading && <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>}
        {data && (data.rules.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No rules for {country}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><Th>Country</Th><Th>FY</Th><Th>Term</Th><Th>Rate</Th><Th>Holding days</Th><Th>Description</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rules.map((r) => <RuleRow key={`${r.rule_id}-${r.rate}-${r.long_term_days}-${r.description}`} r={r} onChanged={reload} setMsg={setMsg} />)}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
    </div>
  );
}
