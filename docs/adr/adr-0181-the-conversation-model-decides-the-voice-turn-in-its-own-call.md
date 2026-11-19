---
created: 2026-11-09
description: In a voice conversation the agent's own conversation model, in the call that answers, decides whether the person has finished (by calling a keep_listening tool when they have not) and opens a reply that will need real work with a short acknowledgement. No separate fast model writes it, and there is no organisation setting or model choice for it.
---

# ADR-0181: The Conversation Model Decides the Voice Turn in Its Own Call

**Status:** Superseded by adr-0195

## Context

Two jobs sit in the gap after a person stops speaking: whether they have finished their thought, and what to say if the reply
will take a while (ADR-0178, ADR-0179). The first design gave both to a separate small, fast model, called in front of or
beside the conversation model. It worked, and it was measured against the alternative of giving both to the conversation model
itself, in one streamed call, on 210 items (the synthetic sets, the owner's own recordings, and quick questions against tasks).

On the 61 thinking-aloud pauses the two reached the same accuracy (92% with Haiku in either design). The one call was about
0.3 seconds later to the first word with Haiku and DeepSeek Flash and about 0.6 with Sonnet, and a conversation of 100 turns cost
about 5% more than today, against a gate that cost less but added 0.5 to 0.8 seconds to every finished turn.

## Options considered

**A fast model beside the conversation model** (the first design). Rejected: it sees two turns where the conversation model sees
everything, it can only guess whether the reply will take work, it needs its own keys, model list and organisation setting, and it
makes a second call on every turn.

**A fast model as a gate**, so the conversation model is called only for a finished turn. Rejected: it saves a small cost on
turns that turn out unfinished and adds 0.5 to 0.8 seconds to every finished turn, with the decision still made on less context.

**One call, with a decision written in front of every reply** (a JSON line, labelled lines, tags). Rejected: the reply cannot
stream until the form is read, and every turn pays for it.

**One call, the decision a tool call** (chosen). Only the hold needs a tool, because the turn ends anyway; a finished turn is a
plain reply that streams from its first token. A tool call is data and text is speech, separated by the API itself.

## Decision

**The conversation model decides, in its own call, whether the person has finished. If not it calls a `keep_listening` tool; if
so it replies, and opens with a short acknowledgement only when the reply needs real work.** There is no separate model, no local
check or pick, no organisation setting, and no model choice: the voice follows whichever model the conversation already uses, so a
cheaper model gives a faster voice and a more capable one a more thoughtful one.

## What this binds

- Later voice work that wants a second model beside the conversation model for the decision or the acknowledgement must reopen
  this record.
- The only voice setting is each person's own (ADR-0182).

## Consequences

### Positive
- The decision and the acknowledgement are made with the whole conversation, and a finished reply streams straight away.
- One call, one set of keys, nothing for an administrator to choose or pay for separately.

### Negative
- A turn that is held costs a model call that ends at once, and every spoken turn carries about a thousand tokens more
  instruction, not cached.
- A finished turn states no judgement, so a model could answer a hesitation; measured at about 1 in 30 on an ambiguous item.

### Risks
- The conversation model is the organisation's or person's own choice, and a slower or less careful one slows or weakens the
  decision. Sonnet read 87% against Haiku's 92% in the comparison; this is accepted and watched.

Implemented by the voice unit (merged 9 Nov 2026): the voice turn block and `keep_listening` are added to the conversation model's own call for a spoken message, with no separate model, check or setting (`hq/src/conversations/lead/voiceLogic.ts`, `voiceTurnBlock.ts`, `coordinator/turn.ts`). Its measured behaviour on three models is in the unit's findings document.

## References

- adr-0178 — a spoken acknowledgement never answers the request
- adr-0179 — a reading of the words may extend a turn but never end one early
