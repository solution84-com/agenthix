---
created: 2026-11-08
description: How voice stays in the conversation is built — a standalone place to try it, two measuring spikes, one call that acknowledges a slow reply and reads whether the person has finished, one listening family of stored clips, Inworld as the default way to hear, the first spoken word sooner, and a measured long conversation before the first release is cut.
---

# Implementation Plan · Voice that stays in the conversation

## Goal

Make a long voice conversation stay connected and stop repeating itself, and let a hosted setup hear and speak with one voice key. The design is [`spec.md`](spec.md); this plan is how it is built.

**In scope:** the acknowledgement and the finished-thought reading, both from one call to the conversation model itself (it says first whether the person has finished and, when its reply will take a while, writes an acknowledgement; it answers straight away when it can); each person's *Adaptive voice* switch; the listening family (active listening and encouragement merged, three tiers of stored clips, an irregular rhythm); the stored standard acknowledgement as a fall-back only; Inworld speech to text as the default way to hear, with AssemblyAI still supported; the first spoken word sooner and one turn per spoken message ([#28](https://github.com/solution84-com/agenthix/issues/28)); a standalone environment to try all of it without hq.

**Out of scope:** a native speech-to-speech model that answers what it can and hands the rest to the lead (a later design); a free self-hosted speech service as the default; expressive direction fitted to each reply; unattended and self-hosted voice; any change to the stop-word and acknowledgement rules. The first early-access release is cut after this unit, as its own work.

## Approach

**The new logic is written as pure cores with thin hq adapters, the way the voice client already is.** The voice client takes its microphone, speaker, clock, speech-to-text and turn model as ports, and imports nothing from Wasp. The acknowledgement follows the same shape: one module holds the prompt text, the parser for the decision (`complete`, `confidence`, `why`, `responses`) and the check on a line; it knows nothing of hq. The lead's turn in hq streams the model's output and uses that module. The voice playground (phase 4b) runs the same module with a model chosen on the page, so what is tried there is the code that ships.

**There is one call, to the lead's own model.** The audio turn model sends the turn, as it does today. hq calls the lead, which replies, or, when the person has not finished, calls a `keep_listening` tool and says nothing; hq then tells the client (`turnHeld`) and the person's next words join the same message by the path that exists. The new `turnHeld` event moves the client protocol's version (1.19) ([`docs/architecture/versioning.md`](../../architecture/versioning.md)). Everything this adds has a fall-back that is today's behaviour: a failed or slow call, or a missing reply marker, and the turn runs as it does today with a stored standard acknowledgement covering the wait. No second model, no organisation setting, no model choice: the one setting is each person's *Adaptive voice*.

**The prompt is iterated with the owner, one version at a time, on the low-cost baseline model.** The accepted text (version 36, in [`prompt-findings.md`](prompt-findings.md)) was iterated over versions 24 to 36 on DeepSeek Flash with the real base instructions and a six-turn history, and held in 148 of 150 runs of five items; it is polished after it is built if a check shows a need.

**The listening family replaces two components with one.** Active listening and encouragement become one component with three tiers of stored clips, one rhythm rule (a floor, a random gap and a soft ceiling) and a memory of the last 6 played. A cheap local check on the last words decides whether an acknowledging word fits; a model call is added only if the owner's long conversation shows wrong fits. Clips are made once per voice and kept, as the stored phrases are now.

**Hearing is a second provider behind the port that already exists.** Inworld becomes a speech-to-text provider beside AssemblyAI; the resolver already picks speech-to-text like a model (the agent's choice, else the organisation's, else the other when one is not working). Inworld is the default whenever it can deliver; the spike informs and does not gate.

**How the work is carried out.** Phases are carried out by lanes from short briefs: one purpose, one agent, one worktree, each landing on the unit's branch as one squashed commit, rebased and fast-forwarded. Phase 2 is first, since everything else is tried in it. Phases 4 and 5 share the voice client's orchestration files and run one after the other. Phase 6 shares no files with them and may run beside phase 4; phase 7 touches the speech path the bridge also touches and runs after phase 4. The lead runs the integration and cross-application suites for what a lane changed; the full regression and the image start tests run once at the close. Every build that changes what a person hears or sees is checked by an independent reviewer before the owner sees it, and one that changes a screen is design-checked. A model call that touches the conversation is tested against recorded and labelled conversations with lines that must never be said, never against a mock that returns what the test expects; model checks run on the low-cost baseline model and the model the spike picks, with the development keys. The owner walks the work through in phase 8 by talking to an agent for a long time. The unit has one branch, `feature/voice-stays-in-the-conversation`, merged to `main` once, at the close, with the owner's approval and before the first early-access release is cut. New behaviour ships behind a flag with a stage ([`docs/architecture/feature-flags.md`](../../architecture/feature-flags.md)).

## Decision records

| | Records |
|---|---|
| **Depends on** | [ADR-0125](../../adr/adr-0125-voice-is-a-mode-of-the-conversation.md), [ADR-0139](../../adr/adr-0139-one-resolver-chooses-every-model-and-voice-call.md) and [ADR-0160](../../adr/adr-0160-setup-defines-the-organisation-first-and-ai-may-come-later.md), all Accepted |
| **Implements** | Five new records, Accepted on this branch: [ADR-0178](../../adr/adr-0178-a-spoken-acknowledgement-never-answers-the-request.md) (a spoken acknowledgement never answers the request), [ADR-0179](../../adr/adr-0179-a-reading-of-the-words-may-extend-a-turn-but-never-end-one-early.md) (a reading of the words may extend a turn, never end one early), [ADR-0180](../../adr/adr-0180-inworld-is-the-default-way-to-hear-and-assemblyai-stays-supported.md) (Inworld is the default way to hear, and AssemblyAI stays supported), [ADR-0181](../../adr/adr-0181-the-conversation-model-decides-the-voice-turn-in-its-own-call.md) (the conversation model decides the voice turn in its own call) and [ADR-0182](../../adr/adr-0182-voice-has-one-setting-each-persons-adaptive-voice.md) (voice has one setting, each person's Adaptive voice) |
| **Revisits** | None. The adaptive voice unit's choice to hold the wait with stored phrases is in its plan, not a record |

## Key decisions

| Decision | Why |
|---|---|
| The call is the lead's own, with the whole conversation as the lead has it | One call decides, acknowledges and replies, with everything it knows, and voice honours the model already chosen for the conversation (a cheaper model for speed, a more capable one for thoughtfulness); the spike (9 Nov) found it no less accurate than a fast model beside it (92% against 92% on 61 pauses) and the spec records the trade-offs |
| The decision is a tool call, `keep_listening`, and the acknowledgement is the reply's first sentence | A tool call separates data from speech, models are built for tools, only the hold needs one (the turn ends anyway), a finished reply streams from its first token, and there is no form, tags or marker to detect; tested over 150 runs on DeepSeek Flash |
| No separate bill: the call is the lead's own turn | It adds about a thousand tokens of instruction and a short decision to a call hq already makes, costed like every lead turn; the instruction can be cached |
| No separate model; the prompt is iterated on DeepSeek Flash | The conversation model is the organisation's own choice; the prompt that holds on the low-cost baseline holds on the better ones |
| The finished-thought reading is the same call as the acknowledgement, comes first in the reply, and can only extend a turn | The person must not be spoken over before we know they have finished, so `complete` is the gate; one read, two answers; extending only means a wrong reading costs a wait, never a cut-off |
| Chosen against: a fast model beside the lead, or as a gate to it | Equal accuracy; the gate saves a little cost on unfinished turns but adds 0.5 to 0.8 s to every finished one, decides the acknowledgement from two turns, and brings back an organisation setting and a second set of keys |
| Active listening and encouragement merge into one family | They are the same thing (a spoken sign in a gap to keep the person talking) differing only in what began the gap; two sets of timers could stack |
| Chosen against: removing active listening | The bridge answers a finished message; nothing else shows the agent is following while the person is still speaking |
| Fit of a word is a cheap local check, not a model call | A wrong fit costs a hum at worst. Letting the model choose the sound was tried and it chose a hum 22 times of 23 and never an acknowledging word |
| Inworld is the default for hearing and the spike does not gate it | One key is better than two whatever the other measures like; a plain note recommends AssemblyAI for quality if Inworld measures worse |
| Two dev-only voice pages live in hq: the voice lab (debugging, hooked into a real conversation) and the voice playground (experimenting, standalone: no agent, no conversation record, a model chosen on the page) | What is tried must be what ships, and a bench outside the repository ran a copy of the lead's turn. The playground imports hq's own code, so it is committed, reviewed and tested; the lead's voice logic is a pure module inside hq that both the real turn and the playground use. A package is not needed: nothing outside hq shares it. The scratch environment is retired once the playground does its job |
| Chosen against: a fast voice model that answers what it can (option D) | Two models speaking for one agent changes how a turn works; a later design |
| The prompt is five kinds of line chosen by what the person just did, with example phrases that carry the last message's topic, short explicit rules, and three candidates | The first design that was natural, fitted to the turn and safe: 0 answers, 0 claims, 0 task-doing, 109 distinct lines, 0 repeats of the last three |
| The reading is judged only by how the message ends | Without it the model read "trailing on 'both'" as a complete thought (84% right); with it 43 of 44 and no finished turn held |
| The model's reason (`why`) is logged and confidence is not acted on | The `why` found the one flaw in the reading; confidence was "high" on every answer, right or wrong |
| A local pick of three candidates, with cheap local checks (12 words, no digit or fact, no progress form, no name or question) | The model alone repeated its shape (33 distinct openings from one line); Luna's long lines (14 of 109) are cleared because only 2 items had no short candidate |
| One setting: each person's *Adaptive voice* (listening sounds and the acknowledgement; on by default) | Who finds the sounds annoying is the person; there is no organisation setting because the call is the lead's own |
| Chosen against: rotating several prompts for variety | It averages the failures of the prompts, triples the testing, and the weakest paraphrase sets the floor; the candidate pick gives the variety |
| Chosen against: letting the model answer and speaking only its first sentence | Safe, but the model compressed the sentence into one template ("The X, give me a moment") |
| Chosen against: a model-written voice direction for each line | The model chose "thoughtful" for half the lines including a simple fact, and a direction cannot change the words; kept as an experiment |
| Chosen against: tool calls and strict schemas for the line | Plain instructions parsed 153 of 153 and were simpler to write rules for |

## Work breakdown

This is the progress record for the whole unit. The unit is split on seams: decisions before anything, a place to try things before measuring, measuring before building what depends on it, and the two builds that share files in sequence.

### Phase 1 — Decisions
**Delivers:** the rules that bind later work are accepted records.
**Starts when:** the owner has approved the design.
**Execution plan:** none — by hand: three short records.

- [x] 1.1 Write the record: a spoken acknowledgement never answers the request (ADR-0178)
- [x] 1.2 Write the record: a reading of the words may extend a turn, never end one early (ADR-0179)
- [x] 1.3 Write the record: Inworld is the default way to hear, AssemblyAI stays supported (ADR-0180)
- [x] 1.4 Write the records for the design that was reached: the conversation model decides the voice turn in its own call (ADR-0181), and voice has one setting, each person's Adaptive voice (ADR-0182); ADR-0178 and ADR-0179 corrected to match

### Phase 2 — The spike environment
**Delivers:** voice can be tried on its own as it behaves today, with no hq, database or accounts, and the voice debugging that hq's dev-only page has.
**Starts when:** phase 1 is done.
**Execution plan:** none — lanes: the voice client is built to be run through its ports, so the steps follow from the code.

- [x] 2.1 A local server that reads one keys file and holds no accounts or database
- [x] 2.2 A browser page that runs the real voice client source from `hq/src/conversations/voiceClient/` with stand-ins for hq's socket and message send
- [x] 2.3 Live mode: talk to it with the microphone
- [x] 2.4 Replay mode: play a recording with its pauses where they were
- [x] 2.5 Typed mode: the conversation as text, with no audio
- [x] 2.6 A stand-in for the lead's model: a reply after a delay set on the page, or a real model when a key is given
- [x] 2.7 Make the stored clips for a voice from the keys file and keep them
- [x] 2.8 Bring in the voice lab's rows, saved-log load and save, and recorder by reusing its components
- [x] 2.9 A model picker that runs one call on several models side by side
- [x] 2.10 (superseded: the owner tried the voice in the playground, 9 Nov 2026) The owner tries the environment live with a real microphone and speakers: the agent's voice heard back, speaking over a reply, and how the stored clips and the acknowledgement sound (headless runs could not)

### Phase 3 — Spikes
**Delivers:** the bridge's prompt and settings chosen on numbers, whether the finished-thought reading is built and its hold time, and how Inworld is offered.
**Starts when:** the parts that do not need the browser page (3.2 to 3.4) start with phase 2; the hearing measure (3.6, 3.7) was done on 8 Nov before this plan; 3.5 waits for the labelled brainstorming recordings (3.1), and 3.9 for all of it.
**Execution plan:** none — by hand: a discovery phase, whose output is unknown by definition, so a plan would be verdicts written before the evidence. Results are written up in [`prompt-findings.md`](prompt-findings.md).

- [x] 3.1 Label the owner's recordings with where each thought really ended: the adaptive-voice unit's scenarios 1 to 6 and 11, transcribed by Inworld, cut at each pause (17 items)
- [x] 3.2 Build the test sets: everyday requests, requests a cheap model is tempted to answer, prompts that provoke wrong claims, and thinking-aloud turns
- [x] 3.3 Draft the bridge instruction and its structured answer: 23 versions, written up with the evidence in [`prompt-findings.md`](prompt-findings.md)
- [x] 3.4 Measure the prompts on the low-cost baseline and the final one on Luna and Haiku: safe lines, lines that answer, wrong claims, reading accuracy, latency, cost
- [x] 3.5 Measure the finished-thought reading on the recordings: 17 pauses of the owner's recordings, labelled from the script: 12 right on DeepSeek Flash and Haiku, 11 of 16 on Luna; 5 of 7 thinking-aloud pauses missed by all three, 4 of those 7 not detectable from the words alone, so the audio decides and the reading only extends (ADR-0179)
- [x] 3.10 Run the final prompt (version 23) on Luna, Haiku, Gemini Flash and DeepSeek Flash: no clear winner, so the organisation chooses (task 4.12)
- [x] 3.6 Find whether a browser can stream to Inworld with a token hq mints: it can, with a single-use token, so no audio passes through hq (measured 8 Nov)
- [x] 3.7 Measure Inworld against AssemblyAI on synthetic speech: first words, final text, word error rate (done 8 Nov); real microphone audio and built-in speakers are checked in phase 8 through replay
- [x] 3.8 Check Inworld's language list: it lists 30 languages against AssemblyAI's 32; which two it lacks is not established, so no language is promised until checked
- [x] 3.9 Write each result up: the prompt, the model order and how Inworld is offered are decided; the hold time is still to be set from the recordings

### Phase 4 — The acknowledgement and the finished-thought call
**Delivers:** the lead acknowledges a slow reply with a short opening sentence, a thinker is not cut off, and each person can turn the extras off, behind a flag.
**Starts when:** phase 3 is done.
**Execution plan:** none — lanes: the seams (the lead's turn, the voice socket) already exist.

- [x] 4.1 The first design's pure module (the fast-model prompt, parser, checks and pick): built, then not used by the accepted design and removed in 4.2
- [x] 4.9 The feature behind a flag with a stage (built as `voiceBridge`; kept)
- [x] 4.16 Each person's *Adaptive voice* switch in their voice settings (on by default): off silences the listening sounds and the acknowledgement; how a turn ends and the echo handling are not part of it; the voice client reads it; an (i) explains it
- [x] 4.13 The voice socket's `turnHeld` event to the holder, with the client protocol moved to 1.19 (the contract the lanes build against)
- [x] 4.2 Take out the first design: the *Enhanced adaptive voice* switch and screen, the model tiers and the `voice_bridge` resolver purpose and usage purpose, the organisation's column and migration, the bridge module under `conversations/bridge/`; keep the shared (i) button and each person's setting; correct the (i) texts and the guide pages that mention the organisation's switch
- [x] 4.3 The lead's instructions: the voice rules leave the base instructions and become a voice turn block, added only to a spoken message, with the accepted version 36 text (how to speak, how to judge "finished", when to open with an acknowledgement); the `:::encouragement` rule goes; behind the flag
- [x] 4.4 The `keep_listening` tool: defined for the lead on every turn, intercepted in the turn loop on a spoken message (the turn ends, no message, no second model call), the reason logged; `turnHeld` sent to the holder; the person's next words join the held message; whitespace written before the call is ignored; text written before it is withdrawn
- [x] 4.5 The voice client: on `turnHeld` it expects no reply and plays nothing and the listening family's invitation follows after a few seconds of silence; the stored standard acknowledgement plays only when the call fails or passes its ceiling (about 4 s) with no reply started, and the ladder at 3, 7 and 15 s and the short word at once go; Adaptive voice off plays no acknowledgement and the hold still works
- [x] 4.6 Keep the opening sentence from becoming the person's words through echo (the reply's own speech is already handled; check it holds for a sentence that streams first)
- [x] 4.7 Tests: the voice turn block and the tool as unit tests; the lead's turn against recorded replies (a hold, a finished reply, a handoff, a missing tool call), with the fall-backs; replay tests for the client; the five-item check and then the 61 thinking-aloud pauses and the 40 quick-versus-task items on DeepSeek Flash; the real-database parts run by the lead
- [x] 4.8 Environment panel: the held turns and their reasons, the opening sentence, the gaps (the Decisions panel in the environment)

### Phase 4b — The voice playground
**Delivers:** a dev-only page in hq to experiment with voice on its own: talk to a model chosen on the page, with hq's own voice client and the lead's own voice logic, tied to no agent and no conversation record. The lab stays for debugging a real conversation.
**Starts when:** phase 4 is done (it is).
**Execution plan:** none — lanes: the scratch environment (execution/spike) is the working design to port, not to rewrite.

- [x] 4b.1 The lead's voice logic as a pure module in hq, with no database and no Wasp: the `keep_listening` tool and its description, the rule for when a turn may be held, the voice turn block, and the reading of a model's stream into text, a hold and work started; hq's real turn and the playground both use it, and the environment's copy goes
- [x] 4b.2 A dev-only server side in hq that answers a spoken message with the real voice session (the same sentence cutting, pacing and interruption) and a lead made from the module and a model the page names, with no conversation, agent or record; it is refused outside development and for a person who is not signed in; its calls go through hq's providers and are counted as dev calls
- [x] 4b.3 The playground page beside the lab: live, replay of a recording and typed modes; the lead picker (a fake model after a delay, or a real model); the stored phrases; the Decisions panel (held turns and their reasons, the opening sentence, the gaps)
- [x] 4b.4 Tests: the module (unit), the server side (real parts, fakes only for what leaves hq), the page's rows; the lab's tests still pass
- [x] 4b.5 The scratch environment is not used again once the owner has tried the same scripts in the playground (the owner tried the playground itself, with its own scripts; the scratch environment is retired, 9.2)

### Phase 4c — The playground's layout and its scenarios
**Delivers:** the playground as the owner designed it on 9 Nov 2026: two modes, Live and Scenarios; a fixed tools column on the right (Tuning, Lab, one combined Log); and a scenario runner that scores several models on the same 101 fixed scenarios. Typed is gone, and Replay stops being a mode.
**Starts when:** phase 4b is done (it is).
**Execution plan:** none — lanes, one after the other (both change the same page); an independent designer checks it before the owner sees it.

- [x] 4c.1 The layout: a top bar with the title and the two modes; under the mode, its own row (Live: the one model to talk to in the standard model picker, an *Adaptive voice* On/Off switch with an explanation in a dialog, and *Start over*; Scenarios: the models to compare, the same switch, and *Clear results*); on the left the mode's content (Live: the conversation and its box, Mute, Stop speaking; Scenarios: the four groups and the result); on the right a column that never changes shape: Tuning (the eight live sliders and Reset), Lab (six small cards with Open full lab in a drawer, Save log, Load log, Record), and the Log; the panes stack on a narrow window
- [x] 4c.2 One Log instead of Decisions and Log: every entry has its time and a badge (DECISION, SOUND, CALL, ERROR, NOTICE) and filter chips; sounds the app plays on its own (a listening hum, an invitation, the stored phrase) are new in it
- [x] 4c.3 The scenario library: 101 fixed scenarios as text fixtures in hq in four groups (29 where the person trails off and the agent should stay quiet, 32 where they have finished and it should answer, 20 quick questions, 20 tasks), each with the conversation so far, the person's last words and the behaviour wanted; built from the labelled sets measured in phase 3; text only, never audio; not editable on the page
- [x] 4c.4 The runner: *Run all* sends every scenario through the same lead as Live (real context, voice turn block, `keep_listening`, the spoken first-step thinking rule, no speech) to each model chosen, scores each against the behaviour wanted, and shows the calls and cost before it starts; the result is the four groups, collapsible, every scenario a line with pass or fail per model; a line opens a dialog with what each model did and said, its reason, the time and tokens, Previous and Next, and the exact request sent; "See them" on a group opens its scenarios, read-only
- [x] 4c.5 Typed is removed; Replay is no longer a mode (its microphone and recording code stays for a later run-as-audio)
- [x] 4c.6 Tests: the library's shape and expected results; the runner's scoring with a recorded model; the layout; the Log's badges and filters; no existing playground test weakened

### Phase 5 — The listening family
**Delivers:** active listening and encouragement as one family of far more stored clips at an irregular rhythm, behind the same flag.
**Starts when:** phase 4 is done, since both change the voice client's orchestration files.
**Execution plan:** none — lanes.

- [x] 5.1 The three tiers of clips with the owner's wording, made once per voice and kept; a tier with no clips is silent
- [x] 5.2 One listening component replacing active listening and encouragement, with the floor, random gap, soft ceiling and a memory of the last 6
- [x] 5.3 The kind of sound (hum, acknowledge, none) comes from a cheap local check on the last words (a model-chosen sound was tried and added nothing)
- [x] 5.4 The invitation tier plays after a stop word and about 2 s of silence, and partway through a turn the finished-thought call holds open
- [x] 5.5 Remove the old lists, the 0.7 s wait and the skip chance; keep the stop words, acknowledgements and the lead's go-on when a person trails off
- [x] 5.6 The numbers as settings, and sliders for them in the playground
- [x] 5.7 Tests: long simulated monologues for rhythm and no repeat in the last 6, never over the person, and the fit check on a labelled set

### Phase 6 — Hearing
**Delivers:** Inworld hears as well as speaks, as the default, and setup asks for at most one voice key.
**Starts when:** phase 3 is done; shares no files with phases 4 and 5 and may run beside phase 4.
**Execution plan:** none — lanes.

- [x] 6.1 Inworld becomes a speech-to-text provider in the shared provider definitions
- [x] 6.2 hq mints a single-use Inworld token for the browser, one per connection attempt, with the ticket and usage report kept
- [x] 6.3 A client hearing adapter beside AssemblyAI's behind the same port; it numbers the turns itself, since Inworld sends no turn number
- [x] 6.3b Dictation hears through Inworld or AssemblyAI by its token, as voice does (added 9 Nov: one key must cover dictation too; the mobile app stays on AssemblyAI until its own change)
- [x] 6.4 The resolver makes Inworld the default when it can deliver, keeps the agent's and organisation's choice, and falls to the other when one is not working
- [x] 6.5 Setup and the provider screens ask for at most one voice key, and say plainly what Inworld costs in quality where it measured worse
- [x] 6.6 Update the AssemblyAI model id the listening uses ([#15](https://github.com/solution84-com/agenthix/issues/15))
- [x] 6.7 Tests against recorded speech for each way of hearing, and for the fall-over between them
- [x] 6.8 The user guide's phone-and-voice and providers pages

### Phase 7 — The first spoken word, and one turn per message
**Delivers:** speech starts on the first complete sentence and one spoken message is one turn ([#28](https://github.com/solution84-com/agenthix/issues/28)).
**Starts when:** phase 4 is done, since it works in the speech path the call also uses.
**Execution plan:** none — lanes.

- [x] 7.1 Start speech on the first complete sentence
- [x] 7.2 Find why one spoken message produced four turns, and fix it
- [x] 7.3 The lead's first sentence at low thinking effort, then carry on
- [x] 7.4 Run independent read-only tool calls side by side

### Phase 8 — Measure, then a long conversation
**Delivers:** the result as numbers and a recording, and the owner's verdict after a long talk.
**Starts when:** phases 4 to 7 are done.
**Execution plan:** none — by hand: measuring and the owner's walkthrough, then fixes as lanes of their own.

- [x] 8.1 Re-run the phase 3 measures on the built call and its reading
- [ ] 8.2 Count repeats in a ten-minute conversation and listening words a minute in a long turn, before and after (dropped: the owner accepted the work after their own listening tests, see Deviations)
- [x] 8.3 The owner talks to an agent for a long time and says whether it still feels disconnected or repeats itself (done in the playground on 9 Nov 2026; the verdict is in the closing note)
- [x] 8.4 Fix what the walkthrough finds, each as its own task added here (the fixes are the rows of Deviations dated 9 Nov 2026)

### Phase 9 — Close
**Delivers:** the unit's documents, issues and records are final.
**Starts when:** the owner accepts phase 8.
**Execution plan:** none — by hand.

- [x] 9.1 Update the conversation layer's architecture page, the QA contract and any guide page the build changed
- [x] 9.2 Retire the scratch environment, and decide whether the lab or the playground ever moves out of development builds (both stay dev-only for now)
- [x] 9.3 Close the issues this unit addresses with their evidence
- [x] 9.4 Note on each record this work implemented what acted on it

## Deviations

Phases 1 to 3 ran on 8 Nov 2026. Direction the owner set that differs from the draft spec, now written into it, and what the work changed:

| Phase | What changed | Why |
|---|---|---|
| Spec | Active listening and encouragement stay, merged into one listening family. The draft removed them | The bridge cannot show the agent is following while the person is still speaking |
| Spec | Whether a thought is finished is read in the bridge call | The end of a turn was decided by sound alone and cut a thinker off at 3 s |
| Spec | Inworld is the default for hearing and the spike does not gate it. The draft decided on the spike's numbers | One key is better than two whatever the other measures like |
| Spec | The organisation pays for a bridge, on its own model key | Not part of the person's run, and not the subscription |
| Plan | A spike environment is a new first phase; the model is not searched for again, the prompt is tested | The owner wants to test it on its own before it goes into hq; the job changed but the best models were already measured |
| Spec | The bridge reads the agent's last reply and the person's latest words, not the last six turns | Six turns pulled in earlier topics and were no safer; one turn gave a short reply no meaning |
| Spec | The reading is one call with the line, first in a JSON reply, judged by how the message ends, with the reason logged | The person must not be spoken over before we know they have finished; the logged reasons showed the flaw |
| Spec | The prompt is five kinds of line with three candidates and a local pick, in plain instructions | Tool calls, word lists, rotation, a first-sentence frame and model-written directions each failed or added nothing; see the findings document |
| Spec | Two settings, named to match: each person's *Adaptive voice* and the organisation's *Enhanced adaptive voice*; the first design let the organisation pick up to two models | The owner's decisions on 9 Nov 2026: the organisation would not care which model; a person may find the sounds annoying; the cost and keys are the organisation's |
| Spec | One call to the conversation model replaces the fast-model bridge and its organisation setting; each person's *Adaptive voice* is the only setting | The spike of 9 Nov found equal accuracy; a gate or a second model adds 0.5 to 0.8 s to every finished turn and a setting the owner does not want users to have to understand |
| Spec | The decision is a `keep_listening` tool call and the acknowledgement is the reply's own first sentence; the JSON form, tags, marker, three candidates, local pick and checks are gone | The owner's iteration on 9 Nov: a tool separates data from speech, the full model answers for its own wording, and the checks showed a hold held in 59 of 60 runs |
| Plan | A voice playground in hq (phase 4b) replaces the scratch environment as the place to experiment; the voice lab stays as the place to debug | The owner's decision on 9 Nov 2026 after play-testing the bridge: a copy of the turn outside hq tested a copy; the playground uses the same code that ships, so changes are quick without touching the agent code |
| Plan | The playground gets a tidier layout and a scenario runner (phase 4c); Typed goes, Replay keeps the owner's own recordings | The owner's decision on 9 Nov 2026: the playground showed too much at once, and its purpose beside Live is to replay scripted scenarios on different models and see how they perform |
| Plan | Phase 3 grew a model run of the final prompt (3.10) and the synthetic thinking-aloud set stood in for the recordings | The recordings are not yet labelled; 3.1 and 3.5 stay open |
| Spec | A hum or an acknowledging word plays in any brief pause (0.3 s of silence) after 8 s of speech, counted across the messages the lead held, where what was heard ends in punctuation (late punctuation makes a late sound; past the longest wait any pause will do), and a hum finishes if the person goes on. The first design played one only where the turn model answered keep-listening | In the owner's tests the turn model almost never answered it at a pause, so no hum played however long they talked; a hum is not a reply, so it should not wait for a ruling |
| Spec | Every listening clip is spoken plain, with no steering; ten short hums (Mm-hm, Mhm, Uh-huh, Hmm and the like), five words (I see, Right, Okay, Got it, Yep) and thirteen invitations; no question marks, no "Um", and no "Why not", "Makes sense", "Sure" or "Of course", which answer something. The first design steered every clip with "relaxed, low voice, thinking" and had 10, 15 and 12 clips | The owner tried the clips by ear on 9 Nov 2026: the steering made hums sound aloof, breathy or sudden, and a short invitation steered "gentle" came across as too intimate. A natural-sounding hum was not reached with the speech models tried, including a sample from a second provider, so the unit closes with plain clips |
| Spec | In the playground, a clip the person heard is kept as the agent's words and the lead reads it; a reply the person went on from, or the lead held, is discarded and a spoken reply shows only as far as it was heard. The real conversation view does the same later | The owner: what is recorded must be what happened, and what was heard must be in the text |
| Spec | The speech service is sent the product name respelled "Agent-hicks", wherever it falls in a sentence; the written reply is unchanged | The model said the name right at the start of a sentence and wrong in the middle; chosen by the owner by ear |
| Plan | The playground's Log folds a turn's reply, its decision and its model call into one line, adds the person's messages, and Tuning and Lab fold away | The owner's review while testing on 9 Nov 2026: a call and the reply are one event, and the Log was hard to scroll |
| Plan | Task 8.2 (counting repeats over ten minutes) is dropped | The owner accepted the work after their own tests on 9 Nov 2026; the rhythm numbers are measured in the replayed monologue test instead |
| Plan | The scenario library holds 84 scenarios (22 where the person trails off, 22 where they have finished, 20 quick questions, 20 tasks), not 101 | The 17 scenarios built from the owner's own recordings were removed on 10 Nov 2026, and the branch's history rewritten without them: real recordings of a person's voice and room do not belong in a public repository |

## Closing note · 10 Nov 2026

- **Accepted** by the owner on 10 Nov 2026, after their own tests in the voice playground on 9 and 10 Nov. Their verdict: good enough to close; a natural-sounding hum was not reached with the speech models tried and is a known limitation (the shipped clips are short, plain and unsteered).
- **Open items.** Triaged against the code at head by one agent: none was critical and none is a security risk. Closed in the unit: the playground's trace line is development-only, the stale comments and documents were fixed, the scratch environment is retired, and the recordings of the owner's voice were removed from the code and from the branch's history. Deferred as their own issues: [#182](https://github.com/solution84-com/agenthix/issues/182) to [#196](https://github.com/solution84-com/agenthix/issues/196), with [#186](https://github.com/solution84-com/agenthix/issues/186) (real conversations do not record what the person heard) the one rated High; three features are in the maintainers' own tracker. None blocks a release. [#28](https://github.com/solution84-com/agenthix/issues/28) is closed as completed.
- **QA audit.** Not run in this unit. The owner's note: a full audit ran in the previous unit. The scenarios this unit wrote (SC-1830 to SC-1841, with their tests tagged) are the builder's description of the work and await the audit before release.
- **Records.** ADR-0178 to ADR-0182 are Accepted and each notes what implemented it. None is Proposed, none was revisited.
- **Regression.** Run once at the close with a clean environment: core, ui, hq (typecheck, 8,444 unit tests, 4,189 integration tests), site, host, relay, console, console-web, and the cross-app suite with every feature flag on, all passing. The end-to-end tests, the image start tests and the install test were not run here: the next unit also changes the model provider, so they run in full after it, before anything is pushed.
- **Branch.** `feature/voice-stays-in-the-conversation`, regrouped into ten themed commits; not pushed; merged to `main` only with the owner's approval.

