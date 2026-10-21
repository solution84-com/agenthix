---
name: Conversation layer
description: The coordinator: turns, the durable queue, foreground and background operations, the tool contract, continuation, failure and recovery, the work bar.
created: 2026-10-16
author: leang
---

# Conversation layer

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-16, building phase 2: a worker that asks for approval ends its run, as a run that asks does
today, instead of pausing on the site; the answer continues it in a new run of the same session. Closing a
conversation leaves a task's waiting request on the task instead of declining it.*

*Changed 2026-10-17, the walkthrough: a turn's steps are kept with its reply and read back by the agent; the agent
always says in one line what it started, and hq says it when the model did not; a long reply carries on in the
background; each turn carries the date and time; work in a place the agent cannot reach is asked for anyway and
refused with the reason; a request for the person's okay takes no turn; a task set for a time completes when it is
set; one work bar replaces the activity indicator and its sheet.*

## Lifecycle contracts

### Conversation
Persists independently of inference. Today a conversation is ACTIVE, EXPIRED, ARCHIVED or CLOSED, with a closed
reason; this design keeps ACTIVE, ARCHIVED and CLOSED and stops producing EXPIRED, which nothing in it needs.
ARCHIVED is hiding, not closing: it goes back to ACTIVE when the person reopens the conversation, and when a
completion or an approval request arrives in it, so the report turn runs and the notification brings the person
back; a conversation with outstanding operations may be archived by hand. CLOSED is final: closing declines its
workers' and its own waiting approval requests, so no worker is left waiting on an answer — a task's request is
the task's and stays on it for the project to answer — and lets its other operations finish on their own
(*Failure, recovery*). A task's thread closes when its task is deleted and archives with its task; a person
leaving the project loses access to it and the thread goes on. *(The draft's Active / Suspended / Closed is
replaced by these; nothing suspends a conversation.)*

### Inference turn
**Queued → Running → Completed**, or **Failed / Cancelled**. Running includes streaming and bounded tool
acknowledgements. Exactly one turn owns inference for a conversation at a time; ownership recovers safely after a
failure or restart.

**A turn is a short loop of steps.** A step is one model call; it answers in words, or asks for tools, which run at
once — results kept in the order asked — and go back to the model for the next step. Each step that looked
something up is kept with the reply, in a person's words and with its time, and so is each piece of work it started
and each task it set for a time, one step each (*On screen*, the thinking pill). Each turn's input carries the
current date and time in the person's time zone (UTC when they have none set), so the agent can act on "tomorrow
at 9". **A step that only starts work ends the reply** — start work, run a task, create a task — and the model is
not called again; a step that also looked something up carries on. **The agent always says what it started**, in
one short line in the first person, in the same step as the call. When that step wrote no words, hq writes a fixed
line in the agent's voice naming the work, with no model call: *I've started: …*, *I've set … to start Sun 18 Oct,
9:00*, or *I've asked for your okay to start: …* for work waiting at *ask*. Words that say work has started when no
call of the reply started any are not taken as done: the model gets one more step, told that nothing has started,
to make the call or say so. **The agent reads back what it started**: in its history each reply carries one record
line, written by hq, for each piece it started or set — `[Record: started "…" · your space]` — so a later turn never
takes the person's ask as unanswered and does it again. A reply stopped before it said anything is kept, empty and
marked interrupted, with its steps. A result always gets a reply. **A reply that runs long carries on in the background:**
after 4 steps that looked something up, hq starts the rest as work itself, with no model call — in the
conversation's own place, its brief the person's message word for word and what the reply found and started so
far — and ends the reply with one fixed line in the agent's voice: *That's taking longer than I expected — I'm
working on it in the background, and I'll tell you as soon as I have it.* Where work cannot be started there (no
place, start work not offered, the work refused or waiting for an okay), the next call is words only. The cap of 8 steps
stays as the guard: its last call is always words only, so a reply never ends without saying anything.

### Foreground and background operations
An **operation** is an invocation of a tool or service capability, fulfilled directly or by a harness or worker. A
**foreground operation** is a bounded, quick call whose result the current turn needs. A **background operation**
is deferred work that does not hold the turn open and whose result arrives independently. This is a distinction of
experience and lifecycle, not a claim that every operation has its own worker.

**Non-blocking invariant:** no operation holds conversational inference beyond the wait limit. The tool's kind
decides the mode; the coordinator checks the capability and enforces the wait limit. At expiry the
**existing** invocation is detached, never restarted; a pending acknowledgement and operation id are returned, and
completion is tracked in the mailbox. An operation that cannot continue durably and be retrieved cannot be promoted:
it is adapted, held to a safe mode, or returns a controlled timeout or uncertain-status outcome to be reconciled.
Promotion is never claimed when it cannot be guaranteed.

### Background operation
**One set of states for every operation**, whatever its kind: *waiting for approval* (the lead's own tool at *ask*,
before anything runs; or a worker's harness asking, during running, which the row shows as waiting) → *accepted* →
*queued* → *running* → *uncertain* (hq's own outside call
cut by a restart, until reconciled) → *completed* / *failed* / *cancelled* (stopped, or declined) / *detached*
(terminal: severed from a deleted conversation; a task operation only). Promotion of a slow foreground call
changes no state — it is still *running* — only whether the turn waits; the operation records that it was
promoted. A task set for a time is done once set: its operation is written *completed*, holding the task and when
it starts, and nothing of its runs comes back to the conversation. The work bar's words map onto these: queued
(accepted or queued), working (running or uncertain), waiting for approval. The owning service may be more specific
inside *running*.
Operations may outlive their turn and the browser connection. hq holds a correlated projection, not the
authoritative record.

### A message while a reply streams
1. Authenticate and authorise the sender; store a stable message id and its order.
2. If a turn is active, queue the message without cancelling or changing that turn.
3. Finish the active turn; take queued messages in order.
4. Several messages may go into one later turn only if their order and content are kept and they are consecutive
   messages by one author; a change of author is always a new turn.

*Today's behaviour, to reconcile:* turns are already serialised per conversation and a busy message waits as a
pending run, but the queue is in the site's memory and a site restart loses it; a person can also choose to
interrupt the running turn instead of waiting. This design keeps the person's choice and makes the queue durable.

### A completion while a reply streams
1. Receive, store and deduplicate the event; correlate it to its operation and workflow.
2. Leave the current inference and its stream untouched.
3. After the turn, take queued messages, then **one turn** for every completion that has arrived since the last
   (a request for the person's okay takes none: *Approval*): a **report turn** that speaks and starts no work, or, when the completion belongs to a
   sequence the person authorised, a **continuation turn** in its place, which presents the result and may do the
   next authorised step. Never both for one completion.
4. The notification goes out with that turn's first line. When no turn can run — the conversation's access is
   unusable, or it is closed — the notification carries the result's own one-line summary instead.
5. A turn cancelled with a foreground call in flight — the person interrupted, or pressed Stop — lets the call
   detach and complete: its result becomes a card, with no report turn, since the person cut the turn that asked.

## Tool execution contract

*Diagram: [Where the conversation's tools live](../diagrams/tools.md).*

**Where the tools live.** Every Agenthix tool is defined once, in hq, behind one entry with one permission check.
A harness run reaches it through the site's MCP endpoint, which forwards each call with the run's capability. A
conversation's inference turn reaches the same entry in process: the turn mints a short-lived capability carrying
the author of the message the turn answers, the agent, the home and that person's tool permissions — a
conversation acts with its current turn's authority, and in a task's thread that is whichever member spoke — and
a tool adapter presents the operations to the model, each marked foreground or
operation-returning. hq's own MCP endpoint stays what it is, a person's external connection.

**Turns that answer no person.** A report or continuation turn answers an event, not a message: the coordinator
writes the event — the completion, the approval request — as a message authored by the platform, and the turn
block is appended to it, so the context rule in *Long conversations* holds. Its capability is the home's reading
authority; for a continuation turn, the authorising person's. The memory probe for such a turn searches agent ×
place and the scopes of the person the operation was for, who is the author of the message that commissioned it.

**Commissioning outside the place.** The turn's capability is the conversation's place's; an operation's is its
own boundary's. The start-work tool takes a `boundary` argument and lists the boundaries the person and the agent
share, so the lead never guesses, and asks when the person's words leave it open. At admission the coordinator
checks three things as they stand at that moment — the person is a member of the boundary; the agent is assigned
there, with its override; the tool is allowed there — and mints the operation's capability for that boundary from
them, never from the conversation's place. A check that fails refuses the operation and the lead says so in words
("you're not a member of Finance"), in the same reply. Asked for work in a project the person works in where the
agent is not assigned, the lead still calls the start-work tool there, beside any other work: the tool's
description lists those projects apart from the ones it can work in, hq's refusal comes back with its reason (a
project admin can assign the agent), and the reply goes on to say so. Work asked for in several places starts
together, one operation per place, in one step. The three are checked again before any continuation turn. Nothing is unioned:
a worker holds its boundary's authority and none of the conversation's place's, and what returns to the
conversation is the worker's result summary, which is the conversation's to hold.

**The tool's kind decides the mode.** *Foreground tools* have no model in them and answer within the wait limit: hq's
own operations — read a task, list a board, create a task for *later* — a read from a site, such as a file in a workspace over
the channel, and, when a person has connected an outside service to hq, that service's tools under the person's
own connection, called the same way. The lead calls them directly and waits. Still pending at expiry, the same
operation is **promoted to background** and its durable reference returned, which is for the site that is slow,
not for work that was never quick. *Operation-returning tools* — start work in a boundary, run a task, create a task for *now* — have a
model in them or lead to one, so they are background by kind: they create an `Operation`, return its reference and detach at once, and
the result comes back as a completion (*Workers and results*). Creating a task for a time is neither: setting it
is the whole of the call, so its operation is written completed at once, with when the task starts, and its card
shows in the reply; nothing comes back. The lead may ask a foreground tool to go to the
background when the person said to keep talking; it cannot ask a worker to wait. The platform supports continued
execution, status and result retrieval, and completion delivery after detachment. A call that starts a worker is
itself an operation; the worker may call more. Not every tool call or autonomous task run is a conversation-scoped
background operation.

**Detaching, step by step.** The coordinator creates the operation row, with its id, before it starts the call —
an HTTP request from hq to an outside service, or a read sent to the site over the channel. The turn waits up to
the wait limit. At expiry the coordinator returns `{operationId, status: accepted}` to the model as the tool's
whole answer, and the turn goes on: the lead may say the call is taking a moment, once. The request already in
flight carries on untouched; when it returns, the result is written to the operation and a completion enters the
mailbox, and the report turn answers the question the call was for. The bytes delivered are the ones that were
being fetched when the turn stopped waiting: nothing is cancelled and nothing is started again, which is why a
slow write is safe to detach and would not be safe to re-run.

**Once, not a loop.** A call detaches once, and that is final for it: there is no "wait more" to ask for, and the
lead does not see the call again until it completes. An identical call while the first is pending is the same
operation — idempotent admission returns the pending reference and "already running" — so a retry starts nothing.
The lead's instructions add: when a turn has had a call detached, fire no more foreground calls at the same thing;
brief the worker instead.

**The result cap.** Every tool result the lead receives is bounded, whether it came back within the wait limit or
as a completion. Over the cap the lead gets what fits and the line *too large for the conversation; brief a
worker*, and the same service's tools reach the worker through the site's endpoint, where bulk is natural and a
filesystem exists. A service's tool catalogue may mark a tool *bulk* — export a folder — so that only workers see
it; for an unknown service nothing is marked and the cap does the work.

**Approval, two cases, one shape.** An approval is never a pause inside a turn and never an interruption of one.

- *The lead's own tool at* **ask**. The coordinator creates the operation in state *waiting for approval*, writes
  the approval card into the record — what it does, the lead's required reason, who asks, in which boundary — and
  returns `{operationId, status: waitingApproval}` as the tool's answer; the request shows in the work bar. The lead
  finishes its reply in its own words ("I need your okay to run the benchmark in Shop") and the turn ends when the
  lead is done talking, as any turn does; when the call was one that starts work and the step wrote nothing, hq's
  line says it (*I've asked for your okay to start: …*).
- *A worker's harness asks*, in the background, hours after its brief. The request is an **event into the
  mailbox** and **takes no turn**: the card is written into the record, the request shows at the top of the work
  bar with what it would do, for which work and why, and the person is notified with the card's own line. The agent
  says nothing about it: its history carries the request with a note that the person answers it on its card. The
  run that asked ends there, as a run that asks for approval does today, and the operation waits; its row says
  *waiting for approval*. A task run commissioned from the conversation asks the same way, and its task waits as
  today.

In both cases **the person's answer is a message** of kind *approval answer* — approve or decline, with its note;
in voice, the read-back and a spoken yes produce the same message — queued like anything they say. **The lead
takes a turn on it only when nothing else will answer**: when a result will follow — every approve, and a decline
of a worker's request, after which the worker finishes — the tap takes no turn of its own, and the one reply
presenting the result covers the answer, so one piece of work gets one reply. A decline of the lead's own call or of
a task's run, which brings no result back, gets its turn. On approve, the lead's own call runs now, under the wait limit, detaching if slow; a worker's
answer is also forwarded to the site and the worker continues in a new run of the same session, as approving does
today; a task's run is started again. Either completion comes back as any other, with its
report turn. On decline, the lead replies to the note and offers the alternative; the lead's own operation is
*cancelled*, and a worker is told of the decline in a new run of its session and finishes as it decides, its result
returning as the operation's completion; a task waits for a person, as a declined task does today. **Whoever answers must pass the same checks as the asker** — a member of
the operation's boundary, the tool not *never* for them — and the admission is re-run as the answerer, who is
named in the record; in a one-person conversation that is the person. **Words become answers through the lead**: a
tap on *Approve* or *Decline* in the work bar is the answer message itself; a typed or spoken "yes" after the read-back is an ordinary message,
and the lead, in its turn on it, calls `answer_approval`, so no second turn is spent. An unanswered request stays
waiting in the work bar until it is answered or the conversation is closed, which declines it; nothing
times it out on its own. The two words are *approve* and *decline*, on screen and in the record.

**What "the call carries on" relies on.** A read on the site survives an hq restart: the site holds the request
and sends the reply as an event. A call hq makes itself to an outside service lives in hq's process; after a
restart the operation is marked *uncertain* and reconciled — a read is run again, a write is checked where the
service allows and otherwise reported as "unknown whether it happened" — which is the rule above that an operation
that cannot continue durably returns an uncertain outcome, never a false promise. That is the argument for
outside-service calls eventually running on the site rather than in hq; the implementation plan notes it and
nothing decides it here.

```json
{"operationId":"op_123","status":"accepted","executionRef":null}
```

Required:
- A stable operation id; the initiating conversation, turn and workflow; the target person, project or site
  boundary; the initiator and the durable agent identity.
- Idempotent admission, or equivalent protection against duplicate submission; an ambiguous timeout is reconciled
  before any retry.
- Status and result retrieval, and a durable terminal event for success, failure or cancellation.
- Permission enforced on the server, with provenance and an audit trail.
- An acknowledgement means **accepted**, never **completed**.
- No assumption of exactly-once external side effects.

## The work bar

- **One work bar**, the last item in the thread, holds the conversation's **live deferred operations** — not all
  agent work, autonomous tasks or organisation activity — and every request for the person's okay. It replaces a
  count in the conversation's header and the sheet it opened: there is one place for live work.
- **A flat list, one row per operation**, requests first, then the rest in the order they started: its title,
  place and state (queued, working, waiting for approval), and under it **one line per live piece of work, written
  as a path** — the boundary, then each helper's one-line description from the run's work steps, nested as deep as
  the harness went: *Shop · Profile the image pipeline · Measure resize times*. A task reads *Shop · Developer ·
  SHOP-214 — in Developer's queue*. No ids and no harness names. A row's title opens its run. Collapsed, the bar is
  one line, *4 working · 2 need you*; it opens by itself when a new request arrives.
- **Live lines only.** A helper that ends drops off and the operation's row shows a count of parts done. An
  operation that completes, fails or is stopped leaves the bar at once, and lives in the conversation as its card,
  heading the agent's reply to it.
- It shows **work underway**, separate from the thinking pill. It is not a second board.
- **What is live.** An operation is in the bar while it is *waiting for approval*, *accepted*, *queued*, *running*
  or *uncertain*, whatever its kind: a worker's brief, a task the conversation asked for now, a detached call. A
  task created for *later* has no operation, and a task set for a time is completed once set: neither is in the
  bar. A foreground call that returned within the wait limit never was. Nothing else of the person's or the
  project's work is shown here.
- **A foreground call that returns within the wait limit leaves no mark in the thread**: its operation row is
  created and completed at once, for idempotency and audit, and no *operation started* message is written. That
  message is written when a call detaches or an operation-returning tool starts, which is also when the work bar
  begins to show it. Storyboard 1 shows no work bar for that reason.
- **Briefs to one boundary queue on its one worker.** A standing worker is one harness session and runs one brief
  at a time, so a second brief to the same boundary waits behind the first and its row says *queued*; briefs to
  different boundaries run at once. The lead's instructions say to fold work for one boundary into one brief where
  it can.
- **Stopping.** Every operation's row in the work bar has *Stop* for anyone who may speak in the conversation. The lead has the same as a tool, `cancel_operation`, for when the person asks in words.
  Cancellation goes to the owning service — the site stops the run as a person can today, hq abandons a detached
  call's result, a task operation is detached and the task left as it is — and the record gets a *cancelled* card;
  a stopped worker's partial output stays on its run.

## Authorised automatic continuation

A continuation is a **new inference turn**, never an injection into a stream. It is eligible only when the
initiating workflow already authorised the next action, its dependencies are ready, permissions are still valid,
budget and policy allow it, and no other turn is active. *The platform already continues this way after a tool
approval: approving starts the next run.*

A continuation turn carries the person who authorised the sequence and the turn that created the obligation, and
starts as that person's: the rule that a run an agent started may not run a task keeps guarding against autonomous
fan-out, and does not refuse an authorised sequence.

Continuation obligations are durable, not inferred from transient model text. A completion always gets its report
turn, which starts no work; only an authorised multi-step request (investigate → propose → create a task) may
resume with the next step.

Limits apply to the number of automatic turns, depth and fan-out, operation lifetime, resource use and spend;
report turns are outside the turn limit, since they start no work, and inside the spend limit like any turn.
A real workload has spawned over 1,500 sessions, so actual spawns are metered, not only visible subagents.

## Context, knowledge and security

Each turn receives the agent's scoped instructions, the relevant history, bounded results and authorised memory and
knowledge, assembled as *Long conversations* describes: a stable prefix that the provider caches, a ledger that
survives any compaction, and compaction in segments the lead can expand.

**Knowledge may travel; storage authority does not.** A conversation that spans projects never creates a union of
their authority. Every delegated operation is authorised on its own against the initiating person's current
permissions, the agent's capability ceiling and its target boundary. Subagents can only narrow authority; other
agents keep their own identities. No worker reaches another project or site because the conversation spans both.
Permission is checked again at operation boundaries and before continuation; results keep their provenance and
forwarding limits.

## Failure, recovery and observability

- Browser disconnect: the conversation persists and permitted background work continues; committed output can be
  replayed on reconnect.
- hq restart: pending messages, operation events, continuation obligations and turn ownership recover.
- LLM failure or cancellation: turn ownership is released; queued input is kept. A failed turn keeps its partial
  output and says why, as runs already do.
- MCP timeout: uncertain acceptance is reconciled before retrying.
- Duplicate or out-of-order events: deduplicated and reconciled against the authoritative status.
- Site offline: waiting or failure is shown; authority never widens.
- Permission revoked: continuation and new operations are blocked.
- Conversation closed: pending operations continue and complete on their own; the result stays on the operation
  and a notification is sent; no report or continuation turn runs (*Results*). Deleting the conversation cancels
  its worker operations — the runs are the conversation's and are stopped — and *detaches* its task operations: a
  task is the project's and stays, its result going to the task alone. Closing declines its workers' and its own
  waiting approval requests first, so no worker is left waiting on an answer; a task's request stays on the task. Deleting a task's thread deletes its messages only: the
  task's runs are the task's record and stay; only a project administrator may delete a thread several people
  share.

Observed: message-to-first-token latency, inference duration, queued-message wait, tool acknowledgement time,
background operation latency, continuation count, actual subagent spawns, errors, retries and cancellations.
Conversation stays responsive while heavy site work queues.

## Acceptance criteria

- [ ] A new conversation starts with the person's primary agent; Kernel is the default; another agent can be chosen
      when the conversation starts, and talking to a different agent afterwards is a new conversation.
- [ ] Authorised tools support immediate and deferred responses, in process for the lead and through the site's
      endpoint for workers, under one permission check.
- [ ] Deferred operations acknowledge promptly, release the turn, and finish independently.
- [ ] A foreground tool is called directly and waited for up to the wait limit; a worker and a task detach at once;
      the lead can send a foreground tool to the background and never the reverse.
- [ ] An unfinished foreground operation is promoted to background **without cancelling, restarting or duplicating
      side effects**, where safe detachment is supported.
- [ ] Every promotable operation has a stable id and its own lifecycle from admission; completion is recoverable
      after detachment.
- [ ] A tool whose operation cannot continue durably after the wait limit — one with no durable reference to
      retrieve a result by — is never promoted: it returns a controlled timeout or an uncertain outcome that is
      reconciled before any retry.
- [ ] Any operation can be stopped from its row or its card, or by the lead on the person's word, and the record
      shows it cancelled.
- [ ] The lead keeps the ledger through its tool when it decides something, and a compaction's segment carries the
      ledger head unchanged.
- [ ] No operation blocks a turn beyond the wait limit.
- [ ] The work bar shows the conversation's live deferred operations and its requests for the person's okay, as the
      last item in the thread, distinct from the thinking pill and from task management.
- [ ] One active turn per conversation; messages during a reply queue in order, and survive a restart.
- [ ] A completion during a reply neither interrupts the stream nor changes its context.
- [ ] Quiet, correctly correlated completion and failure notifications.
- [ ] Every completion gets one report turn that speaks and starts no work, several completions in flight share
      one, and the notification carries the report's first line; only an authorised multi-step workflow continues
      with work. A request for the person's okay takes no turn.
- [ ] Pending messages, events and obligations recover after a process failure and a browser disconnect.
- [ ] Duplicate delivery and uncertain acknowledgements never cause duplicate admission.
- [ ] Execution relationships, latency, failures, cancellation and resource use are observable.
