---
name: QA Strategy — Agenthix
description: This repository's QA settings — scope, modules, commands, test tiers, contract files, and how findings are routed. The general QA model is README.md beside this file.
updated: 2026-10-24
---

# QA Strategy — Agenthix

This file holds this repository's QA settings. The general QA model — the two contracts, how tests link to them, test levels, when the contract is written and what an audit checks — is [`README.md`](README.md) beside it, shared across repositories and versioned.

**A unit writes its QA contract at its close — never between phases.** While a unit is being built, its phases write tests test-first and run them, and nothing else: no stories or scenarios authored, no `@SC-NNN` citations added, no requirement → scenario → test chain check. When the last phase lands, the unit writes the stories and scenarios for the behaviour it built or changed, from the finished code, and tags the tests that cover them with their `@SC-NNN` citations.

**A full QA audit is required before every release, and optional at a unit's close.** The owner decides at each close whether to run one, scoped to the modules the unit changed; it checks the contract against the code, walks the requirement → scenario → test chain, runs the suites, and its findings become the unit's open items. Contract entries a unit wrote for itself are checked by the next audit like any other — the audit before release at the latest.

**Scope: `core`, `hq`, `site`, `host`, `console`, `console-web`, `relay`, `ui`.** `host` (the host service and its `agenthix` command line), `console` (the Fleet Console's server) and `console-web` (its screens) joined on 2026-10-16, at the close of the host management unit. The identity service, the old central aggregator, the mobile client and the marketing site moved out of this repository on 2026-08-09. Each now carries its own `qa-strategy.md`, self-contained beside its own code, and this file no longer covers them. This repo's own control-plane app was renamed `site` → `hq` on 2026-08-11, and a separate `site/` module — the Execution Site — was created alongside it, reusing the vacated name; see the naming note under Modules.

## Modules

Which checks apply to each module and its end-to-end surface.

> **Naming note.** This repo's control-plane app was called `site` until its 2026-08-11 rename to `hq`. The `site` row below is the *other* module — the Execution Site, added since — not a leftover of the old name; the two never shared code, only briefly the name. The contract files follow the module names: `docs/qa/scenarios/hq.md`, `docs/qa/stories/hq.md` and `docs/qa/domains/hq.md` hold hq's contract (they were named `site.md` until 2026-09-26), and `docs/qa/scenarios/site.md` holds the Execution Site's. The site's runtime scenarios that predate that file (containers, mounts, credentials, dispatch, the control channel) still sit in `scenarios/hq.md` until the full audit of the finished product moves them.

| Module | typecheck | build | test | e2e surface |
|---|---|---|---|---|
| core | yes | yes | yes | none |
| hq | yes | yes (wasp) | yes | web |
| site | yes | yes (esbuild) | yes | none |
| host | yes | yes (esbuild) | yes | none (a command line; its container tier, below, drives the built image) |
| console | yes | yes (esbuild) | yes | none |
| console-web | yes | yes (vite) | yes | none (web, without a browser suite — see End-to-end) |
| relay | yes (the viewer too) | yes (esbuild) | yes | none (a server with no screen; the PDF viewer page is covered by `hq`'s e2e and the cross-app tier) |
| ui | yes | no | yes (the files frame and its renderers) | none |

## Commands

The standard interface is `npm run typecheck`, `npm run build`, `npm test`. Where the script is absent, the direct command is listed instead — see also the Deviations section.

| Module | typecheck | build | test | coverage |
|---|---|---|---|---|
| core | `npm run typecheck` | `npm run build` | `npm test` | `npm test -- --coverage` |
| hq | `npm run typecheck` | `npx wasp build` (or `npx wasp start` boot) | `npm test` | `npx vitest run --coverage` |
| site | `npm run typecheck` | `npm run build` (or `npm run dev` boot) | `npm test` | — (not yet instrumented, see Deviations) |
| host | `npm run typecheck` | `npm run build` | `npm test` | — (not yet instrumented) |
| console | `npm run typecheck` | `npm run build` | `npm test` | — (not yet instrumented) |
| console-web | `npm run typecheck` (the app and its Vite config) | `npm run build` | `npm test` | — (not yet instrumented) |
| relay | `npm run typecheck` | `npm run build` | `npm test` | — (not yet instrumented) |
| ui | `npm run typecheck` (`npx tsc --noEmit`) | — | `npm test` | — |

`host` also has `npm run test:container` (`vitest.container.config.ts`, the `*.container.test.ts` files): it needs Docker and the host service's image built (`docker build -f host/docker/Dockerfile -t <name> .` at the root), runs one file at a time, and drives the real image — its CLI, its compose projects, the firewall rules on the machine, backups and restores in Docker. All three new modules need `core` built first (`cd core && npm run build`).

`site` also has `npm run test:integration` (`vitest.integration.config.ts`, against `agenthix_site_test` — see Test data below), matching hq's own integration command.

## End-to-end

| Module | Tool | Surface | Simulator check | Dev-server start | Dev-server port |
|---|---|---|---|---|---|
| hq | Playwright | web | n/a (web) | `docker compose up -d hq-db` then `./scripts/dev/start.sh` | client 4100, server 4101 |

`console-web` has no browser suite yet: its screens are tested as components against a fake Fleet Console server (`console-web/src/__tests__/fakeServer.ts`), and the server's guards, sessions and commands by `console`'s own tests; the cross-app tier covers the relay and the Fleet Console's sign-in through hq. `host` has no browser surface; its container tier drives the built image.

`site` has no e2e surface: all browser-facing UI belongs to hq (see `hq/AGENTS.md`, "UI work"), so there is nothing for a browser-driven suite to exercise there yet.

Full per-surface setup (flows, test data, setup sub-flows): `hq/e2e/README.md`.

## Cross-app tier

Automated tests that boot **both** apps together and exercise the control channel between them — distinct from either module's own per-app tiers above. Suites live under `tests/cross-app/`, run as ordinary API-level Vitest with no browser, against `hq`'s `agenthix_test` (`:4109`) and `site`'s `agenthix_site_test` (`:4209`) — each brought up through that app's own `scripts/test/with-test-db.mjs` wrapper (see Test data, below), so the isolation guarantees match the per-app integration tier.

Run from the repo root:

```
npm run test:cross-app
```

**Ports are free ports, and one run holds the databases.** Both apps boot on ports the operating system gives the run (the harness binds port 0), so the suites drive real running apps without clashing with development's 4100, 4101 and 4201 or an installed copy ([`docs/architecture/ports.md`](../architecture/ports.md)). The test databases are shared (ADR-0035), so a run lock refuses a second cross-app run while the first lives; wait for it to finish.

**Reset granularity is per run, not per test.** Suites run sequentially and deliberately share state across the run: one truncate happens at the start of the whole run, not before each test the way the per-app integration tier resets. A suite needing an isolated fixture creates it itself rather than relying on a mid-run truncate.

The repository's CI (`.github/workflows/checks.yml`) does not run this tier; it runs by hand.

## Artifact paths

Self-contained — the testing contract lives under `docs/qa/`, no dependency on any other repo. An audit is a unit of work, so its report and run scratch live in that unit's folder under `work/`.

| Artifact | Path | Committed |
|---|---|---|
| Scenarios contracts | `docs/qa/scenarios/` — one file per module (`hq.md`, `site.md`, `host.md`, `console.md`, `console-web.md`, `core.md`, `relay.md`, `ui.md`) | yes |
| Stories contracts | `docs/qa/stories/` — `hq.md` (members and organisation admins), `host.md` (the machine admin), `console.md` (the fleet admin, for `console` and `console-web` together), `cross-cutting.md` | yes |
| Domain maps (per module) | `docs/qa/domains/` | yes |
| User-journey coverage map (which journeys matter to which role, and what covers them) | `docs/qa/coverage.md` | yes |
| Deferred QA findings | an issue on this repository, noting a QA audit as its source | yes |
| Report + run scratch (one folder per audit campaign) | `work/<date>-<label>-qa-audit/execution/` | no — gitignored |
| Aborted-run scratch | the audit unit's `execution/` | no — gitignored |

**Reports** — each campaign is a **folder**, `work/<YYYY-MM-DD>-<label>-qa-audit/`, holding a `report.md` (rolling up every run via its `## Runs` and `## Measurements` tables) and the `runs/run-NN/` scratch each run produces. The **`execution/` folder is gitignored — nothing under it is committed.** Every finding a report contains either gets fixed — self-evident by reading the code afterward — or gets deferred as an issue noting a QA audit as its source. Nothing in `report.md` outlives both of those. `<YYYY-MM-DD>` is the campaign's start date (it may span days); `F-NNN` are report-scoped and continue across runs.

**Run scratch** (the audit unit's `execution/runs/run-NN/`) holds the working surfaces a single run produces — the cell reports (accuracy/coverage/regression) per module, `domains/`, `.logs/`, or an `abort.md` when scope was unresolved (an abort has no report folder — it writes to the unit's `execution/runs/<date>-aborted-NN/`). Runs are numbered `run-01`, `run-02`, … (never timestamped, so a campaign can span midnight/days). Its distillate (metrics + findings) is rolled up into `report.md` for the duration of the campaign, then either fixed or filed as an issue — nothing here needs to outlive that. The run scratch is the audit's own working material and is not described here.

**Domain maps** (`docs/qa/domains/<module>.md`) carve a module into feature domains (file list + operation list per domain) for the audit's accuracy code pass. The first accuracy run for a module generates the map; later runs read it so domain order — and therefore US-numbering — stays stable. Committed and versioned, alongside the code it maps. The discovery procedure and format are not written down in this repository yet.

## Downstream routing (accuracy-pass observations)

The audit's accuracy code pass reads code broadly and surfaces things outside the contract mandate (pure defects with no requirement angle). The measurement passes only report. The audit's action phase, at its decision session, then acts on what they found. Where each routes in this repository:

| Observation kind | Route to |
|---|---|
| Code defect (no requirement angle — e.g. plaintext credential storage) | fixed in the action phase, on the audit's branch, with a covering test and a recorded cause; an issue only when it is not a straightforward fix (substantial scope, needs a business decision, unclear requirement) |
| Security / access-control defect | the same, and **`/security-review`** of the fix |
| Scenarios/stories contract mismatch (contract disagrees with code) | applied in-session — the audit reconciles the contract, and at a unit's close also authors the net-new entries |

The measurement passes record pure defects as non-authoritative observations and recommend the route; the action phase fixes them.

**A deferred finding is queued work, not a register of its own.** When a QA-surfaced gap is *deferred* — seen and accepted for now — it is filed as an issue on this repository like any other queued work, noting a QA audit as its source so its origin survives. There is no second list: one queue for everything that needs doing, because a register of known-broken things beside a backlog of planned work is the same information filed twice, and the two drift within a release.

**Audits reconcile against the open issues.** A finding matching an open item is reported under the report's *Pre-existing issues* section rather than as a new decision every run; the audit also flags any item whose deferral trigger now applies, or that no longer reproduces. Newly-deferred findings are filed at the decision session, with the human's approval.

**Gaps in the QA framework itself** — a rule that was silent, ambiguous, or contradicted by reality — are not product findings and do not queue here. A run takes a safe default and records the gap, and the rule is settled in a later review of the QA framework rather than by the run. A gap in *this* file is a defect in this repository and queues as an issue like anything else.

## Stack notes

- **site** — a plain Node server (ADR-0086): `npm run typecheck` needs nothing generated, and `npm run build` is the build gate.
- **hq** — a typecheck/build quirk: typecheck requires the `.wasp/` SDK present (run `npx wasp compile` once if it hasn't been generated yet). hq's `tsconfig.json` only references `tsconfig.src.json` (the app) and `tsconfig.wasp.json` (the `*.wasp.ts` declaration files), so a bare `npx tsc --noEmit` in `hq/` checks nothing and passes; `npm run typecheck` checks both. **The build/boot gate is authoritative, not optional.** `npm run typecheck` and `npx vitest run` run against `src/` and do **not** compile Wasp's generated SDK (`.wasp/out/sdk/wasp`), so they can be fully green while `npx wasp build` fails — e.g. an operation whose return type is a TS `interface` (instead of a `type` alias) fails the SuperJSON `Payload` index-signature constraint only at SDK build. The client build (`npx vite build`, which the image's web stage runs) type-checks `src/`, tests included, before it bundles, so a type error in a test fails the image build. Before finishing a branch on hq, a clean **`npx wasp build`** (or **`npx wasp start`** booting to `Server listening on port 4101`) is required — the agent runs it (backgrounded + watched + stopped), never the user. Wasp snapshots source into `.wasp/out` at generation, so re-running `tsc` inside `.wasp/out` tests stale code — only a fresh regenerate is valid.
- **host**, **console** — plain Node servers built with esbuild; `npm run typecheck` needs `core` built (`core/dist`) and nothing generated. `host`'s container tier needs Docker; it is not run in CI.
- **console-web** — a React app built with Vite; `npm run typecheck` checks the app and `tsconfig.node.json` (its Vite config); its tests run in jsdom.
- **relay** — a plain Node server built with esbuild, its PDF viewer page bundled beside it; `npm run typecheck` needs `core` built (`core/dist`) and nothing generated. Its tests run the relay against fakes of the sites and of hq.
- **ui** — `npm run typecheck` and `npm test` (Vitest in jsdom, `ui/vitest.config.ts`), which needs its React peers linked from `hq` as CI does; no build of its own. `@agenthix/ui/files` (the file frame and its renderers) has its own tests; components without tests of their own are still tested through their consumers (`hq`, `console-web`).

## Deviations

### Missing standard scripts

Remove rows from this table once the scripts are added.

| Module | Missing scripts | Direct command used instead |
|---|---|---|
| ui | `build` | none: the package is consumed as source and has nothing to build |
- **ui** — `npm run typecheck` and `npm test` (Vitest in jsdom, `ui/vitest.config.ts`), which needs its React peers linked from `hq` as CI does; no build of its own. `@agenthix/ui/files` (the file frame and its renderers) has its own tests; components without tests of their own are still tested through their consumers (`hq`, `console-web`).

### Coverage instrumentation

`@vitest/coverage-v8` is installed for `hq`. It is not yet installed for `site`, `host`, `console` or `console-web`; until then, their readiness records code coverage `unavailable`.

### End-to-end infrastructure

`hq` has a full Playwright e2e harness — 14 specs as of this writing, most of them mutating (login, task deletion, session privacy, workspace access, project boards, workforce confirmation, onboarding, chat streaming, execution-site registry, mobile pairing, among others) — see `hq/e2e/README.md`. This deviation entry previously described the harness as "a read-only canary"; that was accurate only for its very first spec and is stale now. `site` has no e2e surface at all (see End-to-end, above) — not a gap to close, since all browser-facing UI is hq's.

### Test orchestration

No root command runs every module in one step. CI (`.github/workflows/checks.yml`, on each pull request and each push to `main` or a release branch, running only the jobs the change reaches, `scripts/affected.mjs`) runs core's typecheck, unit tests and build, ui's typecheck, hq's typecheck (the guide's too), unit tests and integration tests, site's typecheck, unit tests and integration tests, host's typecheck, unit tests and build, and console's and console-web's typecheck, unit tests and build; it runs neither host's container tier, the e2e suite nor the cross-app tier. The release build (`.github/workflows/release-build.yml`, started by hand for a commit of `main` and by each push to a patch's release branch) runs the image start tests, the install test and the guide's screenshots, and the same steps run locally as the release rehearsal (`scripts/release/prove.sh`). The scripts' own tests run with `node --test` over `scripts/__tests__/` and `scripts/release/__tests__/`; the release build runs the second. Locally, the cross-app tier runs with `npm run test:cross-app` from the repo root, and per-module typecheck/build/test run module by module.

## Test data

**Integration level.** Per **ADR-0035**, integration tests run against a dedicated test database on each module's existing dev Postgres, selected by database *name* — no new port, no second env file. `hq` runs its integration files four at a time, each worker on its own database (`agenthix_w1_test` … `agenthix_w4_test`) on its dev Postgres (`:4109`); `site` uses `agenthix_site_test` on its own dev Postgres (`:4209`). Each module's own `scripts/test/with-test-db.mjs` derives the test `DATABASE_URL` by swapping only the database name, and refuses any target whose name does not end in `_test`; every test starts from an empty database (hq empties it with `DELETE`s in dependency order, site truncates). hq's run takes only the database URL and the secrets key from `.env.server`, so dev-only settings do not change results. Run with `npm run test:integration` from the module directory. The fixed-port, refuse-if-busy policy that the separate cross-app tier uses instead is described under Cross-app tier, above — it is a different mechanism serving a different tier, not a substitute for this one.

**Bring-up.** The dev Postgres instances are the `hq-db` (container `agenthix-dev-hq-db`, `127.0.0.1:4109`) and `site-db` (container `agenthix-dev-site-db`, `127.0.0.1:4209`) services in the repo-root `docker-compose.yml`, creds `agenthix:agenthix` for both — start what's needed with `docker compose up -d hq-db site-db`. Each module's `with-test-db.mjs` self-provisions its own test database on first run — creates it if missing, then applies migrations with `prisma migrate deploy` — so no manual `CREATE DATABASE` step is required. The underlying volumes persist, so once created a test database survives restarts. A regression pass self-starts both Postgres containers this way before the integration and e2e checks; only if that fails does it record the skip.

**End-to-end level.**

- All test-created emails use the reserved `@agenthix.test` domain (e.g. `e2e+hq@agenthix.test`).
- Accounts and data come from `hq/e2e/fixtures/seed-e2e-users.mjs` and `seed-e2e-data.mjs`; specs sign in through `hq/e2e/fixtures/auth.ts`, and `cleanup-e2e-data.mjs` removes what the seeds created. Inputs that must be unique per run carry a timestamp (`Date.now()`).

## Scenario test citation

**Scenario ids are unique across every file under `docs/qa/scenarios/`**, because a test cites a scenario by its id alone and the grep below reads the whole tree at once. The next free id for all of them is the `next-sc` in `scenarios/hq.md`; the same holds for story ids across every file under `docs/qa/stories/`, and the `next-us` in `stories/hq.md`.

A test declares which scenario it covers with an `@SC-NNN` tag in its `describe` title — one describe per scenario, multiple tags if it covers several. Where one describe mixes scenarios, the tag goes on each `it` title instead. This is the **only** link between a test and a scenario: it lives on the test (volatile), never on the scenarios contract (stable), which keeps the contract churn-free.

```
describe('deleteTaskSession @SC-074', () => { ... })       // unit / integration (Vitest)
test.describe('delete session @SC-074', () => { ... })     // e2e (Playwright — also a filterable tag)
```

Scenario coverage is then **derived, not hand-mapped**:

```
grep -rhoE '@SC-[0-9]+' core/src hq/src hq/scripts hq/e2e site/src host/src console/src console-web/src relay/src relay/viewer ui/src tests/cross-app scripts | sort -u    # scenarios with a citing test
# gaps = scenarios in the contract with no citing test
```

A citation to a non-existent `SC-NNN` is a broken reference (the audit flags it). When code coverage is enabled (`@vitest/coverage-v8`), it cross-checks that a citing test actually executes the scenario's source.
