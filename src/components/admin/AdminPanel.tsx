"use client";
import { useState } from "react";
import AssetsTab from "./AssetsTab";
import RulesTab from "./RulesTab";
import PricesTab from "./PricesTab";
import UsersTab from "./UsersTab";

const TABS = ["Assets", "Tax rules", "Prices", "Users"] as const;

export default function AdminPanel({ selfId }: { selfId: number }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Assets");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-slate-500">Reference data and access control. Every change is written to the audit log.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Assets" && <AssetsTab />}
      {tab === "Tax rules" && <RulesTab />}
      {tab === "Prices" && <PricesTab />}
      {tab === "Users" && <UsersTab selfId={selfId} />}
    </div>
  );
}
