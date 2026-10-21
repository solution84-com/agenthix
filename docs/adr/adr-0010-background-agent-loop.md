---
created: 2026-04-27
description: Moving the agent runtime onto pg-boss background jobs.
---

# Background Agent Loop

**Status:** Superseded by adr-0009

adr-0009 was written **after** this record despite its lower number. The early numbers are not chronological; adr-0009's own Context names this record as the *previous attempt* it replaces.

## Context
In Phase 1, the `agenthesis_site` established a foundation based on the OpenClaw monorepo's concepts. OpenClaw relies on an in-process, synchronous agent execution loop running on long-lived node processes.

As `agenthesis_site` aims to scale and safely isolate agent executions (especially when executing arbitrary tool calls or long-running inference loops that wait for third-party LLM providers), running the agent loop synchronously inside the main web server process presents significant risks:
1. **Memory out-of-bounds:** Rogue AI outputs or infinite reasoning loops can crash the main server.
2. **Timeouts:** HTTP connections will time out if an agent takes longer than 30s-60s to finish a complex chain of thought.
3. **Concurrency:** Node's single-threaded nature means heavy synchronous parsing can block the event loop for all users.

## Decision
We will transition the Agent Runtime to an asynchronous, background job-based architecture using Wasp's integrated `pg-boss` job executor.

1. **Triggering:** The dashboard client will hit a standard Wasp Action (`triggerAgentRun`), which does minimal validation, creates an `AgentRun` tracking record in the PostgreSQL database, and enqueues a `pg-boss` job. An immediate HTTP 200 response is returned with the Run ID.
2. **Execution:** The `agentLoopJob` worker picks up the job in the background, resolves context, and handles the long-running LLM generation and tool execution loop.
3. **State Management:** The background job updates the `AgentRun` model with states (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`).

## Consequences

**Positive:**
- **Reliability:** The main web server is protected from agent loop crashes or memory leaks.
- **Scalability:** Background workers can be scaled horizontally independent of the web tier.
- **Resilience:** `pg-boss` allows for retry mechanics on transient LLM API failures.
- **Security:** Better isolation of arbitrary execution logic.

**Negative:**
- **Complexity:** Requires a mechanism to push updates back to the client, as the initial HTTP request no longer holds the connection. This necessitates the introduction of WebSockets (see ADR-0002).
- **Latency:** Slight overhead in enqueuing and dequeuing jobs compared to immediate in-process execution.
