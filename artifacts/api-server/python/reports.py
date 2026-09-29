"""Deterministic selected-filter manager brief, with optional cached AI context."""
from datetime import datetime, timezone

import ai
from engine import normalize_filters


def fmt(value):
    return "Not available" if value is None else f"{value:.2f}"


def brief(ds, values):
    filters = normalize_filters(values["filters"])
    report = ds.dashboard(filters)
    m, comparison = report["metrics"], report["comparison"]
    validation = ds.validation(filters)
    title = "Vireo Audio — Weekly Support SLA Brief"
    period = report["period"]
    labels = {"channel": "Channel", "shift": "Resolving-agent roster shift", "arrival_shift": "Arrival shift",
              "agent": "Agent", "team": "Roster team", "tier": "Tier"}
    selected = "; ".join(f"{labels[k]}: {v}" for k, v in filters.items() if k in labels) or "All agents, channels, shifts and teams"
    lead = next((r for r in report["channels"] if r["metrics"]["breaches"]), None)
    lines = [f"# {title}", "", f"**Period:** {period['label']}", "",
             f"**Scope:** {'Policy-effective baseline' if filters['scope'] == 'policy' else 'Historical retrospective view — pre-April policy unavailable'}",
             f"**Selection:** {selected}",
             "", "## Executive summary",
             f"{m['breaches']:,} of {m['evaluated']:,} evaluated tickets breached first-response SLA ({fmt(m['breach_rate'])}%). "
             f"Estimated credit exposure is ₹{m['exposure_inr']:,.0f}, not credits paid.",
             (f"{lead['label'].title()} accounts for the largest observed channel breach volume ({lead['metrics']['breaches']:,}). "
              "Start the operational review with its breached tickets and queue handoffs." if lead else
              "No channel has observed breaches in this selection; no breach concentration is asserted."),
             "", "## Current SLA position",
             f"- {m['tickets']:,} canonical tickets; {m['evaluated']:,} evaluated; {m['unknown']:,} unknown.",
             f"- {m['breaches']:,} breaches; **{fmt(m['breach_rate'])}% breach rate**.",
             f"- Estimated SLA-credit exposure: **₹{m['exposure_inr']:,.0f}**.",
             f"- Completed-ticket exposure ₹{m['completed_exposure_inr']:,.0f}; open/pending exposure ₹{m['pending_exposure_inr']:,.0f}. No credit ledger supplied.",
             f"- Proposed 15% analyst-selected target; gap {fmt(report['scenario']['gap_pp'])} percentage points. Not a client target.",
             "", "## What changed"]
    if comparison["available"]:
        lines.extend([f"- Comparison: {comparison['previous_period']['label']}. {comparison['note']}",
                      f"- Breach rate: {fmt(comparison['previous']['breach_rate'])}% previously → {fmt(m['breach_rate'])}% currently ({fmt(comparison['rate_change_pp'])} percentage points).",
                      f"- Breaches: {comparison['previous']['breaches']:,} previously → {m['breaches']:,} currently ({comparison['breach_change']:+,}); ticket-volume change: {fmt(comparison['volume_change_pct'])}%."])
    else:
        lines.append(comparison["note"])
    lines += ["", "## Where breaches are concentrated"]
    for name, label in [("channels", "Channel"), ("resolving_shifts", "Resolving-agent roster shift"), ("arrival_shifts", "Arrival shift"), ("roster_teams", "Roster team")]:
        if report[name]:
            r = report[name][0]
            lines.append(f"- {label}: {r['label']} has the highest observed breach volume in this selection: {r['metrics']['breaches']:,} breaches / {r['metrics']['evaluated']:,} evaluated ({fmt(r['metrics']['breach_rate'])}%).")
    lines += ["", "### Agents requiring operational review", "Listed by observed breach contribution, not employee productivity or causal responsibility."]
    for r in [r for r in report["agents"] if r["metrics"]["breaches"]][:5]:
        lines.append(f"- {r['label']} ({r['agent_id']}, Tier {r['tier']}): {r['metrics']['breaches']} breaches / {r['metrics']['evaluated']} evaluated; {fmt(r['metrics']['breach_rate'])}%." + (" Low volume (<30 evaluated)." if r["low_volume"] else ""))
    lines += ["", "## Operational observations",
              "Arrival shift is when the ticket entered the queue. Resolving shift is the attributed agent's historical roster assignment; these are different dimensions."]
    for cell in sorted(report["crosstab"], key=lambda c: -c["breaches"])[:4]:
        lines.append(f"- Arrived {cell['arrival_shift']} → attributed to {cell['resolving_shift']}: {cell['breaches']} breaches / {cell['tickets']} tickets.")
    lines += ["This is attribution and timing context, not evidence that a shift or person caused the breach.",
              "", "## Evidence / ticket examples",
              "Illustrative selected-period tickets: " + (", ".join(report["evidence_ids"]) or "No matching records."),
              "Open these tickets in the application to inspect the actual message, agent notes and response-time calculation. The examples do not establish a cause.",
              "", "## Recommended investigation areas",
              "- Review actual breached ticket timestamps and handoff context before discussing individual responsibility.",
              "- Compare arrival-time concentrations with supplied historical roster assignments; obtain attendance and queue-event logs before drawing coverage conclusions.",
              "- Review routing and queue handoffs within existing staffing. Headcount is frozen until Q4; this report does not recommend hiring."]
    ai_status = "AI not requested; brief metrics are deterministic."
    if values.get("include_ai"):
        insight_result = ai.get_insights(ds, filters)
        ai_status = insight_result["status"]
        lines += ["", "## AI-observed hypotheses"]
        if insight_result["status"] == "ready" and insight_result["insights"]:
            for insight in insight_result["insights"]:
                lines += [f"- Observation: {insight['observation']}", f"  Hypothesis: {insight['hypothesis']}",
                          f"  Limitation: {insight['limitation']}", f"  Investigate: {insight['investigation']}"]
        else:
            lines.append("No cached AI insights exist for these exact filters and dataset version. No AI findings have been invented.")
    lines += ["", "## Important limitations / data note",
              f"{period['convention']}; {'partial reporting period — comparisons use the same covered weekdays' if period['partial'] else 'complete reporting period'}.",
              f"Historical roster assignment is selected using the {'first response' if filters['roster_event'] == 'first_response' else 'resolution' if filters['roster_event'] == 'resolved' else 'creation'} date.",
              *["- " + c for c in report["caveats"]],
              f"Deterministic totals reconcile: {'yes' if validation['reconciliation']['passes'] else 'no — investigate before use'}. Data-quality flags remain available in Validation.",
              ("AI insight accuracy has not yet been measured against a human-labeled benchmark. This is separate from deterministic analytics validation."
               if not ai.evaluation(ds)["sample_size"] else "Human-reviewed AI sample results and limitations are available in AI Evaluation."),
              "Source provenance, calculation rules and audit details are available in the application's Validation view."]
    return {"title": title, "markdown": "\n".join(lines), "filename": f"vireo-sla-brief-{period['start']}.md",
            "generated_at": datetime.now(timezone.utc).isoformat(), "dataset_version": ds.version, "filters": filters,
            "evidence_ids": report["evidence_ids"], "ai_status": ai_status}