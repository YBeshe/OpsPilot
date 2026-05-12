# OpsPilot — System Architecture

This document aligns the DevOps & Platform Automation Hub product brief with a **modular, API-first, AI-augmented** architecture suitable for enterprise DevOps organizations (Salesforce, Copado, Jira, Slack/Webex, calendars).

---

## 1. Goals

- Reduce repetitive manual work and standardize release operations.
- Centralize planning, calendars, validations, approvals, and communications.
- Provide executive and operational dashboards with audit-friendly history.
- Integrate deeply with toolchain systems via a **bounded, replaceable connector layer**.
- Use AI **as an assistant**: summarization, draft generation, retrieval over internal knowledge—not as an authorization or deployment execution authority.

---

## 2. Architectural principles

| Principle | Application |
|-----------|--------------|
| **API-first** | UI and integrations consume versioned REST (GraphQL optional later for aggregations). |
| **Bounded contexts** | Separate deployable boundaries or strictly separated modules (see §4). |
| **Deny-by-default authz** | RBAC (+ optional ABAC attributes such as tenant, org, pipeline) enforced at API and job boundaries. |
| **Integration isolation** | All third-party APIs behind connectors with rate limits, retries, circuit breakers, and webhook verification. |
| **Auditability** | Immutable append-preferred audit log for approvals, integrations, automation runs, and AI-assisted actions (human confirmation events). |
| **Secrets hygiene** | No credentials in source; KMS/vault-backed secrets per environment (see §8). |

---

## 3. High-level logical architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Presentation              │
                    │  Next.js App Router • RBAC-aware UI        │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
                    │           Application / API Gateway        │
                    │  AuthN • AuthZ • Rate limits • Correlation │
                    └───┬─────────────┬─────────────┬───────────┘
                        │             │             │
           ┌────────────▼──┐  ┌───────▼──────┐ ┌────▼────────────┐
           │ Core Domain   │  │ Workflow /   │  │ AI Gateway      │
           │ Services      │  │ Job Runner   │  │ RAG • LLM APIs  │
           │ Releases etc. │  │ Notifications│  │ OCR pipeline    │
           └───────┬───────┘  └───────┬──────┘ └────┬────────────┘
                   │                   │             │
                   └─────────┬─────────┴──────┬────┘
                             ▼                ▼
                    ┌────────────────┐ ┌──────────────────┐
                    │ PostgreSQL     │ │ Object storage   │
                    │ + Redis Queue  │ │ (artifacts/OCR)  │
                    └────────────────┘ └──────────────────┘
                             │
                    ┌────────▼─────────────────────────────┐
                    │ Integration connectors (Outbound) │
                    │ Salesforce • Copado • Jira •        │
                    │ Slack • Webex • Google/Outlook •…   │
                    └────────────────────────────────────┘
```

**Suggested physical mapping (initial)**

- Single **OpsPilot Web + API** process (Next.js Route Handlers or a co-located BFF) for simplicity; extract **worker** processes when job volume grows.
- **PostgreSQL**: system of record (releases, calendars, approvals, audits, integrations state).
- **Redis** (or cloud queue): reminders, OCR jobs, webhook processing, SLA scans.
- **Object storage**: uploaded schedule images/PDFs, exported reports.

---

## 4. Bounded contexts (modules)

Each context owns its schema/tables and exposes APIs/events to others. Ownership reduces coupling and mirrors product areas from the brief.

| Context | Responsibility | Key entities (illustrative) |
|---------|----------------|-----------------------------|
| **Identity & Access** | SSO, RBAC, org/project scoping | User, Role, Tenant, SSO mapping |
| **Release Planning** | Plans, templates, ownership, dependency | Release, Milestone, Task, Checklist, Risk flag |
| **Calendar & Scheduling** | Events, recurrence, conflicts, ICS sync | CalendarEvent, Series, Participant, Conflict |
| **Communication** | Templates, variables, deliveries | Template, Broadcast, ScheduledMessage |
| **Validation & Deploy** | Validation runs, parsing, retries, readiness | ValidationRun, ErrorFinding, PromotionRef |
| **Approvals & Governance** | Sign-off, escalation, artifact binding | ApprovalRequest, ApprovalStep, Signature |
| **Support & KB** | Articles, embeddings, assistant sessions | Article, EmbeddingChunk, Conversation |
| **Metrics & Reporting** | KPI ingestion, snapshots, exports | MetricSnapshot, ReportDefinition |
| **Automation Center** | Recorded flows, scripted steps, checkpoints | WorkflowDefinition, Run, Checkpoint |

Cross-context rules: invoke via **published APIs or domain events** (e.g., “ReleaseApproved” triggers Communication and Validation scheduling)—avoid direct DB coupling across contexts.

---

## 5. Integration framework

### 5.1 Connector pattern

- **Inbound**: Signed webhooks (Jira/Copilot vendor patterns, Slack/Webex)—verify signatures; idempotency keys.
- **Outbound**: Service classes per provider with centralized **credential rotation**, scoped OAuth tokens, and **allow-listed base URLs** (SSRF mitigation for any URL-like config).
- **Sync model**: Prefer **explicit sync windows + cursor-based polling** plus webhooks where reliable; persist sync state (`lastSyncedAt`, `cursor`, errors).

### 5.2 Required integrations (product brief)

| System | Typical use cases |
|--------|-------------------|
| **Salesforce** | Org metadata context, deployments reference, environments |
| **Copado** | Pipelines, promotions, validations, user stories/packages |
| **Jira** | Issues, boards, sprint metrics, comments/status |
| **Slack / Webex** | Notifications, reminders, optional bot/command channel |
| **Google Calendar / Outlook** | Event sync, recurrence, reminders |

Implement each as **`Connector` interface**: `authenticate`, `healthCheck`, typed `fetch*` methods, webhook handlers. Feature flags gate partial rollouts.

---

## 6. AI layer

### 6.1 Capabilities mapped to brief

| Brief capability | Architectural approach |
|------------------|------------------------|
| Release summaries / exec summaries | Structured prompts + grounding from DB facts; output stored versioned |
| Missing tasks / sequencing suggestions | Read-only advisors; suggestions require explicit user acceptance |
| Validation error analysis | Log parser → normalized findings → LLM rationale + playbook links |
| Help channel assistant | Retrieval-augmented generation over KB vectors + citations |
| OCR calendar upload | OCR (e.g., Tesseract or cloud OCR) → LLM/date extraction → draft events → human review |
| Quarterly readouts | ETL KPI facts → templated narrative + charts export |

### 6.2 Safety and governance

- **No autonomous production changes** without human approval checkpoints.
- Redact/segregate prompts: **tenant isolation** for vector indexes; configurable **data classification** blocking PII/secrets from model calls.
- Log **intent** and **artifact IDs**, not raw secrets; salted hashes where needed for correlation.

### 6.3 Components

- **AI Gateway**: quotas, routing (model selection), tracing, refusal policies.
- **Vector store**: pgvector / managed vector DB mirroring Articles and resolved incidents with ACL filters at query time.
- **Prompt templates**: versioned templates with variable schema validation (reject unknown JSON fields).

---

## 7. Dashboards & real-time UX

| Dashboard | Signals |
|-----------|---------|
| **Executive** | Release success rates, SLA, risk rollup, throughput |
| **DevOps** | Active validations, failed deploys, pending approvals, upcoming releases |
| **Support** | Open issues, SLA, FAQ resolution rate, KB coverage |

Implementation path: REST + polling initially; graduate to **SSE/WebSocket** for live validation/deploy status once core APIs stabilize.

Enterprise UX: responsive layout; dark/light themes; configurable widget layout (defer full “customer-composable dashboards” until data model proves stable).

---

## 8. Security & compliance (baseline)

| Control | Requirement |
|---------|---------------|
| **Transport** | TLS everywhere; HSTS where OpsPilot terminates TLS |
| **AuthN** | Enterprise SSO (SAML/OIDC); optional MFA policy via IdP |
| **AuthZ** | RBAC; resource-scoped queries (prevent IDOR) |
| **Audit** | Approvals, config changes, integration calls, automation runs |
| **Encryption at rest** | DB TDE/KMS; object storage SSE |
| **API auth** | Service accounts + scoped tokens for automation; webhook secrets rotated |
| **Headers** | Baseline CSP, `no-store` where appropriate on sensitive endpoints |

Operational guidance: centralized structured logging with **secret redaction**; separate admin actions from standard user endpoints.

---

## 9. Suggested repo / runtime layout (this project)

Aligned with **Next.js App Router**:

- `app/` — Routes, layouts, server components calling domain services.
- `lib/domain/` — Pure business logic (framework-agnostic where possible).
- `lib/connectors/` — Salesforce, Copado, Jira, Slack/Webex, calendar providers.
- `lib/workers/` or separate `workers/` package — Queue consumers (future extraction).
- `docs/` — Architecture and phasing (this file).

As load grows: split **frontend** vs **backend API** or introduce dedicated worker Helm charts—the domain boundaries above should survive that split.

---

## 10. Deployment & operations

- **Container-first**: Dockerfile multi-stage build; non-root user; read-only root where practical.
- **CI/CD**: Lint, test, SCA gates; immutable image tags per release.
- **Observability**: OpenTelemetry-compatible traces from API → connectors → queues.
- **Environments**: dev / staging / prod with **credential and IdP issuer separation**.

---

## 11. Relationship to sibling work

The parent **AgentAI** repository already prototypes related capabilities (releases, Salesforce/Copado touchpoints, OCR-style flows). OpsPilot starts **clean** to apply the clearer modular boundaries above; selectively **port proven modules** behind the connector/domain patterns described here rather than duplicating prematurely.
