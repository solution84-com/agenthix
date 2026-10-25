---
created: 2026-10-17
description: A place's knowledge stays its files on the place's site; hq never indexes or copies it, and the lead receives a bounded excerpt searched on the site, which it may quote to the person and never forward to work in another place.
---

# ADR-0123: A Place's Knowledge Reaches the Lead Only as an Excerpt, Never Indexed in hq

**Status:** Superseded by adr-0150

## Context

A place's knowledge is files — its code, its documents and its `knowledge/` folder — on the site that holds the
place's storage. A worker in the place reads them natively. The lead runs in hq (adr-0121), outside every place, and
still needs to answer from what a place knows. Protected data does not leave the site that holds it, and one place's
content must never reach work in another.

## Options considered

**Index every place's knowledge centrally in hq**, with the same embedding model as memory. Rejected: it copies each
place's files into hq, out of the place that owns them, and keeps a second copy in step with the first.

## Decision

**Knowledge is never indexed in hq and never copied there.** The lead reaches a place's knowledge only by asking the
place's site, which searches its own files and returns a **bounded excerpt with where it came from**. The excerpt is
**not forwardable**: the lead may quote it to the person, and may not put it in a brief for work in another place.
A sleeping site makes the place's knowledge unavailable, and the lead says so.

## What this binds

- Nothing in hq stores a place's file content; a search over it runs on the site that holds it. A better search
  there — an index with the same embedding model — replaces the site's search behind the same request.
- What the lead takes from a place's knowledge stays in that conversation; another place's knowledge reaches a
  conversation only inside its worker's result summary.
- The team's `knowledge/` files are written by the team, people and agents editing files; an agent's own learnings
  about a place are memory (adr-0122).

Undoing it means a copy of every place's files in hq, kept in step and protected as the place's own.

## Consequences

### Positive
- Knowledge never leaves the place that owns it, and nothing is held twice.

### Negative
- The lead's knowledge answers depend on the place's site being reachable.
- The site's search is lexical for now, and misses what matches only by meaning.

### Risks
- A quoted excerpt that the person then pastes into work elsewhere has crossed places by their choice; that is the
  person's decision, and the platform does not carry it for them.

## References

adr-0039, adr-0121, adr-0122. The design is the unit's
[memory and knowledge](../work/2026-10-16-conversational-experience/spec/memory-and-knowledge.md) part, *Knowledge
delivery*.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phase 3, behind the `conversations` flag
> (adr-0116).

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
