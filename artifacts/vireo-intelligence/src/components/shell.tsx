import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, CalendarRange, Sparkles, MessageSquareText, FileText, ShieldCheck } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { useFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/weekly", label: "Weekly Operations", icon: CalendarRange },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
  { href: "/ask", label: "Ask AI", icon: MessageSquareText },
  { href: "/brief", label: "Manager Brief", icon: FileText },
  { href: "/validation", label: "Validation", icon: ShieldCheck },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { meta } = useFilters();
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-[100dvh] md:w-[216px]">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M2 3 L9 15 L16 3" fill="none" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" />
              <circle cx="9" cy="6" r="1.6" fill="hsl(var(--sidebar-foreground))" />
            </svg>
            <span className="display text-[17px] text-sidebar-accent-foreground">Vireo</span>
          </div>
          <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-sidebar-foreground/55">Support Intelligence</div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((n) => {
            const active = n.href === "/" ? loc === "/" : loc.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn("flex items-center gap-2.5 whitespace-nowrap rounded px-3 py-1.5 text-[13px] transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground")}>
                <n.icon className={cn("h-3.5 w-3.5", active && "text-sidebar-primary")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden space-y-1 border-t border-sidebar-border px-5 py-4 text-[11px] text-sidebar-foreground/60 md:block">
          {meta ? (
            <>
              <div className="num text-sidebar-foreground/80">{meta.dataset_version}</div>
              <div>{meta.canonical_tickets.toLocaleString("en-IN")} canonical tickets</div>
              <div>{meta.date_start} → {meta.date_end}</div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.ai_available ? "bg-[hsl(160_40%_55%)]" : "bg-sidebar-foreground/40")} />
                AI {meta.ai_available ? `available · ${meta.ai_model}` : "unavailable"}
              </div>
            </>
          ) : (
            <div>Loading dataset…</div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20"><FilterBar /></div>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
