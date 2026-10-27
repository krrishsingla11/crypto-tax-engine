const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

export type Slice = { label: string; value: number };

export default function AllocationDonut({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="py-8 text-center text-sm text-slate-500">No holdings to chart</p>;

  // start offset of each slice = share of everything before it
  const starts = slices.map((_, i) => (slices.slice(0, i).reduce((a, x) => a + x.value, 0) / total) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-44 w-44 -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        {slices.map((s, i) => {
          const p = (s.value / total) * 100;
          return (
            <circle
              key={s.label}
              cx="21" cy="21" r="15.915" fill="none"
              stroke={COLORS[i % COLORS.length]} strokeWidth="6"
              strokeDasharray={`${p} ${100 - p}`}
              strokeDashoffset={-starts[i]}
            />
          );
        })}
      </svg>
      <ul className="w-full space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {s.label}
            </span>
            <span className="text-slate-500">{((s.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
