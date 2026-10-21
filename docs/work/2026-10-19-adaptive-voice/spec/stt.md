---
name: Adaptive voice — STT
description: Speech to text, streaming: the audio sent at the pace of speech, and timed words back, provisional then committed.
created: 2026-10-19
author: leang
---

# STT · speech to text, streaming

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.

Turns the person's audio into words, as they speak.

- Sends audio incrementally to the speech provider (AssemblyAI's streaming service today).
- Receives **timestamped** words: **interim** (provisional, may still change) and **final** (committed), with
  punctuation and corrections. Provisional and committed text are always told apart.
- **Punctuation alone never decides that a turn is complete.**
- The provider sits behind an interface, so another can replace it.
- How a stalled or lagging connection is replaced without losing words is the inbound loop of
  [the runtime](runtime.md).
