---
created: 2026-10-17
description: A conversation's record is held by hq and its turns are direct model inference in hq, behind one model adapter; a harness runs only the work a conversation commissions, and the site keeps that work's runs.
---

# ADR-0121: A Conversation's Record Is in hq, and Its Lead Is Direct Inference

**Status:** Accepted

## Context

A conversation was a harness session on a site: every reply was a harness run, started in a container, and the
transcript lived in the site's database and the harness's own files. A reply waited on the harness's start and its
tool loop, a conversation could not be read while its site was asleep, and nothing could talk while work was under
way, because the thing that talked was the thing that worked. A person should get an answer at the speed of a
conversation while the agent commissions and receives work that takes longer.

## Options considered

**Keep the conversation a harness session.** Rejected: every reply pays for a harness start and loop, the
conversation's context is the harness's to assemble and compact, and the agent cannot talk while it works.

**Keep the record on the site and run the lead in hq.** Rejected: drawing the screen would need a round trip to a
site that may be asleep, and the lead's context would be read across the channel on every turn.

**A harness turn as a further tier of access, so a Claude subscription can pay for a conversation.** Rejected: it
routes one tier of conversation through a harness to reach one vendor's plan, and that tier would behave unlike
every other.

**Copy each existing transcript into hq.** Rejected: an import over the channel from sites that may be asleep, for
threads people rarely return to. Conversations from before stay readable where they are, read-only, with a way to
continue in a new conversation.

## Decision

**hq holds the conversation; the site holds the work.** A conversation's messages, turns, operations and
compaction segments are rows in hq's database, message text encrypted at rest with hq's data key. A run, its
transcript and its tool calls stay on the site; a run's detail is fetched only when someone opens it.

**The lead is direct inference in hq.** Each turn calls a model through one model adapter in hq — the only place
that names a provider's SDK — and calls hq's own tools in process. **A harness (Claude Code, OpenCode) runs only
the work a conversation commissions**, as a worker in a boundary; it is never the conversation.

## What this binds

- The conversation's screen is drawn from hq's database, with no request to a site; a conversation stays readable,
  and can take a message, while its site is offline.
- No provider's name or SDK is used for a conversation outside the model adapter.
- A harness session is never a conversation's record and is never shown as one.
- Decisions about a harness's process and lifetime (adr-0081, adr-0083) apply to workers, not to the lead.

Undoing it means a harness in every reply again, or a record split between hq and a site that must be in step.

## Consequences

### Positive
- A reply starts without a harness start; the agent can talk while its work runs.
- One context hq assembles and caches, for every agent and every provider.

### Negative
- hq now stores what people say to agents, and every turn's model call is hq's.
- A person whose only model access is a Claude subscription needs an API key for the conversation itself; the
  subscription still serves their work on a site.

### Risks
- hq's database holds conversation text; its protection rests on hq's data key, which a backup carries sealed
  (adr-0112).

## References

adr-0042, adr-0073, adr-0076, adr-0078, adr-0081, adr-0083, adr-0112. The design is the unit's
[spec](../work/2026-10-16-conversational-experience/spec.md), *Where a conversation's record lives*.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phase 1, behind the `conversations` flag
> (adr-0116), and verified by the owner's walkthrough.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit: the new conversations are always on, and
> chats from before are no longer listed or opened.
