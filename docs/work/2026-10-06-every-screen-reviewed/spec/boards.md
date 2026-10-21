# Boards

Part of the unit's design spec: see [the index](README.md).

## The Boards tool

Agreed on its own mockup. A board is a **workflow**: a lasting set of columns that a kind of work moves through
([adr-0097](../../../adr/adr-0097-a-board-is-a-lasting-workflow.md)). A person comes to the tool to see how a board is
going, to move work along, and, less often, to start a board or finish a sprint.

- **Three kinds of board:**
  - **Project Tasks**, the default: made with every project, never deleted or renamed, its columns the task's own
    states (Backlog, To do, In progress, Done) and fixed. **Every task put on no other board is on it.**
  - **A workflow board**: any columns, each mapping to To do, In progress or Done; lasts until archived.
  - **A sprint board**: a workflow board with **sprints**, numbered time boxes that can be renamed (the number stays
    as a small marker beside the name, "Sprint 12 · Pricing push").
- **Words:** a board has **columns** (no longer "stages"), a task has a **state**, a run has a **run state**.
- **The list:** Project Tasks first, then the others, each with a bar of how many tasks sit in each column, its
  column counts, a sprint board's current sprint and days left, and "N needs you" as a badge on its first line.
  **Archived** is a button at the top; **＋ New** in the header.
- **A board opens inside the tool** (‹ Boards), like everything else. Narrow, its columns are stacked as groups,
  Done folded; with room, the columns sit side by side and cards are dragged between them. A card shows the task's
  key and title, its agent and state, and its priority as a dot; a task opens inside the tool. ＋ Add task in the
  header; Edit columns, Archive and Delete under ⋯. A column's "starts work" shows beside its name and is switched
  in that column's own menu. Run all is the place's, not a board's.
- **Backlog is a board's first column**: the board's tasks not yet started. It shows its own board's tasks always;
  **Show also ▾** adds other boards' backlogs, each under its own heading, so a task can be taken from one. The
  choice is remembered per board, per person. A task moves to another board from its ⋯ (on a card or an opened
  task), landing in that board's Backlog.
- **A sprint board** shows its current sprint in a box at the top (name ▾ for past sprints, dates, days left) with
  **Finish sprint** and **Rename sprint**. Its Backlog holds the tasks in no sprint; moving one into another column
  puts it in the current sprint. **Finish sprint** keeps the done tasks recorded in the sprint, starts the next with
  the same length, and asks where the unfinished tasks go — the next sprint or the Backlog — with nothing chosen
  until the person (or an agent) chooses.
- **Columns · Timeline** in a board's box switches it to its timeline ([The Timeline tool](timeline.md)).
- **New board** in place: a name, Workflow or Sprints, and columns from a template (an organisation's own included).
- **Mobile:** each board full screen with column chips along the top, one column at a time.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **A board is a lasting workflow** | No board is completed and there are no board series; a board is archived. Every project is made with **Project Tasks** (fixed columns, never deleted or renamed), and a task put on no other board is on it, so a task is always on a board. **Backlog** is each board's first column, with Show also for other boards'. A board's "stages" are renamed **columns** in the product and the code (adr-0097) |
| **Sprint boards** | A board may have sprints: numbered, renamable time boxes. Finishing one takes where the unfinished tasks go — next sprint or Backlog — as a required choice, for people and agents' tools alike |
