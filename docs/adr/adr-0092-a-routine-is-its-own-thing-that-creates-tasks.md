---
created: 2026-10-04
description: A task starts at most once. Repeating work is a routine — a schedule and a task template — that keeps its next round ready as an ordinary scheduled task and never runs anything itself.
---

# ADR-0092: A Routine Is Its Own Thing That Creates Tasks

**Status:** Accepted

## Context

Work that repeats — a weekly review, a daily triage — has to be written down somewhere. adr-0087
made it a task that repeats: the same task starts again at each time.

A task, though, also has a state that a person or its agent moves across a board, and *done* means
finished. A repeating task is never finished: it either runs while sitting in a done column, or has to
be moved back on its own, and a column that queues automatically then starts it early. Every round's
comments, results and approvals pile onto one task, and one round that is never finished can stop the
repetition silently. What repeats is the work, not the task.

## Options considered

**A task that repeats, moved back to the first column when it is done.** Rejected: done stops meaning
done, columns need exceptions for repeating tasks, and every round shares one record.

**A routine that runs its work itself.** Rejected for the reason adr-0087 gave: it would need its own
approvals, limits and history beside the task's.

**A routine that creates each round's task at the moment it is due.** Rejected: nobody can see or
adjust the next round before it starts, and the scheduler needs a second way to start work.

## Decision

**A task starts at most once. Repeating work is a routine, which keeps its next round ready as a
task.**

- A routine is a schedule and a task template — including where the round starts: a board and column,
  or the backlog — on behalf of the person who set it up.
- It keeps exactly one round waiting: an ordinary task, created ahead of time for the routine's next
  time. When that time comes, it creates the next.
- It never starts, follows or cleans up a round. *(2026-10-10: the rest of this point is superseded by
  adr-0104 — a round with an agent starts at its time, whatever its column.)* At its time a round obeys its board like any task
  arriving in its column — queued where the column queues automatically, left for a person
  otherwise — and is the task's and the person's from then on.
- Every round is linked to its routine, and a person may unlink it.

## What this binds

- **Nothing makes a task start more than once on its own.** Any future repeating behaviour creates
  tasks; it does not re-run one.
- **A routine's rounds go through the task path and the board's rules** — columns, approvals, limits,
  depth, on behalf of — with no routine-specific exception.
- Undoing it means a repeating task again, with the column exceptions above.

## Consequences

### Positive
- Done means done; columns need no rules for repeating work.
- Each round has its own record, and one round going wrong does not stop the next.
- The next round is visible, and can be changed or skipped, before it starts.

### Negative
- A routine is one more thing to show and manage.
- Rounds accumulate as tasks; boards need finished tasks archived.

### Risks
- **Rounds can pile up where work falls behind** — one per interval, by design. The routine keeps a
  cadence; keeping up with it is the person's.

## References

- adr-0087 — its "a routine is a scheduled or repeating task, not a separate concept" is replaced by
  this record; the rest of it stands
- adr-0088 — one scheduler in hq starts every automated start
- adr-0089 — every task runs on behalf of a person
- adr-0091 — work agents cause is bounded by its depth
