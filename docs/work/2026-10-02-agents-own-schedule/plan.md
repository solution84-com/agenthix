---
created: 2026-10-02
description: Building "agents act on their own schedule, within a boundary" — remove the agent heartbeat first, then build automation (the pulse and scheduled and repeating tasks, on one scheduler), personal projects, on-behalf-of approvals and run limits in parallel lanes, and prove them together.
---

# Implementation Plan · Agents act on their own schedule, within a boundary

**Design spec:** [`spec.md`](spec.md) ·
**Branch:** `feature/agents-own-schedule`

## Goal

A project or a person can turn on automation — a pulse that starts their queued tasks as their agents come free, optionally throttled, and
tasks that start at their scheduled time — so work keeps moving without anyone pressing **Run**, and every automated run happens inside a boundary, on behalf of a person, within
limits. The agent heartbeat, which cannot do this and sits outside every boundary, is gone.

**Excluded, with reasons, in the spec's *Out of scope*:** adaptive intervals and agents messaging people after launch; spend limits and expiring approvals, which need priced token totals; a per-boundary limit
on agents running at once unless walkthroughs need it; the subscription terms question, which stays with the subscription redesign.

## Decision records

| | |
|---|---|
| **Depends on** | ADR-0042 (hq is the org's own), ADR-0060 (authority comes from the boundary), ADR-0072 (an agent is defined once and overridden per boundary), ADR-0075 (runs execute in parallel; the site's limit on runs at once stays). All Accepted |
| **Implements** | adr-0087 (work starts on its own only from a boundary's automation), adr-0088 (one scheduler in hq), adr-0089 (every task runs on behalf of a person). Written in phase 1. adr-0090 (a connection is a person's own) and adr-0091 (work agents cause is bounded by its depth) and adr-0092 (a routine is its own thing that creates tasks) were added during the build |
| **Revisits** | ADR-0025 §6 (agent-scoped heartbeat) and ADR-0032's two heartbeat sections — superseded by adr-0087. ADR-0030 and ADR-0031 — checked at close for what the heartbeat's removal makes untrue |

## Approach

**Removal first, alone — and it must leave room.** Taking the heartbeat out touches hq, site, core's protocol, ui, the
agent packages and the library — the same files every other lane would build on (`dispatchService`, `TaskRunner`, the
run launch path, the agent pages). Done in parallel with the rest, every lane would conflict with it. So it is phase 2
on its own, and the lanes cut from its result.

Phases 1 and 2 only take things out and add the run limits the dispatch carries; they decide nothing about how the
pulse, schedules or personal projects are built. They leave no hook, stub or placeholder for them, and nothing in
them may assume a shape the lanes would then have to fit. Where removal exposes a seam that the design does not fit —
a file that cannot be cleanly removed, a contract a later lane needs differently — the lane stops and says so rather
than working around it. The spec is a design to be proved, not a mould (see *Deviations*).

**Rework, not rename.** The pulse is the same purpose as the heartbeat with a different mechanism, so the lanes build it
new and lift only what fits from the code phase 2 removes: the overlap guard (`hasLiveHeartbeatRun`), the countdown
hook, and the on/off, interval and run-now controls of `HeartbeatTab`. Its per-agent timer registry is not lifted:
there is one scheduler. The agent
run path — dispatch, session, container, prompt, `/scratch` — is not lifted. Phase 2's first step records the commit
before removal; lanes read the old files from it.

**One scheduler in hq, beside `TaskRunner`, not a new runner.** At the top of every minute, and when a task is
queued, it starts every pulse and scheduled task that is due (spec §2). It decides *when* and *which*; starting a task
stays `TaskRunner.runTask`, so an automated start runs exactly like one a person starts. Its state — each item's next
due time, each boundary's last round, and the record — is in hq's database, so a restart recomputes it rather than
losing it. It follows hq's existing sweeps (`packageContentSweep`, `previewSweep`). The pulse and schedules are one
lane because they share the scheduler; atomic claiming goes into `TaskRunner` in the same lane, because
automation is what makes concurrent claims routine.

**Pulse settings follow ADR-0072's shape.** One row per boundary, edited in project settings and personal settings
the way per-boundary agent overrides are. Run limit defaults are org settings; per-boundary tightening uses the
narrow-only rule those overrides already have.

**A personal project is an ordinary project with one flag and one rule.** The flag marks it personal and binds it to
its person; the rule is that its sessions' storage location is the person's own space, which already makes the
runner `{kind: 'person'}` (`resolveRunner`) and so selects that person's credentials, settings and storage. The
security review of this lane is the lead's, because a mistake here runs a person's work under a project's authority —
the heartbeat's error again.

**Run limits are enforced on the site.** The site already owns the run's lifetime and stops runs; the limit values
travel in the dispatch. The hq-memory 30-minute timer is removed when the site's time limit lands.

**Clean slate.** Nothing is released, so removed columns are dropped and new ones are added with no data migration.
Destructive migrations are confirmed with the owner before they run.

**Resource strategy for the lanes.** Up to four lanes in their own worktrees contend for memory and CPU (typechecks,
unit tests), the dev databases and the Docker daemon. Heavy commands run one at a time under a machine-wide lock;
lanes run only the unit tests they touch while iterating and their module's unit suites once before reporting; no
lane runs integration, container or cross-app suites — the lead runs those once after combining. The lead watches
free memory, swap and load, with alerts at 25% free memory, 1 GB swap or load 14, and critical at 15%, 3 GB or 20;
on a critical alert the Sonnet lanes pause first, then lanes are run two at a time.

**How the work is run.** The lead is the main session, which also does all design talk with the owner.

- **The lead** coordinates; writes the phase 1 records; reviews every lane's report and diff; resolves design
  questions with the owner in the main thread — lanes never ask the owner anything, they report an assumption or stop;
  runs the machine monitor; runs the integration, container and cross-app suites; and merges. The lead runs on Opus
  throughout, because coordinating the lanes means holding the whole system end to end; it also does the security
  review of lanes B and C itself.
- **Subagents** are given an explicit model per task, the least capable that does it well (table below), run in the
  background with the lead as the bridge, write their report to a file in the unit's `execution/`, and never run the
  heavy suites. Each works in its own worktree on its own lane branch.
- **Obvious assumptions** are made and listed in the lane's report, batched into one report at the end of the phase.
  **Security concerns and blockers are raised to the owner at once**, never batched.
- **Lanes land as one unit each.** A lane's commits are squashed into a single commit, rebased onto the branch head and
  merged `--no-ff` one lane at a time, so the branch reads as one block per lane and lanes never interleave. A lane's
  review fixes are folded into its commit before it merges. A `backup/` branch is made before any rebase or squash.
  The next lane is rebased only after the previous one has merged.
- **The lead watches the machine** for the whole of phases 2 and 3 with a monitor on free memory, swap and load,
  alerting at the thresholds below and again on recovery. Subagents are started only when the monitor is clear.

| Work | Model | Why |
|---|---|---|
| Phase 1 — the three ADRs | Lead | A few short records settled in the design session |
| Phase 2 — removal | Sonnet subagent | Bounded deletion across files; the lead reviews the diff |
| Lanes A, B, C | Opus subagents | The scheduler, races and atomic claiming; the person-binding security rule; approvals and access |
| Lane D | Sonnet subagent | A bounded feature with a clear spec |
| Security review of lanes B and C | Lead | A mistake runs a person's work under a project's authority |
| Phase 4 and 5 | Lead | Running and verifying, not building |

**No execution plans.** Each lane's tasks below name their own area and the spec section that settles their content;
lanes report what they built and any assumption they made, and the lead reviews before merging.

## Key decisions

| Decided | Instead of | Why |
|---|---|---|
| A pulse belongs to a boundary and is hq code | Repairing the agent heartbeat with a project scope | An agent holds no authority; the boundary that bears the cost decides when work runs; no model call when idle |
| One automation switch per boundary covers the pulse and schedules | A switch each | Pausing a boundary stays one action |
| The org sets each automation value; a boundary only tightens, the stricter applying at use | Free choice per boundary; values set per site | The org answers for its sites and credentials and can turn automation off with no boundary able to overturn it; a project's runs can span sites, so a per-site value has no single meaning |
| A scheduled task starts at its time | Waiting for the next pulse | A person who sets 9:00 expects 9:00; the throttle is aimed at agent-created work, the runaway risk |
| One scheduler, every minute at the top of the minute, nudged on queueing | A timer per pulse and schedule | State stays in the database, so restarts and edits cannot leave a ghost or missed run; constant cost; minute precision is all schedules need |
| An agent sets a schedule only in a run a person started, when the boundary allows it | Agents scheduling freely; people only | A person can delegate it; unattended work can never schedule work around the throttle |
| A routine is its own thing that keeps its next round ready as a scheduled task | A task that repeats; a routine that runs work itself or creates the task only when due | Done means done and every round has its own record; rounds go through the task path; the next round can be seen and changed before it starts |
| A task starts at most once; "make this a routine" from its page | Repeat settings on a task | What repeats is the work, not the task |
| Finished tasks archived automatically, an org default each project may change freely | Manual archiving only; an org limit | Routines and busy boards pile up finished tasks; it is a convenience, not a safety control |
| Chains bounded by depth, counted on every act of queueing | Pacing chains with the pulse's interval | Depth stops a runaway loop where pacing only slows it; counting the queueing, not the creating, means recycling a task never resets it |
| Each agent works its queue one at a time; the throttle is optional and off by default | Batches and an interval always | A queued task that sits for no visible reason looks like a fault; with depth bounding chains, pacing is a choice about cost, not safety |
| When on, a leading-edge throttle measured from when a round finishes, a batch per agent | A fixed timer; one batch for the boundary | Quiet boundaries respond at once; busy ones leave a gap; agents do not compete for priority |
| One run-state label per value, the same word everywhere: Queued, Throttled, Running | Queued and Waiting, or a label read from the reason | A person reads one word for one meaning; why a task has not started is shown beside it |
| A queue limit on agent-created tasks only | Limiting people too; a cap per run | People keep full control; the limit bounds the backlog rather than one run |
| A personal project, whose runs are the person's | A task with no project | Reuses every project page; the person's boundary is kept by the one rule on its runs |
| Approvals go to the person the task is done on behalf of, inherited down the chain | Project admins | The person who caused the work answers for it; admins can still approve |
| Time limit on every run; turn limit on runs no person started | Turn limit everywhere; no limits | A person present can stop their own run; unattended loops burn turns first |
| Removal as its own phase | Removal as one lane among others | It touches the files every other lane builds on |

## Work breakdown

### Phase 1 — Records and the shared contract

**Delivers:** the three ADRs, and the protocol changes every lane builds against. **Starts when:** the owner approves
the spec. **Execution plan:** none — a few files whose content the spec settles. The ADRs are the lead's.

- [x] 1.1 adr-0087 — work starts on its own only from a boundary's automation; ADR-0025 §6 and ADR-0032's two heartbeat sections marked superseded
- [x] 1.2 adr-0088 — one scheduler in hq starts every automated start
- [x] 1.3 adr-0089 — every task runs on behalf of a person

### Phase 2 — Remove the agent heartbeat (spec §1)

**Delivers:** a system with no agent heartbeat, every suite passing. **Starts when:** phase 1 is merged into the
branch. **Execution plan:** none — the spec's §1 is the list. One lane, a Sonnet subagent, with the lead reviewing; it lands as a single commit like any lane.

- [x] 2.0 core: remove the `heartbeat` dispatch, runner and session kinds; add what started a run (`person`, `pulse`, `schedule`) to the dispatch, set to `person` on every path that remains and recorded on the site's run; protocol version bump
- [x] 2.0a Record the commit before removal, for lanes to read the removed code from
- [x] 2.1 hq: heartbeat timer, manager, `pulseAgent`, heartbeat dispatch and session, queries, `Agent` heartbeat columns (destructive migration, confirmed with the owner)
- [x] 2.2 site: heartbeat execution, queue key, `/scratch`, container key and name, harness home, prompt sections
- [x] 2.3 ui and hq pages: Heartbeat tab, list toggle, indicators, countdown, tooltip
- [x] 2.4 Packages and library: `heartbeat.md`, `agent.json` fields; standing jobs moved into instructions
- [x] 2.5 The `heartbeat` session type; agent-started task runs are task sessions
- [x] 2.6 Tool text: `create_task`'s "picked up by the heartbeat"

### Phase 3 — Build in parallel lanes

**Starts when:** phase 2 is merged into the branch. Each lane is cut from the branch, rebased and merged back
`--no-ff` one at a time, with its fixes folded in first. **Execution plan:** none per lane — tasks name their area
and spec section.

#### Lane A — Automation: the scheduler, the pulse, schedules and reliable starts (spec §2, §3, §6) · Opus

- [x] 3.A1 Automation settings: org values in org settings (automation allowed, interval with the 5-minute floor, batch size, queue limit, agents may set schedules) and each boundary's own choices, narrow-only, the stricter applying at use; schema, validation and the "limited by the org" display
- [x] 3.A2 The scheduler: one loop at the top of every minute, nudged on queueing; next due times stored; atomic claim of each start; recompute on boot
- [x] 3.A3 The pulse: leading-edge throttle measured from a round's end; batches per agent, by priority then age; only what was queued when it fired
- [x] 3.A4 Every automatic queueing path leaves the task for the pulse; reconnect drain kept
- [x] 3.A5 Queue limit on agent-created tasks, with the tool result saying the task was not queued
- [x] 3.A6 Schedule fields on a task: a one-off time, or a repeat rule with the 5-minute floor
- [x] 3.A7 Scheduled starts at their time, on behalf of the person who set them, with the reason shown when an agent is busy or the site is full; queued instead when automation is off; next due after each completed run; one catch-up after downtime
- [x] 3.A8 Setting a schedule: in the UI with the edit permission; by an agent only in a run a person started, when the boundary allows it
- [x] 3.A9 Atomic claim per (agent, project) in `TaskRunner` and `triggerNext`
- [x] 3.A10 `run_task` fails on a task that is not queued; decide whether agents keep it
- [x] 3.A11 The record of pulses and scheduled starts, and the automation section in project settings and personal settings

#### Lane B — Personal projects (spec §4) · Opus

- [x] 3.B1 Personal flag and owner on a project; created with each account; one member, cannot be left, shared or deleted
- [x] 3.B2 Its sessions' storage is the person's own space, so its runs are `{kind: 'person'}` with their credentials, settings and storage
- [x] 3.B3 Visible to its person only, in every query and page that lists projects or tasks
- [x] 3.B4 Its place in navigation

#### Lane C — On behalf of, approvals and loss of access (spec §5) · Opus

- [x] 3.C1 `onBehalfOf` and `queuedBy` on a task, set on every creation path, inherited through agent-created tasks
- [x] 3.C2 Approval requests notify that person (a new notification type), linking to the request
- [x] 3.C3 Losing project access blocks every task done on that person's behalf there, until reassigned
- [x] 3.C4 Reassigning who a task is done on behalf of, for project admins

#### Lane F — A person's own connections to hq (spec §10) · Opus

- [x] 3.F1 A connection per person: name, hashed token, permission groups, project list, expiry (90 days by default), last use, revoked
- [x] 3.F2 `/mcp` accepts a connection and acts as its person, narrowed by its groups and projects; refuses an expired or revoked one
- [x] 3.F3 The connections page in each person's own settings: create (token shown once), list, renew, revoke
- [x] 3.F4 The org-wide MCP key retired: its secret, its admin page and its admin-equivalent path

#### Lane D — Run limits and the site's run capacity (spec §7, §8) · Sonnet

- [x] 3.D1 Org defaults for the time limit and the turn limit; per-boundary tightening, narrow-only
- [x] 3.D2 The site enforces both, the turn limit on runs no person started, ending a run with a reason that names the limit; a stopped task is blocked
- [x] 3.D3 Remove hq's in-memory 30-minute timer
- [ ] 3.D4 Measure one run's memory and CPU; set `AGENT_MAX_CONCURRENT_RUNS`'s default from it; sizing in the deployment guide — *dropped from this unit: the sizing method is in the deployment guide; the measurement moves to a deployment machine*

#### Lane G — Run state, and the walkthrough's findings (spec §6) · Opus

- [x] 3.G1 The run state: `executionState` → `runState` with the six `RUN_…` values and their labels, one label table in `ui/`, no raw value shown anywhere; `update_task_state` removed from agents
- [x] 3.G2 Run end settles the run state and always starts the agent's next waiting task; column moves change it only to queue, or to withdraw a queued run in a done column; dismiss and run again
- [x] 3.G3 A due pulse or schedule fires on its minute; the pulse record shows how each start went
- [x] 3.G4 The project automation save; the dev seed (project admin, Execution Site, no fake states); the project-less page request
- [x] 3.G5 Tests that reproduce each finding against the database: agents blocking, moving and finishing their own tasks mid-batch, and acting on their other tasks

#### Lane H — Depth, an optional throttle, and saying why a task waits (spec §2, §6) · Opus

- [x] 3.H1 Depth: recorded on every act of queueing (create, move into a column that queues, re-queue, `run_task`); what a person queues or starts — Run, their chat — is 0; past the maximum the task is not queued and the agent is told why; the maximum as an automation setting, org-set and narrow-only
- [x] 3.H2 `run_task` from a person-started run starts a run that is not person-started: the turn limit applies and it cannot call `run_task`
- [x] 3.H3 The throttle optional and off by default: with it off, each agent's queued tasks start one at a time as it comes free; with it on, rounds and batches as before, the rest `RUN_THROTTLED`; `RUN_WAITING` removed
- [x] 3.H4 Labels Queued, Throttled, Running; the reason a task has not started beside it (place in line, next round, automation off); Running says when its site holds it for a free slot; the current round on a throttled boundary's board
- [x] 3.H5 Moving a task into a done column records "task closed" in the dashboard's activity; the unreachable path that used to record it removed

#### Lane I — The walkthrough's fixes (spec §2, §6) · Sonnet

- [x] 3.I1 The board refreshes on every run-state change: a run's claim and end, a round opening and closing, releasing throttled tasks, withdrawing a run
- [x] 3.I2 The round line names agents by name, not handle
- [x] 3.I3 Releasing throttled tasks (the throttle turned off) nudges the scheduler, so they start at once

#### Lane J — Routines (spec §3, adr-0092) · Opus

- [x] 3.J1 A routine: schedule, template (title, description, priority, labels, optional agent, board and column or backlog), on behalf of, on or paused; schema, permissions as for a start time
- [x] 3.J2 The routine keeps one round waiting, created ahead; the scheduler creates the next when a round's time comes; edit updates the waiting round; pause and delete remove it; deleting or unlinking it moves to the next time; a restart creates a missed round once
- [x] 3.J3 A task starts at most once: repeat settings removed from tasks; a column never queues a task whose start or round time is to come; at its time a round is treated as arriving in its column (queued for the pulse only where the column queues automatically); a person's start time still starts the task as a deferred Run
- [x] 3.J4 The routine's page (linked rounds newest first, next round, edit, pause, delete, unlink), the routines list in project and personal settings, the ↻ link on a round, and "make this a routine" on a task page
- [x] 3.J5 The agent tool for creating a routine, under "agents may set schedules when asked", in person-started runs only; the waiting round blocked and the routine paused when its person loses access

#### Lane K — Archiving finished tasks (spec §3) · Sonnet

- [x] 3.K1 The setting: org default (1 day out of the box), each project and personal project choosing freely; off, 1, 7, 30 days
- [x] 3.K2 A sweep archives tasks in a done column with no run pending past the setting; archived tasks stay searchable and linked

#### Lane L — A start time to come is never started early (spec §3) · Sonnet

- [x] 3.L1 Setting a start time withdraws a queued or throttled run; clearing it re-applies the column
- [x] 3.L2 Nothing the pulse or a run's end starts has a start or round time still to come

#### Lane M — Routines get their own tab (spec §3) · Sonnet

- [x] 3.M1 A project's Routines tab, personal projects included; routines leave project settings
- [x] 3.M2 Routine and start times fall on whole minutes
- [x] 3.M3 A column never queues a task with no agent; one queued anyway says so

#### Lane N — A time an agent sets is in its person's timezone (spec §3) · Sonnet

- [x] 3.N1 A person's timezone, taken from the browser and editable in their profile
- [x] 3.N2 Agent schedule and routine tools read an offset-less time in the run's person's timezone; the run's prompt states the local time

#### Lane P — The walkthrough's last findings · Sonnet

- [x] 3.P1 The `run_task` refusal worded by the project's automation state; "1 minute" and "1 turn"
- [x] 3.P2 Run hidden and refused on a task blocked because its person lost access
- [x] 3.P3 A personal project is created with the default board

#### Lane Q — Confirming a proposed workforce template applies it · Sonnet

- [x] 3.Q1 Confirming a template the kernel proposed applies it and finishes the proposal with no run queued
- [x] 3.Q2 The default board stages in their own module, breaking an import cycle lane P introduced

### Phase 4 — Combine and prove

**Starts when:** every lane is merged into the branch. **Execution plan:** none — the lead runs it.

- [x] 4.1 Full regression: core, hq unit and integration, site unit and integration, container suites, cross-app
- [x] 4.2 Walkthrough: a project pulse — each agent's line with the throttle off; then on: leading edge, batches per agent, the interval after a round, pause, restart of hq mid-interval
- [x] 4.3 Walkthrough: a scheduled task starting at its minute, and not early in an auto-queue column; a routine keeping its next round ready, edited, skipped and paused; delayed by a busy agent with the reason shown; queued when automation is off; an agent setting a schedule when asked in chat, and refused in a pulse-started run
- [x] 4.4 Walkthrough: an agent creating tasks past the queue limit; a chain stopped at the maximum depth, including by re-queuing an old task
- [x] 4.5 Walkthrough: a personal project's task running on the person's own credential and storage (run by a person; a routine there needed a board, which lane P adds)
- [x] 4.6 Walkthrough: an approval reaching the person behind an agent-created task; removing them blocks it
- [x] 4.7 Walkthrough: a run stopped by each limit (the time limit on a project chat); a run waiting for the site's run slot

### Phase 5 — Close

**Starts when:** the owner accepts the walkthroughs. **Execution plan:** none.

- [x] 5.1 Concepts and architecture: tasks, agents, execution flow, runtime, container runtime — heartbeat out, pulse in
- [x] 5.2 ADR-0030 and ADR-0031 checked; new ADRs noted as acted on
- [x] 5.3 QA scenarios for the pulse, scheduled tasks, personal projects, approvals and limits
- [x] 5.4 Roadmap: the milestone's objectives reworded from heartbeat to pulse, adaptive intervals moved after launch, ticked with the merge; issues closed or moved

## Deviations

- **By phase.** Phase 1: the protocol change moved into phase 2 (below). Phase 2: none beyond that. Phase 3: lanes E,
  G–Q were added from the walkthroughs (below); 3.D4's measurement was dropped to a deployment machine. Phase 4: the walkthrough failed
  once (lane G) and found the defects lanes H–P fixed; it then passed, parts 1–7, on 2026-10-04. Phase 5: none.
- **2026-10-04 — the walkthrough's later findings: lanes L, M, N and P.** A start time set on a task already queued
  let the pulse start it early and the schedule start it again (lane L). Routines were lost in settings, their times
  were not whole minutes, and a column queued a task with no agent (lane M). An agent asked for "tomorrow at 9" set
  09:00 UTC, because hq held no timezone for a person (lane N). The `run_task` refusal promised a pulse that was off,
  limit reasons read "1 minutes", Run showed on a lost-access block, and personal projects had no board (lane P).
- **2026-10-05 — found at close: confirming a proposed workforce template applied nothing (lane Q).** The proposal's
  task was queued with no agent and nothing read the confirmed selections — already so before this unit, when the
  heartbeat never picked it up either. Confirming now applies the template. The same lane broke an import cycle lane P
  had introduced, which failed 35 dispatch tests in the full suite.
- **2026-10-04 — the automation experience is not built here.** Walking through it, the owner found automation spread
  over nine places and nothing answering "what are my agents doing, and why"; a consolidated view was sketched and set
  aside to be designed after live use, under the
  screen-by-screen review, which blocks release.
- **2026-10-04 — the run-capacity measurement moved to a deployment machine.** A figure from a development Mac
  running hq and its databases would read as more authoritative than it is; the default stays 5, the deployment guide
  carries the sizing method, and the measurement is taken on a deployment machine.

- **2026-10-03 — the protocol change moved from phase 1 into phase 2.** Removing the heartbeat kinds from core alone
  would leave hq and the site failing to compile until phase 2, so the removal is one change across every module. The
  run limits in the dispatch moved to lane D, which is the only lane that reads them; adding them earlier would be a
  placeholder. What started a run stays in phase 2, because lanes A and D both build on it.

- **2026-10-03 — a follow-up lane after the merges: a run waiting for a site slot says so.** Spec §3 has a scheduled
  task show why it is late; a wait for the site's run capacity happens inside the site, which hq sees only as running.
  It needs a signal from the site. Lane A built the agent-busy reason; this follows the combine.
- **2026-10-03 — the walkthrough's part 1 failed; lane G fixes it.** Batches stalled when an agent blocked, moved or
  finished its own task mid-run; a pulse fired a minute late; columns and run states contradicted each other. The
  owner settled the model: a task's state is the agent's, its run state is the system's and describes only the run
  pending now (spec §6). Part 1 is redone from a clean database after the lane.
- **2026-10-04 — routines become their own thing; lanes I, J and K.** Testing a schedule on a finished task showed
  that a repeating task is never done: it runs in a done column or bounces back, and a column that queues starts it
  early. The owner settled that what repeats is the work, not the task: a routine keeps its next round ready as an
  ordinary scheduled task (spec §3, adr-0092), and a task starts at most once. Finished tasks are archived
  automatically, which routines make necessary. The walkthrough's other findings (the board not refreshing on a
  run-state change) are lane I. Parts 2 and 4 of the walkthrough wait for lane J.
- **2026-10-03 — depth bounds chains; the throttle becomes optional; lane H.** Re-reading part 1 of the walkthrough,
  the owner found Queued and Waiting meant the same thing to a person, and that the batch made sense only to the
  system. The throttle was standing in for a safety limit: it slowed a runaway chain without stopping it. Chains are
  now bounded by depth (spec §2, adr-0091); the throttle stays, off by default, and a task outside its batch is shown
  as Throttled. Checking the gap the owner raised — an agent re-queuing old tasks — found that `run_task` let one
  press of Run start an unbounded chain of runs that each counted as the person's; lane H closes it.
- **2026-10-03 — a person's own connections to hq join the milestone (lane F, spec §10, adr-0090).** The org-wide
  MCP key acted for no one, which §5 cannot allow; the owner chose to replace it with per-person connections now,
  since the person-level rules it needs were built here.
- **2026-10-03 — only the task's person or a project admin may set its schedule.** Setting one moves who the task is
  on behalf of, so it follows who may reassign it.
- **2026-10-03 — "who queued it" means who last queued it.** Lanes A and C each needed it, with different meanings;
  one set of fields written on every queueing path serves the queue limit and the trail.

A lane that finds the design does not work as written stops and reports; the lead raises it with the owner,
and the spec is corrected in place with the direction recorded here.
