---
created: 2026-11-07
description: A task starts only because a person or an agent chose to start it — Run, Run at…, an agent's Start or Start all agents, or an agent's tool. No column, switch, pulse, throttle or queue limit starts work.
---

# ADR-0175: Work Starts Only by an Explicit Act

**Status:** Accepted

## Context

Work could start in many hidden ways: a column that started work when a task arrived, an automation switch for a boundary,
a pulse that started queued tasks in throttled batches, a throttle and a queue limit bounding the pulse, start times, and
a routine's rounds. A person could not tell why a task had started or not, and each way needed its own limits.

The one thing automation must still allow is that agents keep work moving ("how else will we automate"), and that a
person can say when a task is picked up.

## Options considered

**Keep the pulse and the automation switch, and simplify their settings.** Rejected: it keeps a way to start work that
nobody pressed, and the throttle and queue limit exist only to bound it.

**Start work when a task enters a column.** Rejected: it ties starting to where a card is drawn, which a board no longer
owns (adr-0174).

**Let a task's agent start it whenever it is ready.** Rejected: it is the pulse again, under another name.

## Decision

**A task starts only by an explicit act.** The acts are:

- a person's **Run** on one task, or **Run at…** (a start time on the task);
- an agent's **Start** in the project's Workroom (its ready tasks, taken one at a time in rank order), or **Start all
  agents** (every agent in the project, each on its own ready tasks);
- an agent starting a task with its tool, on behalf of the person its run is for, in its run's project, with chains bounded
  by depth (adr-0095, adr-0091).

No column, option, switch, pulse, throttle or queue limit starts work. A failed run does not hold its agent's line. **Stop
every run** takes waiting tasks out of line, back to not started.

> **Note, 8 Nov 2026:** as built, an agent's start through its tool runs on behalf of the **task's person**, which for a task made in that same run is the person the run is for (adr-0095, adr-0091 still bound it). Starting on behalf of the run's person for another person's task was left out; the choice of person for an existing task is the task's.

## What this binds

- **Any future automatic behaviour starts work through these acts**, never by a new hidden trigger.
- **Every start is attributable** to a person or to an agent run on a person's behalf.
- The scheduler stays, and starts only what an explicit act scheduled (a start time, a routine's firing; adr-0177).
- The limits that stay are the site's limit on runs at once, a run's own limits, and depth.
- Undoing it means reintroducing a way for work to start that nobody pressed.

## Consequences

### Positive
- "Why did this start?" has one answer.
- Nothing runs, and nothing is spent, while nobody has asked.

### Negative
- A standing job needs a routine (adr-0177) or a person to start it.

### Risks
- Agents starting tasks with their tool can still create chains of work. Depth bounds them; it does not prevent them.

## References

- adr-0087 — superseded by this record
- adr-0088 — the scheduler stays; its pulse is gone
- adr-0091 — work agents' cause is bounded by its depth
- adr-0095 — a run is on behalf of whoever started it
