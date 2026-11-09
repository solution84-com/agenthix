---
created: 2026-11-08
description: Inworld speech to text is the default way a voice conversation hears the person whenever it can deliver, so a hosted setup needs one voice key. AssemblyAI stays fully supported and chosen per organisation and per agent. A measured quality gap is stated plainly where the choice is made and does not remove Inworld as the default.
---

# ADR-0180: Inworld Is the Default Way to Hear, and AssemblyAI Stays Supported

**Status:** Accepted

## Context

Voice asks for two vendor accounts beyond the model provider: one to hear people (AssemblyAI) and one to speak (Inworld).
Each extra account is a place a new organisation stops. Inworld also offers speech to text, documented by Inworld as
experimental at the time of writing, so its quality against AssemblyAI is not known to be equal.

## Options considered

**AssemblyAI stays the default until Inworld is proven equal.** Rejected: it keeps two keys as the normal setup, and
nothing makes the spike's numbers the only thing that matters when one key is itself the benefit.

**Inworld only.** Rejected: an organisation that wants the better hearing, or whose languages Inworld does not cover,
needs the other.

**A free self-hosted speech service as the default.** A separate, larger question; not decided here.

## Decision

**Inworld is the default way to hear whenever it can deliver, and AssemblyAI stays fully supported.** The organisation's
and the agent's own choice of provider is unchanged and still wins. One key is preferred whatever the other measures like.

- Where Inworld measured worse, the choice says so plainly and recommends AssemblyAI for quality. It is still offered as
  the one-key way.
- Setup asks for at most one voice key.
- Only a hard failure, such as Inworld not being usable from the browser at all or failing to detect the end of a turn on
  built-in speakers, returns the default to AssemblyAI.

## What this binds

- The resolver's default for speech to text, setup and the provider screens ask for one voice key, and both providers are
  kept working. Undoing it means two keys again as the normal setup.

## Consequences

### Positive
- A hosted setup needs one voice key.
- Nothing is withheld from an organisation that prefers AssemblyAI.

### Negative
- Two hearing providers are kept working and tested.
- An organisation that does not read the note may hear worse than it would with AssemblyAI.

### Risks
- Inworld's speech to text is experimental. If it is withdrawn or changes, the default returns to AssemblyAI and this
  record is superseded.

Implemented by the voice unit (merged 9 Nov 2026): one Inworld key serves hearing, speaking and dictation (`core/src/providers/providers.ts`); the browser streams to the provider with a short-lived single-use token hq mints (`hq/src/voice/speechMint.ts`, `speechTokenAction.ts`), AssemblyAI is the fall-over (`hq/src/conversations/voiceClient/stt/`), and speaking still goes through hq. The mobile app still hears through AssemblyAI only.

## References

- adr-0139 — one resolver chooses every model and voice call
- adr-0160 — setup defines the organisation first, and AI may come later
