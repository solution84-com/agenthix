---
created: 2026-10-17
description: Voice is a mode inside the conversation, not a screen or a model of its own — speech to text makes an ordinary message, text to speech speaks the ordinary reply — and the rules voice adds are kept in hq's record, which every client reads.
---

# ADR-0125: Voice Is a Mode of the Conversation

**Status:** Accepted

## Context

Voice on the web was a call screen of its own, with tap, hold and trigger-word modes. It hid the thread and its
approvals during a call, started a run the moment speech arrived, so the person's choice to wait or interrupt did not
apply, and restarted its whole session when the person spoke over the agent. With the conversation in hq
(adr-0121), the record, memory, tools and approvals all run on text, and voice has to fit them on the web and on a
phone alike.

## Options considered

**A call screen of its own** — what the web had. Rejected: it hides the thread and the approvals, and people expect
one pattern across their devices.

**A realtime speech-to-speech model.** The lowest latency. Rejected: it fixes the vendor and model outside the model
policy and the access tiers, while the record, memory, tools and ledger all run on text. The model adapter may take
one later for the talking model only, behind the same contract.

**Tap, hold and trigger-word modes as settings.** Rejected: four ways to do one thing; a pause is what assistants use.

**Each client keeps its own voice rules** — its quiet lines, its silence timeout. Rejected: two implementations drift.

**Store the audio.** Rejected: size and privacy, and nothing reads it; the transcript is the record.

## Decision

> ⚠️ **Superseded by adr-0139 — this section's last sentence only.** Speech providers are no longer organisation
> settings outside model choice: the resolver chooses them, per agent with the organisation's defaults, and voice's
> speaking model is fixed. Voice as a mode of the conversation, and everything else here, still stands.

**Voice is a mode of the conversation**, inside the conversation's own view. **A spoken turn is an ordinary turn:**
speech to text produces a message, admitted like a typed one under the person's wait-or-interrupt setting; the lead's
ordinary reply is spoken by text to speech as it streams. One person holds voice in a conversation at a time. **The
rules voice adds live in hq's record** — the voice lines, the silence end, what was heard before an interruption —
and every client reads them from there. Audio is never stored. Speech providers are organisation settings, outside
the model policy.

## What this binds

- Nothing spoken bypasses the conversation's admission, its turn lock, its tools or its approvals.
- A client — the web, a phone — keeps no voice rules of its own; it plays and shows what hq's record says.
- A model that takes speech in or gives it out is used, if ever, only for the talking model, behind the model adapter.
- No audio is persisted anywhere.

Undoing it means a second conversation path for voice, with its own rules on each client.

## Consequences

### Positive
- Speaking and typing are one conversation: the thread, approvals and work stay in view while voice is on.
- Every model the policy allows can talk, with any speech provider the organisation sets.

### Negative
- Latency is the sum of speech to text, the model's first sentence and text to speech; a realtime model would be faster.

### Risks
- On a device whose speakers reach its microphone, the agent's own voice can be heard as the person's; voice keeps
  its own speech out of what it listens to, and how well that holds depends on the device.

## References

adr-0121. The design is the unit's [voice](../work/2026-10-16-conversational-experience/spec/voice.md) part.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phase 5, on the web, behind the `conversations` flag
> (adr-0116); the call screen and the tap, hold and trigger-word modes are removed. Voice is not yet reliable on laptop
> speakers.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
