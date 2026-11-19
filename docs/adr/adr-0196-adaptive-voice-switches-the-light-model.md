---
created: 2026-11-17
description: Each person's Adaptive voice switch turns the light model on or off. On, the light model listens and may hum, acknowledge, close a turn or hand over with a hold. Off is plain voice — the sound model ends the turn, nothing is said until the reply, and there is no hold. Still no organisation setting. Supersedes ADR-0182.
---

# ADR-0196: Adaptive Voice Switches the Light Model

**Date:** 2026-11-17
**Status:** Accepted

## Context

ADR-0182 gave each person one switch, Adaptive voice, for the extras the conversation model added to a voice turn: listening
sounds and an acknowledgement. It kept the hold (waiting when the person had not finished) as standard voice. With a light
model listening (ADR-0195) the extras, the hold and the decision to call the conversation model all come from that model, so
what the switch controls has to be said again.

## Options considered

- **The switch keeps covering only the sounds and the acknowledgement**, with the light model always running. Rejected: a
  person who wants a plain voice would still pay for the light model's calls and its judgement of their turn.
- **Off keeps the hold** (waiting on a "not yet" reading). Rejected: a hold needs a reading of the words, which is the light
  model; off would then still run it.
- **An organisation setting.** Rejected for the reason ADR-0182 gave: it is a matter of taste for the person listening.
- **The switch is the light model (chosen).**

## Decision

**Adaptive voice, each person's own switch and on by default, turns the light model on or off.** On, voice works as
ADR-0195 says. Off is plain voice: the sound model ends the turn, the message goes straight to the conversation model,
nothing is said until the reply, and nothing holds a turn open. Telling the person's voice from the agent's stays standard.
When no light model is available the voice behaves as if the switch were off.

## What this binds

- Every voice behaviour that depends on reading the words while they are spoken belongs under this switch.
- Voice with the switch off must work with no light model configured.
- Undoing it means deciding again which extras run when a person wants a plain voice.

## Consequences

### Positive
- One switch, one meaning: whether a second model listens.

### Negative
- Off loses the hold, so a person who pauses mid-thought with the switch off may be answered early.

## References

- adr-0182 — superseded by this record
- adr-0195 — a light model listens while the person speaks and gates the conversation model
