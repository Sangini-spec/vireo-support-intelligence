"""CSV source-of-truth and deterministic analytics. No model-generated metrics."""
from __future__ import annotations

import csv
import hashlib
import os
import statistics
import threading
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
IST = ZoneInfo("Asia/Kolkata")
POLICY_DATE = date(2025, 4, 1)
TARGETS = {"chat": 15, "voice": 120, "social": 240, "email": 480}
CREDIT = 350
METHOD_VERSION = "vireo-1.0"
FIELDS = ["scope", "week", "start_date", "end_date", "channel", "shift",
          "arrival_shift", "agent", "team", "roster_event", "tier"]
METHOD = [
    "Policy v3.2 applies from 1 April 2025 IST creation date. No earlier policy was supplied; historical results are retrospective only.",
    "API timestamp strings are UTC (export administrator email). IST is used for dates, roster periods and shifts. No extra migration offset is applied.",
    "First response uses first_response_at as the first human response; no event log is available to independently validate bot exclusion.",
    "Breach means elapsed first response strictly greater than target. Chat 15, voice 120, social 240, email 480 minutes. No business-hours pauses.",
    "Monday–Sunday IST weeks are an analyst-selected convention. Partial weeks are compared with the same weekdays of the preceding week.",
    "Roster mapping uses the selected event's IST date, inclusive from/to dates; blank to_date is open-ended. Creation is the default for consistent cohort reporting.",
    "Resolving-agent attribution does not identify the first responder or establish responsibility. Arrival/response windows and roster shifts are separate dimensions.",
    "Roster is not attendance. No later Night assignment in the supplied file does not prove nobody worked Night.",
    "SLA exposure is breaches × ₹350, not credits paid or confirmed P&L. Completed means resolved/closed; remaining statuses are shown separately.",
    "Known matching duplicate groups are compared across all business fields with legacy CSAT zero normalized to blank. Helpdesk copy preferred only when fields agree; conflicting groups quarantined.",
    "CSAT blank and legacy zero mean non-response. Legacy transfers are unavailable, not proof of zero. Legacy monetary conversion factor is unknown.",
    "Agent low-volume flag means fewer than 30 evaluated tickets (analyst rule), not statistical confidence. Tier 1 and Tier 2 are not ranked for volume productivity.",
    "Proposed 15% target is analyst-selected, not a client requirement. Scenario uses selected observed volume, not projected savings.",
    "AI classifications are hypotheses, not ground truth. Model confidence is not measured accuracy. Human evaluation remains Not evaluated until actual labels exist.",
]


def timestamp(value):
    if not value:
        return None
    for format_string in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, format_string).replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            pass
    return None


def local(value):
    parsed = timestamp(value)
    return parsed.astimezone(IST) if parsed else None


def iso(value):
    parsed = timestamp(value)
    return parsed.isoformat() if parsed else None


def shift_at(value):
    parsed = local(value)
    if not parsed:
        return "Unknown"
    return "Morning" if 6 <= parsed.hour < 14 else "Day" if 14 <= parsed.hour < 22 else "Night"


def monday(day):
    return day - timedelta(days=day.weekday())


def percent(n, d):
    return round(n * 100 / d, 4) if d else None


def difference(a, b):
    return round(a - b, 4) if a is not None and b is not None else None


def score(row):
    value = row.get("csat_score", "")
    return "" if row.get("source_system") == "legacy_fd" and value == "0" else value


def deduplicate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row.get("ticket_id", "")].append(row)
    canonical, audits, quarantine = [], [], []
    for tid, group in groups.items():
        business_keys = set(group[0]) - {"source_system", "row_number"}
        differing = [key for key in sorted(business_keys)
                     if len({score(r) if key == "csat_score" else r.get(key, "") for r in group}) > 1]
        conflict = not tid or bool(differing)
        chosen = None if conflict else next((r for r in group if r["source_system"] == "helpdesk"), group[0])
        if chosen:
            canonical.append(chosen)
        else:
            quarantine.extend(group)
        if len(group) > 1 or conflict:
            audits.append({
                "group_id": "duplicate-" + (tid or f"missing-{group[0]['row_number']}"),
                "ticket_id": tid, "source_systems": sorted({r["source_system"] for r in group}),
                "canonical_row_number": chosen["row_number"] if chosen else None,
                "quarantined": conflict, "differing_fields": differing,
                "reason": ("Missing ticket ID or conflicting business fields; excluded pending review."
                           if conflict else "Matching business fields after legacy CSAT normalization; prefer helpdesk copy."),
                "rows": group,
            })
    return canonical, audits, quarantine


def sla(row):
    created, response = timestamp(row["created_at"]), timestamp(row["first_response_at"])
    target = TARGETS.get(row["channel"])
    elapsed = (response - created).total_seconds() / 60 if created and response else None
    valid = elapsed is not None and elapsed >= 0 and target is not None
    return {
        "target_minutes": target,
        "response_minutes": elapsed if valid else None,
        "breach_minutes": max(0, elapsed - target) if valid else None,
        "breached": elapsed > target if valid else None,
    }


def resolve_roster(row, roster, event="created"):
    value = local(row[{"created": "created_at", "first_response": "first_response_at", "resolved": "resolved_at"}[event]])
    day = value.date().isoformat() if value else ""
    return [a for a in roster if a["agent_id"] == row["agent_id"] and day
            and a["from_date"] <= day and (not a["to_date"] or day <= a["to_date"])]


def metrics(rows):
    evaluated = [r for r in rows if r["breached"] is not None]
    breached = [r for r in evaluated if r["breached"]]
    times = [r["response_minutes"] for r in evaluated]
    completed = sum(r["status"] in ("resolved", "closed") for r in breached)
    return {
        "tickets": len(rows), "evaluated": len(evaluated), "breaches": len(breached),
        "non_breaches": len(evaluated) - len(breached), "unknown": len(rows) - len(evaluated),
        "breach_rate": percent(len(breached), len(evaluated)),
        "average_response_minutes": round(statistics.mean(times), 3) if times else None,
        "median_response_minutes": statistics.median(times) if times else None,
        "exposure_inr": len(breached) * CREDIT, "completed_exposure_inr": completed * CREDIT,
        "pending_exposure_inr": (len(breached) - completed) * CREDIT,
    }


def normalize_filters(values):
    result = {k: str(values[k]) for k in FIELDS if values.get(k) not in (None, "")}
    result.setdefault("scope", "policy")
    result.setdefault("roster_event", "created")
    choices = {"scope": ["policy", "historical"], "roster_event": ["created", "first_response", "resolved"],
               "channel": list(TARGETS), "shift": ["Morning", "Day", "Night", "Unmapped"],
               "arrival_shift": ["Morning", "Day", "Night", "Unknown"], "tier": ["1", "2"]}
    for key, options in choices.items():
        if key in result and result[key] not in options:
            raise ValueError(f"Invalid {key}.")
    for key in ["week", "start_date", "end_date"]:
        if key in result:
            day = date.fromisoformat(result[key])
            if key == "week" and day.weekday() != 0:
                raise ValueError("week must be a Monday ISO date.")
    if result.get("start_date", "") > result.get("end_date", "9999"):
        raise ValueError("start_date must not be later than end_date.")
    return result


class Dataset:
    def __init__(self, paths, fingerprint):
        self.version = hashlib.sha256((fingerprint + METHOD_VERSION).encode()).hexdigest()[:20]
        self.loaded_at = datetime.now(timezone.utc).isoformat()
        self.tables, self.sources = {}, []
        for name, path in paths.items():
            # dtype=str and keep_default_na=False preserve original CSV cells.
            frame = pd.read_csv(path, dtype=str, keep_default_na=False)
            self.tables[name] = frame.to_dict(orient="records")
            self.sources.append({"name": path.name, "rows": len(frame),
                                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        required = {"ticket_id", "created_at", "first_response_at", "resolved_at", "channel", "agent_id", "source_system",
                    "customer_id", "order_id", "product_sku", "customer_message", "agent_notes", "status", "csat_score"}
        if not required.issubset(self.tables["tickets"][0] if self.tables["tickets"] else {}):
            raise ValueError("tickets.csv is empty or lacks required fields.")
        self.raw = [dict(row, row_number=i + 2) for i, row in enumerate(self.tables["tickets"])]
        self.canonical, self.duplicates, self.quarantined = deduplicate(self.raw)
        self.roster = self.tables["agents"]
        self.orders = {r["order_id"]: r for r in self.tables["orders"]}
        self.products = {r["sku"]: r for r in self.tables["products"]}
        self.customers = {r["customer_id"]: r for r in self.tables["customers"]}
        self.by_id = {r["ticket_id"]: r for r in self.canonical}
        self.rows_cache = {}
        self.raw_by_id = defaultdict(list)
        for row in self.raw:
            self.raw_by_id[row["ticket_id"]].append(row)
        dates = [local(r["created_at"]).date() for r in self.canonical if local(r["created_at"])]
        if not dates:
            raise ValueError("No valid ticket creation timestamps.")
        self.start, self.end = min(dates), max(dates)
        self.checks = self.quality_checks()

    def flags(self, row):
        flags = []
        for key in ("created_at", "first_response_at"):
            if not timestamp(row[key]):
                flags.append("invalid_" + key)
        if row["channel"] not in TARGETS:
            flags.append("invalid_channel")
        if timestamp(row["created_at"]) and timestamp(row["first_response_at"]) and timestamp(row["first_response_at"]) < timestamp(row["created_at"]):
            flags.append("negative_response")
        if not row["resolved_at"]:
            flags.append("missing_resolution")
        elif not timestamp(row["resolved_at"]):
            flags.append("invalid_resolution")
        elif timestamp(row["first_response_at"]) and timestamp(row["resolved_at"]) < timestamp(row["first_response_at"]):
            flags.append("resolution_before_response")
        if not row["order_id"]:
            flags.append("missing_order")
        elif row["order_id"] not in self.orders:
            flags.append("unknown_order")
        elif local(row["created_at"]) and local(row["created_at"]).date().isoformat() < self.orders[row["order_id"]]["order_date"]:
            flags.append("ticket_before_order")
        if row["customer_id"] not in self.customers:
            flags.append("unknown_customer")
        if row["product_sku"] not in self.products:
            flags.append("unknown_product")
        if not score(row):
            flags.append("csat_nonresponse")
        if row["source_system"] == "legacy_fd" and row["csat_score"] == "0":
            flags.append("legacy_csat_zero")
        if row["source_system"] == "legacy_fd":
            flags.append("legacy_transfers_unavailable")
            if row["refund_amount_inr"]:
                flags.append("legacy_money_ambiguous")
        try:
            if row["replacement_issued"] == "Y" and float(row["refund_amount_inr"] or 0) > 0:
                flags.append("refund_and_replacement")
        except ValueError:
            flags.append("invalid_refund_amount")
        text = row["customer_message"].lower()
        if any(marker in text for marker in ("[inaudible]", "[line dropped]", "[no audio]", "[silence]", "[transcription failed]")):
            flags.append("transcript_quality_review")
        if not row["customer_message"].strip() or not row["agent_notes"].strip():
            flags.append("missing_text")
        if local(row["created_at"]) and local(row["created_at"]).date() < POLICY_DATE:
            flags.append("pre_policy")
        return flags

    def rows(self, event="created"):
        if event not in self.rows_cache:
            values = []
            for row in self.canonical:
                matches = resolve_roster(row, self.roster, event)
                assignment = matches[0] if len(matches) == 1 else {}
                calculations = sla(row)
                created = local(row["created_at"])
                values.append({
                    "ticket_id": row["ticket_id"], "created_at": iso(row["created_at"]) or row["created_at"],
                    "created_ist": created.isoformat() if created else "",
                    "first_response_at": iso(row["first_response_at"]),
                    "first_response_ist": local(row["first_response_at"]).isoformat() if local(row["first_response_at"]) else None,
                    "resolved_at": iso(row["resolved_at"]), "status": row["status"], "channel": row["channel"],
                    "category": row["category"], "assigned_team": row["assigned_team"], "agent_id": row["agent_id"],
                    "agent_name": next((a["name"] for a in self.roster if a["agent_id"] == row["agent_id"]), "Unknown agent"),
                    "roster_shift": assignment.get("shift", "Unmapped"), "roster_team": assignment.get("team", "Unmapped"),
                    "roster_tier": assignment.get("tier", "Unknown"), "arrival_shift": shift_at(row["created_at"]),
                    "response_shift": shift_at(row["first_response_at"]), **calculations,
                    "exposure_inr": CREDIT if calculations["breached"] else 0, "source_system": row["source_system"],
                    "quality_flags": self.flags(row), "_date": created.date() if created else None,
                    "_matches": len(matches),
                })
            self.rows_cache[event] = values
        return self.rows_cache[event]

    def bounds(self, filters, ignore_week=False):
        start = max(self.start, POLICY_DATE) if filters["scope"] == "policy" else self.start
        end = self.end
        if filters.get("start_date"):
            start = max(start, date.fromisoformat(filters["start_date"]))
        if filters.get("end_date"):
            end = min(end, date.fromisoformat(filters["end_date"]))
        if filters.get("week") and not ignore_week:
            w = date.fromisoformat(filters["week"])
            start, end = max(start, w), min(end, w + timedelta(days=6))
        return start, end

    def select(self, filters, bounds=None, ignore_week=False):
        start, end = bounds or self.bounds(filters, ignore_week)
        pairs = {"channel": "channel", "shift": "roster_shift", "arrival_shift": "arrival_shift",
                 "agent": "agent_id", "team": "roster_team", "tier": "roster_tier"}
        values = []
        for r in self.rows(filters["roster_event"]):
            if r["_date"] is None:
                # Unknown creation dates cannot belong to a dated policy/week cohort.
                if filters["scope"] != "historical" or any(k in filters for k in ("week", "start_date", "end_date")):
                    continue
            elif not start <= r["_date"] <= end:
                continue
            if all(not filters.get(f) or r[key] == filters[f] for f, key in pairs.items()):
                values.append(r)
        return values

    @staticmethod
    def period(start, end):
        days = max(0, (end - start).days + 1)
        return {"start": start.isoformat(), "end": end.isoformat(), "label": f"{start:%d %b %Y} – {end:%d %b %Y}",
                "partial": days == 0 or start.weekday() != 0 or end.weekday() != 6,
                "days": days, "convention": "Monday–Sunday IST (analyst convention)"}

    def weeks(self, filters):
        start, end = self.bounds(filters, ignore_week=True)
        rows = self.select(filters, ignore_week=True)
        grouped = defaultdict(list)
        for r in rows:
            if r["_date"]:
                grouped[monday(r["_date"])].append(r)
        result = []
        w = monday(start)
        while w <= end:
            lo, hi = max(start, w), min(end, w + timedelta(days=6))
            result.append({"week": w.isoformat(), "end": hi.isoformat(), "label": f"{w:%d %b} – {hi:%d %b %Y}",
                           "partial": lo != w or hi != w + timedelta(days=6),
                           "days": max(0, (hi - lo).days + 1), "metrics": metrics(grouped[w])})
            w += timedelta(days=7)
        return result

    def breakdown(self, rows, previous, field):
        groups, old = defaultdict(list), defaultdict(list)
        for r in rows:
            groups[r[field]].append(r)
        for r in previous:
            old[r[field]].append(r)
        overall = metrics(rows)
        result = []
        for key in sorted(groups.keys() | old.keys()):
            current, prior = metrics(groups[key]), metrics(old[key])
            item = {"key": key, "label": key, "metrics": current,
                    "breach_contribution": percent(current["breaches"], overall["breaches"]),
                    "volume_share": percent(current["tickets"], overall["tickets"]),
                    "previous_metrics": prior, "rate_change_pp": difference(current["breach_rate"], prior["breach_rate"]),
                    "low_volume": current["evaluated"] < 30}
            if field == "channel":
                item["target_minutes"] = TARGETS.get(key)
            if field == "agent_id":
                records = groups[key] or old[key]
                item.update(agent_id=key, label=records[0]["agent_name"],
                            tier=", ".join(sorted({r["roster_tier"] for r in records})),
                            team=", ".join(sorted({r["roster_team"] for r in records})),
                            shift=", ".join(sorted({r["roster_shift"] for r in records})))
            result.append(item)
        return sorted(result, key=lambda r: (-r["metrics"]["breaches"], r["key"]))

    def dashboard(self, raw_filters):
        filters = normalize_filters(raw_filters)
        rows = self.select(filters)
        start, end = self.bounds(filters)
        current = metrics(rows)
        days = max(0, (end - start).days + 1)
        offset = 7 if filters.get("week") or days <= 7 else ((days + 6) // 7) * 7
        prior_start, prior_end = start - timedelta(days=offset), end - timedelta(days=offset)
        lower = max(self.start, POLICY_DATE) if filters["scope"] == "policy" else self.start
        comparable = days > 0 and prior_start >= lower and prior_end <= self.end
        previous = self.select(filters, (prior_start, prior_end)) if comparable else []
        prior_metrics = metrics(previous)
        groups = {name: self.breakdown(rows, previous, field) for name, field in {
            "channels": "channel", "resolving_shifts": "roster_shift", "arrival_shifts": "arrival_shift",
            "response_shifts": "response_shift", "roster_teams": "roster_team",
            "assigned_teams": "assigned_team", "agents": "agent_id"}.items()}
        changes = []
        for dimension in ["channels", "resolving_shifts", "arrival_shifts", "roster_teams"]:
            for r in groups[dimension]:
                now, old = r["metrics"], r["previous_metrics"]
                changes.append({"dimension": dimension, "key": r["key"], "label": r["label"],
                                "current_tickets": now["tickets"], "previous_tickets": old["tickets"],
                                "current_breaches": now["breaches"], "previous_breaches": old["breaches"],
                                "breach_change": now["breaches"] - old["breaches"],
                                "rate_change_pp": r["rate_change_pp"],
                                "volume_change_pct": percent(now["tickets"] - old["tickets"], old["tickets"]),
                                "current_share": r["volume_share"],
                                "previous_share": percent(old["tickets"], prior_metrics["tickets"])})
        cells = defaultdict(list)
        for r in rows:
            cells[(r["arrival_shift"], r["roster_shift"])].append(r)
        crosstab = []
        for (arrival, resolving), values in sorted(cells.items()):
            m = metrics(values)
            crosstab.append({"arrival_shift": arrival, "resolving_shift": resolving,
                             "tickets": m["tickets"], "breaches": m["breaches"], "breach_rate": m["breach_rate"]})
        scenario = current["evaluated"] * .15 * CREDIT
        return {"dataset_version": self.version, "filters": filters, "period": self.period(start, end),
                "metrics": current, "comparison": {
                    "available": comparable, "note": (
                        "Same weekdays in preceding week." if comparable and offset == 7
                        else "Equal-length previous period aligned to weekdays." if comparable
                        else "No complete prior comparable period within the supplied dataset and policy scope."),
                    "previous_period": self.period(prior_start, prior_end), "previous": prior_metrics,
                    "rate_change_pp": difference(current["breach_rate"], prior_metrics["breach_rate"]),
                    "breach_change": current["breaches"] - prior_metrics["breaches"] if comparable else 0,
                    "volume_change_pct": percent(current["tickets"] - prior_metrics["tickets"], prior_metrics["tickets"]),
                    "changes": sorted(changes, key=lambda c: -abs(c["breach_change"])) if comparable else []},
                "weekly": self.weeks(filters), **groups, "crosstab": crosstab,
                "scenario": {"target_rate": 15, "label": "Proposed operating target (analyst-selected)",
                             "gap_pp": difference(current["breach_rate"], 15), "observed_volume": current["evaluated"],
                             "scenario_exposure_inr": round(scenario, 2),
                             "potential_difference_inr": round(current["exposure_inr"] - scenario, 2),
                             "caveat": "Scenario estimate at selected observed volume, not actual savings or a quarterly forecast."},
                "caveats": [METHOD[0], METHOD[2], METHOD[6], METHOD[7], METHOD[8], METHOD[11]],
                "evidence_ids": [r["ticket_id"] for r in sorted(rows, key=lambda r: (not bool(r["breached"]), r["ticket_id"]))[:12]],
                "roster_method": f"Resolving-agent attribution; historical roster selected using {filters['roster_event']} timestamp in IST. Missing/ambiguous assignments remain Unmapped."}

    def ticket(self, tid):
        if tid not in self.by_id:
            raise KeyError(tid)
        r = self.by_id[tid]
        ticket = next(t for t in self.rows() if t["ticket_id"] == tid)
        order, product = self.orders.get(r["order_id"]), self.products.get(r["product_sku"])
        detail = {"ticket": public_ticket(ticket), "customer_message": r["customer_message"],
                  "agent_notes": r["agent_notes"], "customer_id": r["customer_id"],
                  "order_id": r["order_id"] or None, "product_sku": r["product_sku"],
                  "csat_score": int(score(r)) if score(r).isdigit() and 1 <= int(score(r)) <= 5 else None,
                  "refund_amount_raw": r["refund_amount_inr"] or None,
                  "refund_reason_code": r["refund_reason_code"] or None,
                  "replacement_issued": r["replacement_issued"] == "Y",
                  "roster_assignments": [dict(a, to_date=a["to_date"] or None) for a in self.roster if a["agent_id"] == r["agent_id"]],
                  "sources": self.raw_by_id[tid],
                  "calculation": f"UTC first response − UTC creation = {ticket['response_minutes']} minutes; target {ticket['target_minutes']}; strictly greater = {ticket['breached']}.",
                  "caveats": [METHOD[2], METHOD[6], METHOD[10], "Detail roster uses creation date; every historical assignment is shown for audit."],
                  "classifications": []}
        if order:
            detail["order"] = {"order_id": order["order_id"], "customer_id": order["customer_id"],
                               "sku": order["sku"], "order_date": order["order_date"], "sales_channel": order["channel"],
                               "qty": int(order["qty"]), "order_value_inr": float(order["order_value_inr"]), "lot_code": order["lot_code"]}
        if product:
            detail["product"] = {k: product[k] for k in ["sku", "product_name", "family"]}
            detail["product"].update(unit_cost_inr=float(product["unit_cost_inr"]), retail_price_inr=float(product["retail_price_inr"]),
                                     warranty_months=int(product["warranty_months"]))
        return detail

    def quality_checks(self):
        flags = defaultdict(list)
        for row in self.canonical:
            for flag in self.flags(row):
                flags[flag].append(row["ticket_id"])
        definitions = {
            "missing_resolution": "Open/pending tickets can still be evaluated for first-response SLA.",
            "missing_order": "Order context unavailable; does not exclude a valid SLA record.",
            "csat_nonresponse": "Blanks and legacy zeros excluded from satisfaction averages.",
            "legacy_csat_zero": "Legacy zero means no survey response.",
            "ticket_before_order": "Ticket creation predates linked order; chronology requires review.",
            "refund_and_replacement": "Positive refund and replacement flag on same ticket; investigate, not confirmed duplicate compensation.",
            "transcript_quality_review": "Explicit inaudible/line-dropped/no-audio/silence/failed markers. Count is a transparent rule, not the email's approximate forty.",
            "pre_policy": "No pre-April policy supplied. Excluded from policy scope but retained in retrospective view.",
            "legacy_money_ambiguous": "Native legacy unit lacks defensible conversion factor; no automatic conversion.",
            "legacy_transfers_unavailable": "Legacy transfer values are not evidence of zero transfers.",
        }
        critical = {"invalid_created_at", "invalid_first_response_at", "negative_response", "invalid_channel"}
        result = [{"key": key, "label": key.replace("_", " ").title(), "status": "WARN" if ids else "PASS",
                   "count": len(ids), "explanation": definitions.get(key, "Inspect source record; invalid SLA inputs are unknown, never assumed compliant."),
                   "ticket_ids": ids[:100]} for key, ids in sorted(flags.items())]
        for key in critical:
            if key not in flags:
                result.append({"key": key, "label": key.replace("_", " ").title(), "status": "PASS",
                               "count": 0, "explanation": "No invalid values detected.", "ticket_ids": []})
        overlaps = []
        for i, a in enumerate(self.roster):
            for b in self.roster[i + 1:]:
                if a["agent_id"] == b["agent_id"] and a["from_date"] <= (b["to_date"] or "9999") and b["from_date"] <= (a["to_date"] or "9999"):
                    overlaps.append(a["agent_id"])
        result.append({"key": "roster_overlap", "label": "Overlapping roster assignments", "status": "WARN" if overlaps else "PASS",
                       "count": len(overlaps), "explanation": "Date ranges are inclusive; overlaps are never silently resolved.", "ticket_ids": []})
        result.append({"key": "conflicting_duplicates", "label": "Quarantined duplicate source rows", "status": "WARN" if self.quarantined else "PASS",
                       "count": len(self.quarantined), "explanation": "Conflicting business fields require human review; quarantined records excluded.",
                       "ticket_ids": sorted({r["ticket_id"] for r in self.quarantined})[:100]})
        return result

    def validation(self, raw_filters):
        filters = normalize_filters(raw_filters)
        rows = self.select(filters)
        m = metrics(rows)
        duplicate_copies = len(self.raw) - len(self.quarantined) - len(self.canonical)
        rec = {"raw_rows": len(self.raw), "duplicate_copies": duplicate_copies, "quarantined_rows": len(self.quarantined),
               "canonical_tickets": len(self.canonical), "selected_tickets": len(rows), "evaluated": m["evaluated"],
               "breaches": m["breaches"], "non_breaches": m["non_breaches"], "unknown": m["unknown"],
               "mapped": sum(r["_matches"] == 1 for r in rows), "unmapped": sum(r["_matches"] != 1 for r in rows),
               "multiple_roster_matches": sum(r["_matches"] > 1 for r in rows),
               "channels_total": sum(Counter(r["channel"] for r in rows).values()),
               "shifts_total": sum(Counter(r["roster_shift"] for r in rows).values()),
               "agents_total": sum(Counter(r["agent_id"] for r in rows).values()),
               "exposure_inr": m["exposure_inr"], "expected_exposure_inr": m["breaches"] * CREDIT}
        rec["passes"] = (rec["raw_rows"] == duplicate_copies + rec["quarantined_rows"] + rec["canonical_tickets"]
                         and rec["selected_tickets"] == m["breaches"] + m["non_breaches"] + m["unknown"]
                         and rec["exposure_inr"] == rec["expected_exposure_inr"]
                         and all(rec[k] == len(rows) for k in ("channels_total", "shifts_total", "agents_total")))
        return {"status": "FAIL" if not rec["passes"] else "WARN" if any(c["count"] for c in self.checks) else "PASS",
                "status_definition": "FAIL: reconciliation cannot be trusted. WARN: visible data-quality limitations; valid SLA records retained. PASS: no flagged issues.",
                "dataset_version": self.version, "filters": filters, "reconciliation": rec, "checks": self.checks,
                "methodology": METHOD, "source_files": self.sources, "ai_evaluation_status": "Not evaluated"}

    def metadata(self, ai_available=False, model=""):
        complete = [w for w in self.weeks(normalize_filters({})) if not w["partial"]]
        agents = {a["agent_id"]: {"agent_id": a["agent_id"], "name": a["name"], "tier": a["tier"]} for a in self.roster}
        return {"dataset_version": self.version, "loaded_at": self.loaded_at, "date_start": str(self.start),
                "date_end": str(self.end), "policy_effective_date": str(POLICY_DATE),
                "default_week": complete[-1]["week"] if complete else str(monday(self.end)),
                "raw_rows": len(self.raw), "canonical_tickets": len(self.canonical), "channels": list(TARGETS),
                "teams": sorted({r["team"] for r in self.roster}), "agents": list(agents.values()),
                "shifts": ["Morning", "Day", "Night"], "policies": [{"channel": c, "target_minutes": t} for c, t in TARGETS.items()],
                "source_files": self.sources, "ai_available": ai_available, "ai_model": model,
                "notices": ["Historical export, not live support data.", METHOD[0], METHOD[4], METHOD[6], METHOD[7]]}


def public_ticket(row):
    return {k: v for k, v in row.items() if not k.startswith("_")}


_lock = threading.Lock()
_cache = None
_signature = None


def get_dataset():
    global _cache, _signature
    directory = Path(os.environ.get("VIREO_DATA_DIR", ROOT / "attached_assets"))
    paths = {}
    for name in ["tickets", "agents", "orders", "customers", "products"]:
        candidates = [directory / f"{name}.csv"] if (directory / f"{name}.csv").exists() else sorted(directory.glob(f"*-{name}_*.csv"))
        if len(candidates) != 1:
            raise ValueError(f"{name}.csv could not be loaded: expected one matching file in configured data directory.")
        paths[name] = candidates[0]
    signature = tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in paths.values())
    with _lock:
        if signature != _signature:
            fingerprint = "".join(hashlib.sha256(p.read_bytes()).hexdigest() for p in paths.values())
            _cache = Dataset(paths, fingerprint)
            _signature = signature
        return _cache