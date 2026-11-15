---
name: Local-first CI — plan
description: Everything CI proves provable locally in the full regression; the monthly dependency updates made and tested locally; the repository says when they are due; the GitHub dependency-updates workflow removed; security alerts triaged on their own path.
created: 2026-11-15
---

# Local-first CI — plan

**Status:** being worked out with the owner. The design is the [spec](spec.md).

## Goal

Everything GitHub's workflows prove can be proved on the dev machine first, in the full regression; dependency
updates are made and tested locally once a month, the repository itself says when they are due, and GitHub only
confirms. Security alerts are triaged promptly on their own path.

**In scope:** the full regression covering every check CI makes (§2 of the spec); `scripts/deps/due.mjs` and the month in `taken.json`; the reminder at dev start, in the runner and in
Checks; Release's stage 0 stopping instead of starting a workflow; removing `take-updates.yml`; the monthly procedure
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

- [ ] 1.1 `scripts/deps/due.mjs` (done / due / overdue by calendar month, Australia/Sydney) and its tests; the month
      recorded in `taken.json` by `update.sh`
- [ ] 1.2 The reminder: a line at dev start (`fresh.sh`) and in the regression runner from the 1st; a Checks job that
      warns from the 1st and fails from the 8th
- [ ] 1.3 Release's stage 0 stops when the month isn't done and starts nothing; `take-updates.yml` removed, with what
      only it referenced
- [ ] 1.4 "Take the updates" renamed "the monthly dependency updates" in code and documents

### Phase 2 — The full regression proves what CI proves

Each gap in spec §2 becomes a step of the full regression (`scripts/regression/steps.mjs`). Time is what the step
adds; *needs* is what it relies on on the dev machine.

- [ ] 2.1 **Dependency rules**: `node scripts/deps/check.mjs` and `node --test scripts/deps/__tests__` — seconds;
      needs nothing
- [ ] 2.2 **Script tests GitHub runs and we don't**: `scripts/release/__tests__` and `scripts/install-test/__tests__`
      beside the existing `scripts/__tests__` — seconds; needs core built first (one test reads `core/dist`)
- [ ] 2.3 **core as published**: `npm run check:package` and `npm pack --dry-run` in core — under a minute; needs core
      built
- [ ] 2.4 **The builds GitHub makes**: host, console and console-web built, and host's `check:bundles` — about a
      minute each, side by side; needs their installs
- [ ] 2.5 **Lockfiles as committed**: `scripts/deps/held.sh` — seconds; catches a lockfile an install changed and
      nobody committed
- [ ] 2.6 **Workflows linted**: `actionlint` (with shellcheck) — seconds; needs actionlint installed (it is on the dev
      machine; the step says how to install it when it isn't)
- [ ] 2.7 **The guide compared with the released screenshots**: `npm run guide:compare` in hq, after the capture —
      about a minute; needs the GitHub login (`gh auth token`) to read the releases while the repository is private
- [ ] 2.8 **Migrations keep every row**: `scripts/migration-check/run.sh` — under a minute; needs Docker; starts from the
      newest release tag instead of a hard-coded `v0.1.0-alpha.4`
- [ ] 2.9 **An installation upgrades with its data**: `scripts/upgrade-test/run.sh`, after the images step, **only
      when what it proves changed** — a migration (`hq/migrations/`, `site/migrations/`), the host service's upgrade
      (`host/src/upgrades/`), or an image an installation runs (hq, the site, Postgres); always for the monthly
      dependency updates. Starts from the newest release; needs Docker, the images just built, and the previous release
      pulled from the registry (the GitHub login while the repository is private)
- [ ] 2.9a **Its forced failure, shorter**: the host service's wait for hq after an upgrade (10 minutes, `waits.hqMs`
      in `host/src/main.ts`) settable for a development build of the host service only, so the upgrade test's forced
      failure waits about a minute; the test then takes about 4–5 minutes instead of 14
- [ ] 2.10 **The same settings as CI**: hq's larger Node heap, Wasp's telemetry off and the robots bundle's token set
      by the scripts that need them (the token from `gh auth token` when none is given), not only by the workflows

**Feasible:** every step uses a command or script that already exists; none needs a new tool. The last full regression
took 34 minutes. Steps 2.1–2.8 and 2.10 add about 1–2 minutes (they run beside the unit tests, the comparison after the
capture). The upgrade test adds about 5 minutes once shortened, and only when what it proves changed: about 35–36
minutes for most unit closes, about 40 for the monthly dependency updates.

### Phase 3 — Security alerts: the strategy and the full triage

- [ ] 3.1 `scripts/deps/deferred.json` and `scripts/deps/security.mjs` (open alerts, deferred ones left out until
      their month, deadlines: 7 days for shipped critical/high, the month otherwise) and its tests; confirm the
      workflow token may read the alerts
- [ ] 3.2 The reminders: a line at dev start, a Checks job (warning from day 1, failure after day 7), Release's stage 0,
      and the triage step in the monthly dependency updates
- [ ] 3.3 The full triage of today's 66 alerts (`execution/security-triage.md`): firebase removed from hq; vitest 4 in
      site, host, console, core, relay and the cross-app suite; the OpenCode plugin's deferred; the rest each fixed,
      dismissed with a reason, or deferred — none left without a decision

### Phase 4 — Documents and record

- [ ] 4.1 The monthly procedure and the security strategy in `docs/architecture/dependencies.md` and the releasing skill
- [ ] 4.2 ADR-0192 (supersedes ADR-0191's mechanism; records the security strategy)

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
| Checks fails from the 8th | A warning alone can be ignored; a week's grace, then nothing merges until the month is done |
| Every alert gets a decision; shipped critical/high within 7 days | An alert without a decision is noise next month; a known hole in shipped code can't wait a month |
| Decisions recorded in the repository (`deferred.json`) and in GitHub (dismissals) | Nobody re-works the same list; a deferred alert comes back in its month |
| No new pre-push step | The full regression at a unit's close is the local check; CI catches the rest |
| The full regression covers every check CI makes | CI is the final stop; anything it checks that the dev machine can't is found late |

## Deviations

| Phase | What changed | Why |
|---|---|---|
