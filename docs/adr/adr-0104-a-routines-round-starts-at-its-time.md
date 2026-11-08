---
created: 2026-10-10
description: A task starts in one of three ways — its column starts work, a person presses Run, or its time comes. A routine's round is the third, like a task's start time; with no agent it waits for a person.
---

# ADR-0104: A Routine's Round Starts at Its Time

**Status:** Superseded by adr-0177

## Context

adr-0092 made a routine a schedule that keeps its next round ready as an ordinary task, and left the round to its
board: at its time it starts only if its column starts work, and otherwise waits for a person. Project Tasks, the
board every project has and the one a routine uses when it names none, can never have a column that starts work
(adr-0097). So a routine set up the plain way never runs its agent, and only a workflow board built for the purpose
makes one run. A task's start time, meanwhile, already starts the task at its time whatever its column. Two kinds
of "this happens at 9:00" behaved differently.

## Options considered

**Keep the round to its board's rules, and default routines to a board that starts work.** Rejected: no such board
exists by default, and how a routine behaves would still hang on a column switch elsewhere.

**Let each routine choose between running its rounds and only creating them.** Rejected: whether the routine has an
agent already says which.

## Decision

**A task starts in one of three ways: its column starts work when it is placed there, a person presses Run, or its
time comes. A routine's round starts the third way, as a task's start time does.**

- At its time, a round **with an agent** starts as if its person pressed Run, on behalf of the routine's person,
  whatever column it sits in. A round with **no agent** waits for a person.
- A routine's schedule and a task's start time are the same thing to the scheduler: a time at which one task
  starts.
- A round is still an ordinary task. If its run fails, it stays to be run again and finished like any task. The
  routine creates the next round on its own schedule, whatever became of the last.
- The board and column a round is placed in only say where it shows; they no longer decide whether it starts.

## What this binds

- adr-0092's rule that a round obeys its board at its time is replaced by this. The rest of adr-0092 stands: a task
  starts at most once on its own, and a routine creates tasks and follows none.
- What delays a start time delays a round in the same way: automation turned off for the boundary, the agent
  already busy in that project, a site at its limit.

Undoing it means a routine that runs nothing unless its board was built for it.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.32, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
