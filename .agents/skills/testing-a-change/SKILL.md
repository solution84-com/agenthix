---
name: testing-a-change
description: Use when deciding which tests to run and when — while working, before a pull request, before a unit of work merges to main, and for the full regression — and whenever a test calls a real model. Covers verifying by running things, the regression map (scripts/affected.mjs), image start and install tests, the all-flags-on run, and the baseline model for model checks.
---

# Testing a change

## Verify by running things

- **Types:** `npm run typecheck` in the module (`npx tsc --noEmit` in `ui/`; in `hq/` a bare `npx tsc --noEmit` checks
  nothing).
- **Logic:** the test suite. **A file's contents:** read it.
- Never "verify" with a script that prints a conclusion written in advance.

## Which tests, when

| When | Run |
|---|---|
| **While working** | The tests of the files you touched and the typecheck of their modules; the e2e specs for screens you changed; a module's integration suite when you changed a server operation or the data it reads; the cross-app suite when you changed what hq and a site say to each other |
| **Before a pull request** | The suites of every module it touched |
| **Before a unit of work merges to `main`** | The regression for what it reaches (below) |
| **The full regression** | For a unit that changes core's protocol shapes, a database migration, a Dockerfile, the host service or the install, and in every release rehearsal |

**The regression for what a change reaches.** `node scripts/affected.mjs main` names the modules and suites the change
reaches — a module's dependents too; any path it has not seen selects everything. Run:

- those modules' typechecks, unit and integration suites;
- the cross-app suite when `hq`, `site` or `core` is reached;
- hq's e2e tests, its `not-secure` project included, when `hq` or `ui` is reached, and with them the user guide's
  screenshot capture (`scripts/guide/capture.mjs`, as the release build runs it): a change to a screen a recipe shows
  is checked by it;
- the image start test (`scripts/images/start-test-all.sh`) for each image part whose content key changed
  (`node scripts/images/keys.mjs`), and, when any did, the install test (`scripts/install-test/run.sh`: it installs from
  those images at the machine's network address and walks through it in a browser, beside any installation already
  there);
- the migration check (`scripts/migration-check/run.sh`, under a minute) when `hq/migrations/` or `site/migrations/`
  changed, and the upgrade test (`scripts/upgrade-test/run.sh`, about 14 minutes: the previous release installed,
  rows seeded, upgraded to these images and put back from a forced failure, every row checked) when a migration or the
  host service's upgrade changed, and in the full regression.

**The full regression** is every module, every suite and every image, plus **one run of the end-to-end and cross-app
suites with every flag on** (`TEST_ALL_FEATURES=1`; [feature flags](../../../docs/architecture/feature-flags.md)).

## Running a regression: `scripts/regression/run.mjs`

Both regressions run from one committed runner, never a copied script:

```bash
node scripts/regression/run.mjs                    # the regression for what the change from main reaches
node scripts/regression/run.mjs --affected <base>  # … from another commit
node scripts/regression/run.mjs --full             # the full regression
```

- **A log per step, a line per step**: `<logs>/<step>.log`, and `<logs>/summary.txt` with each step's result, counts and
  duration as it finishes (`summary.json` holds the whole record; `--logs <folder>` chooses where, else a new folder
  under the system's temporary folder). `--dry-run` lists the steps; `--only units,integration` runs some groups, `--only e2e` one step; `--help` lists
  the options.
- **Every failed test is rerun alone once** and reported as *fails alone* or *passes alone*: a test that passes alone
  failed under load, and is reported, not hidden. The cross-app suite's files build on each other, so it runs once more
  whole instead. A step that ends with no test report (a crash) runs once more whole, alone, at the end of the run.
- **Two modes.** `--mode close-out` is for a unit's close-out, with nothing else heavy on the machine. It claims the
  machine's one heavy lock (a folder, `HEAVY_LOCK`, else `/tmp/machine-heavy.lock`, holding `pid`, `repo`, `what` and
  `since`) for the whole run — waiting, and saying who holds it, while another process does — marks the claim `whole`,
  and refuses to start while another test run (vitest, playwright) or a Wasp compile or build runs outside it (waiting
  up to five minutes for one that is ending). After the builds, its steps start longest first (by the durations the
  checkout's last close-out run kept, else a committed table); the next one starts only while the 1-minute load is under
  the processor count (a one-slot step up to one and a half times it), free memory is at least 25% and swap is not
  growing, and its slots fit in the budget (the processor count, `--slots`). A step's slots are weighed by the
  processors it was measured using in the last run (kept in `node_modules/.cache/regression/cores.json`). A Vitest or
  Playwright step gets the free slots as workers when it starts, up to its most (hq integration 8, each with a test
  database of its own). The Docker steps run one after another. Beside it, lanes' light commands (`heavy --light`: their files'
  tests, one typecheck) may run: the run keeps one slot for them and offers more, up to `--light-max` (4), only of what
  its own ready steps cannot use, and none under 30% free memory; it publishes the number as `light-allowed` in the
  lock folder. `--dry-run` prints the order and each step's slots. Started under a holder that exported
  `HEAVY_LOCK_HELD` with the lock's path, it runs inside that claim; its own steps get `HEAVY_LOCK_HELD` in turn.
  `--mode shared` is for when lanes or other work share the machine:
  the groups one after another, each step claiming the lock in turn, one Vitest and one Playwright worker.
- **The machine is protected in either mode**: each step waits while free memory is under 25% (`--min-free-memory`) or
  swap grew since the last reading, and when free memory falls under 10% the run stops its own steps, says which did
  not run, and fails. Free memory is what is available, not what the machine has: an installation running beside it
  leaves far less than the machine's total.
- **The run has a database server of its own**: a throwaway PostgreSQL container (`regression-test-db-<pid>`, on a
  free localhost port), set up for tests (no flushing to disk, more buffer memory, 300 connections), started after the
  builds and removed when the run ends; one a killed run left is removed by the next. Every suite's test databases go
  to it through `TEST_DB_SERVER_URL`, which hq's and site's `with-test-db.mjs`, the cross-app harness and the stacks
  read before the development address in `.env.server` (a `DATABASE_URL` in the environment, as CI sets, still wins).
  On the shared development server the suites waited on each other.
- **Each cross-app and end-to-end run has its own**: free ports, test databases named for the run and dropped after it,
  and, for the end-to-end suite, a stack of its own (hq from its build, a site paired with it and hq's relay), seeded for
  its flag setting. So the runs overlap, never touch the development servers or databases, and a run with every flag on
  leaves nothing switched on. hq runs from one build (`scripts/regression/hq-built.mjs --build`, made once before the
  groups start), since two `wasp start` in one checkout restart each other.
- **Environment per step**: no step inherits `SECRETS_MASTER_KEY`, `TEST_ALL_FEATURES` or a run's own settings from
  your shell; hq's integration step is given a key of its own, and the end-to-end runs `E2E_REQUIRE_SEEDED=1`, so a
  spec missing its seed fails instead of skipping.

CI's *Checks* select by the same map, once per tree; a release build proves the images.

## Tests that call a real model

**They run on the baseline: a low-cost, capable model** — the kind a cost-conscious organisation would choose for
everyday agent work; today DeepSeek Flash, or another model of its class. Not the cheapest available: a model too weak
to do the work is no baseline.

- Agent instructions and tool descriptions are written for the baseline, and a check is met when it passes there.
- A large model (Sonnet, Opus) is used only to diagnose a failure on the baseline. An instruction that fails there too
  is unclear; one that passes there asks for more reasoning than the baseline has. Either way the fix is aimed at the
  baseline.
- Nothing calls a large model by default, and a run of several models or many repeats states its expected cost first.

The lead's model checks: [`hq/src/conversations/__modelchecks__/`](../../../hq/src/conversations/__modelchecks__/README.md).
