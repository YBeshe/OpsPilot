# OpsPilot

**Upstream repository:** [github.com/YBeshe/OpsPilot](https://github.com/YBeshe/OpsPilot)

**OpsPilot** is the working name for the **DevOps & Platform Automation Hub** described in your product brief: a workflow-driven web platform for Salesforce / Copado platform teams—covering release planning, calendars, validations, approvals, communications, knowledge, quarterly readouts, and AI-assisted operations.

This codebase is **integration-ready later**: architecture and phased delivery assume Jira / Copado / Salesforce / Slack or Webex / calendars—the app ships without those connectors until you enable them ([`docs/PHASING.md`](./docs/PHASING.md)).

This repo starts as **Phase 0–oriented scaffolding**: Next.js (App Router) + TypeScript + Tailwind CSS, documented for modular growth.

## Quick start

```bash
git clone https://github.com/YBeshe/OpsPilot.git
cd OpsPilot
npm install
npm run dev
```

Open `http://localhost:3010` (default dev port).

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System boundaries, integrations, AI layer, security, deployment |
| [docs/PHASING.md](./docs/PHASING.md) | Phased roadmap from foundation through enterprise rollout |

## Repository note

The npm package name is `opspilot` (lowercase) because npm disallows uppercase names. The branded product name remains **OpsPilot**.
