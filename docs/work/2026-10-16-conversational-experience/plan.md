---
name: Conversational experience — implementation plan
description: How the conversational experience is built — the conversation layer in hq, work commissioned to workers and returned, memory, compaction, voice and the thread — in seven phases cut at the spec's parts.
created: 2026-10-16
author: leang
---

# Implementation Plan · Conversational experience

## Goal

Every agent converses at the speed of a conversation through a direct-inference lead in hq, commissions longer work
to harness workers in any boundary the person and agent share, and brings the results back into the thread; with
memory recalled by meaning, a context that keeps the provider's cache and compacts in segments, voice as a mode of
the conversation, and a thread that reads clearly on web and phone. The design is [`spec.md`](spec.md) and its
parts in [`spec/`](spec/); each phase below is one part, and the part's acceptance criteria are the phase's.

**In scope:** everything the spec's seven parts design, for the web and hq's API. A phone client reads the same
record through the same API and is not built here.

**Out of scope, and why:**
- *Sign in with ChatGPT* is built only when the vendor issues the client id; the API-key tier is complete without
  it, so it is the last phase and gated, not a blocker.
- Several agents in one conversation, and opening a project's conversations to all its members: the spec leaves
  both to collaborative conversations, after this epic; the task thread's rules are written so they extend to them.
- A recycle bin for deleted conversations: a feature of its own; deleting confirms once and offers archive.
- Outside-service connections (a person's Google Drive, say) as foreground tools: the tool contract allows them;
  nothing connects hq outward to a service's tools today, and no part needs it.
- A realtime speech-to-speech model, a vendor's server-side compaction, a vector database: each is an option the
  spec weighed and left behind the same contract for later.
- A phone client's conversations, voice and task threads: they consume this record and API, and are built outside this unit.

## Approach

**The seam is the one the spec draws: hq holds the conversation, the site holds the work.** Today a chat is a
harness run on a site and hq holds only a session mirror. This unit adds the conversation record to hq — five new
tables and a link on notifications and artefacts — and a **Conversation Coordinator** in hq that admits messages,
holds the one-turn lock, assembles the lead's context, runs direct inference through one model adapter, and owns the
mailbox that completions and approval requests flow into. The site changes shape nowhere: its runs, transcripts and
tool-call logs become a run's record rather than the conversation's, and the existing dispatch over the control
channel carries a worker's brief exactly as it carries a chat run today. The platform builds no subagent mechanism:
fan-out inside a boundary is the harness's own helpers, already shown as a work step.

**One tool entry, two routes.** Every Agenthix tool already goes through one in-process entry with one permission
check, reached by the site's MCP endpoint for harness runs and by hq's data API. The lead reaches the same entry in
process with a capability minted per turn for the author it answers, through a tool adapter that marks each tool
foreground or operation-returning. That is the whole integration: no gateway, no second permission model, and a
harness's tools are untouched. The adapter's one new piece of state is the `Operation`: a row created before any
call that may outlive the turn, which is what makes promotion at the wait limit, approvals, cancellation and the
activity indicator one mechanism.

**Direct inference goes through the AI SDK hq already depends on**, behind a model adapter of our own that carries
the per-provider caching hints, the access resolution by home, and the conversation's talking model. The adapter is
the only place a provider's name appears; the coordinator, the context assembly and the summariser see one
interface. The same adapter runs the compaction summariser and the embedding calls' provider option, so a later
vendor compaction or realtime voice model slots in behind it without touching the record.

**The context is built to be cached.** Four parts in volatility order, three breakpoints, the ledger kept by the
coordinator from events, compaction into segments written once. This is built in its own phase after work and
results exist, because the ledger is fed by operation events and the summariser needs the model adapter; until
then the window is simply everything, which is correct for short conversations and lets the earlier phases ship.

**Shipping behind a flag.** The new conversation path lands behind a feature flag (the platform's rule for a
feature not ready), which is on in development and off in a production build: while it is off, today's harness chat
serves; when it is on, new conversations take the new path and old ones go read-only with the "continue in a new
conversation" courtesy.
The flag is removed at the close. This is what lets the unit's branch merge to `main` before the close if the
owner chooses to, without a half-built path reaching anyone.

**How the work is carried out.** One unit branch in the platform repository, cut when the roadmap change lands,
which merges to `main` once at the close unless the owner decides to land a phase earlier behind the flag. Each
phase runs as lanes under `running-lanes`: the lead commits each phase's contract first — schema, protocol types,
tool signatures — so every lane is cut from it; lanes whose files are disjoint run at once, the rest in the order
the phase lists; the lead merges them one at a time into the unit's branch, generates migrations, and runs the
suites lanes may not, with the full regression at the end of each phase. The owner walks the work through at
three points: after phase 2, when a conversation talks and commissions work and gets it back; after phase 4, when
memory and compaction are in; and after phase 6, the whole experience on web. Fixes from a walkthrough are small
lanes of their own. The decision records the spec earns are cut at the close, from the accepted spec, and the unit
closes with its QA contract.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0050 (dispatch and status cross the control channel) · adr-0072 (an agent is defined once in hq and overridden per boundary) · adr-0082 (a conversation acts with its current turn's authority) · adr-0086 (the site is a plain Node server) · adr-0090 (a connection to hq is a person's own) · adr-0091 (work agents cause is bounded by its depth) · adr-0096 (a conversation belongs to a place) · adr-0105 (a run uses the login of the person it is for) · adr-0116 (a feature not ready ships behind a flag). All Accepted. |
| **Implements** | adr-0020 (task delegation first, sub-agents deferred: helpers are the harness's own) · adr-0075 (only a conversation is ordered: the queue becomes durable) · adr-0082 (the turn's capability, now per author) · adr-0096 (a conversation belongs to a place, extended with the task home) · adr-0105 (access by home, the project first inside a project) · adr-0116 (the flag). The records the spec earned, written at the close: adr-0121 (the conversation record in hq, with direct inference for the lead) · adr-0122 (memory recalled by meaning in three scopes) · adr-0123 (knowledge delivered as excerpts, never indexed in hq) · adr-0124 (compaction in segments with a ledger) · adr-0125 (voice as a mode of the conversation) · adr-0126 (the tool's kind decides foreground or background) · adr-0127 (a conversation's home decides who may speak and who pays). |
| **Revisits** | adr-0058 (memory in two layers injected whole — superseded in part by the three scopes and recall on demand) · adr-0076 (a conversation whose harness state is gone is closed — no longer true for a conversation whose record is in hq; the worker is started fresh) · adr-0078 (a conversation keeps the runtime it started with — it keeps its talking model and access instead; the runtime is each worker's, per boundary) · adr-0081 and adr-0083 (a harness runs as its vendor intends; a process belongs to its conversation — both keep applying to workers, not to the lead) · adr-0030 (task-scoped sessions — the task's session now also serves the task's thread). Each is annotated, superseded in part, or confirmed at the close. |

## Key decisions

| Decision | Why |
|---|---|
| The lead is direct inference in hq; a harness runs only commissioned work | A reply at the speed of a conversation, one context we assemble and cache, and one path for every agent. The spec's governing principle. |
| **Against** a harness turn as a third access tier for Claude subscriptions | It made one tier of conversation behave unlike the others for one vendor's plan, routing every turn through a harness to reach it. Removed from the design. |
| The conversation record moves to hq; the site keeps runs | The screen is drawn from hq without a site round trip; a conversation stays readable with its site asleep; a run's detail is fetched only when opened. |
| **Against** copying old transcripts into hq | An import over the channel from a site that may be asleep, for threads people rarely return to. Old conversations go read-only with a one-time summary to continue. |
| Tools reach the one in-process entry with a per-turn capability | It is the entry both routes already use; a second gateway would be a second permission model. |
| The `Operation` row is created before any call that may outlive the turn | One mechanism for promotion at the wait limit, approvals, cancellation, idempotent admission and the indicator's count. |
| The tool's kind decides foreground or background; the lead never waits on a worker | A harness run never fits a few-second wait; the coordinator decides when to stop waiting and how much comes back, never who does the work. |
| Standing worker per boundary; helpers are the harness's own | Fan-out exists already in both harnesses and is metered per run; a platform subagent service would duplicate it with no bound. |
| The AI SDK behind a model adapter of our own | hq depends on it already; the adapter is where provider differences, caching hints and access live, so nothing else learns a provider's name. |
| Compaction in segments written once, in our own code | A rolling summary decays and breaks the cache; a vendor's compaction is opaque to the record. Our own is one summariser prompt and three tools. |
| Memory in hq's Postgres, searched exactly, with a bundled local embedding model (`pgvector` when an organisation outgrows it) | No second store, no vendor and no key by default; thousands of rows search in milliseconds; a provider model is an option that re-embeds once. |
| Voice as a mode of the conversation, speech to text and text to speech around the same turn | The record, memory, tools and policy run on text, and it is the pattern people know from the assistants they use. A realtime model fixes the vendor outside the policy. |
| The new path ships behind a flag; the old chat serves until the flag is on | The platform's rule, and what makes landing a phase before the close safe. |
| Phases cut at the spec's parts, context assembly after work and results | Each part is a layer that can be finished and tested on its own; the ledger needs operation events and the summariser needs the adapter, so compaction comes fourth. |
| **Against** one phase per screen or per table | The parts are the seams a later reader will look for; a phase that is "the next twenty tasks" has no deliverable. |
| Sign in with ChatGPT last, gated on the client id | The API-key tier is complete without it; waiting on a vendor must not hold the rest. |

## Work breakdown

**This is the source of truth for progress across the whole unit.** Seven phases, cut at the spec's parts: the
record and the lead first, because everything else writes into that record; work and results second, because
memory, compaction and the thread's items are built on operations and completions; memory before compaction,
because compaction leans on memory; voice and the thread last, because they are surfaces over a finished layer;
Sign in with ChatGPT when the vendor allows. The task thread sits in phase 6 with the screens it needs, but the
coordinator is author-aware from phase 1 so nothing is retrofitted.

### Phase 1 — The record and the lead
**Delivers:** behind the flag, a person talks to their primary agent through direct inference on an API key; the
conversation, its messages and turns live in hq, encrypted at rest; messages during a reply queue durably and
survive a restart; the lead calls hq's own tools in process; old conversations are read-only with the courtesy.
**Starts when:** —
**Execution plan:** none — lanes. The contract (schema, protocol types, adapter interface) is committed first by
the lead; the lanes read the code from there.
*Acceptance:* [`spec/conversation-layer.md`](spec/conversation-layer.md) and [`spec/model-access-and-policy.md`](spec/model-access-and-policy.md), the API-key criteria.

- [x] 1.1 Schema: `Conversation` (home, opener, agent, status, closed reason, talking model and access, the turn lock, archived, keep, voice holder, ledger), `ConversationMessage` (kinds, author, flags, encrypted content), `InferenceTurn`, `Operation` (one state set), `ConversationSegment`; the notification and artefact links; the migration
- [x] 1.2 Message encryption at rest with hq's data key, and the home's reading rule enforced in hq
- [x] 1.3 The feature flag, and the routing: a new conversation takes the new path when it is on; old ones are read-only with *start a new conversation* and *continue in a new conversation*
- [x] 1.4 The coordinator: admission with a stable id and order, the one-turn lock with a lease, the durable queue, Wait or Interrupt by the person's setting, merging only consecutive messages by one author
- [x] 1.5 The model adapter over the AI SDK: provider abstraction, streaming, the per-provider caching hints, usage and timings on the turn
- [x] 1.6 Access by home: a personal or project conversation on its person's API key in today's order; the talking model chosen at open; the "access stopped being usable" offer and the recorded switch
- [x] 1.7 The model policy: talking, light and heavy work, allow-list and ceiling, set for a person's space and a project with the organisation's as default; the project's model override replaced by it, nothing converted
- [x] 1.8 The turn's capability minted for the author it answers, and a conversation-turn caller context at the one tool entry
- [x] 1.9 The tool adapter: hq's foreground tools presented to the model, the wait limit, the result cap, the `Operation` row created before a call that may outlive the turn, promotion that detaches the same call
- [x] 1.10 The lead's base instructions: register, one point at a time, the tool-or-worker rule, when to ask
- [x] 1.11 Streaming to the browser from hq, replay of committed output on reconnect, Stop on a reply
- [x] 1.12 The primary agent: the personal setting, Kernel as default, the picker limited to the home's agents before the first message
- [x] 1.13 The thread on web: messages from the record, paged newest first, the waiting message with *Send now · Cancel*, the closed notice, the message box
- [x] 1.14 The report of a failed turn as a card with its reason, kept in the record
- [x] 1.15 Recovery: pending messages, turn ownership and the mailbox survive an hq restart; a browser disconnect loses nothing
- [x] 1.16 Observability: message-to-first-token, turn duration, queued wait, tool acknowledgement time, errors and cancellations
- [x] 1.17 Tests: the contract tests for admission, the lock, the queue, access by home, the adapter's hints, and the thread's paging
- [x] 1.18 The model picker ([board](boards/model-picker.html)): the talking model chosen before the first message and changed at any time, from the models the person's access reaches within the policy — search, recent first, grouped by maker, a price hint; a switch as a quiet line; the same picker in the model policy's forms

### Phase 2 — Work and results
**Delivers:** the lead commissions work in any boundary the person and agent share, each operation admitted on its
own; workers, tasks and detached calls complete into the mailbox; every completion gets its report turn and the
notification carries its first line; approvals are presented in the thread and answered as messages; the activity
indicator and sheet show the work; anything can be stopped.
**Starts when:** phase 1 is merged into the unit's branch and the owner has talked to an agent through it.
**Execution plan:** none — lanes. The operation state set and the completion event shape are the contract,
committed first.
*Acceptance:* [`spec/workers-and-results.md`](spec/workers-and-results.md), and the operation, approval and
activity criteria of [`spec/conversation-layer.md`](spec/conversation-layer.md).

- [x] 2.1 `start_work`: the boundary argument listing the shared boundaries, the three admission checks at that moment, the operation's capability minted for its boundary, the standing worker per boundary over today's dispatch, briefs queued one at a time per worker
- [x] 2.2 The worker's result summary, its link to the run, and the completion event from the site into the mailbox
- [x] 2.3 `run_task` as an operation-returning tool, its description corrected; `create_task` with `when: now · later · <schedule>` and the operation only for the queued ones; the *scheduled* state
- [x] 2.4 `set_result`: a run's agent states its result; written to the run and to the task's result; a run that ends without one is marked
- [x] 2.5 The report turn after every completion, several completions sharing one, the continuation turn in its place for an authorised sequence, report turns outside the turn limit
- [x] 2.6 Continuation obligations: durable, carrying the authorising person and turn, checked against permissions, limits on turns, depth and spend
- [x] 2.7 Approvals: the lead's tool at *ask* (required reason, waiting state, card, the reply finished in words); a worker's request as a mailbox event presented in a turn after the current one; the worker's last words as its reason
- [x] 2.8 `answer_approval`: the answer as a message, the answerer's checks re-run, approve and decline, the lead's turn on it, closing a conversation declines what is waiting
- [x] 2.9 `cancel_operation` and Stop on every operation row and card; cancellation to the owning service; a cancelled turn's in-flight call detaching to a card without a report turn
- [x] 2.10 The activity indicator counting the right states, and the sheet: one row per operation with its state, live helper lines as a path from the run's work steps, Stop
- [x] 2.11 The cards in the thread: operation started, completion with *View results* fetching the run then, approval request and answer, failed with its reason; the notification with the turn's first line, or the result's own line when no turn can run
- [x] 2.12 The *uncertain* state and reconciliation for hq's own outside calls after a restart; idempotent admission mapping a repeated call onto the pending operation
- [x] 2.13 Deleting a conversation: worker operations cancelled, task operations detached, the confirm naming what goes and offering archive
- [x] 2.14 Tests: admission checks, the state machine, promotion without duplicate side effects, report and continuation exclusivity, approvals both ways, cancellation, duplicate delivery

### Phase 3 — Memory and knowledge
**Delivers:** memory is records in hq with a vector each, in three scopes, recalled by meaning and ranked by hit
rate; the probe's three tiers inform the lead; workers get pinned items and the same recall; a place's knowledge
reaches the lead only as a bounded excerpt; the memory screen shows the scopes and the measurements.
**Starts when:** phase 2 is merged, so recall has operations and briefs to serve.
**Execution plan:** none — lanes. The item shape and the `recall`/`remember` signatures are the contract.
*Acceptance:* [`spec/memory-and-knowledge.md`](spec/memory-and-knowledge.md).

- [x] 3.1 The vector column on the memory table, searched exactly in hq (no `pgvector` for now: Deviations)
- [x] 3.2 The item: title, tags, type, key assigned by hq from scope and slug, body cap, pin, hit count, last recalled, supersedes; the agent × place scope; today's items not converted
- [x] 3.3 The local embedding model as a platform component, loaded once in hq; the provider option that re-embeds in the background
- [x] 3.4 `remember` with dedupe by similarity (supersede or merge), and the refusal of an item that cannot stand alone
- [x] 3.5 `recall` by key and by query: similarity × warmth, pinned first, scope filters, top-k under a token budget, provenance on each item
- [x] 3.6 The probe before a turn: the composed query, the three tiers, the hint line, the turn block; the lead's recall rules in its instructions; nothing stored
- [x] 3.7 Outcomes recorded — used, unused, missed — and the bars per organisation
- [x] 3.8 Workers: the pinned items of the person the run is for projected as files at run start, `recall` through the site's endpoint under the run's capability, helpers inheriting it; `remember` from a worker
- [x] 3.9 The person a run is for: the commissioning author on the operation; a pulse or routine run reaching agent × place only; the one rule for which runs may use the memory tools
- [x] 3.10 Knowledge: `recall(query)` asking the place's site for a bounded excerpt over its files with provenance, non-forwardable; unavailable and over-budget answers; the `knowledge/` prompt convention retired in favour of the agent × place scope
- [x] 3.11 The memory screen: the place scope, edit, pin and delete, the recall measurements
- [x] 3.12 The tidy run: merge duplicates, archive cold items
- [x] 3.13 Tests: embedding and ranking, dedupe, the tiers against calibrated fixtures, scope filters, the excerpt's bounds and non-forwarding

### Phase 4 — Long conversations
**Delivers:** the lead's context is assembled in four parts with three cache breakpoints; the ledger survives any
compaction; compaction folds the oldest messages into a segment written once; the lead zooms with `expand` and
`messages`; the thread shows summarised markers that open; workers start fresh between operations past a high mark.
**Starts when:** phase 3 is merged, so compaction has memory to lean on and the turn block exists.
**Execution plan:** none — lanes. The segment row exists from phase 1; the context assembly interface is the contract.
*Acceptance:* [`spec/long-conversations.md`](spec/long-conversations.md).

- [x] 4.1 Context assembly: instructions and policy, the compaction block, the window, the turn block appended to the turn's message; nothing in the first three parts changing within a turn
- [x] 4.2 The ledger kept by the coordinator from events, the `ledger` tool for the lead, trimmed and bounded
- [x] 4.3 Compaction: the marks in and out, at the start of a turn only, one summariser call on the talking model over the cached prefix, the segment with span, brief and full summary, the block rebuilt, the summarised message in the record; *Summarise now*
- [x] 4.4 `expand` for one, several or all segments in span order, appended as a tool result, what does not fit named; `messages` paged from the record; the lead's zoom rules; expansions cited rather than re-summarised at the next compaction
- [x] 4.5 The three breakpoints and the cache key per conversation in the adapter, measured against the providers' documented behaviour
- [x] 4.6 Workers: context use shown, a standing worker started fresh between operations past the high mark, never mid-run; a task's session compacted between runs as today
- [x] 4.7 On screen: the summarised marker with span and brief, opening to the full summary and the messages; the new-conversation offer when the subject drifts
- [x] 4.8 Tests: the assembly's stability within a turn, compaction at the marks, a segment never rewritten, expansion appended, the ledger surviving compaction

### Phase 5 — Voice
**Delivers:** voice is a mode of the conversation on the web: the pill message box, the reply's text in step with
the voice, interruption, mute and End beside the pill, the bar on other pages, the register and shown parts,
approval by read-back; the record carries the quiet lines and flags; the call screen and the input modes are gone.
**Starts when:** phase 2 is merged; it can run beside phases 3 and 4, since it touches the voice module and the
composer and not the coordinator's internals.
**Execution plan:** none — lanes. The voice socket events and the record's voice kinds are the contract.
*Acceptance:* [`spec/voice.md`](spec/voice.md).

- [x] 5.1 A spoken turn through the coordinator: speech to text into the person's bubble, sent on the speech service's pause, the *spoken* flag, Wait or Interrupt applied, anyone who may send may speak, the voice holder on the conversation
- [x] 5.2 Text to speech from the lead's stream sentence by sentence with word timings; the reply's bubble revealed at playback speed, nothing highlighted
- [x] 5.3 The pill message box: plus, text, dictation, the one right button; mute and End beside it, hidden while typing; the glow and the ring
- [x] 5.4 Interruption: audio stopped, the turn cancelled, the record keeping what was heard with the *interrupted* mark, the voice session kept up
- [x] 5.5 The register in the turn block and the lead's instructions; shown parts: the fenced block, the spoken line in the body's place, the card, the viewer beside the thread without stopping the voice, inline outside voice mode; stripping of stray markup
- [x] 5.6 Approval by voice: the read-back, the spoken yes turned into `answer_approval` by the lead, recorded as spoken
- [x] 5.7 The report turn's speech after the current sentence of playback; a worker's request presented aloud in its turn
- [x] 5.8 The slim bar on every page while voice is on; closing the tab ends voice; voice continuing across navigation
- [x] 5.9 The record's voice lines and the silence end from hq, read by web and phone; the setup reasons on the greyed button
- [x] 5.10 Removal of the call screen, the karaoke subtitles, and the tap, hold and trigger-word modes and their settings; the user guide's voice page updated
- [x] 5.11 Tests: the reveal against hq's timings, pause to send, interruption, the shown-part parser, the holder rule

### Phase 6 — On screen and the task's thread
**Delivers:** every item of the record renders from the catalogue on web; approvals say why; closed conversations
are marked; deleting names what goes; conversations archive; runs are found from a conversation; the task's thread
exists as the team's, with its lead following the task and the project paying; the richer items chosen are built.
**Starts when:** phases 2 and 4 are merged; the task thread needs results, the catalogue needs the segments' markers.
**Execution plan:** none — lanes. The catalogue table in the spec is the contract.
*Acceptance:* [`spec/on-screen.md`](spec/on-screen.md), and the task-thread rules in the overview.

- [x] 6.1 The catalogue on web: every item from the record, prose first, one-line cards opening on tap, the author shown once more than one person has spoken
- [x] 6.2 The task card and the action line with *Show in …* opening the tool with the item marked
- [x] 6.3 Closed conversations marked in the list with the reason; *from before* marked read-only; the closed notice's two lines; harness-state-missing no longer closing a conversation whose record is in hq
- [x] 6.4 Archive: ninety idle days tunable, keep, reopen, a completion waking an archived conversation; the *Deleted* confirm with Archive beside Delete; controls visible without hover; a workspace delete naming unpushed files
- [x] 6.5 The Runs screen's conversation filter from the conversation's menu, and message search asking the site only when used
- [x] 6.6 The task home: the thread created on first message on the task's page, readers and speakers by the task's visibility, the lead read from the task and following reassignment with the quiet line, the unassigned notice, the project paying on the project policy's talking model
- [x] 6.7 In a task's thread: `start_work` as `run_task` on the task, every run of the task posting a card and a report turn, runs the thread did not commission not counted, the thread mark with unread count on the board card, not in the project's chat list
- [x] 6.8 Team-thread rules: approvals answered by anyone passing the asker's checks and named; notifications to speakers and the person the task is for; voice one holder at a time; archive with the task, close with its deletion, delete by a project administrator only
- [x] 6.9 Refused actions of the person's own showing the server's reason in one shared way
- [x] 6.10 Tests: the catalogue's rendering per kind, archive and wake, the task thread's lead on reassignment, the payer by home, the board mark

### Phase 7 — Sign in with ChatGPT
**Delivers:** a person's personal or project conversation can run on their ChatGPT plan through *Sign in with
ChatGPT*, first in the access order, behind the flag.
**Starts when:** OpenAI has issued the client id; phase 1 is merged.
**Execution plan:** none — lanes.
*Acceptance:* the conditional criterion of [`spec/model-access-and-policy.md`](spec/model-access-and-policy.md).

- [ ] ~~7.1 The sign-in flow and the stored grant, per person, with the vendor's weekly cap surfaced~~
- [ ] ~~7.2 The adapter's route for plan-backed OpenAI requests, first in the access order for personal and project conversations, never for a task thread~~
- [ ] ~~7.3 The "cap spent" case: the conversation says so and offers the next access, recorded~~
- [ ] ~~7.4 Tests: the order, the cap, the exclusion of team threads~~

*Dropped from this unit at its close (2026-10-17): OpenAI had not issued the client id. Planned separately as its own work.*

## Deviations

| Phase | What changed | Why |
|---|---|---|
| Walkthrough | A reply's lookups show as one greyed pill in the name line, *Thinking · N s* / *Thought for N s*, with the steps on click; a step's tools run at once (`spec/on-screen.md`, `spec/conversation-layer.md`) | The owner: the typing indicator said nothing during a 14 s reply; thinking is for inspection, not for every reading |
| Walkthrough | A reply that runs long carries on in the background after 4 lookup steps, started by hq itself with a fixed line and no model call; the 8-step cap is only a guard (`spec/conversation-layer.md`, Inference turn) | The owner: at the cap a reply ended silently; long reasoning belongs in the background. Asking the model to write the brief cost 8–20 s and was ignored or refused, and a time limit added nothing the step count did not |
| Walkthrough | A step that only starts work ends the reply, with no further model call; a result always gets a reply (`spec/conversation-layer.md`, Inference turn) | The owner: starting work needs no turn, a result does; the announcement repeated the card and pushed the approval request away from its work |
| Walkthrough | Each turn's input carries the current date and time (`spec/conversation-layer.md`, Inference turn) | The walkthrough: asked to start a task tomorrow at 9, the agent said it could not |
| Walkthrough | The agent speaks of its background work as its own, first person (`spec/workers-and-results.md`) | The owner: the agent and its workers read as separate identities |
| Walkthrough | A tap answering an approval takes no turn of its own when a result will follow (every approve; a worker's decline); the result's one reply covers it (`spec/conversation-layer.md`, Approval) | The owner's walkthrough: one piece of work got three replies — with the request, on the decline, and with the result |
| Walkthrough | The agent always says in one line what it started, in the same step as the call; hq writes a fixed line in its voice when the model wrote none, and words that claim a start with no call get one more step (`spec/conversation-layer.md`, Inference turn) | The owner's design talk: every turn says something; with the work's card gone from the thread, a wordless start left nothing to read, and once the agent said it had started work it never started |
| Walkthrough | The agent's history carries a record line, written by hq, for each piece of work a reply started or task it set (`spec/conversation-layer.md`, Inference turn) | The walkthrough: after a quiet start the agent's history showed the ask unanswered, and the next turn did the work again |
| Walkthrough | The thinking pill shows from the moment a reply starts, with a pulsing dot while it runs, and counts what the reply started and set; there is no other typing indicator (`spec/on-screen.md`) | The owner's design talk: thinking is the turn, and what a wordless turn did belongs in its pill |
| Walkthrough | One work bar, the last item in the thread, holds the conversation's live work and every request for the person's okay; the header's activity count and sheet are gone (`spec.md`, decision 9; `spec/conversation-layer.md`, The work bar; `spec/on-screen.md`) | The owner's design talk: one place for live work, with requests beside the work they belong to |
| Walkthrough | A request for the person's okay takes no turn: the agent says nothing, the person is notified with the request's own line and answers it in the work bar (`spec/conversation-layer.md`, Approval; `spec/voice.md`) | The owner: the agent shouldn't say anything when a request arrives |
| Walkthrough | Each turn of the agent is one block under one name line: the cards of what completed that it answers head its words; *Copy* sits under a finished reply; no system lines in the thread (`spec/on-screen.md`) | The owner's design talk: a completion's card belongs with the agent's reply to it; system lines should be cards |
| Walkthrough | A reply stopped before it said anything stays in the thread as *Stopped* under the agent's name, keeping its steps (`spec/on-screen.md`, `spec/conversation-layer.md`) | The walkthrough: a reply stopped early left no trace, and read as ignored |
| Walkthrough | A task set for a time completes when it is set: its operation is written completed with the start time, its card in the reply is still (the time, no spinner, no *Stop*), it is never in the work bar, nothing of its runs comes back, and a follow-on step is refused for it (`spec/workers-and-results.md`, `spec/conversation-layer.md`) | The owner: once the agent says it is scheduled it is finished for the person; a scheduled task that has not started should not come back to the conversation |
| Walkthrough | Work asked for in a project where the agent is not assigned is asked for anyway, beside any other work, and refused with the reason in the same reply; work in several places starts together in one step (`spec/conversation-layer.md`, Commissioning outside the place) | The owner: if the agent has no access it should say so, right away; only agents assigned to a project may work in its files |
| Walkthrough | *Summarise now* returns at once; *Summarising…* shows until the marker arrives, and a later failure comes back as an event (`spec/long-conversations.md`) | The walkthrough: the request waited on the whole summary and the browser gave up after 10 s, showing an error though the summary landed |
| Walkthrough | *Show in Memory* opens Settings › Memory with the item marked (`spec/memory-and-knowledge.md`, `spec/on-screen.md`) | The walkthrough: the link opened the chat list; the person's own space has no Memory tool, and a project's holds agent × place items only |
| Walkthrough | The message box puts its text above the whole width from two lines, with the buttons in a row underneath (`spec/on-screen.md`, `spec/voice.md`) | The owner: long text should take the full width above the controls, as the phone app's box does |
| Walkthrough | Dictated words appear in the box as they are spoken and are corrected in place; Send and Stop keep what is still being heard, and the first words are held until the connection opens (`spec/voice.md`) | The owner: words appeared late and the start of what was said was lost; they should show as spoken and be corrected in place |
| Walkthrough | Voice keeps the agent's own voice out of what it hears, by its words in order, and cutting in takes two of the person's own words; loudness no longer cuts in (`spec/voice.md`) | The walkthrough: on laptop speakers the agent heard itself, which cut every reply; then, with the first guard, the person could not cut in |
| Walkthrough | Voice uses a fresh connection to the speech service per message, sends audio at the pace it is heard with no bursts, and fetches its token ahead (`spec/voice.md`) | The walkthrough: the person's words came 10–20 s late and growing; measured, the lag grows on a long connection and a burst of held audio becomes lasting lag. Voice is still unreliable on laptop speakers |
| 1 | Conversations from before are not turned into `Conversation` rows: they stay chat sessions read through today's path, which stops sending while the flag is on; `recordOn` is dropped. The project's model override and today's memory items are replaced, not converted | The repository's clean-slate rule before the first release: no code converts existing rows |
| 1 | The flag is the build's (on in development, off in production), not an organisation's | adr-0116 as it stands; one hq is one organisation, so the effect is the same |
| 1 | The one-turn lock's lease is held on the conversation (`activeTurnId`, its lease), claimed by a conditional update | Prisma 5 cannot declare a partial unique index on the turn table; one conditional update on one row is the same guarantee |
| 1 | A task's session stays on today's path until phase 6 builds the task's thread | Making it read-only in phase 1 would leave no way to talk on a task until then |
| 1 | The talking model is the person's to change at any time, from a model picker in the conversation (task 1.18), not fixed when the conversation opens | The owner's try of phase 1: the model is a choice they want in the conversation; a provider caches per model, so a switch costs one uncached reply and nothing more |
| 2 | A worker that asks for approval ends its run and the answer continues it in a new run of the same session, instead of pausing on the site | That is how a run asks today (a run never waits for an answer): pausing a harness mid-run on the site would be new site machinery for the same outcome |
| 2 | A run's stated result is kept in hq (`RunResult`), and a worker's result summary is what it states with `set_result`, or its last reply when it states none | The site's run has no result field; one place in hq serves the completion card, *View results* and the task's thread |
| 2 | The briefs queued on a standing worker wait in hq, not on the site | A brief waiting in hq survives a site restart, can be stopped without reaching the site, and shows *queued* in the sheet |
| 2 | A standing worker is one per conversation, boundary **and the person it works for** | A worker's runs act as its session's person; one worker shared by several people in a task's thread would have run one person's brief with another's authority and memory |
| 2 | Closing a conversation leaves a task's waiting request on the task instead of declining it | Declining it would block the project's task for everyone, for example when one member leaves the project |
| 3 | No `pgvector`: each item's embedding is a `Float[]` column and recall is an exact search in hq, behind the store's one search function | Every install's database is a pinned `postgres:16-alpine`; `pgvector` means an image of our own or a move off Alpine with a collation risk to existing indexes, for a search the spec already sizes as exact over thousands of rows |
| 6 | Artefacts are not yet recorded against the conversation that made them; the delete confirm counts messages and runs only | Artefacts are files on the site with no record in hq; recording each needs a site-side record per file — raised as its own issue at the close |
| 6 | A workspace delete names what is lost in general terms, not its unpushed files | The site reports no workspace git status today; a count needs a new site method — raised as its own issue at the close |
| Close | A project's own task runs are given no person's memory: no person's pinned items, and the memory tools reach the place's memory only; a person's scopes are reached only from a run in their own home | Found at the close: a project's task runs share one harness home and container, so a person's memory given to one run there could reach the others. Contained here; giving each person's task runs a home of their own is planned separately |

## Closing note — 2026-10-17

**Accepted** by the owner on 2026-10-17, after a walkthrough of parts 1–5 that passed parts 1, 2, 3 and 5 through
four fix passes (findings recorded during the walkthrough, fixed in lanes, design changes corrected in the spec in
place with a row each in Deviations above). **Voice (part 4) did not pass:** on a laptop's built-in speakers the
person's words lag, the lag grows, and cutting in arrives late, which **blocks release**. Phases 1–6 are
built; phase 7 is dropped from this unit (above).

**Open items:** 125 gathered from the walkthrough, the lane reports and the handover, each checked against the code
at head — 57 closed, with evidence; 67 deferred, as issues here and as work planned separately
(features, and two security-hardening items kept out of public until fixed). One critical item found at the close
— a person's memory could reach runs that share a project's harness home with other members' runs — was contained in
the unit before the merge: those runs are now given the place's memory only (Deviations). Giving each person's task
runs a home of their own is planned separately. **Blocking release:** voice on laptop speakers, and the conversations still being behind their
feature flag, off in production, with today's chat path beside them.

**QA:** the unit's contract is written — stories US-316–US-328, scenarios SC-940–SC-1018, with their tests tagged;
eight older scenarios retired. **No QA audit ran at the close** (the owner's choice); these entries await the audit
before the release.

**Decision records:** seven new (adr-0121 to adr-0127, Accepted); an "acted on" note on adr-0020, 0075, 0082, 0096,
0105 and 0116; adr-0058 superseded in part by adr-0122; adr-0030, 0076, 0078, 0081 and 0083 annotated. Reference
documents updated: architecture (a new conversation-layer page), concepts (a new conversations section, memory
rewritten), the user guide and the QA contract.

**Regression at the close:** core 376, hq typecheck, unit 3,951 and integration 4,014, site typecheck, unit 2,222,
integration 40 and container 96, ui typecheck, and the cross-app suite 29 — passing. The container suite's relay
check, which also failed on `main` once Claude Code began counting tokens through the relay, was corrected in the
unit.

