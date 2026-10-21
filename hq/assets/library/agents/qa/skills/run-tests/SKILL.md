---
name: Run Tests
description: Execute the Vitest test suite, interpret the results, and report on health and regressions.
---

# Run Tests

Use this skill to execute the test suite and interpret the results. Use it in your standing job and before any QA verdict.

## Setup

Use plain `git` in the project repo; the credential helper signs you in, so there is no tool to call first. Check out the branch you are verifying (or `develop` for a suite health check):

```bash
git checkout develop && git pull origin develop
```

## Run the Suite

```bash
npm test
```

This runs `vitest run` — a single pass, no watch mode.

## Interpret the Output

**All passing:** Record the count. No action needed unless this is a regression baseline.

**Failures present:** For each failing test record:
- The test file and describe/it names
- The error message (exact text — do not paraphrase)
- The assertion that failed (expected vs received)

## Classify Failures

| Type | Description | Severity |
|------|-------------|----------|
| **Regression** | A test that was passing before this PR now fails | Blocking |
| **New test failure** | A test added in this PR fails | Blocking |
| **Pre-existing** | Failure exists on `develop` too | Note only |
| **Flaky** | Fails on retry but passes sometimes | Flag for investigation |

To check if a failure is pre-existing: stash your changes, run `npm test` on `develop`, compare.

```bash
git stash
npm test
git stash pop
```

## Report Format

```
Test Suite Result — {branch or context}
Date: {date}

Summary: {N} passed, {N} failed, {N} skipped

Failures:
1. {test file}: {describe} > {it}
   Error: {exact error message}
   Type: Regression | New | Pre-existing | Flaky
   
{Repeat for each failure}

Pre-existing failures (on develop): {N}
New failures introduced by this change: {N}
```

## Rules

- Always record the exact error text — do not summarise it
- Distinguish between new failures and pre-existing ones — new failures are what matter
- Do not diagnose the cause unless it is obvious from the error — that is the developer's job
- A suite with 0 tests is not healthy — flag if the test count drops significantly
