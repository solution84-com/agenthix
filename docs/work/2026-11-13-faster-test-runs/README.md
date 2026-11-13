---
created: 2026-11-13
description: The full regression and CI take minutes, not an hour — CI's two hq jobs split across several runners, and the local close-out regression running its independent groups at the same time.
---

# Faster test runs

**Operational work**, on `chore/faster-test-runs` from `main` (`efd74947`). It changes how the work is tested, not
what anyone using Agenthix sees.

## Why

A unit's close-out waits about an hour on tests, and every push waits 35 minutes on CI. Neither is the tests being
slow; both are tests waiting in line.

**The local full regression** (generated avatars and covers, 12 Nov, before the end-to-end suites): 48 minutes, every
step one after another, each through the lanes' machine-wide lock with one Vitest worker, on a 10-core machine with
nothing else running.

| Step | Minutes |
|---|---|
| hq integration | 16 |
| image start test and install test | 8.5 |
| hq unit | 5 |
| site container | 4 |
| cross-app, flags off and all on | 4 |
| everything else | about 10 |

**CI** (`checks.yml`, full run on `main`, 11 Nov): every job starts at once, so the run lasts as long as its longest
job.

| Job | Setup (install, `wasp compile`) | Tests | Total |
|---|---|---|---|
| hq: integration tests | 4 min | 31 min | **35 min** |
| hq: typecheck and unit tests | 4.5 min | typecheck 2, unit 11 | **18 min** |
| site: unit | | | 3.5 min |
| every other job | | | under 2 min |

## Objectives

1. **Every suite passes on `main`.** Seven hq e2e specs fail there today, alone too, and one fails under load (see
   the plan's Phase 1).
2. **A full CI run takes 12 minutes or less**, with the same tests.
3. **The local full regression takes 25 minutes or less**, with the same coverage as today, the end-to-end suites
   included.
4. **The `testing-a-change` skill says how to run both**, and a unit's close-out uses the committed runner instead of a
   copied script.

## Result

Measured on 13 Nov, the same 10-core dev machine and the same tests as before.

**Local full regression** (`node scripts/regression/run.mjs --full`, close-out mode), the end-to-end suites included:

| Run | Minutes | Steps passing |
|---|---|---|
| Before: every step one after another, one worker | 48 (before e2e) | — |
| Steps in parallel, fixed groups | 43 | 36 of 36 |
| A live budget, each step weighed by the processors it uses | 34 | 36 of 36 |
| A database server of the run's own | **25.3** | **36 of 36** |
| The last run, with the CI changes, every image rebuilt | 27.5 | 35 of 36 (one spec found two buttons mid-change; fixed, then passing) |

What made the difference was the database server, not the processors: every suite kept its test databases on the
development server, and they waited on it. On a server of the run's own, set up for tests, hq integration takes 4 to
12 minutes beside everything else instead of 14 alone, and cross-app 5 instead of 20. Free memory never fell under 33%.
A run whose images have all changed is slower (their build is 15 minutes of it).

**CI** (`checks.yml`, a manual run of every job):

| | Before | After |
|---|---|---|
| hq: typecheck and unit tests | 18 min, one job | 2 halves, the typecheck in the first: 5 to 12 min |
| hq: integration tests | 35 min, one job | 6 parts, each with its own Postgres: 5 to 12.5 min |
| **A full run** | **35 min** | **13.1 min** on the first run, **10.5 min** with npm's cache warm, every job passing |

The integration parts are uneven (Vitest splits by file count, not by duration); eight would take about a minute
off for about 16 more billed minutes a run, and six were kept. A full run bills about 100 runner-minutes, from about 65.

Still open: host's `hqMove` tests time out under load and pass alone (agenthix#246); the shipped e2e
`chatStreaming.spec.ts` saw no streamed pieces once in a run of its own and passed the next (agenthix#168).

## What it touches

`.github/workflows/checks.yml`, `scripts/affected.mjs` and `scripts/checks-verdict.mjs` with their tests, hq's Vitest
configs if sharding needs it, a new committed regression runner under `scripts/`, and the `testing-a-change` skill.
No product code.

## Related issues

Tests that time out under load will show up more once the regression runs in parallel: agenthix#23, #151, #246 (host's
`hqMove` tests), #149 (Knowledge e2e), #150 (Fleet Console container test). The unit fixes any of them that block
objective 3, and leaves the rest open.

[`plan.md`](plan.md) has the phases.
