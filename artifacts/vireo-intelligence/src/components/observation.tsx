import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import type { CrossTabCell, Filters } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { fmtInt, fmtPct } from "@/lib/format";

export interface Pattern {
  sentence: string;
  arrival: string;
  resolving: string;
}

/** Derives a neutral one-sentence pattern from the validated crosstab. No stock claims. */
export function derivePattern(cells: CrossTabCell[]): Pattern | null {
  const total = cells.reduce((s, c) => s + c.breaches, 0);
  if (!total) return null;
  const top = [...cells].sort((a, b) => b.breaches - a.breaches)[0];
  const share = (top.breaches / total) * 100;
  const cross = top.arrival_shift !== top.resolving_shift;
  const arrivalTotal = cells.filter((c) => c.arrival_shift === top.arrival_shift).reduce((s, c) => s + c.breaches, 0);
  const sentence = cross
    ? `${fmtInt(top.breaches)} of ${fmtInt(total)} breaches (${fmtPct(share)}) arrived during ${top.arrival_shift} hours but were attributed to ${top.resolving_shift}-rostered resolving agents — the largest single arrival × resolving combination. ${top.arrival_shift}-arrival tickets account for ${fmtInt(arrivalTotal)} breaches overall. This is a pattern worth investigating (for example queue carryover or coverage); it does not establish individual causality.`
    : `The largest concentration is ${fmtInt(top.breaches)} of ${fmtInt(total)} breaches (${fmtPct(share)}) that both arrived during ${top.arrival_shift} hours and were attributed to ${top.resolving_shift}-rostered resolving agents (breach rate ${fmtPct(top.breach_rate)} on ${fmtInt(top.tickets)} tickets). This is an observed concentration, not evidence of individual causality.`;
  return { sentence, arrival: top.arrival_shift, resolving: top.resolving_shift };
}

export function KeyObservation({ cells }: { cells: CrossTabCell[] }) {
  const { patch } = useFilters();
  const [, go] = useLocation();
  const p = derivePattern(cells);
  if (!p) return <div className="rounded-md border px-4 py-4 text-sm text-muted-foreground">No breaches in this selection, so there is no concentration to report.</div>;
  const arrivalOk = ["Morning", "Day", "Night", "Unknown"].includes(p.arrival);
  const resOk = ["Morning", "Day", "Night", "Unmapped"].includes(p.resolving);
  return (
    <div className="rise rounded-md border-l-[3px] border-[hsl(var(--chart-2))] bg-card px-5 py-4" data-testid="text-key-observation">
      <div className="eyebrow">Key operational observation · from validated counts</div>
      <p className="display mt-1.5 text-[18px] leading-snug">{p.sentence}</p>
      <button
        onClick={() => {
          patch({ arrival_shift: arrivalOk ? (p.arrival as Filters["arrival_shift"]) : undefined, shift: resOk ? (p.resolving as Filters["shift"]) : undefined });
          go("/weekly");
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
        data-testid="button-investigate-breaches"
      >
        Investigate these breaches <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
