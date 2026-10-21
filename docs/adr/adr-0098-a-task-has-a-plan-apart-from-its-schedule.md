---
created: 2026-10-08
description: A task's start and finish dates are a plan, kept apart from its start time (when the agent starts) and its runs. An epic is a task that groups tasks; a milestone is a dated goal epics belong to.
---

# ADR-0098: A Task Has a Plan Apart From Its Schedule

**Status:** Accepted

## Context

A project's work is about to be shown on a timeline: what is planned when, what agents worked on, and what is
coming. A task has a start time, which starts its agent at that moment, but no dates for when the work is meant to
happen. A task can take several runs before it is done, so the dates a person plans and the moments an agent runs
are not the same thing.

Seen across a month or a year, single tasks are too fine to read: a project needs work grouped into larger pieces,
and those pieces tied to goals with dates.

## Options considered

**One start: the timeline's start is the start time.** Rejected: planning a task for next week would also schedule
its run for next week, and a task worked over several runs has no single start.

**Themes or initiatives above epics.** Rejected for now: a third level of hierarchy that rarely ends and needs
tending. Strategy across projects is the organisation's level (adr-0061), and a later design.

## Decision

**A task has a plan — a start date and a finish date — kept apart from its schedule and its work.**

- **Plan:** the start and finish dates. Changing them moves no work.
- **Schedule:** when the agent starts — a task's start time, or a routine's round (adr-0092). Unchanged by this
  record.
- **Work:** the runs that happened, read from the site, as today.

**An epic is a task that groups other tasks**; a task belongs to at most one epic. An epic's plan is its own, or,
when it has none, the span of its tasks'.

**A milestone is a dated goal** in a project; an epic may belong to one milestone.

## What this binds

- Nothing that changes a task's plan starts, stops or queues a run; only a start time, a routine, a column that
  starts work, a person or the automation does (adr-0087).
- Agents' task tools can read and set a task's plan, its epic and its milestone, under the same rules as their other
  task changes.
- Undoing it means dropping the plan dates, epics and milestones, and the timeline that shows them.

## Consequences

### Positive
- A timeline can show what was planned, what is scheduled and what happened, without mixing them.
- A month or a year can be read as epics and milestones rather than single tasks.

### Negative
- A task now has two kinds of date, which agents and people must keep apart.

### Risks
- Plans that are never updated drift from the work; the timeline shows a task's runs inside its plan, so the drift
  is visible.

## References

- adr-0061 — a product and a programme group work and own nothing
- adr-0087 — work starts on its own only from a boundary's automation
- adr-0092 — a routine is its own thing that creates tasks
- adr-0097 — a board is a lasting workflow

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.12 and 3.14, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
