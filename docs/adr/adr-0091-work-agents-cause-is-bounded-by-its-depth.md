---
created: 2026-10-03
description: A task an agent's run queues counts one deeper than that run, on every way of queueing it; past the boundary's maximum it waits for a person. Pacing work with the pulse's throttle is optional and off by default.
---

# ADR-0091: Work Agents Cause Is Bounded by Its Depth, Not Its Pace

**Status:** Accepted

## Context

Agents can queue work for each other. AgentX's run queues a task for AgentY, whose run queues one for
AgentX, and the loop has no natural end. Whatever starts work unattended (adr-0087) needs a bound on
how far one thing a person asked can lead.

The first bound was pace: the pulse started queued tasks only in throttled batches, with an interval
between rounds, so a chain advanced one step per interval. That slows a loop and never stops it, and
it shows people a queue that does not move for reasons only the system knows — a queued task that sits
looks like a fault.

Any bound counted per task can be sidestepped if an agent can make an existing task queued again, by
moving it back into a column that queues automatically or by starting it directly. And a run that a
person-started run starts directly had been counted as the person's own, so it carried none of the
limits on unattended runs: one press of **Run** could lead to a chain of runs with no end.

## Options considered

**Pace alone — the throttle always on.** Rejected: a chain is slowed, not stopped, and every boundary
pays in a queue that does not move.

**A cap on runs no person started, per agent per day.** Rejected as the primary bound: it stops a loop
only after it has spent the day's allowance, and it limits legitimate work as much as runaway work.

**Depth counted when a task is created.** Rejected: an agent could recycle an existing task to reset
the count.

## Decision

**Work agents cause is bounded by its depth, counted on every act of queueing.**

- A task a person queues or starts, directly or by asking an agent in a run they started, is at depth 0.
- A task queued by a run that the pulse or a schedule started is one deeper than the task that run
  was for — however it was made queued: created queued, moved into a column that queues, moved back
  after finishing, or started directly.
- Past the boundary's maximum depth the task is not queued; it waits for a person, and a person
  queueing it returns it to depth 0.
- A run an agent starts directly is never counted as a person's, whatever run started it, so it carries the
  limits on unattended runs and cannot start another.
- The maximum is an automation setting: the org sets it, and a boundary may only lower it.
- **The pulse's throttle is optional and off by default.** With it off, each agent's queued tasks
  start one at a time as the agent comes free. Pacing is a choice about cost, not the safety bound.

## What this binds

- **Every path that can make a task queued records its depth.** A new tool, column behaviour or
  integration that queues work must count it, or it reopens the loop.
- **Every path that starts a run says whether a person started it**, and an agent-started run is never
  one.
- Undoing it means returning to pace as the safety bound, which slows loops without stopping them.

## Consequences

### Positive
- A runaway chain stops at a known depth instead of crawling forever.
- Queued work starts as soon as its agent is free, so a queue that sits has a reason that can be shown.

### Negative
- A legitimate chain deeper than the maximum needs a person to queue its next step.
- Every queueing path carries a depth, which new code has to keep.

### Risks
- **Breadth is not bounded by depth.** One run can queue many tasks at the next depth; the queue limit
  on agent-queued tasks and the per-run limits bound that, not this record.

## References

- adr-0087 — work starts on its own only from a boundary's automation; this record replaces the pace
  of its pulse as the bound on agent-caused work, and leaves the rest standing
- adr-0088 — one scheduler in hq starts every automated start
- adr-0089 — every task runs on behalf of a person
