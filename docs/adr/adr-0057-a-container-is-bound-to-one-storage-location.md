---
created: 2026-09-16
description: A container belongs to one storage location for its whole life and is never rebound, so isolation is a property of placement rather than of the mount set.
---

# ADR-0057: A Container Is Bound to One Storage Location

**Status:** Superseded by adr-0074

## Context

[ADR-0049](adr-0049-the-session-is-the-container-boundary.md) keyed an agent container to an
`AgentSession`, correcting a one-container-per-agent arrangement before it. Its central argument — the
container key must be something with a lifecycle, so removal has an owner — holds. What it did not ask
is what the container is protecting.

Two facts make that question live. A container's reach is assembled from the *agent's* memberships, so
one container reaches storage belonging to several owners, and its reach widens whenever the agent
joins a project. And a session is a finer key than isolation needs: two sessions of the same person
against the same files are two containers with identical protection.

Isolation therefore depends on the mount-assembly code being right on every run, rather than on a
property of where the work was placed.

## Options considered

- **Keep the session as the key and narrow the mount set.** Remove the membership-derived mounts and
  leave everything else. Rejected: it fixes today's over-reach without changing what isolation rests
  on, so the next mount added quietly widens it again.
- **Key the container on the agent and the owner together.** Keeps an agent's materials separate per
  owner. Rejected: it multiplies containers by agents for no security gain, since the agent is not
  what is being protected.
- **Key on the storage location and the person.** One container per person per boundary. Rejected
  here and kept available: it ends residue between people's runs, at the cost of containers scaling
  with active members. Nothing in the product needs it yet, and the option remains open because it
  keys on a class rather than on an individual.

## Decision

**A container belongs to one storage location — one person's, or one project's — for its entire
life, and is never rebound to another owner.** A container that has served one owner is destroyed
rather than remounted for another.

**A run reaches exactly one owner's storage.** Mounts derived from an agent's memberships are removed,
and nothing scoped to an agent is mounted at all.

## What this binds

The mount set, the container name and lifecycle, and the idle sweep all key on the storage location.
Anything an agent needs during a run arrives some other way than a mount, which is what forces an
agent's identity, its memory of a person and its credentials to live outside the container's binds.

Undoing it means returning isolation to the mount-assembly code and re-admitting cross-owner reach in
a single run.

## Consequences

### Positive

- Cross-owner contamination is prevented by construction, not by assembling the right mounts.
- Container count scales with active storage locations rather than with conversations.
- Changing agent mid-conversation costs a package load rather than a container lifecycle.

### Negative

- Work that today reads across two owners in one turn becomes two runs.
- Several runs may share one container, so its memory and process limits must be sized for more than
  one.

### Risks

- **A longer-lived blast radius.** A compromised container reaches one owner's full working set and
  lives as long as that owner is active — narrower in ownership than before, wider in time.
- **Residue between runs.** One run leaves files in the writable layer and temporary directories that
  the next run in the same container can read. Storage isolation holds; hygiene between runs does not,
  and needs a defined reset. Accepted here as a known exposure rather than queued, because the reset
  belongs to the build that implements this.

  *(Resolved 2026-09-19 by that build.* The reset turned out to need more than files: a process an agent
  backgrounds — a dev server, a watcher — is reparented and outlives the run that started it, so clearing
  its sockets and caches while it ran would have left the next turn meeting a server that reports itself
  alive and answers wrongly. The reset therefore terminates what the ended run left running, then clears
  the scratch, and does both only once no run is active in that container.*)*

## References

- [ADR-0049](adr-0049-the-session-is-the-container-boundary.md) — superseded by this record; its
  lifecycle argument, its labels-not-names rule and its mandatory idle teardown all stand
- [ADR-0056](adr-0056-a-run-is-placed-on-the-site-holding-its-storage.md) — where the container is
- [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) — the one agent-scoped mount this
  rules out
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.1 — the design this is cut from
