---
created: 2026-10-19
description: The initiative that designs voice's architecture properly — how a person and an agent take turns, hear each other and stay in step in real time — then builds it as far as time allows before launch, and ends by making voice work on a laptop's speakers.
---

# Adaptive voice

An **initiative** that starts as a design and architecture session. Voice is built, as a mode of the conversation
([its part of the conversational experience's spec](../2026-10-16-conversational-experience/spec/voice.md)), but it
is not reliable on a laptop's built-in speakers, and
each fix so far has been a patch on one symptom. This unit designs it as a whole instead.

**The design covers:**

- **Hearing the person**: the device's audio, echo, noise and other voices, adapting to the room rather than to a
  fixed threshold.
- **Streaming speech recognition**: interim and final words, timestamped, never falling further behind the longer
  it streams.
- **Taking turns**: a pause is a checkpoint, not a timer. A thinking pause keeps the floor, a finished question
  is answered promptly, and the decision is made by something small and fast, not the agent's model.
- **The floor**: the person speaking over the agent stops it at once, a brief "mm-hm" does not, and an agent asks
  for attention instead of interrupting.
- **Staying in step**: capture, the turn decision and the reply run as separate loops with bounded buffers,
  cancellation and recovery, so a slow speech or model service never builds a backlog.
- **What is measured**, for every choice: lag, false turn ends, missed interruptions, and how fast cutting in stops
  the agent.

**Then, in order:**

1. **The design**, 5 days.
2. **The design built, as far as time allows** before launch. A stretch: taken only if everything else for launch is
   on track, and launch never waits for it. How much is built is the owner's call once the design is reviewed.
3. **Voice works on a laptop**, 2 days, the last step, and the one launch waits for: whatever the build left is
   fixed, or the laptop alone if the build was not taken. For several minutes on built-in speakers, the person's
   words appear within about 1–2 s and the lag does not grow, the agent's own voice never becomes the person's
   words, and speaking over the agent stops it within about a second.

**It will hold** `spec.md`, then `plan.md` once the design is approved.
