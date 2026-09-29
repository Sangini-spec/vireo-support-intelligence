# Vireo Support Intelligence

Public source-code submission with the README and client memo. Supplied client datasets, source documents, caches and prior development history are intentionally excluded. To run the analytics, obtain the authorized assignment data and follow section 11; this repository does not generate replacement or synthetic data.

## 1. What this is

An AI-assisted support SLA intelligence prototype for Vireo Audio. It helps a Support Operations Manager monitor weekly first-response SLA performance, identify breach concentrations by channel, shift and agent, inspect real ticket evidence, investigate conversation patterns and generate a manager-facing brief. Deterministic analytics—not the model—establish SLA results; AI supports semantic analysis and evidence-grounded interpretation.

**Code calculates. Validation establishes trust. AI interprets the evidence.**

## 2. Business problem

Neha Kulkarni needs a weekly report showing **which agents and which shifts have the most breaches**, so she can review the relevant cases and have an informed operational conversation. The product serves that workflow; it is not an employee-scoring system, an attendance system or a general support platform.

## 3. Business goal

The current **policy-effective baseline, 1 April 2025–30 June 2026 IST**, was freshly verified against the running deterministic API:

| Measure | Validated baseline |
|---|---:|
| Eligible/evaluated tickets | 10,176 |
| First-response SLA breaches | 2,341 |
| Breach rate | 23.0051% — displayed as 23.01% |
| Estimated SLA-credit exposure | ₹819,350 |

**Proposed operating target — analyst-selected, not client-provided: reduce the observed first-response breach rate to 15%.** Use the weekly report to monitor movement toward that goal and investigate concentrations.

At the **same 10,176 evaluated-ticket volume**, the application's continuous-rate scenario estimates ₹534,240 exposure at 15%, or ₹285,110 less than observed exposure. The rate gap is 8.0051 percentage points. This is an illustrative same-volume scenario, **not credits paid, guaranteed savings, a quarterly forecast or an integer-ticket commitment**. No credit ledger was supplied.

The default screen is a complete week, not this full-history baseline. To reproduce the baseline, choose **Policy → All weeks · full baseline**, with all other filters clear.

## 4. Key findings

These findings use the default **creation-date historical roster mapping**:

- **Policy baseline — channel:** chat accounts for the largest breach volume: **1,333 / 4,479 evaluated tickets, 29.76%**.
- **Policy baseline — resolving-agent roster:** Morning assignments account for **1,957 / 5,786 evaluated tickets, 33.82%**. This is attribution to resolving agents' historical assignments, not evidence of individual responsibility.
- **Latest complete week, 22–28 June 2026:** **49 / 207 tickets breached, 23.67%, ₹17,150 estimated exposure**. The prior comparable week, 15–21 June, had **46 / 195, 23.59%**: **+3 breaches and +0.0818 percentage points**.
- **That week:** chat had **29 / 97 breaches, 29.90%**; Morning-rostered resolving agents had **41 / 109, 37.61%**.
- **Timing versus attribution:** in that week, **34 breached tickets** arrived during Night hours and were attributed to Morning-rostered resolving agents; that intersection contained **44 tickets**. Across the policy baseline, the same intersection contains **1,548 breaches / 2,094 tickets**.

The timing/attribution pattern merits review of queue carryover and handoffs. It does **not** establish attendance, staffing causation, fault or a proven root cause. Agent-level review must also consider channel mix, tier and low volume.

## 5. Product workflow

1. **Overview:** what happened in the selected reporting period?
2. **Weekly Operations:** what changed versus the comparable period?
3. **Shift/channel/team/agent drill-down:** where are breaches concentrated?
4. **Ticket evidence:** inspect actual timestamps, messages, notes and roster provenance.
5. **AI Insights / Ask AI:** investigate themes and retrieve supported operational findings.
6. **Manager Brief:** export a selected-filter, manager-readable Markdown summary.
7. **Validation:** inspect reconciliation, data-quality flags, duplicates and the separate AI evaluation status.

A fresh browser session defaults to **policy scope, all agents/channels/shifts/teams, and 22–28 June 2026**, the latest complete week in the supplied export. Filters persist within the browser session. **Reset** restores that broad complete-week view; **All weeks · full baseline** exposes the full policy baseline.

## 6. Architecture

```text
Five supplied CSVs
    → Pandas ingestion, canonicalization and validation
    → Deterministic Python SLA/roster/weekly analytics
    → Filter-bound ticket evidence
    → Optional managed OpenAI-compatible analysis
    → React dashboard / manager Markdown brief
```

- **Frontend:** React, TypeScript, Vite, TanStack Query, Tailwind CSS and Recharts.
- **Public API:** Express at `/api`; Vireo routes proxy to a private FastAPI service.
- **Analytics:** Python/Pandas; JSON Schema request checks use the OpenAPI contract.
- **Contracts:** `lib/api-spec/openapi.yaml`; Orval-generated React client and Zod types.
- **AI:** server-side HTTP calls to a configured OpenAI-compatible provider; current/default model **`gpt-5.4-mini`**.
- **Derived persistence:** local SQLite for generated outputs, evaluation reviews and bounded follow-up references. CSVs remain the source of truth and are never modified.
- **Process lifecycle:** `artifacts/api-server/start.mjs` supervises Express and the private Python child together. Replit supplies same-origin routing; the supplied Caddy configuration provides it for local development.

The Vireo runtime does **not** require PostgreSQL. `lib/db` and the mockup sandbox remain workspace scaffolding, not the analytics architecture.

## 7. Data and methodology

| Rule | Implementation |
|---|---|
| Timestamp normalization | Export timestamps are parsed as UTC. IST supplies dates, shifts, weeks and roster matching; no second migration offset is applied. |
| First-response targets | Chat **15 minutes**; voice **120**; social **240**; email **480**. |
| Breach definition | Elapsed first response **strictly greater than** the channel target. Equality is compliant. No business-hours pause is applied. |
| Policy scope | Creation date on/after **1 April 2025 IST**. Earlier records are available only in an explicitly retrospective historical view; no earlier policy was supplied. |
| Rate denominator | Evaluated/classifiable tickets. Invalid or negative response intervals and unsupported channels are unknown, not assumed compliant. |
| Credit exposure | Breaches × **₹350**. Resolved/closed exposure is separate from open/pending exposure; neither establishes credits actually paid. |
| Canonicalization | Compare business fields within ticket-ID groups, normalizing legacy CSAT zero to missing. Prefer helpdesk only when fields agree; quarantine conflicts. Original source rows remain auditable. |
| Historical roster | Default event is creation; response/resolution can be selected. Assignment dates are inclusive; blank end dates are open-ended. Missing/ambiguous mapping stays Unmapped. |
| Attribution | Resolving agent, historical roster team/shift, first-assigned team, arrival shift and response shift remain distinct. |
| Shift windows | IST Morning 06:00–13:59; Day 14:00–21:59; Night 22:00–05:59. |
| Weeks/comparison | Monday–Sunday is an analyst convention. Partial weeks compare matching weekdays; comparison is unavailable when policy/data coverage is insufficient. |
| Missing values | Missing order/resolution does not invalidate an otherwise valid first-response interval. Blank/legacy-zero CSAT means nonresponse. Legacy transfers are unavailable; legacy monetary conversion is not inferred. |
| Agent comparisons | Fewer than 30 evaluated tickets is an analyst-selected low-volume flag. Tier 1 and Tier 2 are not ranked together for ticket-volume productivity. |

Current reconciliation: **11,816 source rows − 616 matching duplicate copies = 11,200 canonical tickets**, with **0 quarantined source rows**. Policy scope selects **10,176**, all evaluated. Grouped totals and credit-exposure arithmetic reconcile. The overall validation status is **WARN** because genuine source-data caveats remain; that is distinct from a failed reconciliation.

Source coverage ends **30 June 2026**. The final 29–30 June interval is a partial week, not the default complete-week review. Further decisions and caveats are recorded in [`DECISIONS.md`](DECISIONS.md).

## 8. AI usage

### AI is used for

- Semantic analysis of real `customer_message` and `agent_notes`.
- Bounded conversation/theme classification and taxonomy generation.
- Recurring-pattern exploration and evidence-backed hypotheses, not population-wide prevalence estimates.
- Natural-language selection of approved analytics and claim-scoped evidence through read-only tools.
- Manager-facing interpretation in insight cards and optional reuse of cached hypotheses in the brief.

The brief's structure and metrics are generated deterministically. Ask AI plans tool calls and selects approved finding/evidence references; **the server renders its numerical answers and resolves exact source quotes**.

### AI is not used for

Authoritative SLA calculations, breach-rate arithmetic, grouped counts, financial arithmetic, invented tickets/quotes, employee judgments or unsupported causal conclusions.

**The deterministic analytics layer remains the source of truth for quantitative operational metrics.**

Ticket text is treated as untrusted evidence. Phone-like sequences and email addresses are redacted before semantic sampling; customer metadata is not supplied to the model. Evidence must match the actual source and the relevant selected cohort. No fuzzy quote acceptance, unrestricted SQL, shell access or source mutation is allowed.

Ask AI has nine allowlisted read-only tools, at most twelve calls/five rounds. A follow-up can use an opaque `context_id` bound to the previous verified findings, dataset version and exact filters—not unrestricted chat history. Unsupported requests, missing context or unmatched evidence return a clear insufficient-evidence response. Without provider configuration, deterministic reporting still works and AI is explicitly unavailable.

## 9. AI evaluation

**AI evaluation status: Not yet measured against a human-labeled benchmark.**

The current running evaluation endpoint reports **0 reviewed classifications**, `observed_accuracy: null` and `unsupported_claim_rate: null`. No accuracy percentage is claimed.

The implemented review workflow records correct/incorrect/uncertain judgments and optional unsupported-claim labels. Once genuine reviews exist, observed accuracy is correct/all reviewed, including uncertain; it is a reviewed-sample measure, not population accuracy. Reviewer identity is self-declared in this unauthenticated prototype.

AI insights remain evidence-backed hypotheses. This limitation is **separate from the tested deterministic calculations and reconciliation**; provider smoke tests and model confidence are not an AI benchmark.

## 10. Validation and testing

The following checks were rerun for this documentation pass:

| Check | Result |
|---|---|
| Python deterministic/contract/guardrail suite | **31 tests passed** |
| Workspace TypeScript checks | **Passed** |
| API build | **Passed** |
| Frontend production build | **Passed**, with existing sourcemap-reporting and bundle-size warnings |
| Supervisor syntax and Python dependency imports | **Passed** |
| Installed Python dependency compatibility | **Passed**, `uv pip check` |
| Running HTTP API | Metadata, policy baseline, complete-week dashboard, validation and evaluation returned successfully |
| Local startup smoke | Caddy configuration validated; documented API supervisor and frontend commands served HTML, metadata, baseline, weekly metrics and evaluation through Caddy |

Tests cover strict SLA boundaries (including seconds), channel targets, UTC/IST transitions, roster boundaries and missing events, duplicate preference/conflict quarantine, policy boundaries, partial-week comparisons, grouped reconciliation, exposure splits, real-ticket contracts, filtered briefs and unavailable AI. Evidence tests reject tampered quotes, invented references, wrong finding/cohort combinations and unsupported answer prose; follow-up tests check context isolation.

During the preceding final refinement, the full browser journey passed through Overview, Weekly Operations, shift/agent drill-down, real ticket evidence, AI Insights, Ask AI, Manager Brief download and Validation without a blocking error. All four required questions returned grounded responses for 22–28 June: weekly change, highest channel rate, highest roster-shift rate and contextual supporting evidence. Display-precision and selected-period badge issues were subsequently corrected and checked. These are **functional smoke tests, not human-measured AI accuracy**. This documentation pass did not rerun billable generation or browser/E2E tests.

Reproduce the automated checks from the repository root:

```sh
uv run --frozen python -m unittest discover -s artifacts/api-server/python -p 'test_*.py' -v
pnpm run typecheck
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/vireo-intelligence run build
```

The data-dependent regression tests require the authorized supplied dataset; their expected values are test assertions, not hard-coded runtime analytics.

## 11. How to run

### Requirements

- A POSIX-compatible shell and Git, with this complete workspace checked out.
- **Node.js 22.12+** (verified here with **24.13.0**) and **pnpm 10** (verified **10.26.1**). Use pnpm, not npm/yarn, for this workspace.
- **Python 3.13+** and **uv** for the checked-in Python project/lockfile (verified **3.13.11**, uv **0.9.24**).
- **Caddy 2** for the documented local same-origin route. Replit already supplies routing and does not need Caddy.
- Network access for initial dependency downloads; provider access only if using AI features.

### Installation

Run from the repository root after checkout:

```sh
pnpm install --frozen-lockfile
uv sync --frozen
```

On a **non-Replit machine**, uv manages the project's Python environment; run the backend through `uv run` so its `python3` child resolves to that environment. On **Replit**, dependencies use the managed Python package system and its existing environment; do not manually create a custom virtual environment. `pyproject.toml`/`uv.lock` are the reproducible dependency source. `artifacts/api-server/python/requirements.txt` also lists the same six pinned direct dependencies for an evaluator using another configured Python installation.

Generated API clients are checked in. Only regenerate them after changing the contract:

```sh
pnpm --filter @workspace/api-spec run codegen
```

### Environment variables

[`.env.example`](.env.example) contains only safe defaults and commented placeholders. The app does **not** automatically load a root `.env`; local instructions explicitly source it.

```sh
cp .env.example .env
# .env is ignored by Git; never commit populated credentials.
# Edit .env locally if needed, then load it in the backend terminal:
set -a
. ./.env
set +a
```

Only load an environment file you control. Never commit populated credentials. On Replit, use the provided environment/Secrets instead of copying credentials into files.

| Variable | Purpose |
|---|---|
| `PORT` | Required service port: **5000 for Express**, **5173 for Vite** in the commands below |
| `BASE_PATH` | Required Vite base path; `/` for this root-mounted app |
| `VIREO_DATA_DIR` | Optional **absolute** path to the five CSVs; defaults to repository `attached_assets/` |
| `VIREO_AI_MODEL` | Optional model override; current/default `gpt-5.4-mini` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` | Optional managed provider pair, provisioned by Replit |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | Optional external OpenAI-compatible configuration; default external base is `https://api.openai.com/v1` |
| `VIREO_PYTHON` | Optional Python executable override; default `python3` from PATH |
| `VIREO_ANALYTICS_PORT` | Optional private FastAPI port; default **18765**, bound to loopback |
| `VIREO_CACHE_PATH` | Optional **absolute** SQLite path; defaults to repository `.cache/vireo/insights.sqlite3` |

Choose **one** provider configuration. Managed provider variables take precedence. An external model must be available to the chosen provider and support chat completions, tools, JSON responses and `max_completion_tokens`; do not assume the managed model name is universally available. No AI credential is required for deterministic use. No `DATABASE_URL` is required.

### Data setup

The application requires only these five CSV datasets at runtime:

```text
authorized-data/
├── tickets.csv
├── agents.csv
├── orders.csv
├── customers.csv
└── products.csv
```

Preserve the original columns and values. Either:

1. Create `attached_assets/` locally and place the five authorized CSVs there (the loader also recognizes the original uploaded filename pattern), or
2. Place the five conventional filenames above in an authorized directory and set `VIREO_DATA_DIR` to that directory's **absolute path**.

Exactly one uploaded-pattern match per dataset is required when a conventional filename is absent. The policy/email PDFs are supporting methodology references, **not runtime inputs**.

**Repository privacy:** This public repository excludes the supplied CSV exports, policy/email PDFs and original development history. Obtain those files separately with authorization. Local `attached_assets/`, `authorized-data/`, credentials and caches are ignored by Git. Do not commit client files or expose an unauthenticated instance containing them. The README and memo retain the assignment's aggregate findings and limited review references, not raw customer conversations.

### Run

On a clean local machine, open three terminals at the repository root. Keep the documented ports free.

**Terminal 1 — build and start the API supervisor:**

```sh
set -a
. ./.env
set +a
pnpm --filter @workspace/api-server run build
PORT=5000 uv run --frozen pnpm --filter @workspace/api-server run start
```

The supervisor launches both Express and private FastAPI, checks Python imports, and stops both children on shutdown. It does not install packages at startup.

**Terminal 2 — frontend:**

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/vireo-intelligence run dev
```

**Terminal 3 — same-origin routing:**

```sh
caddy validate --config Caddyfile --adapter caddyfile
caddy run --config Caddyfile --adapter caddyfile
```

The checked-in `Caddyfile` listens on **8080**, forwards `/api/*` to **5000**, and everything else to **5173**. The frontend uses relative `/api` requests; opening Vite's port directly bypasses the required API routing.

On **Replit**, use the existing managed workflows **`artifacts/api-server: API Server`** and **`artifacts/vireo-intelligence: web`**, then open the workspace preview. Managed service ports/routing replace the three-terminal local Caddy setup.

### Open and check

Open **http://localhost:8080/** for the local setup. Verify the routed API:

```sh
curl --fail http://localhost:8080/api/vireo/meta
curl --fail 'http://localhost:8080/api/vireo/dashboard?scope=policy'
curl --fail 'http://localhost:8080/api/vireo/dashboard?scope=policy&week=2026-06-22'
curl --fail http://localhost:8080/api/vireo/evaluations
```

Allow the private service to finish loading before retrying an initial unavailable response. The expected baseline is 10,176 evaluated tickets and 2,341 breaches; the default complete week has 207 and 49.

**Verification boundary:** builds, tests, Python imports, dependency compatibility and running-API requests passed in this workspace. The checked-in Caddy configuration validated with Caddy 2.10.0. The documented backend and frontend startup commands were then exercised together through Caddy; routed HTML, metadata, baseline, complete-week metrics and evaluation checks passed. To avoid the active preview's ports, this temporary check used Caddy **19181** instead of **8080**, private Python **18766** instead of **18765**, an isolated temporary SQLite file and disabled Caddy's admin endpoint; Express **5000** and Vite **5173** were unchanged. Temporary services were stopped afterward. Dependencies were already installed: this verifies startup and routing, **not a fresh dependency download on a separately provisioned clean machine**.

## 12. Repository structure

```text
.
├── README.md
├── .env.example
├── Caddyfile
├── DECISIONS.md
├── package.json / pnpm-lock.yaml / pnpm-workspace.yaml
├── pyproject.toml / uv.lock
├── artifacts/
│   ├── vireo-intelligence/       # React/Vite product
│   ├── api-server/
│   │   ├── start.mjs            # Express + Python supervisor
│   │   ├── src/                 # Express gateway
│   │   └── python/
│   │       ├── app.py           # FastAPI routes / request validation
│   │       ├── engine.py        # Deterministic analytics
│   │       ├── ai.py            # Provider, tools, evidence, reviews
│   │       ├── reports.py       # Manager Markdown brief
│   │       ├── test_engine.py
│   │       ├── requirements.txt
│   │       └── prompts/
│   └── mockup-sandbox/          # Retained design scaffolding, not the product
├── lib/
│   ├── api-spec/openapi.yaml
│   ├── api-client-react/        # Generated client + fetch utility
│   ├── api-zod/                 # Generated schemas/types
│   └── db/                      # Retained workspace DB scaffolding; unused by Vireo
├── scripts/                    # Workspace tooling
└── docs/
    ├── memo.md
    └── memo.pdf
```

Generated build outputs, installed dependencies, private source data, project-agent instructions and local caches are excluded. Create a local data directory as described in section 11. There is no separate submission-form artifact documented here.

## 13. Scope and future work

The five-hour assignment prioritized a trustworthy analytical foundation and Neha's immediate **week → shift/team → agent → ticket** review workflow.

Deliberately deferred: scheduled reporting, durable multi-user historical storage, a representative human-labeled AI benchmark, anomaly detection, forecasting, real-time monitoring, SLA-risk prediction, controlled helpdesk integrations and human-approved operational automation. Authentication and production deployment hardening would precede broader access. These are future extensions, not claims about current capabilities.

The application exports manager briefs as **Markdown**. The separately prepared assignment memo PDF is a documentation deliverable, not an in-app PDF-export feature.

## 14. AI-assisted development disclosure

Replit Agent was used for AI-assisted implementation, refinement, testing and documentation, including delegated frontend/backend work. Runtime analysis uses Replit's managed **OpenAI-compatible integration**, currently **`gpt-5.4-mini`**; it is not a Gemini integration.

The model is configurable through `VIREO_AI_MODEL`. Calls use an 8,192 maximum completion-token setting and no temperature parameter. Provider token usage is recorded when returned, but **exact development/runtime monetary cost has not been measured**; no price or total spend is invented.

A documented discarded approach had Ask AI recopy quotes into free-form output. Exact-source validation correctly withheld unsupported quotations. The final approach keeps that protection and instead lets AI select approved finding/evidence references; the server supplies deterministic metric text and exact, cohort-matched quotes.

## 15. Known limitations

- Roster data describes assignments, not attendance; resolving-agent attribution does not identify the first responder or establish responsibility.
- Queue-event history, independent bot/human-response confirmation and a credit-payment ledger are unavailable.
- No pre-April policy or defensible legacy monetary conversion factor was supplied; legacy CSAT/transfer conventions require care.
- Data ends 30 June 2026. Partial periods and low-volume agents require cautious comparisons; there is no live support feed.
- Correlation and sampled conversations do not establish causality or population topic prevalence.
- AI has no completed human-labeled benchmark. Requests outside approved findings may receive insufficient evidence.
- Local SQLite is prototype persistence, not a shared multi-replica database; preserve it separately if reviews must survive migration.
- No authentication/access control protects the prototype. Customer/agent source text is available in ticket drill-down; do not expose it publicly without authorization and controls.
- Frontend build warnings remain. Startup/routing was verified with installed dependencies; initial dependency downloads on a separately provisioned machine were not tested.

## 16. License / assignment note

Created for the Vireo Audio support-ticket assignment. This README and `.env.example` contain no real credentials or copied customer conversations.

The root package metadata declares MIT, but no dedicated repository LICENSE file was found; this documentation introduces **no new license** and grants no rights to redistribute Vireo's supplied data. The public copy excludes private supplied files and starts with fresh Git history. Aggregate assignment findings and limited review references remain in the README and memo as submission deliverables.