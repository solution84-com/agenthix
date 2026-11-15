---
created: 2026-11-15
description: Dependency updates — every outside dependency takes its minor and patch updates in one step of our own, run as part of releasing at most once a month, by rules that keep every package within what the others require of it, merged once Checks pass and built once, by the release that follows; Dependabot's version updates are removed and its security alerts kept; majors are decided by hand; local copies are told when main moved.
---

# Dependency updates — spec

**Status:** approved by the owner on 15 Nov 2026, with the overview board (today and proposed); amended the same day
after the plan's first phase tried the step by hand: Dependabot's version updates are dropped for a step of our own,
and the rules for what an update may move are added; the two majors the trial found forced (site's zod 4, one
TypeScript 6.0) are taken in this unit, before the first release, with a strategy that keeps the dependencies right
afterwards (section 6).

## The problem

Agenthix is built from outside software at three levels, and each is pinned to an exact version so a release is
exactly what was tested:

| Level | Where it is named | Pinned by |
|---|---|---|
| **npm packages** | each module's `package.json`, locked in its `package-lock.json` (root, hq, site, host, console, console-web, ui, core, relay, tests/cross-app) | the lockfile |
| **Base images** | the `FROM` lines of `hq/`, `site/`, `host/`, `console/`, `relay/` Dockerfiles (Node, Alpine, cosign, Caddy) | digest |
| **Workflow actions** | the `uses:` lines of `.github/workflows/` | commit |

A pin never moves by itself, so fixes, security fixes included, only arrive when someone moves it. Today nobody does:

- **Dependabot** (`.github/dependabot.yml`) proposes base-image and action updates. Since 24 Oct it opened ten pull
  requests; it closed eight of them itself when it opened the next, and none was merged. Every base-image proposal
  carried Node 24 → 26, a major version, bundled with routine fixes.
- **npm packages**, nearly all of what we depend on, aren't watched at all, and Dependabot's security alerts are off.
- **The *Rebuild epoch* workflow** (`.github/workflows/rebuild-epoch.yml`), meant to rebuild every image monthly for
  the operating system's security fixes, has never worked: GitHub doesn't let a workflow open a pull request here.
- **The versions have drifted apart**, which the trial found:
  - npm's peer-dependency check (a package stating what it needs of another) is switched off in hq and site
    (`legacy-peer-deps` in their `.npmrc`) and in CI's install of `ui`. It hid a real conflict: site's Claude Agent
    SDK requires zod 4, and site has zod 3.
  - Seven modules use the Node 22 types while everything runs on Node 24.
  - TypeScript is on three versions: 5.8 (site, host, console, console-web, relay), 5.9 (root, ui, core,
    tests/cross-app) and 6.0 (hq, the one Wasp uses).
  - Some versions are written exactly in `package.json` (25 in hq, 18 in ui) and the rest as ranges, with no rule.

## Decisions (owner, 15 Nov 2026)

1. **Everything stays pinned** at all three levels.
2. **Updates are found and made by a step of our own**, not by a bot. Dependabot's version updates are removed: they
   propose one package or group at a time, while ours move together and must be proved together; they rewrite the
   ranges Wasp checks, don't move `.nvmrc` or the workflows' cosign version, don't watch npm here, and their pull
   requests never run the Release dry run. **Dependabot's security alerts are switched on**: they notify, between
   releases, of a known hole in something we use, and change nothing.
3. **Every update keeps each package within what everything else requires of it**: other packages (peer
   dependencies), Wasp, our Node version, and our rule of one version across modules (section 1).
4. **Updates are minor and patch only.** A major version is a manual decision, made on purpose and everywhere at
   once, usually only when something forces it (a package we depend on requires it).
5. **Updates are taken as part of releasing, at most once a month**, by the step. They reach `main` once **Checks**
   passed on them, and the release that follows is their image build: when it fails, nothing is tagged or published,
   and the fix is proved by a Release dry run on its branch, as any fix is. One build per release. Nothing else merges
   them.
6. **Release takes them first when they are more than a month old**: it starts the step, which starts Release again
   once they are on `main`. One button; nobody has to remember a separate job.
7. **The approach was tried by hand once** (the plan's phase 1): this month's updates, Checks and a dry run passed on
   them after three small fixes, each a link between files that move together.

## Design

### 1. What an update may move

The rules every module follows, so an update can only move what the others accept:

- **`package.json` states the range we accept; the lockfile is the pin.** Versions are ranges (`^1.2.3`), and an
  update moves only the lockfile, within them. A version is written exactly only where an outside tool requires it:
  hq's Wasp command line, Prisma and TypeScript (Wasp's own versions), site's Prisma, which follows hq's, and site's
  OpenCode plugin, which equals the OpenCode the agent image installs. Wasp
  compares the text of hq's `package.json` with its own list, so the step never rewrites a range.
- **Every install installs exactly the lockfile** (`npm ci`), in CI, the image builds and a new checkout, and every
  CI job that installs fails when an install changed a lockfile (`scripts/deps/held.sh`). hq installs through
  `hq/scripts/install.sh`: its lockfile also pins the packages of the code Wasp generates, and `wasp install` drops
  them before that code exists, so the script puts the lockfile back before `wasp compile`.
- **Below 1.0, a caret already means patch only** (`^0.28.2` allows 0.28.x), so the 0.x packages need no list.
- **TypeScript takes patches only** (`~5.8.3`): it doesn't follow semantic versioning, and a minor version may break
  the type check, as 5.9 did in the trial.
- **The Node types follow Node's major** (`@types/node` `^24.0.0`, the text Wasp requires), with `.nvmrc`.
- **Peer dependencies are checked everywhere**: no `legacy-peer-deps` in any `.npmrc`, Dockerfile or workflow. A
  conflict fails `npm install`, where the step sees it.
- **One version across modules** for TypeScript, esbuild and Prisma.
- **Every outside image is pinned by digest**: on a `FROM` line, in a compose file, or named in code (the Postgres
  and Caddy images the host service runs). They move to the newest digest of the same tag. A Node minor (`24.22.3`) moves every Dockerfile's
  `FROM`, `.nvmrc`, and every comment and test script that names it, together. **cosign** moves in the host image and
  in the workflows' `COSIGN_VERSION` together; a test already holds them equal.
- **Actions** move to the newest commit of their current major version.

**A check in Checks** (`scripts/deps/check.mjs`, a small job of its own beside *Browser code needs no secure page*,
run on every change) fails when a
rule above is broken: an exact version not on the list, `legacy-peer-deps` anywhere, two TypeScript, esbuild or
Prisma versions, or `@types/node` on a different major from `.nvmrc`. It names the module and the rule.

### 2. The step: *Take the updates*

A script, `scripts/deps/update.sh`, makes the updates by the rules in section 1: `npm update` within the ranges in
every module, writing only lockfiles; each base image to its tag's newest digest, and a Node minor everywhere it is
named; each action to its major's newest commit. It runs the same on the dev machine and in CI.

A workflow, `.github/workflows/take-updates.yml`, on `main` (`workflow_dispatch`), given whether to start a release
afterwards and its version, and, to prove a fixed branch again, that branch.
*Release* starts it (section 3); it can also be started by hand:

1. **Makes the updates** with the script on a new branch, `updates/<yyyy-mm-dd>`, in a job that holds no secret (the
   installs run packages' scripts). With nothing to update, it says so and carries on: the run is still recorded and
   the epoch still raised, so *Release* sees the step ran and the images take the system packages' fixes.
2. **Raises the epoch number** (`rebuildEpoch` in `scripts/images/parts.json`) by one, every time. The epoch number is
   one input of every image's content key, so the next build rebuilds every image from scratch and takes the latest
   security fixes of the system packages the images install (which aren't pinned), even where no code changed.
3. **Records the run** in `scripts/deps/taken.json` (the date and what moved, by module), the file *Release* reads
   (section 3).
4. **Pushes the branch** as one commit and starts **Checks** on it, every job selected. The branch is outside
   `release/**`, so its push starts nothing by itself.
5. **Waits** for Checks.
6. **Checks passed:** moves `main` to the branch's commit (a fast-forward, pushed with the release-pin deploy key,
   refused if `main` moved meanwhile, in which case it says to run it again), and deletes the branch.
7. **Checks failed:** moves nothing, keeps the branch, and its summary names the failed run and job. Someone fixes
   it on that branch, and the workflow is run again with that branch as its input: it skips the updates and proves
   the branch as it stands.
8. **Started by *Release*, it starts *Release* again** on `main` with the same version once `main` moved.
9. **Its summary lists what moved**, version to version, and ends with what to do locally (section 4).

The step and a real *Release* never run at the same time (one concurrency group). The release it starts runs with the
updated workflow files, so updated actions run for real there; its build covers the images, the install test and the
screenshots. Release dry runs keep a group of their own.

### 3. *Release* takes the updates first when they are more than a month old

*Release* gets a first stage, *0. The month's updates*, before everything else. It reads the date in
`scripts/deps/taken.json`. Within a calendar month, the release goes on. More than a month old, it starts *Take the
updates* with the release's version, says so on its page, and ends there, building nothing; the step proves the
updates, moves `main`, and starts *Release* again on `main` with the same version, which now goes on. When the step
fails, nothing moves and no release starts: it names what broke. A dry run, and a patch on a release branch, skip the
stage.

### 4. Local copies stay current

The step moves `main` on GitHub and changes lockfiles. Three things tell a person or an agent:

- **VS Code's Source Control panel** already shows the branch behind GitHub (it fetches by itself).
- **A dev-start check**, a small shared script `scripts/dev/fresh.sh` (beside `pair.sh`), run first by every way the
  dev servers start: hq's `hq/scripts/dev/start.sh` (the `[dev:hq] Start` task, and agents in a terminal), the site's
  start (`[dev:site] Start`, which today runs `npm run dev` directly), and so `[dev] Start All`. It:
  - fetches `origin`, and when the checked-out branch is behind its upstream stops with "This branch is behind GitHub:
    pull first" (it never pulls by itself, so local work is never rebased behind the person's back); this is for agents
    above all, who never see the Source Control panel;
  - runs `npm install` in each module whose `package-lock.json` changed since its `node_modules` was installed, the part
    neither git nor VS Code does.
- **Git itself** refuses a push of a branch behind GitHub ("fetch first"), so updates are never pushed over.

A Node minor also needs that Node on the dev machine; the step's summary says so when `.nvmrc` moved.

### 5. What goes

- **`.github/dependabot.yml`**, and with it the open Dependabot pull request (#164), whose action updates the step's
  first run takes.
- **The *Rebuild epoch* workflow** (`rebuild-epoch.yml`), never able to run: the step raises the epoch number itself
  (section 2, step 2), in a change proved before it lands.

### 6. Keeping it right

The dependencies are sorted before the first release, and these keep them sorted:

- **The rules are written down where everyone reads them**: a living document, `docs/architecture/dependencies.md`
  (section 1's rules, the step, how a major is taken, and what to do when an update breaks), and one line in
  `AGENTS.md`'s *Code conventions*: a dependency is added or changed by those rules, never by switching a check off.
- **The check in Checks enforces them** on every change, a contributor's included, so a rule can't be broken quietly
  (as `legacy-peer-deps` was).
- **The step is the only way updates land**, at most once a month, as part of releasing, proved by Checks and a
  Release dry run; *Release* takes them first when they are due.
- **Security alerts** cover the time between releases; one marked critical is fixed at once, as its own change.
- **A major is taken on purpose**, everywhere at once, with its own change and the dry run, and is recorded in the
  document's list of majors taken.
- **The policy is a decision record** beside the releasing skill, so a later change can't undo it without superseding
  it.

### 7. What the documents say

- **The releasing skill** gets the order *Take the updates, then Release*, the rules in *Decisions* and section 1, and
  what to do when the step fails.
- **`docs/architecture/versioning.md`** (*Base images*, which names Dependabot and the *Rebuild epoch* workflow)
  describes the step and the epoch number raised by it at every run.
- The comments at the top of `release.yml` and the new workflow say the same.

## Settled after phase 1

- **Site moves to zod 4 in this unit** (owner, 15 Nov): its Claude Agent SDK requires it; site has zod 3, hq zod 4.
  It is done before the check, so peer dependencies are checked in every module from the start.
- **Every module moves to TypeScript 6.0 in this unit** (owner, 15 Nov), the version hq's Wasp uses; hq keeps it
  exact, the others take its patches (`~6.0.3`). Tried on the trial branch: five modules passed unchanged; host and
  site have three Buffer typing errors, and ui needs its type packages named (TypeScript 6 no longer loads them by
  itself).
- **One build** (owner, 15 Nov): the step proves the updates with Checks only, and the release it starts is their one
  image build; release images are only ever built on `main` or `release/*`. If that build fails, nothing is published,
  and the fix is proved by a dry run on its branch. `main` may briefly hold an update the image build rejects, like any
  change that breaks the build.
- **npm is covered in every module with a lockfile.**
- **The updates are taken as part of releasing, at most once a month** (owner, 15 Nov): *Release* starts the step when
  they are more than a month old, and the step starts *Release* again. No schedule and no separate job to remember.

## Not in this unit

- Any other major upgrade (Node 26, Wasp's next 0.x minor), and fixing what one would break.
- Updates to the development tools a person installs on their own machine.

## How it is checked

- **Phase 1** (done): on a trial branch, this month's updates made by hand by these rules; Checks (11½ minutes, 83 CI
  minutes) and a Release dry run with every image rebuilt (47 minutes, 103 CI minutes) passed after three fixes.
- **The rules:** `scripts/deps/check.mjs` has a unit test per rule (a module breaking it fails, naming it); it passes on
  the repository.
- **The script** run on the dev machine leaves every `package.json` unchanged and moves only lockfiles, digests and
  action commits.
- **The workflow** is proved like #272: run on a pushed branch with real updates; Checks pass; the move
  of `main` is exercised against a scratch branch protected like `main` (a temporary ruleset), then removed; run again
  with a branch as input, it skips the updates.
- **Release's first stage:** a unit test of the month rule; on GitHub, a real Release with the updates over a month
  old starts the step and ends, and the step starts it again; a dry run goes straight on.
- **The local check:** `fresh.sh` run with a branch behind its upstream stops; after a lockfile change it installs; both
  the hq and the site start run it.
- **The two majors:** every module's typecheck and tests pass on TypeScript 6.0, and site's on zod 4, with peer
  dependencies checked; the full regression and a Release dry run run over the whole change.
- `lint-workflows` passes on every changed workflow.

## Decision records

The update policy (*Decisions* 1–6 and section 1's rules) binds every later release and every dependency change; it
is recorded as an ADR on this branch (section 6).
