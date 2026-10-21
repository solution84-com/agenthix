---
name: On screen
description: Every item in the thread; approvals with a reason; closed and archived conversations; deleting; runs found from a conversation; the richer items.
created: 2026-10-16
author: leang
---

# On screen

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-17, the walkthrough: the thinking pill gained a pulsing dot and what the reply started; one work
bar at the end of the thread replaced the header's activity indicator and its sheet, and holds requests for the
person's okay; each turn of the agent is one block, headed by the cards it answers; Copy under a reply; a stopped
reply leaves *Stopped*; a task set for a time is a still card; the message box puts long text above its buttons.*

Board: [Kernel's answer](../boards/kernel-answer.html), the settled design for the turn, the work bar and the cards.
Of the actions it shows under a reply, Copy is built; Read aloud, the ⋯ menu and the mark on hq's own line are not.

**Prose first, cards quiet.** The record holds more kinds of message than a chat does today, and the thread stays
a conversation with work going on around it: a message is a bubble, and everything else is one line or a one-line
card that opens on tap, never a block of its own. Web and phone read the same record, so this is one catalogue
for both.

| Item | From the record | Shows | Opens |
|---|---|---|---|
| Message | text, person or agent | The person's: a bubble; one waiting behind a reply has *Send now · Cancel*. The agent's: its words in its turn's block | — |
| Summarised marker | summarised | The span and the brief | The full summary, then the messages it covers |
| Voice lines | voice started · voice ended | Quiet centred lines | — |
| Interrupted mark | the reply's flag | Where the person cut in; *Stopped* alone under the agent's name when the reply was stopped before it said anything | — |
| Thinking pill | the reply's steps | A greyed pill in the agent's name line, never a line of its own: a pulsing dot and *Thinking · N s* counting up from the moment the reply starts — there is no other typing indicator — then *Thought for N s*, with *· started N* and *· set N* for the work it started and the tasks it set for a time; none on a finished reply that took no step | The steps under the name line, one line each with its time, and one for each piece of work started or task set; closed by default |
| Work bar row | an operation while it is live | Not in the thread: a row of the work bar — title · place · state, its live lines, *Stop* | The run |
| Request for the person's okay | approval request | Not in the thread: a row at the top of the work bar — what it would do · for which work · why · *Approve* · *Decline* with a note; it leaves the bar once answered, and the answer is kept in the record, not drawn | — |
| Action line | a tool call that changed something | One line naming the item, with *Show in Tasks* and the like | The tool, with the item marked; for an item remembered, Settings › Memory |
| Task card | a task created or changed | Key · title · state · assignee | The task |
| Completion | result | *Finished*, *Failed* or *Stopped* · title · the one-line result · *View results*, heading the agent's reply to it in one block | The result; the run's transcript, fetched then |
| Task set for a time | operation started, holding when the task starts | A still card in the block of the turn that set it: a clock · key and title · place · *starts Sun 18 Oct, 9:00*; no spinner, no *Stop*, never in the work bar | — |
| Shown part | inside a reply | A title card in voice mode; inline otherwise | The viewer |
| Failed | failed | What failed · why, in plain words · what to do | The run, where there is one |
| New-conversation offer | from the lead | One line | A new conversation |
| Closed notice | the conversation's status and reason | Why, and *start a new conversation with this agent*; no message box | — |

**A turn is one block.** Everything one turn of the agent's produced sits under one name line with its time: the
cards of what completed that the turn answers, first, then its words, then any task it set for a time. A card no
turn answered is a block of its own. Once the turn has ended and said something, *Copy* sits under its words. Work
started and requests for the person's okay are not drawn in the thread; they are in the work bar. Nothing in the
thread is a system line: what happened is a card or the agent's words.

**The work bar.** One bar, the last item in the thread above the message box, scrolling with it rather than
pinned: every piece of the conversation's work still live — queued, working, waiting for the person's okay — and
every request for that okay. Collapsed, it is one line, *4 working · 2 need you*; open, a list that scrolls, the
requests first and the rest in the order they started. It opens by itself when a new request arrives, and is gone
when nothing is live. Only someone who may speak in the conversation can answer a request or stop work. A piece
that completes, fails or is stopped leaves the bar for its card in the thread. The conversation's header carries
no count of its own.

**The message box** is one row while its text fits on a line. From two lines, the text takes the whole width above
the buttons, which sit in a row underneath: the plus on the left, the microphone and the one right button on the
right. It grows with its text to a limit, then scrolls.

**Approvals say why.** Every operation that needs approval carries a reason from whoever asks. The lead fills a
required argument on the tool. A worker's harness prompt carries none, so the site takes the worker's last words
before the request as its reason, and the brief tells the worker to say what it is about to do, and why, before it
asks. In voice mode the read-back speaks the same line. A tool's state — always, ask or never, per agent and
overridden per boundary, as today — decides whether the card appears at all; the lead's in-process tools obey the
same state as a worker's, and *ask* is answered in the work bar.

**Closed conversations are marked.** The list row carries *Closed · why* in plain words; opening one shows the
thread, the closed notice and *start a new conversation with this agent*, with no message box. For a conversation
whose record is in hq, a missing harness state no longer closes anything: the worker is started fresh. What still
closes a personal or project conversation is its person leaving the project or the organisation, or the project
being deleted; archiving hides, and a reopened or woken conversation is active again. A conversation *from before* is closed for that reason, read from the site, and its notice adds
*continue this in a new conversation*.

**A task's thread** shows on the task's page, with the message box that creates it on the first message, and as a
thread mark with the viewer's unread count on the task's card on the board. It is not in the project's chat list,
which stays a person's own; searching the project finds it by its task. Each message shows its author once more
than one person has spoken, and names the agent beside its replies once the task has changed hands. It archives
with its task, closes when the task is deleted, and may be deleted only by a project administrator, which removes
its messages and never the task's runs.

**Deleting is permanent, confirms once, and names what goes**, counted where cheap: the messages, the workers' runs
on each site, stopped if still running, the artefacts the conversation made; and what stays: the tasks it created,
which keep running as the project's work, and the memory it wrote. The
confirm offers *Archive* beside *Delete*, so a person who hesitates has the cheap way out. A workspace delete names
its unpushed files, because the count is cheap and the loss is not. Controls are visible without hover; the role
rules are unchanged. An agent deleting anything does so through a tool under its permission state: *always* does
it and the action line says what went; *ask* is the card; *never* is refused. A file a worker removes inside its
container with `rm` is the manifest's bash patterns' business, as they stand today, and git's, which is the undo
for anything pushed. There is no recycle bin: it is a feature of its own, outside this design.

**Archive, never prune by itself.** A conversation idle for ninety days, tunable per organisation, is archived:
hidden from the list, kept, found by search and reopened by a tap. A person can keep one out of archiving, and
archives or deletes one by hand. Artefacts are recorded against the conversation that made them, which is new;
they stay with an archived conversation and go with a deleted one. Only a person deletes.

**A conversation's runs are found from it.** Each row of the work bar opens its run, and each completion card its
result and the run's transcript. The
Runs screen gains a *conversation* filter, reached from the conversation's menu; searching what a run said asks the
site only when used.

**Failures say why, wherever shown.** A failed turn or operation is a card with the reason in plain words, kept in
the record, so it is still there after a reload and on the phone. A refused action of the person's own shows the
server's reason in one shared way.

**Richer items: four built, two left.** The task card, the action line with its link, the completion card and the
shown part are built. *Plans with steps* and *suggested actions as buttons* are not: a plan is tasks on the board,
which the lead already creates and the task card already shows; a suggestion is a sentence the lead says, and the
person answers in words. Both can come later without changing the record.

**Options considered.**

- *Rich blocks in the thread* — full task cards, plan trees, rows of buttons. The thread becomes a dashboard, and
  the tools panel already shows that state; one line that opens the tool keeps both honest.
- *A recycle bin*, so that deleting never needs a confirm. A feature of its own — a deleted flag, a purge, a
  Deleted list, a restore path on hq and on each site — and it would still not see a worker's `rm`. Left out of
  this design and raised separately.
- *Prune old conversations automatically.* Deletes what people may still search for; archiving costs rows, pruning
  costs trust.
- *Ask the harness for an approval reason.* Harness prompts carry none; the worker's own preceding words are the
  reason it gives anyway.
- *A rule of our own for when a delete asks.* The tool's permission state is already the person's answer to how
  much asking they want; a second mechanism beside it would drift from it.

## Acceptance criteria

- [ ] Every item in the thread's catalogue renders from the record on web and phone; an approval shows its reason;
      a closed conversation is marked in the list; a delete names what goes and offers archive; idle conversations
      archive after the organisation's period; a conversation's runs open filtered from it.
