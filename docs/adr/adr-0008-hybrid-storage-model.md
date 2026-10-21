---
created: 2026-04-27
description: A hybrid storage model separating durable event history in Postgres from active working context.
---

# Hybrid Storage Model

**Status:** Deprecated

Abandoned in practice rather than replaced by name — the mission/brain-directory model it describes was never carried into the current architecture. Nothing supersedes it.

> ⚠️ **Stale (flagged 2026-08-09).** Describes a "mission/brain directory" conversation model (Coordinator/Worker roles, `active_missions/`, `checkpoints/`) that predates and was never carried into the current architecture — agent execution today is task-scoped (ADR-0030) against persistent workspaces (ADR-0004, ADR-0038/ADR-0039), with no mission or brain-directory concept. No later ADR formally supersedes this one; it was abandoned in practice rather than replaced by name. Read as historical record of an earlier design, not current storage architecture.

## Context
As the site scales towards **Phase 3: Multi-Agent Orchestration**, we face a critical challenge in handling long-running agent conversations. These sessions generate a high volume of data, including:
- User messages and assistant responses
- Tool calls and execution results
- Intermediate reasoning artifacts (thoughts, plans, scratchpads)
- Rolling summaries and decision logs

We must manage **context size (token limits)** while maintaining:
- **Efficiency:** The agent needs fast access to its current "Intelligence" (working state).
- **Persistence:** Structured querying, unbounded history, and an audit trail for the web dashboard.
- **Recoverability:** The ability to reconstruct state if the active context is lost or corrupted.

## Decision
We will adopt a **Hybrid Storage Model** that separates historical persistence from active working context.

### 1. PostgreSQL (Persistence Layer)
PostgreSQL is the durable system of record for all events.
- **Stores:** User identities, Agent profiles, Sessions, Messages (user/assistant), Tool calls/results, Timestamps, and explicit Thought/Decision logs.
- **Purpose:** Reliable, unbounded history, structured querying for analytics, and an audit trail for the dashboard. Raw messages are *never* deleted from SQL.

### 2. Filesystem (Agent Context Layer)
Each active session has a dedicated "brain" directory on the filesystem representing its current working state.
- **Proposed Structure:**
  ```
  conversations/<conversation_id>/
    brain/
      vision.md (High-level strategy and vision)
      scratchpad.md (Coordination memory for the Primary Agent)
      active_missions/ (Workspaces for currently executing missions)
        <mission_id>/
          agent.md (Worker Identity - points to Primary or a Sub-Agent)
          mission.md (Goal and implementation plan)
          task.md (Active operational steps)
          report.md (Ongoing metrics and results)
          guide.md (Optional user guide)
      missions/ (Global repository and archive for all missions)
        <mission_id>/
          agent.md
          mission.md
          task.md
          report.md
          guide.md
    summaries/ (Compressed history for prompt context)
    decisions/ (Append-only audit of key agent choices)
    checkpoints/ (Serialized snapshots of agent state)
  ```
- **Purpose:** Provides structured, minimal context for the LLM. It supports iterative reasoning without ballooning the prompt with raw SQL history.

### Key Principles
1. **Separation of Concerns:** SQL stores **what happened** (truth); the Filesystem stores **what matters now** (working understanding).
2. **Coordinator vs. Worker Roles:** The **Primary Agent** acts as the Coordinator (managing vision, scratchpad, and room logic). Every mission is executed by a **Worker** (identified in `agent.md`). A Primary Agent can "spawn itself" as the default Worker to minimize overhead.
3. **Context Isolation via Workspace:** Workers (whether Primary or Sub-Agent) are strictly bound to the `active_missions/` unit to prevent context drift from the broader conversation.
4. **Summarisation is Compression:** Raw messages stay in SQL; summaries in the filesystem manage token limits for the prompt context.
5. **Filesystem as Derived State:** Filesystem artifacts are mutable and can be regenerated from SQL truth if corrupted.

### Per-Turn Flow
1. **Ingest:** User message is received and stored in SQL.
2. **Reconstitute:** Coordinator loads Brain artifacts and recent SQL messages.
3. **Execute:** Coordinator assigns or resumes a mission. Worker (Primary or Sub-Agent) processes the request within the mission workspace.
4. **Persist:** Assistant messages and tool results are stored in SQL.
5. **Sync:** Workspace artifacts (task, report) are updated. Coordinator integrates mission reports into global scratchpad.

## Consequences

**Positive:**
- **Reduced Context Bloat:** Summarization slashes API costs and improves reasoning focus.
- **Reliability:** The main server is protected from context-related memory issues.
- **Traceability:** Everything (including thoughts) is stored in SQL for visual rendering.
- **Recoverability:** The filesystem "brain" is resilient and can be reconstructed from SQL truth.

**Negative:**
- **Sync Complexity:** Requires disciplined orchestration to keep filesystem artifacts in sync with SQL events.
- **Logic Overhead:** Additional implementation effort for dynamic context construction and summarization triggers.

## Alternatives Considered

### Filesystem-only
- **Pros:** Fast, simple to load.
- **Cons:** No querying, hard to audit at scale, limited discoverability.

### SQL-only
- **Pros:** Strong relational integrity, queryable.
- **Cons:** Poor fit for nested, rapidly evolving reasoning artifacts; large joins for prompt construction.

## Conclusion
A hybrid model provides the optimal balance: SQL ensures a durable, queryable history, while the filesystem enables efficient, structured agent reasoning. This separation aligns with the distinction between **Persistence** (system-level) and **Context** (agent-level).
