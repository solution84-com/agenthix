---
created: 2026-11-07
description: A board is a saved view over the project's tasks and holds no task, state or sprint. Built in are the task state and the execution state; others show one type's columns or one custom field's options. Sprints belong to the project.
---

# ADR-0176: A Board Is a Saved View

**Status:** Accepted

## Context

A board was a lasting workflow that owned its tasks: a task was on exactly one board, a sprint was a time box inside one
board, and every project's Project Tasks board held what was on no other. Moving a task to another board dropped its place
on the first with no record there, a sprint could be seen only through one board's columns, and a project's backlog was a
board's first column.

With task types and columns owning a task's state (adr-0174), a board no longer has anything to own.

## Options considered

**Keep boards as workflows and add types beside them.** Rejected: two things would then own a task's place, which is the
problem.

**A task may be on many boards by being copied.** Rejected: copies drift; a view cannot.

**A sprint stays inside a board.** Rejected: a project has one cadence for every type of work, and a sprint board is only
a board filtered to the current sprint.

## Decision

**A board is a saved view of the project's tasks in columns.** It holds no task, state or sprint.

- Two boards are built in: the **task state** (every type, by state) and the **execution state** (read-only).
- Any other board shows **one type's columns**, or **one custom field's options**, with an optional filter (sprint, epic,
  agent).
- Dragging a card on a board changes what that board's columns mean: a type's column (so its state), the state's default
  column, or a field's value. The execution board is not dragged.
- A task has **one rank**, project-wide; every board sorts by it, and it is the order an agent's Start follows.
- A **sprint belongs to the project**: one series, one cadence, a task in at most one sprint. Finishing a sprint is an
  explicit act.
- Boards are the project's only and are not shared through the Library; what is shared is types and fields (adr-0174). A per-person view is not part of this.

## What this binds

- **No path stores a task's place on a board.** A task's place is its type, column, rank and field values.
- **Anything that created a task on a board** creates it in a type's column, in Backlog by default.
- Undoing it means boards that own tasks again, with the loss of place when a task moves.

## Consequences

### Positive
- A task can be on many boards without being copied; a new view costs no data.
- The backlog is a task state, the same on every board and list.

### Negative
- A person must understand that a board is a way of looking, not a place.

### Risks
- Saved boards can multiply; the list of boards shows each one's spread so a stale one is visible.

## References

- adr-0097 — superseded by this record
- adr-0174 — a task's type and column set its state
- adr-0175 — work starts only by an explicit act
