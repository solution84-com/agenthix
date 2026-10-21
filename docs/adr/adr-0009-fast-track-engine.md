---
created: 2026-04-27
description: An in-process fast-track engine for the hot path, alongside the durable job queue.
---

# Fast-Track Agent Engine

**Status:** Accepted

## Context
Previous attempts to use a purely background-job-based architecture ([Background Agent Loop](./adr-0010-background-agent-loop.md)) introduced significant polling latency (2-5 seconds). For interactive AI agents, this delay breaks the "instant" feedback loop.

OpenClaw solves this by using an in-process, keyed execution queue that provides immediate starts while ensuring sequential message processing.

## Decision
We will implement an in-process **Fast-Track Agent Engine** to handle the "Hot Path" of agent interactions.

1.  **Immediate Execution**: Wasp server actions (`triggerAgentRun`) will directly invoke the `AgentEngine` instead of only relying on `pg-boss` dispatch.
2.  **Keyed Async Queue**: We will maintain a `Map<sessionId, Promise>` in-memory. Each session has its own "lane," ensuring that messages are processed sequentially and alphabetically within that session.
3.  **Global Concurrency Cap**: To protect server resources, we will implement a global semaphore (Max 5 concurrent agents across all sessions).
4.  **Hybrid Persistence**: `pg-boss` remains as a "Safety Net." If a run is still `PENDING` after a timeout (e.g., server restart), the worker will pick it up.

## Consequences

**Positive:**
- **Zero Latency**: Agent runs start within milliseconds of the user hitting Enter.
- **Sequential Integrity**: No race conditions within a single session.
- **Simplicity**: No complex orchestration between workers for the primary chat experience.

**Negative:**
- **Memory Consumption**: Active LLM streams and tool contexts reside in the main server process.
- **Vertical Scaling**: Horizontal scaling now requires session-affinity (sticky sessions) if we maintain the queue entirely in-memory (Acceptable for current usage).
