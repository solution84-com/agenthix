---
created: 2026-09-16
description: A run executes on the Execution Site holding the storage it is for, rather than on the site its agent is pinned to.
---

# ADR-0056: A Run Is Placed on the Site Holding Its Storage

**Status:** Accepted

## Context

An org may register several Execution Sites, and a person, a project and an agent need not have their
material on the same one. Something has to decide where a given run executes.

[ADR-0047](adr-0047-where-a-run-may-execute.md) answered it by pinning: an agent belongs to one site,
and work that would cross sites is refused when it is assigned. It accepted the cost explicitly —
an agent is no longer interchangeable across sites — because an agent *writes* its own storage, so a
copy of it elsewhere would be a second master needing reconciliation.

That reasoning is sound and its premise no longer holds. An agent has become an immutable versioned
package with no downstream writer ([ADR-0059](adr-0059-an-agent-is-a-versioned-package.md)), so a copy
of it on another site is not a second master. Meanwhile protected data — a person's files, a project's
files — cannot move between sites at all, which makes the direction of travel obvious.

## Options considered

- **Keep pinning to the agent's site.** Placement stays a property of the agent, and work crossing
  sites is refused at assignment. Rejected: it refuses work that is otherwise perfectly valid, and it
  survives only while an agent has its own writable storage, which it no longer does.
- **Move the data to the execution.** Copy what a run needs to wherever the agent is pinned.
  Rejected: it puts a second copy of protected data on a machine that is not its home, which is the
  outcome the storage model exists to prevent.
- **Let the person choose the site.** Placement as an explicit choice at session creation. Rejected:
  it asks someone to answer a question the system can answer, and a wrong answer is a run that cannot
  reach its own files.

## Decision

**A run executes on the site holding its primary storage.** The site follows from the location the
work is for, and is shown as a property of that location rather than asked as a separate question.

An agent package travels to the site where the run is placed. Protected data does not travel.

## What this binds

Session creation, dispatch and every placement decision resolve the site from the run's storage
location, not from the agent. ADR-0047's selection rule — choosing an agent narrows the available
locations to that agent's site — is inverted: choosing a location decides the site, and any agent may
run there.

Undoing this means restoring per-agent pinning and refusing cross-site assignment again, which would
also require agents to regain writable storage of their own.

## Consequences

### Positive

- Work is never refused because an agent and a project are on different machines.
- A person accumulates storage only where they deliberately create it, rather than acquiring a files
  home on every site whose agents they use.
- Placement becomes checkable against one fact — where the data is.

### Negative

- Where the package has not been fetched before, a run's first execution on a site waits for it.

### Risks

- A site holding a project's storage becomes a single point of failure for that project's runs. This
  is already true of the storage itself, so it concentrates an existing dependency rather than adding
  one.

## References

- [ADR-0047](adr-0047-where-a-run-may-execute.md) — superseded by this record
- [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) — what contains the run once
  it is placed
- [ADR-0059](adr-0059-an-agent-is-a-versioned-package.md) — why a travelling agent is not a second
  master
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.1 — the design this is cut from
