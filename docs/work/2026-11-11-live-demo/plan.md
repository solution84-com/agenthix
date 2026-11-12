---
name: A live demo of hq — plan
description: The phases of the live demo unit, run unattended by the lead to one report at the end.
created: 2026-11-11
---

# A live demo of hq — plan

## Goal

A demo hq and site anyone can enter from one link, where every agent run is scripted, nothing reaches outside, and
everything resets every 6 hours ([spec](spec.md)) — built, proved on the dev machine with `agenthix install --demo`,
and ready to install on its machine from the next release.

## Approach

**Run unattended to the end** (owner, 11 November). The lead pulls everything it needs up front, runs the phases with
lane agents, and the owner sees one report at the end. The lead:

- **Decides** what can reasonably be decided, and records it in the report. A decision that cannot reasonably be made,
  or whose answer is not obvious, is built the most conservative way and listed in the report for the owner to approve.
  A change of direction goes in *Deviations* below.
- **Resolves security, critical and usability issues in the unit**, and reports each.
- **Stops only for a blocker the owner must clear**: access to an external system, or a cost. Recording the voice
  clips with the owner's Inworld key is agreed (well under US$1). Nothing touches the demo's machine, its DNS or the
  image registry; the report ends with the steps for those, to run after the next release.

**Lanes** (the `running-lanes` skill): one purpose each, on its own branch and worktree cut from `feature/live-demo`,
merged by the lead one at a time as a single commit rebased onto the branch's head. The contract lane lands first;
the build lanes then run in parallel where their files are disjoint, in sequence where they are not. Lanes run only
the unit tests and typechecks of what they touch, through the machine-wide lock; the lead runs the integration,
cross-app and end-to-end suites after each merge that needs them, and the full regression once at the close.

**Gates.** An independent security review of the whole branch (the guard, visitor accounts, the entry route, the
files host, the install) by an agent that did not build it; every Critical or Should-fix it finds is fixed. A
usability and design gate on the screens that change, against criteria written from the spec before the first
review, two rounds at most: only Critical findings and breaches of the spec are acted on; the rest go to the report.

## Work breakdown

### Phase 1 — The contract
- [x] 1.1 `DEMO_MODE` read once at start, in core, for hq, the site and the host service; inert with it off
- [x] 1.2 The script and seed data formats in `@agenthix/core`, their loader and validation, and the intent matcher
- [x] 1.3 `demo/` skeleton built into the hq and site images

### Phase 2 — Scripted runs
- [x] 2.1 hq: the scripted `languageModel` for the conversation lead — intents, fallback, pacing, tool calls the real
      tools carry out
- [x] 2.2 hq: suggested prompts under the composer in demo mode
- [x] 2.3 Site: `ScriptedRuntime` behind `selectRuntime` — events, files written, end states; workflows refused
- [x] 2.4 Cross-app test: a conversation that starts a task, the task's run through its states, its transcript and
      files read back

### Phase 3 — Getting in and the guard
- [x] 3.1 *Enter the demo*: the demo-only route, visitor accounts, caps per address and overall, "demo is full"
- [x] 3.2 The demo guard: the refused operations, checked against what Wasp generated, the sample's shape protected
- [x] 3.3 Machine screens hidden; visitors kept out of People, mentions and pickers
- [x] 3.4 Upload cap; every file served as a download
- [x] 3.5 The frame line's demo state and the entry screen's notice, with the countdown to the next reset

### Phase 4 — The seed
- [x] 4.1 hq seeds the sample organisation at start on an empty database in demo mode, dated from today
- [x] 4.2 The site seeds its part at start, from the same data and identifiers
- [x] 4.3 What the guide's seed leaves empty: a workflow with past runs, an organisation skill, a secret's name,
      Knowledge for every project, the attachment file
- [x] 4.4 The guide's own seed still produces the sample with its fixed clock

### Phase 5 — The scripts and the demo voice
- [x] 5.1 Lead scripts, run scripts and suggested prompts for the three sample agents and the built-in one
- [x] 5.2 Lines to say as buttons in place of the microphone; replies played from their clips; the *Demo voice* label
      and each agent's first spoken line
- [x] 5.3 The script that records the clips, and the clips recorded

### Phase 6 — The install and the reset
- [x] 6.1 `agenthix install --demo`: the setting, no Docker socket in the site, no Fleet Console, no nightly backup
- [x] 6.2 The reset every 6 hours and `agenthix demo reset`
- [x] 6.3 The front door: the demo's rate limit; the files host never shows a page

### Phase 7 — Documents
- [x] 7.1 The user guide's *Trying the demo* page and the privacy page
- [x] 7.2 Deployment and architecture documents; the decision record for the demo setting
- [x] 7.3 The steps for the demo's machine: DNS, the install beside the other hq, one front door, and locking down
      the other hq (no Fleet Console, no fleet admins, its reviewers' account a member)

### Phase 8 — Proof and report
- [x] 8.1 Security review and its fixes; usability and design gate and its fixes
- [x] 8.2 Images built locally and `agenthix install --demo` proved on the dev machine: enter, talk, run a task, voice,
      a refused action, a reset
- [x] 8.3 Full regression
- [x] 8.4 The report

### Phase 9 — Viewer access, and the owner's walkthrough
- [x] 9.1 A visitor is a member of the organisation and a viewer of the sample's projects, which are private; the
      visitor works in their own space
- [x] 9.2 What viewer access makes unneeded goes: the guard's complete action and query lists, the sample checks,
      the refusals drawn in product screens, the machine-screen hiding, and the client protocol's `demoSample`
      (back to 1.21); the guard keeps entry, storage, and one list of what a member may still do that reaches
      outside, changes who can get in, needs a container or makes something every visitor sees
- [x] 9.3 Scripts and prompts work in the visitor's own space: an agent makes and runs tasks there; Home shows what
      is the visitor's own
- [x] 9.4 Demo-only code still outside the demo folders moves into them where it can (the demo voice session)
- [x] 9.5 The walkthrough's findings (`execution/walkthrough.md`) that viewer access leaves standing
- [x] 9.6 A last walk with the owner; images built and `install --demo` proved again

## Deviations

What differs from the design the unit started with, as finally decided.

| Phase | What changed | Why |
|---|---|---|
| 3 | Visitors are organisation members who view the sample's private projects and work in their own space; the guard is one short list of what a member may still do that a public demo must not (owner, 12 Nov) | Admin visitors needed every action and query listed and refusals drawn in product screens, a cost each new feature would pay; the product's own viewer role protects the sample |
| 3 | Other visitors appear in no list of people, members, teams or person cards | The third security review: visitors' names, pictures and time zones reached each other |
| 6 | The front door has no per-address request limit; hq's entry caps and storage budgets stand in | Stock Caddy has no rate-limit module; one of our own is a release-pipeline change, left to the owner |
| 5 | Kernel speaks in the Kernel voice; the other agents in one library voice; every clip on `inworld-tts-2`, as installed HQs speak (owner, 12 Nov, from an audition) | The Kernel voice was the clear choice; making it every HQ's default is a separate decision about the product's voice |
| 4 | The seed adds a sprint, an artefact, an invitation and the organisation's own skill | Screens the guide covers were otherwise empty |
| 9 | Two product fixes the demo exposed: a project someone only views shows nothing as needing them, and a run's page names a permission request only when one was made | Found in the owner's walkthrough; both wrong for every install, not only the demo |

## Closing note

12 November 2026. Accepted by the owner after the second walkthrough, the owner's findings fixed or raised.

- **Proved:** the full regression passes (every module's typecheck and unit tests, the hq and site integration
  suites, the cross-app suite with and without every flag, the container tests, every image's start test and the
  install test), apart from the Fleet Console web typecheck that already failed on `main` (agenthix#245); and
  `agenthix install --demo` from locally built images: seeded at start, a visitor's run in their own space reaching
  *In review*, `demo reset` wiping and reseeding.
- **Open items:** none critical. Deferred as agenthix#245–#253 (the typecheck, a timing-sensitive host test, a test
  file over the size limit, visitors' activity counts on agent pages, an admin not-found page, a request before
  sign-in, the frame line under the phone's file viewer, a repeated clip-name pattern, a browser test of the demo)
  and agenthix#244 (a run's length in a task's activity). Two planned features and the product's voice are queued
  with the maintainers' planning.
- **QA:** the unit's stories and scenarios are written in `docs/qa/` with their tests tagged; the full QA audit did
  not run at close, so these entries await the audit before release.
- **Records:** ADR-0186 carries its implementation note.
- **Not part of the unit:** putting the demo on its machine, after the next release.
