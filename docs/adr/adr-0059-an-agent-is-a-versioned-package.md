---
created: 2026-09-16
description: An agent is an immutable versioned package held by hq, carrying what a run reads and the settings that shape how it behaves.
---

# ADR-0059: An Agent Is a Versioned Package

**Status:** Superseded by adr-0072

## Context

An agent's material is files on one site's disk — its profile, its responsibilities, its heartbeat
instructions and its skills — written there directly by hq. An agent working for a person or a project
on another site cannot reach any of it, and
[ADR-0056](adr-0056-a-run-is-placed-on-the-site-holding-its-storage.md) places runs by data, so that
case is now ordinary rather than exceptional.

The same files are also agent-scoped, and
[ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) mounts nothing agent-scoped. So
whatever an agent brings to a run has to arrive some other way.

A related weakness: hq's own record of an agent — its model, its tool ceiling, its autonomy — is
rewritten into the frontmatter of a file on a site, so the same facts exist in two places and are kept
in step by a synchronising write.

## Options considered

- **Files only, settings stay live in hq.** A version carries instructions and skills; how the agent
  is allowed to behave is whatever hq currently says. Rejected: a run that names a version but not the
  model and tools it ran under reproduces nothing, and rollback restores text without restoring
  behaviour.
- **Replicate the agent's directory to every site.** Rejected: an agent writes its own material
  today, so replicas would need reconciling — a second master, which is what
  [ADR-0047](adr-0047-where-a-run-may-execute.md) refused pinning to avoid.
- **Fetch from the agent's home site at run time.** Rejected: a site never accepts an inbound
  connection, so one site cannot serve another.

## Decision

**An agent is an immutable, versioned package held by hq**, carrying what a run reads — its
instructions, its heartbeat instructions and its skills — **and the settings that shape how it
behaves**: model, runtime, tool ceiling, autonomy and heartbeat interval. A site fetches a version it
does not hold and caches it. Changing any of that publishes a new version.

**hq's record of the agent keeps what identifies it** — id, handle, name, role, avatar, voice,
assignments — and none of that publishes a version.

**Nothing in a package changes during a run.** What an agent writes goes elsewhere.

**A package's format is versioned by [ADR-0046](adr-0046-protocol-compatibility-between-hq-and-sites.md)'s
rule**: inside a major it changes only by addition, so hq and a site upgrade independently within one.

> **Renamed since: autonomy is now approval, and the tool ceiling is the agent's permissions.** *(annotated
> 2026-10-09)* The settings this record names are today an agent's **approval** (bypassed, deferred or
> immediate) and its **permissions**. The record stays superseded by adr-0072.

## What this binds

Every run records the exact version it used. A boundary may override a package, and an override
narrows what the package allows and never widens it. Skills are namespaced by source, so an override
adds rather than silently replacing. An agent authoring a skill for itself publishes a version rather
than writing a file. Renaming an agent moves nothing, because the package keys on its id.

Undoing this means returning an agent's material to a site's disk and losing the ability to say which
agent ran.

## Consequences

### Positive

- A run is reproducible: the version states what the agent read and how it was allowed to behave.
- An agent works on any site, without its material being copied to all of them.
- One duplicated set of facts disappears with the frontmatter that carried it.

### Negative

- Changing a setting becomes an act of publishing rather than editing a field.
- hq becomes a registry of packages, which is a new responsibility.

### Risks

- **Version proliferation.** Every settings change mints a version, so the history may grow faster
  than it is useful. Accepted: the alternative is unversioned behaviour, which is what makes a run
  irreproducible.

## References

- [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) — why nothing agent-scoped is
  mounted
- [ADR-0046](adr-0046-protocol-compatibility-between-hq-and-sites.md) — the compatibility rule the
  package format follows
- [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) and
  [ADR-0058](adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md) — where an agent's memory
  goes instead
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.2 — the design this is cut from
