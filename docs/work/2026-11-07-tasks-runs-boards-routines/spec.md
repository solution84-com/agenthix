---
name: Tasks, runs, boards and routines — spec
description: Tasks plan and runs carry the plan out. A task has a type and a column, so a built-in task state; a board is a saved view; work starts only by an explicit act, per agent, from a project's Workroom; a routine is a repeatable run on a cron schedule.
created: 2026-11-07
author: leang
---

# Tasks, runs, boards and routines — spec

**Status:** Approved by the owner on 7 November 2026. Every decision below (D1–D22, N1–N7) was settled with the owner that day,
and so was every screen. The board
[`boards/tasks-runs-boards-routines.html`](boards/tasks-runs-boards-routines.html) holds the approved wireframes, and the
high-fidelity designs drawn from them, with the one shared shell they use, are under [`boards/designs/`](boards/designs/):
together they are the build baseline for screens (open them in a browser). Where a design and a wireframe differ, the design
is current (the phone, the rail's eleven places, the Workroom's cards). The data model is [`spec/data-model.md`](spec/data-model.md);
the screens and what each draws are [`spec/screens.md`](spec/screens.md). The implementation plan is [`plan.md`](plan.md).

## Purpose and outcome

Task management is the core of the product, and today it is hard to explain. A board's column sets a task's state,
so moving a card changes whether the task is done. A task lives on exactly one board. Work starts in a dozen hidden
ways. The Tasks list counts runs, which is the job of Runs. Routines make a task per round and that task starts
itself.

**Outcome:** one model a first user can understand without reading anything:

1. **Tasks plan.** A task is a piece of planned work with a type, a column, a state and a rank.
2. **Runs carry the plan out.** What an agent is doing with a task is a separate state, set by the system.
3. **A board is a way of looking.** Any set of columns over the same tasks; it never owns a task.
4. **Work starts because someone started it.** A person, or an agent with its tool. Nothing starts on its own.
5. **A routine is a repeatable run.** A schedule, an agent and instructions.

## Scope

**In scope:** tasks (types, columns, states, rank, sprint, custom fields, the task page), boards (as saved views),
sprints (a project's own concept), runs (the execution state, the Workroom, the Runs history, one place for what
needs the person), how work starts, routines, Your tasks, the rail, and the one Markdown editor.

**Not in scope:** conversations and the model a conversation uses; places, files and workspaces; the Fleet Console;
custom fields other than single select (later); linked tasks such as blocks and waiting-on (later; additive, no
data to convert); organisation-wide task types (later).

## The problem, numbered

| # | Today | Effect |
|---|---|---|
| P1 | The Tasks list counts run states (Needs you, Running, Waiting) | Planning and running are mixed; Tasks competes with Runs |
| P2 | A board's column sets the task's state | Moving a card changes whether the task is done; a board cannot describe a project's own steps |
| P3 | A task is on exactly one board | Moving it drops its place on the first, with no record there |
| P4 | A sprint is locked inside one board | A sprint can only be seen through that board's columns |
| P5 | Work starts through a column that starts work, an automation switch, a pulse, a throttle, a queue limit, start times and routine rounds | Too many hidden ways to understand or predict |
| P6 | A routine makes a task per round, and that task starts itself | A repeating run needs a task it does not need |
| P7 | There is no project Backlog | Ideas not yet placed sit in some board's first column |
| P8 | Runs are shown in three places that disagree, say a run's state three ways, and hide why a run waits, what it cost and who started it | People cannot tell what is happening |
| P9 | What needs the person is counted in Your tasks, the rail's Runs panel and the task lists | No one place to look |

## Decisions

Each is recorded in an Accepted decision record on this unit's branch (see *Decision records*).

### Tasks, states and types

- **D1 — Tasks plan; runs carry the plan out.** A board is where a set of work is arranged; Tasks, Boards and Runs
  are overviews.
- **D2 — Three kinds of state, never derived from each other.** The **task state** (Backlog · To do · In progress ·
  Done; built in; set on the task). The **execution state** (set by the system from the task's runs). The project's
  **custom fields** (extra views only).
- **D10 — Task types, each with its own columns.** A project has one or more task types (Task, Bug, Feature request
  …). Each type has its own columns, and each column sits in exactly one task state. A task has one type and is in
  one of its type's columns; its state follows from the column. Every project starts with the type Task, whose
  columns are the four states. Changing a task's type keeps its state.
- **D5 — Only a type's columns set the task state,** through the state each column sits in. A custom field never
  does. Done always means done.
- **D11 — Backlog is the first task state.** A new task starts in Backlog. Moving it to To do is deciding to do it.
- **D12 — Epic is a built-in type in every project.** It is never run, but it may have an agent that manages it
  (talks it through, writes and orders its tasks). It replaces the `isEpic` flag.
- **D14 — One rank per task, project-wide.** Every board sorts by it; dragging on any board changes it; it is the
  order an agent's Start follows. It is never shown as a number.
- **D16 — Task types and custom fields are defined per project, and shared as Library task templates.** A task
  template holds task types with their columns, custom fields with their options, or both. It replaces the Library's
  board template: a board is a view and is not shared. Installing a task template **extends** the project: it adds the
  types and fields, and one of the same name that the project already has is left alone, said before the person
  confirms. What it adds is the project's own (later changes to the template do not reach it). Task templates follow the
  same rules as skills (adr-0157, adr-0159): Library maintainers and administrators publish them to the organisation's Library; anyone
  else who may work in the project can propose theirs, and a maintainer reviews the proposal; an agent only drafts or proposes, and a
  person publishes (its request is an approval card). Organisation-wide types come later.

### Boards, fields and sprints

- **D3 — A board is a saved view.** Built in: *Task state* (all types, by state) and *Execution*. Any other board
  shows one type's columns, or one custom field's options, with an optional filter (sprint, epic, agent).
- **D4 — Custom fields are extra views.** Only single select is built now. A task may have a value in many, so it
  can be on many boards; they never touch the task state.
- **D8 — A sprint is its own concept,** a time box on the project. A sprint board is any board filtered to the
  current sprint.
- **D13 — One sprint series per project,** one cadence for every type.
- **D9 — Your tasks is your planned work** across projects. What needs the person lives in Runs only.

### How work starts

- **D6 — A task starts only by an explicit act:** a person's **Run** or **Run at…** on one task; an agent's
  **Start** or **Start all agents** in the project's Workroom; or an agent starting a task with its tool (limits as
  today: on behalf of the task's person, which for a task made in that run is the run's person; in its project; bounded by depth). No column, option, switch, pulse,
  throttle or queue limit starts work.
- **D17 — Work starts per agent, from the project's Workroom.** Each agent has ▶ Start (its ready tasks, in rank
  order, after a confirm with ticks) and ■ Stop. The header has *Start all agents* and *Stop every run* (the latter
  for project administrators). A board's header also has *Start all agents…* (the same confirm); otherwise boards only
  arrange the work, and a single task is run from its page or a card's ⋯. Moving a task to Backlog takes it out of its
  agent's line.
- **D18 — The agent's avatar shows the run,** wherever a task has an assigned agent: Waiting is a thin dotted ring;
  Running a turning ring; Needs you a full ring with a dot; Failed a full ring with a !; Not started and Finished
  no ring. On cards and rows the ring replaces the run marker (words on hover); the task header keeps its words.

### Runs and routines

- **D7 — A routine is a repeatable run** with its own runs, not linked to tasks by default. Creating tasks is
  something its run may do, through its agent's tools.
- **D15 — A routine is a schedule, an agent, instructions and an optional model,** in a project or a person's own
  space, **on behalf of the last person who changed it.** Each firing starts one run (shown in Runs). Each routine
  is on or off.
- **D22 — A routine's schedule is cron plus a timezone,** so it does anything cron allows. People build it from
  presets in words (every N minutes or hours; daily; weekdays; weekly; monthly on day N or the first or last
  weekday) or type any cron under Advanced. It is read back in plain words with the next three run times. No more
  often than every 5 minutes. HQ's one scheduler keeps ticking each minute and reads each routine's cron rule (its
  next due time stored), rather than one job per routine.

### Places and words in the product

- **D19 — Workroom, Workrooms and Runs.** A project's **Workroom** shows its agents at work as scorecards.
  **Workrooms**, in the rail, shows every project's Workroom on one page. **Runs** is the history list, separate
  from both, at both levels.
- **D20 — The rail has eleven places in three groups,** with a divider between them: Home · Chat · Your space |
  Projects · Boards · Your tasks · Workspaces · Routines · Workrooms | Agents · Library. Boards, Workspaces and
  Routines stay in the rail as lists across projects, and are not tabs on the Projects page.
- **D21 — One Markdown editor, everywhere text is written:** a task's description, comments, a routine's
  instructions and any new place. It is built once in `@agenthix/ui` (today's `MarkdownBox`, lifted and used by every
  caller).

### Decided on the screens

- **N1** Adding a Backlog task to a sprint moves it to To do, on its type's default To do column.
- **N2** A task added from a board column starts in that column, at the bottom of the rank; *New task* in the
  header starts in Backlog.
- **N3** A failed run does not hold its agent's line: the failure waits under *Needs you* and the agent takes its
  next task.
- **N4** *Stop every run* also takes waiting tasks out of line, back to Not started; nothing more starts until
  someone runs it.
- **N5** Saved boards are the project's only; a per-person view is too complex for now.
- **N6** Anyone who may work in the project may make or change a routine. It always runs on behalf of the last
  person who changed it, and saving says so first. A change is anything that edits the routine, including switching it
  on or off. **Run now** is a single run on behalf of the person who pressed it, listed as started by them: it does not
  change who the routine belongs to, and the routine's scheduled runs stay on behalf of the last person who changed it.
- **N7** A sprint is finished only explicitly. It stays current, shown as overdue after its date.

**The phone (decided 7 Nov).** The top bar holds the menu (or Back), the title, chat and one ⋯, never more than two icons at the
right. The screen's own actions are behind the ⋯, the main one first, and on a project screen the last item opens the
project's menu. Notifications and Runs are rows in the menu's drawer, with their counts, and the menu shows a dot when
something needs the person. A form is a focused page: ✕ (Cancel), the title and one filled button. There is no row of
actions under the top bar. While tasks are selected, the top bar changes: ✕ leaves selection, the title says how many are
selected, and the ⋯ holds the bulk actions (Move to To do, Add to sprint…, Set epic…, Assign agent…, Select all, Archive);
chat steps aside until selection ends.

Also decided on the screens: column names only wherever a task's column shows (never the task state beside it); the
board's control is **Columns** ("Group by" is kept free for swimlanes); a type is listed in Columns only when its
columns differ from the four states; a card that needs the person has no heavy edge (its Needs-you bar, ring and badge say so), and an agent's avatar leads every card in a fixed column; sprint dates show only on Sprints; *Needs you* sits as bars at the foot of each
Workroom card; routines and agents can be reordered by dragging (kept per project).

## The words

| Word | What it is |
|---|---|
| Task | One piece of work: what, why, who, by when. It has one type, one column of that type (so one task state), a rank, at most one sprint, values in any custom fields, and runs |
| Task state | Backlog · To do · In progress · Done. Built in, the same in every project; the state of the task's column |
| Task template | A Library item holding task types with their columns, custom fields with their options, or both; installing it adds them to a project |
| Task type | A kind of work in a project (Task, Bug, Feature request, Epic) with its own columns. Every project has Task and Epic |
| Column | One of a task type's own named columns, sitting in one task state. On a board grouped another way, the columns are the states or a field's options |
| Epic | The built-in type that groups tasks toward one goal; never run |
| Board | A saved view of the project's tasks in columns: one type's columns; the task state across types; the execution state; or a custom field's options. With an optional filter |
| Custom field | A field the project defines (single select only now). An extra view; never sets the task state |
| Rank | A task's place in the project's one order |
| Sprint | A numbered time box in the project's one series. A task is in at most one |
| Backlog | The first task state: wanted, not yet committed to |
| Run | One go of an agent until it hands back: a task's run, a reply in a conversation, or a routine's run |
| Execution state | What an agent is doing with a task now, from its latest run: Not started · Waiting · Running · Needs you · Failed · Finished |
| An agent's line | The tasks started for one agent in a project, taken one at a time in rank order |
| Routine | A schedule, an agent and instructions; each firing is one run |
| Workroom | A project's agents at work, as scorecards. "Room" is used for nothing else |

"Workflow", "status", "stage" and "step" were considered for a type's columns and rejected: "workflow" already names
the script library. "Command centre" and "Hub" were rejected for the Workroom.

## What a task has

| What | Values | Set by | Answers |
|---|---|---|---|
| Type and column | One type; one of its columns | People and agents, moving the card or setting the column | Where is it in this kind of work? |
| Task state | Backlog · To do · In progress · Done: the state its column sits in | Follows its column; setting the state directly lands on that state's default column | Has it been committed to, is it under way, is it done? |
| Execution state | Not started · Waiting · Running · Needs you · Failed · Finished | The system, from the latest run | What is an agent doing with it now? |
| Custom field values | For each single-select field, one option or none | People and agents | Extra views; never the task state |
| Sprint | One sprint of the project's series, or none | People and agents; *Finish sprint* | Which time box is it planned in? |
| Rank | Its place in the project's one order | Dragging on any board | What comes next? |
| Archived | Yes or no | People and agents; the done-task sweep | Is it out of sight? |

A run ending does not change the task state: a person, or the agent with its tool, moves it.

## Requirements

Numbers are cited by the screens in [`spec/screens.md`](spec/screens.md).

**A board.** B1 see every task in its column, with a count of each. B2 drag a task between columns and reorder
within one. B3 put work in order by dragging; each agent takes its ready tasks in that order. B4 see on a card, only
while it matters, that it is running or needs the person. B5 filter to a sprint, an epic or an agent. B6 talk the
board through with an agent, which adds and orders tasks.

**Boards.** BS1 each board's spread across its columns at a glance. BS2 make a board from a field (or a new
field). TM1 install a Library task template to add its types and fields to a project. TM2 publish a project's types and
fields as a task template, so others can use them.

**Tasks.** T1 counts by task state, and what is late or has no agent. T2 one line per task with its fields (each a
column that can be shown), epic, agent and due date. T3 search, filter and sort by any of them, with no fixed
grouping. T4 the project Backlog in view. T5 each epic with its progress.

**Runs (a project's, and across projects).** RU1 what needs the person first: approvals, questions, failures. RU2
each agent's line: running now and its step, up next, why it waits. RU3 what finished, its result and its cost. RU4
start an agent on its ready tasks, or every agent at once, and stop an agent or a run. RU5 task runs, replies and
routine runs, with a way to narrow to one kind.

**A task and a run.** TK1 the approved task page (where it stands, does it need me, its result, its runs, change
course, organise it), with type, column, sprint and rank added. RN1 a run's steps, model, site, time against its
limit, and cost.

**Your tasks.** Y1 the tasks the person owns or that their agents hold, across projects, by due date.

**Routines.** RT1 say "every weekday at 9:00, do this" with an agent and instructions. RT2 see each routine's runs
like any other run.

## What changes

| Area | What changes |
|---|---|
| Data (hq) | See [`spec/data-model.md`](spec/data-model.md). Nothing is converted: the clean-slate rule holds until the first release candidate |
| Starting work (hq) | The pulse, the throttle, the queue limit, the automation switch and the column that starts work are removed. Kept: each agent's line, start times, run limits, and the site's limit on runs at once. New: Start and Stop per agent, and Start all, in the Workroom |
| Epics (hq) | An epic may have an agent again (today it is refused with "Unassign its agent first"); Start, Start all agents and Run skip it |
| Routines (hq, site) | A routine fires on its schedule and starts one run of its agent with its instructions; no task per round. The scheduler fires routines and start times only |
| Agents' tools | `create_task`, `update_task`, `change_tasks`, `list_tasks`, `get_board`, `list_boards`, `open_board`, `create_board`, `finish_sprint`, `rename_sprint`, `run_task`, `create_routine`, `update_routine` are reworded for types, columns, fields, views, sprints on the project and how work starts. Their descriptions are checked on the baseline model |
| Client protocol | The task and board shapes the browser and the mobile app receive change: a version move with deprecation marks, per [`docs/architecture/versioning.md`](../../architecture/versioning.md) |
| Screens | See [`spec/screens.md`](spec/screens.md) |
| Docs | Concepts (task, board, automation, routines, agents' execution flow), the user guide's task, board and automation pages, and QA scenarios |
| Tests | Integration tests of the board, sprint, start and routine services; the cross-app suite where runs start; end-to-end for every screen |

## Decision records

Accepted on this unit's branch: adr-0174 (a task's type and column set its state), adr-0175 (work starts only by an
explicit act), adr-0176 (a board is a saved view) and adr-0177 (a routine is a repeatable run on a cron schedule). They
supersede adr-0087, adr-0097, adr-0092 and adr-0104; adr-0088 (one scheduler) stays and is annotated. adr-0091 (depth) and
adr-0095 (on behalf of) stand.

## Carried from earlier work

Design-check leftovers to settle in this unit: the fields' 1 px focus ring; the task header's column chip on a
phone; the contrast tokens; a Viewer's run line cut with no tooltip; Members' marks on a phone. Open items from the
previous unit: "Asked you something" has no source in hq; activity is not recorded on bulk and system paths;
`NewTaskRow` is still used on boards and an agent's page; any member may send into a task's session on the server.
`getTaskList` and `getMyTaskList` are hq-internal, not client protocol.

## Questions answered

| # | Question | Answer |
|---|---|---|
| Q1 | May an agent start a task? | Yes, with today's limits: on behalf of the person its run is for (ADR-0095), in its run's project, depth bounding chains (ADR-0091), recorded as the agent's. Only the queue limit goes |
| Q5 | Is the project's Tasks board replaced by the built-in Task state board? | Yes (D3); a task needs no board |
| Q8 | Linked tasks in this unit? | No; additive later |
| Q9 | Who may define custom fields and boards? | As today: anyone who may work in the project |
