---
created: 2026-11-09
description: The extras an agent adds to a voice conversation (listening sounds and the acknowledgement) have one switch, Adaptive voice, owned by each person and on by default. It does not touch how a turn ends or telling the person's voice from the agent's. There is no organisation setting for voice behaviour.
---

# ADR-0182: Voice Has One Setting, Each Person's Adaptive Voice

**Status:** Accepted

## Context

The first design had a model call with its own cost, so it had an organisation switch, a model choice and a model list. Once the
decision and the acknowledgement became part of the conversation model's own call (ADR-0181) the organisation has nothing to
decide: no separate model, no extra bill, no keys. What remains is a matter of taste that belongs to the person listening: some
people find listening sounds and "still working on it" annoying and want silence.

## Options considered

**An organisation switch with an automatic, shown model list.** Rejected once the call became the conversation model's own.

**A three-way choice (acknowledgement, stored phrases, nothing).** Rejected: stored phrases were only ever a fall-back, and a
person who wants no extras should have one plain switch.

**A switch that also turns off how a turn ends.** Rejected: the audio turn model and the echo handling are not extras and are not
annoying; a person who wants fewer sounds must not wait three seconds after every turn.

## Decision

**Adaptive voice is a switch each person has in their own settings, on by default.** On, the agent makes listening sounds while
they talk and opens a slow reply with an acknowledgement. Off, it says nothing until its reply starts. Telling the person's voice
from the agent's, ending a turn by the sound, and the hold when they have not finished are standard voice and are not part of it.

## What this binds

- A later voice extra that a person might find annoying belongs under this switch, not under an organisation setting.
- Undoing it means everyone hears every extra.

## Consequences

### Positive
- One switch, explained in its own (i), and nothing for an administrator to understand.

### Negative
- An organisation cannot turn the extras off for everyone.

Implemented by the voice unit (merged 9 Nov 2026): `adaptiveVoice` on each person's settings (client protocol 1.18), read by the voice turn block and by the listening family (`hq/src/conversations/voiceClient/orchestration/listening.ts`); off, no listening sound plays and the reply has no opening sentence.

## References

- adr-0181 — the conversation model decides the voice turn in its own call
