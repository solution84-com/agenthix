---
created: 2026-11-17
description: Voice runs on three models. A sound model in the browser ends a turn on sound; a light, fast model reads the words as they arrive and answers each time with exactly one of six tools (keep listening, hum, acknowledge, close the turn, hand over, invite); the agent's conversation model is called only when the light model hands over, or when no usable answer came in time. The light model may keep a turn open but never end one early. Supersedes ADR-0181.
---

# ADR-0195: A Light Model Listens While the Person Speaks and Gates the Conversation Model

**Date:** 2026-11-17
**Status:** Accepted

## Context

ADR-0181 put the voice turn into the conversation model's own call: it decided whether the person had finished and opened
a slow reply with an acknowledgement. In use, two things did not hold. The conversation model only saw the words after the
person stopped, so nothing could react while they spoke, and a reply that needed work left the person in silence or with an
opener the model wrote in the same breath as its answer, which kept drifting into answering ("the weather in Melbourne is…").
A small model cannot be trusted with the answer, but it is fast and cheap enough to read every sentence as it arrives.

## Options considered

- **The conversation model decides in its own call (ADR-0181, today's).** One call and the whole conversation, but nothing
  happens while the person speaks, and every turn, finished or not, pays for a call to the conversation model. Rejected.
- **A fast model as a gate after the turn ends.** Rejected in ADR-0181 because it added 0.5 to 0.8 seconds to every finished
  turn. That objection falls away when the fast model has already read the message while it was spoken: its decision is
  ready when the sound says the turn has ended.
- **The conversation model started in parallel with the fast model**, its answer discarded if the fast model keeps
  listening. Rejected: it pays for calls that are thrown away, and the light model fills the wait, so starting early buys
  little the person notices; latency is judged from when the words appear on screen.
- **A light model that listens and gates (chosen).** It is asked at each sentence end, on going quiet mid-sentence, when
  the sound model says the turn sounds finished, and at an interval it sets itself; it answers with one tool each time.

## Decision

> ⚠️ **Superseded by adr-0197 — the `hum` tool only.** Listening sounds are the Backchannel's, from its own reading of
> the words; the light model answers with the other five tools. Everything else in this decision stands.

**Voice uses three models.** The **sound model** (the browser's voice detection and audio turn model) says when the person
has stopped and whether the turn sounds finished. The **light model**, a fast model chosen by the resolver for the purpose
`listener`, reads the message as it arrives with a short recap of the conversation and answers with exactly one of six
tools: `keep_listening`, `hum`, `acknowledge`, `close_turn`, `hand_over` or `invite`. The **heavy model**, the agent's
conversation model, is called only on `hand_over`, or as a fallback when the light model gives no usable answer in time.

- The light model's words are its own, never a template, and it answers alone only when nothing needs to be known,
  decided or done; in doubt it hands over.
- Only the sound model ends a turn. The light model may keep a turn open past it (bounded), never end one early (ADR-0179).
- What the light model says is never interrupted.
- The heavy model keeps the light model's recap current with an `update_recap` tool after its reply.

## What this binds

- The conversation model no longer judges whether a voice turn has finished and no longer opens with an acknowledgement;
  later voice work that puts either back into its call must reopen this record.
- Anything the agent says before its reply comes from the light model or the stored fallback phrases.
- The light model is a separate model call with its own resolver purpose and usage ledger value; an organisation's model
  lists apply to it.
- Undoing it means removing the listening runtime in the browser, the listening call in hq and the recap, and restoring the
  turn judgement to the conversation model.

## Consequences

### Positive
- The agent can react while the person speaks, and a turn that needs no work (a thanks, a stop) is closed without calling
  the conversation model.
- The wait for a slow reply is covered by the light model's own words, written for that message.

### Negative
- A second model and many small calls per turn: about one per sentence, plus checks while the person is quiet.
- The light model reads the conversation through a recap, so it knows less than the conversation model.

### Risks
- A small model may still answer when it should hand over. Accepted on the condition that measurement shows it rare; its
  `answer` is kept only for testing, and a design change follows if it is not rare.

## References

- adr-0181 — superseded by this record
- adr-0179 — a reading of the words may extend a turn but never end one early
- adr-0178 — a spoken acknowledgement never answers the request
- adr-0196 — Adaptive voice switches the light model
