import { useState } from "react";
import { Download, FileText, Copy } from "lucide-react";
import { useGenerateVireoBrief, type BriefResult } from "@workspace/api-client-react";
import { useFilters, FILTER_LABELS } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, ErrorBlock, LoadingBlock, Pill, errMsg } from "@/components/primitives";
import { TicketLinks } from "@/components/data";
import { useToast } from "@/hooks/use-toast";

export default function Brief() {
  const { params } = useFilters();
  const { toast } = useToast();
  const gen = useGenerateVireoBrief();
  const [includeAi, setIncludeAi] = useState(false);
  const [brief, setBrief] = useState<BriefResult | null>(null);

  const run = () => gen.mutate({ data: { filters: params, include_ai: includeAi } }, { onSuccess: setBrief });
  const download = () => {
    if (!brief) return;
    const url = URL.createObjectURL(new Blob([brief.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = brief.filename || "vireo-brief.md"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager Brief" title="Weekly brief from validated metrics" lede="Generated from the current filter state. Download is the exact returned markdown.">
        <label className="flex items-center gap-2 text-xs"><Switch checked={includeAi} onCheckedChange={setIncludeAi} data-testid="switch-include-ai" /> Include AI interpretation</label>
        <Button size="sm" onClick={run} disabled={gen.isPending} data-testid="button-generate-brief"><FileText className="mr-1.5 h-3.5 w-3.5" />{gen.isPending ? "Generating…" : "Generate brief"}</Button>
      </PageHeader>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Selection:</span>
        {Object.entries(params).map(([k, v]) => <span key={k} className="rounded border px-1.5 py-0.5"><span className="text-muted-foreground">{FILTER_LABELS[k as keyof typeof FILTER_LABELS]}:</span> {String(v)}</span>)}
      </div>

      {gen.isPending && <LoadingBlock rows={10} />}
      {gen.isError && <ErrorBlock message={errMsg(gen.error)} onRetry={run} />}
      {!brief && !gen.isPending && !gen.isError && (
        <div className="rounded-md border border-dashed px-6 py-12 text-center">
          <div className="display text-xl">No brief generated for this selection yet.</div>
          <p className="mt-1 text-sm text-muted-foreground">It will cover SLA position, change vs previous period, concentration, attribution vs arrival context, exposure and caveats.</p>
        </div>
      )}
      {brief && (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <article className="rise rounded-md border bg-card px-6 py-6 md:px-10" data-testid="text-brief">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans prose-headings:font-serif">{brief.markdown}</div>
          </article>
          <aside className="space-y-4 text-[12px]">
            <div className="flex gap-2">
              <Button size="sm" onClick={download} data-testid="button-download-brief"><Download className="mr-1.5 h-3.5 w-3.5" />Download .md</Button>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(brief.markdown); toast({ title: "Copied markdown" }); }} data-testid="button-copy-brief"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <div><div className="eyebrow">Title</div><div>{brief.title}</div></div>
            <div><div className="eyebrow">File</div><div className="num">{brief.filename}</div></div>
            <div><div className="eyebrow">Generated</div><div className="num">{new Date(brief.generated_at).toLocaleString()}</div></div>
            <div><div className="eyebrow">Dataset</div><div className="num">{brief.dataset_version}</div></div>
            <div><div className="eyebrow">AI status</div><Pill tone={brief.ai_status === "ready" || brief.ai_status === "included" ? "info" : "neutral"}>{brief.ai_status}</Pill></div>
            {brief.evidence_ids.length > 0 && <div><div className="eyebrow mb-1">Evidence tickets</div><TicketLinks ids={brief.evidence_ids} max={20} /></div>}
          </aside>
        </div>
      )}
    </div>
  );
}
