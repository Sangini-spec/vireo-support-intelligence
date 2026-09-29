import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { FileText } from "lucide-react";
import { useGetVireoDashboard, useGetVireoWeeks, type Filters } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { PageHeader, Section, Stat, StatStrip, LoadingBlock, ErrorBlock, Caveats, Pill, Disclosure, errMsg } from "@/components/primitives";
import { KeyObservation } from "@/components/observation";
import { AgentSummary } from "@/components/agent-summary";
import { ATTRIBUTION_EXPLAINER } from "@/pages/overview";
import { BreakdownTable, CrossTab } from "@/components/data";
import { TicketsTable } from "@/components/tickets-table";
import { fmtInt, fmtPct, fmtPP, fmtINR, fmtSigned, deltaTone } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS: { key: keyof Filters; label: string }[] = [
  { key: "shift", label: "Shift" },
  { key: "channel", label: "Channel" },
  { key: "team", label: "Team" },
  { key: "agent", label: "Agent" },
];

export default function Weekly() {
  const { params, filters, patch, set, meta } = useFilters();
  const weeksQ = useGetVireoWeeks({ scope: params.scope });
  const q = useGetVireoDashboard(params);
  const d = q.data;
  const weeks = weeksQ.data ?? [];
  const seededRef = useRef(false);
  const noPeriod = !filters.week && !filters.start_date && !filters.end_date;
  const defaultWeek = meta?.default_week;
  useEffect(() => {
    if (seededRef.current || !defaultWeek) return;
    seededRef.current = true;
    if (noPeriod) patch({ week: defaultWeek });
  }, [defaultWeek, noPeriod, patch]);
  const agentName = meta?.agents.find((a) => a.agent_id === filters.agent)?.name;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Weekly Operations" title="Week review" lede="Select a week, read what changed, follow concentration down to real tickets, then brief.">
        <Link href="/brief" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:border-primary" data-testid="link-generate-brief"><FileText className="h-3.5 w-3.5" /> Brief this selection</Link>
      </PageHeader>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" data-testid="list-weeks">
        {weeksQ.isLoading && <LoadingBlock rows={1} className="w-full" />}
        {weeks.map((w) => {
          const active = filters.week === w.week;
          return (
            <button key={w.week} onClick={() => patch({ week: w.week, start_date: undefined, end_date: undefined })} data-testid={`button-week-${w.week}`}
              className={cn("min-w-[104px] shrink-0 rounded-md border px-2.5 py-1.5 text-left transition-colors", active ? "border-primary bg-accent" : "bg-card hover:border-foreground/30")}>
              <div className="text-[11px] font-medium">{w.label}</div>
              <div className="num mt-0.5 text-[13px]">{fmtPct(w.metrics.breach_rate)}</div>
              <div className="text-[10px] text-muted-foreground">{fmtInt(w.metrics.breaches)} br{w.partial ? " · partial" : ""}</div>
            </button>
          );
        })}
      </div>

      {q.isLoading && <LoadingBlock rows={8} />}
      {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}

      {d && (
        <>
          <Section title={`${d.period.label}`} note={`${d.period.start} to ${d.period.end} · ${d.period.convention}`} action={d.period.partial ? <Pill tone="warn">Partial · {d.period.days} days</Pill> : undefined}>
            <StatStrip>
              <Stat label="Breach rate" value={fmtPct(d.metrics.breach_rate)} sub={`${fmtInt(d.metrics.breaches)} of ${fmtInt(d.metrics.evaluated)} evaluated`} />
              <Stat label="Previous" value={fmtPct(d.comparison.previous.breach_rate)} sub={`${d.comparison.previous_period.label}${d.comparison.previous_period.partial ? " · partial" : ""}`} />
              <Stat label="Rate change" value={fmtPP(d.comparison.rate_change_pp)} tone={deltaTone(d.comparison.rate_change_pp)} sub={`breaches ${fmtSigned(d.comparison.breach_change)}`} />
              <Stat label="Volume change" value={d.comparison.volume_change_pct == null ? "—" : `${fmtSigned(Math.round(d.comparison.volume_change_pct * 10) / 10)}%`} sub={`${fmtInt(d.comparison.previous.tickets)} → ${fmtInt(d.metrics.tickets)}`} />
              <Stat label="Completed exposure" value={fmtINR(d.metrics.completed_exposure_inr)} sub="estimated SLA-credit" />
              <Stat label="Pending exposure" value={fmtINR(d.metrics.pending_exposure_inr)} sub="open tickets" />
            </StatStrip>
            {!d.comparison.available && <p className="mt-2 text-xs text-muted-foreground">{d.comparison.note}</p>}
          </Section>

          <Section title="What changed?" note="Largest movements versus the previous comparable period, from deterministic metrics.">
            {d.comparison.changes.length === 0 ? <div className="rounded-md border px-4 py-5 text-xs text-muted-foreground">No material changes computed. {d.comparison.note}</div> : (
              <div className="overflow-x-auto rounded-md border bg-card">
                <table className="w-full text-[12.5px]" data-testid="table-changes">
                  <thead><tr className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">Dimension</th><th className="px-2 py-1.5 font-medium">Segment</th>
                    <th className="px-2 py-1.5 text-right font-medium">Breaches</th><th className="px-2 py-1.5 text-right font-medium">Δ breaches</th>
                    <th className="px-2 py-1.5 text-right font-medium">Rate Δ</th><th className="px-2 py-1.5 text-right font-medium">Tickets</th>
                    <th className="px-3 py-1.5 text-right font-medium">Share now / prev</th>
                  </tr></thead>
                  <tbody>
                    {d.comparison.changes.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5 text-muted-foreground">{c.dimension}</td>
                        <td className="px-2 py-1.5 font-medium">{c.label}</td>
                        <td className="num px-2 py-1.5 text-right">{c.previous_breaches} → {c.current_breaches}</td>
                        <td className={cn("num px-2 py-1.5 text-right", deltaTone(c.breach_change))}>{fmtSigned(c.breach_change)}</td>
                        <td className={cn("num px-2 py-1.5 text-right", deltaTone(c.rate_change_pp))}>{fmtPP(c.rate_change_pp)}</td>
                        <td className="num px-2 py-1.5 text-right">{c.previous_tickets} → {c.current_tickets}</td>
                        <td className="num px-3 py-1.5 text-right">{fmtPct(c.current_share)} / {fmtPct(c.previous_share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Drill-down: week → shift → agent → ticket" note="Click a row to narrow. Filters carry across every page and into the brief.">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="drill-path">
              <span className="text-muted-foreground">{d.period.label}</span>
              {STEPS.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">/</span>
                  {filters[s.key] ? (
                    <button onClick={() => set(s.key, undefined)} className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground hover:line-through" data-testid={`button-clear-${s.key}`}>
                      {s.label}: {s.key === "agent" ? agentName ?? filters.agent : String(filters[s.key])}
                    </button>
                  ) : <span className="text-muted-foreground/60">{s.label}</span>}
                </span>
              ))}
            </div>
            <div className="eyebrow mb-1.5">Step 1 · Resolving-agent roster shift</div>
            <BreakdownTable testId="table-weekly-shifts" keyLabel="Roster shift" rows={d.resolving_shifts} selected={filters.shift} onPick={(r) => set("shift", r.key as Filters["shift"])} />
            <div className="mt-3"><KeyObservation cells={d.crosstab} /></div>
            <div className="mt-3 space-y-2">
              <Disclosure title="Arrival shift vs resolving shift" hint="when tickets entered the queue">
                <p className="text-[12.5px] text-foreground/80">{ATTRIBUTION_EXPLAINER}</p>
                <CrossTab cells={d.crosstab} onPick={(a, r) => patch({ arrival_shift: a as Filters["arrival_shift"], shift: r as Filters["shift"] })} />
                <BreakdownTable testId="table-weekly-arrival" keyLabel="Arrival shift" rows={d.arrival_shifts} selected={filters.arrival_shift} onPick={(r) => set("arrival_shift", r.key as Filters["arrival_shift"])} />
              </Disclosure>
              <Disclosure title="Channel and team" hint="optional narrowing">
                <BreakdownTable testId="table-weekly-channels" keyLabel="Channel" showTarget rows={d.channels} selected={filters.channel} onPick={(r) => set("channel", r.key as Filters["channel"])} />
                <div className="eyebrow">Resolving agent's roster team</div>
                <BreakdownTable testId="table-weekly-roster-teams" keyLabel="Roster team" rows={d.roster_teams} selected={filters.team} onPick={(r) => set("team", r.key)} />
                <div className="eyebrow">First-assigned team (routing; context only)</div>
                <BreakdownTable testId="table-weekly-assigned-teams" keyLabel="Assigned team" rows={d.assigned_teams} />
              </Disclosure>
            </div>
            <div className="mt-5">
              {filters.agent ? (
                <AgentSummary name={agentName ?? filters.agent} d={d} onClear={() => set("agent", undefined)} />
              ) : (
                <>
                  <div className="eyebrow mb-1.5">Step 2 · Agents — concentration for review, not performance scoring</div>
                  <BreakdownTable testId="table-weekly-agents" keyLabel="Agent" rows={d.agents} selected={filters.agent} onPick={(r) => set("agent", r.agent_id ?? r.key)}
                    extra={(r) => (r.shift || r.team ? <span className="text-[10.5px] text-muted-foreground">{[r.shift, r.team].filter(Boolean).join(" · ")}</span> : null)} />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Tier 1 and Tier 2 carry different work; volume is not compared across tiers. Aggregate concentration does not establish individual cause.</p>
                </>
              )}
            </div>
          </Section>

          <Section title="Step 3 · Ticket evidence" note="Open any ticket for the customer message, agent notes, roster context and source rows.">
            <TicketsTable />
          </Section>

          <Disclosure title="Data & methodology" hint="caveats for this selection"><Caveats items={d.caveats} /></Disclosure>
        </>
      )}
    </div>
  );
}
