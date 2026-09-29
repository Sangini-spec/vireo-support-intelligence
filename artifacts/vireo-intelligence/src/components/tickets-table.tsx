import { useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useGetVireoTickets, type GetVireoTicketsBreach } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/lib/filters";
import { useTicketViewer } from "@/components/ticket-sheet";
import { ErrorBlock, LoadingBlock, Pill, errMsg } from "@/components/primitives";
import { fmtMin, fmtINR, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TicketsTable({ defaultBreach = "breached" }: { defaultBreach?: GetVireoTicketsBreach }) {
  const { params } = useFilters();
  const { open } = useTicketViewer();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [breach, setBreach] = useState<GetVireoTicketsBreach>(defaultBreach);
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => setPage(1), [debounced, breach, params]);
  const q = useGetVireoTickets({ ...params, search: debounced || undefined, breach, page, page_size: 25 });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.page_size)) : 1;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket ID, message, notes…" className="h-7 w-[240px] pl-7 text-xs" maxLength={200} data-testid="input-ticket-search" />
        </div>
        <div className="flex rounded border p-0.5 text-[11px]">
          {(["breached", "within", "unknown", "all"] as const).map((b) => (
            <button key={b} onClick={() => setBreach(b)} data-testid={`button-breach-${b}`}
              className={cn("rounded px-2 py-0.5 capitalize", breach === b ? "bg-secondary font-medium" : "text-muted-foreground")}>{b}</button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">{d ? `${fmtInt(d.total)} tickets` : ""}</span>
      </div>
      {q.isLoading && <LoadingBlock rows={6} className="p-3" />}
      {q.isError && <div className="p-3"><ErrorBlock message={errMsg(q.error)} onRetry={() => q.refetch()} /></div>}
      {d && d.items.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">No tickets match this drilldown.</div>}
      {d && d.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" data-testid="table-tickets">
            <thead>
              <tr className="border-b text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Ticket</th>
                <th className="px-2 py-1.5 font-medium">Created IST</th>
                <th className="px-2 py-1.5 font-medium">Channel</th>
                <th className="px-2 py-1.5 font-medium">Arrived</th>
                <th className="px-2 py-1.5 font-medium">Roster shift</th>
                <th className="px-2 py-1.5 font-medium">Agent</th>
                <th className="px-2 py-1.5 text-right font-medium">Response</th>
                <th className="px-2 py-1.5 font-medium">SLA</th>
                <th className="px-3 py-1.5 text-right font-medium">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((t) => (
                <tr key={t.ticket_id} onClick={() => open(t.ticket_id)} className="cursor-pointer border-b last:border-0 hover:bg-accent/50" data-testid={`row-ticket-${t.ticket_id}`}>
                  <td className="num px-3 py-1.5 text-primary">{t.ticket_id}</td>
                  <td className="num px-2 py-1.5">{t.created_ist}</td>
                  <td className="px-2 py-1.5">{t.channel}</td>
                  <td className="px-2 py-1.5">{t.arrival_shift}</td>
                  <td className="px-2 py-1.5">{t.roster_shift} <span className="text-muted-foreground">· {t.roster_team}</span></td>
                  <td className="px-2 py-1.5">{t.agent_name}</td>
                  <td className="num px-2 py-1.5 text-right">{fmtMin(t.response_minutes)}<span className="text-muted-foreground"> / {t.target_minutes ?? "—"}m</span></td>
                  <td className="px-2 py-1.5">{t.breached === true ? <Pill tone="bad">breach</Pill> : t.breached === false ? <Pill tone="good">within</Pill> : <Pill tone="warn">unknown</Pill>}</td>
                  <td className="num px-3 py-1.5 text-right">{fmtINR(t.exposure_inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && d.total > d.page_size && (
        <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5 text-[11px]">
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}
