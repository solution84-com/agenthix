---
created: 2026-11-19
description: Adaptive voice is three services, each with one job and each able to be turned off without breaking the ones below it. Reasoning (the conversation model) writes the answer and acts on requests; Responsive (the light model) decides who speaks when and says something within a second; Backchannel makes listening sounds while the person talks, from its own reading of the words. Hums leave the light model's tools; a request to be listened to differently is the conversation model's action. Supersedes ADR-0195's `hum` tool only.
---

# ADR-0197: Adaptive Voice Is Three Services, Each With One Job

**Date:** 2026-11-19
**Status:** Accepted

## Context

ADR-0195 gave the light model six tools, one of them `hum`, so one model judged both when a turn ends and whether to make
a listening sound while the person speaks. In use the two jobs pulled against each other: the light model is asked at
sentence ends and pauses, while a listening sound needs a reading about once a second and a decision inside a breath of
under a second. A second, smaller reading took over the hums, and responsibilities then crossed: the light model
recognised "stop humming" and switched off a part it did not own, and the hums could not run without it. Testing each
part with real people needs each part to be turned off on its own.

## Options considered

- **Keep `hum` as a light-model tool (ADR-0195).** One call per moment, but a call per sentence is too slow and too
  sparse for sounds inside a breath, and every hum costs a light-model decision. Rejected.
- **One listening module that owns hums, turn-taking and tone together.** Fewer seams, but none of it can be switched
  off, tested or replaced alone, and a fault in one part takes the rest with it. Rejected.
- **Three services, each with one job, layered (chosen).** Reasoning at the bottom is always on and alone is plain voice;
  Responsive above it; Backchannel above both. A layer may use those below it, never one above.

## Decision

**Adaptive voice is three services.**

- **Reasoning**, the conversation model: the answer, folding later words into it, the recap, and acting on what the
  person asks, including how they want to be listened to (`set_listening_style`).
- **Responsive**, the light model: who speaks when, a line within a second, and the wait before a turn counts as
  finished. It answers with five actions; it no longer hums or changes the listening style.
- **Backchannel**: listening sounds while the person talks, from its own reading of the words, timed to their breaths.
  It never speaks over the person or over a line, and never after the turn is handed over.

Turning a service off leaves the ones below it working. Each person's Adaptive voice remains the light model's switch
(ADR-0196) and is the parent of the Backchannel's switch (Hums) and the Tone switch.

## What this binds

- New voice behaviour belongs to exactly one service; one that needs another's decision takes it as an input and never
  decides it.
- The light model's tools never include a listening sound or a change of listening style; putting either back reopens
  this record.
- Reasoning works with the other two off; Responsive works with the Backchannel off.
- Undoing it means merging the services' decisions back into one model call and losing the per-service switches.

## Consequences

### Positive
- Each part can be switched off, tested and tuned alone, and a person can say which part bothered them.
- Listening sounds are timed by a reading made for them, not by the light model's schedule.

### Negative
- Two small model readings run while the person speaks instead of one.
- The services agree through a contract (who owns a pause, what wins), which is more to keep true than one model's
  judgement.

## References

- adr-0195 — its `hum` tool only is superseded by this record; the rest stands
- adr-0196 — Adaptive voice switches the light model
- adr-0198 — each layer picks the tone of its own speech
