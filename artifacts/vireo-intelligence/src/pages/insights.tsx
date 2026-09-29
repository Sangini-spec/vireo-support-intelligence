import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Tags } from "lucide-react";
import {
  useGetVireoInsights, useGenerateVireoInsights, useClassifyVireoTickets, useGetVireoEvaluation, useSubmitVireoEvaluation,
  getGetVireoInsightsQueryKey, getGetVireoEvaluationQueryKey,
  type Classification, type ClassificationResult, type AiProvenance, type EvaluationInputVerdict,
} from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Section, LoadingBlock, ErrorBlock, Pill, EmptyBlock, errMsg, Stat, StatStrip } from "@/components/primitives";
import { EvidenceList } from "@/components/data";
import { useTicketViewer } from "@/components/ticket-sheet";
import { useToast } from "@/hooks/use-toast";
import { fmtPct, fmtInt } from "@/lib/format";

export function Provenance({ p }: { p?: AiProvenance }) {
  if (!p) return null;
  return (
    <div className="num flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px] text-muted-foreground" data-testid="text-provenance">
      <span>model {p.model}</span><span>prompt {p.prompt_version}</span><span>taxonomy {p.taxonomy_version}</span>
      <span>data {p.dataset_version}</span><span>{new Date(p.generated_at).toLocaleString()}</span>
      {p.cached && <span>cached</span>}{p.token_usage != null && <span>{p.token_usage} tokens</span>}<span>{p.cost_note}</span>
    </div>
  );
}

export function AiStatusBanner({ status, message }: { status: string; message: string }) {
  if (status === "ready") return null;
  const tone = status === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-muted/50 text-foreground/80";
  const label = { unavailable: "AI unavailable", error: "AI error", not_generated: "Not generated yet", insufficient_evidence: "Insufficient evidence in the supplied data" }[status] ?? status;
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tone}`} data-testid={`status-ai-${status}`}>
      <span className="font-medium">{label}.</span> {message} <span className="text-muted-foreground">Deterministic metrics remain fully available.</span>
    </div>
  );
}

const REVIEWER_KEY = "vireo.reviewer";

function ReviewForm({ c, onDone }: { c: Classification; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const submit = useSubmitVireoEvaluation();
  const [reviewer, setReviewer] = useState(() => localStorage.getItem(REVIEWER_KEY) ?? "");
  const [note, setNote] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const go = (verdict: EvaluationInputVerdict) => {
    if (!reviewer.trim()) { toast({ title: "Reviewer name required", variant: "destructive" }); return; }
    localStorage.setItem(REVIEWER_KEY, reviewer.trim());
    submit.mutate({ data: { classification_id: c.id, verdict, reviewer: reviewer.trim(), note: note || undefined, unsupported_claim: unsupported } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVireoEvaluationQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/vireo/insights"] });
        toast({ title: `Marked ${verdict}` });
        onDone();
      },
      onError: (e) => toast({ title: "Review not saved", description: errMsg(e), variant: "destructive" }),
    });
  };
  return (
    <div className="mt-2 space-y-2 rounded border bg-background p-2.5">
      <div className="flex flex-wrap gap-2">
        <Input value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={100} placeholder="Reviewer name" className="h-7 w-[180px] text-xs" data-testid={`input-reviewer-${c.id}`} />
        <label className="flex items-center gap-1.5 text-[11.5px]"><Checkbox checked={unsupported} onCheckedChange={(v) => setUnsupported(v === true)} data-testid={`checkbox-unsupported-${c.id}`} /> Contains unsupported claim</label>
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Note (optional)" className="min-h-[52px] text-xs" data-testid={`input-note-${c.id}`} />
      <div className="flex gap-1.5">
        {(["correct", "incorrect", "uncertain"] as const).map((v) => (
          <Button key={v} size="sm" variant={v === "correct" ? "default" : "outline"} className="h-7 text-xs capitalize" disabled={submit.isPending} onClick={() => go(v)} data-testid={`button-verdict-${v}-${c.id}`}>{v}</Button>
        ))}
      </div>
    </div>
  );
}

function ClassificationRow({ c }: { c: Classification }) {
  const { open } = useTicketViewer();
  const [reviewing, setReviewing] = useState(false);
  return (
    <div className="border-b px-3 py-2.5 last:border-0" data-testid={`row-classification-${c.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <button onClick={() => open(c.ticket_id)} className="num text-primary hover:underline" data-testid={`link-class-ticket-${c.id}`}>{c.ticket_id}</button>
        <span className="font-medium">{c.category}</span>
        <span className="text-[11px] text-muted-foreground">source label: {c.source_category}</span>
        <Pill>{c.confidence} model confidence</Pill>
        <Pill tone={c.review_status === "correct" ? "good" : c.review_status === "incorrect" ? "bad" : c.review_status === "uncertain" ? "warn" : "neutral"}>{c.review_status}</Pill>
        <Button size="sm" variant="ghost" className="ml-auto h-6 text-[11px]" onClick={() => setReviewing((r) => !r)} data-testid={`button-review-${c.id}`}>{reviewing ? "Close" : "Review"}</Button>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{c.rationale}</p>
      {c.evidence.length > 0 && <div className="mt-1.5"><EvidenceList items={c.evidence} /></div>}
      {reviewing && <ReviewForm c={c} onDone={() => setReviewing(false)} />}
    </div>
  );
}

export default function Insights() {
  const { params } = useFilters();
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetVireoInsights(params);
  const evalQ = useGetVireoEvaluation();
  const gen = useGenerateVireoInsights();
  const classify = useClassifyVireoTickets();
  const [classResult, setClassResult] = useState<ClassificationResult | null>(null);
  const [sample, setSample] = useState(12);

  const runGen = (regenerate: boolean) =>
    gen.mutate({ data: { filters: params, regenerate } }, {
      onSuccess: (r) => qc.setQueryData(getGetVireoInsightsQueryKey(params), r),
      onError: (e) => toast({ title: "Insight generation failed", description: errMsg(e), variant: "destructive" }),
    });
  const runClassify = () =>
    classify.mutate({ data: { filters: params, sample_size: Math.min(20, Math.max(1, sample)) } }, {
      onSuccess: (r) => { setClassResult(r); qc.invalidateQueries({ queryKey: ["/api/vireo/insights"] }); },
      onError: (e) => toast({ title: "Classification failed", description: errMsg(e), variant: "destructive" }),
    });

  const d = q.data;
  const ev = evalQ.data;
  const classifications = classResult?.classifications.length ? classResult.classifications : d?.classifications ?? [];

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="AI Insights" title="Interpretations, grounded in evidence" lede="AI reads computed metrics and real ticket text. It never calculates SLA figures. Hypotheses are not findings.">
        <Button size="sm" onClick={() => runGen(false)} disabled={gen.isPending} data-testid="button-generate-insights"><Sparkles className="mr-1.5 h-3.5 w-3.5" />{gen.isPending ? "Generating…" : "Generate"}</Button>
        <Button size="sm" variant="outline" onClick={() => runGen(true)} disabled={gen.isPending} data-testid="button-regenerate-insights"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Regenerate</Button>
      </PageHeader>

      {q.isLoading && <LoadingBlock rows={6} />}
      {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {d && (
        <Section title="Operational hypotheses" note={d.evaluation_status}>
          <AiStatusBanner status={d.status} message={d.message} />
          {d.status === "ready" && d.insights.length === 0 && <EmptyBlock title="No insights returned" body="The model found nothing it could support with evidence for this selection." />}
          <div className="mt-3 space-y-3">
            {d.insights.map((i, n) => (
              <article key={i.id} className="rise rounded-md border bg-card" data-testid={`card-insight-${i.id}`} style={{ animationDelay: `${n * 60}ms` }}>
                <div className="flex items-start justify-between gap-3 border-b px-4 py-2.5">
                  <h3 className="display text-[17px] leading-snug">{i.observation}</h3>
                  <Pill tone={i.confidence === "high" ? "info" : "neutral"}>{i.confidence} confidence</Pill>
                </div>
                <div className="grid gap-x-6 gap-y-3 px-4 py-3 text-[12.5px] md:grid-cols-2">
                  <div><div className="eyebrow">Evidence</div><p className="mt-0.5">{i.evidence_summary}</p></div>
                  <div><div className="eyebrow">Hypothesis</div><p className="mt-0.5">{i.hypothesis}</p></div>
                  <div><div className="eyebrow">Limitation</div><p className="mt-0.5 text-muted-foreground">{i.limitation}</p></div>
                  <div><div className="eyebrow">Suggested investigation</div><p className="mt-0.5">{i.investigation}</p></div>
                </div>
                {i.evidence.length > 0 && <div className="border-t px-4 py-3"><EvidenceList items={i.evidence} /></div>}
              </article>
            ))}
          </div>
          <div className="mt-2"><Provenance p={d.provenance} /></div>
        </Section>
      )}

      <Section title="Ticket text classification" note="Taxonomy derived from observed text. Source category fields are kept as labels, not ground truth."
        action={
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={20} value={sample} onChange={(e) => setSample(Number(e.target.value))} className="h-7 w-16 text-xs" data-testid="input-sample-size" />
            <Button size="sm" variant="outline" onClick={runClassify} disabled={classify.isPending} data-testid="button-classify"><Tags className="mr-1.5 h-3.5 w-3.5" />{classify.isPending ? "Classifying…" : "Classify sample"}</Button>
          </div>
        }>
        {classResult && <AiStatusBanner status={classResult.status} message={classResult.message} />}
        {classResult && classResult.taxonomy.length > 0 && (
          <div className="mb-3 mt-2 flex flex-wrap gap-1.5">
            {classResult.taxonomy.map((t) => <span key={t.name} title={t.definition} className="rounded border px-2 py-0.5 text-[11px]">{t.name}</span>)}
          </div>
        )}
        {classifications.length === 0 ? <EmptyBlock title="No classifications yet" body="Classify a sample of up to 20 tickets from the current filters to begin human review." /> : (
          <div className="rounded-md border bg-card">{classifications.map((c) => <ClassificationRow key={c.id} c={c} />)}</div>
        )}
        {classResult && <div className="mt-2"><Provenance p={classResult.provenance} /></div>}
      </Section>

      <Section title="AI evaluation (human review)" note={ev?.methodology ?? "Accuracy exists only once humans review classifications. Model confidence is never accuracy."}>
        {evalQ.isLoading && <LoadingBlock rows={2} />}
        {evalQ.isError && <ErrorBlock message={errMsg(evalQ.error)} onRetry={() => evalQ.refetch()} />}
        {ev && (
          <>
            {ev.observed_accuracy == null && <p className="mb-2 text-[12.5px] text-muted-foreground">No human-labeled benchmark has yet been completed for the AI insight layer. AI observations are therefore presented as evidence-backed hypotheses rather than measured accuracy claims. This is an intentional limitation, separate from the deterministic analytics validation.</p>}
            <StatStrip>
              <Stat testId="stat-eval-status" label="Status" value={<span className="text-[15px]">{ev.status}</span>} />
              <Stat label="Reviewed" value={fmtInt(ev.sample_size)} />
              <Stat label="Correct" value={fmtInt(ev.correct)} />
              <Stat label="Incorrect / uncertain" value={`${ev.incorrect} / ${ev.uncertain}`} />
              <Stat testId="stat-observed-accuracy" label="Observed accuracy" value={ev.observed_accuracy == null ? <span className="text-[15px]">Not yet measured</span> : fmtPct(ev.observed_accuracy)} />
              <Stat label="Unsupported-claim rate" value={ev.unsupported_claim_rate == null ? "—" : fmtPct(ev.unsupported_claim_rate)} />
            </StatStrip>
            {ev.reviews.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-md border bg-card">
                <table className="w-full text-[12px]" data-testid="table-reviews">
                  <thead><tr className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">Ticket</th><th className="px-2 py-1.5 font-medium">Verdict</th><th className="px-2 py-1.5 font-medium">Reviewer</th><th className="px-2 py-1.5 font-medium">Unsupported</th><th className="px-2 py-1.5 font-medium">Note</th><th className="px-3 py-1.5 font-medium">When</th>
                  </tr></thead>
                  <tbody>{ev.reviews.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="num px-3 py-1.5">{r.ticket_id}</td><td className="px-2 py-1.5 capitalize">{r.verdict}</td><td className="px-2 py-1.5">{r.reviewer}</td>
                      <td className="px-2 py-1.5">{r.unsupported_claim ? "Yes" : "No"}</td><td className="px-2 py-1.5 text-muted-foreground">{r.note || "—"}</td>
                      <td className="num px-3 py-1.5 text-muted-foreground">{new Date(r.reviewed_at).toLocaleString()}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
