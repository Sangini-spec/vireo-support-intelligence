import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useGetVireoDashboard, type Filters } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { PageHeader, Section, Stat, StatStrip, LoadingBlock, ErrorBlock, Caveats, Pill, Disclosure, errMsg } from "@/components/primitives";
import { BreakdownTable, CrossTab, WeeklyChart } from "@/components/data";
import { KeyObservation } from "@/components/observation";
import { fmtInt, fmtPct, fmtPP, fmtINR, fmtMin, fmtSigned, deltaTone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ATTRIBUTION_EXPLAINER =
  "Arrival shift describes when the ticket entered the queue. Resolving shift describes the roster assignment of the agent ultimately attributed to the ticket. These are different dimensions and should not be interpreted as proof of individual causality. The roster is a planned assignment, not an attendance log.";

export default function Overview() {
  const { params, patch, meta } = useFilters();
  const q = useGetVireoDashboard(params);
  const d = q.data;
  const isMulti = !!d && d.period.days > 7;
  const c = d?.comparison;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Overview" title={d ? d.period.label : "SLA position"}
        lede={d ? `${d.period.start} to ${d.period.end} · ${d.period.days} days · all agents, channels and shifts unless filtered` : "First-response SLA position for the selected scope."}>
        {d && !isMulti && d.period.partial && <Pill tone="warn">Partial week</Pill>}
        {d && isMulti && d.period.partial && <Pill tone="neutral">Contains partial weeks</Pill>}
        <Link href="/weekly" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:border-primary" data-testid="link-open-weekly">Weekly review <ArrowRight className="h-3.5 w-3.5" /></Link>
      </PageHeader>

      {q.isLoading && <LoadingBlock rows={8} />}
      {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}

      {d && c && (
        <>
          <StatStrip>
            <Stat testId="stat-tickets" label="Eligible tickets" value={fmtInt(d.metrics.evaluated)} sub={`${fmtInt(d.metrics.tickets)} in scope · ${fmtInt(d.metrics.unknown)} unknown`} />
            <Stat testId="stat-breaches" label="Breaches" value={fmtInt(d.metrics.breaches)} />
            <Stat testId="stat-breach-rate" label="Breach rate" value={fmtPct(d.metrics.breach_rate)} tone="text-[hsl(var(--chart-2))]" />
            <Stat testId="stat-exposure" label="Est. SLA-credit exposure" value={fmtINR(d.metrics.exposure_inr)} sub={`${fmtINR(d.metrics.completed_exposure_inr)} completed · ${fmtINR(d.metrics.pending_exposure_inr)} pending`} />
            <Stat testId="stat-scenario" label="Operating target (analyst-selected)" value={fmtPct(d.scenario.target_rate, 0)} sub={`gap ${fmtPP(d.scenario.gap_pp)}`} />
            <Stat label="Median first response" value={fmtMin(d.metrics.median_response_minutes)} sub={`mean ${fmtMin(d.metrics.average_response_minutes)}`} />
          </StatStrip>

          <Section title="What changed?" note={c.available ? `Versus ${c.previous_period.label}${c.previous_period.partial ? " (partial)" : ""}` : undefined}>
            {c.available ? (
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-md border bg-card px-5 py-4" data-testid="text-what-changed">
                <div><div className="eyebrow">Breach rate</div><div className="num mt-1 text-[20px]">{fmtPct(c.previous.breach_rate)} → {fmtPct(d.metrics.breach_rate)}</div></div>
                <div><div className="eyebrow">Change</div><div className={cn("num mt-1 text-[20px]", deltaTone(c.rate_change_pp))}>{fmtPP(c.rate_change_pp)}</div></div>
                <div><div className="eyebrow">Breaches</div><div className="num mt-1 text-[20px]">{fmtInt(c.previous.breaches)} → {fmtInt(d.metrics.breaches)} <span className={cn("text-[13px]", deltaTone(c.breach_change))}>({fmtSigned(c.breach_change)})</span></div></div>
                <div><div className="eyebrow">Tickets</div><div className="num mt-1 text-[20px]">{fmtInt(c.previous.tickets)} → {fmtInt(d.metrics.tickets)}</div></div>
              </div>
            ) : (
              <div className="rounded-md border bg-card px-5 py-3 text-sm text-muted-foreground" data-testid="text-what-changed">Prior comparison unavailable. {c.note}</div>
            )}
          </Section>

          <Section title="Where are breaches concentrated?" note="Click a row to narrow every page to that segment.">
            <div className="grid gap-4 xl:grid-cols-2">
              <div><div className="eyebrow mb-1.5">Channel</div>
                <BreakdownTable testId="table-channels" keyLabel="Channel" rows={d.channels} showTarget onPick={(r) => patch({ channel: r.key as Filters["channel"] })} /></div>
              <div><div className="eyebrow mb-1.5">Resolving-agent roster shift</div>
                <BreakdownTable testId="table-resolving-shifts" keyLabel="Roster shift" rows={d.resolving_shifts} onPick={(r) => patch({ shift: r.key as Filters["shift"] })} /></div>
            </div>
            <div className="mt-3">
              <Disclosure title="Resolving-agent roster team" hint={`${d.roster_teams.length} teams`}>
                <BreakdownTable testId="table-roster-teams" keyLabel="Roster team" rows={d.roster_teams} onPick={(r) => patch({ team: r.key })} />
              </Disclosure>
            </div>
          </Section>

          <Section title="Key operational observation">
            <KeyObservation cells={d.crosstab} />
          </Section>

          <div className="space-y-2">
            <Disclosure title="Arrival shift vs resolving shift" hint="supporting evidence for the observation" testId="disclosure-attribution">
              <p className="text-[12.5px] text-foreground/80">{ATTRIBUTION_EXPLAINER}</p>
              <CrossTab cells={d.crosstab} onPick={(a, r) => patch({ arrival_shift: a as Filters["arrival_shift"], shift: r as Filters["shift"] })} />
              <div className="grid gap-4 lg:grid-cols-2">
                <div><div className="eyebrow mb-1.5">Arrived during</div><BreakdownTable testId="table-arrival-shifts" keyLabel="Arrival shift" rows={d.arrival_shifts} onPick={(r) => patch({ arrival_shift: r.key as Filters["arrival_shift"] })} /></div>
                <div><div className="eyebrow mb-1.5">First response during</div><BreakdownTable testId="table-response-shifts" keyLabel="Response shift" rows={d.response_shifts} /></div>
              </div>
            </Disclosure>
            <Disclosure title="Weekly trend" hint="Monday–Sunday IST; * marks partial weeks">
              <WeeklyChart weeks={d.weekly} selected={params.week} onPick={(w) => patch({ week: w, start_date: undefined, end_date: undefined })} />
            </Disclosure>
            <Disclosure title="Data & methodology" hint="how these numbers are calculated" testId="disclosure-methodology">
              <p className="text-[12.5px]">{d.period.convention}. Policy effective {meta?.policy_effective_date ?? "—"}. Timestamps parsed as UTC and converted to IST. Breach = first response strictly greater than channel target. Exposure is estimated at ₹350 per breach; it is not credits paid. Scenario exposure difference at the {fmtPct(d.scenario.target_rate, 0)} target: {fmtINR(d.scenario.potential_difference_inr)} (scenario, not a forecast).</p>
              <p className="text-[12.5px] text-muted-foreground">{d.roster_method}</p>
              <Caveats items={[...(meta?.notices ?? []), ...d.caveats, d.scenario.caveat, c.note].filter(Boolean)} />
            </Disclosure>
          </div>
        </>
      )}
    </div>
  );
}
