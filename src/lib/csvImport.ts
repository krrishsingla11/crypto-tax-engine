import { parse } from "csv-parse/sync";

// Exchanges name their columns differently. We normalise headers (lower-case, letters/digits only)
// and map them onto our fields. The ORIGINAL row is always kept untouched in MongoDB.
const ALIASES: Record<string, string[]> = {
  date: ["date", "dateutc", "time", "timestamp", "datetime", "txntime", "tradetime", "executedat", "createdat"],
  type: ["type", "side", "txntype", "operation", "tradetype", "action"],
  symbol: ["symbol", "asset", "coin", "currency", "token", "market", "pair"],
  quantity: ["quantity", "qty", "amount", "volume", "size", "filled"],
  price: ["price", "priceperunit", "rate", "priceinr", "unitprice", "executedprice", "avgprice"],
  fees: ["fee", "fees", "feeinr", "commission", "tradingfee"],
};

const TYPE_MAP: Record<string, string> = {
  buy: "BUY", purchase: "BUY", bid: "BUY",
  sell: "SELL", ask: "SELL",
  deposit: "TRANSFER_IN", transferin: "TRANSFER_IN", receive: "TRANSFER_IN",
  withdraw: "TRANSFER_OUT", withdrawal: "TRANSFER_OUT", transferout: "TRANSFER_OUT", send: "TRANSFER_OUT",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type RawRow = Record<string, string>;
export type ParsedRow = {
  line: number; // line in the file (header = 1)
  raw: RawRow;
  txn?: { symbol: string; txnType: string; quantity: string; pricePerUnit: string; fees: string; txnTime: string };
  error?: string;
};

const DEC = /^\d+(\.\d{1,10})?$/;

function cleanNumber(v: string | undefined, fallback?: string): string | null {
  if (v === undefined || v.trim() === "") return fallback ?? null;
  const s = v.replace(/[₹$,\s]/g, "");
  return DEC.test(s) ? s : null;
}

/** Accepts ISO strings, "YYYY-MM-DD HH:mm[:ss]" and "DD-MM-YYYY"/"DD/MM/YYYY [HH:mm[:ss]]". Naive times are IST. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return new Date(s).toISOString();

  let y: string, m: string, d: string, rest: string | undefined;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (mt) [, y, m, d, rest] = mt;
  else if ((mt = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/))) [, d, m, y, rest] = mt;
  else return null;

  const time = rest ? (rest.length === 5 ? `${rest}:00` : rest) : "00:00:00";
  const dt = new Date(`${y}-${m}-${d}T${time}+05:30`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function cleanSymbol(v: string): string {
  const s = v.trim().toUpperCase();
  const parts = s.split(/[/\-_ ]/).filter(Boolean);
  if (parts.length > 1) return parts[0];
  if (s.endsWith("INR") && s.length > 4) return s.slice(0, -3);
  return s;
}

export function parseCsv(text: string, maxRows = 2000): { rows: ParsedRow[]; fileError?: string } {
  let records: RawRow[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    return { rows: [], fileError: `Could not read CSV: ${(e as Error).message}` };
  }
  if (!records.length) return { rows: [], fileError: "CSV has no data rows" };
  if (records.length > maxRows) return { rows: [], fileError: `Too many rows (max ${maxRows})` };

  // header -> field
  const headers = Object.keys(records[0]);
  const col: Record<string, string> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const h = headers.find((x) => names.includes(norm(x)));
    if (h) col[field] = h;
  }
  const missing = ["date", "type", "symbol", "quantity", "price"].filter((f) => !col[f]);
  if (missing.length) return { rows: [], fileError: `Missing columns: ${missing.join(", ")}. Found: ${headers.join(", ")}` };

  const rows: ParsedRow[] = records.map((raw, i) => {
    const line = i + 2;
    const typeKey = norm(raw[col.type] ?? "");
    const txnType = TYPE_MAP[typeKey] ?? (["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"].includes(raw[col.type]?.toUpperCase()) ? raw[col.type].toUpperCase() : null);
    const txnTime = parseDate(raw[col.date] ?? "");
    const quantity = cleanNumber(raw[col.quantity]);
    const pricePerUnit = cleanNumber(raw[col.price]);
    const fees = cleanNumber(col.fees ? raw[col.fees] : undefined, "0");
    const symbol = cleanSymbol(raw[col.symbol] ?? "");

    const problems: string[] = [];
    if (!txnType) problems.push(`unknown type "${raw[col.type]}"`);
    if (!txnTime) problems.push(`bad date "${raw[col.date]}"`);
    if (!quantity || Number(quantity) <= 0) problems.push(`bad quantity "${raw[col.quantity]}"`);
    if (!pricePerUnit) problems.push(`bad price "${raw[col.price]}"`);
    if (!fees) problems.push(`bad fee "${raw[col.fees!]}"`);
    if (!symbol) problems.push("missing symbol");
    if (problems.length) return { line, raw, error: problems.join("; ") };
    return { line, raw, txn: { symbol, txnType: txnType!, quantity: quantity!, pricePerUnit: pricePerUnit!, fees: fees!, txnTime: txnTime! } };
  });
  return { rows };
}
