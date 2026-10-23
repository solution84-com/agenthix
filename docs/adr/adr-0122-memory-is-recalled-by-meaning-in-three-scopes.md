---
created: 2026-10-17
description: Memory stays in hq as items in three scopes — the person's, an agent's about the person, an agent's about a place — embedded by one local model and recalled by meaning when a turn needs them, never delivered whole. Supersedes the two layers delivered whole in adr-0058's decision.
---

# ADR-0122: Memory Is Recalled by Meaning, in Three Scopes

**Status:** Accepted

## Context

adr-0058 kept what an agent remembers about a person in hq, in two layers — the person's, read by every agent, and
one agent's — and delivered both whole in every run's context. Cost grew with memory, and the context carried items
nobody asked for. What an agent learned about a project had no home of its own and leaked into the project's
`knowledge/` folder, mixing the team's files with the agent's learnings. With the lead in hq (adr-0121), memory can be
read on the turn that needs it rather than shipped with every run.

## Options considered

**Keep injecting every item whole** (adr-0058). Rejected: cost grows with memory, for items no one asked for.

**A title index in every turn, with text search behind it.** Rejected: dozens of titles the model must then ask about,
and lexical search misses meaning.

**Search before every turn and include what it finds.** Rejected: tokens spent on every turn, and the decision taken
from the lead. Kept as the probe that informs the lead.

**Recall on the lead's judgement alone.** Rejected: the lead cannot look for what it does not know exists. Kept as one
tier, informed by the probe.

**A provider's embedding model by default, or a separate vector database.** Rejected: a key and a vendor per
organisation and an index that splits by who paid; a second store to keep in step for thousands of rows that hq's
own database searches in milliseconds. A provider's model stays an option, re-embedding once.

**Memory on the person's site, or as files in each harness home.** Rejected: ties every conversation to a site being
awake, and puts one item in many homes where hq cannot read it and the person cannot curate it.

**Summarise whole conversations into memory automatically.** Rejected: growth with no curation.

## Decision

> *(annotated 2026-10-23)* The embedding model is always the small open model bundled with HQ: the option of a
> provider's embedding model, and the organisation key it read, are gone. The decision otherwise stands.

**Memory stays in hq, as items in three scopes:** the **person's** own, read by every agent working for them; **an
agent's about the person**, read by that agent alone; and **an agent's about a place**, read in that place only and
never carried out of it. Each item stands alone and has a key; the agent writes it with `remember`, into any scope
its reader may reach, and the scope's owner curates it on the memory screen.

**Items are recalled by meaning**, by one embedding model per organisation — a small open model bundled with hq by
default — ranked by similarity and by how often each item has been used. Before each turn a probe includes the few
items that are plainly relevant and names those that may be; **the lead decides** whether to recall more. Pinned items
are always present: in the lead's context, and as files in a worker's home at the start of its run.

**Who reads is the person the work is for**: the author of the message the turn answers, or that commissioned the
run. A run nobody commissioned reads its agent's memory of the place, and nothing of any person.

## What this binds

- No run's or turn's context carries memory whole; anything new that needs memory recalls it.
- Every reader of memory resolves the person it is for as above, and reaches only their scopes and its place's.
- What an agent learns about a project goes into the place scope, never the project's `knowledge/` files.
- One embedding model per organisation; changing it re-embeds every item.
- adr-0058's other decisions stand: memory is held by hq and never on a site; no agent reads another agent's memory
  of a person; the person can read and change what is held about them.

Undoing it means sending memory whole again, or a second store beside hq's database.

## Consequences

### Positive
- A turn carries only the memory it needs, and pinned items are always there.
- Every install embeds the same way with no key and no vendor.

### Negative
- hq carries a local model and its files, and each write embeds once.

### Risks
- **An agent may write into the person's own scope, which every agent then reads.** adr-0058 allowed crossing into the
  shared layer only by the person promoting an item; here the defences are that each item must stand alone, near
  duplicates are merged, a scheduled tidy archives what is never used, and the person curates on the memory screen.
- A probe whose thresholds are wrong includes the wrong items or misses the right ones; outcomes are recorded and the
  thresholds tuned per organisation.

## References

adr-0058 (its two layers delivered whole superseded), adr-0048, adr-0121, adr-0123. The design is the unit's
[memory and knowledge](../work/2026-10-16-conversational-experience/spec/memory-and-knowledge.md) part.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phase 3, behind the `conversations` flag
> (adr-0116). Vectors are searched exactly in hq's database; an index extension waits until an organisation outgrows
> that.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
