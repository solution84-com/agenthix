---
name: Adaptive voice — implementation plan
description: How adaptive voice is built — the frame first, then every component in parallel, then one checkpoint across all of them and passes of fixes until voice meets the laptop bar and every checkpoint.
created: 2026-10-19
author: leang
---

# Implementation Plan · Adaptive voice

## Goal

Voice that hears the person in any room, decides when they have finished, gives way when they speak over the agent,
and stays in step however slow a service is, as designed in [`spec.md`](spec.md) and its parts in [`spec/`](spec/);
and, whatever else is built, voice that meets the spec's laptop bar.

**In scope:** the four layers and the runtime for voice in the browser, the changes hq needs for reply ids and the
hand-raise, the two on-device models, and the tests and measurements the spec's
[building and testing](spec/building-and-testing.md) part describes.

**Out of scope, and why:**
- *A phone app's voice.* The spec designs the browser and writes the contracts a phone app follows; no phone client
  is built here.
- *Telephony and voice onboarding.* Out of the spec's scope; telephony may reuse the runtime later.
- *A second speech provider.* The provider sits behind an interface; benchmarking another is an open decision, taken
  only if the evidence points at AssemblyAI.
- *Voice timings kept outside development builds.* An open decision; the event log makes it cheap to add later.
- *A voice enrolment, or a second echo canceller in the page.* Rejected or held back by the spec unless measurement
  shows the need.
- *The settings people see for interruptions and what counts as critical.* They belong with the interruption
  preferences planned separately; this unit builds the states and events they will drive.

## Approach

**Build the seams first, then fill them, fast.** Today the browser's voice is one state machine in `voiceSession.ts`
with `speechInput.ts`, `echo.ts` and `freshSockets.ts` around it. Phase 1 puts the spec's structure in place before
any new behaviour: the event contract, the runtime's loops and queues, one settings object, the fake clock, the replay
and fault harness, the two models behind their interfaces, and a voice lab. Today's behaviour moves behind that
structure unchanged, so the existing tests still pass. Phase 2 then builds every component at once, in parallel
lanes, each against the contract and each with its replay tests on the owner's recordings.

**The voice lab** is a development-only page in hq that shows each component's output live while the person talks:
silence detection's confidence and flag, the echo level, the room's label, the words provisional and committed with
the lag, Smart Turn's score and the rule's decision, and the floor's state with every duck, stop and resume. It is
how the checkpoint is walked and how a fault is traced to one component.

**Expect the best, assume the worst.** Every component is built before anything is judged live; then phase 3 is one
checkpoint across all of them, walked by the owner on the voice lab and in real conversation, followed by passes of
fixes until every checkpoint passes. Faults are worked in the spec's launch-minimum order first, the parts the
laptop bar needs, so that if time runs short the bar is met before turn-taking and the hand-raise are polished.
Phase 3 has no execution plan: it is a live triage list, worked one item at a time (triage, fix or a short design
conversation, verify), until none remain.

**hq changes little.** It keeps policy, tokens, the conversation and speech out behind the existing socket protocol.
Its changes are small and named: every speech event carries the reply's id; a cancellation names the reply and what
was heard (it already does); and an agent's update during voice is marked as a raised hand instead of taking the next
turn.

**How the work is carried out.** Phases 1 and 2 run as lanes (`running-lanes`): one purpose, one agent, one branch and
worktree per lane, briefed from this plan and the spec part it builds. The lead writes the event contract and the
settings object itself at the start of phase 1 and commits them first, so lanes that build components against them
never guess an interface. Lanes run in the background in parallel where their files do not overlap, each on the model
its task needs (Sonnet for bounded components, Opus for the runtime, the echo check and the connection replacement),
under the resource strategy in their briefs; they run only the tests for what they changed and the typecheck of the
modules they touched. The lead rebases each lane onto the unit's branch and merges them one at a time, runs the
suites lanes may not (hq's integration and e2e tests, the cross-app suite), and keeps this plan's ticks current. The
branch is rebased onto `origin/main` before each session and before the close, to take the patches `main` receives.
The owner walks the work through once every component is built (phase 3), and again at the close. The unit lands on
`main` with one `--no-ff` merge at the close, after the full regression and with the owner's approval; nothing is
pushed without it.

## Decision records

| | Records |
|---|---|
| **Depends on** | [ADR-0125](../../adr/adr-0125-voice-is-a-mode-of-the-conversation.md), voice is a mode of the conversation (Accepted) |
| **Implements** | None. If the open decisions on where audio goes and where the turn model runs are confirmed as assumed, a record that voice's time-critical inference runs on the person's device is written at the close, since a phone app must follow it |
| **Revisits** | None. The design keeps ADR-0125's decision: speech to text makes an ordinary message, and a realtime speech-to-speech model stays rejected |

## Key decisions

| Decision | Why |
|---|---|
| Structure before behaviour: the event contract, the runtime and the harness first, today's behaviour moved behind them unchanged | Every component lands in a frame that already runs and is already tested; nothing is rewritten twice |
| Every component built in parallel, then one checkpoint across all of them, then passes of fixes | Fast: the owner judges the whole once, with the voice lab to trace any fault to one component |
| A voice lab showing every component's output live | A fault is seen in one row, not inferred from a whole conversation |
| Fixes in launch-minimum order first | If time runs short, the laptop bar is met before the rest is polished |
| The models ship with hq as static files, run with ONNX Runtime Web in a Web Worker | A self-hosted hq fetches nothing from outside at run time; the worker keeps inference off the page's main thread |
| The owner's recordings are evidence for the models, kept local; continuous integration uses synthetic or public clips | The repository is public and a person's voice is personal data |
| *Rejected:* one component at a time, each walked before the next | Easier to debug, but slower; the voice lab gives most of the same isolation at the checkpoint |
| *Rejected:* one execution plan for the refactor in phase 1 | The lead fixes the contract first; with the interfaces committed, a lane can move today's behaviour behind them from the code |
| *Rejected:* a server-side media path for the realtime loops | Every self-hosted install would need a media server; the spec keeps the provider behind an interface instead |

## Work breakdown

Three phases: the frame every component plugs into; every component, built at once; then the checkpoint and the
passes. The seams are the contract (nothing is built in parallel safely before it exists) and the checkpoint (nothing
is judged before everything is built).

### Phase 1 — The frame
**Delivers:** the event contract, the runtime's three loops, one settings object and the fake clock, with today's
voice running on them unchanged; the replay and fault harness; Silero VAD and Smart Turn behind their interfaces with
contract tests; the voice lab, showing whatever components exist.
**Starts when:** the spec is approved (2026-10-19).
**Execution plan:** none — lanes; the lead commits the contract and settings first, so lanes build against them.

- [x] 1.1 The event contract: every event with its capture time, order and reply id
- [x] 1.2 The settings object, typed and versioned, with today's values
- [x] 1.3 The runtime: delivery between components, bounded queues, cancellation by reply id
- [x] 1.4 The fake clock and scheduler
- [x] 1.5 Today's voice moved onto the runtime as components, behaviour unchanged, existing tests passing
- [x] 1.6 The replay harness: recorded audio and provider messages through every component on the fake clock
- [x] 1.7 The fault harness: a fake speech service that slows, stalls, bursts and drops
- [x] 1.8 Silero VAD behind `VoiceActivityModel`, in a Web Worker, with its fake
- [x] 1.9 Smart Turn behind `TurnModel`, in the same worker, with its fake
- [x] 1.10 Model contract tests in Node on synthetic or public clips
- [x] 1.11 The two models and ONNX Runtime Web added to `LICENSING.md`
- [x] 1.12 The voice lab: a development-only page showing each component's output live

### Phase 2 — Every component
**Delivers:** every component the spec designs, built in parallel lanes against the contract, each with its replay
tests on the owner's recordings, and each shown on the voice lab; the models' evidence and starting settings.
**Starts when:** phase 1 has merged.
**Execution plan:** none — lanes, one per group below, in parallel.

*Evidence*
- [x] 2.1 A recording page that captures the microphone after the browser's processing, with what was playing
- [x] 2.2 The owner's scenarios 7–11 recorded again through the page — superseded by the owner's walkthrough, which covered them in conversation
- [x] 2.3 Both models run over every recording; scores against each scenario's expectation, on the board
- [x] 2.4 Starting settings from the evidence, and the models' evidence written into the spec

*STT and the inbound loop*
- [x] 2.5 The inbound send queue, bounded at about a second of audio
- [x] 2.6 Connection replacement at the limit or on growing lag: a token fetched ahead, sent at the pace of speech, catching up by leaving out silence
- [x] 2.7 The lag measured continuously, word spoken to words received
- [x] 2.8 "Reconnecting…" on the voice pill while a connection is replaced
- [x] 2.9 STT's reconciler: provisional and committed words told apart

*Acoustic*
- [x] 2.10 Silence detection: Silero VAD with the detector settings, giving silence: yes and no
- [x] 2.11 The echo check: how much of what the microphone hears is the agent's own voice
- [x] 2.12 The device check: microphone, headphones or speakers, the processing granted
- [x] 2.13 The room monitor: quiet, steady noise, intermittent noise, other voices, wind
- [x] 2.14 The Adapter: the echo level and the room's label to the detector settings, checking each change helped
- [x] 2.15 The headphones suggestion when the room or the echo is too much

*Semantics*
- [x] 2.16 The pause timer: the turn model asked once at 200 ms of silence; the rule applied at 0.5, 1 and 2 s
- [x] 2.17 Smart Turn given the speech and 200 ms of silence, with a queue of one
- [x] 2.18 The decision rule: the score and the silence so far give READY, KEEP_LISTENING or UNCERTAIN
- [x] 2.19 The fallback: no score by the 0.5 s mark, or a failure, decides on silence alone, READY at 3 s
- [x] 2.20 The provider's end of turn no longer ends the turn; its settings for voice reviewed

*Orchestration*
- [x] 2.21 The floor's state machine with all its states, read by every component
- [x] 2.22 Barge-in: duck at once on silence: no, the confirmation window, stop or resume by the word table
- [x] 2.23 A stop sends hq the cancellation with what was heard, through the existing path
- [x] 2.24 The person speaking again before the reply is heard cancels it and joins the same message
- [x] 2.25 The chime and the raised-hand badge on the voice pill
- [x] 2.26 Waiting for an opening, or the person's invitation by tap or words
- [x] 2.27 The hook for critical updates, speaking after the current sentence

*hq and the outbound loop*
- [x] 2.28 Reply ids on every speech event from hq; playback drops audio from any other reply
- [x] 2.29 hq marks an agent's update during voice as a raised hand
- [x] 2.30 The outbound buffer held to about two sentences ahead of what is playing

*Integration*
- [x] 2.31 Every component and adapter wired into the live voice session, with what they replace retired

### Phase 3 — The checkpoint and the passes
**Delivers:** voice that meets the laptop bar and passes every component's checkpoint, after as many passes of
fixes as the owner's walkthrough calls for; the user guide updated.
**Starts when:** phase 2 has merged and every component shows on the voice lab.
**Execution plan:** none — a live triage list, worked one item at a time; its output is unknown until the walkthrough.

- [x] 3.1 The checkpoint board: for every component, what to try and what to see, on the voice lab and in conversation
- [x] 3.2 The triage list from the owner's walkthrough, in launch-minimum order
- [x] 3.3 The user guide's voice pages updated for what people now see and hear
- [x] 3.4 Active listening: an active listening phrase in the pauses of a long turn, on KEEP_LISTENING
- [x] 3.5 Active listening: an encouragement phrase after the person stops the agent with a stop word
- [x] 3.6 Active listening: how the turn ended sent with the spoken message, and the lead asking the person to go on when they trail off

Fixes found at the checkpoint join this phase as 3.7 onwards, each recorded below if it changes the design.

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | Semantics asks the turn model once per pause, at 200 ms of silence, with the speech and those 200 ms; the rule applies that score at each mark. The spec's Semantics part is corrected | Lane C measured that the score falls as silence is added (0.96 to 0.03 on a finished turn), and that one score takes about 205 ms, more than the 200 ms fallback allowed |
| 2 | Silence detection also gates on loudness: against the echo expected while the agent plays, and against the room's median among other voices. The spec's Acoustic part is corrected | Lane E measured that Silero scores the agent's echo and a background voice as voice, so no threshold separates them |
| 2 | READY sends only once STT has heard to the end of the speech, and sends the words as shown, provisional ones included. The spec's Orchestration part is corrected | In the wired replay, STT ran about 2 s behind after a connection replacement, so a message sent at READY lost its last words; hq cannot replace a sent message's text with the committed words later |
| 2 | The speech connection closes after about 3 s of silence and a fresh one opens at the next speech. The spec's runtime part is corrected | A gap in a connection's audio made the service fall 20 to 40 s behind; sending silence to avoid the gap conflicted with sending at the pace of speech |
| 2 | A raised hand nobody answers is let go after about 60 s and reported as text. The spec's Orchestration part is corrected | Without a limit, a hand could wait for the whole session and hold back every later update |
| Walkthrough | On READY the browser asks STT to finish the turn, and the message waits for its final words. The spec's Orchestration part is corrected | The last word was cut from messages: silence detection missed a soft last word, or STT's last word was still being heard ("okie do" for "okie dokie"), and what came after the send was dropped |
| Walkthrough | While a reply is awaited, holding phrases in the agent's voice fill the wait: sometimes a short sound at once, otherwise at about 0.7 s, then a little more at 3, 6 and 10 s. The spec's Orchestration part is corrected | The talking model took 2 to 8 s to its first word, and the silence made the person unsure they were heard; a phrase made ahead of time sounds within a second whatever the model |
| Walkthrough | A reply not yet playing also waits while the person has words on screen not yet sent; words STT shows while a reply is awaited join its message; and words left with no pause timed are sent once unchanged for the pause cap. The spec's Orchestration part is corrected | Speaking over a holding phrase, the person's voice was taken for its echo: the floor never became theirs, the reply played over their words, no pause was timed, and the words stayed on screen unsent |
| Walkthrough | A reply cancelled because the person's words joined the message it answered is withdrawn: with nothing heard and nothing made, it is not shown and the lead does not read it. The spec's Orchestration part is corrected | The thread showed an empty *Stopped* reply the person never heard, beside their joined message and its fresh answer |
| Walkthrough | The dock is never empty: with nothing open it opens the conversation the person last wrote in (still active and theirs to read), or a new one in their space; on a medium or narrow window it opens put away. Cancel on a draft with nothing behind it puts the draft away. This changes rule 2 of the desktop shell spec, which drew the dock only when something was in it | With nothing open there was no conversation, and so no voice, anywhere but a place's Conversations section: a person who signed in and went to another page had no way to talk without first finding a conversation |
| Walkthrough | Holding phrases: a short sound the moment the message goes, then a mix of an opening and an ending at about 3 and 7 s, a longer phrase at about 15 s repeating every 16 s; ten mixes drawn each time voice starts, none of the last five said again while another can be. A reply never cuts one off. The spec's Orchestration part is corrected | The fixed phrases at 0.7, 3, 6 and 10 s, then every 5 s, sounded repetitive. A line written by a small model about what was asked was measured on four providers' fastest models and set aside: about 6 lines in 100 were wrong in some way, such as saying the agent was doing what the person was doing, and every model missed the time allowed. A wrong line spoken just before the reply would contradict it |
| Walkthrough | Active listening, a new part of the spec's Orchestration: a quiet listening sound in the pauses of a long turn, a cue after the person stops the agent with a stop word, and, when the person trails off, the lead asking them to go on rather than answering half a thought. Tasks 3.4 to 3.6 | The agent was silent while the person talked at length and after being stopped, and answered a thought left unfinished as if it were whole; a voice conversation that feels natural needs all three |
| Walkthrough | Names, in the spec and the code: *filler phrases* (were holding phrases), *active listening phrases* (listening sounds), *encouragement phrases* (the cue after a stop word) and *encouragement responses* (the lead's prompt to go on). A phrase is stored and played by hq; a response is the lead's reply | "Holding phrase" was coined; filler and active listening are the terms people use, and the two kinds of encouragement are one idea with different sources |
| Walkthrough | A conversation is titled after its first reply: a separate short call to the conversation's own model names it from the person's first message and the reply, and hq keeps the name as the title if none is set | Every conversation was listed as *New conversation*: the title was never set. A line naming it at the start of the reply itself was tried first and set aside: the model did not always write it, and taking it out of what was shown and said was fragile |
| Walkthrough | Voice from the new conversation box: empty, its right button starts the conversation with no message, opens it and starts voice there; greyed, with its reason, when the chosen agent cannot talk | Talking to an agent meant starting a conversation by typing first |
