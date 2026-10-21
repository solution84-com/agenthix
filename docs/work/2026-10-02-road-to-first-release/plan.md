---
created: 2026-10-02
description: The run from model vendor independence to the first public release — agents on their own schedule, host management, triage and the QA audit, and what outside users need — worked as parallel rounds off one working branch, each round with its own spec and plan, merged to main at every milestone.
---

# Implementation Plan · Road to First Release

> **Closed 2026-10-02 after its first batch; this plan is a record.** Merged to `main` as `96a9afd`…`ab8643e`, closed by the commit after them. It is not edited again. Its working-branch model was dropped at close: each roadmap
> milestone is now its own unit and branch. Tasks left unticked below were not done by this unit; they stay on the
> roadmap under their milestones and their issues (see Deviations, *Close*).

**Issues:** the epics First release, Agents act on their own schedule and Host management plane, and the issues under them. This unit gets no issue of its own and neither does any round.
**Roadmap:** the platform roadmap, the milestones from *Agents act on their own schedule* to *Public release*.

There is no unit-level design spec. Each round writes its own spec and plan when it starts, because what a round has to design differs: the agents round decides what a heartbeat is before it builds, and the triage round cannot be designed before the audit has found anything.

## Goal

Everything the roadmap commits to before the repository goes public on 2026-11-14, delivered as rounds that run in parallel where their files allow and are proved together on one working branch.

**In scope:** the roadmap's milestones in order: *Agents act on their own schedule, within a boundary*, *Host management, and installs without a terminal*, *Triage and release blockers*, *Open to outside users*, and the work *Public release* waits on.
**Out of scope:** everything on the roadmap's Post-launch row, including packaging `core` and `ui`, which the 2026-10-02 planning cycle took off the release path. The roadmap's own planning stays in the roadmap; this plan holds only how the work is carried out.

## Approach

**One working branch is the canonical state; each round's work happens on a lane branch in its own worktree and comes back to it.** The branch is cut from `main` and is the only place the combined work is judged. A lane branch holds one purpose, so it merges as one readable block. The lead rebases a lane onto the base's current head, then merges it `--no-ff`, one lane at a time, so the history is a single ordered line. Merging lanes into the working branch needs no separate approval; merging the working branch to `main`, and pushing, always do.

**Lane authors run typecheck and unit tests, and nothing that needs a server.** The apps use fixed ports and share one test database, so integration, cross-app and smoke tests, and every walkthrough, run once, by the lead, on the working branch with the lanes combined. Heavy commands go through one machine-wide lock with the Node heap capped, and a lane runs only the test files it touched while iterating, the full unit suite once before reporting. A resource strategy covering contention, queueing, monitoring and what pauses first is written at the start of each round and given to every lane, as the repository's instructions require.

**Merging to `main` happens at each milestone, not at the end.** A milestone merges once its full regression passes on the working branch and its objectives have been shown to pass in the running app, which is what marks an objective Done. A weeks-long branch that merges once would hold every milestone hostage to the slowest one, and a failed regression at the end would have no clean place to roll back to.

**Rounds, not lanes, are the planning unit.** A round is a body of work with its own spec and plan, kept in `rounds/<nn>-<slug>/` beside this file, and run as one or more lanes. **No round has an execution plan.** An execution plan means someone reads the code, lists every change and then iterates on the list before any work starts, and that serial step is what slows a run down. Here the lane agent reads the code while it works, and what stands in for the file list is a short statement in the round's plan of the files and areas the round owns, so lanes in different rounds cannot collide. `execution/` stays for scratch that is not kept: reports, lane briefs, run logs. It is gitignored. The rounds map onto the roadmap's milestones, with two that cut across them: a documentation round and a small-blockers round, which are independent of the feature work and so start immediately.

**Where the rounds contend.** *Agents* and *Host management* share the site's server setup, `hq/main.wasp`, `schema.prisma` migration ordering and the `core` protocol version, so lanes in them are given disjoint files and the lead numbers migrations and the version bump as it merges. Documentation touches `docs/` only, with one exception: the cleanup of stale comments across the source conflicts with everything and runs last. *Triage* is not parallel with the feature rounds: the QA audit has to see the finished product, and its fixes touch every module.

**The site's framework is decided before any lane cuts from it.** One question asks whether the site stays on Wasp. If it leaves, the site's foundation changes under every lane that touches `site/`, so the investigation runs first and the decision is made before site-touching lanes branch. It is read-only, so it costs nothing to start with.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0042, ADR-0046, ADR-0060, ADR-0064, ADR-0065, ADR-0066, ADR-0067, ADR-0068, ADR-0069, ADR-0070 — all Accepted; none is Proposed |
| **Implements** | None directly. Each round adds the records it carries out to its own plan and notes them at close |
| **Revisits** | ADR-0065 and ADR-0069 if the site leaves Wasp; ADR-0060 if the agents round decides the heartbeat does not survive the boundary model |

## Key decisions

| Decision | Why |
|---|---|
| One working branch for the whole run, merged to `main` at each milestone | Parallel lanes need one place where their combined result is judged, and a merge per milestone keeps each milestone's regression and its Done verification separate |
| One unit spanning the milestones, with a spec and plan per round | The milestones share one working branch, one resource strategy and one regression, but differ in what they must design |
| Lane authors run unit tests only; the lead runs everything that needs a server | The apps use fixed ports and one shared test database, so concurrent integration runs collide |
| The site-framework question is answered before site lanes cut | Leaving Wasp changes the site's foundation; deciding afterwards means every lane rebases over it |
| No execution plan for any round | Writing one means reading the code and iterating on a file list before work starts, which is serial; a lane agent reads the code as it works, and the round's plan bounds which files it owns |
| Triage runs last of the three feature milestones and is not parallel with them | The full QA audit must see the finished product |
| Not one branch per milestone cut from `main` and merged separately | The milestones' files overlap, so separate long branches would meet at integration, late, with no shared base to test on |
| Not one merge to `main` at the end | A failed final regression would hold every milestone back, with nowhere clean to stop |

## Work breakdown

**This is the source of truth for progress across the whole unit.** A round's own plan tracks its tasks once the round starts. Tasks here are one line; the number links to the round's plan.

Seven rounds. The split follows the roadmap's milestones, plus two cross-cutting rounds that start at once because they contend for almost nothing.

### Round 0 — The site's framework
**Delivers:** the site is a plain Node server, decided and recorded, so site lanes in rounds 3 and 4 cut from a settled foundation.
**Starts when:** —
**Execution plan:** none — an investigation whose output is a recommendation; its own spec and plan are one short document

- [x] 0.1 Investigate what the site's server looks like without Wasp: what Wasp provides it, what replaces each, what it costs
- [x] 0.2 Record the decision as an ADR (leave), amending ADR-0065 and ADR-0069
- [x] 0.3 Move the site to a plain Node server: Express 5, Prisma directly, esbuild, no browser app, graceful shutdown
- [x] 0.4 Verify on the working branch: integration, container and cross-app suites, the image on ARM and Intel, a compose walkthrough, the migration status of a database Wasp migrated

### Round 1 — Small blockers
**Delivers:** the independent release blockers that wait on nothing are closed.
**Starts when:** —
**Execution plan:** none — each task is one issue with its own fix; the issue is the checklist

- [ ] 1.1 Choose the licence and add the root LICENSE
- [ ] 1.2 Remove the private repository names from committed files
- [x] 1.3 Guard the shared-subscription development switch
- [x] 1.4 Settle whether repository settings an agent writes can run code when a harness runs git outside the sandbox
- [x] 1.5 Refresh a lapsed organisation or project subscription's token into hq

### Round 2 — Documentation
**Delivers:** the architecture and concept documents describe the system that exists, and a contributor can orient from them.
**Starts when:** — for the areas that are stable after the split (control channel, storage and placement, container runtime, identity and trust); the install and deployment documents wait for round 4
**Execution plan:** none — documentation work, where the task list is the checklist

- [x] 2.1 Apply the 2026-08-21 survey's disposition to `docs/architecture/`
- [x] 2.2 Write the current-state architecture for the four areas nobody documented
- [x] 2.3 Rewrite the concept documents that describe a system that no longer exists
- [ ] 2.4 Fix the migrated issue bodies' dead links
- [ ] 2.5 Condense the repository instructions into what every session needs, with the rest referenced
- [ ] 2.6 Rewrite the install and deployment documents against host management (after round 4)
- [ ] 2.7 Remove code comments and documents' citations that do not resolve — last, because it touches everything

### Round 3 — Agents act on their own schedule, within a boundary
**Delivers:** heartbeats and routines belong to a boundary, start the tasks they queue, and run unattended within guard rails (milestone).
**Starts when:** the heartbeat question is answered, which is its first task
**Execution plan:** none — the round's plan owns the task list and the files it may touch, and the lane agent reads the code itself; its own spec holds the design, which decides the build

- [ ] 3.1 Decide whether the heartbeat survives the storage-boundary model
- [ ] 3.2 Make a task queued by an agent or automatically start
- [ ] 3.3 Give a heartbeat an owning boundary and its authority
- [ ] 3.4 Limit what an unattended run may do on its own
- [ ] 3.5 Let an agent carry out a routine on its schedule
- [ ] 3.6 Adapt how often a heartbeat wakes
- [ ] 3.7 Verify the milestone's objectives in the running app, run the full regression, merge to `main`

### Round 4 — Host management, and installs without a terminal
**Delivers:** the machine is administered through one host-management capability, apart from hq, and someone with no terminal installs and runs hq and its site (milestone).
**Starts when:** round 0 has decided the site's framework
**Execution plan:** none — the round's plan owns the task list and the files it may touch, and the lane agent reads the code itself; its own spec holds the design (the capability's authority and interface), which comes before the build

- [ ] 4.1 Design the host-management capability: its authority, its command line, its automation interface, its optional local web interface
- [ ] 4.2 Separate host administration from hq
- [ ] 4.3 Administer a machine through the capability, headless and over SSH
- [ ] 4.4 Bootstrap the first administrator and recover the last with the machine's authority
- [ ] 4.5 Separate a machine's declared capacity and network access from the organisation's policy
- [ ] 4.6 Publish hq, the site and the agent as ready-made images
- [ ] 4.7 Build a signed installer for macOS and Windows that brings up hq and its paired site
- [ ] 4.8 Verify the milestone's objectives in the running app, run the full regression, merge to `main`

### Round 5 — Triage and release blockers
**Delivers:** every open bug, debt item and chore is fixed, closed as no longer applying, or deliberately left open; every release blocker but the final checks is closed.
**Starts when:** rounds 3 and 4 have merged to `main`, so the audit sees the finished product
**Execution plan:** none — a discovery round: its output is unknown until the audit has run, so a plan written first would be verdicts before the evidence

- [ ] 5.1 Run the full QA audit of `core`, `hq`, `site` and `ui`
- [ ] 5.2 Triage every open bug, debt item and chore against the code as it then stands, including what the audit raises
- [ ] 5.3 Fix what is fixed, close what no longer applies, and record what is left open and why
- [ ] 5.4 Run the agent container and model relay checks on a Linux host
- [ ] 5.5 Confirm the model vendor's written permission for hq holding a person's subscription login — requested well before this round, since the reply is outside our control
- [ ] 5.6 Run the full regression and merge to `main`

### Round 6 — Open to outside users, and the release
**Delivers:** anyone outside can install it, contribute to it and trust what merges; the repository is made public.
**Starts when:** round 5 has merged to `main`
**Execution plan:** none — the tasks are checks and small configuration changes, each already one line

- [ ] 6.1 Run typecheck, lint and tests on every pull request, and remove the stale submodule credential
- [ ] 6.2 Install hq and a site on a clean machine from the documentation alone
- [ ] 6.3 Update the product website to say what exists, kept in a separate repository from this one
- [ ] 6.4 Run the two-machine walkthrough: a site on another machine behind a firewall registers, runs a chat and a task, survives each side restarting, and is revoked and registered again
- [ ] 6.5 Make the repository public

## Deviations

| Phase | What changed | Why |
|---|---|---|
| Close | The unit closes after round 0, three of round 1's five tasks and three of round 2's seven. Rounds 3 to 6, and tasks 1.1, 1.2 and 2.4 to 2.7, are not done here: they return to the roadmap's milestones, each to be its own unit | One working branch across several milestones mixed lane merges with lead fixes and plan edits, so a single piece of work could not be undone on its own. The owner chose one milestone per branch instead. The unpushed history was rebuilt so `main` reads as one merge per piece of work, with its fixes folded in; the files were byte-identical before and after |
| Close | Items the unit raised, all filed: two security items that block release, and eight more. The vendor request for the subscription question is drafted, not sent, and the subscription design waits for last on the owner's call | Each is its own issue; none is left in this plan |
| Round 0 | The site's move off Wasp is done in round 0, not in the host-management round, and the round now carries the build (0.3) and its verification (0.4) | The investigation found leaving costs about 8 working days and that every site lane in rounds 3 and 4, and the images round 4 publishes, would otherwise be built on the shape being replaced. It runs in parallel with round 1, whose site lanes merge first so the move rebases over them |
| Round 0 | 0.4's git credential and second-site registration were not walked through; they are covered by the two-machine walkthrough at the final checks, and git is queued for its own hands-on pass | The owner deferred them: their code did not change beyond the new server entry, and the git integration needs its own hands-on pass |
| Round 1 | Refreshing a lapsed subscription's token needed a second fix found in the walkthrough: the site's pre-launch check refused any subscription whose access token had expired, before Claude Code could renew it | The lane's tests never reached that check; a run on a login idle past its 8-hour access token showed it |
| Round 1 | Three issues were raised; the subscription design as a whole moves to last | Anthropic's published terms forbid developers collecting or storing Claude.ai credentials; the owner chose to resolve it after the rest, since the product relies on Claude today |
