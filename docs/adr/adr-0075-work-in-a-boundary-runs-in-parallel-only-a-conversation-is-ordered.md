---
created: 2026-09-28
description: Runs in a boundary are not queued behind each other; only the turns of one conversation are ordered. The platform takes no locks on shared storage and gives visibility of what is running instead, asked of the site each time.
---

# ADR-0075: Work in a Boundary Runs in Parallel; Only a Conversation Is Ordered

**Status:** Accepted

## Context

Every run on a site goes through a queue keyed on its storage boundary, so all of a project's work —
every member's chats, every task — runs one at a time. That followed from one container per boundary
(adr-0057). With a container per runner (adr-0074) nothing requires it, and it stops several people and
agents from working in one project at once.

One ordering is necessary: a harness transcript has one writer, so two turns of one conversation cannot
run together.

Running in parallel means two runs can edit the same shared files.

## Options considered

- **Keep one queue per boundary.** Rejected: it serialises a whole project, so one long run delays
  everyone in it.
- **One queue per container** (per runner in a boundary). Rejected: it still makes one person's
  conversations and subagents wait for each other, which the harness does not require.
- **Platform locks on shared files or workspaces.** Rejected: it makes the filesystem transactional for
  everyone to solve what teams already solve with branches and worktrees, and it would decide for them
  how they coordinate.
- **Visibility kept by hq from the start and end status frames.** Rejected: a frame lost to a dropped
  connection leaves a run listed wrongly until something corrects it. The site is the only party that
  knows a run is still going.

## Decision

**The only ordering between runs is within a conversation.** A conversation's turns run one after
another; runs across people, across one person's conversations, across tasks and across subagents run
at once. The site-wide cap on concurrent runs and each container's resource limits stay: they protect
the machine and are not an ordering.

**The platform takes no locks on shared storage.** Conflicting edits are possible and accepted.

**Visibility instead.** For every active run in a boundary, people see — on the project in hq — and
agents read — through the platform tool `list_active_runs` — the agent, who or what started it, where
it is working, and since when. The view is scoped to the boundary, like everything else a run may
reach. **hq asks the site each time**: the site answers with ids only and nothing of a run's content,
and hq turns the ids into names from its own records. With the site unreachable, the view fails with
the explicit site-unreachable error rather than showing a list that may be wrong.

**Nothing is enforced.** People and agents decide whether to wait, branch, or work elsewhere.

The design is in the unit's [design spec](../work/2026-09-28-person-scoped-execution/spec.md).

## What this binds

- **Anything that orders runs keys on the session**, never on a boundary or container.
- **Every runtime must refuse to run two turns of one conversation at once**, or rely on that ordering.
- **Nothing may add a platform lock on shared storage** without superseding this record.
- **What is running is read from the site**, never from a list hq keeps.

Undoing it means choosing again between serialising a project and building locks.

## Consequences

### Positive

- Several people and agents work in one project at the same time.
- Subagents can run in parallel, each being its own conversation.
- The running-now view cannot drift from what is actually running.

### Negative

- Two runs can overwrite each other's edits; concurrent git use in one working tree trips git's own
  lock files.
- One container may run several harness processes at once, so its limits may need raising.
- The view is unavailable while the site is unreachable.

### Risks

- **Coordination is left to people and agents.** If conflicting edits prove common, the answer is
  better visibility or a coordination aid people opt into, not a platform lock.

## References

- adr-0074 — a container is keyed on its boundary and its runner
- adr-0057 — the one-container-per-boundary model this ordering followed from
- adr-0077 — within a boundary, a running chat is visible; its content is not
- adr-0045 — reads cross the control channel as request and response
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)

> **Acted on.** *(annotated 2026-10-17)* By the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), for conversations whose
> record is in hq (adr-0121): their turns are ordered in hq by one turn lock with a lease, and a message sent while a
> reply runs waits in a durable queue in hq's database that survives a restart. A conversation's standing worker in a
> boundary takes one brief at a time, the rest queued in hq; runs across workers, tasks and people still run at once.
