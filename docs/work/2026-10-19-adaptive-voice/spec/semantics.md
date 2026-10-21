---
name: Adaptive voice — Semantics
description: Turn-taking: a pause timer, the Smart Turn model's score, and the decision rule that turns it into READY, KEEP_LISTENING or UNCERTAIN.
created: 2026-10-19
author: leang
---

# Semantics · turn-taking

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.


Decides whether the person has finished. A turn model gives one number; our code turns it into one of three
answers. Orchestration only ever sees the answer.

1. **Pause timer** (our code). Starts when Acoustic's **silence detection** says silence: yes, and stops if it goes
   back to no. At 200 ms of silence it asks the turn model **once**, with the person's speech and those 200 ms; the
   decision rule then applies that one score at 0.5 s, 1 s and 2 s of silence. Given the growing pause as well, the
   model's score falls as the pause grows (on the owner's recordings, a finished turn from 0.96 at 0.5 s to 0.03 at
   2 s), so the pause itself is the rule's job, not the model's. The model is asked again only when the person speaks
   again. **About one second of silence is a checkpoint, not a timer**: the rule decides; silence alone does not.
2. **Turn model** (an open model, small, fast and replaceable; not the lead's model). **In:** the last few seconds of
   the person's audio, or the words so far with the agent's last turn, depending on the kind of model. **Out:** one
   number, the **confidence**: how likely it is that the person has finished their turn, from 0 (certainly still
   going) to 1 (certainly finished). It learned this from recordings labelled finished or not finished; the number
   can be wrong or overconfident, so it is calibrated on our own recordings. Candidates, benchmarked for false early
   ends, missed finished turns, latency, compute and cost; the smallest that meets the measured quality is chosen:

   | Candidate | Reads | Strength | Weakness |
   |---|---|---|---|
   | [Smart Turn](https://github.com/pipecat-ai/smart-turn), an open audio model of a few MB: the one to start with | The last few seconds of audio | Hears how it was said (falling pitch, a drawn-out "umm"); needs no words, so it answers before STT's words arrive | Does not understand meaning |
   | A text turn model, such as LiveKit's open turn detector (its licence to be checked) | The words so far and the agent's last turn | Understands meaning | Only as current as STT's words |
   | Rules, the baseline | The words and the pause | Transparent and free | A score assigned by hand, not a learned probability |
   | The speech provider's own end of turn (today) | Its own audio and words | Already there | A silence timer that cannot be inspected |

3. **Decision rule** (our code). Turns the confidence and the silence so far into **READY**, **KEEP_LISTENING** or
   **UNCERTAIN**. The longer the silence, the less confidence READY needs; values illustrative, set by measurement:

   | Silence so far | READY if confidence ≥ | KEEP_LISTENING if confidence ≤ | Otherwise |
   |---|---|---|---|
   | 0.5 s | 0.9, so a clearly finished question goes promptly | — | wait |
   | 1 s, the checkpoint | 0.8 | 0.3 | UNCERTAIN |
   | 2 s | 0.5 | 0.2 | UNCERTAIN |
   | 3 s | READY whatever the confidence | | |

   For example, at 1 s: "What's the status of the deploy?" scores 0.95, READY; "I think we should…" 0.05,
   KEEP_LISTENING; "Let's move the meeting to Tuesday" 0.6, UNCERTAIN, and READY at 2 s if the person is still
   silent. The model gives a number rather than three labels because "uncertain" is policy, not a property of the
   speech: the same 0.6 is UNCERTAIN at 1 s and READY at 2 s, thresholds are tuned without retraining, and no
   recording can be labelled "uncertain" to train on.
4. **Fallback** (our code). No score by the 0.5 s mark (the model takes about 205 ms on a laptop's processor, asked
   at 200 ms), or a failure: decide on silence alone, READY at 3 s. Never a premature end.

**Out to Orchestration:** the answer, with the confidence. The confidence and the silence also go to the
measurements, so the thresholds can be checked against what really happened. **Punctuation alone never ends a
turn.**
