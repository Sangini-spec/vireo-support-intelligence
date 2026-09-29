export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IN"));
export const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${n.toFixed(d)}%`);
export const fmtPP = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)} pp`);
export const fmtSigned = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("en-IN")}`);
export const fmtMin = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n < 120) return `${n.toFixed(n < 10 ? 1 : 0)}m`;
  return `${(n / 60).toFixed(1)}h`;
};
export const fmtINR = (n: number | null | undefined) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
export const deltaTone = (n: number | null | undefined) =>
  n == null || n === 0 ? "text-muted-foreground" : n > 0 ? "text-destructive" : "text-[hsl(160_35%_32%)]";
