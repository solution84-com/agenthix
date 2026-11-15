---
created: 2026-11-15
description: Local-first CI — everything GitHub's workflows prove can be proved on the dev machine first, by the full regression at a unit's close; the monthly dependency updates are made and tested locally, not on GitHub; the repository says when they are due; every security alert gets a decision, shipped critical or high within 7 days, with reminders in the repository; the current alerts fully triaged.
---

# Local-first CI — spec

**Status:** being worked out with the owner.

## The principle

**Everything GitHub's workflows prove can be proved on the dev machine first.** GitHub is the final stop: it confirms,
it is never where we find out whether something works.

The testing process stays as it is: the full regression runs at the end of a unit of work (and for each month's
dependency updates, which touch every module), and CI catches what is left. No step is added before an ordinary push.
What changes is that the full regression covers everything CI checks, and that work is no longer done by workflows
that only GitHub can run.

## 1. Why this unit

The dependency-updates unit built the rules, the check and the update script, all sound. It also built a GitHub
workflow, *Take the updates* (`take-updates.yml`), that made the updates on GitHub: Release started it, it pushed a
branch with the deploy key, started Checks, moved `main` by itself and started Release again. Its trial and its first
run used GitHub to find out whether the updates worked, each answer costing a 15–50 minute round trip, and its first
run failed on a setting only the workflow had. Every push that went through the full regression first passed on
GitHub first time; the failures came from making GitHub do the testing.

## 2. Everything CI proves, provable locally

Every step of every GitHub workflow that proves something, and how the dev machine proves the same thing. The full
regression (`scripts/regression/run.mjs --full`) is where they all run locally; the release rehearsal
(`scripts/release/prove.sh`) adds the release's own checks. *Add* marks a gap this unit closes.

| GitHub workflow · step | What it proves | Locally today | Change |
|---|---|---|---|
| **Checks** · each module's typecheck and unit tests | The code | Full regression | — |
| **Checks** · hq and site integration tests | Server operations and data | Full regression | — |
| **Checks** · browser code needs no secure page | No secure-page-only feature used directly | Full regression | — |
| **Checks** · hq-web's start-time address step | hq-web serves its address | Full regression | — |
| **Checks** · hq's guide typecheck | The guide's recipes type-check | Full regression | — |
| **Checks** · the guide's screenshot links (`check-names.mjs`) | Every linked screenshot has a recipe, every recipe is linked, each link names a release | Full regression, inside the guide capture | — |
| **Checks** · dependencies follow the rules; the tests of `scripts/deps/` | The dependency rules | Not run | **Add** |
| **Checks** · core's package check (`check:package`) | core installs as an outside project would | Not run | **Add** |
| **Checks** · host's bundles load (`check:bundles`); host, console and console-web build | The modules build and their bundles start | Not run (only core and relay are built) | **Add** |
| **Checks, every job** · the lockfiles are as committed (`held.sh`) | Installs installed exactly the lockfile | Not run | **Add**, after the runner's installs |
| **Checks** · the regression map's tests (`scripts/__tests__`) | What a change reaches | Full regression | — |
| **Lint workflows** · actionlint and shellcheck | The workflows and their shell | Not run | **Add** |
| **Release build** · every image built and started | The images | Full regression | — |
| **Release build** · the release scripts' tests (`scripts/release/__tests__`) | Keys, reuse, the candidate, the record, the cleanup plan | Not run | **Add** |
| **Release build** · core packed | core's package as published | Not run | **Add** (`npm pack --dry-run` with the check) |
| **Install test** · the stand-in model's tests (`scripts/install-test/__tests__`) | The model the install test talks to | Not run | **Add** |
| **Install test** · install and walk through | An installation works | Full regression | — |
| **Guide screenshots** · capture | Every screenshot the guide shows can be taken | Full regression | — |
| **Guide screenshots** · compare with the released screenshots (`guide:compare`) | Each screenshot against the one its page links; the report the pin step reads | Not run | **Add** (needs the release assets: a GitHub token while the repository is private) |
| **Release** · version, overdue flags, trust root | The release may go out | Release rehearsal | — |
| **Release** · pin the screenshots to the tag (`guide:pin`) | The pages' links name the tag | By hand (the releasing skill) | — |
| **(none)** · migrations keep every row | Data carried forward | Only by hand, from a hard-coded `v0.1.0-alpha.4` | **Add**, from the newest release tag; every full regression (under a minute) |
| **(none)** · an installation upgrades with its data | An upgrade, and its put-back after a failure | Only by hand, from `v0.1.0-alpha.4`; about 14 minutes | **Add**, from the newest release tag, **only when what it proves changed**: a migration, the host service's upgrade, or an image an installation runs (hq, the site, Postgres) — always for the monthly dependency updates. Its forced failure waits for a shorter health check, set for the test (owner, 15 Nov) |
| **Publish release** · attest, sign, publish, release page | The release, public | Can't be local: GitHub's keyless signing and the tag | Its scripts' tests run locally (above) |
| **CLA** · the contributor agreement | Pull requests | Can't be local | — |
| **Registry cleanup** · delete what no release needs | The registry | Can't be local | Its plan's tests run locally (above) |
| **Checks** · "has this tree already passed?", "which jobs does this change reach?" | CI's own selection | Not needed locally | — |

**Environment settings** a CI job sets that a local run doesn't (hq's larger Node heap, Wasp telemetry, the token for
the robots bundle while the repository is private) move into the scripts they serve, so the dev machine and GitHub
run the same thing.

**Workflows stay thin:** a workflow calls scripts; logic lives in scripts, where the full regression can run it.

## 3. The monthly dependency updates (local)

1. An agent creates `chore/deps-<yyyy-mm>` from `main`.
2. Runs `scripts/deps/update.sh --record` — the existing script: npm packages within their ranges (lockfiles only),
   base images and images named in code to their newest digest, Node and cosign everywhere they are named, actions
   within their major, the rebuild epoch raised, the month recorded in `scripts/deps/taken.json`.
3. Runs the full regression (`scripts/regression/run.mjs --full`). Fixes failures locally; a failure it can't resolve
   in two attempts is reported, and that one update is held back for the month (its range pinned) rather than worked
   around.
4. Pushes once; Checks confirms; merges to `main` with the owner's say-so.

Release ships what `main` holds.

## 4. Knowing a month has passed — inside the repository (owner, 15 Nov)

No outside reminder (no GitHub issue, no calendar): nobody looks at them. The record is the repository itself.

- The update script writes the month it ran into `scripts/deps/taken.json` (`"month": "2026-11"`), committed with the
  updates. **A month is done when that equals the current month**; otherwise it is due.
- **One clock**: the current month in **Australia/Sydney**, wherever the check runs, so the dev machine and GitHub's
  runners (UTC) agree on when "the 1st" is.
- **From the 1st of a month that isn't done:** one line at every dev start (`scripts/dev/fresh.sh`), in the regression
  runner's output, and a warning on Checks' page — "Dependency updates for December aren't done: run the monthly
  dependency updates."
- **From the 8th:** Checks fails ("Dependency updates for December are overdue"), so nothing merges to `main` until
  they are done; the dependency-updates branch passes, because it carries the new month. A patch on a release branch
  is not blocked.
- **Release** stops (stage 0) whenever the current month isn't done: "Dependency updates for <month> aren't done: run
  the monthly dependency updates first." A dry run and a patch on a release branch skip it. It starts nothing.

One small script (`scripts/deps/due.mjs`) decides done / due / overdue; every place above calls it.

## 5. What goes (owner, 15 Nov)

- **`.github/workflows/take-updates.yml`**, and Release's stage 0 starting it. Its use of the deploy key to move
  `main` goes with it (the key stays for Release's pin commit).
- The name "take the updates" everywhere: it is **the monthly dependency updates**.

**What stays:** `scripts/deps/update.sh` and its tests, `taken.json`, the dependency rules and their check, exact
installs, security alerts.

## 6. Security alerts: a decision for every alert (owner, 15 Nov)

GitHub's security alerts (Dependabot alerts, on since 15 Nov) list every known hole in what our lockfiles install.
They are kept: they are how we know what to triage. **Every alert needs a decision**, and how soon depends on how
dangerous it is.

### 6.1 The decision

| Decision | When | Where it is recorded |
|---|---|---|
| **Fixed** | A version within range, a removal, or a deliberate major taken now | The fix itself; GitHub closes the alert |
| **Dismissed, with a reason** | Not used, not reachable from outside, or a tolerable risk | Dismissed in GitHub with the reason; it doesn't come back unless the advisory changes |
| **Deferred, to a named month** | Its fix needs a deliberate major or another change first | `scripts/deps/deferred.json` (package, module, alert numbers, reason, month to look again), committed; it resurfaces in that month |

The alert count is never the goal; the exposure is. A fix is never a workaround, and no check is switched off to
clear an alert.

### 6.2 How soon

| Alert | Decide by | Until then |
|---|---|---|
| **Critical or high, in shipped code** (a runtime dependency of something an image installs) | **7 days** after GitHub opened it | Warnings from day 1; Checks fails after day 7 |
| **Medium or low in shipped code; anything development-only** | **The next monthly dependency updates** | Listed in that month's triage |

### 6.3 Where we are reminded — inside the repository

One small script, `scripts/deps/security.mjs`, reads the open alerts (GitHub's API), leaves out those deferred in
`deferred.json` until their month, and says which need a decision and by when. Every place below calls it:

1. **Every dev start** (`scripts/dev/fresh.sh`), with the person's own GitHub login: "2 security alerts need a
   decision (high: undici in hq, 3 days left)."
2. **Checks**, every push and pull request: a warning from day 1; a failure after the 7 days, for critical or high in
   shipped code with no decision.
3. **The monthly dependency updates**: after `update.sh`, a full triage of every open alert, each decided (§3).
4. **Release** stops (stage 0) while a critical or high alert in shipped code has passed its 7 days with no decision.

Before Checks relies on it: confirm the workflow's own token may read Dependabot alerts; if not, a token with only
that permission, kept as a repository secret.

### 6.4 The full triage, in this unit

Every one of today's 66 open alerts is decided in this unit (the inventory: `execution/security-triage.md`, 28 groups
by package and module). Already clear:

| Alerts | Package | Proposed decision |
|---|---|---|
| 30 (12 critical) | `tinypool`, `@vitest/mocker`, `vitest` via vitest 3 — six modules, development only | **Fixed**: vitest 4 in site, host, console, core, relay and the cross-app suite (hq, ui and console-web already are) |
| 23 (high) | `undici`, `@grpc/grpc-js` inside `firebase`, which hq declares and never imports | **Fixed**: remove `firebase` |
| 6 | `toml`, `zod`, `effect` in the site's OpenCode plugin, development build only | **Deferred** to the next OpenCode version |
| 7 | `morgan` (Wasp's generated server), `@dicebear/initials`, `semver`, `minimatch`, `deepmerge` | Each looked at in the triage: fixed within range, dismissed with a reason, or deferred |

## 7. Decision records

**ADR-0192** supersedes ADR-0191's mechanism (its decisions 2 and 3: the step and Release starting it) with the local
monthly dependency updates and the in-repository reminder; ADR-0191's rules (decisions 1, 4, 5, 6) carry over into
it unchanged. ADR-0191 is marked *Superseded by ADR-0192*.

## Not in this unit

- Reshaping CI (hq's typechecks in their own job, cancelling stale branch runs) and the release's two screenshot
  captures: worth doing, their own change.
- Upgrading OpenCode; any other major; a new dependency tool.

## How it is checked

- `due.mjs`: unit tests for done, due and overdue across a month boundary and the Sydney/UTC difference.
- The next monthly dependency updates done by §2: Checks passes first time.
- Release's stage 0: a unit test of the rule; a dry run passes through.
- Each row of §2 marked *Add* runs in the full regression, and fails it when it should (one deliberate break each).
- `security.mjs`: unit tests for the deadlines (7 days for shipped critical/high, the month otherwise), deferred
  alerts left out until their month, and the dev-start, Checks and Release outcomes.
- The full triage: every open alert fixed, dismissed with a reason in GitHub, or deferred in `deferred.json`; none
  left without a decision.
