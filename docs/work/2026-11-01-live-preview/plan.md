---
created: 2026-11-01
description: How the live preview unit is built — code work on branches with their own copies and a full-screen read-only workspace view first, then live previews on those branches, brought over from an earlier branch that never merged.
---

# Implementation Plan · Live preview

## Goal

Build [the spec](spec.md): every piece of code work on its own branch with its own working copy, reviewed in a
full-screen workspace view and merged into a protected `main`, with a live preview of any branch beside its
conversation.

**In scope:** everything in the spec, in four phases; fourteen small fixes found while building the earlier attempt,
which do not depend on it (*Approach*); a flag system with stages, designed and built here; and the live preview put
behind that flag, off, until it is reshaped.

**Out of scope:**

- **Editing files in the browser.** People read and agents write (spec, *People read, agents write*).
- **Connecting a person's own editor** to a workspace: a separate, later piece of work.
- **Line comments, approvals, checks before merging, branch protection rules, merge queues.** Teams that want them
  connect GitHub (spec, *Merging into main*).
- **A person's own computer** as a place agents or live previews run
  ([ADR-0167](../../adr/adr-0167-agenthix-acts-only-on-machines-the-organisation-runs.md)).
- **Wireframe and diagram viewing**, built on the earlier branch beside its viewer. It is file viewing, unrelated to
  live previews; only the viewer frame the live app needs comes over. The rest becomes an issue at the close.
- **Copies and the shelf, *Stop everything*, the whole-workspace lock, *Wait*/*Cancel*.** The earlier design needed
  them; branches with their own copies remove the need.
- **Reshaping the live preview into a development environment** (a container of its own that runs the project's own
  services): written up as a proposal in phase 4 and taken up after the first release, not in this unit.

## Approach

**Phase 1 builds code work on branches, and none of it depends on a live preview.** Git is the store: a branch is a
real branch in the workspace's repository, and each branch's working copy is a clone that borrows the workspace's objects read-only (Git's alternates) in the
owner's storage. HQ records each branch (`WorkspaceBranch`: the workspace, its work, its name, its last merged commit)
and each copy (`BranchCopy`: the site folder, its state). The site does every Git operation on agent-written
repositories in the **commit helper**: a container of its own with Git, hooks off, the copy's own settings not read and
no Docker socket. The earlier branch built one (its `fileTool` program and helper container); its clone and fetch are
the base, reshaped into the operations this spec needs: init, clone, commit, bring back, list, diff, squash-merge with
a stored merge base, restore, bundle, delete. HQ reaches them over the control channel, so the site protocol takes its
next minor version.

**The run is where the rule is enforced.** When a run starts, dispatch decides whether its work is code work (its
workspace has Git). If so, its working folder is its branch's copy, and the workspace's own folder is bound read-only
over its place in the project's container. A code workspace's folder becoming read-only changes the container's
binds, so turning Git on recreates that container once its runs have ended. The agent gets a `commit` tool through the
control plane's tools; commits made with its own `git` are brought back by the site on a one-minute sweep while the run
is going, and at its end. The prompt gains the branch facts the spec lists.

**The workspace view replaces the workspace page.** It is a full-screen route in hq that reuses what exists: the folder
tree, HQ's file viewer (`OpenedFile`) and the diff view (`ui/src/files/diff/`), with the docked conversation's
components for the right-hand panel. The narrow layouts follow the app shell's mobile header and drawer (the
`app-layout` skill). The view reads from the site through hq's existing queries, extended with the branch's changes,
its commits and `main`'s versions.

**Phase 2 brings the live preview over from the earlier branch, reshaped.** Most of it was built and walked there: the
relay and its app doors, the app addresses and tickets, the live preview's container, its template and guard, services
and the install-script rule, the Fleet Console's per-site switches, and the app tools. The porting list made at the
start of this unit placed each of that branch's 1,334 files as *bring over*, *reshape* or *leave behind*. Two things
change their shape: a live preview binds **one branch's copy** rather than locking a workspace, and an app is known by
its workspace, **its branch** and its name, so two branches each running *web* keep separate addresses. Secrets come
through *Start live preview* and *Reload live preview* workflows, using the workflow executor that exists. The old
preview path (`start_preview`) is removed in the same phase, only once live apps work, so `main` is never left without
a preview.

**The fourteen small fixes land first, on this unit's branch.** They were found while building the earlier attempt and
do not depend on it: Git hooks off in workflow steps; IPv6 off on step, egress and sign-in containers; the site's
network priority; the Modal's dialog role; hq-web forwarding every line; the route inventory; the console's start
window and stale-command retry; each password attempt counted before it is checked; a conversation re-reading its
record after joining; e2e harness fixes; the protocol snapshot comparer; the site answering only methods it has. One
more, release attestation and withdrawn versions, is a feature rather than a fix and is held for the owner's decision.

**Phases 3 and 4 park the live preview behind a flag.** The owner's walk found the live preview works but asks too much
of a person, and that its shape is wrong for a development environment: it runs one fixed image with no Docker inside,
where a real project needs its own services running together. Reshaping it is a change of architecture, too large to
finish before the first release. So the unit ships code work on branches, which the walk passed, and parks the live
preview under a flag, off, with everything built kept. The flag system that exists (ADR-0116) has one level, on in
development and off in production, so an experimental feature would be on for every developer and in every test run.
Phase 3 designs and builds a flag system with stages, and phase 4 puts the live preview behind it, writes the proposal
for its reshaping, and queues that work for after the release. The general changes phase 2 made (install scripts off
for every agent command, sites removing only their own containers, the helper cap, the host's network rules) stay on:
they serve every feature, and the reshaping keeps them.

**How the work is carried out.** Each phase runs as lanes: one purpose, one agent, one worktree, a
short brief, and one shared rules file. The contract lanes build against (core's protocol shapes and the schema) is
committed on the unit's branch first, by the lead, so every lane is cut from it. Lanes run in parallel where their
files are disjoint, and merge into the unit's branch one at a time in the order the lead writes down; the lead runs
the integration, cross-application and container suites after each merge where the lane changed what they test, and
writes the migrations. The owner walks each phase. **Phase 1** is walked on `feature/live-preview`; its fixes are
folded in and its history regrouped; then `feature/live-preview-phase-2` is cut from it, and phase 1's branch is left
as it was walked. **Phase 2** is built and walked on the phase-2 branch, then regrouped onto `feature/live-preview`. **Phases 3 and 4**
are built on `feature/live-preview`, which merges to `main` once, with `--no-ff`, after phase 4 and the full regression
(the unit changes core's protocol shapes, the schema and the host service's images), and only on the owner's say-so.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0167 (agents and live previews only on the organisation's sites), ADR-0147 (a secret is used only by an approved workflow), ADR-0079 (access to a boundary is access to all of it), ADR-0074 (a container is keyed on its boundary and its runner), ADR-0039 (files and workspaces). All Accepted |
| **Implements** | ADR-0167; and four new records, written at the start of the phase that needs them: *code work on branches* (phase 1), *live apps travel through relays*, *install scripts are blocked by default*, *secrets reach a live preview only through an approved workflow* (phase 2). Each gets a note at the close |
| **Revisits** | ADR-0116 (a feature not ready ships behind a flag): superseded by adr-0172 (a flag has a stage). ADR-0030 (task-scoped agent sessions: a code task's working folder becomes its branch's copy) and ADR-0039 (a code workspace's folder becomes read-only to agents): each gets a dated note, or is superseded in part if the work shows its decision no longer holds |

## Key decisions

| Decision | Why |
|---|---|
| A branch's working copy is a local clone | Isolated from the workspace's settings and hooks, can travel to another site as a bundle, and borrows the workspace's objects so it costs little disk |
| **Not** `git clone --local` | It hard-links the workspace's object files into the copy, and an agent can change a hard-linked file in place, rewriting what `main`'s history is made of |
| **Not** a Git worktree | A worktree shares the repository's settings and hooks, so an agent could plant a hook that runs for others |
| Every commit goes back to the workspace's repository | Git, the view and GitHub then agree; a developer who sees two answers trusts neither |
| **Not** bringing the branch back only when the work ends | The view would show a branch that `git branch` does not, and a site failure could lose a day's commits |
| Merges are squashed, with each branch's last merged commit stored as the next merge base | `main` reads as one version per finished piece; checkpoint merges then continue without clashing with themselves |
| **Not** `--no-ff` merges onto `main` | `main`'s history would carry every agent commit, and *versions* would stop meaning finished pieces |
| `main` is protected by a read-only bind, not by checks in code | A bind holds whatever the agent runs; a check holds only where it was written |
| People read, agents write | Editing without formatting, type checking and compiler warnings is not what developers want; their own editor comes later |
| **Not** a browser IDE (code-server, OpenVSCode Server) | Hosting and maintaining an editor is a product of its own; the view only needs to read, compare and merge |
| The diff view that exists, Git underneath | No new package to carry; `ui/src/files/diff/` already compares texts for workflow versions and skill reviews |
| **Not** diff2html or a Git hosting library | They bring a second look and forge features nobody asked for |
| Phase 2 ports from the earlier branch | Its relay, container, guard and services were built and walked; rebuilding them would repeat solved security work |
| **Not** merging the earlier branch | It carries the person's-computer design ADR-0167 dropped, through most of its files |
| One unit, two phases, one merge, with a checkpoint branch between | The live preview is why the unit exists; if phase 2 changes shape, it starts again from the checkpoint with nothing on `main` to undo |
| The fourteen small fixes travel on this unit's branch | One merge to `main`, and phase 2 needs some of them (IPv6 off, the Modal) |
| The live preview ships behind a flag, off | It works but is not yet the right experience or shape; parked, it can't affect other features, and nothing built is lost |
| **Not** removing the live preview, or reshaping it before the release | Removing loses the relay, tickets, guard and secrets work the reshaping reuses; reshaping is an architecture change the release can't wait for |
| One flag list with stages, designed in phase 3 | One place every program reads; a stage says how far a feature is from shipping, so experimental work can be off even in development |

## Work breakdown

Four phases. The seam between 1 and 2 is the live preview: phase 1 delivers code work on branches, usable and walkable
without any running app; phase 2 needs phase 1's branches and copies to have something to run. Phase 3 builds the flag
system phase 4 needs to park the live preview.

### Phase 1 — Code work on branches

**Delivers:** in a code workspace, tasks and conversations work on their own branches with their own copies; the
full-screen workspace view shows them; people merge into a protected `main` and restore its versions.
**Starts when:** the spec and this plan are approved and committed.
**Execution plan:** none — lanes. The code shows the patterns each part follows (dispatch, the site's Git runner, the
storage pages), and the spec is each lane's acceptance.

- [x] 1.1 The fourteen fixes found on the earlier branch (all but release attestation)
- [x] 1.2 Decision record: code work on branches (adr-0168)
- [x] 1.3 Core contract: the site's branch and Git methods and their answers; the site protocol's next minor
- [x] 1.4 Schema: a task's workspace, `WorkspaceBranch`, `BranchCopy`
- [x] 1.5 The commit helper, from the earlier branch, with the operations the spec needs
- [x] 1.6 Turning Git on: `git init`, the first commit, `.gitignore`, large files left out
- [x] 1.7 A branch and its copy when code work first runs; branch names
- [x] 1.8 The run's working folder is its copy; the workspace's own folder read-only in the project's container
- [x] 1.9 The `commit` tool; bringing commits back at once, on the one-minute sweep and at the end of a run
- [x] 1.10 What agents are told: their branch, how far behind, the other branches
- [x] 1.11 A task's workspace on the task's form and from the lead
- [x] 1.12 Merge into main: squashed, the stored merge base, checkpoints while an agent works, clashes sent to the agent
- [x] 1.13 An agent merging when a person tells it to, as that person
- [x] 1.14 `main`'s versions and Restore
- [x] 1.15 After a merge: the branch closes when no agent works on it; copies removed; deleting a branch
- [x] 1.16 GitHub: Merge into main pushes `main`; versions from GitHub arrive
- [x] 1.17 The full-screen workspace view: top bar, workspace switcher, branch select, the conversation panel
- [x] 1.18 Files and Git in the left panel; a file's changes in the diff view; *Deploy…*
- [x] 1.19 The Merge into main dialog, clean, clash and while an agent works
- [x] 1.20 Narrow screens: laptop strip, tablet drawer, phone
- [x] 1.21 What a Viewer sees; a workspace without Git; removing a workspace that has branches
- [x] 1.22 Disk used by copies on the Fleet Console's site page, with its notice
- [x] 1.23 The user guide for workspaces, branches and merging

### Phase 2 — Live preview

**Delivers:** a live preview on any branch or on `main`, beside its conversation, on HQ's own site or another site
allowed to run them, with the Fleet Console's limits.
**Starts when:** the owner has walked phase 1 and its fixes are in; `feature/live-preview-phase-2` is cut from it.
**Execution plan:** none — lanes. The parts come over from the earlier branch, placed file by file in the porting list;
the briefs name the files.

- [x] 2.1 Decision records: live apps travel through relays; install scripts blocked by default; secrets through an
  approved workflow
- [x] 2.2 Core contract: live preview and app messages, the live-preview part of the agent address range; protocol
  versions set afresh from `main`
- [x] 2.3 Schema: `LivePreview`, `LiveApp` known by workspace, branch and name; the per-site settings
- [x] 2.4 The live preview's container, binding one branch's copy, with its template and ceilings
- [x] 2.5 The guard, trimmed of what only a person's computer needed
- [x] 2.6 Network: firewall rules for the live-preview range, IPv6 off, private addresses blocked
- [x] 2.7 The relay's app doors, addresses, tickets and cookies; preview domains and `front-door --previews`; `localhost`
  previews
- [x] 2.8 Apps that listen only on `localhost` reachable from inside the live preview's network
- [x] 2.9 App tools (`start_app`, `stop_app`, `list_apps`, `reload_view`, `set_auto_reload`) with no *Allow*
- [x] 2.10 Services from `.agents/services.yaml`; the install-script rule; both asking only with a named reason
- [x] 2.11 Secrets: *Start live preview* and *Reload live preview* workflows into the app's own container
- [x] 2.12 `main`'s live preview from a copy of its own, brought up to date as `main` moves
- [x] 2.13 States, the idle stop and the line-loss pause
- [x] 2.14 Live preview in the workspace view: the panel item, the app in the middle, its fixed bar, the strip
- [x] 2.15 The Fleet Console: live previews on or off per site, the limit, the idle stop, capacity and memory notices
- [x] 2.16 Picking the site; a full site; another site by bundle
- [x] 2.17 The lead's live-preview offer and its model checks on the baseline model
- [x] 2.18 The old preview path removed
- [x] 2.19 The user guide for live previews, and the Fleet Console's settings
- [x] 2.20 QA stories and scenarios for the unit, and the tests that cover them tagged
- [x] 2.21 The owner's walk's fixes: the agent and the live preview, secrets and apps on the strip, tasks and Deploy

### Phase 3 — A flag system with stages

**Delivers:** a flag system the platform can keep experimental work behind safely: each flag has a stage, an
experimental feature is off everywhere until a developer turns it on, and the suites prove a feature off as well as on.
**Starts when:** the owner has walked phase 2 and asked to park the live preview (done).
**Execution plan:** none — the design is worked out with the owner, then built in one lane.

- [x] 3.1 Design the flag system with the owner, written into the spec (section 7)
- [x] 3.2 The decision record for flag stages (adr-0172, superseding ADR-0116)
- [x] 3.3 Core: stages in the flag list, `isFeatureOn` from the stage, the build and the switches; the two flags there at
  preview
- [x] 3.4 hq: the organisation's switches stored, `requireFeature`, `getFeatures` and `useFeature`, agents' tools and
  instructions by flag, and the *Features* screen (beta for admins in production; every flag in development)
- [x] 3.5 The site and the Fleet Console: switches sent with each instruction (site protocol 1.12) and the site's guard;
  the Fleet Console asking hq
- [x] 3.6 Tests: `withFeature` in every suite, experimental failures reported and not blocking, the all-on run in the full
  regression, and the existing flagged tests moved to it
- [x] 3.7 The stages explained: the architecture and `AGENTS.md` for contributors, the *Features* screen, and the guide's
  beta page
- [x] 3.8 A released flag's life: `releasedIn` on its entry, its admin switch for that minor release, and the release
  rehearsal refusing a later minor or major release while it is listed

### Phase 4 — The live preview behind its flag

**Delivers:** the live preview off and out of sight unless its flag is on, with everything built kept; code work on
branches unchanged; the reshaping written up and queued for after the first release.
**Starts when:** phase 3's flag system is in.
**Execution plan:** none — one lane, from the list of gates in this phase.

- [x] 4.1 The live preview's flag, experimental
- [x] 4.2 hq: the workspace view's *Live preview*, the lead's offer, and the Fleet Console's section hidden while it is
  off; every live-preview operation refusing
- [x] 4.3 Agents: the app tools not offered, and runs not told about live previews, while it is off
- [x] 4.4 The site: its live-preview methods and the relay's app doors refusing while it is off
- [x] 4.5 The guide's live-preview pages marked as not yet available, and the QA scenarios marked as behind the flag
- [x] 4.6 Tests that the flag off hides and refuses every entry point, and that code work on branches is unchanged
- [x] 4.7 The proposal for reshaping the live preview into a development environment of its own (raised outside this
  repository)
- [x] 4.8 The work queued for after the first release

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | A copy borrows the workspace's objects (alternates) instead of `git clone --local`; the spec is corrected in place | The p1-site lane found the hard links would let an agent change `main`'s objects |
| 1 | An agent's `merge_into_main` asks the person to confirm in the conversation, and merges only on their press; the spec is corrected in place | HQ cannot check that a person asked for the merge from the agent's words, so a merge started by text in the repository could reach `main` |
| 1 | Phase 1's history is regrouped once, with phase 2's, before the unit merges, not before the phase-2 branch is cut. `feature/live-preview` stays as the checkpoint as built | Regrouping twice rewrites what phase 2 is built on; one regroup at the end gives the same result |
| 1 | The owner walks the unit once, at the end, not after phase 1. Phase 1 is proved by the lead (its suites and a scripted run of its walk) before the phase-2 branch is cut | The owner asked to automate the build and walk it once at the end |
| 2 | Install scripts are off for every agent command, and a blocked package outside a live preview is asked about with a card in the branch's thread; the spec is corrected in place | ADR-0170 binds every install in a branch's copy, and any run in a project's container can reach one, so an agent's own install was the unguarded path |
| 2 | A workflow aimed at a live preview runs its steps on the live preview's copy, then hands the named secrets to the app's container; it doesn't start the app | The steps run in executor containers like any workflow's; the agent starts the app, which reads its secrets from files |
| 2 | The app tools are offered to every code-work run and find the branch's live preview at each call; the spec is corrected in place | A harness keeps a conversation's tool list across runs, so tools chosen per run went missing once a live preview opened between runs (the proof's Q9) |
| 2 | A person can start a known app from the strip, so `main`'s live preview can show one; the spec is corrected in place | No run works on `main`, so `start_app` could never reach its live preview (the proof's Q8) |
| 2 | Starting a live preview on a branch with no copy makes one, and a copy stays while a live preview runs from it | A done task's branch had lost its copy, so no live preview could start there (the proof's Q2) |
| 2 | A site limits its helper containers and app execs, and live preview reads come from hq's own rows | A render loop made one site start about 1,100 helper containers in a minute, and Docker's engine ran out of memory |
| 2 | The owner's walk's fixes are added as 2.21 | The walk found the agent unaware of its live preview, secrets with no feedback, no way to restart an app, and tasks made without a workspace |
| 3, 4 | Two phases added: a flag system with stages, then the live preview behind its flag, off, with its reshaping proposed and queued for after the first release | The walk showed the live preview works but is the wrong shape for a development environment (one fixed image, no Docker inside); reshaping it is an architecture change the release can't wait for, so it is parked rather than shipped or removed |
| 3 | The flag system designed with the owner: four stages (beta added, for an organisation admin's opt-in), one *Features* screen as the only switch, one rule in core and a gate per program, tests as shipped with experimental failures not blocking, and a released flag switchable off for one minor release then removed (the rehearsal enforces it); the spec gains section 7 and phase 3's tasks are redrawn (3.3–3.8) | The owner asked for end users to be able to opt in, for developers who break an experiment they don't know to have a way through, and for a strict rule on how long a released flag lives |
| 3 | A test run starts from production's defaults, and lets a test switch any flag; the spec is corrected in place | "Every test runs as shipped" needed a precise meaning for `NODE_ENV=test`, which the table had counted as development |
| 3 | The admin area sends someone not signed in to the sign-in page | The owner found `/admin/settings/features` loading for ever signed out; the gate around every admin page waited for a role that never came. Older than the unit, fixed in it |
| 4 | A code-work run's prompt in core says nothing of live previews while the flag is off | The prompt's app-tools section is written on the site from core's text, so hq alone could not withhold it |
| 4 | The Fleet Console's `features.on` answers flag names as plain strings | Typed to the flag list, adding a flag changed the host protocol's shape |
| 4 | `withFeatureOff` in the end-to-end and cross-app suites; the spec is corrected in place | The full regression's run with every flag on failed the tests that a feature is hidden while off, which assumed the flag was off |
| 3 | A patch carries fixes and code behind a flag that is off in production, cut from `main`; the spec, adr-0172 and the `releasing` skill are corrected | At the close the owner set how the platform releases after 0.1.0: fixes first, features built alongside behind their flags, a minor when a flag moves forward |

## Closing note

**Closed 2026-11-03.** Accepted by the owner after the walkthrough of phase 2 (2 November), the decision to park the
live preview behind a flag, and the owner's look at the *Features* screen and the live preview switched on
(3 November).

**What it delivered:** code work on branches (phase 1); the live preview, built and parked behind the `livePreview`
flag at experimental (phases 2 and 4); feature flags with stages, the *Features* screen, a gate in every program and
the release's check for an overdue flag (phase 3). Its reshaping into a development environment of its own is planned
outside this repository.

**Open items:** 54 gathered from the reports, the walk and the handover; 31 closed in the unit or confirmed no longer
true; 23 deferred. On this repository, as issues #145 to #160: the `propose-skill` model check, a task page's dock and
`c=`, the e2e seed's site database, `useAction`'s wait, three flaky test groups, the guide seed's secrets key, deleting
a branch from the view, an archived conversation's copies, a shared package cache, a branch's images, the live
preview's workflow names, the model checks' fidelity, the guide's Settings row, and commits brought back while hq is
away. Planned work and the live preview's remaining items are tracked outside this repository; one of them, a design
pass for the workspace view, blocks `0.1.0`. ADR-0170's limit is noted in the record instead. **No critical item is
open.**

**Regression:** the full regression passed on the final tree, as shipped and with every flag on, with fixes folded in;
three timing flakes older than the unit pass alone and are issues above. **QA:** the unit's stories and scenarios are
written (phases 1–2 in 2.20, phases 3–4 at the close) and their tests tagged; no QA audit ran, so they await the audit
before the release.

**Decision records:** adr-0168 to adr-0172 written on the branch, each with a note of what acted on it; ADR-0116
superseded by adr-0172; notes on ADR-0030, ADR-0039, ADR-0074, ADR-0079 and ADR-0167. The plan is frozen from here.
