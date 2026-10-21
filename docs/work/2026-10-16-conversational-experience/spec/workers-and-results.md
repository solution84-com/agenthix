---
name: Workers and results
description: Lead, worker and helper; the standing worker per boundary; operations and briefs; how a result comes back from a worker, a task or a tool, and what the lead does with it.
created: 2026-10-16
author: leang
---

# Workers and results

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-17, the walkthrough: the agent speaks of its background work as its own; a task set for a time
completes when it is set, and nothing of its runs comes back; a request for the person's okay is shown in the work
bar and takes no turn.*

## Workers

*Diagram: [Lead, worker, helper](../diagrams/workers.md).*

**Three layers, each with one job.** The **lead** (hq, direct inference) talks to the person and decides
*which boundary* gets work. A **boundary's worker** — a harness session (Claude Code or OpenCode) of the
same agent on that boundary's site, with that boundary's authority — does the work and decides *whether to fan
out*. Its **helpers** — the harness's own subagents — do the pieces in separate contexts inside that run: Claude Code's `Task`
tool, OpenCode's `task` tool, which the platform already shows as one work step, *handed part of the work to a
helper*, and can deny by permission.

- **In a task's conversation there is no worker brief: work on the task is a run of the task.** `start_work` in that
  home is `run_task` on the task with the person's ask as the run's brief; the result is written to the run and to
  the task's result; Stop stops the run. The task's session is the task's, as today, and serves the thread's runs
  for whoever asked; the pinned memory files in its home are those of the person the run is for, refreshed at run
  start — when the run is in that person's own home. A run in the project's own home, which every member's task runs
  share, is given the place's memory only (memory and knowledge, Workers and helpers). Work elsewhere from a task's thread is a worker brief to that boundary, as from any home.
- A conversation has **one standing worker per boundary it has worked in, for each person it works for** — any
  boundary the person and the agent share, not only its place; in a personal or project conversation that is one
  person, and in a task's thread each person who briefs a boundary has their own there, acting with their
  authority and memory — started the first time the
  conversation commissions work there, reused for every later request there, ended when idle as harnesses are
  today. A conversation that only talks never starts one.
- An **operation** is one brief carried out: one run on one boundary's standing worker, or a task for another
  agent, or a quick tool call with no worker. The conversation sends a **brief**; the worker returns a **result
  summary** it writes itself. The conversation never holds a worker's transcript, and a worker never holds the
  conversation.
- **A worker is always in the background, and so is a task.** A harness run is a session start and a model loop,
  tens of seconds at the least, so no wait limit fits it. The lead's turn ends with one line saying what it
  started — "I'm checking the README now; I'll tell you what I find", or hq's own line when the model wrote
  none (*Conversation layer › Inference turn*) — the work bar shows the operation, and the answer
  comes back as the report turn under *Results*. That is better than waiting even for a short brief: the person
  hears something in a second and can keep talking, instead of watching a typing indicator for a minute. The lead
  never waits on a worker; what it calls directly and waits for are the foreground tools, which have no model in
  them (*Conversation layer*).
- **One agent, not an agent and its helpers.** A worker is the conversation's agent working in the background, so
  the agent always speaks of that work as its own, in the first person — *I'm working on…*, *I've finished…*, *I need
  your okay to…* — never *passed it to*, *a worker*, *a helper*, *it came back*. What the lead is told when its work
  returns or asks is written as its own ("[Your work in Walkthrough finished: …]"), and a background session's input
  opens by telling it who it is, for whom and where, before the brief.
- **Tool or worker is the lead's judgement, made before the call.** A tool for one thing — one fetch, one write;
  a worker for a job — reading, comparing, summarising or producing many things, anything that needs a model over
  the data; and always a worker when a tool's result came back capped, or when a turn has already had a call
  detached. Only the lead can write the brief, because only it knows what the data is for; the coordinator never
  turns a call into a brief. When a *detached* call's result comes back capped, the report turn that presents it
  starts no work, as no report turn does: the lead offers the brief and writes it on the person's next word. It decides when to stop waiting (the wait limit) and how much comes back (the result
  cap), and delivers the result once.
- **Authority never crosses from inside a harness.** A worker holds its boundary's capability; its subagents can
  only narrow it. Only the conversation commissions, through one standing worker per boundary, which runs one brief
  at a time; a second brief there queues behind the first (*Conversation layer › The work bar*).
- **Subagent activity is the run's work steps**, streamed live and metered there — count and budget per run — so
  a runaway fan-out is bounded by the run, not by a platform mechanism.

## Results

*Diagram: [How a result comes back](../diagrams/results.md).*

Every operation ends with a **result** the lead can use, and where it comes from depends on the kind:

- **Worker:** the **result summary** the worker writes when its run ends, with a link to the run. A helper never
  reports to the lead: it reports to the worker that spawned it, inside the harness, and the worker folds it into
  its summary.
- **Task:** a task lives across runs — a piece of music moves from production to release to completion, and each
  stage is a run — so **a result belongs to a run**, and it is the thing a run always completes on. The task's
  agent states it explicitly at the end of the run by calling `set_result`, which today's run has no way to do —
  the task's result is written only by a person's edit; the platform writes it to that run and to `Task.result`, which
  holds the latest run's result and changes each time the task is run afresh. A run that ends without stating a
  result is marked so. **Comments are for collaboration** — something other agents and people should see — not the
  result channel. The operation that commissioned the run completes when the run does, with that run's result and
  the task's state after it ("now in Release"), whether or not the task is finished.
- **Quick tool:** the tool's return, within the turn.

An approval a worker asks for on the way is not a result: it is a request shown in the work bar, which takes no
turn and which the agent says nothing about; the person's answer is a message, and the one reply presenting the
result that follows covers it (*Conversation layer › Approval*).

The completion enters the conversation's mailbox and becomes a completion card, always. **Then the lead presents
it**, whether or not the person is there: the chances are they will open the conversation, so the turn is spent
either way, and deciding whether to spend it is complexity for nothing. The notification carries the report's first
line, so the person hears it in the agent's words wherever they are.

| The operation was… | When it completes, the lead… |
|---|---|
| asked for in this conversation | takes one **report** turn: speaks, calls no tool, starts no work; spoken if voice is on, read otherwise. Completions that arrive while a turn runs share the next report turn, so three results are one "three things are back" |
| part of a sequence the person authorised | takes a **continuation** turn *instead of* the report turn: it presents the result and may do the next authorised step, within the limits on turns, depth and spend |
| finished after the conversation was closed | no turn; notification with the result's one line; the result stays on the operation |

**Creating a task is three different asks**, and `create_task` says which, as today's `queue` flag half does:

| The ask | `create_task` | The task | The conversation's operation |
|---|---|---|---|
| **Do it now** | `when: now` | Queued for its agent, no schedule; the pulse starts it when the agent is free | *queued* → *running* → **completed with the first run's result**, reported like any completion |
| **Do it later, no date** | `when: later` | In the backlog: not queued, no schedule; nobody picks it up until a person or a later ask queues it | **None.** The task card is the record; the lead says so: "it's in the backlog until someone queues it" |
| **Do it at a time** | `when: <a time>` | Scheduled; queued when the time arrives | **Completed when set**, holding the task and when it starts: the card in the reply shows the time, and nothing of its runs comes back to the conversation. Setting it is the whole of the ask, so a follow-on step (`then`) is refused for it |

The lead reads the ask from the person's words, working a time such as "tomorrow at 9" out from the date and time
each turn carries, and asks when they leave it open. For a task created from a
personal or project conversation, later runs are the project's own and do not wake that conversation; in the
task's own thread every run is a card and a report turn (*overview, 6*); `run_task` on an existing task, asked for in the conversation, is
a new operation on the same task, completed by that run. `run_task` starts a run and returns at once, as it already
does; its description is corrected, and it becomes an operation-returning tool like the others. A task operation
never holds a run: when its conversation is deleted it is *detached* and the task is untouched (*Conversation
layer › Failure, recovery*).

## Acceptance criteria

- [ ] The same durable agent identity across the conversational and execution paths.
- [ ] Several background operations run while the person keeps talking.
- [ ] Subagent narrowing and project and site authority boundaries hold.
