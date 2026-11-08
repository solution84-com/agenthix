---
created: 2026-10-03
description: An agent has no schedule of its own. Work starts without a person pressing Run only from a boundary's automation — its pulse and its schedules — which is hq code, not an agent run, and which only a person sets up.
---

# ADR-0087: Work Starts on Its Own Only from a Boundary's Automation, Never from an Agent

**Status:** Superseded by adr-0175

## Context

Agents are meant to keep work moving without a person pressing **Run**. The mechanism that was to do
it gave each agent a schedule of its own: on a timer, the agent woke in a run of its own, read its
queue and chose what to start.

That shape was decided when an agent was an actor with authority of its own. Authority now comes
from the boundary a run happens in — a project or a person's own space (adr-0060) — and an agent
holds none. A run that belongs to an agent rather than a boundary therefore has no authority to
start anything in a project, no boundary's settings apply to it (adr-0072), and it needs exceptions
of its own everywhere a run is assembled. Giving it a boundary would mean choosing one for an agent
that works in many, or granting it the union of all of them, which adr-0060 forbids.

Separately, nothing limited automated work. Whatever starts work unattended has to be something a
person can see, bound and pause in one place.

## Options considered

**Keep an agent's own schedule, and give its run a project scope.** Rejected: an agent working in
several projects needs either one run per project, which is a boundary's schedule under another
name, or authority across all of them, which is the union adr-0060 rules out. And the choice of what
to start stays with a model reading text, which a task's own content can steer.

**A boundary's schedule that starts an agent run to decide what to start.** Rejected: it spends a
model call and a container every interval to do what a query does, and leaves the choice of what
runs to a model.

**A routine as its own kind of thing, separate from tasks.** Rejected: it would need its own
approvals, limits and history, beside the task's.

**Agents free to schedule work themselves.** Rejected: an agent working unattended could then
schedule work to get around any throttle or limit placed on automation.

## Decision

**An agent has no schedule of its own. Work starts without a person pressing Run only from a
boundary's automation.**

- **Automation belongs to a boundary** — a project, or a person's own space — and is off until
  that boundary turns it on. Its admins set a project's; a person sets their own. One switch turns
  all of it off.
- **The org has the final word.** It decides whether automation is allowed at all and how far any
  boundary may go; a boundary can only be stricter. An org that turns automation off has turned it
  off everywhere, and no boundary can turn it back on.
- **It is hq code, not an agent run.** It makes no model call and starts tasks through the same path
  as a person pressing **Run**, so an automated start runs in the boundary like any other.
- **It has two parts.** *(2026-10-04: its last sentence, a routine as a scheduled or repeating task, is superseded
  by adr-0092 — a routine is its own thing that creates tasks; the rest of this record stands.)* A **pulse** starts the boundary's queued tasks in throttled batches. A
  **schedule** on a task starts that task at its time. A routine is a scheduled or repeating task,
  not a separate concept.
- **Only a person sets up automation.** An agent may set a schedule only on behalf of the person who
  started its run directly, and only where the boundary allows it. A run that automation started
  never sets up automation.

## What this binds

- **Nothing gives an agent a timer, a queue or a run of its own.** Any future automatic behaviour is
  a boundary's automation or a person's action, and it starts work through the task path.
- **Every automated start is attributable to a boundary's setting** that a person turned on, and is
  stopped by that boundary's one switch or the org's.
- **Any new automation setting follows the same rule**: the org sets the limit, a boundary only
  tightens it.
- **A run's context must say what started it** — a person, the pulse, or a schedule — because what
  it may do depends on it.

Undoing it means giving agents authority of their own again, which adr-0060 would also have to
reverse.

## Consequences

### Positive
- An automated run has a boundary like every other run: that boundary's settings, credentials and
  storage apply, and no run needs an exception for having none.
- Nothing runs and nothing is spent while nothing is due.
- Pausing a boundary is one switch, and what is left afterwards is a bounded list.

### Negative
- A standing job an agent used to do on its own timer now needs a person to set up a repeating task
  for it.
- An agent cannot decide on its own initiative to come back to something later.

### Risks
- **A person can still turn on automation in a boundary whose agents create work for each other.**
  The pulse's throttle and the limit on how much agents may queue bound it; they do not prevent it.
  *(2026-10-03: bounded by depth instead of the throttle, which became optional — adr-0091.)*

## References

- adr-0060 — authority comes from the boundary, never a union
- adr-0072 — an agent is defined once in hq and overridden per boundary
- adr-0088 — one scheduler in hq starts every automated start
- adr-0089 — every task runs on behalf of a person
- adr-0025 — its section 6, the agent-scoped heartbeat, is superseded by this record
- adr-0032 — its sections *Agent as router* and *Heartbeat session is agent-scoped and persistent*
  are superseded by this record
