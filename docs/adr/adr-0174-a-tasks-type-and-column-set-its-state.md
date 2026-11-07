---
created: 2026-11-07
description: A task has a type and sits in one of that type's columns; each column sits in one of four built-in task states, so the state follows the column and a board never sets it. Execution state is separate, set by the system, and a custom field never sets either.
---

# ADR-0174: A Task's Type and Column Set Its State

**Status:** Accepted

## Context

A board's column used to set a task's state, so moving a card changed whether the task was done, and a board could not simply
describe a project's own steps (a bug that is triaged, fixed, tested). A task lived on exactly one board, so the state and
the place were one thing. Planning (what is committed to, under way, finished) and running (what an agent is doing with it
now) were also mixed in one list.

Projects need their own kinds of work with their own steps, while every list, count and agent needs one state that means
the same thing everywhere. Both had to hold without either deriving from the other.

## Options considered

**Share a board as a Library item, as before.** Rejected: a board is a view (adr-0176), so what is worth sharing is the
types and fields it shows.

**Keep a board's column as the state.** Rejected: it is the problem. A task cannot be on two boards, and moving a card is
an unannounced change of whether work is done.

**A custom field whose options carry a task state.** Rejected: a task may have a value in many fields, so the state would
be ambiguous, and "done" would depend on which field was last moved.

**One workflow for the whole project, with columns shared by every kind of work.** Rejected: bugs and content pieces need
different steps, and adding kinds of work after release would change every board.

**Derive the state from the latest run.** Rejected: a run ending is not the work being done; a person or the agent with
its tool decides that.

## Decision

**A project has task types; each type has its own columns; each column sits in exactly one of four built-in task states
(Backlog, To do, In progress, Done). A task has one type and is in one column of it, and its state is the state of that
column.**

- Every project has the types Task and Epic. Epic is never run, and may have an agent that manages it.
- The task state is the same four words in every project, and Done always means done. Backlog is the first and is where a
  new task starts.
- Setting a state directly puts the task in that state's default column of its type. Changing a task's type keeps its
  state.
- The execution state (what an agent is doing with a task now) is separate and is set only by the system from the task's
  latest run. A finished run does not change the task state.
- A custom field is an extra view over tasks. It never sets the task state or the execution state.
- Types and fields are shared through the Library as **task templates**, which hold task types with their columns,
  custom fields with their options, or both. Installing one adds them to a project and leaves a same-named type or field
  alone; what it adds is the project's own.

## What this binds

- **Anything that filters, counts or acts on "done" or "to do" reads the task state**, never a column's name.
- **A column belongs to a type and to one state**; moving a column to another state is an explicit act that names the
  tasks it affects.
- **Task types and fields are defined per project**, and shared as task templates; organisation-wide types and linked tasks are additive later.
- **The Library's board template becomes the task template**, an asset kind in the same layer (adr-0157).
- Undoing it means a task's state would again depend on where it is drawn.

## Consequences

### Positive
- One place a task's progress is read; boards, lists, agents and counts agree.
- Each kind of work has its own steps without changing what "done" means.

### Negative
- A project has types and columns to understand, though a new project starts with one type whose columns are the four
  states.

### Risks
- A project may define many types; the cost of that is borne by the Tasks and board screens, not by the state.

## References

- adr-0097 — superseded by adr-0176 (a board is no longer where a task's state lives)
- adr-0175 — work starts only by an explicit act
