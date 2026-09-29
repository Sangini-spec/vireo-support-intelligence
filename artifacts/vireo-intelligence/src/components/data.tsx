import { Fragment, useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { BreakdownRow, CrossTabCell, WeekMetrics, Evidence } from "@workspace/api-client-react";
import { fmtInt, fmtPct, fmtPP, fmtMin, fmtINR, deltaTone } from "@/lib/format";
import { Pill } from "@/components/primitives";
import { useTicketViewer } from "@/components/ticket-sheet";
import { cn } from "@/lib/utils";

export function RateBar({ value, max = 100 }: { value: number | null; max?: number }) {
  const w = value == null ? 0 : Math.min(100, (value / (max || 1)) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full origin-left rounded-full bg-[hsl(var(--chart-2))] transition-transform duration-500" style={{ width: `${w}%` }} />
    </div>
  );
}

export function BreakdownTable({ rows, onPick, selected, showTarget, testId, keyLabel = "Segment", extra }: {
  rows: BreakdownRow[]; onPick?: (r: BreakdownRow) => void; selected?: string; showTarget?: boolean; testId: string; keyLabel?: string;
  extra?: (r: BreakdownRow) => React.ReactNode;
}) {
  const maxRate = Math.max(1, ...rows.map((r) => r.metrics.breach_rate ?? 0));
  if (!rows.length) return <div className="rounded-md border px-4 py-6 text-center text-xs text-muted-foreground">No tickets in this segment for the current filters.</div>;
  return (
    <div className="overflow-x-auto rounded-md border bg-card" data-testid={testId}>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-medium">{keyLabel}</th>
            <th className="px-2 py-2 text-right font-medium">Tickets</th>
            <th className="px-2 py-2 text-right font-medium">Breaches</th>
            <th className="w-[140px] px-2 py-2 font-medium">Breach rate</th>
            <th className="px-2 py-2 text-right font-medium">vs prev</th>
            <th className="px-2 py-2 text-right font-medium">Share of breaches</th>
            <th className="px-2 py-2 text-right font-medium">Median resp.</th>
            {showTarget && <th className="px-2 py-2 text-right font-medium">Target</th>}
            <th className="px-3 py-2 text-right font-medium">Est. exposure</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={onPick ? () => onPick(r) : undefined} data-testid={`row-${testId}-${r.key}`}
              className={cn("border-b last:border-0 transition-colors", onPick && "cursor-pointer hover:bg-accent/50", selected === r.key && "bg-accent")}>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{r.label}</span>
                  {r.tier && <span className="text-[10.5px] text-muted-foreground">T{r.tier}</span>}
                  {r.low_volume && <Pill tone="neutral">low vol</Pill>}
                  {extra?.(r)}
                </div>
              </td>
              <td className="num px-2 py-1.5 text-right">{fmtInt(r.metrics.tickets)}</td>
              <td className="num px-2 py-1.5 text-right">{fmtInt(r.metrics.breaches)}</td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="num w-12 text-right">{fmtPct(r.metrics.breach_rate)}</span>
                  <RateBar value={r.metrics.breach_rate} max={maxRate} />
                </div>
              </td>
              <td className={cn("num px-2 py-1.5 text-right", deltaTone(r.rate_change_pp))}>{fmtPP(r.rate_change_pp)}</td>
              <td className="num px-2 py-1.5 text-right">{fmtPct(r.breach_contribution)}</td>
              <td className="num px-2 py-1.5 text-right">{fmtMin(r.metrics.median_response_minutes)}</td>
              {showTarget && <td className="num px-2 py-1.5 text-right">{r.target_minutes != null ? `${r.target_minutes}m` : "—"}</td>}
              <td className="num px-3 py-1.5 text-right">{fmtINR(r.metrics.exposure_inr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrossTab({ cells, onPick }: { cells: CrossTabCell[]; onPick?: (arrival: string, resolving: string) => void }) {
  const arrivals = useMemo(() => Array.from(new Set(cells.map((c) => c.arrival_shift))), [cells]);
  const resolving = useMemo(() => Array.from(new Set(cells.map((c) => c.resolving_shift))), [cells]);
  const maxB = Math.max(1, ...cells.map((c) => c.breaches));
  const get = (a: string, r: string) => cells.find((c) => c.arrival_shift === a && c.resolving_shift === r);
  if (!cells.length) return <div className="rounded-md border px-4 py-6 text-center text-xs text-muted-foreground">No cross-tab data for these filters.</div>;
  return (
    <div className="overflow-x-auto rounded-md border bg-card p-3" data-testid="table-crosstab">
      <div className="grid gap-1" style={{ gridTemplateColumns: `110px repeat(${resolving.length}, minmax(96px,1fr))` }}>
        <div className="flex items-end pb-1 text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">Arrived ↓ / Attributed to →</div>
        {resolving.map((r) => (
          <div key={r} className="pb-1 text-center text-[11px] font-medium">{r}<div className="text-[10px] font-normal text-muted-foreground">resolving roster</div></div>
        ))}
        {arrivals.map((a) => (
          <Fragment key={a}>
            <div className="flex items-center text-[11px] font-medium">{a}<span className="ml-1 text-[10px] font-normal text-muted-foreground">arrival</span></div>
            {resolving.map((r) => {
              const c = get(a, r);
              const intensity = c ? c.breaches / maxB : 0;
              return (
                <button key={r} disabled={!c || !onPick} onClick={() => c && onPick?.(a, r)} data-testid={`cell-crosstab-${a}-${r}`}
                  className="rounded px-2 py-2 text-left transition-transform hover:-translate-y-px disabled:cursor-default disabled:hover:translate-y-0"
                  style={{ background: `hsl(14 62% 52% / ${0.05 + intensity * 0.45})` }}>
                  {c ? (
                    <>
                      <div className="num text-[15px] leading-none">{fmtInt(c.breaches)}</div>
                      <div className="mt-1 text-[10.5px] text-foreground/70"><span className="num">{fmtInt(c.tickets)}</span> tkts · <span className="num">{fmtPct(c.breach_rate)}</span></div>
                    </>
                  ) : <span className="text-[11px] text-muted-foreground">—</span>}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Cell value = breaches. Rows are the IST shift the customer created the ticket in; columns are the resolving agent's date-aware roster shift. Concentration here describes observed attribution, not cause.</p>
    </div>
  );
}

export function WeeklyChart({ weeks, selected, onPick }: { weeks: WeekMetrics[]; selected?: string; onPick?: (w: string) => void }) {
  const data = weeks.map((w) => ({ week: w.week, label: w.label + (w.partial ? "*" : ""), breaches: w.metrics.breaches, within: w.metrics.non_breaches, rate: w.metrics.breach_rate, partial: w.partial }));
  return (
    <div className="h-[220px] w-full" data-testid="chart-weekly">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          onClick={(e: { activePayload?: { payload: { week: string } }[] }) => { const w = e?.activePayload?.[0]?.payload?.week; if (w && onPick) onPick(w); }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis yAxisId="c" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="r" orientation="right" unit="%" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
            formatter={(v: number, n: string) => (n === "Breach rate" ? `${v?.toFixed(1)}%` : v.toLocaleString("en-IN"))} />
          <Bar yAxisId="c" dataKey="within" name="Within target" stackId="a" fill="hsl(var(--chart-1) / 0.25)" cursor="pointer" />
          <Bar yAxisId="c" dataKey="breaches" name="Breaches" stackId="a" fill="hsl(var(--chart-2))" cursor="pointer"
            shape={(p: { x: number; y: number; width: number; height: number; payload: { week: string } }) => (
              <rect x={p.x} y={p.y} width={p.width} height={p.height} fill="hsl(var(--chart-2))" opacity={selected && p.payload.week !== selected ? 0.45 : 1} />
            )} />
          <Line yAxisId="r" dataKey="rate" name="Breach rate" stroke="hsl(var(--chart-1))" strokeWidth={1.75} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  const { open } = useTicketViewer();
  if (!items.length) return <div className="text-xs text-muted-foreground">No evidence excerpts attached.</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => (
        <li key={i} className="border-l-2 border-primary/40 pl-2.5 text-[12.5px]">
          <button onClick={() => open(e.ticket_id)} className="num mr-1.5 text-[11px] text-primary underline-offset-2 hover:underline" data-testid={`link-evidence-${e.ticket_id}-${i}`}>{e.ticket_id}</button>
          <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{e.field.replace("_", " ")}</span>
          <div className="mt-0.5 italic text-foreground/80">"{e.excerpt}"</div>
        </li>
      ))}
    </ul>
  );
}

export function TicketLinks({ ids, max = 12 }: { ids: string[]; max?: number }) {
  const { open } = useTicketViewer();
  return (
    <div className="flex flex-wrap gap-1">
      {ids.slice(0, max).map((id) => (
        <button key={id} onClick={() => open(id)} className="num rounded border px-1.5 py-0.5 text-[11px] text-primary hover:border-primary" data-testid={`link-ticket-${id}`}>{id}</button>
      ))}
      {ids.length > max && <span className="px-1 text-[11px] text-muted-foreground">+{ids.length - max} more</span>}
    </div>
  );
}
