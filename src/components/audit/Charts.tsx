// Small dependency-free SVG charts for the audit page.
export const ACTION_COLORS: Record<string, string> = {
  LOGIN: "#64748b", LOGIN_FAILED: "#e11d48", REGISTER: "#10b981",
  TXN_CREATE: "#4f46e5", TXN_DELETE: "#a78bfa", IMPORT: "#0ea5e9", TAX_REPORT: "#f59e0b",
  WALLET_CREATE: "#14b8a6", COST_METHOD_CHANGE: "#84cc16",
};
const FALLBACK = "#94a3b8";
export const actionColor = (a: string) => ACTION_COLORS[a] ?? (a.startsWith("TAX_RULE") || a.startsWith("ASSET") || a.startsWith("USER_") || a.startsWith("PRICES") ? "#c026d3" : FALLBACK);

export type DayEvent = { day: string; action: string; count: number };

/** Stacked daily bars for the last `days` days (IST day strings YYYY-MM-DD). */
export function EventsChart({ events, days = 14 }: { events: DayEvent[]; days?: number }) {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const byDay = new Map<string, Map<string, number>>();
  events.forEach((e) => {
    const m = byDay.get(e.day) ?? new Map<string, number>();
    m.set(e.action, (m.get(e.action) ?? 0) + e.count);
    byDay.set(e.day, m);
  });
  const totals = labels.map((l) => [...(byDay.get(l)?.values() ?? [])].reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const W = 640, H = 180, pad = 24, bw = (W - pad * 2) / days;
  const actions = [...new Set(events.map((e) => e.action))].sort();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Events per day">
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#e2e8f0" />
        {labels.map((l, i) => {
          let y = H;
          const segs = [...(byDay.get(l)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
          return (
            <g key={l}>
              {segs.map(([action, count]) => {
                const h = (count / max) * (H - 16);
                y -= h;
                return (
                  <rect key={action} x={pad + i * bw + 3} y={y} width={bw - 6} height={h} rx={2} fill={actionColor(action)}>
                    <title>{`${l} · ${action}: ${count}`}</title>
                  </rect>
                );
              })}
              {(i % 2 === 0 || days <= 7) && (
                <text x={pad + i * bw + bw / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="#64748b">{l.slice(5)}</text>
              )}
            </g>
          );
        })}
        <text x={pad} y={10} fontSize="9" fill="#94a3b8">max {max}/day</text>
      </svg>
      {actions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {actions.map((a) => (
            <li key={a} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: actionColor(a) }} />{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type PlatformRow = { platform: string; status: string; rows: number; files: number };

/** Horizontal stacked bars: imported vs failed rows per exchange. */
export function ImportsChart({ data }: { data: PlatformRow[] }) {
  const platforms = [...new Set(data.map((d) => d.platform))].sort();
  if (!platforms.length) return <p className="py-6 text-center text-sm text-slate-500">No imports yet.</p>;
  const get = (p: string, s: string) => data.find((d) => d.platform === p && d.status === s)?.rows ?? 0;
  const files = (p: string) => Math.max(...data.filter((d) => d.platform === p).map((d) => d.files));
  const max = Math.max(1, ...platforms.map((p) => get(p, "imported") + get(p, "error")));
  return (
    <ul className="space-y-3">
      {platforms.map((p) => {
        const ok = get(p, "imported"), bad = get(p, "error");
        return (
          <li key={p}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{p}</span>
              <span className="text-xs text-slate-500">{files(p)} file{files(p) === 1 ? "" : "s"} · <span className="text-emerald-700">{ok} imported</span> · <span className={bad ? "text-rose-700" : ""}>{bad} failed</span></span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" title={`${ok} imported, ${bad} failed`}>
              <div className="bg-emerald-500" style={{ width: `${(ok / max) * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${(bad / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
