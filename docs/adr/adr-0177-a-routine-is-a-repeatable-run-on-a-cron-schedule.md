---
created: 2026-11-07
description: A routine is a schedule (cron and a timezone), an agent and instructions; each firing starts one run, with no task per round. It runs on behalf of the last person who changed it. HQ's one scheduler reads each routine's cron rule.
---

# ADR-0177: A Routine Is a Repeatable Run on a Cron Schedule

**Status:** Accepted

## Context

A routine used to keep one round ready as an ordinary task, created ahead of time, and at its time that task started like
any other (adr-0092, adr-0104). A repeating run therefore needed a task it did not need, with a task's board, column and
approvals, and the next round had to exist before it was due. With work starting only by an explicit act (adr-0175), a
routine's firing is that act, made in advance by a person.

## Options considered

**Keep creating a task per round.** Rejected: it ties a repeating run to a board and a column for no reason, and leaves a
trail of tasks.

**Intervals instead of cron.** Rejected: people need "weekdays at 9:00" and "the first weekday of the month".

**A job per routine in an external scheduler.** Rejected: one tick a minute that reads stored due times already exists and
is cheaper to supervise.

**Run as the routine's creator.** Rejected: the access a run uses should be the access of whoever last decided what it
does.

## Decision

**A routine is a repeatable run.** It is a schedule, an agent, instructions and an optional model, in a project or a
person's own space, and on or off.

- The schedule is a **cron expression and a timezone**, no more often than every 5 minutes.
- Each firing starts **one run** of the agent with the instructions. A routine creates or starts tasks only through its
  agent's tools.
- It runs **on behalf of the last person who changed it**; saving a change that moves whose behalf it runs on says so first.
- A firing while the last run is still going is skipped and recorded as skipped.
- HQ's one scheduler keeps ticking each minute and reads each routine's stored next-due time (adr-0088).

## What this binds

- **A routine owns no task, board or column**; its runs are listed with every other run.
- **Anyone who may work in the project may make or change a routine**, and the access its runs use is that person's.
- Undoing it means a task per round again, and the board rules that came with it.

## Consequences

### Positive
- A repeating job is what it looks like: a schedule and instructions.
- Accountability is one named person at any time.

### Negative
- A routine that should leave a trail of tasks relies on its instructions to make them.

### Risks
- Changing someone else's routine moves its access to the person who changed it; the save asks first.

## References

- adr-0092 and adr-0104 — superseded by this record
- adr-0088 — one scheduler in hq; it stays
- adr-0095 — a run is on behalf of whoever started it
- adr-0175 — work starts only by an explicit act
