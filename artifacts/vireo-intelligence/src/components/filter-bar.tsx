import { X, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGetVireoWeeks, type Filters } from "@workspace/api-client-react";
import { useFilters, FILTER_LABELS } from "@/lib/filters";

const ANY = "__any";

function Pick({ label, value, options, onChange, testId, width = "w-[132px]", allLabel = "All" }: {
  allLabel?: string; label: string; value?: string; options: { value: string; label: string }[]; onChange: (v: string | undefined) => void; testId: string; width?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
        <SelectTrigger className={`h-8 ${width} text-xs`} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function FilterBar() {
  const { filters, meta, set, patch, reset, params } = useFilters();
  const weeksQ = useGetVireoWeeks({ scope: params.scope });
  const weeks = weeksQ.data ?? [];
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  const scope = filters.scope ?? "policy";

  const active = (Object.keys(filters) as (keyof Filters)[]).filter((k) => k !== "scope" && k !== "week" && filters[k]);

  return (
    <div className="border-b bg-card/80 backdrop-blur" data-testid="filter-bar">
      <div className="flex flex-wrap items-end gap-2.5 px-5 py-2.5 md:px-8">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</span>
          <div className="flex h-8 rounded-md border p-0.5 text-xs">
            {(["policy", "historical"] as const).map((s) => (
              <button
                key={s}
                onClick={() => set("scope", s)}
                data-testid={`button-scope-${s}`}
                className={`rounded px-2.5 capitalize transition-colors ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </label>
        <Pick
          label="Week (Mon–Sun IST)"
          allLabel="All weeks · full baseline"
          width="w-[190px]"
          value={filters.week}
          testId="select-week"
          onChange={(v) => patch({ week: v, start_date: undefined, end_date: undefined })}
          options={[...weeks].reverse().map((w) => ({ value: w.week, label: `${w.label}${w.partial ? " · partial" : ""}` }))}
        />
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">From / to (IST)</span>
          <div className="flex gap-1">
            <Input type="date" className="h-8 w-[132px] text-xs" value={filters.start_date ?? ""} min={meta?.date_start} max={meta?.date_end}
              onChange={(e) => patch({ start_date: e.target.value || undefined, week: undefined })} data-testid="input-start-date" />
            <Input type="date" className="h-8 w-[132px] text-xs" value={filters.end_date ?? ""} min={meta?.date_start} max={meta?.date_end}
              onChange={(e) => patch({ end_date: e.target.value || undefined, week: undefined })} data-testid="input-end-date" />
          </div>
        </label>
        <Pick label="Channel" value={filters.channel} testId="select-channel" onChange={(v) => set("channel", v as Filters["channel"])} options={opts(meta?.channels ?? ["chat", "email", "voice", "social"])} />
        <Pick label="Resolving shift" value={filters.shift} testId="select-shift" onChange={(v) => set("shift", v as Filters["shift"])} options={opts(["Morning", "Day", "Night", "Unmapped"])} />
        <Pick label="Arrival shift" value={filters.arrival_shift} testId="select-arrival-shift" onChange={(v) => set("arrival_shift", v as Filters["arrival_shift"])} options={opts(["Morning", "Day", "Night", "Unknown"])} />
        <Pick label="Roster team" value={filters.team} testId="select-team" onChange={(v) => set("team", v)} options={opts(meta?.teams ?? [])} />
        <Pick label="Agent" width="w-[160px]" value={filters.agent} testId="select-agent" onChange={(v) => set("agent", v)} options={(meta?.agents ?? []).map((a) => ({ value: a.agent_id, label: `${a.name} · T${a.tier}` }))} />
        <Pick label="Tier" width="w-[88px]" value={filters.tier} testId="select-tier" onChange={(v) => set("tier", v as Filters["tier"])} options={[{ value: "1", label: "Tier 1" }, { value: "2", label: "Tier 2" }]} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Roster date by</span>
          <Select value={filters.roster_event ?? "created"} onValueChange={(v) => set("roster_event", v === "created" ? undefined : (v as Filters["roster_event"]))}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-roster-event"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Ticket creation (default)</SelectItem>
              <SelectItem value="first_response">First response</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset} data-testid="button-reset-filters">
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
      {(scope === "historical" || active.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-2.5 md:px-8">
          {scope === "historical" && (
            <span className="rounded bg-[hsl(38_70%_52%/0.15)] px-2 py-0.5 text-[11px] text-[hsl(32_60%_30%)]" data-testid="text-historical-caveat">
              Historical scope includes tickets created before {meta?.policy_effective_date ?? "the policy date"}; SLA targets are applied retrospectively.
            </span>
          )}
          {active.map((k) => (
            <button key={k} onClick={() => set(k, undefined)} data-testid={`chip-filter-${k}`}
              className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px] hover:border-primary">
              <span className="text-muted-foreground">{FILTER_LABELS[k]}:</span> {k === "agent" ? meta?.agents.find((a) => a.agent_id === filters.agent)?.name ?? filters.agent : String(filters[k])}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
