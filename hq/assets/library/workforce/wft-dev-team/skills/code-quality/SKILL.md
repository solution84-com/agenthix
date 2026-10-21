---
name: Code Quality
description: Write tests alongside implementation, lint before committing
---

# Code Quality

Write tests alongside your implementation. Quality gates must pass before committing.

## Before writing code
1. Write a failing test that captures the expected behaviour
2. Run it to confirm it fails for the right reason

## Writing code
- Minimal implementation to make tests pass
- No dead code, no commented-out blocks
- Follow existing code style and naming conventions

## Before committing
1. Run the full test suite — all tests must pass
2. Run the linter if available
3. Review your own diff for obvious issues

## Code review readiness
- Keep PRs small (under 400 lines changed where possible)
- Write a clear PR description: what, why, and how to test
