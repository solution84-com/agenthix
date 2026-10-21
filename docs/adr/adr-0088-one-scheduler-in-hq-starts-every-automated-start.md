---
created: 2026-10-03
description: hq runs one scheduler that, at the top of every minute, starts whatever is due; every pulse and schedule stores when it is next due in the database, and each start is claimed atomically. No timer per item, no timing state held only in memory.
---

# ADR-0088: One Scheduler in hq Starts Every Automated Start

**Status:** Accepted

## Context

A boundary's automation (adr-0087) starts work at times: a pulse when its interval has passed, a
scheduled task at its time. Something in hq has to notice that a time has arrived.

The mechanism this replaces held a timer in hq's memory for each agent. Every change — enabling it,
changing its interval, importing an agent, stopping one — had to find that timer and reset it, and a
restart lost them all and rebuilt them from scratch. A timer missed by any one of those paths is a
run that fires when it should not, or one that never fires, and neither shows up as an error.

Automation multiplies the number of things with a time: one per boundary with a pulse, one per
scheduled task. And a person who sets a task for 9:00 expects it at 9:00.

## Options considered

**A timer per pulse and per schedule.** Rejected: precise to the second, but every edit, pause,
deletion and loss of access must reach its timer, every boot must rebuild all of them, and two hq
processes would each fire every one.

**One scheduler that ticks on a fixed interval, unaligned.** Rejected only in its timing: a task set
for 9:00 could start most of an interval late.

**A database job queue or an external scheduler.** Rejected: a new dependency for a need that one
indexed query a minute meets.

## Decision

**hq runs one scheduler, and every automated start goes through it.**

- **What is due is stored, not held.** Every pulse and every schedule stores when it is next due.
  A change to it — an edit, a pause, a lost access — changes that stored time and nothing else.
- **It ticks at the top of every minute**, and asks the database what is due. Queueing a task also
  wakes it at once, so a pulse that is due fires without waiting for the minute.
- **Each start is claimed with an atomic database update**, so overlapping ticks, or more than one hq
  process, start an item once.
- **A restart loses nothing.** On boot the scheduler reads what is due; anything that fell due while
  hq was down starts once, not once per missed occurrence.

## What this binds

- **No timing state for org work lives only in hq's memory.** Anything that must happen at a time
  stores its due time and is started by the scheduler.
- **Schedules are precise to the minute**, not the second.
- **hq can run as more than one process** without automation starting anything twice.

Undoing it means moving to per-item timers and rebuilding their bookkeeping on every path that
changes one.

## Consequences

### Positive
- The cost is one indexed query a minute, whatever the number of boundaries and schedules.
- Editing or pausing automation cannot leave a timer behind.
- A restart neither resets throttles nor starts every boundary at once.

### Negative
- Nothing can be scheduled more precisely than a minute.

### Risks
- **A tick that takes longer than a minute** overlaps the next. The atomic claim keeps that correct;
  it does not keep it fast, so a slow tick is a defect to find in the logs rather than a silent one.

## References

- adr-0087 — work starts on its own only from a boundary's automation
- adr-0050 — hq dispatches; the site executes
