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
- hq's e2e tests, its `not-secure` project included, when `hq` or `ui` is reached;
- the image start test (`scripts/images/start-test-all.sh`) for each image part whose content key changed
  (`node scripts/images/keys.mjs`), and, when any did, the install test (`scripts/install-test/run.sh`: it installs from
  those images at the machine's network address and walks through it in a browser, beside any installation already
  there).

**The full regression** is every module, every suite and every image, plus **one run of the end-to-end and cross-app
suites with every flag on** (`TEST_ALL_FEATURES=1`; [feature flags](../../../docs/architecture/feature-flags.md)).

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
