---
created: 2026-10-17
description: hq compacts a long conversation in its own code, at the start of a turn, into segments each written once from the verbatim messages, with a ledger of what must never be lost; the lead and the person can open any segment down to the exact words.
---

# ADR-0124: A Long Conversation Is Compacted Into Segments Written Once, With a Ledger

**Status:** Accepted

## Context

With the lead in hq (adr-0121), a conversation's context is hq's to assemble, and a long conversation outgrows any
model's window. Before, the harness compacted its own session on its own rules, into one summary nobody could look
inside. Whatever replaces it must keep what the conversation settled, let the agent and the person recover detail,
and keep the provider's prompt cache, which holds only while the front of the context does not move.

## Options considered

**One rolling summary**, each compaction summarising the last. Rejected: detail decays with every pass and nothing can
be recovered short of the raw record; folded in small steps, it also rebuilt the cache almost every turn.

**Drop the oldest messages.** Rejected: the same cache cost when it happens, and the content is gone for good.

**Keep every full summary in context.** Rejected: it grows without bound, for text most turns do not need.

**A provider's server-side compaction.** Rejected: opaque to the record, with no segments or zoom, and it ties
compaction to one vendor where the lead may run on any. The model adapter may delegate to one later, behind the same
contract, if it proves cheaper.

## Decision

**hq compacts a conversation in its own code, into segments.** Past a high mark of the model's window, at the start of
a turn and never within one, the oldest messages fold into one new **segment** — a short brief and a full summary —
**written once from the verbatim messages and never summarised again**. A **ledger** kept by the coordinator from
events and by the lead — decisions, approvals, open operations, obligations, what the person asked to keep — heads
every compaction and survives all of them. The lead reads the past at three levels, brief, full summary and exact
words, each one tool call apart, and the person sees the same three from the thread's *summarised* marker.

## What this binds

- The record is never shortened: compaction changes what the lead is sent, never what is stored.
- The context is assembled so its front only changes at a compaction: the agent's instructions, then the compaction
  block, then the messages since, then the turn's own additions at the end. Nothing new may be inserted ahead of the
  message window.
- A segment, once written, is never rewritten; what the lead expands is appended, never put in its place.
- Anything that must survive compaction goes into the ledger.

Undoing it means a summary that decays, or a compaction whose content neither the agent nor the person can open.

## Consequences

### Positive
- Old decisions and their reasons stay recoverable, by the agent and the person alike.
- An ordinary turn reuses the cached front of the context; only a compaction rebuilds it.

### Negative
- One summariser call per compaction, on the conversation's talking model.
- Briefs accumulate in context, one line per compaction.

### Risks
- A summary that drops something the ledger did not hold is recoverable only by the lead choosing to zoom in.

## References

adr-0121. The design is the unit's
[long conversations](../work/2026-10-16-conversational-experience/spec/long-conversations.md) part.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phase 4, behind the `conversations` flag
> (adr-0116).

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
