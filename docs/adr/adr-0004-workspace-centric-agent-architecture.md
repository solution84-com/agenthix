---
created: 2026-04-27
description: Adopting a workspace-centric architecture, with the workspace as the security boundary.
---

# Workspace-Centric Agent Architecture

**Status:** Accepted

## Context
The system supports collaborative work between users and AI agents across multiple conversations and workspaces. Earlier designs introduced several architectural challenges:

### Security Complexity
- Agents had global or partially overlapping access to workspaces.
- Conversations could expose operational details across participants with different permissions.
- Access models required calculating intersections between user access, agent access, and conversation visibility.

### Identity Confusion
- Reusing the same agent identity across multiple workspaces caused ambiguity about memory, history, and responsibility.

### Operational Concurrency
- Multiple agents and conversations could attempt to modify the same workspace resources simultaneously, leading to race conditions and inconsistent state.

### Execution vs Communication Mixing
- Chat conversations were being used both for communication and operational logs, creating privacy risks and cluttered user experience.

To address these problems, the architecture has been redesigned around the workspace as the central boundary for both security and execution.

## Decision
The system will adopt a workspace-centric architecture with the following principles.

### 1. Workspace as the Security Boundary

> ⚠️ **Amended by adr-0039 — the "Members (users)" line only.** — a workspace carries `ownerType` and
> `ownerId`, and has no members relation. Permanent ownership replaced membership, and
> adr-0041 records that no user-to-project relation exists in the schema at all. **The rest
> of this section stands** — the workspace is still the security boundary, and every
> operation on its resources still occurs inside its context. *(annotated 2026-08-19)*

A workspace represents a secure operational environment.
A workspace contains:
- Members (users)
- Files and resources
- Missions (execution tasks)
- Agent instances
- Workspace threads
- Execution logs

All operations that interact with workspace resources must occur inside the workspace context.

### 2. Agent Templates vs Agent Instances

> ⚠️ **Superseded by adr-0025 — this section only.** The two-level model is half gone: an
> `AgentTemplate` still exists as a library blueprint, but there are no per-workspace *instances*.
> An `Agent` is an org-level record with a globally unique handle, so identity is not scoped to a
> workspace and does not vanish when one is deleted.

Agents are defined using a two-level model.

**Agent Templates**
Templates are reusable blueprints that define:
- Role archetype
- Capabilities
- Tools
- Behavioral configuration

Templates are not active participants in the system.
*Examples: Project Manager, Developer, QA Engineer.*

**Workspace Agent Instances**
Workspaces create agent instances from templates.
Properties:
- A workspace can contain multiple agent instances (e.g., Developer, QA, Manager).
- Each instance belongs to exactly one workspace.
- Instances have their own identity within the workspace.
- Instances share workspace-level historical context (`.agent/conversations/`) and user knowledge (`.agent/users/`) to prevent data duplication.
- Instances maintain their own unique persona config and individual mission history (tracked within shared conversation folders).
- Instances do not share identity across workspaces; deleting the workspace removes the agent instances and all associated project history.

*Example:*
- **Workspace A**: Tom — Project Manager, Jerry — Developer
- **Workspace B**: Maya — Project Manager, Leo — Developer

Even when derived from the same template, these instances are independent.

### 3. Channels and Workspace Access

> ⚠️ **Deprecated — this section only.** No `Channel` entity was ever built and nothing replaced
> it. The questions it was reaching for are answered elsewhere on different terms: what a run may
> reach is decided by its context (adr-0036), and who may read a conversation by its owner
> (adr-0041). Neither is a channel-attachment model, so this is abandoned rather than superseded.

Channels represent general conversations that exist outside of a workspace boundary.

**Default Isolation**
By default, channels have no direct workspace access and cannot read or modify workspace resources.

**Selective Agent Attachment**
A channel may be granted access to a workspace by "attaching" specific workspace agent instances with explicit user approval.
- **Role-Based Interaction**: Since a workspace can contain multiple agents with distinct roles (e.g., Developer, Tester, Auditor), a channel can selectively attach to one or more specific agents.
- **Mentions**: This allows external conversations to directly interact with and @mention the specific agent identity needed for a task.

**Security & Access Model**
Access in this model is strictly **conversation-bound**:
- **Shared Privilege**: Once an agent is authorized for a conversation (managed at the database layer), it can be interacted with by any participant in that conversation.
- **User Responsibility**: Users manage conversation access appropriately through the application UI.
- **Revocation**: Removing an agent's authorization explicitly revokes its ability to participate in and retrieve context from that conversation.

*Example:*
1. A Slack channel (external) attaches **Tom — Project Manager** from **Workspace A**.
2. Once approved, the channel can interact with Tom.
3. Tom operates within the context of Workspace A.
4. The channel itself does not gain direct workspace access; interaction is mediated through the attached agent.

**Extensibility & Integration**
The channel framework is built for cross-platform compatibility. While supported natively for internal chat, the framework enables agents to be projected into public realms (e.g., Slack, Discord, Telegram), providing a unified experience similar to the OpenClaw setup.

### 4. Workspace Threads
Workspace threads are conversations that exist entirely within a workspace.

Properties:
- Visible to all workspace members by default
- Access managed at the application database layer
- Directly interact with workspace agents
- May create missions

Workspace threads operate fully within the workspace security boundary.

### 5. Mission-Based Execution

> ⚠️ **Superseded by adr-0030 — this section only.** There is no Mission anywhere in the codebase.
> Execution is scoped to a **task**, with a session created on first run and resumed on every
> later run for that task.

Operational work is executed through **Missions**, the atomic units of agentic work.

A mission:
- Serves as the **exclusive execution boundary** for write operations.
- Operates inside a specific workspace and owns the `workspace.lock`.
- Follows a formal lifecycle: Drafting -> Enqueued -> Active -> Verification -> Archival.
- Coordinates tool usage and maintains durable records in `.agent/missions/{id}/`.

Mission-based execution is separated from conversational communication. Chat responses display only deliberate outputs, while operational logs reside in the execution UI.

### 6. Workspace Execution Queue

> ⚠️ **Superseded by adr-0049 — this section only.** Neither `.agent/queue/` nor `workspace.lock`
> exists. The serialisation this section chose was reversed: a container belongs to a session, so
> concurrent execution against one workspace is the normal case rather than something a lockfile
> prevents.

All workspaces contain a shared **Execution Queue** (`.agent/queue/`) and **Mission Registry** (`.agent/missions/`).
- **Standard Locking**: The presence of `.agent/workspace.lock` (YAML) serves as the exclusive execution lock. It contains active mission ID and process metadata.
- **Mission-Based**: Agents must create a "Mission" (with a `mission.yaml` entry) to perform tool-based writes.
- **Serialization**: Only one Mission can be active at a time. If the lockfile exists, subsequent missions are queued in `.agent/queue/`.
- **YAML Native**: All operational metadata (locks, queue entries, mission headers) uses YAML for human readability.

Multiple conversations may submit missions, but execution is governed by the workspace scheduler.
Future enhancements may allow parallel read-only operations, but write operations remain serialized.

## Consequences

### Benefits
- **Simplified Security Model**: Security decisions are simplified by making the workspace the sole access boundary. Agents no longer require complex access intersection calculations.
- **Clear Identity Boundaries**: Agent instances are workspace-specific, while shared storage for conversations and users ensures a consistent and efficient project-wide historical context without data redundancy.
- **Deterministic Execution**: Workspace-level execution queues prevent concurrent mutations of shared resources.
- **Separation of Concerns**: The architecture clearly separates Chat UI (communication) from Execution UI (operational activity). This improves both privacy and usability.
- **Flexible Collaboration**: Channels allow agents to participate across contexts without exposing entire workspaces. Workspace threads remain the primary environment for operational collaboration.

## Alternatives Considered

- **Global Agent Identity**: Agents existing globally across multiple workspaces were considered but rejected due to identity ambiguity, cross-workspace memory leakage risks, and complex permission management.
- **Workspace Access via Conversations**: Granting conversations direct workspace access was rejected due to difficulty enforcing permission boundaries and increased risk of accidental information leakage.
- **Multi-Agent Concurrent Execution**: Allowing unrestricted concurrent execution inside workspaces was rejected due to high risk of inconsistent resource states.

## Summary

The architecture pivots toward a workspace-governed execution model:
- Workspaces are the core security and execution boundary.
- Agents are instantiated per workspace from reusable templates.
- Channels interact with workspaces through approved agent instances.
- **Unified Execution**: Missions are the primary units of work. They exist at the workspace level (`.agent/missions/`) and are serialized via the workspace queue.

This model prioritizes clarity, security, and operational stability while maintaining flexibility for future expansion.
