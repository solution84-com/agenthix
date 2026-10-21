---
created: 2026-08-12
description: Where a run may execute — an agent must be on the site holding every location the run works in.
---

# ADR-0047: Where a Run May Execute

**Status:** Superseded by adr-0056

## Context

An agent executes in a container on one Execution Site, and reads and writes real directories on that machine's disk. Before any run starts, something has to decide whether the site holding the agent also holds everything the run needs — otherwise the run begins and fails partway through on a path that is not there.

The rule for deciding this was stated earlier as *anything with disk-resident storage needs a site; anything that is pure definition does not*. The rule is sound. Its application to two of the three entities rested on a wrong reading of the code.

An `Agent` was treated as pure definition — name, model, tool permissions — and therefore free to execute anywhere. In fact every agent owns `agents/<handle>/workspace`, holding its profile, responsibilities, its own skills and its git credentials, plus a runtime state directory. Both are bind-mounted on every run. An agent has as much disk-resident storage as a project does.

A `User` was given a home site on the reasoning that a person's files home is disk-resident storage, so it needs a site the way a project's workspace does. The premise is right and the conclusion does not follow from it.

## Decision

**An agent must be on the site holding every location the run works in.**

One rule, no special cases: true for a project's files and workspaces, true for a person's own. It is enforced when work is assigned, not discovered when a run fails.

Three placement anchors follow, and one is removed:

- **`Agent.homeSiteId`, required.** An agent is bound to one site. It is not merely that an agent has storage — it *writes* that storage, because self-improvement means revising its own skills. A copy on a second site would be a copy with a downstream writer, which is a second master needing reconciliation. That is the synchronisation machinery this platform deliberately removed, and it should not return by the back door.
- **`Project.executionSiteId`**, unchanged. A project is a shared object with a definite home.
- **`Workspace.siteId`, required, on every workspace record.** Not inherited from the owner. A person-owned workspace has no owner-site to inherit once the next point holds, and putting the field on every workspace removes inheritance logic altogether rather than special-casing one owner type.
- **No site for a person.** A project is a shared object; a person is a participant who shows up wherever they are working. A person's intrinsic files home therefore exists on *every* site, created when first needed. These are separate drawers, not replicas — nothing synchronises between them, so there is no second master and nothing to reconcile.

The consequence for the interface is a selection rule rather than a placement prompt: **choose an agent, and the available locations are exactly that person's locations on that agent's site.**

## Consequences

### Positive

- A person is never asked to pick a machine to live on. The prompt that did this — choose an Execution Site for your personal files — disappears along with the field behind it.
- Placement is checkable at one moment, against one rule. Adding an agent to a project, or assigning it a task, either satisfies it or is refused with a stated reason.
- Nothing needs synchronising. Every store in the model has exactly one writer on exactly one machine, which is what keeps the removal of the old delta-sync system final.
- Agents can be distributed across sites for capacity or locality without a person's own work being pinned to any of them.

### Negative

- **An agent is no longer hot-swappable across sites.** Moving one means moving its storage, and no migration path is designed. This is a real reduction in flexibility, accepted because the alternative is two masters.
- **A person who has worked with agents on three sites has three files homes**, and no single place holding everything they have made. The interface must show which site a location is on, or "where is my file" becomes hard to answer. This is an interface problem created by the decision, not solved by it.
- A project and an agent on different sites simply cannot work together. The refusal must be explained where it happens — a task assignment that silently does nothing would be worse than the constraint itself.

### Risks

- The rule is only enforced where someone remembers to enforce it. Membership and task assignment are the two known points; a third path that starts a run without checking would produce exactly the mid-run failure this record exists to prevent.
- `Workspace.siteId` needs backfilling on existing rows. Project workspaces take their project's site. Person-owned workspaces take whatever the removed user home site said, which means the removal and the backfill have to happen in that order.

## References

- the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository — establishes one HQ per organisation and Execution Sites as the execution layer, which is what makes placement a question at all
- [ADR-0044](adr-0044-execution-site-registration-flow.md) — **amended here**: its Placement section assigned a person a site on first project-less chat; that is reversed, and the project half stands
- [ADR-0039](adr-0039-files-and-workspaces.md) — the owner/files/workspaces storage shape this places; **amended here**, in that a person's files home exists per site and `Workspace` gains a site of its own
- [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) — what a run may reach once it is on the right machine
