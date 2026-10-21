---
created: 2026-09-14
description: Work arriving from GitHub Issues, Jira or another outside tracker is referenced by an Agenthix task, never synchronised with one.
---

# ADR-0055: An External Issue Is a Source of Work, Not an Agenthix Task

**Status:** Accepted

## Context

An organisation adopting Agenthix usually tracks work somewhere already — GitHub Issues, Jira,
a support inbox, a feature-request board. Agenthix has its own task model, and a task carries
things an issue tracker does not: assignment to an agent, start and stop control, blockers, an
execution lifecycle, and decomposition into further tasks.

Once both exist, work that starts outside has two possible representations, and nothing yet
says how they relate. The relationship is not only status. An external issue keeps changing
after work begins: its reporter edits it, comments, answers questions, adds evidence. And
execution discovers things that send someone back to it — a question for the reporter, a
comment that the fix landed, a closure.

A public issue tracker makes the difference plain. The public issue is a conversation with the
person who reported the problem. The task is the organisation's record of executing it. They
are about the same work and serve different purposes.

**The question:** when work arrives from an outside tracker, what is the relationship between
the external record and the Agenthix task that executes it?

## Options considered

### Leave it to each integration

Each integration decides for itself whether to use external records directly, copy them in, or
track them alongside tasks.

**Not chosen.** Users could not predict which record is authoritative for execution; agent
workflows would differ by where work came from; and duplicated, inconsistent state would appear
without anyone deciding it should. Integrations would couple themselves to Agenthix's execution
semantics one at a time, each differently.

### Synchronise the external record with an Agenthix task

Create a task for the external item and keep the two in step — status, description, comments,
closure.

**Not chosen.** It produces two mutable representations of the same work, which needs
conflict resolution and source-of-truth rules. Every provider has its own states, comment model,
permissions and lifecycle, so Agenthix would have to understand each one. Two-way sync also
surprises people: an internal state change reaches out and edits a public issue. Agenthix
becomes a synchronisation engine for other trackers rather than an execution platform.

### External record as source, Agenthix task for execution — chosen

The external record is a source of work and of ongoing context, not a task. When work is taken
on for agents, an Agenthix task is created and references its source.

## Decision

**An external issue, ticket or request is a source of work. The Agenthix task is the
authoritative record of executing it. The two reference each other; their lifecycles are not
synchronised.**

- The external record stays authoritative for its own conversation and its own lifecycle.
- The Agenthix task stays authoritative for execution — assignment, blocking, progress,
  completion, decomposition.
- The source is **re-read when current context is needed**, not mirrored into the task.
- Acting on the source — asking the reporter a question, commenting, closing it — is an
  **explicit action through an authorised external capability**, never a side effect of a task
  changing state.
- The relationship is **not one-to-one**. One external request may become several tasks, and
  several reports may be resolved by one piece of work.

**Not decided here:** how the reference is held (text in the task description, or a
provider-neutral source field), when an agent re-reads a source, and how an external follow-up
owed after completion is represented so it isn't forgotten. Those belong to whichever design
first builds an intake from an outside tracker, and have to fit inside this decision.

## What this binds

- **Any intake from an outside tracker** creates Agenthix tasks that reference their source. It
  does not mirror state, comments or closure in either direction.
- **The task model** does not take on fields whose purpose is to hold a copy of another system's
  state. A reference to the source is in keeping; a replica is not.
- **Writing back to a source** goes through the same authorised-capability path as any other
  external action an agent takes, so it is visible and permissioned like one.

**Undoing it** after integrations exist means adding conflict resolution, per-provider state
mapping and sync infrastructure to every one of them, and changing what users have learned
closing a task does. Deciding it now costs nothing, because no intake is built.

## Consequences

### Positive

- Each system has one job. Agenthix keeps control of its execution lifecycle, whatever tracker
  the work came from.
- No general-purpose two-way sync to build, operate or debug.
- Fits public trackers, where the external item is a conversation with outside people, and
  sources that aren't trackers at all, such as a support inbox.
- An organisation can adopt Agenthix by creating tasks as work is picked up, rather than
  mirroring its whole backlog in first.

### Negative

- External and internal state can diverge, on purpose. Completing a task does not close its
  source.
- Someone wanting the whole picture may have to look at both: the task for execution, the source
  for the external conversation.
- Workflows have to cover going back to the source, when clarification is needed and when work
  finishes.

### Risks

- **The source changes materially while work is under way**, and the task proceeds on stale
  context. The chosen option depends on re-reading the source at sensible points; if no design
  defines those points, this exposure is live.
- **An external follow-up is forgotten** once the task completes, because nothing mirrors the
  closure. Accepted as the price of not syncing; the intake design has to make the obligation
  visible.
- **Teams expect their existing tracker to stay the execution system** and read the lack of sync
  as a missing feature. Accepted; the intake has to say plainly which record owns what.

## References

- [ADR-0037](adr-0037-connectors-environments-and-scripts.md) — Connectors, the scoped external
  capability through which acting on a source would go
- The proposal for external issues as a source of work, which carries the design questions this record
  leaves open
