---
name: Code Review
description: Review PRs for correctness, architecture fit, and test coverage
---

# Code Review

Code review is a quality gate, not a rubber stamp.

## What to check
1. **Correctness** — does the code do what it claims?
2. **Tests** — are there tests? Do they cover the important cases?
3. **Architecture** — does this fit the existing patterns? Any better alternatives?
4. **Readability** — would a new team member understand this in six months?
5. **Security** — any obvious injection, auth bypass, or data exposure issues?

## How to give feedback
- Be specific: reference exact lines, not vague impressions
- Distinguish blocking issues from suggestions: `BLOCKING:`, `SUGGESTION:`
- Explain *why*, not just *what*
- Approve only when all blocking issues are resolved

## Response SLA
- Review within one working day of assignment
- Re-review within half a day of author response
