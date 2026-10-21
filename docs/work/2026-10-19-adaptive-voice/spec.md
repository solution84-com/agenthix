---
name: Adaptive voice — spec
description: Voice as a natural way to talk with an agent — hearing the person in any room, deciding when they have finished, giving way when they speak over the agent, and staying in step in real time however slow a speech or model service is.
created: 2026-10-19
author: leang
---

# Adaptive voice — spec

**Status:** Draft. Every part has been worked through with the owner; the whole is not yet reviewed, and the
models' evidence comes from the first phase of the build. Nothing here is built yet.
**Scope:** voice in a conversation, on the web and on a phone: hearing the person, recognising their words, deciding
when their turn ends, who holds the floor, and the runtime that keeps all of it in step. Voice onboarding and
telephony are out of scope.

## Purpose and outcome

Voice should be a first-class, natural way to brainstorm with and coordinate agents. A person must be able to
hesitate, pause to think, correct themselves, speak over the agent and carry on, without adapting how they speak to a
fixed silence timer. What the person says and what the agent says must stay in step with each other even when a
speech, model or text-to-speech service is slow.

## The problem

- **Turns end too early.** A pause to think hands the turn to the agent.
- **Interruptions are noticed too slowly.** The agent keeps talking after the person has started.
- **Noise both triggers and masks speech.** A noisy room starts turns, or hides the person's words.
- **Both directions drift behind real time.** The transcript, and the spoken reply, fall further behind the longer
  voice runs.

Every exchange goes from the device to hq, out to the speech, model and text-to-speech services, and back. Each of
those services varies in speed, so lag and queues that build up must be managed explicitly, not left to accumulate.
The conversational experience's walkthrough measured this on a laptop's built-in
speakers.

## Architecture: four layers and a runtime

Four functional layers, each with one job and a name: **Acoustic**, **STT** (speech to text), **Semantics** and
**Orchestration**. A real-time runtime runs underneath all of them.
**hq owns** the conversational policy, authorisation, the choice and coordination of providers, and the session's
state, even where time-critical audio work happens on the person's device.

### Where inference happens

Five models, each with one job. Two are new, both small and run on the person's device; the other three are what
voice uses today. Everything else in the four layers is our code or the browser.

| Model | Layer | Runs | In | Out |
|---|---|---|---|---|
| **Silero VAD** (new) | Acoustic | On the device, about 2 MB | Each 32 ms slice of clean audio | A confidence, 0 to 1, that the slice holds a voice; the detector settings turn it into silence: yes or no |
| **AssemblyAI speech recognition** | STT | AssemblyAI's service | The clean audio, as it is spoken | Timed words, provisional then committed |
| **Smart Turn** (new) | Semantics | On the device, a few MB | The last few seconds of the person's audio, during a pause | A score, 0 to 1, that the turn is finished; the decision rule turns it into READY, KEEP_LISTENING or UNCERTAIN |
| **The lead's model** | The conversation | The organisation's model providers, through hq | The conversation and the person's message | The reply's text, streamed |
| **Inworld text to speech** | Speech out | Inworld's service | One sentence of the reply | Its audio, with each word's timing |

### The parts

Each layer, the runtime, and how it is all built and tested, has a part of its own:

| Part | What it holds |
|---|---|
| [Acoustic](spec/acoustic.md) | Native clean-up; silence detection with Silero VAD and its detector settings; the device check, room monitor, echo check and Adapter |
| [STT](spec/stt.md) | Sending the audio at the pace of speech; timed words, provisional then committed |
| [Semantics](spec/semantics.md) | The pause timer, the Smart Turn model, the decision rule and the fallback |
| [Orchestration](spec/orchestration.md) | Who holds the floor; barge-in; the response scheduler; the hand-raise |
| [The real-time runtime](spec/runtime.md) | The three loops and what each carries |
| [How it is built and tested](spec/building-and-testing.md) | Components as pure state machines; one event contract; models behind interfaces; four levels of test; the folder layout |

## What voice is today

| Layer | Today | Where |
|---|---|---|
| Acoustic | The browser's echo cancellation. No speech detection, no room condition, no adaptation | `voiceClient/speechInput.ts` |
| STT | AssemblyAI streaming from the browser, a new connection per message; timed words; the agent's echo dropped by matching words. Lag grows on one connection | `voiceClient/speechInput.ts`, `freshSockets.ts`, `echo.ts` |
| Semantics | None of our own. AssemblyAI's silence timer ends the turn (at least 1 s, at most 3 s) | `voiceClient/speechService.ts`, `utterance.ts` |
| Orchestration | Two of the person's own words stop the agent and cancel the turn. No ducking, no acknowledgement handling, no hand-raise | `voiceClient/voiceSession.ts`, `conversations/voice/session.ts` |
| Runtime | Speech out sentence by sentence; playback tracks what was heard. No sequence or generation ids across the loops, no queue bounds or telemetry beyond a development timing trace | `conversations/voice/`, `voiceClient/playback.ts`, `speechTiming.ts` |

## Behaviours to validate

1. A natural, extended hesitation ("I think we should… actually, no…") brings no premature reply.
2. A clearly finished question is answered quickly, without a fixed two-second wait.
3. A one-second silence is evaluated as a checkpoint; it does not commit the turn on its own.
4. The person never has to say filler words to keep the floor.
5. Background noise, wind, echo and other people's voices do not routinely start turns.
6. "Hold on" during the agent's speech: it is ducked at once, the floor is handed over reliably, and stale speech is
   cancelled.
7. A brief acknowledgement during the agent's speech: the agent carries on.
8. An uncertain interruption: the agent stays lowered and silent, then carries on if nothing follows; it never
   talks over the person or asks aloud.
9. An agent asks for attention with a soft hand-raise, a sound and a visual cue, not a routine spoken interruption.
10. A provider slows down or disconnects: the backlog stays bounded, the status is clear, the session recovers, and
    drift does not compound.
11. The same behaviour on the web and on a phone, including headphones and Bluetooth where supported.

## Measurement

- **Measured, as p50, p95 and p99:** capture to interim words; capture to final words; silence to turn decision;
  turn to the first audible reply; barge-in to duck and to stop; queue age; drift; dropped and corrected partials;
  each provider's round trip.
- **Conditions:** quiet, steady noise, transient noise, competing speakers, wind, echo, hesitation, long pauses,
  fast back-and-forth, overlap, and a degraded network or provider.
- **Quality:** false early turn ends, missed finished turns, false and missed barge-ins, word accuracy, how
  responsive it feels, and time to recover.
- **Budgets:** about two seconds to a reply is a target to validate, not a fixed delay or a provider guarantee.
  Local ducking needs a much tighter budget.
- **The laptop bar:** for several minutes on built-in speakers, the person's words appear within about
  1–2 s and the lag does not grow; the agent's own voice never becomes the person's words; speaking over the agent
  stops it within about a second.

## Privacy and security

- Raw audio is kept as little as possible, and the product never stores it.
- An optional voice enrolment, or any biometric template, needs explicit consent and safeguards.
- Provider credentials and authorisation stay at the boundaries they have now. Voice widens no project's or
  Execution Site's authority.

## Degradation and recovery

For each of the turn model, speech to text, text to speech and the lead's model being slow or unavailable,
[the runtime](spec/runtime.md) states what the person sees and hears, and how the session recovers. Every queue has a
limit, and every limit has a stated action; no retry or queue is hidden or unbounded.

## Work breakdown

| | Workstream |
|---|---|
| A | Audio capture, device capability detection, adapting to the acoustic condition, noise suppression |
| B | The speech-to-text streaming contract: partial and final reconciliation, timestamps, the provider interface |
| C | The semantic end-of-turn classifier: evaluating models and calibrating them |
| D | The floor's state machine: the person's barge-in, ducking, active listening |
| E | The agent's hand-raise: urgency policy and the person's control over it |
| F | The real-time session runtime: concurrency, backpressure, cancellation, recovery from drift |
| G | UX, privacy, security, observability, benchmarking and acceptance testing |

Planned work elsewhere touches the same ground and is reconciled with this design, not absorbed into it:
preferences for how voice is interrupted, with hand-up controls; one shared queue for starting and stopping audio;
has voice: yes a phone at parity with the web; voice onboarding and set-up; and inbound telephony, which may reuse this
runtime later. No work item duplicates another.

## Order of delivery

1. **The design**, this spec.
2. **The design built, as far as time allows**, a stretch.
3. **Voice works on a laptop** to the laptop bar above, fixing whatever the build left.

### The launch minimum

What step 3 needs, so that neither step throws the other's work away. The laptop bar asks three things, and each is met
by a part of the design that the build takes first:

| The bar | Met by |
|---|---|
| The person's words appear within about 1–2 s, and the lag does not grow | The runtime's inbound loop: the bounded send queue, replacing a stalled or lagging connection, the lag measured |
| The agent's own voice never becomes the person's words | Acoustic's echo check and stricter detector settings while the agent speaks, with today's word matching kept as the second check |
| Speaking over the agent stops it within about a second | Acoustic's silence detection (Silero VAD) and Orchestration's barge-in: duck at once, confirm by words |

Semantics' turn model, the room monitor and the hand-raise improve voice but are not needed for the bar; they come
after. If the build stops at any point, what is built stays, and step 3 finishes the launch minimum from there.

## Decisions

**Decided:**

- The floor and its hand-raise state are designed here; the settings people see, and what counts as critical, stay
  with the interruption preferences planned separately.
- An ambiguous interruption: the agent stays lowered and silent, then carries on; it never asks aloud.
- Real recordings for the measurements: scripted scenarios recorded on a laptop, kept on that machine only, never
  committed, deleted when the work closes.

**Still open**, with the design's working assumption where it makes one:

1. Where the person's audio goes. *Assumed: straight from the browser to the speech provider.*
2. Which devices and browsers the laptop bar must pass on. *Assumed: Chrome on a Mac, built-in speakers.*
3. How far the design goes for a phone app now. *Assumed: the browser, with contracts a phone app follows later.*
4. Where the turn model runs. *Assumed: in the browser.*
5. Whether a second speech provider is benchmarked.
6. Any cost ceiling for speech.
7. Keeping voice timings outside development builds.
8. Whether an opt-in voice enrolment is designed. *Assumed: no.*

## Design done when

A reviewed spec names each component's owner, the state transitions, the provider interfaces, fallback and recovery,
the evidence for any model chosen, measured latency and quality budgets, the privacy and security decisions, and a
work breakdown that duplicates nothing. Accepting the implementation is planned separately.
