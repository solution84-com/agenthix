---
created: 2026-11-12
description: A memory always belongs to one person and is saved by an agent for itself and the place it works in; only the person widens it, by promoting it, or forgets it. A memory is a Fact or a Rule, and a Rule found by meaning is weighted up. Supersedes ADR-0122's three scopes and pinned items.
---

# ADR-0188: Memory Is a Person's, Saved by an Agent Where It Works

**Date:** 2026-11-12
**Status:** Accepted

## Context

ADR-0122 holds memory in three scopes: the person's own, read by every agent; an agent's about the person; and an
agent's about a place, with no person, read by everyone working there and curated by the place's admins. An agent
chose the scope when it saved, so it had to judge what was "general". People could add, edit and pin memories, and a
pinned memory went into every turn. In use, a person could not find what had been saved, the scope names were hard
to tell apart, and a rule such as "use a table when comparing options" was missed whenever the person's words did
not sound like it.

## Options considered

**Keep three scopes and let the agent choose.** Rejected: the agent cannot know whether something holds for every
agent or every place, and agents stop feeling distinct when everything they learn is shared.

**Free tags in place of a scope.** Rejected: a tag cannot decide where a memory is recalled; who and where must be part
of the memory, checked before the meaning search.

**Several agents and places per memory now.** Rejected for now: only a person editing by hand would pick several, and
sets cost two linked tables, harder uniqueness and a membership query. Kept reachable: the scope is passed as an
object, so widening it is additive.

**Put rules in every turn** (pinned, "always", or a list of triggers). Rejected: the cost grows with every rule a
person has, on every turn.

**Make the agent declare its intent before every turn and search with it.** Rejected: one more model call on every
turn.

**Let people write and edit memories.** Rejected: a memory is what an agent took from working with the person, in its
own words; instructions are where a person writes what an agent should know.

## Decision

**A memory always belongs to one person, optionally to one agent, and optionally to one place.** An agent always saves
for the person, itself and the place it works in; `remember` takes no scope. **Only the person widens a memory, by
promoting it** to every agent, everywhere, or both, **or forgets it.** Nobody adds or edits a memory by hand.

**Recall checks the scope before the meaning search**: the person must match, and an agent or place the memory names
must match the turn's. A memory with no person does not exist; what an agent learns about a place goes into that
place's Knowledge.

**A memory is a Fact or a Rule.** Once meaning has found a Rule, it is weighted: a Rule that reaches the hint tier is
included in full, and Rules come first within a tier, under the same caps. A newer Rule replaces an older one; a Fact
is joined onto it. Nothing is carried into every turn: no pinned items.

## What this binds

- Every memory names a person, and the agent that saved it; nothing reads or writes a memory with no person.
- No caller chooses a memory's scope when saving; hq sets it from the turn or run.
- Recall's only weight beyond meaning and warmth is the kind; no memory is present in every turn.
- The person promotes and forgets; no screen or tool lets a person write or edit a memory's words.
- ADR-0122's other decisions stand: memory stays in hq, is recalled by meaning by one local model, before each turn
  and when the agent asks, for the person the work is for.

Undoing it means bringing back a memory with no person, or a scope the agent chooses.

## Consequences

### Positive
- Each agent keeps its own memory of a person, and nothing said in one place reaches another unless the person chose
  that.
- A rule is followed when its situation comes up, at no cost on turns where it does not.
- One screen shows everything, with the scope in plain words.

### Negative
- What Kernel learns in one place is unknown to Kernel elsewhere, and to other agents, until it is promoted.
- Facts about a place are found by their words until Knowledge search works by meaning.

### Risks
- **A rule that only comes up mid-work, after the turn's search, can be missed.** A model check measures how often;
  its number decides whether more is needed.

## Related

- [ADR-0122](adr-0122-memory-is-recalled-by-meaning-in-three-scopes.md): its three scopes and pinned items are
  superseded by this record; the rest stands.
- [ADR-0058](adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md): the person can still read what is held and
  forget it, but no longer change its words.
