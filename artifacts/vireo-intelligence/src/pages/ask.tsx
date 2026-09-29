import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { useAskVireo, type AnswerResult } from "@workspace/api-client-react";
import { useFilters } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, ErrorBlock, LoadingBlock, Caveats, Disclosure, errMsg } from "@/components/primitives";
import { EvidenceList, TicketLinks } from "@/components/data";
import { AiStatusBanner, Provenance } from "@/pages/insights";

const PROMPTS = [
  "Why did SLA performance change this week?",
  "Which channel has the highest breach rate?",
  "Which shift has the highest observed breach rate?",
  "Show me the evidence for that finding.",
];

interface Turn { q: string; a?: AnswerResult; err?: string }

export default function Ask() {
  const { params, meta } = useFilters();
  const ask = useAskVireo();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ctxRef = useRef<string | undefined>(undefined);
  const filterKey = JSON.stringify(params);
  const keyRef = useRef(filterKey);
  useEffect(() => { keyRef.current = filterKey; ctxRef.current = undefined; }, [filterKey]);

  const submit = (question: string) => {
    const qn = question.trim();
    if (!qn) return;
    setText("");
    const idx = turns.length;
    setTurns((t) => [...t, { q: qn }]);
    const sentKey = filterKey;
    ask.mutate({ data: { question: qn, filters: params, context_id: ctxRef.current } }, {
      onSuccess: (a) => {
        if (sentKey === keyRef.current) ctxRef.current = a.status === "ready" && a.context_id ? a.context_id : undefined;
        setTurns((t) => t.map((x, i) => (i === idx ? { ...x, a } : x)));
      },
      onError: (e) => setTurns((t) => t.map((x, i) => (i === idx ? { ...x, err: errMsg(e) } : x))),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ask AI" title="Question the validated analytics" lede="Answers run through approved analytics and evidence tools only. Ticket text is treated as untrusted. If evidence is thin, it says so." />
      {meta && !meta.ai_available && <AiStatusBanner status="unavailable" message="No AI model is configured for this environment." />}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {turns.length === 0 && (
            <div className="rounded-md border border-dashed px-5 py-8">
              <div className="display text-lg">Ask about the current selection.</div>
              <p className="mt-1 text-sm text-muted-foreground">Your filters are sent with every question.</p>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="rise space-y-2" data-testid={`turn-${i}`}>
              <div className="ml-auto max-w-[80%] rounded-md bg-primary px-3 py-2 text-[13px] text-primary-foreground">{t.q}</div>
              {!t.a && !t.err && <LoadingBlock rows={3} />}
              {t.err && <ErrorBlock message={t.err} />}
              {t.a && (
                <div className="rounded-md border bg-card p-4">
                  <AiStatusBanner status={t.a.status} message={t.a.status === "insufficient_evidence" ? t.a.answer || "Insufficient evidence in the supplied data." : t.a.answer} />
                  {t.a.status === "ready" && <div className="eyebrow mb-1">Answer</div>}
                  {t.a.status === "ready" && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed" data-testid={`text-answer-${i}`}>{t.a.answer}</p>}
                  {t.a.evidence.length > 0 && <div className="mt-3"><div className="eyebrow mb-1">Evidence · real ticket excerpts</div><EvidenceList items={t.a.evidence} /></div>}
                  {t.a.limitations.length > 0 && <div className="mt-3"><Caveats title="Limitations" items={t.a.limitations} /></div>}
                  <div className="mt-3"><Disclosure title="View technical details" hint="tool trace and provenance">
                  {t.a.tool_calls.length > 0 && (
                    <div>
                      <ol className="space-y-1.5">{t.a.tool_calls.map((c, j) => (
                        <li key={j} className="text-[12px]"><span className="num text-primary">{c.tool}</span> <span className="text-muted-foreground">— {c.description}</span>
                          {c.ticket_ids.length > 0 && <div className="mt-1"><TicketLinks ids={c.ticket_ids} max={8} /></div>}</li>))}
                      </ol>
                    </div>
                  )}
                    <Provenance p={t.a.provenance} />
                  </Disclosure></div>
                </div>
              )}
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="sticky bottom-3 rounded-md border bg-card p-2 shadow-sm">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Ask about breaches, shifts, channels, ticket themes…" className="min-h-[64px] resize-none border-0 text-[13px] shadow-none focus-visible:ring-0"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }} data-testid="input-question" />
            <div className="flex items-center justify-between px-1">
              <span className="text-[10.5px] text-muted-foreground">Enter to send · Shift+Enter for newline</span>
              <Button size="sm" type="submit" disabled={ask.isPending || !text.trim()} data-testid="button-ask"><CornerDownLeft className="mr-1 h-3.5 w-3.5" /> Ask</Button>
            </div>
          </form>
        </div>
        <Section title="Starting points">
          <div className="space-y-1.5">
            {PROMPTS.map((p) => (
              <button key={p} onClick={() => submit(p)} disabled={ask.isPending} className="block w-full rounded border bg-card px-3 py-2 text-left text-[12.5px] hover:border-primary" data-testid={`button-prompt-${PROMPTS.indexOf(p)}`}>{p}</button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
