---
created: 2026-04-01
description: A shared project workspace on the site filesystem, with a roadmap document carrying planning memory.
---

# ADR-0031: Project Workspaces and Roadmap-Based Planning Memory

**Status:** Accepted

> ⚠️ **Amended by [ADR-0036](./adr-0036-context-centric-security.md)** — project workspaces stand; but the **agent** workspace holds knowledge, not business data, and **data ownership is user/project, not agent** (the agent workspace is working space, never the owner of project or user data).

## Context

ADR-0030 established task-scoped sessions for execution continuity — each task has a persistent Claude session resumed across heartbeats. This solves the re-discovery problem for focused task work.

However, task-scoped sessions alone do not solve the broader planning problem. An agent working on a project needs to reason about the full picture: what's queued, what's blocked, what depends on what, what order makes sense. This reasoning requires project-level context that no single task session carries.

Several approaches were considered:

**Project-scoped persistent sessions** — one long-running session per project accumulates full context. Rejected: a project is ongoing with no natural boundary, so the session and its compaction summary grow indefinitely. Claude's auto-compaction works within a session lifetime but cannot prevent unbounded growth across months of project activity.

**Stateless routing inference call** — a pre-run LLM call reads task state and outputs a dispatch plan. Insufficient on its own: task descriptions and status flags do not carry enough context about dependencies, prior decisions, and project history to make intelligent ordering decisions.

**Document-based memory with ephemeral planning sessions** — planning context is distilled into a shared living document (the roadmap), injected fresh at the start of each heartbeat. The session is ephemeral; the document carries continuity. This bounds context window usage while preserving project-level intelligence across heartbeats and across agents.

The third approach is adopted.

## Decision

### Project Workspaces

> **The decision holds; the path does not.** *(annotated 2026-08-30)* A project still has shared
> storage its member agents work in, but `kernel/projects/{projectId}/` was replaced by adr-0039's
> nested model, where every owner has `files/` and `workspaces/` under its own id.

Each project gets its own shared workspace directory on the Site filesystem, sitting alongside agent workspaces:

```
kernel/
  agents/
    agt_aaa/        ← Agent A's private workspace
    agt_bbb/        ← Agent B's private workspace
  projects/
    proj_xxx/       ← Project X's shared workspace
    proj_yyy/       ← Project Y's shared workspace
```

Any agent with project membership can read and write to the project workspace. It is the shared coordination surface for all agents on that project — the place for shared documents, artifacts, and planning memory.

### The Project Roadmap

> **Still how it works.** *(annotated 2026-08-30)* `ROADMAP.md` is written into the project's files
> directory and remains the document injected at planning time. Only its location moved, with
> adr-0039.
>
> *(annotated 2026-10-05)* There is no heartbeat any more (adr-0087): each task run reads the roadmap
> from its project's files — or, in a personal project, its person's — and updates it.

The project roadmap is a living markdown document at `kernel/projects/{projectId}/ROADMAP.md`. It is the project's shared long-term memory — condensed, always current, and readable by any agent on the project.

The roadmap is structured to remain inject-able (not large) at the start of every heartbeat:

- **Mission / Vision** — the project's core goal and success criteria; rarely changes
- **Current week** — condensed story of this week's work: what's done, what's in progress, what's upcoming, active blockers
- **Previous weeks** — one short paragraph per week summarising what happened, with a link to the full weekly log in `kernel/projects/{projectId}/history/`

Older detail is consolidated by the agent into weekly history documents. The roadmap stays concise; deeper history is referenced, not inlined.

### Two-Phase Heartbeat

> ⚠️ **Superseded by adr-0032 — this section only.** *(annotated 2026-08-30)* Phase 1's toolless,
> sessionless inference call is gone: `generateObject` appears nowhere, and routing is done by a
> persistent routing session in which the agent fetches its own context. Phase 2's task-scoped
> execution stands, and is adr-0030's decision rather than this one's.

Each heartbeat has two phases:

**Phase 1 — Planning (ephemeral)**

Phase 1 is a single LLM inference call — no tools, no session, no side effects. The agent reads the project roadmap and the current task list (including each task's description, status, `deferCount`, and `lastWorkedAt`), then produces a structured plan for this heartbeat:

- **now** — an ordered list of tasks to execute this heartbeat, highest priority first
- **defer** — tasks to skip this heartbeat; re-evaluated next time
- **escalate** — tasks that need human attention: blocked, ambiguous, or perpetually deferred

Tasks not in `now` are not touched during Phase 2. The ordering of `now` is the execution order — Phase 2 works through it sequentially.

**Preventing defer loops:** a task that is repeatedly deferred without progress is a signal that something is wrong, not that the task is low priority. Passing `deferCount` and `lastWorkedAt` as inputs to the planning call gives the LLM the information to detect this and escalate rather than defer indefinitely. `escalate` is the hard exit from a defer loop — an escalated task is flagged for human attention and excluded from future planning until a human intervenes.

**Phase 2 — Execution (task-scoped, persistent)**

For each task in the plan, in order, the agent opens or resumes the task-scoped session for that task (per ADR-0030) and executes the work. Only one task runs at a time per project. The heartbeat is considered active until the last task in the plan completes.

At the end of the heartbeat, the agent updates the roadmap with what was done, any new decisions made, and what is coming next.

### Weekly Consolidation

> ⚠️ *(Annotated 2026-10-07.)* Never built: nothing rolls roadmap weeks into history files, and a new project's Files no longer gets a `history/` folder. The roadmap itself stands.

The agent is responsible for rolling up older roadmap content into weekly history documents. When the current week closes, the agent:

1. Writes a weekly summary to `kernel/projects/{projectId}/history/week-of-YYYY-MM-DD.md`
2. Reduces that week to a single paragraph in the roadmap's Previous Weeks section, linking to the history file
3. Opens a new Current Week section

The agent decides the internal structure of history files — chronological logs, feature-by-feature, or whatever fits the project's nature.

## Consequences

### Positive
- Project-level planning context is available to every agent on the project via a shared workspace — no agent works blind.
- The roadmap bounds context window usage by design: it is always condensed and inject-able, never a full session transcript.
- Planning continuity is document-based and Git-versioned, not session-based — durable across process restarts, server reinstalls, and agent reassignments.
- Multiple agents on the same project share a single source of truth for project state without synchronisation overhead.
- The two-phase heartbeat cleanly separates planning (ephemeral, project-scoped) from execution (persistent, task-scoped).

### Negative
- The agent is responsible for maintaining the roadmap's quality and conciseness. A poorly-maintained roadmap degrades planning quality on subsequent heartbeats.
- Weekly consolidation adds agent work at the end of each week. If consolidation is skipped (e.g. agent crash or timeout), the roadmap remains valid — it just grows longer until the next successful rollup.
- Project workspace access control must be enforced at the filesystem level — an agent without project membership must not be able to read or write to the project workspace.

### Risks
- If the roadmap becomes stale (e.g. the agent crashed before updating it), the next heartbeat works from outdated context. Mitigation: the agent should treat the roadmap as advisory and cross-reference with live task state from Firestore.
- Concurrent roadmap writes (two agents finishing heartbeats simultaneously) could cause conflicts. Mitigation: last-write-wins is acceptable given the roadmap is a summary document, not a transactional record. Git history provides a recovery path.

## References

- [ADR-0030 — Task-Scoped Agent Sessions](./adr-0030-task-scoped-agent-sessions.md) — execution session model this ADR complements
- [ADR-0025 — Agent Identity as First-Class Org Member](./adr-0025-agent-identity-as-first-class-org-member.md) — agent workspace model this extends with project workspaces
