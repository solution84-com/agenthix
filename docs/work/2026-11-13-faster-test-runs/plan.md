---
name: Faster test runs — plan
description: The phases of the faster test runs unit — main's e2e passing, CI's hq jobs sharded, the local regression run in parallel groups, all measured.
created: 2026-11-13
---

# Faster test runs — plan

## Goal

A full CI run in 12 minutes or less and a local full regression in 25 minutes or less, each with the same coverage
as today and every suite passing on `main` ([README](README.md)).

## What the 12 Nov combined regression taught

Memory and Your space ran the slow suites once over both units (main `efd74947`), as two groups at the same time,
without the lanes' lock.

- **The lock and one worker were the slowness for unit and integration.** Run plainly, every module passed in one pass.
- **Docker group** (in order): image start tests 532 s (7 of 8 images rebuilt, their content had changed), install
  36 s, site container 318 s, host container 126 s.
- **Fixed-port group** (one after another, about 25 min): cross-app 343 s and 363 s with every flag on; e2e 253 s and
  235 s; dev servers started and the organisation reseeded between them. Cross-app queues because every run truncates
  the same test databases; e2e because it runs against the one dev stack and its seeded flags.
- **Docker contention:** the site container suite ran beside cross-app and both used Docker.
- **Seven e2e tests fail on `main`**, alone too, left behind by the message-kinds and design-system units:
  `skillReview.spec.ts:24`, `assetPage.spec.ts:122` and `knowledge.spec.ts:176` (messages are `role="status"` now);
  `librarySettings.spec.ts:52` (the Admins-only gate is a Nudge); `assetPage.spec.ts:35` (`older-version` test id
  gone); `librarySettings.spec.ts:29` (`on-by-default-warning` gone, now the shared dialog); `library.spec.ts:193`
  (the row menu is drawn outside the card).
- **Flaky under load:** `conversationPhotos.spec.ts:40` (the chip's name is empty) failed in both full runs and passed
  5 of 5 alone; `assetPage.spec.ts:24` failed once in a full run.
- **Pitfalls:** `SECRETS_MASTER_KEY` set only where needed; a run with every flag on leaves the dev organisation's
  flags on until it is reseeded; without `E2E_FILES_FOLDER` the two file specs skip silently, which reads as a pass;
  about 10 minutes went on rerunning failures one by one.

## Approach

**On `chore/faster-test-runs` from `main` (`efd74947`)**, after the two units whose close-outs it learned from had
merged and been pushed.

**CI is proved last.** The local runner lands first and proves the branch on the dev machine; only then is the branch
pushed for CI's measurement, so each push is spent on a branch that already passes and CI is the final check of
everything the unit changed.

**Close-out mode is proved by the lead only**, after the runner's lane has merged and nothing else runs on the
machine; lanes prove it in shared mode or with fixtures.

**Lanes, file-disjoint**: Phase 1 (e2e specs, hq's `e2e/`) and Phase 2 (local runner and
ports, `scripts/` and the test configs) build in parallel. Phase 3's lane (CI, `.github/` and `scripts/affected.mjs`)
may build alongside them, since it shares no file, but is measured only after Phase 2's run has passed. Phase 4 is the
lead's. Lanes run only the tests of what they touch; the e2e lane runs the specs it fixes, alone. Sonnet for Phases 1
and 3; Opus for Phase 2, since giving each run its own databases and stack touches how hq, a site and the relay are booted and find each other.

**Proving CI needs pushes**, each with the owner's go-ahead: one for the first measurement, at most one more for
tuning. The repository is private, so a full run costs about 65 billed runner-minutes today and about 100 after.

## Work breakdown

### Phase 1 — e2e passes on `main`

- [x] 1.1 The seven specs follow today's screens: `status` instead of `alert`, the Admins-only Nudge, the shared
      confirm dialog, a locator on the read-only text instead of `older-version`, the row menu found where it is drawn.
- [x] 1.2 `conversationPhotos.spec.ts:40`: find why the chip's name is empty under load; fix the spec's wait or the
      screen's, whichever is wrong.
- [x] 1.3 A missing `E2E_FILES_FOLDER` (and any seed variable a spec cannot run without in the full regression) fails
      the run instead of skipping silently.

### Phase 2 — A committed regression runner, with the slow suites in parallel

- [x] 2.1 **The runner** under `scripts/` replaces each unit's copied `regression.sh`: a log per step, a summary with
      result, counts and duration, and the failures rerun alone automatically, so a flaky test is reported as such
      without hand reruns.
- [x] 2.2 **Two modes:** close-out (nothing else running: holds the machine's heavy lock for the whole run, groups in
      parallel within a memory budget) and shared (the lock per step, one worker). Built; shared mode proved, close-out
      is proved by 2.10.
- [x] 2.3 **Environment per step:** `SECRETS_MASTER_KEY` only where needed; after a run with every flag on, the dev
      organisation is reseeded to production's values.
- [x] 2.4 **Cross-app and e2e runs at the same time** instead of one after another (about 25 min down to about 7).
      Cross-app already boots on free ports (`tests/cross-app/harness/freePorts.ts`); what makes its runs queue is
      that every run truncates the same test databases, so `harness/runLock.ts` allows one at a time. Each run gets
      test databases of its own, removed after it, and the lock goes. The e2e suite runs against an already-running
      hq on the dev ports and the dev database, whose flags the seed sets; each e2e run gets a stack of its own (hq,
      a site and the relay on free ports, its own databases, seeded for its flag setting). Built and proved run by run
      (a cross-app run alone 119 s, from 343 s); runs overlapping are proved by 2.10.
- [ ] ~~2.5~~ **Not done (see Deviations).** Where the seed allows, one booted stack serves both flag settings** (reseed instead of reboot). Measure
      before keeping it: if 3.4 makes the runs parallel, this may not be worth it.
- [x] 2.6 **Docker:** the container suites start after cross-app has booted, or are capped, so they stop competing;
      image builds that already skip an unchanged content key are checked to build in parallel where the machine
      allows. The Docker group has a track of its own and its container suites start after cross-app's boot; whether
      image builds run in parallel is measured in 2.10.
- [x] 2.7 **The runner protects the machine in every mode:** before each step it reads free memory and swap and
      holds while free memory is under 25% or swap is growing; at most two groups at once by default, with Vitest's
      workers split between them; close-out mode refuses to start while another heavy run is on the machine (the
      machine's heavy lock is waited for and held; another test runner's processes or a Wasp compile outside it refuse
      it); below 10% free memory mid-run it stops its own processes, says which steps did not run and exits with a
      failure. Built and tested with injected readings; proved under load by 2.10. A proving run in close-out mode on 13 Nov,
      beside an installation in Docker, left 9% of 24 GB free and 13 GB of swap in use.
- [x] 2.8 The `testing-a-change` skill points at the runner.
- [x] 2.9 **Use the machine fully while holding the lock, and adapt:** other work queues behind the run, so it
      finishes as fast as it safely can. Work is ordered longest first (hq integration starts at once); a live budget
      from the current load and free memory decides when the next step starts — more while there is headroom, none
      while load is above the cores or memory near its floor — instead of a fixed number of groups; a step started
      late gets the slots others have freed. The first close-out run (13 Nov) overloaded the processors (load 30) for
      five minutes and then left 6 of 10 cores idle for twenty while hq integration ran alone; memory never fell
      below 34% free. Each step is weighed by the processors it was measured using; a one-slot step still starts up to
      one and a half times the processor count.
- [x] 2.10 **The close-out run, by the lead:** the full regression in close-out mode on the unit's branch with nothing
      else on the machine — the groups overlapping within the memory budget, every suite passing, each group timed,
      the machine watched throughout. It proves 2.2, 2.4, 2.6, 2.7 and 2.9; the first run (before 2.9) is kept as a measurement.
      Passed 13 Nov: every one of 36 steps in 25.3 min (48 min before), free memory never under 33%, on a database
      server of the run's own; hq integration 4 min with eight workers (14 min alone on the development server).
- [x] 2.11 **The run's own database server:** a throwaway PostgreSQL container, set up for tests, started for the run
      and removed after it; every suite's test databases go to it instead of the development server, which slowed the
      suites beside each other (cross-app 20 min beside hq integration, 5 min after it).

### Phase 3 — CI: hq's two jobs split across runners

3.2–3.5 are merged and their script tests pass; the manual run (3.6) passed on 13 Nov.

- [ ] ~~3.1~~ **Not done (see Deviations).** hq's typecheck becomes its own job.
- [x] 3.2 hq's unit tests as a matrix of 2 halves (`vitest run --shard=N/2`), both Vitest projects split; the typecheck,
      the guide's typecheck and the hq-web address step run in the first half only.
- [x] 3.3 hq's integration tests as a matrix of 6 shards, each with its own Postgres service.
- [x] 3.4 Setup cache: npm's download cache and what `npx wasp install` fetches; the compile's output only if it can be
      keyed safely on hq's sources.
- [x] 3.5 *All checks passed* treats each matrix as one job, tested in `checks-verdict.test.mjs`; the job names stay
      as they are, so `affected.mjs` is unchanged.
- [x] 3.6 Measure on a manual run of the unit's branch, after 2.10 has passed; tune shard counts against the slowest shard.
      13 Nov: 13.1 min on the first run (35 before), the parts 6.5 to 12.5 min; 10.5 min with npm's cache warm, every
      job passing. The owner kept six parts: 13 min is enough.

### Phase 4 — Measure and close

- [x] 4.1 The last full local run in close-out mode, on the unit's branch with the CI changes merged: every suite
      passes.
- [x] 4.2 The final CI timings on the manual run.
- [x] 4.3 Before and after, in the report; the load-sensitive tests still open (agenthix#23, #151, #246, #149, #150)
      fixed if they block the target, otherwise left as they are.

## Not in this unit

- **`proposeSkill.models.ts` ignores `MODEL_CHECK_ONLY`** and its grader counted a read-only `ls` as writing a skill.
  A model check, not part of the regression: raised as its own issue.

## Open questions

Decided by the owner on 13 Nov, as recommended:

1. **Commit the runner under `scripts/`?** Recommended: yes; every close-out uses it.
2. **Put cross-app and the e2e suites in CI too?** Recommended: not in this unit; billed minutes on every push while
   the repository is private. Reconsider when it is public.
3. **Shard counts.** Recommended: start at 3 and 6 and let the measurement decide.

## Deviations

| Date | What changed | Why |
|---|---|---|
| 13 Nov | Phase order: the local runner before CI, CI proved last | Owner: prove the branch locally so each billed push is spent on a branch that passes |
| 13 Nov | 2.4 corrected: cross-app already used free ports; the queue was its shared test databases | Found in the harness |
| 13 Nov | 2.7 widened, and close-out mode is proved by the lead only | A lane's proving run left 9% of memory free; owner asked that it never happen again |
| 13 Nov | The heavy lock became one lock for the whole machine, shared by every repository, held whole by a parallel run, with one machine-wide watch | Owner; per-repository locks let two repositories' heavy runs overlap. The lock and the watch are the maintainers' lane tooling, kept outside this repository; the runner takes the same lock itself |
| 13 Nov | 2.5 not done | With each run on a stack of its own, sharing one would save about a minute, and reseeding between flag settings is what leaked flags before |
| 13 Nov | Fixes found on the way, in the unit: the picture sweep's date-dependent test and the folder it left a day; the Fleet Console's tests type-check (agenthix#245); the team template spec (agenthix#214); two e2e waits made load-proof (agenthix#149); a UI test's time limit on CI's runner. The Knowledge delete spec follows the screen's design (no message after a delete; the confirming step says where the page goes), and SC-1423 says so | Every suite must pass on `main` (objective 1) |
| 13 Nov | CI: hq's unit tests in 2 halves with the typecheck in the first, not 3 shards and a typecheck job of its own (3.1 dropped) | Owner chose the simpler option: about 11–12 min against 10–11, with today's job names and 7 fewer billed runner-minutes a run |
| 13 Nov | 2.11 added: the regression runs on a database server of its own | Owner; the shared development server was what the suites waited on |
| 13 Nov | In the cross-app suite, hq runs from its build instead of `wasp start` | Two `wasp start` in one checkout restart each other, so runs could not overlap |

## Closing note

**Closed 13 Nov, accepted by the owner.** Every objective verified by running it:

1. Every suite passes on the unit's branch: the full local regression, 36 of 36 steps (the last run's one flaky spec
   fixed and its suite run again, passing), and every CI job on a manual run.
2. A full CI run takes 10.5 to 13 minutes, from 35 (the owner accepted 13 as enough, six integration parts kept).
3. The local full regression takes 25 to 28 minutes with the end-to-end suites, from 48 without them.
4. The `testing-a-change` skill says how to run both; a unit's close-out runs `scripts/regression/run.mjs`.

**Open items closed in the unit:** test databases left behind by a killed run (the run's own server is removed with
it); the runner's `--help`; the testing skill brought up to date; the machine watch calling a swap rise critical while
a third of memory is free (in the maintainers' tooling); Spotlight indexing the run's logs (marked never indexed);
agenthix#214, #245, #149 and the guide glossary link, fixed here and closed when the branch is pushed.

**Deferred, each its own issue:** agenthix#262 (hq's typecheck does not cover the e2e specs), agenthix#263 (the
propose-skill model check ignores `MODEL_CHECK_ONLY`), agenthix#264 (the Docker steps start late when no image was
built last), the heavy lock's fairness (in the maintainers' tooling); and, already open, agenthix#246 (`hqMove` under
load) and agenthix#168 (chat streaming, seen once in the `chromium` project too). None is critical; none blocks a
release.

**QA:** SC-1252 (the cross-app run's own databases) and SC-1423 (deleting a Knowledge page) describe the code as it is;
no full QA audit ran, so the unit's entries wait for the audit before the release. **Decision records:** none
depended on, implemented or revisited; none created.

