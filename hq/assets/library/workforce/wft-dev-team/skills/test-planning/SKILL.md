---
name: Test Planning
description: Write test plans covering happy path, edge cases, and regression
---

# Test Planning

Every feature change needs a test plan before QA sign-off.

## Test plan structure
1. **Happy path** — what should work when everything is correct
2. **Edge cases** — boundary values, empty inputs, maximum values
3. **Regression** — previously broken areas that could regress
4. **Negative cases** — invalid inputs, missing permissions, network errors

## For each test case
- Preconditions: what state the system must be in
- Steps: exact actions to take
- Expected result: what success looks like

## Sign-off criteria
- All happy path cases pass
- No P1/P2 bugs open
- Regression suite passes
