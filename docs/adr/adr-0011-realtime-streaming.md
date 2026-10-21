---
created: 2026-04-27
description: Streaming state changes and text chunks over Socket.io into a per-session room.
---

# Real-time Streaming via WebSockets

**Status:** Accepted

The WebSocket session-room streaming this record chose is still how the system works — hq emits to `session:<id>` in its site-event handler. What changed is only *who emits*: adr-0009 moved the emitter out of the pg-boss worker, and adr-0050/adr-0051 later moved it to the Execution Site, which sends typed events across the control channel for hq to re-emit into the room.

> ⚠️ **Decision point 2 is superseded** — the emitter is no longer the `pg-boss` worker holding a global Socket.io reference. Points 1 and 3 stand.

## Context
Following [Background Agent Loop](./adr-0010-background-agent-loop.md), the agent execution loop was moved to asynchronous background jobs (`pg-boss`). Consequently, the standard synchronous HTTP request/response cycle cannot easily return the final LLM response, nor can it provide the "typing" streaming experience expected in modern AI chat interfaces without long-polling.

We strongly desire to provide real-time token streaming to the dashboard client to improve user perceived latency.

## Decision
We will utilize Wasp's integrated `webSocket` feature (backed by Socket.io) to push state changes and stream text chunks directly from the background job to the client.

1. **Connection:** When accessing a session in the dashboard, the client connects to the WebSocket server and joins a specific "room" corresponding to the `Session ID`.
2. **Streaming:** Within the `pg-boss` worker (`agentLoopWorker`), as the Vercel AI SDK yields text chunks via `streamText`, the worker accesses a global reference to the Socket.io server and emits those chunks strictly to the specific session room.
3. **Reconnection:** If the WebSocket disconnects, the client can still rely on Wasp/React Query polling of the `getSession` query to fetch the final `TranscriptEntry` records once the `AgentRun` transitions to `COMPLETED`.

## Consequences

**Positive:**
- **UX:** Excellent, instantaneous feedback through token streaming.
- **Efficiency:** Much more efficient than HTTP long-polling or repeated standard polling against the database.
- **Security:** Broadcasting is scoped to specific session "rooms", ensuring tokens aren't leaked globally. (Further authorization checks on room joining can be added).

**Negative:**
- **Architectural Complexity:** Introduces a stateful WebSocket connection requirement on server deployments.
- **Wasp Constraints:** Wasp doesn't natively expose the `io` instance directly inside background jobs, requiring a `globalThis` injection workaround in the `socket.ts` initialization.
