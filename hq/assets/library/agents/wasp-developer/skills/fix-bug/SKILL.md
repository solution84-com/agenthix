---
name: Fix Bug
description: Investigate a bug report, locate the root cause in the codebase, and apply a minimal fix.
---

# Fix Bug

Use this skill when a task describes a bug to fix rather than a feature to implement.

## Step 1: Reproduce the Problem

Read the bug report in the task. Understand:
- What is the expected behaviour?
- What is the actual behaviour?
- What are the steps to trigger it?

Do not start reading code until you can state the expected vs actual behaviour in one sentence each.

## Step 2: Locate the Root Cause

Start from the error message or the symptom, not from a guess.

**For server errors:** trace from the action/query handler → service → Prisma call. Look for:
- Missing null check on a result that can be null
- Wrong Prisma relation queried (missing `include`)
- `HttpError` thrown with wrong code
- Missing `await` on an async call

**For Wasp build errors:** check `main.wasp.ts` first:
- Is the operation declared?
- Is the `entities` list correct?
- Is the import path exactly right (case-sensitive)?

**For client errors:** check the component consuming the query/action:
- Is `isLoading` handled before accessing `data`?
- Is the error state surfaced to the user?
- Is the hook called conditionally (React rules of hooks violation)?

**For migration errors:** check `schema.prisma` against the `migrations/` directory:
- Is there a pending schema change with no corresponding migration?
- Run: `./scripts/dev/db.sh migrate`

## Step 3: Write a Failing Test (if practical)

Before fixing, write a Vitest test that reproduces the bug. This confirms you found the right root cause and prevents regression.

Use your `write-tests` skill.

## Step 4: Apply the Minimal Fix

Fix the root cause — not the symptom. Do not refactor surrounding code or address unrelated issues. If you see other problems, note them in a task comment but do not fix them in this branch.

## Step 5: Verify

Run the test you wrote (it should now pass) and the full test suite:

```bash
npm test
```

If the full suite passes: commit and follow the PR process in `git-workflow`.

## Rules

- Fix the root cause, not the symptom
- Do not expand scope — one bug per branch
- If the root cause is unclear after 20 minutes of investigation: comment on the task with your findings and ask for help
- Never mark a task done if you are not confident the bug is fixed
