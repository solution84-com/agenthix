---
created: 2026-04-01
description: Scoping an agent session to a task, created on first run and resumed on every later run for that task.
---

# ADR-0030: Task-Scoped Agent Sessions

**Status:** Accepted

> ⚠️ **Reconciled by [ADR-0036](./adr-0036-context-centric-security.md)** — task-session durability stands and underpins ADR-0036; but the long-lived per-agent container gives way to **session-/task-scoped runtimes** (durable state persists externally and is rehydrated per run).

## Context

Each agent heartbeat fires a new runtime run — a fresh process invocation. Without session continuity, each run starts with a blank context and the agent has no memory of previous work on the same task. This forces either expensive re-discovery (re-reading files, re-running tools) or explicit external state tracking of "where the agent got to."

Claude Code's `--resume <sessionId>` solves this natively: resuming a session restores the full conversation history (tool calls, results, reasoning) from the previous run. The session IS the task's memory.

The question is how to scope sessions — per-agent (one session for all tasks), per-heartbeat (a new session every run), or per-task (one session per task, resumed across heartbeats).

## Decision

> **The decision holds; the heartbeat it names does not.** *(annotated 2026-10-05)* The agent heartbeat
> was removed (adr-0087). A task's session is resumed on every run of that task, however the run
> starts — a person's Run, the project's pulse, a start time or a routine's round.

> **The task's session also serves its thread.** *(annotated 2026-10-17)* A task now has a conversation, its thread
> (adr-0127), and work asked for there is a run of the task in the task's own session, for whoever asked, with that
> person's pinned memory in its home. The session stays the task's, and the thread's record is hq's (adr-0121).

Sessions are scoped **per task**. A task's session is created on first run and resumed on every subsequent run for that task. When the task completes or a new task is assigned, the session is dropped and the next task starts with a clean session.

Concretely:

- On each heartbeat run, look up the stored `sessionId` for the active task.
- If found, pass `--resume <sessionId>` to the Claude runtime.
- After the run, persist the returned `sessionId` back against the task.
- On task completion or new task assignment, clear the stored session.

## Consequences

### Positive
- The agent always resumes a task with full context of prior work — no re-discovery.
- Context growth is bounded to the lifetime of one task, not the entire agent lifespan.
- Task progress is durable across process restarts, crashes, and scheduled heartbeat gaps.
- Claude Code's native auto-compaction handles context window growth within the session.

### Negative
- Session state is external to the process — requires persistent storage keyed by task.
- If the stored session expires or is invalidated, the run must detect this and start fresh.

### Risks
- Stale sessions (e.g. after a server reinstall) must be handled gracefully — detect "no conversation found" and retry with a fresh session, clearing the stored ID.

## References

- [ADR-0019 — Agent Runtime Abstraction](./adr-0019-agent-runtime-abstraction.md) — defines the `AgentRuntime` interface this session model operates within
- [ADR-0020 — Task Delegation](./adr-0020-task-delegation-over-spawn-agent.md) — each delegated task runs in the target agent's own workspace and its own session
