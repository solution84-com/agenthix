# Conversations and Chat

Part of the unit's design spec: see [the index](README.md).

## Project — Conversations

**What a person comes to do:** talk about the project, pick up a conversation they started, check the project's
state or open one of its tools without leaving.

- **Bar:** *Projects / Agenthix*, and the layout control.
- **Header:** the project's avatar and name, with ▾ to switch project, its description, and the pin icon (pin or
  unpin).
- **The conversations:** the person's own conversations in this project, with no heading above them, grouped Today, Yesterday, Last 7 days
  and older. Each row shows the agent's avatar, the agent's name, the conversation title and a preview line, with
  the time or "● Working". Above the list: a filter by agent and search, styled like every other control. There is no "New conversation" button: the message box starts one.
- **Message box** at the bottom, always there: "Talk about this project…", with an agent picker defaulting to the
  project's default agent. Sending the first message creates a conversation placed in this project and opens it.
- **Tools panel** ([The tools panel](tools-panel.md)).
- **Private:** a person sees only their own conversations here
  ([adr-0041](../../../adr/adr-0041-chat-session-privacy.md),
  [adr-0077](../../../adr/adr-0077-within-a-boundary-a-running-chat-is-visible-its-content-is-not.md)).
- **No topic tags** on rows.

**Mobile:** the header shows ‹ (back to Projects), the project's name and a **Project** button, then the agent
filter and search, the list, and the message box at the bottom. **Project** opens a full-screen Project page
(not an overlay, no tabs): the facts first, the grouped tools below. Its ‹ returns to exactly where the person was.
Each tool opens as its own full screen.

## Project — Conversation

**What a person comes to do:** think something through with the project's agent, ask it to act, answer what it
needs, and look at the project's state without leaving.

- **Selecting a conversation replaces the list** with it. Back is the breadcrumb (desktop) or ‹ (mobile).
- **Bar:** *Projects / Agenthix / Project UX redesign*, and the layout control.
- **Header:** the agent's avatar, the title (rename by editing it in place), the agent's name and when it started.
  There is no menu: conversations are not pinned (most end in one sitting), and there is no close.
- **One agent per conversation, fixed.** The message box names the agent ("Message Project manager…") and has no
  picker. Several agents in one conversation is not part of this design.
- **What the conversation shows** is below (*What a conversation shows*); voice stays in the message box.
- **No structured items** (task cards, plan cards, suggested-action buttons) beyond what chat already shows.
- **Mobile:** full screen. The header shows ‹, the agent's avatar, the title and a **Project** button that opens
  the full-screen Project page ([Project — Conversations](#project--conversations)).

### What a conversation shows

Agreed on its own boards, one per feature (2026-10-10). The same in a project and in Chat.

- **Who replied, and when.** Each message and reply is headed by who wrote it and its time ("Project manager ·
  10:26"). The model is not shown on each reply: a change of model is marked once where it happened ("Now using
  Claude Opus 5 · 10:40"), as a quiet centred line.
- **Under each reply, three quiet icons, always visible:** Copy, Usage and Details, each with a tooltip.
  - **Usage** opens a popup over the conversation, moving nothing: the reply's tokens, estimated cost, energy and
    CO₂, with a note that energy and CO₂ are a flat estimate per token. On a phone it is a sheet.
  - **Details** opens the run on the [Runs screen](notifications-runs.md#the-runs-screen). There is no long-press menu on a phone.
- **What the agent did — the work line.** One folded line above the reply that names both what the agent looked
  at and what it changed ("Looked at 12 tasks and 3 conversations, changed 3 tasks · thought for 9s"; "Read 14
  files, edited 4, ran 9 commands · 3 min").
  - **Opened, every step in the order it happened,** reads and changes mixed as they happened, and its thinking
    where it happened. Each step is one plain line with its time; never a raw tool name.
  - **A change stands out where it happened,** with a mark and a link to what changed (AGX-41). A command shows as
    the command, on one line.
  - **Long runs:** steps of the same kind in a row collapse to one line ("Read 14 files ›"), never across a
    change. Past about 20 lines, the first and last few show, with "Show all 64 steps" between.
  - **Each step's exact input and output** are only on the run's page, reached by Details or "Open the run ›" at
    the end of the opened line, never in the conversation.
- **A reply in progress.** The message box stays open while the agent works and follows the person's setting for
  sending into a busy conversation (Settings › Conversations): **Wait** queues the message behind the reply,
  shown with **Send now** and **Cancel**; **Interrupt** stops the reply and sends at once. Stop stays its own
  button.
- **An approval asked mid-run.** A card: "Project manager needs your approval to go on", each item as what it will
  do and why in plain words (never "Manifest", "extended access" or "Bash prefixes"), then **Approve** and
  **Deny**, the words Notifications uses.
  - **A long list** shows two items, then "+ N more", which opens and closes in place. "Approve allows all N"
    sits under the buttons.
  - **Once answered,** the card folds to one line in the work line's style: "▸ ✓ Approved by Avery · 10:52 ·
    fetch a web page, npm install +3", or Denied, or "Not answered — replaced by a newer message". Opened, it is
    the same card in its answered state, with "for this run only · View on the run ›" (or "Nothing ran") where the
    buttons were.
  - Asking ends a run and the answer starts the next, so the folded record sits between two work lines, in order.
    It is on the agent's side: never a message of the person's that they did not write.
- **A failed run** stays where its reply would be, and is kept: a reload loses nothing.
  - **The latest reply, while it is a failure,** shows its work line, the reason in plain words ("The site lost
    its connection to the model."), and **Try again**, which sends the same message again in a fresh run that
    sees what the failed one did. There is never more than one Try again in a conversation.
  - **Once a newer message is sent,** the failure folds to one line in the work line's style ("▸ ✕ Failed · 10:31
    · the site lost its connection to the model"), opening to what it did and the reason, with no button.
  - **A stopped run** folds the same way ("▸ Stopped by you · 10:31 · read 3 files, changed 1").
- **The conversation's total** leaves the message box. The header's "started…" line (▾) or a Usage icon at the
  header's right opens a popup: when it started and by whom, the model, how many replies (and failed), its total
  usage, the agent's memory, and "This conversation's runs ›". On a phone, tapping the title opens it as a sheet.
- **The agent's memory** (its context). The agent works from the runtime's own copy of the conversation, which the
  runtime may summarise without HQ's transcript changing; so the figure is always the runtime's, as of the last
  reply, and never counted from HQ's transcript.
  - **A bar** filled to the share used, with "62% · 124k of 200k tokens", "as of the last reply · summarises
    itself at about 92%", and a tick at that point. Its colour shows how full it is: the accent under 70%, the
    warning colour from 70%, the danger colour from 90%. It sits in the conversation's popup.
  - **Nearly full** (from 90%): a quiet notice above the message box with the bar, small: "The agent's memory of
    this conversation is nearly full. It will summarise older messages soon."
  - **Summarise now,** beside the bar and on the notice, starts at once (its tooltip says it uses a little model
    usage); disabled while the agent works. Anyone who may send messages may press it.
  - **Where the runtime summarised,** a quiet centred line: "The agent summarised everything above to make room ·
    10:40" (or "You summarised…"), opening to "What the agent remembers now" — the summary itself, three lines then
    Show all — and "You can still read every message above; the agent works from this summary."
  - **Where the runtime no longer holds the conversation** (for example its state was removed), the conversation is
    closed, never continued from a clean slate ([adr-0076](../../../adr/adr-0076-a-conversation-whose-harness-state-is-gone-is-closed.md)):
    its full history, a notice that the agent no longer has its context, no way to send, and a way to start a new
    conversation with the same agent.

## Chat — the personal space

"Chat" is the person's personal space. Today's personal project ("My tasks") and today's global chat become one
place. The two already share storage: a personal task works in the person's own storage, and so does a chat with
no project.

- **The same design as a project** ([Layouts](shell.md#layouts), [Project — Conversations](#project--conversations), [Project — Conversation](#project--conversation), [The tools panel](tools-panel.md)): conversations list, conversation, tools panel, four layouts. The bar
  reads *Chat*.
- **Any agent in the organisation** can be talked to here. A project's conversations stay with that project's
  agents. The message box reads "Ask any agent…" with an agent picker.
- **Facts:** who sees it (only you), agents (any in the organisation — opening them in the panel, each with your
  permissions in Chat), Site, Files (your personal files). **Site is
  hidden until the person's storage has one.** A person's storage is placed on one site the first time it is
  used, and never moves (`UserStoragePlacement`).
- **Tools:** Work (Tasks, Boards) · Agents at work (Runs, Automation, Run all and Stop all) · Files (Files, Artefacts,
  Knowledge, Workspaces — a person can own workspaces). There are no People or Agents rows and no Settings: the space is
  one person's, and any of the organisation's agents works in it.
- **Project conversations do not appear here.** They live in their project.
- **Questions spanning projects are not possible yet,** because projects can sit on different sites. That is
  future work, with delivering knowledge across sites.
- **Mobile:** Chat is a top-level screen, so its header opens the drawer (☰). A **Space** button opens the
  full-screen page of facts and tools.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Conversations placed in a project** | A conversation started from a project is created with the project as its primary owner (`createSession` already accepts this). A project's conversations list is the person's own chats placed in it. A project conversation may only use the project's agents. A conversation started from Chat works in the person's own storage, as today |
| **A reply knows its run** | Each reply records the run that produced it, so Details opens that run. Today a transcript entry has no run, and a reply cannot link to it |
| **A failed run kept in the conversation** | A run that fails is written into the transcript where its reply would be, with its reason in plain words, and Try again sends the same message again. Today the error is only a banner above the message box, and after a reload the message stands with no reply and no reason; a run stopped after working loses its tool calls on screen |
| **Sending into a busy conversation works** | The message box sends while a run is going, following the person's Wait or Interrupt setting, with Send now and Cancel on a waiting message. Today the server supports both, but the message box swaps Send for Stop and sends nothing while a run is going |
| **An approval's answer on the agent's side** | The answer to an approval is recorded as the request's answered state — who answered, when, what was allowed — not as a message from the person. Today it is stored as a special message of the person's ("Manifest approved") |
| **The agent's memory from the runtime** | After each run the site reads the runtime's context use — tokens, the point it summarises at and the model's window — and forwards the runtime's summarising, with its summary, as a marker in the transcript; Summarise now asks the runtime to summarise. Claude (Agent SDK) reports these through its compaction event, its context-usage call and its post-compaction summary, and is asked with `/compact`; OpenCode through its compaction event and summary message, each reply's tokens against the model's limit, and its summarise call. Today the site forwards none of this and ignores OpenCode's context-overflow error |
| **Usage per reply and per conversation, behind a click** | A reply's usage opens from its Usage icon; the conversation's total from its header. Today both are always shown — a line under every reply and a running total inside the message box, cut off |

## Not in this pass

- "Show in Tasks" (and the like) on an agent's action line, opening the tool with the change marked.
- Structured items inside a conversation.
- Collaborative conversations in a project — inviting people, directing an agent (or one of several) with a
  mention, tasks as topics of many conversations.
