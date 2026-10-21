---
created: 2026-03-25
description: Agent execution as a site concern — HQ's execution unit is the site, which owns its agents.
---

# ADR-0017: Agent Execution is a Site Concern

**Status:** Accepted
**Supersedes:** [ADR-0016 — Sites and Connectors as Separate Provisioned Identities](./adr-0016-sites-and-connectors-as-separate-identities.md)

> ⚠️ **Two things it names are gone; the decision is not.** *(annotated 2026-08-30)*
> Execution is still a site concern — it lives in the `site` module and hq executes nothing.
> But **Firestore** was removed when the platform pivoted to Postgres (adr-0005), and **"Site"**
> here means the archived pre-split platform, not today's Execution Site. The model that
> replaced it — HQ as the org's source of truth, the Execution Site as the execution layer —
> is recorded outside this repository.

## Context

Connectors were introduced as org-level resources responsible for routing agent execution. ADR-0016 modelled them as independently provisioned, org-owned credentials managed in HQ Firestore and synced down to Sites.

This created compounding ambiguity:

- **Ownership**: Who owns the connector — org, user, or team?
- **Scope**: Is a connector scoped to an org, a project, a board, or a Site?
- **Responsibility**: What does HQ manage vs what does the Site manage?

The root cause was mixing two concerns: project coordination (HQ's job) and agent execution (the Site's job). By modelling connectors at the org level, HQ was implicitly taking responsibility for execution topology — which it should not own.

---

## Decision

**Agent execution is a site concern, not an HQ concern.**

From HQ's perspective, the execution unit is the **Site**. Sites own their agents and decide how those agents run — natively (Wasp runtime) or via external protocol (MCP, A2A, or others). HQ does not model or manage execution protocols.

**HQ's responsibilities are:**
- Orgs, users, and memberships
- Sites (registration, status, fleet overview)
- Agent definitions (name, responsibilities, task labels, system prompt)
- Projects, boards, and tasks

**Sites own execution.** A Site decides which agents it runs and how. Whether those agents are internal (Wasp runtime) or external (connected via MCP or A2A) is a Site implementation detail — not an HQ concern.

**Connectors are not org-level resources.** They are a site-level implementation detail. How a Site manages connector credentials, sessions, and protocol specifics is the Site's responsibility. HQ is not involved in connector lifecycle management.

**Personal connectors are out of scope for MVP.** A personal connector (user-owned, human management interface) is a separate future capability, fully decoupled from site execution. It is not modelled in the current platform.

---

## Consequences

- HQ's responsibility is clear: coordinate, not execute.
- Sites are the single unit of execution — fleet management is simpler (one Site = one execution environment).
- No connector ownership ambiguity at the org level.
- HQ does not need to model execution protocols (MCP, A2A, etc.) — Sites choose their own.
- ADR-0016's implementation details (Firestore listener, in-memory cache, credential separation) no longer apply — Sites manage their own connector credentials without HQ lifecycle management.

---

## Alternatives considered

**Keep connectors as org-level resources with tighter scoping rules.**
Rejected — scoping rules (per-org, per-project, per-site) added complexity without resolving the core question of who is responsible for execution. The problem was the level of abstraction, not the scoping granularity.

**Model connectors as user-level resources (original ADR-0013 approach).**
Rejected — already superseded by ADR-0016. User-level credentials do not survive personnel changes and do not reflect org infrastructure.

---

## Related

- [ADR-0016 — Sites and Connectors as Separate Provisioned Identities](./adr-0016-sites-and-connectors-as-separate-identities.md) — superseded by this ADR
- [ADR-0015 — MCP Agent Connections at the Site](./adr-0015-mcp-agent-connections-at-site.md) — SSE endpoint and session mechanics remain valid; connector-as-org-resource framing is superseded
- ADR-0013 — User, Org, Site, Fleet & Identity Model (archived, recorded outside this repository) — §§1–3 and §§5–7 remain valid
- ADR-0007 — HQ & Sites Platform (archived, recorded outside this repository) — platform-level architecture this ADR refines
