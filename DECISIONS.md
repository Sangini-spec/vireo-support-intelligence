# Vireo implementation decisions

## Explicitly supplied rules

Support Policy v3.2 takes effect 1 April 2025. First human response targets: chat 15 minutes, voice callback 120 minutes, social 240 minutes, email 480 minutes. Breach is strictly later than target; no business-hours pause is stated. Estimated credit is ₹350 per breach, issued on resolution according to policy.

Administrator email explicitly identifies the supplied API export as UTC. Every timestamp is parsed once as UTC; IST supplies calendar dates, week buckets and shift windows. The migration note does not justify adding a second UTC correction to resolution times.

The resolving agent receives standard report attribution; assigned_team is the first-assigned team. Historical roster rows represent assignment periods, not attendance. Tier2 is not compared to Tier1 on ticket-volume productivity. Headcount is frozen until Q4.

## Analyst choices, clearly labeled

- Reporting weeks are Monday–Sunday IST.
- Primary scope is creation date on/after policy effective date. Historical scope includes all supplied records with a retrospective disclaimer.
- Creation date selects historical roster by default: the same event defines ticket cohorts and permits mapping open/pending records. Users can explicitly select first-response or resolution date. Missing/ambiguous events remain Unmapped.
- Assignment from/to dates are inclusive; blank to_date is open-ended.
- Fewer than 30 evaluated tickets receives a low-volume note, not statistical confidence.
- The proposed 15% target is not a client requirement. Financial scenarios use actual selected evaluated volume; no unsupported quarterly extrapolation is shown.
- Partial weekly cohorts compare the same weekdays of the preceding week. Other date spans compare equal-length prior periods aligned to weekdays. No prior comparison is displayed if policy/data coverage is insufficient.
- The latest complete week is offered as metadata.default_week; a final partial week remains selectable and visibly flagged.

## Data integrity

Matching duplicates are compared on all original business fields, excluding source_system/row number, after normalizing legacy CSAT zero to missing. Helpdesk wins only if these fields agree. Future conflicts and missing IDs are quarantined with source provenance.

All original CSV string values are preserved for audit. Blank refunds do not become proven zero refunds. Legacy monetary units are not auto-converted. Legacy transfers are marked unavailable. CSAT blanks and legacy zeros are nonresponses.

Missing resolution/order linkage, CSAT nonresponse, text quality, chronology inconsistencies and compensation flags are surfaced without excluding otherwise valid first-response calculations. Invalid creation/response/channel/negative elapsed values cannot produce a confident SLA judgment.

The 246 ticket-before-order observations and six refund-plus-replacement flags are review signals, not confirmed misconduct. These counts are computed from the current files, not encoded in analytics.

Quality-marker rule: customer text containing [inaudible], [line dropped], [no audio], [silence] or [transcription failed] is flagged for transcript review. This is intentionally not presented as the administrator's estimated total of failed transcripts.

## AI boundaries

Deterministic Python owns all calculations and comparisons. The model sees computed tool results and bounded text, not unrestricted SQL or raw CSV access. Selected filters cannot be changed through AI tools.

For insights/classifications, model-generated excerpts must match retrieved source text exactly. IDs outside the provided sample and invalid classifications are rejected. Output includes observation/evidence/hypothesis/limitation/investigation rather than definitive root causes. Quote validation does not automatically validate a model's broader interpretation.

The final Ask AI reliability pass identified two concrete design weaknesses: the model had to recopy quotes exactly, and the validator authorized only the generic ticket-example sample even though other tools could expose cached insight evidence. A generic selected-filter sample also did not guarantee that an example belonged to the specific rate leader discussed.

Ask AI now resolves references rather than accepting model-authored quotes or numeric prose. Every displayed finding is server-rendered from deterministic metrics. Its evidence tool retrieves only actual breached tickets matching that finding's cohort (including both dimensions for arrival/roster cross-tabs). The response validator requires retrieved, related finding IDs and evidence IDs, then rechecks exact source substrings. No guardrail was removed or replaced with fuzzy quote matching. Source-case context is explicitly distinguished from aggregate-rate evidence and from causality.

Contextual follow-ups use a bounded opaque reference to previous verified finding IDs, bound to the exact dataset and normalized filters in the existing SQLite cache. A missing or changed context asks the user to restate the finding instead of guessing. No unrestricted conversation memory or client-supplied prior answer is accepted.

The model remains the read-only tool planner and finding selector. Its narrative is not used to calculate or state authoritative metrics. General questions without an approved finding are intentionally answered with insufficient evidence rather than a fabricated or numerically unvalidated response.

AI model/prompt/dataset/taxonomy versions are recorded. Prompt hashes invalidate generated-cache entries. Classification results store taxonomy version; regeneration creates a new classification identity and does not overwrite previous human reviews.

Human evaluation remains Not evaluated until real reviewer labels exist. Self-declared reviewer identity is not authenticated and is disclosed. Classification sample accuracy is not represented as whole-dataset accuracy.

Manager briefs always use deterministic metrics. Optional AI context reuses an exact-filter cached insight; absent insights are disclosed, not fabricated or automatically regenerated.

## Scope and deployment safety

CSV source of truth, Python/Pandas/FastAPI analytics, React UI, existing Express gateway, managed child supervisor. No complex database or unrelated product scope was added. SQLite is a lightweight prototype cache/review store.

Auth, PDF export, sophisticated forecasting, advanced anomalies, staffing optimization and financial transaction systems are intentionally deferred. The prototype contains support text and must not be publicly exposed without access controls.