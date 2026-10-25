---
created: 2026-10-25
description: A conversation reaches its own place, the organisation's knowledge and the platform guide, and any other place only once its person has added it, by a deliberate act they can see and undo; the lead can ask for a place but never add one, and access is re-checked every turn.
---

# ADR-0152: A Conversation Reaches Only Its Own Place and the Places Its Person Added

**Date:** 2026-10-25
**Status:** Accepted

## Context

A conversation belongs to one place (adr-0096), but its lead could search knowledge and start work in any place its
person could reach. Whatever the lead learns in one place can then go into a brief for another: one project's
knowledge reaching another project's work, without anyone choosing it. A person with access to many projects had a
conversation whose reach was all of them.

## Options considered

- **Mark another place's knowledge not forwardable, and check every brief against what the conversation was shown.**
  Rejected: it needs a record of every search, read and report, and still cannot catch the same idea in other words.
- **Keep a worker's report from another place out of the conversation's context.** Rejected for now: it stops the lead
  answering from what it found; kept as the simple form if places ever need keeping apart within one conversation.
- **Accept every place the person can reach.** Rejected: the platform, not the person, would be choosing how far a
  conversation reaches.
- **The person adds other places to a conversation, as Claude Code adds directories (chosen).**

## Decision

1. **A conversation reaches its own place, the organisation's knowledge and the platform guide.** Any other place is
   added by its person, in the conversation, with a notice that what the conversation finds can reach its other places.
2. **The lead's knowledge tools and its starting of work reach only the conversation's places,** and the lead is told
   those places on every turn, so it knows what it can reach and what it must ask for. A worker or a task run still
   reaches its one place (adr-0060).
3. **The lead can ask for a place but never add one:** it shows the person a card, and only their click adds it.
4. **Access is checked when a place is added and on every turn;** a place the person can no longer reach drops out.

Within a conversation's places, carrying knowledge from one to another is the person's choice, and there is no check on
briefs.

## What this binds

- Every path by which the lead reaches a place — knowledge, starting work, anything added later — takes the
  conversation's places as its bound.
- Nothing lets an agent widen a conversation's reach.

Undoing it returns the reach of every conversation to every place its person can reach.

## Consequences

### Positive

- The person sets how far a conversation reaches, sees it in the conversation, and can undo it.

### Negative

- A person working across projects adds them first; the lead's card asks them to.

### Risks

- **A misled agent may carry one place's knowledge into another of the conversation's places, unasked.** Accepted:
  the person put those places together, and every brief shows in the conversation. If a case shows that is not enough,
  the structural form above is the next step.

## References

- adr-0096 — a conversation belongs to a place: it still belongs to one; this record bounds what else it reaches.
- adr-0060, adr-0101 — a run's authority is its boundary's, bounded by its person.
- adr-0082 — a conversation acts with its current turn's authority.
- adr-0150 — agents reach knowledge only through tools shaped like the native ones.

## Implementation notes

Built by the agent knowledge unit and merged with it (2026-10-26): a conversation's places are kept with it, added only by its person (`suggest_place` shows a card), checked every turn, and told to the lead every turn; `start_work` and the lead's knowledge tools reach only them. How it fits together: [`docs/concepts/projects/places.md`](../concepts/projects/places.md).
