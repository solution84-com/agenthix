---
name: Adaptive voice — how it is built and tested
description: Every component a pure state machine, one event contract with time on every event, models and the outside world behind narrow interfaces, four levels of test, and one folder per layer.
created: 2026-10-19
author: leang
---

# How it is built and tested

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.

The aim: every component can be tested with no microphone, no network, no model and no real clock, and the whole
of voice can be replayed from a recording.

## Every component is a pure state machine

Each component is one function of the same shape:

```ts
step(state, event) → { state, emit: Event[] }
```

It takes an event, updates its own state and emits events, and nothing else: no timers, sockets, audio APIs or
`Date.now()` inside. Detector settings, the pause timer, the decision rule, the Adapter, the room monitor, the echo
check, barge-in and the floor all take this shape. A test is a list of events in and the events expected out; a
fault seen on a real device becomes a test by saving the events that caused it.

## One event contract, with time on every event

Components talk only through typed events. Every event carries `t`, its capture time on one clock; `seq`, its
order; and, where it belongs to a reply, `generation`, the reply it belongs to. For example:

| Event | From | Carries |
|---|---|---|
| `AudioFrame` | Acoustic | `t`, `seq`, the samples |
| `VadScore` | Silero VAD | `t`, the confidence |
| `Silence` | Acoustic | `t`, yes or no |
| `EchoLevel`, `RoomLabel` | Acoustic | `t`, the level or the label |
| `Words` | STT | `t0`, `t1`, the text, committed or not |
| `TurnScore` | Smart Turn | `t`, the score |
| `TurnDecision` | Semantics | `t`, the answer, the confidence, the silence so far |
| `Duck`, `Stop`, `Resume` | Orchestration | `t`, `generation` |
| `PlaybackAt` | Playback | `t`, `generation`, the position heard |

**The runtime** is the small loop that delivers these events through bounded queues; it is the only part that knows
about concurrency. The event log is also the telemetry: the measurements in the overview come from it.

## Models and the outside world behind narrow interfaces

| Interface | Real implementation | In tests |
|---|---|---|
| `VoiceActivityModel.score(frame) → number` | Silero VAD in ONNX Runtime | A scripted list of scores |
| `TurnModel.score(audioWindow) → number` | Smart Turn in ONNX Runtime | A scripted list of scores |
| `SpeechToText`: audio in, words out | AssemblyAI over a WebSocket | Recorded provider messages |
| `Synthesizer` | Inworld, through hq | Fixed audio with word timings |
| `Clock`, `Scheduler` | Real time | A fake clock the test advances |
| `Microphone`, `Speaker` | An AudioWorklet, Web Audio | Arrays of samples |

The two models run in a Web Worker, off the page's main thread; the worker's messages are the interface.

## Four levels of test

1. **Unit tests, one per component.** Events in, events out, on the fake clock: a sequence of confidences gives the
   right silence: yes and no; the decision rule's table at every mark; every transition of the floor's state
   machine; the echo check on a synthetic signal and its delayed copy. Fast; run on every change.
2. **Model contract tests.** The real Silero VAD and Smart Turn files run in Node on short labelled clips: speech
   scores above 0.8, silence below 0.1, "I think we should…" below 0.3, each within its latency budget. They catch a
   model swap or update that changes behaviour. Run in continuous integration.
3. **Replay tests, the whole pipeline.** Recorded sessions, the audio and the provider's messages, played through
   every component on the fake clock, checking the overview's behaviours end to end. Deterministic: one recording,
   one result. The replay helper and recorded fixtures under `hq/src/conversations/voiceClient/__tests__/` are
   their start.
4. **Fault tests, the runtime.** A fake speech service that slows down, stalls, sends a burst or drops: the queues
   stay bounded, the lag does not grow, nothing the person said is lost, and the session recovers.

Above these, the **live harness** runs voice in a real browser, in a real room, against the real providers. It
measures, and sets the thresholds; it is not a pass-or-fail test.

## One settings object

Every threshold, duration and mark is in one typed, versioned settings object: the detector's on and off thresholds
and minimum durations, the pause marks at 0.5, 1, 2 and 3 s, the decision rule's thresholds, the echo levels. The
live harness tunes it, tests pin it, and the measurements record which version ran.

## One folder per layer

The browser's voice today is one state machine in `voiceSession.ts`. It becomes one file per component, each with
its tests beside it, under `hq/src/conversations/voiceClient/`:

```
events.ts         the contract
runtime/          queues, delivery, cancellation by generation
acoustic/         detectorSettings, roomMonitor, echoCheck, adapter
stt/              sender, reconciler
semantics/        pauseTimer, decisionRule
orchestration/    floor, bargeIn, scheduler, handRaise
models/           Silero VAD and Smart Turn in a worker; their fakes
adapters/         microphone, speaker, the AssemblyAI socket, hq's socket
```

hq's server keeps what it holds today, policy, tokens, the conversation and speech out, behind the existing socket
protocol. Any component can be replaced, Smart Turn by a text model or AssemblyAI by another provider, without
touching the rest: its unit tests and the replay tests say what it must do.
