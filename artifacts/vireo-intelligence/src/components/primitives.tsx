import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, children, lede }: { eyebrow: string; title: string; lede?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="display mt-1 text-[28px] leading-tight">{title}</h1>
        {lede && <p className="mt-1.5 text-sm text-muted-foreground">{lede}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Section({ title, note, children, action, className }: { title: string; note?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("rise", className)}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, testId }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; testId?: string }) {
  return (
    <div className="min-w-0 px-4 py-3" data-testid={testId}>
      <div className="eyebrow">{label}</div>
      <div className={cn("num mt-1 text-[22px] leading-none", tone)}>{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 divide-x divide-y rounded-md border bg-card md:grid-cols-3 md:divide-y-0 xl:grid-cols-6 [&>*]:border-border">{children}</div>;
}

export function LoadingBlock({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="status-error">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span>{message ?? "Could not load this data from the API."}</span>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-md border border-dashed px-6 py-10 text-center">
      <div className="display text-lg">{title}</div>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

export function Caveats({ items, title = "Caveats" }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="rounded-md border-l-2 border-[hsl(var(--chart-3))] bg-[hsl(38_70%_52%/0.07)] px-4 py-2.5">
      <div className="eyebrow mb-1">{title}</div>
      <ul className="space-y-0.5 text-[12.5px] leading-relaxed text-foreground/80">
        {items.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "bad" | "good" | "info" }) {
  const t = {
    neutral: "bg-muted text-muted-foreground",
    warn: "bg-[hsl(38_70%_52%/0.15)] text-[hsl(32_60%_32%)]",
    bad: "bg-destructive/10 text-destructive",
    good: "bg-[hsl(160_35%_40%/0.12)] text-[hsl(160_40%_26%)]",
    info: "bg-accent text-accent-foreground",
  }[tone];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide", t)}>{children}</span>;
}

export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  const any = e as { data?: { error?: string }; message?: string };
  return any.data?.error ?? any.message ?? "Request failed";
}

export function Disclosure({ title, hint, children, defaultOpen = false, testId }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  return (
    <details open={defaultOpen} className="group rounded-md border bg-card/60" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12.5px] font-medium hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
        <span className="inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
        {title}
        {hint && <span className="text-[11px] font-normal text-muted-foreground">— {hint}</span>}
      </summary>
      <div className="space-y-3 border-t px-3 py-3">{children}</div>
    </details>
  );
}
