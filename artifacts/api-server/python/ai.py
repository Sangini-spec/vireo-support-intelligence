"""Bounded OpenAI-compatible calls, evidence validation and versioned SQLite cache."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx

from engine import ROOT, normalize_filters

PROMPTS = Path(__file__).parent / "prompts"
PROMPT_VERSION = hashlib.sha256("".join(p.read_text() for p in sorted(PROMPTS.glob("*.txt"))).encode()).hexdigest()[:12]
MODEL = os.environ.get("VIREO_AI_MODEL", "gpt-5.4-mini")
DB_PATH = Path(os.environ.get("VIREO_CACHE_PATH", ROOT / ".cache/vireo/insights.sqlite3"))
LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat()


def available():
    return bool(os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") and os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
                or os.environ.get("OPENAI_API_KEY"))


@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS classifications (id TEXT PRIMARY KEY, dataset TEXT NOT NULL, value TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, dataset TEXT NOT NULL, value TEXT NOT NULL)")
    try:
        with db:
            yield db
    finally:
        db.close()


def cache_key(kind, ds, filters, extra=None):
    return hashlib.sha256(json.dumps([kind, ds.version, filters, extra, MODEL, PROMPT_VERSION], sort_keys=True).encode()).hexdigest()


def cached(key):
    with LOCK, connection() as db:
        row = db.execute("SELECT value FROM cache WHERE key=?", (key,)).fetchone()
    if not row:
        return None
    value = json.loads(row[0])
    if "provenance" in value:
        value["provenance"]["cached"] = True
    return value


def save_cache(key, result):
    with LOCK, connection() as db:
        db.execute("INSERT OR REPLACE INTO cache VALUES (?,?)", (key, json.dumps(result)))


def provenance(ds, usage=None, taxonomy="not-applicable"):
    return {"dataset_version": ds.version, "model": MODEL, "prompt_version": PROMPT_VERSION,
            "taxonomy_version": taxonomy, "generated_at": now(), "cached": False,
            "token_usage": usage, "cost_note": "Provider token usage where available; monetary cost is not measured. Replit usage is billed to credits."}


def completion(messages, tools=None):
    base = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("AI features unavailable — provider access is not configured. Deterministic reporting remains available.")
    payload = {"model": MODEL, "messages": messages, "max_completion_tokens": 8192}
    if tools:
        payload["tools"] = tools
    else:
        payload["response_format"] = {"type": "json_object"}
    try:
        with httpx.Client(timeout=httpx.Timeout(150, connect=20)) as client:
            response = client.post(base.rstrip("/") + "/chat/completions",
                                   headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=payload)
        if response.status_code >= 400:
            raise RuntimeError(f"AI provider returned HTTP {response.status_code}; deterministic reporting remains available.")
        data = response.json()
        return data["choices"][0]["message"], data.get("usage", {}).get("total_tokens")
    except httpx.TimeoutException as exc:
        raise RuntimeError("AI provider timed out. Retry explicitly; deterministic reporting remains available.") from exc
    except httpx.RequestError as exc:
        raise RuntimeError("AI provider could not be reached; deterministic reporting remains available.") from exc


def json_content(message):
    text = message.get("content") or ""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return json.loads(text)


def sample(ds, filters, limit=12, ids=None):
    rows = ds.select(filters)
    if ids:
        allowed = {r["ticket_id"] for r in rows}
        if not set(ids).issubset(allowed):
            raise ValueError("Requested ticket IDs must belong to the selected filter state.")
        rows = [r for r in rows if r["ticket_id"] in ids]
    # Deterministic hash sample across breached/non-breached records, not cherry-picked testimonials.
    rows = sorted(rows, key=lambda r: hashlib.sha256((ds.version + r["ticket_id"]).encode()).hexdigest())
    if not ids:
        yes, no = [r for r in rows if r["breached"]], [r for r in rows if not r["breached"]]
        chosen = yes[:(limit + 1) // 2] + no[:limit // 2]
        selected = {r["ticket_id"] for r in chosen}
        rows = (chosen + [r for r in rows if r["ticket_id"] not in selected])[:limit]
    else:
        rows = rows[:limit]
    return [{"ticket_id": r["ticket_id"], "channel": r["channel"], "arrival_shift": r["arrival_shift"],
             "roster_shift": r["roster_shift"], "breached": r["breached"],
             "category": r["category"], "customer_message": redact(ds.by_id[r["ticket_id"]]["customer_message"][:1800]),
             "agent_notes": redact(ds.by_id[r["ticket_id"]]["agent_notes"][:1400])} for r in rows]


def redact(text):
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email redacted]", text)
    return re.sub(r"(?<!\w)(?:\+?\d[\d -]{8,}\d)(?!\w)", "[phone redacted]", text)


def evidence_valid(items, supplied, ds):
    if not isinstance(items, list):
        raise ValueError("AI evidence was not an array.")
    by_id = {r["ticket_id"]: r for r in supplied}
    result = []
    for item in items:
        tid, field, excerpt = item.get("ticket_id"), item.get("field"), item.get("excerpt")
        if (tid not in by_id or field not in ("customer_message", "agent_notes")
                or not isinstance(excerpt, str) or not excerpt.strip()
                or excerpt not in by_id[tid][field] or excerpt not in ds.by_id[tid][field]):
            raise ValueError("AI returned unsupported ticket evidence; output withheld.")
        result.append({"ticket_id": tid, "field": field, "excerpt": excerpt})
    return result


def get_classifications(ds, ticket_id=None):
    with LOCK, connection() as db:
        values = [json.loads(r[0]) for r in db.execute("SELECT value FROM classifications WHERE dataset=?", (ds.version,))]
        reviews = {r["classification_id"]: r for r in [json.loads(v[0]) for v in db.execute("SELECT value FROM reviews WHERE dataset=?", (ds.version,))]}
    for value in values:
        value["review_status"] = reviews.get(value["id"], {}).get("verdict", "unreviewed")
    return [v for v in values if not ticket_id or v["ticket_id"] == ticket_id]


def evaluation(ds):
    with LOCK, connection() as db:
        reviews = [json.loads(r[0]) for r in db.execute("SELECT value FROM reviews WHERE dataset=?", (ds.version,))]
    counts = {v: sum(r["verdict"] == v for r in reviews) for v in ("correct", "incorrect", "uncertain")}
    claims = [r["unsupported_claim"] for r in reviews if r["unsupported_claim"] is not None]
    return {"status": "Evaluated on a human-reviewed sample" if reviews else "Not evaluated",
            "sample_size": len(reviews), **counts,
            "observed_accuracy": round(counts["correct"] * 100 / len(reviews), 2) if reviews else None,
            "unsupported_claim_rate": round(sum(claims) * 100 / len(claims), 2) if claims else None,
            "methodology": "Actual human review only. Correct / all reviewed (including uncertain); qualitative model confidence is not accuracy. Convenience/stratified sample, not a population estimate. Results scoped to current dataset version. Reviewer identity is self-declared in this unauthenticated prototype.",
            "reviews": reviews}


def review(ds, value):
    with LOCK, connection() as db:
        row = db.execute("SELECT value FROM classifications WHERE id=? AND dataset=?", (value["classification_id"], ds.version)).fetchone()
        if not row:
            raise ValueError("Classification not found for current dataset version.")
        classification = json.loads(row[0])
        record = dict(classification_id=value["classification_id"], ticket_id=classification["ticket_id"],
                      verdict=value["verdict"], reviewer=value["reviewer"].strip(), note=value.get("note", ""),
                      reviewed_at=now(), unsupported_claim=value.get("unsupported_claim"))
        db.execute("INSERT OR REPLACE INTO reviews VALUES (?,?,?)", (value["classification_id"], ds.version, json.dumps(record)))
    return evaluation(ds)


def classify(ds, value):
    filters = normalize_filters(value["filters"])
    ids, limit = value.get("ticket_ids"), value.get("sample_size", 12)
    key = cache_key("classify", ds, filters, [ids, limit])
    if not value.get("regenerate") and (hit := cached(key)):
        reviews = {c["id"]: c["review_status"] for c in get_classifications(ds)}
        for c in hit["classifications"]:
            c["review_status"] = reviews.get(c["id"], "unreviewed")
        hit["evaluation_status"] = evaluation(ds)["status"]
        return hit
    empty = {"status": "unavailable", "message": "AI features unavailable — configure provider access. Deterministic reporting remains available.",
             "classifications": [], "taxonomy": [], "evaluation_status": evaluation(ds)["status"]}
    if not available():
        return empty
    supplied = sample(ds, filters, max(limit, len(ids or [])), ids)
    if not supplied:
        return dict(empty, status="ready", message="No tickets match the selected filters.")
    try:
        message, tokens = completion([
            {"role": "system", "content": (PROMPTS / "system.txt").read_text() + "\n" + (PROMPTS / "classify.txt").read_text()},
            {"role": "user", "content": json.dumps({"untrusted_ticket_evidence": supplied})}])
        result = json_content(message)
        taxonomy = result["taxonomy"]
        if not taxonomy or not all(isinstance(c.get("name"), str) and isinstance(c.get("definition"), str) for c in taxonomy):
            raise ValueError("AI taxonomy is invalid.")
        version = hashlib.sha256(json.dumps(taxonomy, sort_keys=True).encode()).hexdigest()[:12]
        names, allowed = {c["name"] for c in taxonomy}, {r["ticket_id"] for r in supplied}
        classifications, seen = [], set()
        for c in result["classifications"]:
            if c["ticket_id"] not in allowed or c["ticket_id"] in seen or c["category"] not in names or c["confidence"] not in ["low", "medium", "high"]:
                raise ValueError("AI classification failed scope/schema validation.")
            seen.add(c["ticket_id"])
            ev = evidence_valid(c["evidence"], supplied, ds)
            if not ev or any(e["ticket_id"] != c["ticket_id"] for e in ev):
                raise ValueError("Classification lacks evidence for the classified ticket.")
            classifications.append({"id": uuid.uuid4().hex, "ticket_id": c["ticket_id"], "category": c["category"],
                                    "source_category": ds.by_id[c["ticket_id"]]["category"], "rationale": str(c["rationale"]),
                                    "confidence": c["confidence"], "evidence": ev, "taxonomy_version": version, "review_status": "unreviewed"})
        if seen != allowed:
            raise ValueError("AI omitted tickets from the classification batch; output withheld.")
        result = {"status": "ready", "message": "AI interpretation of a bounded reproducible sample; not population topic prevalence.",
                  "classifications": classifications, "taxonomy": taxonomy, "provenance": provenance(ds, tokens, version),
                  "evaluation_status": evaluation(ds)["status"]}
        with LOCK, connection() as db:
            for c in classifications:
                db.execute("INSERT INTO classifications VALUES (?,?,?)", (c["id"], ds.version, json.dumps(c)))
        save_cache(key, result)
        return result
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        return dict(empty, status="error", message=str(exc)[:400])


def get_insights(ds, raw_filters):
    filters = normalize_filters(raw_filters)
    hit = cached(cache_key("insights", ds, filters))
    if hit:
        hit["evaluation_status"] = evaluation(ds)["status"]
        ids = {r["ticket_id"] for r in ds.select(filters)}
        hit["classifications"] = [c for c in get_classifications(ds) if c["ticket_id"] in ids]
        return hit
    ids = {r["ticket_id"] for r in ds.select(filters)}
    return {"status": "not_generated" if available() else "unavailable",
            "message": "Generate insights explicitly; no model calls occur on page load." if available() else "AI features unavailable; deterministic reporting remains usable.",
            "insights": [], "classifications": [c for c in get_classifications(ds) if c["ticket_id"] in ids],
            "evaluation_status": evaluation(ds)["status"], "filters": filters}


def generate_insights(ds, value):
    filters = normalize_filters(value["filters"])
    key = cache_key("insights", ds, filters)
    if not value.get("regenerate") and cached(key):
        return get_insights(ds, filters)
    result = get_insights(ds, filters)
    if not available():
        return result
    dashboard, supplied = ds.dashboard(filters), sample(ds, filters)
    if not supplied:
        return dict(result, status="ready", message="No tickets match this filter state.", insights=[])
    compact = {k: dashboard[k] for k in ("metrics", "period", "comparison", "channels", "resolving_shifts", "arrival_shifts", "crosstab", "caveats")}
    try:
        message, tokens = completion([
            {"role": "system", "content": (PROMPTS / "system.txt").read_text() + "\n" + (PROMPTS / "insights.txt").read_text()},
            {"role": "user", "content": json.dumps({"verified_analytics": compact, "untrusted_ticket_sample": supplied})}])
        output = json_content(message)
        insights = []
        for insight in output["insights"][:4]:
            if insight["confidence"] not in ("low", "medium", "high"):
                raise ValueError("Invalid confidence.")
            ev = evidence_valid(insight["evidence"], supplied, ds)
            if not ev:
                raise ValueError("Insight lacks supporting real ticket evidence.")
            insights.append({"id": uuid.uuid4().hex, **{k: str(insight[k]) for k in ("observation", "evidence_summary", "hypothesis", "confidence", "limitation", "investigation")},
                             "evidence": ev})
        result.update(status="ready", message="AI-generated hypotheses. Evidence IDs/excerpts validated; interpretations require human review.",
                      insights=insights, provenance=provenance(ds, tokens))
        save_cache(key, result)
        return result
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        return dict(result, status="error", message=str(exc)[:400], insights=[])


def answer_findings(dashboard):
    """Approved answer text is rendered from deterministic analytics, never model prose."""
    facts = {}
    def add(key, tool, text, field=None, cohort=None, bounds=None, conditions=None):
        facts[key] = {"id": key, "tool": tool, "text": text, "field": field, "cohort": cohort,
                      "bounds": bounds, "conditions": conditions or {}}
    m = dashboard["metrics"]
    rate = lambda n: "unavailable" if n is None else f"{n:.2f}%"
    add("overview", "get_overview_metrics",
        f"For {dashboard['period']['label']}, {m['breaches']:,} of {m['evaluated']:,} evaluated tickets breached SLA "
        f"({rate(m['breach_rate'])}). Estimated SLA-credit exposure is ₹{m['exposure_inr']:,.0f}, not credits paid.")
    for w in dashboard["weekly"]:
        x = w["metrics"]
        add("week:" + w["week"], "get_weekly_metrics",
            f"{w['label']}: {x['breaches']:,} breaches / {x['evaluated']:,} evaluated tickets; breach rate {rate(x['breach_rate'])}."
            + (" Partial week; compare only corresponding weekdays." if w["partial"] else ""),
            bounds=[w["week"], w["end"]])
    for cell in dashboard["crosstab"]:
        add(f"arrival_roster:{cell['arrival_shift']}:{cell['resolving_shift']}", "get_shift_metrics",
            f"Tickets arriving in {cell['arrival_shift']} and attributed to {cell['resolving_shift']}-rostered resolving agents: "
            f"{cell['breaches']:,} breaches / {cell['tickets']:,} tickets; observed breach rate {rate(cell['breach_rate'])}. "
            "This timing/attribution pattern warrants handoff review, not a conclusion about attendance or fault.",
            conditions={"arrival_shift": cell["arrival_shift"], "roster_shift": cell["resolving_shift"]})
    dims = [("channels", "channel", "channel", "get_channel_metrics"),
            ("resolving_shifts", "roster_shift", "resolving-agent roster shift", "get_shift_metrics"),
            ("arrival_shifts", "arrival_shift", "arrival shift", "get_shift_metrics"),
            ("response_shifts", "response_shift", "response shift", "get_shift_metrics"),
            ("agents", "agent_id", "resolving agent", "get_agent_metrics")]
    for dimension, field, label, tool in dims:
        rows = [r for r in dashboard[dimension] if r["metrics"]["evaluated"]]
        for r in rows:
            x = r["metrics"]
            text = f"{r['label']} ({label}): {x['breaches']:,} breaches / {x['evaluated']:,} evaluated tickets; observed breach rate {rate(x['breach_rate'])}."
            if r["low_volume"]:
                text += " Low volume: fewer than 30 evaluated tickets; interpret cautiously."
            add(f"{dimension}:{r['key']}", tool, text, field, r["key"])
        if rows:
            for kind, metric in [("rate", "breach_rate"), ("volume", "breaches")]:
                highest = max(r["metrics"][metric] for r in rows)
                leaders = [r for r in rows if r["metrics"][metric] == highest]
                for leader in leaders:
                    base = facts[f"{dimension}:{leader['key']}"]
                    add(f"highest_{dimension}_{kind}:{leader['key']}", tool,
                        f"{'Joint highest' if len(leaders) > 1 else 'Highest'} observed breach {kind} among {label}s in the selected population: "
                        + base["text"], field, leader["key"])
    c = dashboard["comparison"]
    if c["available"] and m["breach_rate"] is not None and c["previous"]["breach_rate"] is not None:
        previous = c["previous"]
        text = (f"Selected-period SLA breach rate is {rate(m['breach_rate'])}, versus {rate(previous['breach_rate'])} "
                f"for {c['previous_period']['label']}: {c['rate_change_pp']:+.2f} percentage points. "
                f"Breaches changed from {previous['breaches']:,} to {m['breaches']:,} ({c['breach_change']:+,}). ")
        changes = [r for r in c["changes"] if r["dimension"] == "channels"]
        driver = max(changes, key=lambda r: abs(r["breach_change"])) if changes else None
        if driver:
            text += (f"The largest absolute channel breach-count movement was {driver['label']}: "
                     f"{driver['previous_breaches']:,} to {driver['current_breaches']:,} ({driver['breach_change']:+,}). ")
        text += "This describes where the change occurred, not why it was caused. Review queue handoffs and arrival-time patterns; attendance and queue-event logs are needed to test explanations."
        add("weekly_change", "get_change_analysis", text, "channel" if driver else None, driver["key"] if driver else None)
    return facts


def finding_evidence(ds, filters, facts, ids):
    """Claim-scoped examples; registry resolves references to exact original substrings."""
    rows = ds.select(filters)
    registry = {}
    for fid in ids:
        fact = facts[fid]
        candidates = [r for r in rows if r["breached"] and
                      (fact["field"] is None or r[fact["field"]] == fact["cohort"]) and
                      all(r[k] == v for k, v in fact["conditions"].items()) and
                      (not fact["bounds"] or r["_date"] and fact["bounds"][0] <= r["_date"].isoformat() <= fact["bounds"][1])]
        for row in sorted(candidates, key=lambda r: r["ticket_id"])[:3]:
            source = ds.by_id[row["ticket_id"]]
            for field in ("agent_notes", "customer_message"):
                excerpt = source[field][:160]
                # Never return redacted text as if it were an original quote.
                if not excerpt.strip() or redact(excerpt) != excerpt:
                    continue
                key = f"{row['ticket_id']}:{field}"
                record = registry.setdefault(key, {"id": key, "ticket_id": row["ticket_id"], "field": field,
                                                  "excerpt": excerpt, "supports_finding_ids": []})
                record["supports_finding_ids"].append(fid)
                break
    return registry


def resolve_answer_evidence(ds, registry, evidence_ids, finding_ids):
    if not isinstance(evidence_ids, list) or len(evidence_ids) > 9:
        raise ValueError("Invalid evidence references.")
    result = []
    for eid in dict.fromkeys(evidence_ids):
        item = registry.get(eid)
        if not item or not set(item["supports_finding_ids"]).intersection(finding_ids):
            raise ValueError("Evidence does not support the selected finding.")
        quote = {k: item[k] for k in ("ticket_id", "field", "excerpt")}
        supplied = [{"ticket_id": item["ticket_id"], item["field"]: item["excerpt"]}]
        result.extend(evidence_valid([quote], supplied, ds))
    return result


def ask(ds, value):
    filters = normalize_filters(value["filters"])
    result = {"status": "unavailable", "answer": "AI features unavailable. Deterministic analytics and evidence remain available.",
              "evidence": [], "tool_calls": [], "limitations": [], "filters": filters}
    if not available():
        return result
    dashboard = ds.dashboard(filters)
    facts = answer_findings(dashboard)
    previous = None
    if value.get("context_id"):
        previous = cached("answer-context:" + value["context_id"])
        if not previous or previous["dataset"] != ds.version or previous["filters"] != filters:
            return dict(result, status="insufficient_evidence",
                        answer="Insufficient evidence to connect that follow-up reliably. The dataset or filters changed; ask the original question again.")
    followup = bool(re.search(r"\b(that finding|evidence for (that|this)|show me (the )?evidence)\b", value["question"], re.I))
    if followup and not previous:
        return dict(result, status="insufficient_evidence",
                    answer="Which finding should I support? Ask about a channel, shift or weekly change first, then request its evidence.")
    required = previous["finding_ids"] if followup else []
    # Constrain normal demo intents to the requested measure/dimension, not just any valid metric.
    question = value["question"].lower()
    expected = None
    if not followup and "highest" in question and "rate" in question:
        dimension = ("channels" if "channel" in question else
                     "arrival_shifts" if "arrival" in question and "shift" in question else
                     "response_shifts" if "response" in question and "shift" in question else
                     "resolving_shifts" if "shift" in question else "agents" if "agent" in question else None)
        if dimension:
            expected = {f for f in facts if f.startswith(f"highest_{dimension}_rate:")}
    elif not followup and "change" in question and ("week" in question or "sla" in question):
        expected = {"weekly_change"} if "weekly_change" in facts else set()
    if expected == set():
        return dict(result, status="insufficient_evidence",
                    answer="Insufficient evidence to answer this reliably. No evaluated cohort or comparable previous period exists for the selected filters.")
    tool_values = {
        "get_overview_metrics": {"period": dashboard["period"], "metrics": dashboard["metrics"], "caveats": dashboard["caveats"]},
        "get_weekly_metrics": dashboard["weekly"],
        "get_shift_metrics": {k: dashboard[k] for k in ("resolving_shifts", "arrival_shifts", "response_shifts", "crosstab")},
        "get_agent_metrics": dashboard["agents"],
        "get_channel_metrics": dashboard["channels"],
        "get_change_analysis": dashboard["comparison"],
        "get_ticket_examples": {},
        "get_ai_insights": get_insights(ds, filters),
        "get_validation_status": ds.validation(filters),
    }
    descriptions = {
        "get_overview_metrics": "Verified selected-filter overview, date range, estimated credit exposure and caveats.",
        "get_weekly_metrics": "Verified Monday-Sunday IST weekly metrics with partial-week flags.",
        "get_shift_metrics": "Resolving roster, arrival and response shifts plus arrival/resolving cross-tab.",
        "get_agent_metrics": "Agent attribution metrics, tier and low-volume flags; no employee scoring.",
        "get_channel_metrics": "Verified channel counts, rates and targets.",
        "get_change_analysis": "Previous comparable-period deltas and concentrations.",
        "get_ticket_examples": "Retrieve up to three breached-ticket examples per approved finding. Supply finding_ids from analytics tools. Quotes illustrate the specified cohort, not its cause.",
        "get_ai_insights": "Previously generated hypotheses and evaluation status, not confirmed facts.",
        "get_validation_status": "Source-data quality and deterministic reconciliation.",
    }
    for name, data in list(tool_values.items()):
        tool_values[name] = {"analytics": data, "findings": [f for f in facts.values() if f["tool"] == name]}
    tools = [{"type": "function", "function": {"name": name, "description": desc,
              "parameters": {"type": "object", "properties": {}, "additionalProperties": False}, "strict": True}}
             for name, desc in descriptions.items()]
    next(t for t in tools if t["function"]["name"] == "get_ticket_examples")["function"]["parameters"] = {
        "type": "object", "properties": {"finding_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3}},
        "required": ["finding_ids"], "additionalProperties": False}
    messages = [{"role": "system", "content": (PROMPTS / "system.txt").read_text() + "\n" + (PROMPTS / "ask.txt").read_text()},
                {"role": "user", "content": json.dumps({"question": value["question"], "fixed_filters": filters,
                 "required_finding_ids": sorted(expected) if expected else required,
                 "previous_verified_findings": [facts[f] for f in required if f in facts]})}]
    usage, registry, retrieved = 0, {}, set()
    try:
        for round_number in range(5):
            message, tokens = completion(messages, tools if round_number < 4 else None)
            usage += tokens or 0
            calls = message.get("tool_calls") or []
            if not calls:
                if not result["tool_calls"]:
                    raise ValueError("AI did not query an approved analytics tool; answer withheld.")
                output = json_content(message)
                if not isinstance(output, dict) or set(output) - {"finding_ids", "evidence_ids", "insufficient_evidence"}:
                    raise ValueError("AI answer did not follow the reference-only schema.")
                chosen = output.get("finding_ids", [])
                if (output.get("insufficient_evidence") or not chosen or len(chosen) > 3):
                    return dict(result, status="insufficient_evidence", answer="Insufficient evidence to answer this reliably. Try a specific channel, roster shift, agent or comparable-week question.")
                if not all(f in facts and f in retrieved for f in chosen) or (required and set(chosen) != set(required)):
                    raise ValueError("Answer selected an unretrieved or unrelated finding.")
                if expected and set(chosen) != expected:
                    raise ValueError("Answer does not match the requested metric and dimension.")
                evidence = resolve_answer_evidence(ds, registry, output.get("evidence_ids", []), chosen)
                if followup and not evidence:
                    raise ValueError("No claim-scoped ticket evidence retrieved.")
                answer = "\n\n".join(facts[f]["text"] for f in chosen)
                if evidence:
                    answer += "\n\nThe cited breached tickets belong to the finding's selected cohort. Their messages/notes provide case context; aggregate analytics establish the rate, not these examples. They do not establish a cause."
                context_id = uuid.uuid4().hex
                save_cache("answer-context:" + context_id, {"dataset": ds.version, "filters": filters, "finding_ids": chosen})
                result.update(status="ready", answer=answer, evidence=evidence, context_id=context_id,
                              limitations=["Resolving-agent roster attribution is not attendance or responsibility. Arrival and response shifts are separate dimensions.",
                                           "No human-labeled benchmark has yet measured the AI selection layer; quoted evidence and numerical analytics are validated separately."],
                              provenance=provenance(ds, usage))
                return result
            if len(result["tool_calls"]) + len(calls) > 12:
                raise ValueError("AI tool-call budget exceeded. Narrow the question.")
            messages.append(message)
            for call in calls:
                name = call["function"]["name"]
                args = json.loads(call["function"].get("arguments") or "{}")
                if name not in tool_values:
                    raise ValueError("AI attempted an unapproved tool or argument.")
                if name == "get_ticket_examples":
                    ids = args.get("finding_ids", [])
                    if set(args) != {"finding_ids"} or not isinstance(ids, list) or not 1 <= len(ids) <= 3 or not all(i in facts for i in ids):
                        raise ValueError("Evidence tool requested an unapproved finding.")
                    if required and not set(ids).issubset(required):
                        raise ValueError("Follow-up evidence does not match previous finding.")
                    examples = finding_evidence(ds, filters, facts, ids)
                    registry.update(examples)
                    retrieved.update(ids)
                    returned = {"findings": [facts[f] for f in ids], "evidence": list(examples.values())}
                else:
                    if args:
                        raise ValueError("Analytics tools cannot override filters.")
                    returned = tool_values[name]
                    retrieved.update(f["id"] for f in returned["findings"])
                result["tool_calls"].append({"tool": name, "description": descriptions[name],
                                             "ticket_ids": sorted({r["ticket_id"] for r in examples.values()}) if name == "get_ticket_examples" else []})
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(returned)})
        raise ValueError("AI did not complete within the tool-call limit.")
    except RuntimeError as exc:
        return dict(result, status="error", answer=str(exc)[:400], limitations=["No unsupported answer has been displayed."])
    except (ValueError, KeyError, TypeError):
        return dict(result, status="insufficient_evidence", answer="Insufficient evidence to answer this reliably. Please narrow the question or select a comparable week.",
                    limitations=["The response could not be matched to retrieved findings and exact, claim-scoped source evidence. No unsupported answer has been displayed."])