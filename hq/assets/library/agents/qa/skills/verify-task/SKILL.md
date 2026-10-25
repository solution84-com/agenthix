---
name: Verify Task
description: Verify a completed task against its acceptance criteria and produce a QA report.
---

# Verify Task

Use this skill for each task in `in_review`. Produce a clear verdict: Pass, Conditional Pass, or Fail.

## Step 1: Read the Task

Read the full task description:
- **Objective** — what was supposed to be built
- **Success Criteria** — how to know it is done correctly
- **Output** — what artifact or result was expected

Also read the developer's final comment — it should include the PR URL and a summary of what was done.

## Step 2: Read the Code

The repository connected to your workspace is already there. Your container holds no GitHub token, so a plain `git fetch` fails: bring in the PR branch by running the `pull` workflow with `run_workflow`, `name: pull`, `parameters: { branch: "{branch-name}" }`. Then check it out:

```bash
git checkout {branch-name}
```

If `pull` is missing, waiting or off, say so and ask a person who administers the place; never fetch by other means, and never look for a token.

Read every file mentioned in the task description. Also check `main.wasp.ts` and `schema.prisma` if the task touches routes, operations, or the database.

## Step 3: Run the Tests

```bash
npm test
```

Record the result: number of tests, pass/fail counts, any errors.

## Step 4: Check the Implementation

For each success criterion, answer: does the code satisfy this? Check:

**Wasp-specific checks:**
- `main.wasp.ts` has the correct declaration (route, page, action, query, or api)
- Import paths are exact — Wasp is case-sensitive
- Client and server code are on the correct side of the boundary
- If `schema.prisma` changed: is there a corresponding migration in `migrations/`?

**Code correctness checks:**
- Auth guard present in every action and query (`if (!context.user) throw new HttpError(401)`)
- Business logic is in a service file, not directly in the action/query handler
- No hardcoded IDs, paths, or credentials
- Error cases are handled (what happens if a DB call returns null?)

**Test coverage check:**
- Are there tests for the new or modified service functions?
- Do the tests cover at least one failure/edge case, not just the happy path?

## Step 5: Write the QA Report

```markdown
# QA Report — {Task Title}

**Date:** {date}
**Branch:** {branch-name}
**Verdict:** Pass | Conditional Pass | Fail

## Test Suite
{npm test result: N passed, N failed}

## Criteria Verification

| Criterion | Result | Notes |
|-----------|--------|-------|
| {criterion 1} | Pass / Fail | {specific detail} |
| {criterion 2} | Pass / Fail | {specific detail} |

## Issues Found
{List each issue: file, line if applicable, description, severity: Minor/Major/Blocking}

## Summary
{One paragraph verdict.}
```

## Step 6: Report

1. Attach the report with `attach_file`
2. Move the task:
   - **Pass** → `approved`
   - **Conditional Pass** → leave in `in_review`, comment with the minor issues
   - **Fail** → `in_progress`, comment with the blocking issues so the developer can act immediately

## Rules

- Verify against the success criteria as written; do not invent your own
- A passing test suite does not automatically mean Pass — verify the criteria manually
- If success criteria are untestable or missing, flag that as a separate issue — do not fail the task for a spec problem
- Conditional Pass is for issues that do not break the feature (typos, missing test coverage, minor inconsistencies)
- Blocking issues that prevent the feature from working correctly always mean Fail
