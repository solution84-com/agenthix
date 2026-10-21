---
created: 2026-08-12
description: The session as the container boundary — one session, one container, for as long as it is active.
---

# ADR-0049: The Session Is the Container Boundary

**Status:** Superseded by adr-0057

## Context

An agent runs inside a container whose bind mounts are the entire extent of what it can reach. Today there is **one container per agent** — its name derives from the agent handle alone — so every person talking to that agent, and every project it works on, shares a single process.

[ADR-0036](adr-0036-context-centric-security.md) §4 called for per-context runtimes instead. That was never implemented, and on examination the framing does not survive contact with the cases. A run's mount set is determined by the agent, the invoker if there is one, and the locations being worked in, which produces three shapes rather than two: agent and project with no invoker for autonomous and scheduled work; agent and invoker with no project; and agent, invoker and project together. A person can also select several workspaces for one conversation. "Context" is not a thing that can be enumerated and keyed.

It has a worse problem than being hard to enumerate: **a context has no lifecycle.** It has no beginning and no end, so a container keyed by one would be created on first use and live indefinitely, with nothing responsible for removing it.

The current arrangement is also not the cheap one it appears to be. `ensureRunning` reuses a container only when its mount set is identical to the run's; otherwise the container is destroyed and recreated. With one container per agent, two people alternating with the same agent force a full recreate on every exchange, because their mount sets differ.

## Decision

**A container belongs to a session.** One `AgentSession`, one container, for as long as that session is active.

The session is already exactly the tuple that determines a mount set — it carries the agent, the invoking person, the task if there is one, and the location being worked in. Nothing new has to be modelled, and the three shapes above stop needing to be distinguished because each is simply a session with different fields set.

**Lifecycle follows the session.** The container is created when the session first runs and removed when the session goes idle, then recreated on resume. Creation and teardown were measured at roughly 155 ms and 99 ms, so a resume is not perceptible. Idle means no activity, not the absence of a session — a task-scoped session legitimately stays open for the length of its task.

**Naming is one shape, always:** `<site>-agent-<handle>-<sessionId>`. Neither project nor person appears in it. A session may hold several workspaces, so there is no single project to name; and an autonomous or scheduled run has no invoker, so there is no person to name. A name that is sometimes one shape and sometimes another is worse than an opaque one.

**Context goes in labels, not the name.** The invoker, the task and the mounted locations are attached as Docker labels, where they may be absent or plural without breaking anything and remain searchable with `docker ps --filter label=`. Names carry identity; labels carry context. This is the same mechanism already used to group a site's containers under its Compose project.

## Consequences

### Positive

- **Isolation becomes the default rather than an added control.** Two people talking to the same agent are two processes with disjoint mounts. Nothing has to classify, route, or remember to separate them.
- **Container churn falls.** A session's mount set is stable for its life, so the destroy-and-recreate that happens today on every alternation stops happening.
- **Cleanup has an owner.** Ending a session removes its container. There is no orphan class to sweep up, which is the problem a per-context container would have created.
- **The boundary is observable from outside the system.** A violation becomes a container that should not exist, rather than something found by auditing what got written where.
- Container count is cheap **on disk**: an idle container adds about 156 kB of writable layer, and the image layers are shared across every container on the host. Memory is the constraint, and it is addressed by teardown rather than by the count being small — see below.

### Negative

- **Idle teardown is mandatory, not an optimisation.** Sessions accumulate over months. Without teardown this grows without bound. *(Resolved 2026-08-15: an idle sweep removes containers after a configurable quiet window, with recreate-on-resume as the recovery path.)* The cost that matters is not the memory measured inside the container but the container runtime's per-container shim on the host — roughly 10–20 MiB each, and invisible to `docker stats` because it sits outside the cgroup. Two hundred idle containers is several gigabytes of pure overhead.
- **An operator reading `docker ps` sees opaque names.** The context is in labels, so answering "who is this container serving" requires inspecting rather than reading. Accepted deliberately in exchange for one consistent naming shape.
- The memory cost of *executing* is unchanged — roughly 207 MiB per running agent, whether or not the runs share a container, because each is its own process. What this decision changes is the **idle** footprint, which is why the teardown policy above carries the weight.
- **Isolation is of context, not of the agent's own materials.** Every session container for one agent mounts that agent's own workspace, so its profile, credentials and skills are shared across its sessions by design. That is intended — they are properties of the agent, not of a conversation — but it means this record bounds what a run can *reach*, and does not by itself stop an agent's own materials carrying something between sessions. [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) records the one live instance of that.

### Risks

- **A session whose location changes mid-life still forces a recreate.** The existing mount-signature check handles it correctly, but the case does not disappear — it only becomes rare instead of constant.
- **Nothing yet limits what one container may consume.** *(Resolved 2026-08-15: every agent container runs with a memory cap and a process-count cap, both configurable.)* CPU quotas remain unset. *(Resolved 2026-09-19: a CPU cap is set too, and all three are sized for a container serving several concurrent runs rather than one.)*
- **Idle detection has no design here.** *(Resolved 2026-08-15: idle means no live run and no activity within a configured window. The sweep adopts containers it does not recognise — after a restart — rather than removing them, never touches one with a live run or an in-flight start, and holds a grace floor and a removal handshake against the start/stop races. The windows and thresholds are operational settings, held in the design spec.)* A container whose session is deleted while a run is in flight remains an open case.

## References

- [ADR-0036](adr-0036-context-centric-security.md) — §4's per-context runtime is superseded by this record: the intent is kept, the unit of isolation changes from a context to a session
- [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) — depends on this record; a per-invoker mount is only possible once containers are per session
- [ADR-0030](adr-0030-task-scoped-agent-sessions.md) — task-scoped sessions, which are the long-lived case idle teardown has to accommodate
- [ADR-0047](adr-0047-where-a-run-may-execute.md) — which machine the container is created on
