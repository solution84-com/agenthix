---
created: 2026-04-04
description: A persistent routing session replacing routing inference, converging agent execution on one path.
---

# ADR-0032: Agent Execution Flow Convergence

**Status:** Accepted

## Context

The current execution flow has three problems:

1. **Routing inference is a separate LLM call.** `AgentHeartbeat` runs `generateObject()` before any agent session starts — a dedicated round-trip to classify tasks as now/defer/escalate. This means the agent has no agency over what it works on; the system decides for it.

2. **Heartbeat and manual runs are divergent paths.** Although both ultimately call `TaskRunner.runTask()`, the heartbeat adds its own routing logic, session scoping, and state management on top — duplicating concerns already owned by TaskRunner.

3. **Execution state is partially agent-owned.** Agents call `update_task_state` themselves, meaning execution lifecycle is split between the agent and the system. This makes it hard to enforce guarantees (e.g. a task always reaches DONE or FAILED after a run).

## Decision

### Agent as router

> ⚠️ **Superseded by adr-0087 — this section only.** No agent run routes work: a boundary's pulse chooses and
> starts queued tasks in hq code. *All task runs converge at TaskRunner* and the sections after it stand.

Replace routing inference (`generateObject`) with a **routing session** — a persistent, agent-scoped session where the agent fetches its own task queue (`fetch_my_tasks`), picks the highest priority task, and calls `run_task(taskId)` to trigger execution. The agent IS the router.

### All task runs converge at TaskRunner

`run_task(taskId)` is a blocking MCP tool call that bridges any agent session (heartbeat or chat) into `TaskRunner.runTask()`. TaskRunner handles the full execution lifecycle — claiming the task, assembling the system prompt, running the task session, and setting the final state. Manual runs call `TaskRunner.runTask()` directly. All paths converge at the same implementation.

### Chat agent has task agency

The chat agent also has access to `run_task(taskId)`. It can choose to start a task mid-conversation without waiting for a manual trigger or heartbeat cycle.

### TaskRunner owns execution state universally

`update_task_state` is removed from agent allowed tools in all contexts. TaskRunner sets `RUNNING` on claim, `DONE` on success, and `FAILED` on error or timeout. Agents signal outcomes via `add_comment` and board stage moves only.

### Heartbeat session is agent-scoped and persistent

> ⚠️ **Superseded by adr-0087 — this section only.** There is no heartbeat session; an agent has no run of its own.

The heartbeat session persists across cycles via `sdkSessionId` resume (same mechanism as task sessions, ADR-0030). The agent accumulates context across routing decisions, giving it continuity as an autonomous team member.

## Consequences

### Positive

- Routing inference eliminated — one fewer LLM call per heartbeat cycle.
- All task execution goes through a single path (TaskRunner), removing duplicated logic.
- Agents can be proactive — chat agent can start tasks; heartbeat agent can pick up unassigned work beyond its queue.
- Execution state is fully system-owned — no split responsibility.
- Heartbeat agent gains continuity across cycles.

### Negative

- `run_task` MCP tool is a new blocking primitive — the heartbeat session blocks on each task run. Long tasks will hold the heartbeat session open for extended periods.
- Heartbeat session context grows with each cycle (routing decisions, task results). Auto-compaction mitigates this but does not eliminate it.

### Risks

- The `run_task` tool must handle the case where TaskRunner claims the task but the task session fails before reaching a terminal state — TaskRunner's error path must be robust.
- Chat-triggered `run_task` calls run concurrently with the chat session. The system must handle the case gracefully if the user sends another message while a task is running.

## References

- [ADR-0030 — Task-Scoped Agent Sessions](./adr-0030-task-scoped-agent-sessions.md) — session resume mechanism used by both heartbeat and task sessions
- [agent-execution-flow.md](../concepts/agents/agent-execution-flow.md) — updated flow diagram reflecting this decision
- [agent-prompt.md](../concepts/agents/agent-prompt.md) — prompt design for each execution context
