---
created: 2026-03-28
description: Scoping primary agent identity to a board — one primary agent per board, one board per primary agent.
---

# ADR-0024: Board-Scoped Primary Agent Identity

**Status:** Superseded by adr-0025
**Deciders:** the maintainers
**Supersedes:** [ADR-0023](./adr-0023-org-scoped-agent-identity.md)

## Context

[ADR-0023](./adr-0023-org-scoped-agent-identity.md) established org-scoped agent identity where one agent could be assigned to tasks across multiple projects, with a per-project workspace subdirectory (`workspaces/<hqAgentId>/<projectId>/`) to contain blast radius.

The board lifecycle design introduces a tighter constraint: **a board has exactly one primary agent, and a board belongs to exactly one project.** The primary agent's entire identity, role, responsibilities, and sub-agent definitions are defined in the context of that board. An agent that could roam across projects has no natural home and conflicts with the board-as-session model.

Additionally, sub-agents are no longer standalone org-level resources — they are defined inline within the primary agent doc (tightly coupled). This eliminates the scenario where an org-level agent is reused across multiple projects.

---

## Decision

**Primary agent identity is board-scoped. One primary agent per board. One board per primary agent.**

Agents are stored as a top-level Firestore collection (`orgs/{orgId}/agents/{hqAgentId}`) to support org-wide views and site sync queries, but the `boardId` field enforces the one-to-one board binding at the application level.

The workspace path simplifies to:

```
$AGENTHIX_DEPLOY_ROOT/kernel/workspaces/<hqAgentId>/
```

No `/<projectId>/` subdirectory is needed — the board binding already implies the project. The workspace is the agent's permanent home for that board's work.

Sub-agents are defined inline within `AgentDoc.subAgents[]`. They have no independent identity outside the primary agent and run inline within the primary agent's `AgentEngine` session (not via `HqTaskListener`).

Local agents (`hqAgentId IS NULL`) are unaffected.

---

## Consequences

### Positive
- Workspace path is simpler — no `projectId` needed at dispatch time
- Agent identity, role, and sub-agent definitions are always coherent with a single board context
- Sub-agent definitions are co-located with the primary agent — no orphaned sub-agents
- Org-level agent view and site sync remain simple flat queries against `orgs/{orgId}/agents/`

### Negative
- An agent cannot be reused across multiple boards — new board requires new agent definition
- If a user wants a similar agent on two boards, they must define it twice

### Risks
- The `PreToolUse` path-prefix hook must be updated to enforce the flat `<hqAgentId>/` path (removing the `/<projectId>/` segment from ADR-0023).

---

## Alternatives Considered

**Keep org-scoped agents (ADR-0023)** — rejected. Conflicts with board-as-session model. An agent assigned to multiple projects has no coherent identity or primary board.

**Sub-agents as standalone top-level agents** — rejected. Sub-agents are tightly coupled to the primary agent's role and context. Standalone identity introduces orphan risk and unnecessary complexity.

---

## References

- [ADR-0023](./adr-0023-org-scoped-agent-identity.md) — superseded by this record
- [ADR-0021](./adr-0021-agent-project-binding.md) — original agent-project binding (archived)
- [ADR-0004](./adr-0004-workspace-centric-agent-architecture.md) — workspace-centric architecture
- [board.md](../concepts/tasks/board.md) — the board concept; the board-and-agent data model this record referenced moved here when `docs/domains/` was retired. *(link corrected 2026-08-21)*
