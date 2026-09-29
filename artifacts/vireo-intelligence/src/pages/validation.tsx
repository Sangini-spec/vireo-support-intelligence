import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { useGetVireoValidation, useGetVireoDuplicates, useGetVireoEvaluation, type ValidationCheck } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Section, LoadingBlock, ErrorBlock, Pill, Disclosure, errMsg } from "@/components/primitives";
import { TicketLinks } from "@/components/data";
import { SourceRowsTable } from "@/components/ticket-sheet";
import { fmtInt, fmtINR, fmtPct } from "@/lib/format";

const tone = (s: string) => (s === "PASS" ? "good" : s === "WARN" ? "warn" : "bad") as "good" | "warn" | "bad";

function CheckRow({ c }: { c: ValidationCheck }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0" data-testid={`row-check-${c.key}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/40" data-testid={`button-check-${c.key}`}>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="w-12"><Pill tone={tone(c.status)}>{c.status}</Pill></span>
        <span className="flex-1 text-[12.5px] font-medium">{c.label}</span>
        <span className="num text-[12px] text-muted-foreground">{fmtInt(c.count)}</span>
      </button>
      {open && (
        <div className="space-y-2 px-10 pb-3 text-[12.5px]">
          <p className="text-foreground/80">{c.explanation}</p>
          {c.ticket_ids.length > 0 ? <TicketLinks ids={c.ticket_ids} max={30} /> : <p className="text-[11px] text-muted-foreground">No ticket-level evidence for this check.</p>}
        </div>
      )}
    </div>
  );
}

export default function Validation() {
  const { params } = useFilters();
  const q = useGetVireoValidation(params);
  const [page, setPage] = useState(1);
  const [conflicts, setConflicts] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const dq = useGetVireoDuplicates({ page, page_size: 20, conflicts_only: conflicts || undefined });
  const evalQ = useGetVireoEvaluation();
  const ev = evalQ.data;
  const v = q.data;
  const r = v?.reconciliation;
  const qualityStatus = v?.checks.some((c) => c.status === "FAIL") ? "FAIL"
    : v?.checks.some((c) => c.status === "WARN") ? "WARN" : "PASS";
  const dups = dq.data;
  const pages = dups ? Math.max(1, Math.ceil(dups.total / dups.page_size)) : 1;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Validation" title="Can these numbers be trusted?" lede="Reconciliation confirms that totals balance. Source-data limitations and AI evaluation are reported separately." />
      {q.isLoading && <LoadingBlock rows={8} />}
      {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}

      <div className="border-b pb-1"><div className="eyebrow">A · Deterministic analytics validation</div><p className="text-[12px] text-muted-foreground">Balanced totals do not mean the source data has no limitations. Review both statuses below.</p></div>
      {v && r && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border bg-card px-4 py-3" data-testid="status-reconciliation">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">Reconciliation: <Pill tone={r.passes ? "good" : "bad"}>{r.passes ? "PASS" : "FAIL"}</Pill></div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">{r.passes ? "Selected totals, grouped counts and estimated exposure reconcile." : "Selected totals do not reconcile. Investigate before reporting."} {fmtInt(r.mapped)} of {fmtInt(r.selected_tickets)} selected records are roster-mapped.</p>
            </div>
            <div className="rounded-md border bg-card px-4 py-3" data-testid="status-data-quality">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">Data-quality limitations: <Pill tone={tone(qualityStatus)}>{qualityStatus}</Pill></div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">{qualityStatus === "PASS" ? "No source-data issues are flagged by the current checks." : qualityStatus === "WARN" ? "Source-data limitations remain, even when the selected numbers reconcile. Review the warnings below." : "Source-data checks have failures. Review the affected checks below."} These checks cover the supplied dataset, not only the selected records.</p>
            </div>
          </div>
          <Section title="Reconciliation" note={r.passes ? "Every stage reconciles." : "Reconciliation does not balance — investigate before reporting."}>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                { t: "Rows → canonical", rows: [["Raw rows", r.raw_rows], ["Duplicate copies", -r.duplicate_copies], ["Quarantined", -r.quarantined_rows], ["Canonical tickets", r.canonical_tickets], ["Selected by filters", r.selected_tickets]] },
                { t: "SLA outcome", rows: [["Selected", r.selected_tickets], ["Evaluated", r.evaluated], ["Breaches", r.breaches], ["Within target", r.non_breaches], ["Unknown", r.unknown]] },
                { t: "Roster mapping", rows: [["Mapped", r.mapped], ["Unmapped", r.unmapped], ["Multiple matches", r.multiple_roster_matches], ["Channel total", r.channels_total], ["Shift total", r.shifts_total], ["Agent total", r.agents_total]] },
              ].map((b) => (
                <div key={b.t} className="rounded-md border bg-card px-4 py-3">
                  <div className="eyebrow mb-1.5">{b.t}</div>
                  {b.rows.map(([k, n]) => (
                    <div key={k as string} className="flex justify-between border-b border-dashed py-1 text-[12.5px] last:border-0">
                      <span className="text-muted-foreground">{k}</span><span className="num">{(n as number) < 0 ? `−${fmtInt(-(n as number))}` : fmtInt(n as number)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-2.5 text-[12.5px]">
              <span className="text-muted-foreground">Exposure check</span>
              <span className="num">{fmtINR(r.exposure_inr)}</span><span className="text-muted-foreground">computed vs</span><span className="num">{fmtINR(r.expected_exposure_inr)}</span><span className="text-muted-foreground">expected (breaches × ₹350)</span>
              <Pill tone={r.passes ? "good" : "bad"}>{r.passes ? "Balanced" : "Mismatch"}</Pill>
            </div>
          </Section>

          <Section title="Data-quality checks" note="All original checks and warnings are retained. Expand for explanation and linked evidence tickets.">
            <div className="rounded-md border bg-card">{v.checks.map((c) => <CheckRow key={c.key} c={c} />)}</div>
          </Section>

          <Disclosure title="Methodology and source files" hint="how the numbers are produced">
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Methodology">
              <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-foreground/85">{v.methodology.map((m, i) => <li key={i}>{m}</li>)}</ol>
            </Section>
            <Section title="Source files">
              <table className="w-full text-[12px]"><tbody>{v.source_files.map((f) => (
                <tr key={f.name} className="border-b last:border-0"><td className="py-1 font-medium">{f.name}</td><td className="num text-right">{fmtInt(f.rows)} rows</td><td className="num pl-3 text-right text-[10.5px] text-muted-foreground" title={f.sha256}>{f.sha256.slice(0, 12)}…</td></tr>
              ))}</tbody></table>
              <p className="num mt-2 text-[10.5px] text-muted-foreground">dataset {v.dataset_version}</p>
            </Section>
          </div>
          </Disclosure>
        </>
      )}

      <Section title="Duplicate audit" note="Deterministic rule. Canonical row is highlighted; every source row is preserved. Conflicting business fields are quarantined for review, not silently resolved."
        action={<label className="flex items-center gap-2 text-xs"><Switch checked={conflicts} onCheckedChange={(c) => { setConflicts(c); setPage(1); }} data-testid="switch-conflicts-only" /> Conflicts only</label>}>
        {dq.isLoading && <LoadingBlock rows={5} />}
        {dq.isError && <ErrorBlock message={errMsg(dq.error)} onRetry={() => dq.refetch()} />}
        {dups && dups.items.length === 0 && <div className="rounded-md border px-4 py-6 text-center text-xs text-muted-foreground">No duplicate groups{conflicts ? " with conflicts" : ""}.</div>}
        {dups && dups.items.length > 0 && (
          <div className="rounded-md border bg-card" data-testid="table-duplicates">
            {dups.items.map((g) => (
              <div key={g.group_id} className="border-b last:border-0">
                <button onClick={() => setExpanded(expanded === g.group_id ? null : g.group_id)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-accent/40" data-testid={`button-dup-${g.group_id}`}>
                  {expanded === g.group_id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="num w-28 text-muted-foreground">{g.group_id}</span>
                  <span className="num font-medium">{g.ticket_id}</span>
                  <span className="text-muted-foreground">{g.source_systems.join(" + ")}</span>
                  {g.quarantined ? <Pill tone="bad">quarantined</Pill> : <Pill tone="good">canonical row {g.canonical_row_number}</Pill>}
                  {g.differing_fields.length > 0 && <span className="text-[11px] text-[hsl(32_60%_32%)]">differs: {g.differing_fields.join(", ")}</span>}
                  <span className="ml-auto max-w-[40%] truncate text-[11.5px] text-muted-foreground">{g.reason}</span>
                </button>
                {expanded === g.group_id && <div className="space-y-2 px-3 pb-3"><p className="text-[12px]">{g.reason}</p><SourceRowsTable rows={g.rows} canonical={g.canonical_row_number} /></div>}
              </div>
            ))}
            <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5 text-[11px]">
              <span className="text-muted-foreground">{fmtInt(dups.total)} groups · page {page} of {pages}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-dup-prev"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-dup-next"><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </Section>

      <div className="border-b pb-1 pt-2"><div className="eyebrow">B · AI evaluation</div><p className="text-[12px] text-muted-foreground">Separate from the checks above. Requires human labels.</p></div>
      <Section title="AI evaluation status">
        {evalQ.isLoading && <LoadingBlock rows={2} />}
        {evalQ.isError && <ErrorBlock message={errMsg(evalQ.error)} onRetry={() => evalQ.refetch()} />}
        {ev && (
          <div className="rounded-md border bg-card px-5 py-4 text-[12.5px]" data-testid="panel-ai-evaluation">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div><div className="eyebrow">Evaluation status</div><div className="mt-0.5 text-[15px]">{ev.observed_accuracy == null ? "Not yet measured" : ev.status}</div></div>
              <div><div className="eyebrow">Human-reviewed sample</div><div className="num mt-0.5 text-[15px]">{fmtInt(ev.sample_size)}</div></div>
              <div><div className="eyebrow">Observed accuracy</div><div className="num mt-0.5 text-[15px]">{ev.observed_accuracy == null ? "—" : fmtPct(ev.observed_accuracy)}</div></div>
              <div><div className="eyebrow">Unsupported-claim rate</div><div className="num mt-0.5 text-[15px]">{ev.unsupported_claim_rate == null ? "—" : fmtPct(ev.unsupported_claim_rate)}</div></div>
            </div>
            {ev.observed_accuracy == null && <p className="mt-3 text-foreground/80">No human-labeled benchmark has yet been completed for the AI insight layer. AI observations are therefore presented as evidence-backed hypotheses rather than measured accuracy claims. This is an intentional limitation, not an application failure.</p>}
            <p className="mt-2 text-muted-foreground">{ev.methodology}</p>
            {v && <p className="mt-1 text-muted-foreground">{v.ai_evaluation_status}</p>}
            <p className="mt-2 text-[11.5px]">Review classifications on the AI Insights page to build the labelled sample.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
