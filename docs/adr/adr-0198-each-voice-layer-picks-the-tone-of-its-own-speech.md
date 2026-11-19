---
created: 2026-11-19
description: Each voice service picks the tone of what it says, at the moment it says it — the listening reading for each hum, the light model for each line, the conversation model for each reply (a tag removed before it is spoken, shown or stored). There is no running tone for the conversation. Calm means no steering at all, and one Tone switch makes every layer speak unsteered.
---

# ADR-0198: Each Voice Layer Picks the Tone of Its Own Speech

**Date:** 2026-11-19
**Status:** Accepted

## Context

Voice can be steered: the speech model takes a short direction ("[warm]") with the words. A first design kept one
running tone for the conversation, set from the listening reading and the person's voice and shifting by rules, which
every hum, line and reply read as it started. In use it lagged the moment (a reply spoken in the tone of an earlier
sentence), needed rules against flicker and reset that kept growing, and gave no layer a say in how its own words
sounded. A tone that included "calm" and a speed in every direction also made the voice slow and flat.

## Options considered

- **One running tone for the conversation.** Consistent across layers, but always a step behind, and its rules
  (agreement, override, reset) were the part that kept being retuned. Rejected.
- **The person's voice sets the tone directly.** Cheap, but mirrors the person (anger back at anger) and knows nothing of
  what is being said. Rejected; the voice reading is offered only as a hint.
- **Each layer picks the tone of its own speech (chosen)**, from what it knows at that moment.

## Decision

**Whenever a layer speaks, it says how.** The listening reading answers a kind and a tone for each hum; the light model
adds an optional `tone` to its answer; the conversation model starts a spoken reply with a `[tone: …]` tag, which hq
removes before the reply is spoken, shown or stored. Nothing carries over between them. **Calm is no steering at all**,
and no direction names a speed. **One Tone switch** makes every layer speak unsteered and offers no voice hint.

## What this binds

- A new kind of agent speech picks its own tone, or speaks unsteered; it never reads a shared tone.
- The reply's tag never reaches the person's screen, the record or the speech; anything that streams a reply must remove
  it, including when it arrives split.
- Undoing it means bringing back a shared tone and the rules that keep it current.

## Consequences

### Positive
- Each sound fits what that layer just heard; a layer's tone is tested with that layer.
- Turning tone off leaves the voice exactly as the speech model makes it.

### Negative
- Layers can disagree (a gentle hum, an unsteered hold, a warm reply); usually they agree because they hear the same
  words.
- The conversation model's instructions carry the tag, and a model that ignores it speaks unsteered.

### Risks
- A tone that suits one agent voice may sound wrong in another. Accepted for testing with real people; the switch lets a
  person turn it off, and their feedback decides whether tone stays.

## References

- adr-0197 — adaptive voice is three services, each with one job
