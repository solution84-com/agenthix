---
created: 2026-11-08
description: Voice that stays in the conversation and needs one vendor key — hearing from Inworld as well as AssemblyAI, and the conversation model's own call deciding whether a person has finished and acknowledging a slow reply, in place of repeated stored phrases.
---

# Voice that stays in the conversation

An **initiative**, run before the first early-access release is cut. After long voice conversations the agent feels
disconnected from what was said, and its stored filler and listening phrases repeat. Voice also asks for two vendor
accounts beyond the model provider, one to hear and one to speak, which is the point where a new organisation most
often stops.

**It covers:**

- **One voice key:** Inworld to hear people as well as to speak, the default whenever it can deliver, with AssemblyAI
  still supported, so a hosted setup needs one voice key.
- **No repeated stored phrases:** the agent's own model, in the call that answers, judges whether the person has
  finished their thought (and says nothing if they have not), and opens a reply that will take a while with a short
  sentence that fits what was said. The stored wait phrases are only a fall-back; active listening and encouragement become one listening family of far more stored clips, played
  at an irregular rhythm.
- **The first spoken word sooner**, and one turn for one spoken message
  ([#28](https://github.com/solution84-com/agenthix/issues/28)).
- **A measured, recorded result:** the same recordings and checks before and after.

**It holds** [`spec.md`](spec.md) (what is there today, the design the owner decided on 8 and 9 Nov 2026, and how it is
measured) and [`plan.md`](plan.md) (the phases). Until the owner has read the amended spec, nothing is built.

**It follows** [adaptive voice](../2026-10-19-adaptive-voice/spec.md), which designed and built turn-taking, the
floor, speech recognition and the stored phrases, and whose benchmark of a short model call this unit reuses.
