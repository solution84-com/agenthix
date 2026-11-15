---
name: Local-first CI — plan
description: Everything CI proves provable locally in the full regression; the monthly dependency updates made and tested locally; the repository says when they are due; the GitHub dependency-updates workflow removed; security alerts triaged on their own path.
created: 2026-11-15
---

# Local-first CI — plan

**Status:** closed 2026-11-15. The design is the [spec](spec.md).

## Goal

Everything GitHub's workflows prove can be proved on the dev machine first, in the full regression; dependency
updates are made and tested locally once a month, the repository itself says when they are due, and GitHub only
confirms. Security alerts are triaged promptly on their own path.

**In scope:** the full regression covering every check CI makes (§2 of the spec); `scripts/deps/due.mjs` and the month in `taken.json`; the reminder at dev start and in the runner; Release's stage 0 stopping instead of starting a workflow; removing `take-updates.yml`; the monthly procedure
and the security triage written down; the migration check and upgrade test in the full regression; the two security
fixes; the ADR.

**Out of scope:** reshaping CI; OpenCode's upgrade; other majors; new tools.

## Size

**Small**: one small script, workflow edits, documents, two dependency fixes.

## Approach

Operational work on `chore/local-first-ci`, rebased onto `main` before building. The full regression runs at the
close, then one push.

## Work breakdown

### Phase 1 — The monthly dependency updates, local

- [x] 1.1 `scripts/deps/due.mjs` (done / due / overdue by calendar month, Australia/Sydney) and its tests; the month
      recorded in `taken.json` by `update.sh`
- [x] 1.2 The reminder: a line at dev start (`fresh.sh`) and at the top of the full and affected regressions from
      the 1st (no Checks job; Release's stage 0 enforces)
- [x] 1.3 Release's stage 0 stops when the month isn't done and starts nothing; `take-updates.yml` removed, with what
      only it referenced
- [x] 1.4 "Take the updates" renamed "the monthly dependency updates" in code and documents

### Phase 2 — The full regression proves what CI proves

Each gap in spec §2 becomes a step of the full regression (`scripts/regression/steps.mjs`). Time is what the step
adds; *needs* is what it relies on on the dev machine.

- [x] 2.1 **Dependency rules**: `node scripts/deps/check.mjs` and `node --test scripts/deps/__tests__` — seconds;
      needs nothing
- [x] 2.2 **Script tests GitHub runs and we don't**: `scripts/release/__tests__` and `scripts/install-test/__tests__`
      beside the existing `scripts/__tests__` — seconds; needs core built first (one test reads `core/dist`)
- [x] 2.3 **core as published**: `npm run check:package` and `npm pack --dry-run` in core — under a minute; needs core
      built
- [x] 2.4 **The builds GitHub makes**: host, console and console-web built, and host's `check:bundles` — about a
      minute each, side by side; needs their installs
- [x] 2.5 **Lockfiles as committed**: `scripts/deps/held.sh` — seconds; catches a lockfile an install changed and
      nobody committed
- [x] 2.6 **Workflows linted**: `actionlint` (with shellcheck) — seconds; needs actionlint installed (it is on the dev
      machine; the step says how to install it when it isn't)
- [x] 2.7 **The guide compared with the released screenshots**: `npm run guide:compare` in hq, after the capture —
      about a minute; needs the GitHub login (`gh auth token`) to read the releases while the repository is private
- [x] 2.8 **Migrations keep every row**: `scripts/migration-check/run.sh` — under a minute; needs Docker; starts from the
      newest release tag instead of a hard-coded `v0.1.0-alpha.4`
- [x] 2.9 **An installation upgrades with its data**: `scripts/upgrade-test/run.sh`, after the images step, **only
      when what it proves changed** — a migration (`hq/migrations/`, `site/migrations/`), the host service's upgrade
      (`host/src/upgrades/`), or an image an installation runs (hq, the site, Postgres); always for the monthly
      dependency updates. Starts from the newest release; needs Docker, the images just built, and the previous release
      pulled from the registry (the GitHub login while the repository is private)
- [x] 2.9a **Its forced failure, shorter**: the host service's wait for hq after an upgrade (10 minutes, `waits.hqMs`
      in `host/src/main.ts`) settable for a development build of the host service only, so the upgrade test's forced
      failure waits about a minute; the test then takes about 4–5 minutes instead of 14
- [x] 2.10 **The same settings as CI**: hq's larger Node heap, Wasp's telemetry off and the robots bundle's token set
      by the scripts that need them (the token from `gh auth token` when none is given), not only by the workflows

**Feasible:** every step uses a command or script that already exists; none needs a new tool. The last full regression
took 34 minutes. Steps 2.1–2.8 and 2.10 add about 1–2 minutes (they run beside the unit tests, the comparison after the
capture). The upgrade test adds about 5 minutes once shortened, and only when what it proves changed: about 35–36
minutes for most unit closes, about 40 for the monthly dependency updates.

### Phase 3 — Security alerts: the strategy and the full triage

- [x] 3.1 `scripts/deps/deferred.json` and `scripts/deps/security.mjs` (open alerts, deferred ones left out until
      their month, deadlines: 7 days for shipped critical/high, the month otherwise) and its tests; confirm the
      workflow token may read the alerts
- [x] 3.2 The reminders: a line at dev start and at the top of the full and affected regressions (from the alert's
      opening), Release's stage 0 (stops after day 7),
      and the triage step in the monthly dependency updates
- [x] 3.3 The full triage of today's 66 alerts (`execution/security-triage.md`): firebase removed from hq; vitest 4 in
      site, host, console, core, relay and the cross-app suite; the OpenCode plugin's deferred; the rest each fixed,
      dismissed with a reason, or deferred — none left without a decision

### Phase 4 — Documents and record

- [x] 4.1 The monthly procedure and the security strategy in `docs/architecture/dependencies.md` and the releasing skill
- [x] 4.2 ADR-0192 (supersedes ADR-0191's mechanism; records the security strategy)

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0146, ADR-0190 |
| **Implements** | ADR-0192 (new) |
| **Revisits** | ADR-0191 (its mechanism superseded; its rules kept) |

## Key decisions

| Decision | Why |
|---|---|
| The updates made locally, not on GitHub | A workflow can only be tested by running it on GitHub; a local change is tested in minutes, then confirmed once |
| `take-updates.yml` removed, not kept as a fallback | It chained four steps nobody watched and moved main by itself; a fallback nobody runs rots |
| The reminder is the repository's own record | Nobody looks at an outside reminder; the month in `taken.json` is committed with the updates |
| Release's stage 0 is the only enforcement | Reminders sit where people look; a failing Checks on main only stops Release, which stage 0 already does |
| Every alert gets a decision; shipped critical/high within 7 days | An alert without a decision is noise next month; a known hole in shipped code can't wait a month |
| Decisions recorded in the repository (`deferred.json`) and in GitHub (dismissals) | Nobody re-works the same list; a deferred alert comes back in its month |
| No new pre-push step | The full regression at a unit's close is the local check; CI catches the rest |
| The full regression covers every check CI makes | CI is the final stop; anything it checks that the dev machine can't is found late |

## Deviations

| Phase | What changed | Why |
|---|---|---|
| Phase 1/3 | The Checks job removed; Release's stage 0 is the only enforcement | Owner: Checks failing on main only stops Release, which stage 0 already does, and would block contributors' pull requests for something not theirs |
| Phase 2 | The upgrade test's forced failure waits 90 seconds, not about a minute (`UPGRADE_TEST_HQ_WAIT_SECONDS`) | The same wait covers the previous release's first start, which runs its migrations; a minute left too little margin. The test took 5.3 minutes in the closing regression |
| Phase 2 | The robots and CLA script tests added to the full regression | Checks runs them and §2's table had missed them |
| Phase 2 | Two failures the closing regression found, fixed: the host image test expected cosign 3.1.3 (the November updates moved it to 3.1.4 on `main`), and console-web's typecheck saw two copies of React's types after a clean install of ui | Each was a gap between what the dev machine and CI prove: the container test runs only in the release build, and CI links one copy of the types where the dev machine had two. The test now reads the version from the Dockerfile; console-web's typecheck maps React's types to its own copy |
| Phase 3 | Release's stage 0 also stops when it can't read the alerts | A release shouldn't go out with its alerts unchecked |
| Phase 3 | The avatar packages taken to 9.4.3 by hand; firebase removed from hq rather than updated | 9.4.3 was within range but the monthly updates did not take it (#293); firebase was left over from a design archived long ago (ADR-0016) and nothing used it |
| Phase 4 | None | |

## Closing note

**2026-11-15.** Accepted by the owner, who agreed to each security decision and to the close.

- **Built:** the monthly dependency updates are made on the dev machine. The repository says when they are due:
  the month in `taken.json`, in Sydney time, shown at every dev start and at the top of every regression from the
  1st. Release's stage 0 is the only enforcement, and `take-updates.yml` is gone. Every security alert gets a
  decision, and shipped critical and high ones get one within 7 days. The full regression makes every check CI
  makes, with the upgrade test when what it proves changed.
- **Security triage:** 66 alerts open at the start:
  - 54 fixed in the unit: vitest 4 in six modules (30), firebase removed (23), the avatar packages (1).
  - 9 deferred to December in `scripts/deps/deferred.json`, with their reasons.
  - 3 dismissed on GitHub as tolerable risk, with the owner's approval.
- **Closing regression:** 48 steps in 40 minutes, the upgrade test included. 46 passed and 2 failed (the cosign
  version and console-web's React types, both fixed; see Deviations). The fixed tests were rerun and pass.
- **Open items:**
  - **Deferred:** #293, the monthly updates missing an in-range patch. #292, ui's shared packages not held to one
    version, stays open; console-web's typecheck fix works around one symptom of it.
  - **Proved on GitHub at the first Release:** whether the workflow's token can read the alerts
    (`vulnerability-alerts: read`).
  - None blocks a release.
- **QA:** SC-2166, SC-2167, AC-496f and AC-496g written; SC-2162, SC-2163 and AC-496c retired. No QA audit ran.
  These entries wait for the audit before `0.1.0`.
- **Records:** ADR-0192 accepted; ADR-0191 superseded by it. ADR-0146 and ADR-0190 still hold.
