---
created: 2026-10-05
description: hq measured before phase 2 of the workspace tidy, what phase 2 is expected to change, and — filled in when it closes — what it actually changed.
---

# Measures · hq before and after phase 2

Phase 2 upgrades hq to Wasp 0.25, moves it into feature folders (adr-0093) and changes how it is tested
(adr-0094). This page holds it to numbers: what hq measured before, what the phase is expected to reach, and
what it actually reached, measured the same way when the phase closes.

- **Before** was measured on 2026-10-05, at `main` `96900cae`.
- **Expected** is the target. Where it says *aim*, it is an estimate, and missing it is reported, not hidden.
- **After** is filled in when phase 2 closes, counted the same way, with the commit it was measured at.

## How it is measured

Every number comes from the files under `hq/`, counted by the rules below, except the suite times, which come
from one run of the hq unit suite on one worker (`VITEST_MAX_WORKERS=1`) with Vitest's JSON reporter: wall time
from the run's start to the last file's end, and time running tests as the sum of each file's own time. After is
counted by the same rules.

Counting rules: every `.ts`/`.tsx` file under `hq/src`; a test is a `*.test.ts(x)` file, an integration test a
`*.integration.test.ts` file, everything else is source; lines are newlines plus one. A mock-call assertion is
`toHaveBeenCalled…`, `toHaveBeenNthCalledWith`, `toHaveBeenLastCalledWith` or `toBeCalled…`; a file is *mostly
mock-call assertions* when they are over half its assertions.

## Platform

| Measure | Before | Expected | After |
|---|---|---|---|
| Wasp version | 0.21.1 | 0.25 | 0.25.0 |
| Node in hq's images | 22.12 | 24 | 24.14.1 |
| Declaration format | the `main.wasp` language | Wasp's TypeScript format | Wasp's TypeScript format |

## Layout

| Measure | Before | Expected | After |
|---|---|---|---|
| Declaration files | 1 | a short root file and one per feature, about 20 | 22: the root and 21 features |
| Lines in the largest declaration file | 1,719 | under 400 — *aim* | 89 |
| Files in `src/pages/` | 108 | each page moved to its feature's folder; what stays is shared | 0 — the folder is gone |
| Source files over 300 / 500 lines | 23 / 1 | — / 0 | 24 / 1 — **missed** |

## Tests

| Measure | Before | Expected | After |
|---|---|---|---|
| Source files / lines | 513 / 52,081 | about the same — the phase moves code, it does not rewrite it | 554 / 54,122 |
| Test files / lines | 424 / 59,232 | fewer lines | 382 / 49,998 |
| Test lines per source line | 1.14 | below 1.0 — *aim* | 0.92 |
| Test files over 300 / 500 lines | 36 / 8 | each over 300 split or with its reason / 0 | 8, each with its reason / 0 |
| Largest test file | 1,160 lines | under 500 | 388 lines |
| Integration test files | 39 | more: every feature's data operations | 209 |
| Mock-call assertions | 2,350 of 7,915 (29.7%) | under 10% — *aim* | 671 of 7,354 (9.1%) |
| Test files mostly mock-call assertions | 73 | 0 | 17 — **missed** |
| Test files mocking one of the five widely used modules (dashboard notifier, site read store, `TaskRunner`, activity, dispatch) | 192 (45, 55, 30, 28, 34) | 0 — one shared fake each | 0 — every one uses the shared fake |
| Unit tests | 4,247 | no behaviour loses its test | 1,465, beside 2,950 integration tests (322 before) |
| Unit suite, wall time on one worker | 72.7 s | under 40 s — *aim* | 26.7 s |
| Of which running tests | 10.0 s | — | 6.4 s |
| When suites run | not written down | written in `AGENTS.md`: related tests while working, every suite before a merge | written in `AGENTS.md` |

## After — measured at

Measured on 2026-10-05 at `chore/hq-structure` `b4dac9a0`, by the same rules.

- **Source files over 500 lines: 1, missed.** It is `projects/actions.ts` (507 lines), the same file as before; the
  phase moved files and did not split any. Source grew by about 2,000 lines, mostly the shared fakes and test
  helpers under `src/test/`, which these rules count as source.
- **Test files mostly mock-call assertions: 17, missed.** In each, the call is the behaviour under test — the
  dashboard notifier was told, a site event was forwarded, GitHub or a site was not reached — so adr-0094 keeps
  them; they now check calls on the shared fakes or on the boundary to a site or service.
- **Unit tests: 4,247 to 1,465.** Most of the rest became integration tests (322 to 2,950); a unit test was
  deleted only once a test that checks a result covered the same behaviour.
- **The integration suite**, not measured before the phase: about 45 s before, about 25 s after, with nine times
  the tests — its files now run four at a time, each on its own database.
- **Defects the new tests found** were raised as four issues (one more widened an existing one); each is pinned by a
  test marked as expected to fail.
