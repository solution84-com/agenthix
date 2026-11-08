---
created: 2026-11-07
description: How tasks, runs, boards and routines are rebuilt — the decision records and the data contract first, the designs beside them, then task types and columns, boards as views, work that starts per agent, the Workroom and Runs, and routines on a cron schedule.
---

# Implementation Plan · Tasks, runs, boards and routines

## Goal

A task has a type and a column, so a built-in state; a board is a saved view; work starts only by an explicit act, per
agent, from a project's Workroom; a routine is a repeatable run on a cron schedule.

**In scope:** everything in the [spec](spec.md): task types and columns, the task state with Backlog, rank, epics as a
type, sprints on the project, custom fields and boards as views, the execution state, Start and Stop per agent, Run at…,
the removal of the old starting model, the Workroom, Workrooms and Runs, Your tasks, the rail, routines, the one
Markdown editor, the agents' tools, the client protocol, documents, tests, and the design-check leftovers the spec
carries.

**Out of scope** (each in the spec, with its reason): conversations and their model; places, files and workspaces; the
Fleet Console; custom fields other than single select; linked tasks; organisation-wide task types. None is blocked by
this shape: each is additive.

## Approach

**Replace the model in one direction: contract, then services, then screens.** The old and the new model cannot live
side by side (a board that owns a task and a task that belongs to a column of its type are different answers to the
same question), and until `0.1.0-rc.1` nothing is converted. So there is no flag and no bridge: the unit's branch is
the only place the new model exists, and it merges whole at close. Phase 1 writes the decision records and commits the
shared shapes in `core` and the schema once, with the one definition of the execution state and of what needs the person, so every lane
reads one contract. Phase 3 then builds what several screens share, once and before any screen: the phone shell, the rail, the Markdown
editor, the avatar ring and the other common pieces, so no lane draws its own. Phase 4 builds the task model on both (types, columns,
state, rank, epics) because boards, starting and the Workroom all read it.

**Boards, starting and routines are separate seams over that model.** A board is a view over tasks and holds no state
(phase 5). Starting work is a single path: an explicit act enqueues a task on its agent's line, in rank order (phase 6).
The old pulse, throttle, queue limit, automation switch and auto-start column are removed in the same phase that adds
Start and Stop, so there is never a moment with two ways to start work. The Workroom and Runs screens (phase 7) read the
execution state that phase 3 writes from each run. Routines (phase 8) reuse the scheduler that stays, reading a cron rule and a
timezone instead of rounds, and start a run through the same path as any other.

**Designs run beside the contract, not after it.** The wireframes are approved. The high-fidelity design of every
screen (phase 2) needs no code, so it runs in parallel with phase 1; the owner reviews the UX, and the lead owns visual
quality. Screen lanes start only when their design is approved.

**How the phases are carried out.** By lanes (`running-lanes`): one purpose, one branch and worktree, one agent, a short
brief citing the task numbers below and the spec section as acceptance, with shared rules in `execution/lane-common.md`
(carried from the previous unit together with the design-check process). Lanes of one phase that share no files run in
parallel, and never more than five agents run an app at once. The lead merges lanes one at a time, each squashed to one
commit, rebased onto the unit branch and fast-forwarded, with no lane merge commits. After a lane, only the tests of what
changed run (`scripts/affected.mjs`); the full regression, the image start tests and the all-flags run happen once at
close. Every lane that changes a screen gets an independent design check, at most three rounds. Lanes on security
(on-behalf-of for a routine, the scheduler) and on races (the agent's line, Stop) run on the stronger model; bounded
work on the cheaper. Agents' tool descriptions are checked on the baseline model. The owner walks the work after
phase 7 and again after phase 8. The branch lands by one merge at close, and only on the owner's say-so.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0091 (a work agent's cause is bounded by its depth), adr-0095 (a run is on behalf of whoever started it), adr-0116 (a feature not ready ships behind a flag) — all Accepted |
| **Implements** | ADR-0174 (a task's type and column set its state), ADR-0175 (work starts only by an explicit act), ADR-0176 (a board is a saved view), ADR-0177 (a routine is a repeatable run on a cron schedule): Accepted on this branch by task 1.1 |
| **Revisits** | adr-0087 (superseded by adr-0175), adr-0092 and adr-0104 (superseded by adr-0177), adr-0097 (superseded by adr-0176); adr-0088 (one scheduler) stays Accepted and is annotated: the scheduler remains, reading cron rules |

## Key decisions

| Decision | Why |
|---|---|
| The contract (decision records, `core` shapes, schema) lands first, in one lane | Every later lane reads it; several executors agreeing on shapes none of them can see being built is the failure to avoid |
| No feature flag and no bridge between the old and new model | The two answer the same question differently, so they cannot both be live; pre-release the branch is the isolation, and the clean-slate rule means nothing is converted. A flag cannot gate a schema swap |
| Remove the old starting model in the same phase that adds Start and Stop | A moment with both is a moment where work could start two ways, which is the problem the unit exists to end |
| Rank is stored once per task, project-wide | Every board and every agent's Start must agree on order; a rank per board is the old per-board drift |
| The task state is written with the column, never computed on read | Lists, counts and agents filter on it; a join through the column on every read buys nothing and hides a wrong state |
| One scheduler stays, reading each routine's stored next-due time | One tick per minute is cheap and already exists (adr-0088); a cron job per routine would multiply what to supervise |
| A routine runs on behalf of the last person who changed it, and saving says so first | Accountability for the access a run uses; the person is shown the consequence at the moment it changes |
| Against: keep boards as workflows that own their tasks | It is problems P2 and P3: moving a card changes done, and a task cannot be on two boards |
| Against: let a custom field set the task state | Many fields per task would make the state ambiguous; only a type's columns do |
| Against: keep an automation switch, a pulse or a column that starts work | Hidden ways to start work are problem P5; explicit acts only |
| Against: convert existing data to the new model | The clean-slate rule holds until `0.1.0-rc.1`; old rows are wiped |
| Against: one execution plan for the contract | The shape is fixed in the spec and the data model; a lane brief and committed types are enough |

## Work breakdown

**This is the source of truth for progress across the whole unit.** Tasks are ticked here when done, by the lead as each
lane merges.

### Phase 1 — Records and contract

**Delivers:** the decision records, the shared shapes and the schema that everything else reads, with the old shapes
marked deprecated per `versioning.md`, and the one definition of the execution state and of what needs the person. **Starts when:** the
spec is approved (it is). **Execution plan:** none — one lane writes the contract; the spec's data model is the acceptance.

- [x] 1.1 Write the four Accepted decision records (ADR-0174 to ADR-0177), supersede ADR-0087, 0092, 0097 and 0104, and annotate ADR-0088
- [x] 1.2 Add the task, type, column, board, sprint, field, routine and run-state shapes to `core`, and the client protocol version with deprecation marks
- [x] 1.3 Change the hq schema: task types, type columns, task fields, board as a view, sprint on the project, custom fields, routine; clean-slate migration
- [x] 1.4 Change the site schema: a run's routine reference and a task-less run
- [x] 1.5 Create every project's Task and Epic types with the four state columns, at project creation
- [x] 1.6 Draft the agents' tool shapes against the new model, to be reworded and checked in phase 6
- [x] 1.7 Carry the design-check process and lane rules from the previous unit into `execution/`, and name the committed designs (under `boards/`) as every screen lane's acceptance
- [x] 1.8 Define once, in `core`, the execution state (Not started · Waiting · Running · Needs you · Failed · Finished) and what counts as *needs the person* (a task asking for an okay or an answer, a failed run, a routine run asking), so hq, the site and every screen count the same
- [x] 1.9 Rename the Library's `board` asset kind to the task template in `core` and the asset layer (the shape holds task types with their columns and custom fields with their options), with its built-in templates and proposals for review carried like every other kind

### Phase 2 — High-fidelity designs

**Delivers:** each screen drawn in the design system from its approved wireframe, reviewed by the owner. **Starts when:**
the spec is approved; runs in parallel with phase 1. **Execution plan:** none — by hand with designer agents; the
wireframes on the board are the baseline.

- [x] 2.1 Design Tasks, the Backlog planning view, Your tasks, Task, Epic and New task
- [x] 2.2 Design Board and its variants (task state, custom field, execution state, filters, saving, saved boards, phone)
- [x] 2.3 Design Task types, a type's columns, New task type, and Sprints with planning and finishing
- [x] 2.4 Design Workroom and its states, starting work, Runs panel, Workrooms, A run, and project and organisation Runs
- [x] 2.5 Design Routines, A routine and New routine, with the schedule builder
- [x] 2.6 Design the rail's three groups of eleven places and the phone's top bar, ⋯ menu and menu drawer
- [x] 2.7 Owner reviews the UX of each set

### Phase 3 — Shared foundations

**Delivers:** everything several screens reuse, built once before any screen: the phone shell (top bar, ⋯ menu, drawer), the rail of
eleven places and its icons, the one Markdown editor, the avatar ring, the type marks, the ⋯ popover and the Needs-you bar, and the
service that writes the execution state from a task's latest run. **Starts when:** phase 1 is merged. **Execution plan:** none — lanes;
the kit under the committed designs is the acceptance.

- [x] 3.1 Lift `MarkdownBox` into `@agenthix/ui` as the one Markdown editor and use it for descriptions, comments and routine instructions
- [x] 3.2 The phone shell, for every screen: the top bar (menu or Back, title, chat, one ⋯ holding the screen's actions, a dot on the menu when something needs the person), the ⋯ popover, forms as ✕ · title · one filled button, and Notifications and Runs as rows in the menu drawer's foot
- [x] 3.3 The avatar ring as one component (Waiting dotted, Running turning, Needs you a dot, Failed a !), used on cards, rows and headers, with the person avatar
- [x] 3.4 The rail's three groups of eleven places, keeping Boards, Workspaces and Routines
- [x] 3.5 The rail and menu icons: a briefcase for Projects, a checked square for Tasks, folders for Workspaces, a laptop for Workrooms
- [x] 3.6 Write the execution state from a task's latest run and expose it to lists and boards
- [x] 3.7 The shared pieces every screen reuses, built once from the designs' kit: the type marks, the ⋯ popover, the Needs-you bar and the empty-list line (hq-only pieces stay in hq; only what Cloud also uses goes in `@agenthix/ui`)

### Phase 4 — Tasks

**Delivers:** the task model in hq and its screens: types and columns, state, Backlog, rank, epics, task templates and the phone's
selection mode. **Starts when:** phases 1 and 3 are merged; each screen task also needs its design approved (it is). **Execution
plan:** none — lanes; the services are bounded and the contract is committed.

- [x] 4.1 Task service: create in Backlog, set column, derive and write state, rank on create and move
- [x] 4.2 Task type and column services: add, rename, reorder, move a column to another state, archive
- [x] 4.3 Epics as a type: an agent may manage one, it is never run, the "Unassign its agent first" refusal is removed
- [x] 4.4 Tasks screen and Backlog planning view with counts by task state
- [x] 4.5 Task page with type, column, sprint and rank; Epic page; New task
- [x] 4.6 Task types settings screens
- [x] 4.7 Your tasks screen
- [x] 4.8 Agents' task tools reworded for types, columns and states
- [x] 4.9 Settle the design-check leftovers and the open items the spec carries that touch tasks
- [x] 4.10 Install a task template into a project (extends, keeps same-named, says so first) and publish a project's types and fields
- [x] 4.11 Selection mode on the Tasks phone: the top bar becomes ✕ · "N selected" · ⋯ with the bulk actions

### Phase 5 — Boards, fields and sprints

**Delivers:** boards as saved views, custom fields, and sprints on the project. **Starts when:** phase 4's services are
merged. **Execution plan:** none — lanes; runs in parallel with phase 6.

- [x] 5.1 Board as a saved view service: type, state, execution and field kinds, with filters
- [x] 5.2 Custom field and option services with a task's values
- [x] 5.3 Sprint service on the project: one series, planning moves Backlog to To do, finishing is explicit
- [x] 5.4 Board screen and its variants, filters, saving and the saved boards list, including the phone layout
- [x] 5.5 Sprints screen with planning and finishing
- [x] 5.6 Agents' board and sprint tools reworded
- [x] 5.7 Boards in the rail, across projects

### Phase 6 — Starting work

**Delivers:** the one explicit way to start work, with the old model gone. **Starts when:** phase 4's services are merged; runs in
parallel with phase 5. **Execution plan:** none — lanes, the agent's line and Stop on the stronger model; the behaviour is fixed by
D6, D17 and N3–N4.

- [x] 6.1 Remove the pulse, throttle, queue limit, automation switch and the column that starts work, with their settings and screens
- [x] 6.2 Agent's line: Start (ready tasks in rank order), Start all agents, Run and Run at…, one at a time per agent
- [x] 6.3 Stop an agent, Stop every run, and a failure that does not hold the line
- [x] 6.4 `run_task` and the other tools reworded for how work starts, checked on the baseline model
- [x] 6.5 Keep start times (Run at…) and the site's limit on runs at once working through the new path

### Phase 7 — Workroom and Runs

**Delivers:** the places that show runs and what needs the person. **Starts when:** phase 6 is merged. **Execution plan:** none — lanes.

- [x] 7.1 Workroom with its scorecards, states and Needs-you bars, Start and Stop per agent, Start all agents
- [x] 7.2 Workrooms across projects, and the Runs panel
- [x] 7.3 Runs history for a project and for the organisation, with a way to narrow to one kind
- [x] 7.4 A run: steps, model, site, time against its limit, cost
- [x] 7.5 Remove the old Tasks run counts and the old Runs placements

### Phase 8 — Routines

**Delivers:** routines as repeatable runs on a cron schedule. **Starts when:** phase 6 is merged; runs in parallel with phase 7.
**Execution plan:** none — lanes, the scheduler and on-behalf-of on the stronger model.

- [x] 8.1 Routine service: schedule as cron and timezone, agent, instructions, model, on or off, on behalf of the last person who changed it
- [x] 8.2 Scheduler reads each routine's next-due time and starts one run per firing; a firing while the last run is going is skipped and listed
- [x] 8.3 Cron and timezone handling: presets, Advanced, plain-words read-back, the next three times, the 5-minute floor
- [x] 8.4 Routines screens: list, a routine as its edit screen, New routine, and the save-asks-first dialog
- [x] 8.5 `create_routine` and `update_routine` reworded
- [x] 8.6 Remove the task template and rounds
- [x] 8.7 Switching a routine on or off counts as a change (it then runs as that person); Run now is one temporary run on behalf of the person who pressed it and does not change whose routine it is

### Phase 9 — Documents and close

**Delivers:** the documents, the tests and the close-out. **Starts when:** phases 4 to 8 are merged. **Execution plan:** none — by hand.

- [x] 9.1 Concepts: task, board, automation, routines and the agents' execution flow
- [x] 9.2 User guide: task, board, Workroom, Runs and routine pages
- [x] 9.3 QA scenarios for each requirement
- [x] 9.4 Integration tests for the board, sprint, start and routine services, and the cross-app suite where runs start
- [x] 9.5 End-to-end tests for every screen
- [x] 9.6 Close the unit: triage every open item, close the records, close the previous unit's carried items

## Deviations

- **Phase 2 is done (7 Nov).** The designs of every screen, the shared shell kit and the design-system *Surfaces* section were
  reviewed and approved by the owner. The designs changed the model in three ways beyond the spec's first draft, so tasks
  were added: task templates replace board templates (1.9, 4.10), the rail has eleven places (3.4, 3.5), and the phone has
  its own top bar, ⋯ menu, drawer and selection mode (3.2, 4.11). The spec holds the current design for each.
- No other phase has started, so no other deviations.
- **Order changed after the designs (7 Nov):** the architectural, contractual and common work moved first. The execution-state definition
  and the task-template asset kind are now in phase 1; a new phase 3, *Shared foundations*, holds the phone shell, the rail and its icons,
  the Markdown editor, the avatar ring, the common pieces and the service that writes the execution state, so no screen lane builds its own.
  The later phases moved up by one.

- **Built (8 Nov), deviations and decisions taken while building** (each is in the spec's current text where it changed the design; the lead's running record is not committed):
  - *Starting work.* An agent's start through a tool runs on behalf of the **task's person**, not the run's person (spec D6 says the run's person; for a task made in that same run it is the same person). Left as built. Moving a task to Backlog withdraws its queued run (a Backlog task is not in any line). A task's agent can be Started only when the task is in To do, never run, not an epic and has no start time to come. Stop every run stays with project administrators; Start, Start all agents and an agent's Stop belong to anyone who may work in the project.
  - *Boards.* Start all agents… is drawn on a board's header (board.html), though D17 starts work per agent from the Workroom; it uses the same operation and confirmation. Run, Stop and Answer are in a card's ⋯ and on the task page, not buttons on the card (the data-model table said "on the card"; the design and card layout C say no buttons). A saved board keeps what it groups by: Save changes saves the filter only.
  - *Timeline.* The Timeline has no board to draw lanes by: it draws one lane per task type (Epic excluded, an epic sits in the first lane holding one of its tasks, sprints in the first lane); the toolbar reads **Types**.
  - *Routines.* A routine run's transcript is readable only by the person the run is for; other members see the run's line. A routine's own run (a schedule firing or Run now) cannot make or change routines or start tasks. The cron form of "first Monday of the month" differs from the design (routinesvc report). Routines are reordered by dragging (or Move up and Move down on a phone), kept per project.
  - *Screens.* The empty Tasks list keeps the dashed inline line (design system) rather than tasks.html's centred block. The epic page keeps its Milestone and shows its managing agent (D12). The Backlog and To do toolbar is Search, Type and Epic; ＋ Filter and Sort are not built (Sort would conflict with drag-to-rank). The screen-bar "Talk about" button on Boards list, Sprints and Settings is still the 28 px one. Settings has no custom title on a phone. A column that holds tasks cannot be removed (its ✕ is greyed with why); the design drew a dialog that moves its tasks to the default column. The Library keeps no Boards shelf: the board kind is gone.
  - *Model removals (clean slate, with wipes).* Removed from the schema: the pulse, throttle, queue limit and automation switch and their tables; `Task.status`, `isEpic`, `boardId`, `column`, the Board workflow model and its templates, `BoardShowAlso`, the routine rounds and the board asset kind. The mobile-facing wire shapes keep `status`, `isEpic`, `boardId` and `column` as deprecated values derived from the new fields (client protocol 1.16/1.17, unreleased; removal is a major move). Migrations that wipe: non-view boards, board templates.
  - *Protocols.* Client protocol 1.17 (board filter: not in a sprint, type; the board refresh room named by project id) and site protocol 1.15 (a run's routine) are additions only.
  - *Not done.* The agents' tool wording is written and checked in unit tests but the baseline-model wording checks (eight, listed in the tools reports) have not been run: they need a provider key. The guide's screenshot recipes still target removed screens (automation-overview, automation-rules, routine-detail) and the sample seed for the guide (`hq/e2e/fixtures/seed-guide-data.mjs`) was changed but not run. The phone's Run at… time field and the save-asks-first dialog were not exercised by the design check (no write actions allowed).

## Closing note (8 Nov 2026)

- **Accepted by:** the owner, after walking the built screens on 8 Nov 2026 (a clean database with sample data; the UI was found solid). The owner's real test is a live organisation on a server.
- **Verified:** hq unit 8,156; hq integration 4,155; hq end-to-end (`chromium`) 196 pass, 0 fail, 29 skipped; site, core, ui, console, console-web, host and relay suites; cross-app 93, also with every flag on; hq end-to-end with every flag on 199 pass, 29 skipped, 2 failed on a cold first click and passed on rerun (`not-secure` 5 pass, `chatStreaming` among them); typechecks of all modules; image start tests for all eight images; the install test.
- **Deviations:** each phase's deviations are in the list above; nothing was built that the spec did not describe other than what that list names.
- **Open items:** none critical, none blocking release. Deferred as issues #166 to #179 (baseline-model wording checks, guide recipes and seed, `chatStreaming` in `not-secure`, the 400 on opening a task, unused editor packages, QA scenario tags and review, deprecated wire values, Tabs and Input focus ring, the Issues template icon, the task-session send check, activity on bulk and system paths, team template wording, a read-marker race). The rest, layout leftovers and planned follow-ups, are tracked privately.
- **QA audit:** not run at the close. The unit wrote stories US-430 to US-445 and scenarios SC-1781 to SC-1829 from the finished code; their tests are not yet tagged (#171). The audit before release is the independent check.
- **Records:** ADR-0174 to ADR-0177 Accepted; ADR-0087, 0092, 0097 and 0104 superseded; ADR-0088 annotated; ADR-0175 carries a dated note on whose behalf an agent's start runs. No record is left Proposed.
