---
created: 2026-03-29
description: Agent identity as the root unit of the org rather than the board.
---

# ADR-0025: Agent Identity as First-Class Org Member

**Status:** Accepted
**Deciders:** the maintainers
**Supersedes:** [ADR-0024](./adr-0024-board-scoped-primary-agent.md)

> ⚠️ **Amended by [ADR-0036](./adr-0036-context-centric-security.md)** — the agent workspace holds *knowledge / skills*, not business or user data; agents do **not** own user or project data (ownership is user/project; the agent owns only know-how). The first-class-identity decision itself stands.

## Context

[ADR-0024](./adr-0024-board-scoped-primary-agent.md) bound each agent to a single board in a strict one-to-one relationship. A board had one primary agent, one workspace, and one execution context. This simplified the model but created compounding limitations:

- **No agent identity.** Users interact with "the board's agent," not a named, persistent entity. There is no personality, no continuity of identity across conversations.
- **Limited flexibility.** An agent cannot work across multiple boards or projects. A generalist agent (e.g. a project manager spanning the entire org) is impossible.
- **Sprint planning is board-scoped.** No agent has visibility across the whole project, making cross-board planning and coordination impossible.
- **Chat is board-bound.** To talk to an agent, a user must navigate to the board. The agent has no independent presence in the org.
- **Workspace is board-bound.** The agent's workspace is tied to the board, not to the agent itself. If the board changes, the agent loses its context.
- **Duplication.** If a user wants the same agent on two boards, they must define it twice with no shared identity or memory.

The board-scoped model optimized for simplicity at the cost of flexibility. The limitations above block several core product scenarios — multi-project coordination, persistent agent relationships, and org-wide visibility — that are essential for Agenthix to move beyond single-board automation.

---

## Decision

**Agent identity is the root unit of the org, not the board.**

Agents are first-class members of the org with their own persistent identity, workspace, memory, and capabilities. They are not subordinate to boards or projects.

### 1. Agent is no longer bound to a board

- `board.primaryAgentId` is removed.
- Boards are workflow definitions only — statuses, backlogs, tasks.
- Boards do not own agents or workspaces.

### 2. Agent has its own persistent workspace

> **The risk this section accepted was later resolved.** *(annotated 2026-08-30)* It traded
> per-project path enforcement for agent autonomy and called self-isolation an accepted risk.
> adr-0036 answered it differently: permissions come from the run context, not from the agent's
> good behaviour. The decision that the workspace belongs to the **agent** still stands; the path
> it names was replaced by adr-0039's nested storage.

- Each agent has a dedicated workspace (filesystem) on its Site.
- The workspace belongs to the agent, not a board or project.
- If working across multiple projects, the agent structures its workspace however makes sense for its work (e.g. `projects/<projectName>/`).
- Workspace path: `$AGENTHIX_DEPLOY_ROOT/kernel/agents/{handle}/`

**On workspace isolation:** Per-project path enforcement (as in [ADR-0023](./adr-0023-org-scoped-agent-identity.md)) is intentionally removed. Agents are trusted to self-isolate via folder structure. The security boundary is managed at a higher level: users add and remove agents from projects in HQ, and agents work against protected remote git repos and cloud storage — not raw local filesystems containing other projects' sensitive data. This is an accepted risk in exchange for agent autonomy and workspace flexibility.

### 3. Agents are project members

> **The decision holds; the unified model was never built.** *(annotated 2026-08-30)*
> `ProjectMember` exists and is how an agent is granted a project — but it is **agent-only**, with
> no `type` discriminator and no `canClaimUnassigned`. Human membership is not modelled through it.

Projects have members — both humans and agents. Membership is managed through a unified `ProjectMember` document:

```
ProjectMember {
  type: 'human' | 'agent'
  id: string                    // userId or agentId
  canClaimUnassigned: boolean   // agent-only; default false
}
```

- Agents are granted access to projects just like humans — explicitly, via HQ.
- An agent can be a member of multiple projects simultaneously.
- `canClaimUnassigned` controls whether the agent can pick up unassigned tasks in that project's boards (see §6). This is set per project when adding the agent.

### 4. Agent identity is persistent and addressable

- Users can navigate directly to an agent in HQ and open a chat session.
- The agent has a name, role description, responsibilities, and persistent memory.
- Chat history is attributed to the agent identity, not the board.
- The agent is a named, recognizable entity in the org — not an anonymous board process.

### 5. Sub-agents are bound to their parent agent

> ⚠️ **Deprecated — this section only.** *(annotated 2026-08-30)* `subAgents` exists nowhere, and
> nothing replaced it. adr-0020 had already removed sub-agent spawning three days before this
> record restated the model, deferring the whole pattern in favour of task delegation.

Sub-agents remain defined inline within `AgentDoc.subAgents[]`, as established in [ADR-0024](./adr-0024-board-scoped-primary-agent.md). They are:

- Extensions of the parent agent's workflow (e.g. linter, test runner, reviewer).
- Spawned within the parent agent's workspace, within the parent's execution session.
- Not independently addressable, discoverable, or managed in HQ.
- Task-oriented — no memory, no conversation continuity, no first-class identity.

Sub-agents travel with their parent. Wherever the parent agent goes, its sub-agents are available.

**Why not floating sub-agents?** A "test runner" sub-agent configured for Agent A's stack and conventions won't just work for Agent B. Floating identity adds management surface area for zero user benefit. If shared specialist templates are needed later, that's a template/config concern — agents can copy from a template library into their own `subAgents[]` config without introducing shared floating identities.

### 6. Heartbeat is agent-scoped

> ⚠️ **Superseded by adr-0087 — this section only.** An agent has no schedule of its own; work starts on its own
> only from a boundary's automation. Section 7's heartbeat triggers go with it. The rest of this record stands.

> **Agent-scoped heartbeat stands; the claim mechanism does not.** *(annotated 2026-08-30)*
> `canClaimUnassigned` is not on `ProjectMember` or anywhere else, so the per-project capability
> flag this section turns on was never built.

On each heartbeat tick, the agent scans tasks across all projects and boards it has access to:

```
for each project where agent is a member:
  fetch tasks WHERE assignedAgentId == myId
  if myMembership.canClaimUnassigned:
    also fetch tasks WHERE assignedAgentId == null
      AND boardId IN thisProject.boards
```

- All agents pick up tasks explicitly assigned to them.
- Agents with `canClaimUnassigned: true` on a given project also see unassigned tasks on that project's boards. This is how a PM agent reviews a backlog and assigns or claims tasks.
- The flag is per-project on the `ProjectMember` record — the same agent can claim on one project and only do assigned work on another.
- The agent's system prompt describes *how* it should handle unclaimed tasks (prioritize, assign to others, claim for itself). The flag controls the *ability* to see them. Clean separation of capability vs. behavior.

### 7. "Run now" is context-aware

- **Agent-level:** triggers heartbeat for that agent across all its work.
- **Board-level:** triggers heartbeat for all agents with access to that board.
- **Project-level:** triggers heartbeat for all agents in that project.
- **Org-level:** triggers heartbeat for all agents in the org.

### 8. Site binding remains required

Agent execution is a Site concern ([ADR-0017](./adr-0017-agent-execution-as-site-concern.md)). Each agent is still bound to exactly one Site for execution. The Site owns the agent's workspace, runtime, and lifecycle. What changes is that the Site binding is independent of any board — an agent on a Site can work across any projects it has been granted access to.

### 9. Single-session execution and task sequencing

> ⚠️ **Superseded by adr-0049 — this section only.** *(annotated 2026-08-30)* The one-session-per-agent
> rule is enforced nowhere. A container belongs to a **session**, so an agent running several
> sessions at once is the normal case rather than a conflict to prevent.

An agent has one workspace and runs as one `ClaudeSDKRuntime` subprocess. Concurrent sessions for the same agent would write to the same workspace simultaneously — causing file conflicts, git conflicts, and incoherent state. The execution model enforces single-session concurrency:

**Rule: at most one active execution session per agent at any time.**

The agent document tracks execution state:

```
AgentDoc {
  ...
  status: 'idle' | 'running'
  currentSessionId: string | null
  pendingHeartbeat: boolean       // default false
}
```

**Execution flow:**

```
trigger fires (heartbeat tick, "run now", or task assignment)
  → Is agent.status == 'running'?
     YES → set agent.pendingHeartbeat = true → done (no new session)
     NO  → atomically set status = 'running', currentSessionId = newId
         → scan tasks (assigned + unclaimed if permitted per §6)
         → execute tasks sequentially, one at a time
         → after completing a task:
              if pendingHeartbeat == true:
                clear flag, re-scan for new/changed tasks
              else:
                scan for remaining tasks
         → when no tasks remain:
              set status = 'idle', currentSessionId = null
```

**Key properties:**

- **No duplicate work.** One session, one task at a time. Two "run now" triggers hitting the same agent don't spawn two sessions — the second sets `pendingHeartbeat` and the running session re-scans when ready.
- **No lost triggers.** A "run now" that arrives mid-execution is not discarded. The `pendingHeartbeat` flag ensures the agent re-scans after its current task, picking up any newly available work.
- **Sequential task processing.** The agent completes one task before scanning for the next. This eliminates workspace conflicts between tasks.
- **Parallelism within a task.** Sub-agents (§5) provide concurrency *within* a single task execution — the parent can spawn sub-agents to work in parallel inside one workspace. This is the right level of concurrency: parallel work within a task, sequential execution across tasks.
- **"Run now" resolves to "ensure the agent is awake."** Regardless of the trigger scope (agent/board/project/org), the effect on any individual agent is the same: if idle, wake up and scan; if running, flag for re-scan. The different scopes only determine *which* agents get poked.

---

## Consequences

### Positive

- **Agent identity is real.** Users chat with a named, persistent agent — not an anonymous board process.
- **Flexibility.** One agent on one board (simulating the old model) or one agent across many projects. Both supported.
- **Generalist agents are possible.** An agent with broad project access can coordinate across the org.
- **Specialist agents are possible.** An agent assigned to one board behaves exactly like the old primary agent.
- **Cross-board visibility.** Agents with multi-project access can plan across workflows.
- **Workspace continuity.** Agent context persists across conversations, projects, and tasks.
- **Per-project task claiming.** The `canClaimUnassigned` flag gives fine-grained control without an RBAC system.

### Negative / trade-offs

- **No platform-enforced workspace isolation.** Agent is trusted to self-isolate. Mitigated by project-level access control in HQ and agents working against remote repos/cloud storage.
- **Task routing is more complex.** Tasks are no longer automatically routed to "the board's agent." Assignment must account for which agents have access and the `canClaimUnassigned` flag.
- **Heartbeat scope is broader.** Agents scanning across multiple projects is more expensive than scanning one board. Needs efficient querying — likely a compound index on `assignedAgentId` + `status` across the tasks collection.
- **Concurrency requires care.** Single-session execution (§9) prevents intra-agent conflicts, but multiple agents claiming from shared pools still requires atomic task claiming. The existing `fetchTasks()` atomic claim pattern ([ADR-0022](./adr-0022-remove-mcp-claudesdkruntime-is-canonical.md)) should extend, but needs validation for the multi-agent case where two agents with `canClaimUnassigned` target the same board.

---

## Migration from ADR-0024

- Remove `board.primaryAgentId` from the board data model.
- Remove `agent.boardId` from the agent data model.
- Add `ProjectMember` collection/subcollection to projects.
- Existing agents migrate by creating a `ProjectMember` record linking the agent to its former board's project.
- Workspace path: `kernel/agents/{handle}/` — keyed on agent handle, not database ID.

---

## Backwards Compatibility

The old board-scoped model is fully achievable as a configuration: assign one agent to one project with one board, give it `canClaimUnassigned: true`, and it behaves identically to the old primary agent. The new model is a strict superset — you can always constrain an agent to act board-scoped, but you cannot expand a board-scoped architecture to support multi-project agents without a full rewrite.

---

## Alternatives Considered

**Keep board-scoped agents (ADR-0024)** — rejected. Blocks generalist agents, cross-project coordination, and persistent agent identity. Every limitation listed in the Context section is a direct consequence of the board binding.

**Floating sub-agents as shared org resources** — rejected. Adds identity management complexity for sub-agents that are task-oriented and stateless. Shared templates solve the reuse case without shared identity.

**Role-based access control for agents** — deferred. A single `canClaimUnassigned` flag covers the immediate need. A full role taxonomy can be added to `ProjectMember` later if needed without breaking changes.

**Workspace isolation enforced by platform** — rejected for now. The security model relies on project membership in HQ, remote git repos, and cloud storage rather than filesystem path enforcement. Accepted risk in exchange for agent autonomy.

---

## References

- [ADR-0024](./adr-0024-board-scoped-primary-agent.md) — superseded by this record
- [ADR-0023](./adr-0023-org-scoped-agent-identity.md) — org-scoped agent identity (archived; this ADR revisits and extends that direction)
- [ADR-0022](./adr-0022-remove-mcp-claudesdkruntime-is-canonical.md) — ClaudeSDKRuntime as canonical execution path
- [ADR-0020](./adr-0020-task-delegation-over-spawn-agent.md) — task delegation over sub-agents
- [ADR-0017](./adr-0017-agent-execution-as-site-concern.md) — agent execution is a Site concern
- ADR-0013 (archived, recorded outside this repository) — User/Org/Site/Fleet identity model
- The original agent identity and workspace model — never accepted, and later a proposal, closed as not planned
