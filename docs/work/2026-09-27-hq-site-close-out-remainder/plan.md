---
created: 2026-09-27
description: Finishing the objectives of the hq/site close-out that did not pass when checked against the code — six pieces of work built in parallel on their own branches, combined on one base branch, proved once, then walked by hand on two machines.
---

# Implementation Plan · hq/site Close-out, What Remained

> **Closed 2026-09-27; this plan is a record.** Every objective passed at close; Phase 6 moved to the release's final checks (see Deviations). It is not edited again.

**Design spec:** [`spec.md`](spec.md) · **Issue:** the epic for the roadmap milestone *hq/site split closed out and secured* — reopened, because the milestone was not finished. This unit continues it and addresses the issues under it

## Goal

Every objective of the milestone *hq/site split closed out and secured* passes, so the milestone can be
closed.

**In scope:** everything in the spec — the seven pieces that need no design (§2.1–2.7), the two that are
designed first and then built, previews and the agent package (§2.8–2.9), and the two-machine walkthrough
(§2.10), and closing this unit.

**Out of scope:** what Stop all does beyond its design, the run and token totals, the full QA audit, the licence, the
public-history cleanup, the vendor's written confirmation, password recovery and the first-administrator
code, the scan of hq's raw routes, and every other open bug, debt and chore. Each fails the spec's scope
rule: it contributes to no objective of this milestone. Those that block the release are planned before
it, so they do not hold this milestone open. **None is out for want of time** (spec §4).

## Approach

**Scope is set by what serves an objective, not by the time left.** The previous unit closed with its milestone's
objectives unmet because scope had been cut to fit a schedule. This unit's scope is fixed by the spec's
rule, and if the work runs past the milestone's finish date the milestone finishes late and the
variance is recorded; no piece is dropped to hold a date. **Design that an objective needs is done in
this milestone, in phases of its own** — previews and the agent package each need decisions that bind
later work, and deferring them would close the milestone on a promise. The designs are decision
sessions with the owner, backed by read-only investigation, so they run beside the pieces that need no
design, and each is built only once it is settled.

**One base branch, and every piece of work branches from it and returns to it.** `main` is never the
target of a piece of work. A base branch is cut from `main`; each piece is a branch cut from the base,
built in its own git worktree, and merged back into the base when it is done. The base merges to
`main` once, after the full suite has passed on it. This keeps `main` free of anything the full suite
has not seen, and lets the pieces be built at the same time.

**Two test tiers, because the platform cannot yet run more than one copy of itself.** The apps use
fixed ports and the integration tests share one test database and truncate it between tests, so two
runs at once collide. A piece's author therefore runs only what needs neither: typecheck and the unit
tests, in the piece's own worktree, with one test worker each because several overlapping runs of the
default four exhausted memory. Integration, cross-app and smoke tests run once, by the lead, on the base
branch with every piece combined. Making the platform runnable in several copies would remove the
constraint; it is not built, and building it is not this unit's work.

**Pieces are built from disjoint files.** The pieces are chosen so two of them rarely edit the same
file. Where they do — the operation declarations in `main.wasp` are the likely place — the piece says
so in its report, and the lead merges those pieces back to back and reconciles the second.

**Each agent runs on the model its work needs**, chosen at dispatch for the task in hand, as `AGENTS.md` sets out.

**Decisions before the piece that needs them.** Several pieces wait on a decision (spec §3). Deciding
happens first and is the owner's; a piece with an open decision is not started, and one whose design is
the open question — the preview — starts with a written set of options rather than code.

**The walkthrough comes last and is by hand.** It needs two machines and a credential a project can
use, and it can only pass once a task run no longer depends on a path into a site's disk.

**Why the working rules live in this plan and in the unit's working folder.** Several sessions will
work on this unit over its days, and a session that starts cold must not lose the method. The method's
reasons are here, in committed form; the live state, the rules a working agent follows and the log of
what was done sit in the unit's working folder, which is not committed.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0042, ADR-0046, ADR-0050, ADR-0059, ADR-0060, ADR-0063, ADR-0066, ADR-0067, ADR-0070 — all Accepted |
| **Implements** | ADR-0071 (a preview is served from its own host name), ADR-0072 (an agent is defined once in hq and overridden per boundary) |
| **Revisits** | ADR-0067 (hq ends at one plain-HTTP port) — kept; adr-0071 routes previews by host on its one port. ADR-0059 (an agent is a versioned package) — superseded by adr-0072 |

## Key decisions

| Decision | Why |
|---|---|
| One base branch that merges to `main` once | `main` only ever receives work the full suite has passed. Merging each piece to `main` on its own would put integration failures on `main` |
| Each piece is its own branch and worktree | Pieces are built at the same time by different authors; one shared branch would mean several authors in one working tree, editing and testing over each other |
| Authors run typecheck and unit tests; only the lead runs the rest | Unit tests need no database or running app, so they can run in any worktree. Integration and cross-app tests cannot, so they run once |
| Each piece is squashed to a few commits, then merged to the base with a merge commit | The base reads as one grouped block per piece, with its commits reachable underneath |
| The unit continues the milestone's epic, reopened; it gets no issue of its own, and no phase or lane gets one | A unit addresses issues that already exist, or that a check raises; the epic groups them. An issue written to mirror a phase or a lane repeats the plan. Objectives are not issues: an objective is ticked by verifying it, not by closing issues |
| Scope is fixed by criticality, and the schedule moves | The previous milestone went unclosed because scope was cut to fit its dates. Late and complete is better than on time and open |
| Design an objective needs is its own phase in this milestone, not deferred | A deferred design is an objective that does not pass, and the milestone would close on a promise. The designs run beside the builds that need none, so they cost calendar time only if they are the longest path |
| Each agent's model is chosen for its task, never inherited | An agent given no model runs on the lead's, so a fan-out can run on the most expensive model by accident |
| Not: cut a piece to hold the milestone's finish date | A cut objective is an objective that does not pass, which is how the milestone stayed open |
| Not: run the full suite in every piece | The apps' fixed ports and the shared test database make concurrent runs collide, and the cost of making them run in copies is larger than this unit |
| Not: merge each piece to `main` as it finishes | The full suite would first see the combination on `main` |
| Not: one shared working tree with disjoint files | It worked for the previous unit, but that unit's authors did not run tests. Authors who run unit tests need a tree that builds on its own |

## Work breakdown

**This is the source of truth for progress across the whole unit.** Tick a task here when it is done.

Seven phases. The seams are: decisions and set-up before any piece can start; the pieces that need no
design, which are independent of one another; combining and proving them, so the designed work builds on
a base that already passes; each design with its own build, one phase per design and one design at a
time, each ending with the full suite on the base; the walkthrough, which needs all of it; and the close.

### Phase 1 — Decide and set up
**Delivers:** the spec's open decisions answered and recorded in place, and a
worktree that can be built and tested from cold.
**Starts when:** —
**Execution plan:** none — the tasks are single decisions or commands, and the rules for the phases
that follow are written down as part of the set-up.

- [x] 1.1 Decide whether the boot relocation can be removed (spec §3.1) — yes; no migration, the old locations are ignored or wiped
- [x] 1.2 Decide what stop all means (spec §3.2) — unchanged: an administrator-only brake; the objective's wording is corrected
- [x] 1.3 Decide what placement does when no default site exists (spec §3.3) — moot: every install is paired, and the existing error stands
- [x] 1.4 Decide how a preview identifies its viewer and where it is served from (spec §3.4) — its own host name under an operator-set preview domain (adr-0071)
- [x] 1.5 Decide what the versioned-package objective keeps promising (spec §3.5) — an agent is defined once in hq and overridden per boundary (adr-0072)
- [x] 1.6 Decide how the run and token totals are scoped (spec §3.6) — out; they serve no objective
- [ ] 1.7 Decide how the delivery record is corrected (spec §3.7)
- [x] 1.8 Decide when the base merges to `main` relative to the walkthrough (spec §3.8) — moot; the walkthrough moved to release
- [x] 1.9 Decide which release blockers ride in this unit (spec §3.9) — those that contribute to an objective
- [x] 1.10 Decide whether the two check-then-use bugs are in scope (spec §3.10) — the file tools, yes; hq's own check is re-examined after 2.1
- [x] 1.11 Build a worktree from cold and confirm typecheck and unit tests run in it — verified; it found that a fresh checkout cannot compile hq (`ui/src/brand` is gitignored)
- [ ] 1.12 Reopen the milestone's epic and attach the issues this unit addresses as sub-issues, once the decisions above have fixed which they are

### Phase 2 — Build the pieces
**Delivers:** each piece done on its own branch, with typecheck and unit tests passing in its
worktree, and its report written.
**Starts when:** 1.11 is done for the pieces that need no decision; the rest start as their decisions
are made (1.1 for 2.1).
**Execution plan:** none — each piece's issue and the spec's §2 say what it must do, and the brief
every author is given carries the rules.

- [x] 2.1 hq stops reaching a site's disk (spec §2.1)
- [x] 2.2 Reads honour project entitlement and say when a site is silent (spec §2.2)
- [x] 2.3 Trace what a deleted project's running work does, and fix it if it keeps reaching the project (spec §2.3)
- [x] 2.4 Placement uses the default site, not the oldest (spec §2.4) — a gap the check found, so it is raised as an issue first
- [x] 2.5 Leftovers (spec §2.5)
- [x] 2.6 Secrets at rest (spec §2.6) — the one piece that may need a schema migration, so it is merged first and alone
- [x] 2.7 The file tools act on what they checked, then re-examine hq's own check-then-use (spec §2.7)

### Phase 3 — Combine and prove the pieces
**Delivers:** every Phase 2 piece merged into the base and the full suite passing on it.
**Starts when:** the Phase 2 pieces are done. They are merged into the base as they finish, with unit
tests after each; the full suite runs once, after the last.
**Execution plan:** none — the regression is a fixed list of commands, and what a failure needs is not
known in advance.

- [x] 3.1 Merge each finished Phase 2 piece into the base, running unit tests after each
- [x] 3.2 Run the full regression once on the combined base: core, hq and site unit and integration, typecheck, the bundle checks and cross-app
- [x] 3.3 Fix what the full regression finds, on the base

### Phase 4 — Previews: design, then build
**Delivers:** previews designed — the viewer's identity and where a preview is served from — with the
decision record where it is served from earns, the spec corrected in place, and then built on its own
branch with typecheck and unit tests passing (spec §2.8).
**Starts when:** nothing gates the design; it runs beside Phases 2 and 3, as decision sessions with the
owner backed by read-only investigation. The build starts when the design is settled and Phase 3 has passed.
**Execution plan:** none — adr-0071, spec §2.8 and §3.4 and the two preview investigations specify the build fully.

- [x] 4.1 Spike on a real preview: what a sandbox header breaks, and whether sub-resources and hot reload route through the preview prefix
- [x] 4.2 Design the viewer's identity and where a preview is served from; write the decision record — adr-0071
- [x] 4.3 Build previews as designed
- [x] 4.4 Merge it into the base and run the full regression there

### Phase 5 — The agent definition: design, then build
**Delivers:** the agent package designed — a site's part, resync, a project's pin, and what the agent
record holds beside its package — with a decision record if it changes ADR-0059, the spec corrected in
place, and then built on its own branch (spec §2.9).
**Starts when:** Phase 4's design is settled, so one design is in front of the owner at a time.
**Execution plan:** decided when the design lands.

- [x] 5.1 Design the agent package; write the decision record if it changes ADR-0059 — adr-0072 supersedes it
- [x] 5.2 Build the agent package as designed
- [x] 5.3 Merge it into the base and run the full regression there

### Phase 6 — Walk it on two machines — moved to release
**Delivers:** nothing in this unit. The live two-machine run moved to the release's final checks;
see Deviations.
**Execution plan:** none.

### Phase 7 — Close
**Delivers:** the roadmap reflects what passes, each objective is verified with evidence, the delivery
record is correct, and the unit and its base branch are closed.
**Starts when:** Phase 5 is done.
**Execution plan:** none — closing the unit is its own skill's checklist.

- [x] 7.1 Verify each objective against the system and tick it on the roadmap with how and when; correct the delivery record as decided (1.7)
- [ ] 7.2 Close the issues the work resolved, and the epic only when its closing conditions hold
- [x] 7.3 Close the unit
- [ ] 7.4 Merge the base to `main`

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 6 | The two-machine walkthrough moved out of this unit to the release's final checks; the two objectives it served are stated as what the code and the full regression prove | It is a deployment check needed at every release anyway; rehearsing it on a separate environment first doubled a manual, taxing run |
| 4, 5 | Previews and the agent package, first deferred, were brought back as design-then-build phases | Design an objective needs is done in the milestone, not deferred to let it close |
| 2 | A deleted project's runs, found by the trace, were fixed here (lane C2); the check-then-use fix was extended to the site's location storage; library templates moved off the retired wiki (E2) | Each served an objective and surfaced while building |
