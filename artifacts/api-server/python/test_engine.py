"""Deterministic unit and contract checks. No browser/E2E or running server."""
import copy
import json
import os
import tempfile
import unittest
from datetime import date
from unittest.mock import patch

import jsonschema

import ai
import reports
from app import SPEC, RESOLVER, body_check
from engine import deduplicate, get_dataset, metrics, normalize_filters, resolve_roster, shift_at, sla


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ds = get_dataset()
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_cache = ai.DB_PATH
        from pathlib import Path
        ai.DB_PATH = Path(cls.temp.name) / "test.sqlite3"

    @classmethod
    def tearDownClass(cls):
        ai.DB_PATH = cls.old_cache
        cls.temp.cleanup()

    def contract(self, name, value):
        jsonschema.Draft202012Validator(SPEC["components"]["schemas"][name], resolver=RESOLVER).validate(value)

    def test_sla_boundaries(self):
        row = dict(channel="chat", created_at="2025-04-01 00:00")
        for stamp, breach in [("2025-04-01 00:14", False), ("2025-04-01 00:15", False), ("2025-04-01 00:16", True)]:
            self.assertEqual(sla(dict(row, first_response_at=stamp))["breached"], breach)
        for stamp, breach in [("2025-04-01 00:14:59", False), ("2025-04-01 00:15:00", False), ("2025-04-01 00:15:01", True)]:
            self.assertEqual(sla(dict(row, first_response_at=stamp))["breached"], breach)

    def test_channels(self):
        for channel, stamp in [("voice", "2025-04-01 02:00"), ("social", "2025-04-01 04:00"), ("email", "2025-04-01 08:00")]:
            self.assertFalse(sla(dict(channel=channel, created_at="2025-04-01 00:00", first_response_at=stamp))["breached"])

    def test_unknown_never_compliant(self):
        for response in ["", "broken", "2025-03-31 23:59"]:
            self.assertIsNone(sla(dict(channel="chat", created_at="2025-04-01 00:00", first_response_at=response))["breached"])

    def test_utc_to_ist(self):
        self.assertEqual(shift_at("2025-04-01 00:29"), "Night")
        self.assertEqual(shift_at("2025-04-01 00:30"), "Morning")
        self.assertEqual(shift_at("2025-04-01 08:30"), "Day")
        self.assertEqual(shift_at("2025-04-01 16:30"), "Night")

    def test_deduplication_reconciliation(self):
        self.assertEqual(len(self.ds.raw), 11816)
        self.assertEqual(len(self.ds.canonical), 11200)
        self.assertEqual(len(self.ds.duplicates), 616)
        self.assertFalse(self.ds.quarantined)
        for group in self.ds.duplicates:
            self.assertEqual(next(r for r in group["rows"] if r["row_number"] == group["canonical_row_number"])["source_system"], "helpdesk")

    def test_conflicting_duplicate_quarantined(self):
        group = copy.deepcopy(self.ds.duplicates[0]["rows"])
        group[1]["channel"] = "invalid"
        canonical, audit, quarantine = deduplicate(group)
        self.assertFalse(canonical)
        self.assertEqual(len(quarantine), 2)
        self.assertTrue(audit[0]["quarantined"])

    def test_roster_transition(self):
        for stamp, shift in [("2025-06-29 00:00", "Night"), ("2025-06-29 19:00", "Day")]:
            self.assertEqual(resolve_roster({"agent_id": "A3002", "created_at": stamp}, self.ds.roster)[0]["shift"], shift)

    def test_missing_roster(self):
        self.assertEqual(resolve_roster({"agent_id": "absent", "created_at": "2025-06-30 00:00"}, self.ds.roster), [])

    def test_primary_baseline(self):
        value = self.ds.dashboard({})
        self.assertEqual(value["metrics"]["tickets"], 10176)
        self.assertEqual(value["metrics"]["breaches"], 2341)
        self.assertEqual(value["metrics"]["exposure_inr"], 819350)
        self.assertAlmostEqual(value["metrics"]["breach_rate"], 2341 / 10176 * 100, places=3)
        self.contract("Dashboard", value)

    def test_historical_is_distinct(self):
        value = self.ds.dashboard({"scope": "historical"})
        self.assertEqual(value["metrics"]["tickets"], 11200)
        self.assertEqual(value["metrics"]["breaches"], 2440)
        self.assertEqual(value["metrics"]["exposure_inr"], 854000)

    def test_missing_resolution_not_excluded(self):
        rows = [r for r in self.ds.rows() if r["resolved_at"] is None]
        self.assertEqual(len(rows), 589)
        self.assertEqual(metrics(rows)["unknown"], 0)
        unresolved = [r for r in self.ds.rows("resolved") if r["resolved_at"] is None]
        self.assertTrue(all(r["roster_shift"] == "Unmapped" for r in unresolved))

    def test_exposure_split(self):
        m = self.ds.dashboard({})["metrics"]
        self.assertEqual(m["completed_exposure_inr"] + m["pending_exposure_inr"], m["exposure_inr"])

    def test_partial_week_comparison(self):
        value = self.ds.dashboard({"week": "2026-06-29"})
        self.assertTrue(value["period"]["partial"])
        self.assertEqual(value["period"]["days"], 2)
        self.assertEqual(value["comparison"]["previous_period"]["start"], "2026-06-22")
        self.assertEqual(value["comparison"]["previous_period"]["end"], "2026-06-23")
        self.assertEqual(value["comparison"]["previous_period"]["days"], 2)
        self.assertTrue(value["comparison"]["available"])

    def test_policy_boundary_week(self):
        value = self.ds.dashboard({"week": "2025-03-31"})
        self.assertEqual(value["period"]["start"], "2025-04-01")
        self.assertTrue(value["period"]["partial"])
        self.assertFalse(value["comparison"]["available"])

    def test_grouped_reconciliation(self):
        value = self.ds.dashboard({"week": "2026-06-22"})
        for key in ["channels", "resolving_shifts", "arrival_shifts", "response_shifts", "roster_teams", "assigned_teams", "agents"]:
            self.assertEqual(sum(r["metrics"]["tickets"] for r in value[key]), value["metrics"]["tickets"])
            self.assertEqual(sum(r["metrics"]["breaches"] for r in value[key]), value["metrics"]["breaches"])
        self.assertEqual(sum(r["breaches"] for r in value["crosstab"]), value["metrics"]["breaches"])

    def test_cross_tab_inherited_attribution(self):
        value = self.ds.dashboard({"scope": "historical"})
        cell = next(c for c in value["crosstab"] if c["arrival_shift"] == "Night" and c["resolving_shift"] == "Morning")
        self.assertEqual(cell["breaches"], 1566)

    def test_validation(self):
        value = self.ds.validation({})
        self.assertTrue(value["reconciliation"]["passes"])
        self.assertEqual(value["status"], "WARN")
        self.contract("ValidationReport", value)

    def test_evidence_contract(self):
        tid = self.ds.canonical[0]["ticket_id"]
        detail = self.ds.ticket(tid)
        self.assertEqual(detail["customer_message"], self.ds.by_id[tid]["customer_message"])
        self.contract("TicketDetail", detail)
        self.contract("Metadata", self.ds.metadata())
        self.contract("DuplicatePage", {"items": self.ds.duplicates[:1], "total": len(self.ds.duplicates), "page": 1, "page_size": 1})

    def test_ai_unavailable_is_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(ai.available())
            response = ai.generate_insights(self.ds, {"filters": {}, "regenerate": True})
            self.assertEqual(response["status"], "unavailable")
            self.contract("InsightsResult", response)
            answer = ai.ask(self.ds, {"filters": {}, "question": "What happened?"})
            self.assertEqual(answer["status"], "unavailable")
            self.contract("AnswerResult", answer)
            classification = ai.classify(self.ds, {"filters": {}, "regenerate": True})
            self.contract("ClassificationResult", classification)

    def test_not_evaluated(self):
        value = ai.evaluation(self.ds)
        self.assertEqual(value["status"], "Not evaluated")
        self.assertIsNone(value["observed_accuracy"])
        self.contract("EvaluationResult", value)

    def test_evidence_guardrail(self):
        r = ai.sample(self.ds, normalize_filters({}), 1)[0]
        with self.assertRaises(ValueError):
            ai.evidence_valid([{"ticket_id": r["ticket_id"], "field": "customer_message", "excerpt": "Invented evidence"}], [r], self.ds)

    def test_claim_scoped_evidence(self):
        filters = normalize_filters({"week": "2026-06-22"})
        facts = ai.answer_findings(self.ds.dashboard(filters))
        fid = "highest_resolving_shifts_rate:Morning"
        registry = ai.finding_evidence(self.ds, filters, facts, [fid])
        self.assertTrue(registry)
        rows = {r["ticket_id"]: r for r in self.ds.select(filters)}
        for e in registry.values():
            self.assertTrue(rows[e["ticket_id"]]["breached"])
            self.assertEqual(rows[e["ticket_id"]]["roster_shift"], "Morning")
            self.assertIn(e["excerpt"], self.ds.by_id[e["ticket_id"]][e["field"]])
        resolved = ai.resolve_answer_evidence(self.ds, registry, list(registry), [fid])
        self.assertEqual(len(resolved), len(registry))
        with self.assertRaises(ValueError):
            ai.resolve_answer_evidence(self.ds, registry, list(registry), ["highest_channels_rate:chat"])
        with self.assertRaises(ValueError):
            ai.resolve_answer_evidence(self.ds, registry, ["invented-ID"], [fid])

    def test_tampered_excerpt_rejected_even_with_valid_reference(self):
        filters = normalize_filters({"week": "2026-06-22"})
        facts = ai.answer_findings(self.ds.dashboard(filters))
        fid = "highest_channels_rate:chat"
        registry = ai.finding_evidence(self.ds, filters, facts, [fid])
        key = next(iter(registry))
        registry[key]["excerpt"] = "Invented customer conversation not present in the source."
        with self.assertRaises(ValueError):
            ai.resolve_answer_evidence(self.ds, registry, [key], [fid])

    def test_rate_leaders_not_volume_leaders(self):
        facts = ai.answer_findings(self.ds.dashboard({"week": "2026-06-22"}))
        self.assertIn("highest_channels_rate:chat", facts)
        self.assertIn("highest_resolving_shifts_rate:Morning", facts)
        self.assertIn("29 breaches / 97", facts["highest_channels_rate:chat"]["text"])
        self.assertIn("41 breaches / 109", facts["highest_resolving_shifts_rate:Morning"]["text"])
        self.assertIn("46 to 49", facts["weekly_change"]["text"])

    @staticmethod
    def tool_message(name, args=None):
        return ({"role": "assistant", "content": None, "tool_calls": [
            {"id": "call-test", "type": "function", "function": {"name": name, "arguments": json.dumps(args or {})}}]}, 1)

    def test_ask_context_and_exact_refs(self):
        filters = {"week": "2026-06-22"}
        fid = "highest_resolving_shifts_rate:Morning"
        facts = ai.answer_findings(self.ds.dashboard(filters))
        registry = ai.finding_evidence(self.ds, normalize_filters(filters), facts, [fid])
        final = ({"content": json.dumps({"finding_ids": [fid], "evidence_ids": list(registry), "insufficient_evidence": False})}, 1)
        steps = [self.tool_message("get_shift_metrics"), self.tool_message("get_ticket_examples", {"finding_ids": [fid]}), final]
        with patch.object(ai, "available", return_value=True), patch.object(ai, "completion", side_effect=steps):
            first = ai.ask(self.ds, {"filters": filters, "question": "Which shift has the highest observed breach rate?"})
        self.assertEqual(first["status"], "ready")
        self.contract("AnswerResult", first)
        with patch.object(ai, "available", return_value=True), patch.object(ai, "completion", side_effect=steps[1:]):
            followup = ai.ask(self.ds, {"filters": filters, "question": "Show me the evidence for that finding.", "context_id": first["context_id"]})
        self.assertEqual(followup["status"], "ready")
        self.assertEqual(followup["evidence"], first["evidence"])
        with patch.object(ai, "available", return_value=True), patch.object(ai, "completion") as provider:
            stale = ai.ask(self.ds, {"filters": {"week": "2026-06-15"}, "question": "Show me the evidence for that finding.", "context_id": first["context_id"]})
            self.assertEqual(stale["status"], "insufficient_evidence")
            provider.assert_not_called()

    def test_followup_without_context_is_not_guessed(self):
        with patch.object(ai, "available", return_value=True), patch.object(ai, "completion") as provider:
            result = ai.ask(self.ds, {"filters": {}, "question": "Show me the evidence for that finding."})
        self.assertEqual(result["status"], "insufficient_evidence")
        provider.assert_not_called()

    def test_ask_rejects_fabricated_reference_and_prose(self):
        fid = "highest_channels_rate:chat"
        outputs = [
            {"finding_ids": [fid], "evidence_ids": ["invented-ticket"], "insufficient_evidence": False},
            {"finding_ids": [fid], "evidence_ids": [], "answer": "99999 invented breaches", "insufficient_evidence": False},
            {"finding_ids": ["highest_resolving_shifts_rate:Morning"], "evidence_ids": [], "insufficient_evidence": False},
        ]
        for output in outputs:
            with patch.object(ai, "available", return_value=True), patch.object(ai, "completion", side_effect=[
                self.tool_message("get_channel_metrics"), ({"content": json.dumps(output)}, 1)]):
                result = ai.ask(self.ds, {"filters": {"week": "2026-06-22"}, "question": "Which channel has the highest breach rate?"})
            self.assertEqual(result["status"], "insufficient_evidence")
            self.assertNotIn("99999", result["answer"])
            self.assertFalse(result["evidence"])

    def test_empty_comparison_is_insufficient(self):
        with patch.object(ai, "available", return_value=True), patch.object(ai, "completion") as provider:
            result = ai.ask(self.ds, {"filters": {"week": "2025-03-31"}, "question": "Why did SLA performance change this week?"})
        self.assertEqual(result["status"], "insufficient_evidence")
        provider.assert_not_called()

    def test_cross_tab_examples_match_both_dimensions(self):
        filters = normalize_filters({"week": "2026-06-22"})
        facts = ai.answer_findings(self.ds.dashboard(filters))
        fid = "arrival_roster:Night:Morning"
        registry = ai.finding_evidence(self.ds, filters, facts, [fid])
        selected = {r["ticket_id"]: r for r in self.ds.select(filters)}
        for e in registry.values():
            row = selected[e["ticket_id"]]
            self.assertEqual((row["arrival_shift"], row["roster_shift"]), ("Night", "Morning"))

    def test_filter_validation(self):
        for invalid in [{"week": "2026-06-23"}, {"scope": "anything"}, {"start_date": "2026-02-30"}, {"start_date": "2026-06-30", "end_date": "2026-01-01"}]:
            with self.assertRaises(ValueError):
                normalize_filters(invalid)

    def test_brief_real_filters(self):
        value = reports.brief(self.ds, {"filters": {"week": "2026-06-22", "channel": "chat"}})
        self.assertIn("Channel: chat", value["markdown"])
        self.assertNotIn(self.ds.version, value["markdown"])
        self.assertNotIn("roster_event=", value["markdown"])
        self.assertLess(value["markdown"].index("Executive summary"), value["markdown"].index("Current SLA position"))
        self.assertIn("2026-06-22", value["filename"])
        self.assertIn("No credit ledger supplied", value["markdown"])
        self.contract("BriefResult", value)


if __name__ == "__main__":
    unittest.main()