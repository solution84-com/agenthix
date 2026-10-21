---
created: 2026-09-16
description: What an agent remembers about a person is held by hq in two layers — shared by every agent, or private to one — and never as a mount on a site.
---

# ADR-0058: Memory of a Person Is Held by hq, in Two Layers

**Status:** Accepted

## Context

[ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) partitioned an agent's memory of a
person so that one person's context is not visible to another, and realised it as a directory mounted
into person-invoked chat runs. The partitioning was right. Its mechanism cannot survive
[ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md), under which nothing scoped to an
agent is mounted.

Relocating the partition to a site's disk does not work either. A person's storage and a project's
storage may sit on different sites, and protected data does not move between them, so memory kept on
one site is unreadable from work done on another — an agent would remember a person in one place and
not in another, which is the same agent behaving as though it were two.

A second problem sits alongside it: a person tells one agent how they like to work, and every other
agent has to be told again.

## Options considered

- **Keep memory per boundary, on the boundary's own disk.** Simple, and consistent with where files
  live. Rejected: the agent's recollection then depends on where the work happens, which is the
  fragmentation described above.
- **One memory per person, shared by every agent.** Ends repetition outright. Rejected: an agent
  would accumulate everything a person has ever told any agent, which is the concentration ADR-0048
  partitioned against.
- **Memory that travels between sites.** Rejected: two writable copies needing reconciliation, which
  is the second master this architecture refuses everywhere.

## Decision

> ⚠️ **Superseded by adr-0122 — the two layers, promotion, and delivering memory whole.** *(annotated 2026-10-17)*
> Memory is now three scopes — the person's, an agent's about the person, and an agent's about a place — recalled by
> meaning when a turn needs it, with only pinned items delivered unasked; an agent may write into the person's own
> scope, and a run nobody commissioned reads its agent's memory of the place. **What still stands:** memory is held by
> hq and never on a site; no agent reads another agent's memory of a person; the person can read and change what is
> held about them; knowledge stays on the disk of the place that owns it.

**What an agent knows about a person is held by hq, not on any site**, and in two layers:

- **Global memory** — about the person, read by every agent they invoke, in any boundary. The person
  owns and curates it.
- **Agent memory** — about the person, read by that one agent, in any boundary. One partition per
  person and agent, written by that agent as it works.

> ⚠️ **"Written by that agent" overstates it.** *(annotated 2026-09-26)* Both layers are the person's
> memory throughout; "agent memory" names only its scope — the person's memory, kept for that one agent
> and reachable by no other agent. The person adds, edits and deletes in either layer and promotes
> an item out of an agent's layer, and an agent can add to and forget from only its own layer; each
> item records whether the agent or the person wrote it. The decision itself stands.

**An agent never receives another agent's partition.** Crossing happens only by **promotion**: the
person moving something out of an agent's memory into global memory. Both layers ride in the dispatch
context and are written back through hq, so a site holds neither.

A run nobody invoked — a task, a heartbeat — receives neither layer.

**Knowledge is a different thing and is unaffected.** A file tree about a domain stays on the disk of
the boundary that owns it.

## What this binds

Memory stops being a filesystem concern. Prompt building reads it from the run's context rather than
from a path; an agent records what it learns through a call to hq rather than a file write; and
partitions key on the agent's id, so renaming an agent does not lose them. Deleting an agent removes
its partitions, since nothing else can read them.

Undoing it means finding a site-side home for person-scoped memory and accepting either fragmentation
across boundaries or a second writable copy.

## Consequences

### Positive

- An agent's memory of a person is the same wherever it works.
- A person can read and edit what is held about them, which is the only real defence against a
  memory that has drifted out of step with who they are.
- A fact said once can be made available to every agent, deliberately.

### Negative

- hq gains a responsibility it did not have: storing what agents remember about people.
- Every run that learns something writes back to hq.

### Risks

- **Promotion has to be obvious or it will not be used**, and unused promotion returns the repetition
  this record set out to remove. Accepted: the alternative — sharing by default — reintroduces the
  concentration ADR-0048 refused.

## References

- [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) — superseded by this record; its
  partitioning holds and its mount does not
- [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) — why the mount cannot remain
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.1 — the design this is cut from
