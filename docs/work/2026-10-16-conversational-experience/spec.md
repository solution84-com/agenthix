---
name: Conversational experience — spec
description: How every agent converses responsively while it commissions and receives longer work, and the conversation experience built on it — memory and knowledge, voice, long conversations, what the thread shows.
created: 2026-10-16
author: leang
---

# Conversational experience — spec

**Status:** Designed and reviewed; implementation planned in [`plan.md`](plan.md). *Changed 2026-10-16, phase 1:
the data model as built — conversations from before are not converted into rows, the lock's lease is on the
conversation, a notice kind and the model policy's table added. Changed 2026-10-17, the walkthrough: one work bar
at the end of the thread replaces the activity indicator and its sheet, a request for the person's okay takes no
turn, and a task set for a time completes when it is set.*
**Scope:** the whole conversational experience: the conversation layer, commissioning work and getting results
back, memory and knowledge, voice, long conversations, and what a conversation shows on screen. This overview holds
what every part depends on; the parts are listed at its end.

## Purpose and governing principle

A person should be able to talk to an agent and get an answer at the speed of a conversation, while the agent
commissions and receives work that takes longer. Agent identity and conversation state are durable; individual LLM
inference calls and the worker runs that do project work are transient and independent of them.

> An agent should not have to finish working before it can continue talking.

The **Conversation Coordinator** is a deterministic lifecycle and scheduling component, not a second reasoning
agent. It manages *when* inference happens, not *what* the agent decides.

## Terms

- **Lead** — the agent as it talks in a conversation: direct inference in hq, the agent's mind.
- **Worker** — the agent's harness session in a boundary (Claude Code or OpenCode on that boundary's site), which
  does the work the lead commissions there. One per boundary a conversation has worked in.
- **Helper** — a subagent a worker spawns through its harness, in a separate context; the platform already names it
  so (*handed part of the work to a helper*).
- **Task** — always the project's task: an item on a board, with its key, comments, result and its own session,
  made by `create_task` and started by `run_task`. Never the harness's `Task` tool — Claude Code's name for spawning
  a subagent, OpenCode's `task` — which in this design is always a *helper*.
- **Operation** — one piece of work the lead commissions: a brief to a worker, a task for another agent, or a quick
  tool call.
- **Primary agent** — the agent a person's new conversation starts with.
- **Shown part** — a piece of a reply that must be seen rather than heard: a fenced block with a title, a spoken
  line and a body in markup; a card in the thread in voice mode, inline otherwise.
- **Ledger** — what a conversation must not lose to compaction: decisions, approvals, open operations, obligations,
  what the person asked to keep. Kept by the coordinator.
- **Segment** — one compaction's result: a span of messages, a one-line brief and a full summary, written once.
- **Wait limit** — how long a turn waits for a foreground tool before the call is detached and finishes on its own:
  a few seconds. A limit on waiting, never on the call.
- **Result cap** — how much of a tool's result the lead receives. Over it, the lead gets what fits and is told to
  brief a worker for the rest.
- **Home** — where a conversation lives and is listed: a person's space, a project, or a task. **Place** — the
  boundary a home belongs to: the person's own space, or the project; a task's place is its project. **Boundary**
  — any place work can be authorised in.
- **The conversation's tools**, named once: `start_work` (a brief to a boundary; in a task's home it is `run_task`
  on the task), `create_task`, `run_task`, `cancel_operation`, `answer_approval`, `ledger`, `recall`, `remember`,
  `expand`, `messages`; and `set_result`, which a run's agent calls to state its result.

## Who a person talks to

1. **A conversation lives where the person speaks**, as today: in their own space (Chat), in a project, or — new —
   on a task, for its whole life, and that is where it is listed. Its place is its home, as a working directory is
   a coding agent's:
   what the lead reads directly — the place's knowledge, tasks and board — is the place's, with the place's
   authority. **Work may be commissioned outside it**, in any boundary the person and the agent share, each
   operation authorised on its own for its own boundary (*Conversation layer*). A harness is bound to its place;
   a conversation is not.
2. **Every agent converses through the conversation layer.** The fast reply, queued messages, commissioning work and
   results coming back are not special to one agent. The conversation layer is not a harness: a harness (Claude
   Code, OpenCode) runs only the work a conversation commissions.
3. **Each person has a primary agent**: the agent a new conversation starts with, so they need not choose one first.
   It is a personal setting; the organisation's built-in agent, Kernel, is the default. Only the primary agent is
   offered when a conversation starts, with a picker — limited to agents assigned to the home's project, or to
   the person's space — to choose another before the first message. A personal or project conversation keeps its
   agent for its life, and talking to a different agent is a new conversation. A task's conversation has no picker:
   its agent is the task's, whoever that is now (6).
4. **Agents keep their identities.** There is no per-person agent: names, roles, voices and limits stay with the
   agent, set by the organisation. What makes an agent personal is the memory it already keeps of each person.
5. **Only an agent allowed the start-work tool can be a primary agent**, since starting work for the person is part
   of what it is for.
6. **A task's conversation is the team's.** A task has at most one conversation, created when someone first talks
   on the task's page; anyone who can see the task may read and speak in it. **Its lead is the task's agent,
   whoever that is now:** reassign the task and the thread carries on with the new agent, with a quiet line
   (*Developer took over from Writer*); the ledger and the segments are the thread's, and the new agent recalls
   under its own memory scopes. An unassigned task has no lead: its thread is readable and the message box says
   *assign an agent to talk here*. **Work on the task from its thread is always a run of the task**: the start-work
   tool in that home is `run_task` on the task with the person's ask as the run's brief, its result written to the
   run and to the task's result, Stop stopping the run; there is no separate worker brief in a task thread. **Every
   run of the task is a card and a report turn in its thread**, commissioned or not — the pulse's, a scheduled one,
   one started from the board — so the thread is the task's running story; runs the thread did not commission are
   not operations and never in the work bar. **A team thread is the project's work, so the project
   pays** (*Model access and policy*). It shows on the task's page and as a thread mark with an unread count on
   the task's card on the board, never in the project's chat list, which stays a person's own. Comments stay the
   board's collaboration channel; the lead reads them and may write one when asked.
7. **Several people, the rules.** Every message carries its author. **A turn acts as the author of the message it
   answers**: that person's membership, tool permissions and memory scopes; two people asking get two turns, in
   order. A report turn answers no one and acts under the home's reading authority; a continuation turn acts as the
   person who authorised it. The lead names people once more than one has spoken, and writes memory about a person
   under that person's scope only. An approval request is shown once, in the thread's work bar; **whoever answers it must
   pass the same checks as the asker** — a member of the operation's boundary, the tool not *never* for them — and
   the admission is re-run as the answerer, who is named on the card. Notifications go to those who have spoken in
   the thread and to the person the task is on behalf of. Voice is held by one person at a time per thread, the
   holder recorded on the conversation and released on End, on closing the tab, or by the silence rule; a second
   person who starts voice is told it is in use.
8. **Not in this design:** several agents in one conversation, such as bringing an agent in by name, and opening a
   project's conversations to all its members. Both belong with collaborative conversations, after this epic; the
   task thread's rules are written so they extend to them without a second design.

## Agreed design decisions

1. **Placement:** hq owns the logical coordinator and the durable conversation lifecycle. Project-bound runs stay on
   their owning sites. *How the record is split is under* Where a conversation's record lives.
2. **Inference:** direct, lightweight, streaming LLM inference for ordinary conversation, separate from the
   harness loops, behind one model adapter that also carries each provider's caching hints. The Vercel AI SDK,
   which hq already uses, is the candidate for that adapter; the implementation plan confirms it.
3. **Integration:** authorised Agenthix services are exposed to conversational inference as tools over hq's own
   operations, called in process with a capability minted for the turn — the same entry and permission check the
   site's MCP endpoint forwards to for a harness run. No new gateway; the site's endpoint stays for workers.
4. **Delegation:** work in a boundary goes to the conversation's **standing worker** there — a harness session
   of the same agent, with that boundary's authority. Fan-out within a boundary is the harness's own subagents,
   which only narrow that authority. Work for another agent is a task. The platform builds no subagent mechanism.
5. **Foreground and background: the tool's kind decides, not the lead.** A tool with no model in it — one of hq's
   own operations, a read from a site, a person's connected service — runs in the **foreground**: the lead calls it
   directly and waits up to the **wait limit**, a few seconds enforced by the platform; if unfinished, the *same operation*
   moves to background, returns a pending operation reference and releases inference. A **worker** and a **task**
   are **background by kind**: they detach at once and the result comes back as a completion. The lead may ask a
   foreground tool to go to the background when the person said to keep talking, and never the reverse. Every
   eligible operation has a stable, independently tracked lifecycle from admission, and promotion never cancels,
   resubmits or duplicates a side effect.
6. **Continuation:** completed background work starts **one report turn** — speech only, no tool, no new work — in
   which the lead presents the result, whether or not the person is there; the notification carries the report's
   first line, so what the person is told is the agent's words, not a system line. Completions that arrive while a
   turn runs share the next report turn. Only a workflow the person already authorised may continue with work.
   Presence changes one thing: whether the report is spoken (voice on) or read later.
7. **Concurrency:** at most **one active inference turn per conversation**. Messages that arrive while a reply
   streams are queued durably and handled in order. Several background operations may run at once, within
   execution limits.
8. **Streaming:** a background completion never changes the input of a running inference call or interrupts its
   stream. Results enter the conversation's mailbox for later.
9. **Experience:** the conversation stays available while deferred work proceeds. **One work bar**, the last item
   in the thread, holds the conversation's live background work, whatever runs it, and every request for the
   person's okay, each with its state; it is gone when nothing is live. A piece that completes, fails or is stopped
   leaves the bar and appears as its card, heading the lead's one report turn, and as a notification wherever the
   person is; it never interrupts a reply in progress. A request for the person's okay takes no turn: the agent says
   nothing about it, and the person answers it in the bar.

## Storyboards

Three flows the design must produce:

1. **Foreground, completes quickly** (1–2 s): the person asks; the agent says it will check, with the thinking
   pill when it looks something up; the result arrives inline with its source; the conversation goes on. No work bar.
2. **Background, longer running** (minutes): the person asks for an investigation and says they want to keep
   talking; the agent says in one line what it started; the work bar appears at the end of the thread with the
   operation in progress (*1 working*); the person asks something else and gets an answer; when it completes, it
   leaves the bar and a completion card appears inline (*Finished: Architecture review · View results*), heading
   the agent's reply to it.
3. **Promoted to background** (more than a few seconds): a call expected to be quick runs past the foreground
   wait limit; the agent says it is taking longer and will continue in the background; the work bar appears; the
   person carries on; the result arrives later as a completion card.

UI elements: the **work bar** (the conversation's live background work and requests for the person's okay, the
last item in the thread), the **thinking pill** (the agent is working on its reply, for how long, and what it
started), the **operation item** (a row in the work bar: what, where, its state and *Stop*) and the **completion
card** (an inline result when a background operation finishes, heading the agent's reply to it).

Principles for the person: the agent is always available to talk, even while work continues; quick operations
feel seamless, with no extra UI; longer ones show in the work bar; progress can be checked at any time without
interrupting the conversation; results arrive naturally, as a notification and an inline summary.

In storyboard 2 the agent follows the completion card with a message offering to go through the findings: that is
the **report turn** under *Results* — one turn, speech only — which decision 6 allows for an operation the person
asked for.

## Logical architecture

*Diagram: [Logical architecture](diagrams/logical-architecture.md).*

The coordinator owns admitting and ordering messages, scheduling inference turns, correlating and deduplicating
events, assembling context, scheduling eligible continuations, delivering streams and notifications, and recovery.
The execution service owns worker admission, queues, harness execution, cancellation, capacity and the
authoritative operation status. Site scheduling is not duplicated in hq.

## Where a conversation's record lives

*Diagram: [Where a conversation's record lives](diagrams/conversation-record.md).*

**hq holds the conversation; the site holds the work.** A conversation is what the person and the agent said, and a
reference to each operation it started: hq stores it, and the screen is built from hq's database. A **run** is a
snapshot of one piece of work by a harness: the site keeps it, in its database, as it does today. The **harness's
own session file** is the worker's working state, which Agenthix does not control; it is never a record and never
shown.

So nothing is held twice. The conversation history is the record Agenthix keeps; a run's detail is fetched from
the site only when the person opens it, or scrolls to it in history — not to draw the conversation. A conversation
stays readable, and the person can keep talking, while its site is offline; work it commissions waits for the
site.

What follows from it:
- **Message text is stored in hq's database.** Today hq holds none. Reading it is the home's rule — a personal or
  project conversation is read by the one person who opened it, for every role, enforced in hq as now; a task's by
  anyone who can see the task. At rest it is encrypted with hq's data key, as the sealed fields hq already keeps;
  a backup carries the ciphertext and the key is the machine's, under host management.
- **Today's conversations** keep their transcripts on the site and become **read-only** from the change: listed
  as *from before*, read as now, with *start a new conversation* and *continue this in a new conversation*, which
  seeds the new thread with a one-time summary of the old one made by the summariser on demand. A task's old
  session transcript gets the same notice on the task page. Today's harness-chat path becomes a reader of old
  transcripts and is removed when the last of them is deleted — an archived one is still reopenable. Nothing is
copied across.
- **The transcript on the site becomes a run's record**, not the conversation's.

## Data model

*Diagram: [Data model](diagrams/data-model.md).*

**hq holds the conversation.** A new `Conversation` table is the thread: its **home** (a person's space, a
project, or a task, which decides who may read and speak, and who pays), who opened it, agent (for a task home,
read from the task), status, closed reason, title, the talking model and the access it opened on, when it was
archived and whether to keep it from archiving (*On screen*), who holds voice in it now, the one-turn lock (the
turn that owns inference and its lease), and the **ledger** — what must survive compaction, kept by the coordinator (*Long conversations*).
An artefact records the conversation that made it, and a notification gains the conversation and operation it is
about, so that a completion or an approval request notifies as a task run does today. Under it:

| Table | A row is | Holds |
|---|---|---|
| `ConversationMessage` | One thing said, in order | role, author, kind (text · operation started · action · task · result · approval request, with its reason · approval answer, with its note · summarised · voice started · voice ended · failed · notice, a quiet line from hq), content, encrypted at rest; spoken and interrupted flags; the operation or turn it belongs to; queued or taken, for a person's message waiting on a reply |
| `InferenceTurn` | One direct-inference turn | state (queued → running → completed · failed · cancelled), what started it, the person it acts as, model, usage, error, timings; the conversation holds which turn owns inference, with a lease |
| `Operation` | One piece of work commissioned — what the work bar shows while it is live | kind (worker · task · tool), mode (foreground · background), brief, target boundary, state (waiting for approval · accepted · queued · running · uncertain · completed · failed · cancelled · detached), result summary (for a task set for a time, which completes when it is set: the task and when it starts), for a task operation the run that completes it, **where the work is**: site and run, or task; idempotency key; what it is allowed to continue with |
| `ConversationSegment` | One compaction: a span of messages folded into a summary | first and last message with their timestamps, the brief, the full summary, the ledger head as it stood; written once, never rewritten |
| `ModelPolicy` | One boundary's model preferences (*Model access and policy*) | owner (the organisation, a project or a person), the talking, light-work and heavy-work models, the allow-list and the ceiling |
| `RunResult` | What one run said it achieved | the run, its site, session and task; the result the run's agent stated with `set_result`, or that it stated none; a task's latest also on the task |
| `AgentSession` | hq's record of a session on a site, as today | now with the conversation it serves and its boundary, for a **standing worker** (one per conversation, boundary and the person it works for); a task's session belongs to its task, as today, with no conversation |

**The site holds the work**, with no change of shape: `AgentSession` (the standing worker — the harness session,
context use), `AgentRun` (one brief carried out), `TranscriptEntry` and `ToolCallLog` (what the worker did, now
the *run's* record). The harness's own session files, main and subagent, are working memory it owns, never a
record.

**What this bounds.** A conversation collects messages and operations, paged like any list; its sessions are one
per boundary worked in. Nothing is held twice: hq has the words and the references, the site has the work, fetched
only when a result is opened (`Operation` → site → that run's transcript over the channel).

**A conversation stays a thread about one thing**, as today: typing on Home or on a project's page starts a new
conversation with the primary agent. What carries across conversations is memory, not the thread.

**Conversations from before** stay what they are: a chat session in hq whose transcript is on the site, read as
now through today's path, which no longer sends. No row is converted into a `Conversation` — before the first
release nothing is carried forward. A person's settings gain their primary agent.

## Open decisions

Every open decision found by reading the platform as it is has been settled in the sections above. *Settled:*
the conversation turn is direct inference and not a harness run — the decisions that a harness runs as its vendor
intends and that a process belongs to its conversation keep applying to the workers; and which access pays for a
turn, under *Model access for a conversation*; where the
conversation's tools live, under *Tool execution contract*; results, and `run_task`'s contract, under *Results*.

## The parts

Each part is designed on the shared decisions above and is revised on its own during implementation: a part that
changes says so at its top, dated, with what changed and why, and this table shows its status.

| Part | Holds | Status |
|---|---|---|
| [Conversation layer](spec/conversation-layer.md) | The coordinator: turns, the durable queue, foreground and background operations, the tool contract, continuation, failure and recovery, the work bar | Designed; changed 2026-10-16 (a worker asking for approval ends its run; the answer continues it in a new one); changed 2026-10-17 in the walkthrough (a turn's steps and what it says it started, a long reply moved to the background, the date and time in each turn, no turn for a request, the work bar) |
| [Workers and results](spec/workers-and-results.md) | Lead, worker and helper; operations and briefs; how a result comes back and what the lead does with it | Designed; changed 2026-10-17 in the walkthrough (one identity, a task set for a time completes when set, requests in the work bar) |
| [Model access and policy](spec/model-access-and-policy.md) | Which access pays for a turn; the model policy and who picks for whom; the model picker | Designed; changed 2026-10-16 (the model is changeable at any time, from a picker); Sign in with ChatGPT awaits a client id from the vendor |
| [Memory and knowledge](spec/memory-and-knowledge.md) | Knowledge as the place's files; memory as records in hq recalled by meaning | Designed; changed 2026-10-17 in the walkthrough (*Show in Memory* opens Settings › Memory) |
| [Long conversations](spec/long-conversations.md) | The assembled context, the ledger, compaction in segments | Designed; changed 2026-10-17 in the walkthrough (*Summarise now* returns at once) |
| [Voice](spec/voice.md) | Voice as a mode of the conversation; the lead's register; shown parts | Designed; changed 2026-10-17 in the walkthrough (dictation shown as spoken, the agent's own voice kept out, a speech connection per message, cutting in by words); still unreliable on laptop speakers |
| [On screen](spec/on-screen.md) | Every item in the thread; approvals, closed, archived, deleting; the richer items | Designed; changed 2026-10-17 in the walkthrough (the thinking pill, the work bar, a turn as one block with its cards, Copy, *Stopped*, the card of a task set for a time, the message box from two lines) |

**A part may add to the data model only by editing this overview**, so that one place says what the tables are.
The diagrams are in [`diagrams/`](diagrams/README.md), one per file, linked from the part they belong to.

## Related

- A conversation keeps its own runtime's model semantics.
- Context size and compaction.
- Which runs may use memory.

**Out of scope:** implementation code, queue and database selection, a new harness architecture, general site
capacity scheduling.
