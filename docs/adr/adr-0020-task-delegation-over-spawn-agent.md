---
created: 2026-03-26
description: Task delegation through HQ as the multi-agent mechanism, with sub-agent spawning removed and deferred.
---

# ADR-0020: Multi-Agent Orchestration — Task Delegation First, Sub-Agents Deferred

**Status:** Accepted

> ⚠️ **The routing mechanism it names is gone; the decision is not.** *(annotated 2026-08-30)*
> Task delegation over sub-agent spawning is still the model, and `create_task` is still an
> MCP tool. What has changed is what routes the task: the **Firestore real-time listener**
> named in the Decision was removed with the pivot to Postgres (adr-0005), and a delegated
> task now reaches its agent over the hq↔site control channel (adr-0050).

## Context

Two distinct multi-agent collaboration patterns exist in Agenthix:

**Pattern 1 — Sub-agents (single instance, shared workspace)**
An agent, during execution, spawns one or more sub-agents that work within the same workspace directory. Tightly coupled. Shared filesystem. No HQ coordination required. Useful when multiple agents collaborate on the same codebase in a single run.

**Pattern 2 — Task delegation (distributed, separate workspaces)**
An agent creates a new Task in HQ, assigns it to another agent, and that agent executes it in its own isolated workspace. Loose coupling. Each agent's workspace is a separate environment. HQ coordinates. Git sync required if agents need to share artefacts.

The Site currently has a `spawn_agent` tool in `toolRegistry.ts` and `AgentEngine.spawnSubTask` — an early attempt at Pattern 1. This implementation has two problems:

1. **Runtime coupling** — it is injected into the Vercel AI SDK's tool registry and has no equivalent in `ClaudeSDKRuntime`. Supporting it across both runtimes requires duplicating the mechanism.
2. **Incomplete workspace model** — it creates child `AgentRun` records but does not correctly isolate sub-agent execution into a shared workspace context. The model is half-formed.

## Decision

Remove the current `spawn_agent` / `spawnSubTask` implementation. It is not production-ready and cannot be cleanly extended to `ClaudeSDKRuntime`.

**For this release:** implement Pattern 2 only — task delegation via HQ. An agent that needs to delegate creates a Task in HQ via a `create_task` MCP tool call. The Firestore real-time listener routes it to the target agent immediately. Each delegated task runs in the target agent's own workspace. This is the right model for distributed, cross-concern collaboration (e.g. implementer → reviewer, backend → devops).

**Pattern 1 (sub-agents within a shared workspace)** is deferred as future work. It requires a cleaner design — shared workspace context, runtime-agnostic spawning, and visibility in HQ at the appropriate granularity.

## Consequences

- `spawn_agent` and `spawnSubTask` are removed from the codebase.
- Task delegation is the only supported multi-agent pattern in this release.
- Each delegated task is a visible HQ Task with its own status, assigned agent, and audit trail.
- Sub-agent collaboration within a single workspace is a known gap — documented as backlog.
- Future sub-agent implementation must work across both `NativeRuntime` and `ClaudeSDKRuntime` and must correctly model shared workspace execution.

## Alternatives Considered

**Keep `spawn_agent` for `NativeRuntime`, add MCP bridge for `ClaudeSDKRuntime`.**
Rejected — two mechanisms for the same concept, both with the workspace isolation problem unsolved.

**Implement sub-agents now using `ClaudeSDKRuntime`'s native `options.agents`.**
Rejected — SDK subagents are not HQ agent identities. They bypass the agent workspace model, system prompt configuration, and all HQ task tracking.

**Defer task delegation and only implement sub-agents.**
Rejected — task delegation is the simpler pattern to ship first and covers the distributed collaboration use case. Sub-agents require deeper workspace design work.

## References

- [ADR-0017 — Agent Execution is a Site Concern](./adr-0017-agent-execution-as-site-concern.md)
- [ADR-0019 — Agent Runtime Abstraction](./adr-0019-agent-runtime-abstraction.md)

> **Acted on.** *(annotated 2026-10-17)* By the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md): a conversation's work for
> another agent is a task (`create_task`, `run_task`), and fan-out inside a boundary is left to the harness's own
> subagents within a worker's run, metered as that run's work steps. That unit built no sub-agent mechanism of the
> platform's own; Pattern 1 is not built yet, and remains planned.
