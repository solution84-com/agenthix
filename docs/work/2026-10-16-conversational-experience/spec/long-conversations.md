---
name: Long conversations
description: The record keeps everything; the context is assembled to keep the provider's cache; compaction in segments the lead can expand.
created: 2026-10-16
author: leang
---

# Long conversations

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-17, the walkthrough: Summarise now returns at once and the summary is written after it.*

*Diagrams: [How a turn's context is assembled](../diagrams/context-assembly.md) and
[Compaction in segments](../diagrams/compaction.md).*

**The record keeps everything; the context is assembled.** The conversation's record in hq is complete and paged:
a thread opens on its newest messages and loads older ones on scroll. What the lead receives on a turn is assembled
by the coordinator from four parts in a fixed order — ordered by how often each changes, so that the prefix the
provider caches stays the same from one call to the next:

1. **The agent's instructions and the model policy.** Change with the agent's version.
2. **The compaction block**, once the conversation has been compacted: the ledger head, the brief of every older
   segment, and the full summary of the latest segment. Changes at a compaction and at no other time.
3. **The message window**: every message since the last compaction, verbatim, append-only.
4. **The turn block**: the memory probe's result and anything time-bound, a few hundred tokens, **appended to the
   person's message for that turn**. It is new each turn, so it sits behind the last cache point and costs its own
   size; it then stays in the window as part of that message, so nothing in front of it ever moves. A stale probe
   result from an earlier turn is small and harmless history, and the next compaction folds it away.

Nothing changes the first three parts within a turn. A turn's tool loop is many inference calls on one prefix,
and that loop is where the cache pays most.

**The ledger.** The coordinator keeps, for each conversation, what must survive any compaction: decisions taken,
approvals given, open operations with their briefs and states, obligations the lead has accepted ("create the
task once the fix lands"), and what the person asked it to keep. It is built from events — an approval, an
operation starting or finishing, a *keep this* from the person — and by the lead, through a tool, when it decides
something. It is not sent on every turn: between compactions the verbatim window already holds everything it
records. It is written as the head of the compaction block, bounded at about 1,500 tokens, with closed operations
trimmed to one line.

**Compaction in segments.** When the context passes the high mark — 70% of the model's window — the coordinator
compacts at the start of the next turn, before its first inference call, never mid-turn. It folds everything
older than the low mark — the last 30% — into one new **segment**, in one summariser call on the policy's
talking model, over the very prefix it is about to replace, which the provider's cache serves. The next compaction
is tens of turns away; between them the prefix only grows. A segment is stored in the record with its **span**
(first and last message, with timestamps), a **brief** of about fifty tokens — what the span was about and what
it settled — and a **full summary** of up to about three thousand: decisions with their reasons, names, numbers,
open threads. A segment is written once, from verbatim messages, and never summarised again; that is the
difference from a rolling summary, where each compaction summarises the previous summary and detail decays with
every pass. The compaction block is rebuilt — ledger head, older briefs, the new full summary — and a *summarised*
message goes into the record with the span, the brief and what the ledger kept. *Summarise now*, pressed by the
person, compacts at once in the same way, without making the person wait on the summariser: the request returns as
soon as there is something to fold, holding the conversation's one-turn lock until the summary is written.
*Summarising…* shows in the thread until the summarised marker arrives; a failure after that point comes back as
an event and shows as the refusal line above the message box. A refusal found before it — nothing to fold, a reply
being written — comes back on the request itself.

**Zooming in.** The lead reads the past at three levels, each one tool call apart:

| Level | Where | Call |
|---|---|---|
| Brief | In context, in the compaction block | — |
| Full summary | The record | `expand(segments)` — one, several, or all, returned in span order |
| The exact words | The record | `messages(segment, page)` — verbatim, paged |

The lead's instructions say when to zoom: when the person refers to something a brief covers, when a decision's
reason is needed, when a name or a number is uncertain; never guess at what a brief compresses. It expands
several segments when they look related, and all of them when the briefs do not locate what it needs. An
expansion is **appended as a tool result**, behind the cached prefix, never substituted into the compaction
block: replacing a brief in place would move the prefix and throw away the cache of everything behind it. The
full text stays in the window until the next compaction, where the summariser cites the segment instead of
summarising it again. *Expand all* beyond the room left in the window delivers what fits, oldest first, and names
the rest. Briefs stay bounded: fifty tokens each, a hundred compactions cost five thousand tokens; should a
conversation ever get there, the oldest briefs collapse into one line per month, still expandable by span. Not
built until a conversation needs it.

**Workers and tasks.** A harness compacts its own session as its vendor intends; the platform shows context use
and the marker. Between operations — never mid-run — a standing worker whose context has passed a high mark is
started fresh: briefs stand alone and results live in the operations, so little is lost. A task's session resumes
across runs, as today, compacted between runs; each run starts from the task's latest result and the comments
since its last run. A task changing stage does not force a fresh session: the result of each run carries the stage.

**On screen.** The summarised marker in the thread shows the span and the brief, opens to the full summary, and
from there to the messages it covers — the same three levels the lead has. When the subject drifts, the lead may
offer a new conversation for it: one line, never insisted on, because memory, not the thread, carries what the
person is like.

**Caching across providers.** Every provider's cache is a prefix cache, so one rule serves them all: the front
never moves, the end only grows. The model adapter adds each provider's hints — three cache breakpoints where a
provider wants them set, after the instructions, after the compaction block and at the last message, so that a
compaction invalidates only what follows the block and an ordinary turn only what follows the last message; a cache key
per conversation where a provider routes by one; nothing where caching is automatic. Where a provider caches
nothing, a stable prefix costs nothing. A cache's lifetime is minutes, so it pays inside a turn and within a
quick exchange; a reply after a long pause reads the prefix in full on any design. The order and the marks are
the design; the figures are re-checked when the adapter is built.

**Budgets** (defaults, tunable per organisation):

| Piece | Default | Rule |
|---|---|---|
| Brief | ≤ ~50 tokens | One line, with id and span |
| Full summary | ≤ ~3,000 tokens | Decisions with reasons, names, numbers, open threads; written once |
| Ledger head | ≤ ~1,500 tokens | Structured; closed operations one line each |
| Turn block | a few hundred tokens | Rebuilt each turn, behind the cache point |
| Marks | in at 70%, out to 30% | Of the model's window; at the start of a turn only |
| `expand` | the full summaries asked for | Appended; what does not fit is named |
| `messages` | one page, ~2,000 tokens | From the record; the result says what remains |
| Standing worker | fresh past a high mark | Between operations only |

**Options considered.**

- *One rolling summary.* Simplest, and what the first draft said. Each compaction summarises the previous summary
  again, so detail decays and nothing can be recovered short of reading the raw record. Rejected for that, and
  because, folded in small steps, it rebuilt the cache almost every turn.
- *Replace a brief with its full summary in place.* Reads naturally but moves the prefix; the same text appended
  as a tool result costs only itself.
- *Keep every full summary in context.* Grows without bound, and most of it is not needed on most turns.
- *Drop the oldest messages instead of summarising.* The same cache cost at the moment it happens, and the content
  is gone for good. A summariser call every few dozen turns is cheap next to that.
- *A provider's server-side compaction.* Opaque to the record: no segments, no briefs, no zoom; the marker and
  the ledger would still be ours to write; and it ties compaction to one vendor where the lead may run on any.
  The adapter may delegate to one later, behind the same contract, if it proves cheaper.

**What changes from today.** Today the conversation's context is the harness session's, compacted by the harness
on its own rules, and a compaction is one large summary the person cannot look inside. With direct inference the
context is the platform's to assemble; compaction becomes segments in the record, visible and expandable to the
lead and the person alike.

## Acceptance criteria

- [ ] A conversation past the high mark is compacted into a segment at the start of a turn, never within one; the
      summarised marker opens to the full summary and the messages; the lead can expand one, several or all
      segments; the context's first three parts do not change within a turn.
