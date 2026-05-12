# OpsPilot — Phased Delivery Roadmap

This roadmap turns the full product brief into **sequenced releases** while keeping each phase deployable and reviewable by enterprise stakeholders. Durations assume a small platform team plus security review gates—adjust per capacity.

Legend: **M** = MVP must-have, **S** = should-have in phase if time permits, **C** = could defer.

---

## Phase 0 — Foundation (2–4 weeks)

**Objective:** Establish the application shell, security baseline, and empty domain modules—not feature-complete integrations.

| Deliverable | Priority |
|-------------|----------|
| Next.js shell, SSR, Tailwind UX baseline; dark/light (S) | M |
| SSO (OIDC/SAML via IdP) + session model | M |
| RBAC model (DevOps Engineer, Platform BSA, Release Manager, Leadership, Admin) seeded | M |
| PostgreSQL + migrations; audit log table + middleware | M |
| API conventions: versioning prefix, correlation IDs, error shape | M |
| CI pipeline: lint, typecheck, unit tests, container build | M |
| Non-prod Docker Compose / smoke deploy | M |
| Secrets via env/KMS stubs; `.env.example` without real credentials | M |

**Exit criteria:** A user can SSO in, receives a role-appropriate stub dashboard, every mutating API writes an audit row, and the app builds in CI.

---

## Phase 1 — Release calendar & notifications core (4–8 weeks)

**Objective:** Operational value first—**when** releases happen and **who** gets reminded.

| Deliverable | Priority |
|-------------|----------|
| Calendar CRUD: releases, maintenance windows, sandbox refresh (manual entry) | M |
| Recurrence engine (daily/weekly/biweekly/monthly/quarterly/custom) | M |
| Conflict detection (basic overlap rules) | M |
| One outbound channel integration: **Slack or Webex** (pick one primary) — post + scheduled reminders | M |
| Communication templates + variables (release name, env, deadlines) — no AI initially | M |
| Email escalation path (SMTP or transactional provider) — S | |
| Leadership read-only calendar + export **ICS** for subscription | C |

**Exit criteria:** Release Manager schedules a recurring release; reminders fire to the primary chat platform; Leadership can view the centralized calendar read-only.

---

## Phase 2 — Release planning workflows (6–10 weeks)

**Objective:** Move from calendar entries to **plan objects** — tasks, artifacts, approvals queue.

| Deliverable | Priority |
|-------------|----------|
| Release plan entity: milestones, checklist, owners, Apex vs manual tags | M |
| Kanban + list views; timeline view (S → M if stakeholder-critical) | S |
| Task dependencies (DAG validation, no circular) | M |
| Risk indicators (taxonomy + rollup to release) | S |
| First **Jira read** connector (issues keyed by Epic/Fix Version or labels)—link stories to releases | M |
| Approval routing: configurable steps per release type | M |

**Exit criteria:** A release plan links Jira-backed stories; approvals can be submitted and traced in audit log.

---

## Phase 3 — Copado validation & deployment visibility (8–14 weeks)

**Objective:** Operational heart for Salesforce DevOps—**Copado-aligned** readiness and failures.

| Deliverable | Priority |
|-------------|----------|
| Copado connector: validations, deployments, pipelines (scopes agreed with admins) | M |
| Schedule validations; ingest status callbacks or polling | M |
| Normalize validation errors → dashboard widgets (counts, timelines) | M |
| Retry/re-run flows with safeguards (approval on production paths) | S |
| “Deployment readiness” score from **deterministic rules** before AI embellishment | M |

**Exit criteria:** Team sees Copado validations in OpsPilot dashboards; failures are attributable to owners and releases.

---

## Phase 4 — AI assistance (layered after data exists) (6–12 weeks)

**Objective:** Assist humans with **retrieve-and-draft** workloads; retain human confirmation.

| Sprint slice | Capability |
|--------------|-------------|
| **A1** | KB articles + ingestion; embeddings; citations in UI |
| **A2** | Help assistant over KB + bounded release context |
| **A3** | Release / exec summaries from structured facts stored in PostgreSQL |
| **A4** | Validation failure explanation: playbook match + optional LLM explanation |
| **A5** | OCR → draft calendar entries (human review mandatory before commit) |

**Exit criteria:** Every AI-mediated output is **explicitly labeled**, **versioned**, and ties to cited sources or artifact IDs where applicable.

---

## Phase 5 — Approvals, governance polish, Salesforce depth (parallelizable) (6–12 weeks)

| Deliverable | Priority |
|-------------|----------|
| Electronic sign-off (integrate DocuSign/Adobe Sign or internal equivalent) — org-specific | C |
| Escalation ladders for stale approvals | M |
| Salesforce connector depth: environments, deployments metadata correlates | S |
| IDOR/regression harness on cross-tenant/org APIs | M |

---

## Phase 6 — Quarterly readouts & KPI exports (6–10 weeks)

| Deliverable | Priority |
|-------------|----------|
| ETL pulls from Jira, Copado, OpsPilot transactional tables, support ingestion (manual CSV ok first) | M |
| KPI library: deployments, validation failures, lead times, SLA (align definitions early) | M |
| Scheduled reports: weekly operational, monthly rollup | S |
| Export: **Excel/CSV**, **PDF**; **PowerPoint** if required (often last—template-heavy) | S / C |

**Exit criteria:** Leadership can receive a repeatable quarterly narrative with reconcilable metrics.

---

## Phase 7 — Automation Center (“record & replay” maturity) (10–16 weeks)

**Objective:** Highest complexity—defer until core APIs and auditing are hardened.

| Deliverable | Priority |
|-------------|----------|
| Job runner isolation (separate worker, least-privilege connectors) | M |
| Workflow builder MVP: scripted steps referencing approved API actions only | M |
| Approval checkpoints per automation tier | M |
| Safety: sandbox execution, quotas, anomaly detection alerts | M |

---

## Dependencies & parallelism

```
Phase 0 ──► Phase 1 ──┬──► Phase 2 ──┬──► Phase 4 (AI)
                      │              │
                      └──► Phase 3 ──┴──► Phase 5 ──► Phase 6
                                           │
Phase 7 (Automation Center) ◄────────────────┘  (starts after audited APIs stabilize)
```

- **Phase 3** depends on Copado contractual access + rate limits clarified.
- **Phase 4** should start only when **truth data** flows (even partially) into PostgreSQL—otherwise hallucination risk dominates.
- **Phase 7** assumes mature audit + RBAC—the wrong time to automate if humans cannot trace actions today.

---

## MVP definition (narrowest defensible slice)

If you must ship visible value fastest: **Phase 0 + Phase 1** plus **minimal Phase 2** (release checklist object without deep Jira) is a coherent “OpsPilot Calendar & Comms MVP.” Expand into Copado-heavy scope once stakeholders trust notifications and auditing.

---

## Success metrics (tie to brief)

Track from Phase 1 onward (baseline vs after):

| Metric | Target direction |
|--------|-------------------|
| Manual coordination hours per release cycle | Down |
| Missed reminders / escalation MTTA | Down |
| Duplicated Slack/Webex explanations | Down |
| Time to locate approval status | Down |
| Post-incident recurrence for same Copado validation error class | Down (after playbook adoption) |

---

## What to postpone (explicit deferrals)

- Voice assistant, self-healing deploys, automated rollback mandates — **research phases** beyond initial GA.
- Full ServiceNow-parity CMDB — integrate only where required by procurement.

This phasing favors **risk reduction**: identity, calendar discipline, audited communications, Copado observability **before** broad AI autonomy or cross-system automation scripting.
