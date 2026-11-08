# Tasks, runs, boards and routines — screens

Part of [`../spec.md`](../spec.md). Every screen is approved as a wireframe on
[`../boards/tasks-runs-boards-routines.html`](../boards/tasks-runs-boards-routines.html), which is the baseline: it
carries each screen's numbered key and what it replaces. High-fidelity designs are drawn from it, reviewed by the
owner, and every build that changes a screen gets an independent design check (up to three rounds).

| Screen | Draws | What it is |
|---|---|---|
| Tasks, Tasks planning the Backlog | T1–T5, D2, D11 | A project's list. Scorecards count the task state (Backlog first), never runs. One line per task: type, column, epic, agent, due; any field can be a column; default order is the rank. Planning view for the Backlog and for epics (rows with a ring) |
| Board (by type, task state, custom field, execution state; filters; saving; saved boards; phone) | B1–B6, BS1–BS2, D3, D4 | One board screen. The **Columns** menu chooses a type's columns, the task state, a custom field, or the execution state (read-only). Filters by sprint, epic, agent. Dragging sets rank. Run markers appear only while a run matters. Save the view as a board; a list of saved boards; a phone layout |
| Task types, a type’s columns, New task type | D10, D12, D16 | Project settings: the types, each type's columns and the state each sits in, the default column per state, creating a type from a Library template |
| Task, Epic, New task | TK1, D12 | The approved task page with type and column in the header, sprint and rank in Details. An epic's page. New task picks a type and starts in Backlog, on a page shaped like the task page |
| Your tasks | Y1, D9 | The person's planned work across projects, by due date |
| Workroom (states, starting work, project Runs) | RU1–RU5, D17, D18 | A project's agents as scorecards: running now, up next, why one waits, finished with cost; ▶ Start and ■ Stop per agent; *Start all agents* and *Stop every run* in the header; waiting, stopping, empty and phone states; the project's Runs history |
| Runs panel, Workrooms, A run, Organisation Runs | RU1–RU5, RN1, D19 | The rail's Runs panel; Workrooms (every project's Workroom on one page); a single run (steps, model, time against its limit, cost; names, not usernames); the organisation's Runs history, showing the person's own runs by default |
| Sprints, planning and finishing a sprint | D13, N1, N7 | The series, the current sprint, planning one from Backlog and To do, *Finish sprint*. The next two sprints can be planned ahead, as drawn |
| Routines, a routine and New routine | RT1–RT2, D15, D22, N6 | The list; a routine's page is its edit screen (name, agent, instructions in the Markdown editor, schedule builder with presets, Advanced cron, timezone, read-back and next three runs, on/off, *Run now*); its runs; *New routine* is the same page empty. Saving asks first when it moves whose behalf the routine runs on |

Other places that change: the phone's top bar, ⋯ menu and drawer (spec, *The phone*); the rail (D20: eleven places in three groups, Boards, Workspaces and Routines kept in it); the
Markdown editor is shared (D21); the Automation tool and Manage › Settings › Automation are removed or reduced.

## Taken as drawn

A drop on a state lands on the type's default column; boards across types get a Type filter; anyone in the project
may add a field option; *Run* is greyed on a card without an agent; "Current sprint" follows to the next; leaving
an unsaved view asks nothing; *Boards* opens the list; there is no board archive; on a phone, *Save as board* is in
⋯. Dragging rows on Tasks changes rank only while sorted by Rank; the run marker stays on Tasks and Your tasks;
custom fields are listed in Settings and made from the Columns menu; a task with runs cannot become an epic; an
epic never moves column by itself; a new task goes to the bottom of the rank; "yours" is a task whose *For* is the
person (ADR-0095). Routine runs and replies do not wait in an agent's line; a stopped run reads "Stopped by …" and
its task goes back to Not started; the Runs page is reached from the panel and Home, not the rail; a reply opens its
conversation.

## Decided on the designs

- **Rail icons:** a briefcase for Projects, a checked square for Tasks (rail and menu), folders for Workspaces, a laptop for Workrooms.
- **Workroom cards:** no status pill; the avatar's ring is the status, the first panel is called *Now*, and needs-you shows only as the
  bars at the card's foot, with no heavy outline.
- **Board cards:** calm, with the content on top and people and controls at the bottom. The top is one small line with the priority dot
  and the key, then the title across the full width (two lines at most). The bottom row appears only when the task has an assignee: the
  avatar (with its ring) at the left and the card's ⋯ at the right, shown on hover and focus. A task with no assignee has no bottom row.
  The row is built for more than one assignee later (agents and people). No type-and-column text and no buttons on a card (an answer is
  given on the task page and in the Workroom's Needs-you bars); on a phone the actions are in the top bar's ⋯, or a long press. On a board
  that mixes types, a small type icon sits before the key. Workroom and Routines cards keep their avatar leading in a fixed column.
- **The phone:** a top bar with the menu (or Back), the title, chat and one ⋯; the screen's actions behind the ⋯; forms as ✕ · title ·
  one filled button; Notifications and Runs in the menu drawer's foot; selection mode on the Tasks phone (see the spec, *The phone*).

## Not yet drawn

Two screens follow from D16 and are not on the approved board: **installing a task template** into a project (what it
adds, and which same-named types or fields it leaves alone, said before the person confirms) and **publishing** a
project's types and fields as a task template. They are drawn with the Task types screens and shown to the owner.
