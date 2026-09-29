import { createContext, useContext, useState, type ReactNode } from "react";
import { useGetVireoTicket, getGetVireoTicketQueryKey, type SourceRow } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Caveats, Disclosure, ErrorBlock, LoadingBlock, Pill, errMsg } from "@/components/primitives";
import { fmtINR, fmtMin } from "@/lib/format";

const Ctx = createContext<{ open: (id: string) => void }>({ open: () => {} });
export const useTicketViewer = () => useContext(Ctx);

export function TicketViewerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={{ open: setId }}>
      {children}
      <Sheet open={!!id} onOpenChange={(o) => !o && setId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[680px]" data-testid="sheet-ticket">
          {id && <TicketDetailView id={id} />}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed py-1 text-[12.5px] last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function SourceRowsTable({ rows, canonical }: { rows: SourceRow[]; canonical?: number | null }) {
  const cols: (keyof SourceRow)[] = ["row_number", "source_system", "created_at", "first_response_at", "resolved_at", "status", "channel", "category", "priority", "assigned_team", "agent_id", "transfers", "csat_score", "refund_amount_inr", "refund_reason_code", "replacement_issued", "customer_id", "order_id", "product_sku"];
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {cols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1 font-medium text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row_number} className={`border-b last:border-0 ${canonical === r.row_number ? "bg-accent/60" : ""}`}>
              {cols.map((c) => (
                <td key={c} className="num whitespace-nowrap px-2 py-1">
                  {String(r[c]) === "" ? <span className="text-muted-foreground/60">blank</span> : String(r[c])}
                  {c === "row_number" && canonical === r.row_number && <span className="ml-1 font-sans text-[9.5px] uppercase text-primary">canonical</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketDetailView({ id }: { id: string }) {
  const q = useGetVireoTicket(id, { query: { enabled: !!id, queryKey: getGetVireoTicketQueryKey(id) } });
  const d = q.data;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="num text-base">{id}</SheetTitle>
        <SheetDescription>Canonical ticket record with source rows and roster context.</SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-5">
        {q.isLoading && <LoadingBlock rows={8} />}
        {q.isError && <ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {d && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {d.ticket.breached === true && <Pill tone="bad">Breached by {fmtMin(d.ticket.breach_minutes)}</Pill>}
              {d.ticket.breached === false && <Pill tone="good">Within target</Pill>}
              {d.ticket.breached == null && <Pill tone="warn">SLA unknown</Pill>}
              <Pill>{d.ticket.channel}</Pill>
              <Pill>{d.ticket.status}</Pill>
              {d.ticket.quality_flags.map((f) => <Pill key={f} tone="warn">{f}</Pill>)}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="eyebrow mb-1">Timing (IST)</div>
                <KV k="Created" v={<span className="num">{d.ticket.created_ist}</span>} />
                <KV k="First response" v={<span className="num">{d.ticket.first_response_ist ?? "—"}</span>} />
                <KV k="Resolved (UTC)" v={<span className="num">{d.ticket.resolved_at ?? "—"}</span>} />
                <KV k="Response time" v={<span className="num">{fmtMin(d.ticket.response_minutes)}</span>} />
                <KV k="Target" v={<span className="num">{d.ticket.target_minutes != null ? `${d.ticket.target_minutes}m` : "—"}</span>} />
                <KV k="Est. SLA-credit exposure" v={<span className="num">{fmtINR(d.ticket.exposure_inr)}</span>} />
              </div>
              <div>
                <div className="eyebrow mb-1">Attribution — kept separate</div>
                <KV k="Arrival shift" v={d.ticket.arrival_shift} />
                <KV k="Response shift" v={d.ticket.response_shift} />
                <KV k="Resolving agent" v={`${d.ticket.agent_name} (${d.ticket.agent_id})`} />
                <KV k="Roster shift / team" v={`${d.ticket.roster_shift} · ${d.ticket.roster_team}`} />
                <KV k="Roster tier" v={d.ticket.roster_tier} />
                <KV k="First-assigned team" v={d.ticket.assigned_team} />
              </div>
            </div>

            <div className="space-y-2">
              <Disclosure title="Customer message" hint="verbatim, untrusted content">
                <blockquote className="rounded bg-muted/60 px-3 py-2 text-[13px] leading-relaxed" data-testid="text-customer-message">{d.customer_message || <span className="text-muted-foreground">Blank in source</span>}</blockquote>
              </Disclosure>
              <Disclosure title="Agent notes" hint="verbatim, untrusted content">
                <blockquote className="rounded bg-muted/60 px-3 py-2 text-[13px] leading-relaxed" data-testid="text-agent-notes">{d.agent_notes || <span className="text-muted-foreground">Blank in source</span>}</blockquote>
              </Disclosure>
            </div>

            <Disclosure title="Order, product, calculation, roster and source rows" hint="audit detail">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="eyebrow mb-1">Customer & order</div>
                <KV k="Customer" v={<span className="num">{d.customer_id}</span>} />
                <KV k="Order" v={<span className="num">{d.order_id ?? "—"}</span>} />
                <KV k="Source category" v={d.ticket.category} />
                <KV k="CSAT" v={d.csat_score ?? "—"} />
                <KV k="Refund (raw)" v={d.refund_amount_raw ?? "—"} />
                <KV k="Refund reason" v={d.refund_reason_code ?? "—"} />
                <KV k="Replacement issued" v={d.replacement_issued ? "Yes" : "No"} />
                {d.order && <KV k="Order value" v={fmtINR(d.order.order_value_inr)} />}
                {d.order && <KV k="Lot" v={d.order.lot_code} />}
              </div>
              <div>
                <div className="eyebrow mb-1">Product</div>
                <KV k="SKU" v={<span className="num">{d.product_sku}</span>} />
                {d.product ? (
                  <>
                    <KV k="Name" v={d.product.product_name} />
                    <KV k="Family" v={d.product.family} />
                    <KV k="Warranty" v={`${d.product.warranty_months} months`} />
                  </>
                ) : <div className="text-xs text-muted-foreground">No product record matched.</div>}
              </div>
            </div>

            <div>
              <div className="eyebrow mb-1">Calculation</div>
              <p className="num rounded bg-muted/50 px-3 py-2 text-[11.5px]">{d.calculation}</p>
            </div>

            <div>
              <div className="eyebrow mb-1">Roster assignments for {d.ticket.agent_id}</div>
              <table className="w-full text-[11.5px]">
                <tbody>
                  {d.roster_assignments.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{r.shift}</td><td>{r.team}</td><td>T{r.tier}</td><td>{r.site}</td>
                      <td className="num text-right">{r.from_date} → {r.to_date ?? "open"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10.5px] text-muted-foreground">Roster is a planned assignment, not an attendance log.</p>
            </div>

            {d.classifications.length > 0 && (
              <div>
                <div className="eyebrow mb-1">AI classifications</div>
                {d.classifications.map((c) => (
                  <div key={c.id} className="mb-2 rounded border px-3 py-2 text-[12.5px]">
                    <div className="flex items-center gap-2"><span className="font-medium">{c.category}</span><Pill>{c.confidence} model confidence</Pill><Pill tone={c.review_status === "correct" ? "good" : c.review_status === "incorrect" ? "bad" : "neutral"}>{c.review_status}</Pill></div>
                    <p className="mt-1 text-muted-foreground">{c.rationale}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">Source label: {c.source_category} · taxonomy {c.taxonomy_version}</p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="eyebrow mb-1">Source rows ({d.sources.length})</div>
              <SourceRowsTable rows={d.sources} />
            </div>
            <Caveats items={d.caveats} />
            </Disclosure>
          </>
        )}
      </div>
    </>
  );
}
