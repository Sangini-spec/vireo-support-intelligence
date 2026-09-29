import { X } from "lucide-react";
import { useGetVireoTickets, type BreakdownRow, type Dashboard } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { TicketLinks } from "@/components/data";
import { LoadingBlock, ErrorBlock, errMsg } from "@/components/primitives";
import { fmtInt, fmtPct, fmtMin } from "@/lib/format";

function top(rows: BreakdownRow[]) {
  return [...rows].filter((r) => r.metrics.breaches > 0).sort((a, b) => b.metrics.breaches - a.metrics.breaches)[0];
}

function Reason({ label, row, total }: { label: string; row?: BreakdownRow; total: number }) {
  if (!row) return null;
  return (
    <li className="text-[12.5px]">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{row.label}</span> — <span className="num">{fmtInt(row.metrics.breaches)}</span> of <span className="num">{fmtInt(total)}</span> breaches
      {" "}(<span className="num">{fmtPct(row.metrics.breach_rate)}</span> breach rate on <span className="num">{fmtInt(row.metrics.tickets)}</span> tickets)
    </li>
  );
}

export function AgentSummary({ name, d, onClear }: { name: string; d: Dashboard; onClear: () => void }) {
  const { params } = useFilters();
  const q = useGetVireoTickets({ ...params, breach: "breached", page: 1, page_size: 100 });
  const m = d.metrics;
  const self = d.agents.find((a) => a.agent_id === params.agent || a.key === params.agent);
  return (
    <div className="rise rounded-md border bg-card" data-testid="panel-agent-summary">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b px-5 py-4">
        <div>
          <div className="eyebrow">Step 2 · Agent under review</div>
          <div className="display mt-0.5 text-[22px]" data-testid="text-agent-name">{name}</div>
          {self && <div className="text-[11px] text-muted-foreground">{[self.tier && `Tier ${self.tier}`, self.shift, self.team].filter(Boolean).join(" · ")}</div>}
        </div>
        <div><div className="eyebrow">Tickets</div><div className="num text-[20px]">{fmtInt(m.tickets)}</div></div>
        <div><div className="eyebrow">Breaches</div><div className="num text-[20px]">{fmtInt(m.breaches)}</div></div>
        <div><div className="eyebrow">Breach rate</div><div className="num text-[20px] text-[hsl(var(--chart-2))]">{fmtPct(m.breach_rate)}</div></div>
        <div><div className="eyebrow">Median response</div><div className="num text-[20px]">{fmtMin(m.median_response_minutes)}</div></div>
        <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground" data-testid="button-clear-agent"><X className="h-3.5 w-3.5" /> All agents</button>
      </div>
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-1.5">Why is this agent appearing in the review?</div>
          {m.breaches === 0 ? <p className="text-[12.5px] text-muted-foreground">No breaches in this selection.</p> : (
            <ul className="space-y-1">
              <Reason label="Channel concentration" row={top(d.channels)} total={m.breaches} />
              <Reason label="Arrival-shift concentration" row={top(d.arrival_shifts)} total={m.breaches} />
              <Reason label="Response-shift pattern" row={top(d.response_shifts)} total={m.breaches} />
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Observed concentration within the selected population; requires review, not a judgement of individual performance.</p>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Breached tickets</div>
          {q.isLoading && <LoadingBlock rows={2} />}
          {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}
          {q.data && (q.data.items.length ? <TicketLinks ids={q.data.items.map((t) => t.ticket_id)} max={40} /> : <p className="text-[12.5px] text-muted-foreground">None.</p>)}
        </div>
      </div>
    </div>
  );
}
