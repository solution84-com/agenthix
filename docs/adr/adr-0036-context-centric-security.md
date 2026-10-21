---
created: 2026-06-23
description: Moving security from agent-centric to context-centric, with the run context as the permission boundary.
---

# Context-Centric Security: Run Context as the Permission Boundary

**Status:** Accepted

## Context

Agenthix treats agents as first-class org members (ADR-0025), each with its own workspace, running in a **long-lived per-agent container** with project/product directories bind-mounted by the *agent's* memberships (`AgentContainerManager`). Permissions have, in effect, been a property of the **agent**: "Agent X is a member of Project A, so it can read Project A."

Designing the Project Files surface (roadmap Phase 10) exposed a security hole in this model — the **confused-deputy problem**:

- Agents are **shared**. Multiple users can talk to the same agent (ADR-0025 makes them org-level members, not per-user).
- If an agent holds **standing** access to a resource that a given requester does *not* (another user's personal data; a project that user isn't in), then that user can drive the agent to reach it. The user borrows the agent's authority.

Concrete: a Therapist Agent stores case notes for Avery in its own workspace. Another user talks to the same agent. There is now no ownership boundary protecting Avery's notes — anything in the agent's workspace is reachable by anyone who can invoke the agent.

The root cause is that three concerns were conflated:

1. **Agent identity** — who the actor is.
2. **Data ownership** — whose data this is.
3. **Runtime execution** — where/how work runs and what it may touch.

When all three live on the agent, the agent accumulates standing authority over data it shouldn't own, and that authority leaks to every caller.

## Decision

Separate the three concerns. Move security from **agent-centric** to **context-centric**.

### 1. Data ownership is separated from the agent

> ⚠️ **The decision stands; adr-0048 changed the mechanism.** *(annotated 2026-08-19, reworded 2026-08-30)* The security property is unchanged — an agent does not own business or user data. What an agent learns about a person is no longer routed into that person's own workspace — it is held in a per-person partition of the agent's own storage, mounted into a run only when that person is the invoker. The boundary is a container mount rather than a choice of destination workspace.

- **User workspace** — owned by the user. Personal files, private notes, user-specific memory, sensitive records, personal agent interactions. (A Therapist Agent's notes for Avery live here.)
- **Project workspace** — owned by the project (ADR-0031). Source, documents, roadmaps, specs, shared knowledge. Project artifacts belong to the project regardless of which agent produced them.
- **Agent workspace** — owned by the agent, but holds **knowledge about how to do work, not business data**: skills, templates, reusable workflows, generalized learnings, agent preferences, internal planning artifacts.
  - Allowed: *"Users often prefer summaries before detail."*
  - Not allowed: *"Avery prefers summaries for Agenthix architecture."* (→ belongs to the user.)

**Agents do not own business or user data.** The agent workspace is working/sandbox space, never the authoritative owner of project or user data.

### 2. Permissions come from the execution context, not agent identity

The agent itself holds very few standing permissions. Authority is granted **per run**, from the context that initiated it, and is bounded by what the **initiating principal** may reach. The same agent identity runs with different permissions every time:

| Run type | Scope granted |
|---|---|
| User chat | the initiating **user's** scope + permissions (+ optional active project) |
| Project task | that **project's** scope + permissions |
| Scheduled job / heartbeat | project scope + job-specific permissions; **never** any user's personal scope |

This closes every confused-deputy variant: a user driving an agent can never exceed that user's own access, because the run is scoped to the **initiator**, not to the agent's memberships.

**Delegation chain.** When a run spawns child runs (the subagent framework, Phase 11), each child's permissions are a **subset** of its parent's, which are a subset of the initiator's — delegation can only ever *narrow* access, never widen it. This keeps a child runtime from becoming the next confused deputy.

**Autonomous principal.** A run with no human initiator (heartbeat, scheduled job, task pickup) acts as a scoped **service principal** bound to the project/job — explicitly *not* any user. It never inherits a user's personal scope, even for a task a user created.

**Permission baseline.** "What the initiator may reach" is **membership-based** today (user ↔ project membership; user ↔ their own personal space). Richer per-resource RBAC arrives with the Security & Access phase (roadmap Phase 14); this ADR depends on that model but does not define it.

### 3. Runtime context is the permission boundary; the container is the execution-isolation boundary

For each execution, Agenthix determines: who initiated it, which user is active, which project is active, which files are needed, which tools are allowed, which permissions are granted — then launches the runtime accordingly.

- The **container** remains an **execution-isolation** boundary (sandboxing what code can do). It is **not** the *permission* boundary — being mounted somewhere no longer implies authority to use it.
- The **run context** is the **permission** boundary.

### 4. Runtimes are session-/task-scoped, not agent-lifetime

> ⚠️ **Superseded by adr-0049 — this section only.** Never implemented. On examination the framing did not
> survive contact with the cases: a run's mount set produces three shapes rather than two,
> a person may select several workspaces at once, and a context has no lifecycle, so
> nothing owns teardown. adr-0049 keeps the intent and changes the unit to a session.
> *(annotated 2026-08-19)*


A single agent **identity** maps to **many runtimes** (Avery's chat runtime, another user's chat runtime, a project-task runtime, a scheduled-job runtime). Containers exist to execute work; they are not trusted with permanent access.

- **Chat** — a runtime is created for the session, torn down on idle; durable state persists externally and is rehydrated on return.
- **Task / scheduled** — create runtime → execute → destroy.
- **Context switch** ("move from Project 1 to Project 2") is a **security context change** — end the current execution context, validate access to Project 2, start a fresh scoped runtime. The UI conversation continues seamlessly; permissions reset underneath. The "active project" is a property of the **run**, derived per execution — *not* a persistent anchor the user sets on the conversation (consistent with the operations-first context model: the chat stays global; each run carries the scope).

This is feasible because durable state already lives **outside** the container: transcripts in the DB, workspaces on the host filesystem, task sessions persisted (ADR-0030). The container is already near-stateless compute.

### 5. Memory writes are scope-classified

> ⚠️ **Superseded by adr-0048 — this section only.** Never implemented. Classification is a judgement made at write time by the same model that has been reading untrusted input, its failures are silent, and a wrong write is readable by everyone thereafter. adr-0048 keeps the goal and removes the judgement: a conversation write has exactly one place it can land, decided by which directory was mounted before the model ran. **There is no scope classifier, and none is planned.**

Before a memory is saved, its scope is determined — **general / user-specific / project-specific / sensitive** — and it is written to the matching workspace. This prevents privacy leakage through agent memory, and reshapes the roadmap "Agent memory" work: memory is no longer a single per-agent store injected each session.

## Consequences

### Positive
- The confused-deputy problem is closed by construction — no standing agent authority for a caller to borrow.
- Clear ownership: user data with users, project data with projects, agents hold only know-how.
- Shared agents become safe to use across many users and projects.
- One identity → many runtimes composes directly with the Phase 11 subagent framework (children are scoped runtimes under an identity), and the delegation-chain rule keeps that composition safe.
- Composes with the operations-first context model: the conversation stays global/ambient; each *run* carries the scoped security context — no conversation anchoring required.
- Concurrency is treated as normal (shared workspaces, like GitHub/Docs/Jira); the security boundary, not concurrency, is the real concern.

### Negative
- Supersedes the "one long-lived container per agent" design (`AgentContainerManager`); runtime lifecycle becomes per-session/per-run orchestration.
- Adds a per-run context-resolution + permission-granting step to every execution.
- Memory acquires a classification step on every write.
- Write coordination across shared workspaces needs a locking subsystem.

### Risks
- **Runtime cold-start latency** for ambient chat if every turn spins a container. Mitigation under evaluation: do **not** containerize pure conversational turns — spin a runtime only when the agent must touch files or execute; warm pools as fallback.
- **Memory mis-classification leaks.** Mitigation: conservative default — when uncertain, the most-restrictive scope (user/sensitive) — plus rule-based guards, not model judgment alone.
- **Reaping in-flight work.** Idle-destroy must apply to idle/chat runtimes only, never a running task ("destroy on idle *or* completion," never "destroy a running task").

## Open Questions
- **Runtime cost model** — exactly when a turn needs a container vs. runs container-less; warm-pool strategy; cold-start budget. Load-bearing; resolve before the runtime overhaul ships.
- **Locking design** — soft / write / project locks; lease + timeout + crash-expiry. Follow-on, with Phase 11 parallel execution.
- ~~**Memory classifier design**~~ — closed by [adr-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md), which removes the classifier rather than designing one.
- **Per-run secret injection** — how scoped secrets reach a runtime without leaking into logs/transcripts (ties to the Phase 8 secret primitive, BL-006, Phase 14).

## References
- [ADR-0025 — Agent Identity as First-Class Org Member](./adr-0025-agent-identity-as-first-class-org-member.md) — this record replaced part of it: the agent workspace holds knowledge, not business data, and agents do not own user or project data.
- [ADR-0030 — Task-Scoped Agent Sessions](./adr-0030-task-scoped-agent-sessions.md) — durable session state that makes ephemeral runtimes feasible; runtime lifecycle to be reconciled.
- [ADR-0031 — Project Workspaces and Roadmap-Based Planning Memory](./adr-0031-project-workspaces-and-roadmap-memory.md) — project workspace ownership; the agent-vs-project workspace boundary is refined here.
- [ADR-0017 — Agent Execution as a Site Concern](./adr-0017-agent-execution-as-site-concern.md), [ADR-0019 — Agent Runtime Abstraction](./adr-0019-agent-runtime-abstraction.md) — the execution layer this decision reshapes.
- Roadmap: implemented (core) by **Phase 9 — Context-Centric Security Foundation**; reshapes **Phase 11 — Agent Autonomy** (agent memory → scope-classified; subagent delegation chain); the full session-scoped-runtime overhaul + multi-user RBAC lands in **Phase 14 — Security & Access Control**; touches **Phase 8** (preview runtime, secret primitive) and **Phase 10 — Project Files** (the surface that surfaced this).
