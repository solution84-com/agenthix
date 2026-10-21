---
name: Explore Feature
description: Manually trace the logic of a feature to verify correctness beyond what tests cover.
---

# Explore Feature

Use this skill when `run-tests` passes but you want to verify the feature logic directly — or when the task has no tests and requires manual verification.

## Step 1: Understand the Feature Boundary

From the task description, identify:
- Entry point: which page, action, query, or API endpoint is involved?
- Data flow: what does the user/caller provide, what does the system return?
- Side effects: what does it write to the database, emit to sockets, or write to disk?

## Step 2: Trace the Server Path

Starting from `main.wasp.ts`, find the operation or route declaration. Then follow the code:

```
main.wasp.ts declaration
  → src/<module>/actions.ts or queries.ts  (auth check, arg validation)
    → src/<module>/<module>Service.ts       (business logic)
      → prisma.<model>.<method>()           (database)
```

At each step, check:
- Is the auth guard in place? (`if (!context.user) throw new HttpError(401)`)
- Are inputs validated before they reach the database?
- Can a null/undefined propagate to a point where it causes a runtime error?
- Does the returned data match what the client expects?

## Step 3: Trace the Client Path

Find the page or component that consumes this operation:
- Does it handle `isLoading` before accessing `data`?
- Is the error state shown to the user if the operation fails?
- Are there any conditional hook calls that violate React's rules?

## Step 4: Check Edge Cases

Based on the feature, test these scenarios mentally (or via the actual running app if available):

| Scenario | What should happen | What actually happens (from code) |
|----------|--------------------|----------------------------------|
| Empty result from DB | | |
| Input is null or missing | | |
| User is not authenticated | Should get 401 | |
| Concurrent calls | | |

## Step 5: Document Findings

Write up what you found for inclusion in the QA report:
- For each scenario: Pass, Fail, or Not Verified (with reason)
- For each code path that is correct: one-line confirmation
- For each issue: file, line, description, severity

## Rules

- Do not run the application to test — read and trace the code only
- Do not suggest fixes — describe the problem precisely and let the developer fix it
- If a code path is genuinely unverifiable by reading alone, say so — do not guess
