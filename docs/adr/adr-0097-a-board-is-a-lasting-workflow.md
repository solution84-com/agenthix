---
created: 2026-10-08
description: A board is a lasting workflow, not a short-lived container. Every project has Project Tasks, a fixed To do · In progress · Done board that holds every task put on no other board. Backlog is a board's first column. Sprints are time boxes inside a sprint board, finished in place.
---

# ADR-0097: A Board Is a Lasting Workflow

**Status:** Superseded by adr-0176

## Context

A board was short-lived: it was Active, then Completed, and completing it sent unfinished tasks to the project
backlog and started a new board in a series ("Sprint 2" becomes "Sprint 3"). That life cycle existed for one
case, the agile sprint. It made every board temporary, including the ones that describe a kind of work that never
ends (bugs, launch content), and it gave a task two backlogs: the project's, for tasks on no board, and each
board's own.

A new project also had no board, so its first tasks sat on no board until someone made one.

## Options considered

**Keep the life cycle, and add sprints as boards in a series.** Rejected: every workflow would still end, and a
board's history would be spread across a chain of boards.

**A task may be on no board.** Rejected: it keeps a second kind of backlog beside every board's, and moving work
between boards would still go through a place that is not a board.

## Decision

**A board is a lasting workflow: a named set of columns that a kind of work moves through. It lasts until it is
archived.**

- **Project Tasks.** Every project is made with one board, Project Tasks, whose columns are the task's own states
  (To do, In progress, Done). It cannot be deleted, renamed, or have its columns changed, and has no sprints and
  no column that starts work by itself. **A task put on no other board is on Project Tasks**; a task is always on
  exactly one board.
- **Backlog is a board's first column**: the tasks on that board not yet started. A Backlog shows only its own
  board's tasks unless a person chooses to show other boards' backlogs beside them. A task moves to another board
  into that board's Backlog.
- **A sprint board** is a board with sprints: numbered, nameable time boxes. Its columns show the current sprint;
  its Backlog holds tasks in no sprint, and moving one into another column puts it in the current sprint.
  **Finishing a sprint** keeps its done tasks recorded in it and starts the next sprint with the same length; where
  the unfinished tasks go — the next sprint or the Backlog — is a required choice of whoever finishes it, a person
  or an agent, with no default. Past sprints stay readable.
- **No board is completed** and there are no board series. A board no longer used is archived.
- **A board's columns are called columns**, in the product and in the code (they were "stages"). Three kinds of
  state keep three names: a board's **column**, a task's **state** (To do, In progress, Done), and a run's **run
  state**.

## What this binds

- **Every path that creates a task without a board puts it on Project Tasks**, and every project is created with
  it.
- **Finishing a sprint takes the unfinished tasks' destination as a required argument**, in hq's actions and in any
  tool an agent has.
- What a column does when a task enters it (`autoQueue`, adr-0087) is unchanged.
- Undoing it means boards that end again, and a backlog that is not a board's.

## Consequences

### Positive
- There is always somewhere for work to go, from the moment a project exists.
- A board keeps its identity and its history; a sprint board keeps its past sprints in one place.
- One kind of backlog: a board's.

### Negative
- A project with several boards has several backlogs; seeing them together is a filter a person turns on.

### Risks
- Boards that are never archived accumulate; the boards list shows archived ones only on request.

## References

- adr-0062 — people are members, agents are assigned
- adr-0087 — work starts on its own only from a boundary's automation; a column queues
- adr-0092 — a routine is its own thing that creates tasks

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.11 and 3.13, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
