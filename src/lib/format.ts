// Display helpers. Values arrive from the API as decimal STRINGS (no float loss in transit);
// we only convert to Number for showing them.

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const money = (v: string | number | null | undefined, decimals = 0) => {
  if (v === null || v === undefined || v === "") return "–";
  return (decimals ? inr2 : inr0).format(Number(v));
};

export const signedMoney = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  return (n > 0 ? "+" : "") + inr0.format(n);
};

export const qty = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "–";
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 6 });
};

export const pct = (part: number, whole: number) => (whole > 0 ? ((part / whole) * 100).toFixed(1) + "%" : "0%");

export const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const gainColor = (v: string | number | null | undefined) =>
  Number(v) > 0 ? "text-emerald-600" : Number(v) < 0 ? "text-rose-600" : "text-slate-500";

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
