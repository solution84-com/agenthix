---
created: 2026-03-28
description: Scoping agent identity to the org, with workspace context per project.
---

# ADR-0023: Org-Scoped Agent Identity with Per-Project Workspaces

**Status:** Superseded by adr-0024
**Deciders:** the maintainers
**Supersedes:** [ADR-0021](./adr-0021-agent-project-binding.md)

## Context

[ADR-0021](./adr-0021-agent-project-binding.md) bound agents to a single project for security — a compromised agent couldn't spread across projects. With the HQ Agent Management feature, agents are now org-level resources created by org members. Binding agents to one project forces duplicate definitions per project, conflicting with the HQ fleet model.

The key insight: **the security boundary is the workspace directory, not the agent identity**. Giving each project its own isolated workspace directory preserves blast-radius containment regardless of the agent's org-level identity. This mirrors how humans work — one identity, separate repo clones per project.

---

## Decision

**Agent identity is org-scoped. Workspace context is per-project.**

HQ-managed agents (`hqAgentId IS NOT NULL`) are created at the org level and can be assigned to tasks across any project. Each project gets its own isolated workspace:

```
$AGENTHESIS_DEPLOY_ROOT/kernel/workspaces/<hqAgentId>/<projectId>/
```

`workspaceDir` is derived at **task dispatch time** (not agent sync time) since `projectId` is only known when a task arrives.

Cross-project knowledge accumulation is intentional — an agent's memory and context within `<hqAgentId>/<projectId>/` is isolated per project, but capabilities and system prompt are shared, allowing an agent to grow more effective over time.

Local agents (`hqAgentId IS NULL`) are unaffected.

---

## Consequences

### Positive
- Agent definitions are reusable across projects — no duplicate configuration
- Per-project workspace still contains blast radius to a single project
- Agents accumulate project-specific context over time

### Negative
- `workspaceDir` requires both `hqAgentId` and `projectId` — only derivable at dispatch time
- Workspace directories are created lazily on first task; not pre-inspectable by site admin

### Risks
- The `PreToolUse` path-prefix hook must be updated to enforce `<hqAgentId>/<projectId>/` rather than the flat agent path (per ADR-0021's interim mitigation).

---

## Alternatives Considered

**Keep one agent, one project** — rejected. Conflicts with HQ fleet model; forces duplicate agent definitions per project.

**Shared workspace across projects** — rejected. Agent reading/writing Project A files during a Project B task is a genuine data leak.

---

## References

- [ADR-0021](./adr-0021-agent-project-binding.md) — superseded by this record
- [ADR-0004](./adr-0004-workspace-centric-agent-architecture.md) — workspace-centric architecture
- The HQ agent-management design of 2026-03-27. **No longer in the repository** — the committed spec pipeline it belonged to was retired; see `../../work/` for how design specs are filed now. *(link corrected 2026-08-21)*
