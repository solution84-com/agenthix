---
name: Dependency updates — plan
description: Outside software (npm packages, base images, workflow actions) kept up to date with minor and patch updates, made once a month by a step of our own under rules that keep every package within what the others require, and proved by Checks and a Release dry run before main moves; Dependabot's version updates removed, its security alerts on.
created: 2026-11-15
---

# Dependency updates — plan

**Status:** approved by the owner on 15 Nov 2026; amended the same day after phase 1 (see *Deviations*). The design
is the [spec](spec.md).

## Goal

Every release carries the month's fixes to the outside software it is built from, and no update reaches `main`
before it has been proved. Today nothing reaches it at all: Dependabot's ten pull requests since 24 Oct were never
merged, the *Rebuild epoch* workflow has never worked, nothing watches the npm packages, and the versions have drifted
apart across modules (peer checks off, three TypeScript versions, Node 22 types on Node 24).

**Agreed with the owner (15 Nov):**
- Everything stays pinned to an exact version.
- Updates are made by a step of our own, not a bot: Dependabot's version updates go, its security alerts are on.
- Every update keeps each package within what everything else requires of it.
- Minor and patch only; a **major version is a manual decision**, made on purpose and everywhere at once.
- Updates are taken **as part of releasing, at most once a month**, by the step, and reach `main` only after
  **Checks** pass on them; the release that follows is their one image build. *Release* starts the step when they are
  more than a month old, and the step starts *Release* again.

**In scope:** the rules for what an update may move, applied to every module, and a check that holds them; the step
(a script and a workflow) before *Release*; *Release*'s refusal; removing Dependabot's version updates and the
*Rebuild epoch* workflow; security alerts; keeping local copies current after the step moves `main`; the releasing
skill and the docs that describe the release.

**Out of scope:** any major upgrade beyond site's zod 4 and TypeScript 6.0; fixing what an update breaks beyond what the step
needs to land (each is its own change).

## Size

**Medium**: workflow and scripts, one check, the rules applied across ten modules, two majors (zod 4 in site,
TypeScript 6.0). Phase 1 showed the first run's risk
is in links between files that move together, and that the tests catch them.

## Approach

**Phase 1 was a feasibility check, done by hand.** Its findings reshaped the design: Dependabot's version updates
went, and the rules in the spec's section 1 came in.

**Then the build, on this branch, proved before it lands:** the rules and their check, the script and the workflow,
*Release*'s refusal, the local check, the docs. The rule changes are made on this branch from what the trial branch
proved (ranges, peer checks, the Node types, TypeScript patch only, the three fixes); the updates themselves are not
copied over: the step's first real run takes them, in phase 3. The whole change is proved with a run of the new step
on a pushed branch (as #272 was), then lands on `main` as one commit with the owner's say-so. The settings commit
already on this branch (`6e5d51c9`, Dependabot monthly) is replaced by its removal.

**One rule shapes the design:** a workflow run uses the workflow files it started with, so updated actions are only
exercised by a run that starts after they are in. That is why the step runs before *Release*, not inside it.

## Settled after phase 1

Both majors the trial found forced are taken in this unit (owner, 15 Nov: "get the dependencies sorted before going
live, and have a strategy in place to prevent future issues"): site to zod 4, and every module to TypeScript 6.0.

## Work breakdown

### Phase 1 — Try it by hand

- [x] 1.1 Gather this month's updates: #164 (actions), the base images' minor and patch updates, and the npm minor and
      patch updates of every module (made locally)
- [x] 1.2 Merge them on a `release/updates-trial` branch and raise the epoch number; Checks and a Release dry run run
      there. Round 1 failed (Wasp's required version text rewritten; TypeScript 5.9's Buffer typing); round 2, with
      ranges and lockfile-only updates, passed after three fixes (cosign in the workflows, hq's `.npmrc` in its
      Dockerfile, core's standard library for `.at()`)
- [x] 1.3 Report to the owner: what was updated, what broke and why, the time and the CI minutes (Checks 11½ min / 83
      CI minutes; dry run 47 min / 103; the whole trial about 405)
- [x] 1.4 The owner settles the open questions and approves the build: Dependabot's version updates dropped, security
      alerts on, the spec and plan corrected (15 Nov)

### Phase 2 — Build

- [ ] 2.1 The rules applied to every module: ranges in `package.json` (exact only where Wasp requires), TypeScript
      patch only, `@types/node` on Node's major, `legacy-peer-deps` removed from hq, the hq Dockerfile and CI's `ui`
      install; core's standard library for `.at()`; the workflows' cosign version kept with the host image's
- [ ] 2.2 `scripts/deps/check.mjs` and its Checks job, with a unit test per rule
- [ ] 2.3 `scripts/deps/update.sh`: npm within ranges (lockfiles only), base-image digests and a Node minor everywhere
      it is named, actions within their major
- [ ] 2.4 The *Take the updates* workflow: the script on an `updates/<date>` branch, the epoch raised, `taken.json`
      written, Checks started and waited for, `main` moved with the release-pin deploy key when
      Checks pass; a branch input to prove a fixed branch again; a summary of what moved and what to do locally
- [ ] 2.5 *Release*'s new first stage starts the step when `taken.json` is more than a month old, and the step starts
      *Release* again (a dry run and a patch on a release branch excepted)
- [ ] 2.6 Remove `.github/dependabot.yml` and the *Rebuild epoch* workflow; close #164 once the first run takes it
- [ ] 2.7 Local copies: `scripts/dev/fresh.sh`, run first by hq's dev start and the site's
- [x] 2.8 Security alerts on in the repository's settings (15 Nov)
- [ ] 2.9 Site to zod 4, before 2.2, so site checks peer dependencies too
- [ ] 2.10 Every module to TypeScript 6.0 (hq exact, the others `~6.0.3`): host's and site's Buffer typing, ui's type
      packages named

### Phase 3 — Prove and document

- [ ] 3.1 Run the new step on a pushed branch with real updates; Checks pass, `main`'s move is
      exercised against a scratch branch protected like `main`
- [ ] 3.2 The releasing skill, `docs/architecture/versioning.md` and the release's own comments describe the new order
      (take the updates, then release) and the rules above
- [ ] 3.3 `docs/architecture/dependencies.md` (the rules, the step, taking a major, when an update breaks), the line in
      `AGENTS.md`, and the policy's ADR
- [ ] 3.4 The full regression and a Release dry run over the whole change

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0146 (a release is a proven build given a name), ADR-0190 (a release is started by one workflow) |
| **Implements** | A new record for the update policy (phase 3) |
| **Revisits** | None |

## Key decisions

| Decision | Why |
|---|---|
| Our own step, not Dependabot's version updates | Our packages move together and are proved together; the bot proposes them apart, rewrites ranges Wasp checks, misses `.nvmrc` and the workflows' cosign version, and never runs the dry run |
| Security alerts kept | The one thing the step can't do: warn of a known hole between releases |
| Ranges in `package.json`, only lockfiles move | Every package stays within what the others and Wasp require; exact versions would never move |
| Peer checks on everywhere | Switched off, they hid site's zod conflict |
| Updates taken in a step before *Release*, not inside it | A run uses the workflow files it started with, so updated actions only run in a run started after them |
| Checks before main moves, the release as the one build | Checks proves the code's own tests; the release's build proves images, the install test and the screens, and publishes nothing if they fail. One build instead of two |
| Part of releasing, at most once a month; *Release* starts the step when the updates are due | One button: nobody has to remember a separate job; releases may come more often than monthly; per-release updates were noise |
| Tried by hand first | It had never been done here; what it showed reshaped the rules |
| The two forced majors taken now, with a written strategy | Before the first release is the time to get the dependencies right; a rule only lasts when it is written, checked and recorded |

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 2 | The step records and lands every run, even with nothing to update; dry runs got their own concurrency group; the step takes the next release's version; outside images in compose files and code are pinned and moved too (a lane of its own); the check counts only direct dependencies for one-version packages; site's OpenCode plugin is a module, its plugin version exact (it equals the agent image's OpenCode) | Stopping with nothing to update would leave *Release* refusing for good; one shared group deadlocked the step on its own dry run; the dry run proves a version; a pin the step didn't move would never move; a copy another package brings in is that package's choice |
| 2 | The step proves with Checks only; the release it starts is the one image build (it was: a Release dry run in the step, then the release built every image again) | The owner: the second build is unnecessary when the first doesn't fail; a failed release build publishes nothing |
| 2 | The updates are taken as part of releasing, at most once a month: *Release*'s new first stage starts the step when they are more than a month old, and the step starts *Release* again (it was: the step before every release, Release refusing since the last tag) | The owner: once a month, part of the release workflow, nothing separate to remember |
| 2 | hq's installs made reproducible (`hq/scripts/install.sh`, `npm ci` everywhere, a CI step that fails when an install changes a lockfile), a lane of its own | A clean install rewrote 418 lines of hq's lockfile: CI, the images and a new checkout could each run versions nobody committed; it predates the unit |
| 1 | Dependabot's version updates dropped for our own step; security alerts kept; *Release*'s refusal now reads the step's record instead of open Dependabot pull requests; the rules for what an update may move added, with a check; the step's branch moved outside `release/**` | The trial: the bot covered none of the links that broke, doesn't watch npm here, and its pull requests were never taken; the versions had drifted apart behind switched-off peer checks; a `release/**` push starts a second build |
