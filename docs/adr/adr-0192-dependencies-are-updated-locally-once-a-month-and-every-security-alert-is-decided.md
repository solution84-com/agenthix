---
created: 2026-11-15
description: The monthly dependency updates are made and tested on the dev machine, not by a GitHub workflow; the repository records the month they were made and says when they are due; Release's stage 0 is the only enforcement. Every security alert gets a decision, a critical or high one in shipped code within 7 days. The full regression runs every check CI makes that can run locally. Supersedes ADR-0191, carrying its rules.
---

# ADR-0192: Dependencies Are Updated Locally Once a Month, and Every Security Alert Is Decided

**Date:** 2026-11-15
**Status:** Accepted

## Context

Under ADR-0191 the updates were made by a GitHub workflow that Release started when a month had passed: it pushed a
branch, waited for Checks, moved `main` by itself and started Release again. Whether the updates worked was found out
on GitHub, each answer a 15–50 minute round trip, and its first run failed on a setting only the workflow had. Every
change that went through the full regression on the dev machine first passed on GitHub first time. Security alerts,
on since the same day, listed 66 open alerts with nothing saying who decides them or by when.

## Options considered

- **Keep the GitHub workflow (ADR-0191's mechanism).** It can only be tested by running it on GitHub, and it chained
  steps nobody watched. Rejected.
- **A Checks job that fails when the month or an alert is overdue.** A failing Checks on `main` only stops Release,
  which Release can do itself, and it would fail contributors' pull requests for something not theirs. Rejected.
- **An outside reminder** (a scheduled issue, a calendar entry). Nobody looks at them. Rejected.
- **Made and tested locally, the reminder in the repository, Release the only enforcement (chosen).**

## Decision

1. **Everything stays pinned**: npm packages by their lockfiles, images by digest, actions by commit.
2. **The monthly dependency updates are made and tested on the dev machine**, minor and patch only, on a branch of
   their own: the update script, then the full regression with the upgrade test, then one push; Checks confirms and
   the owner merges. No workflow makes them.
3. **The repository records the month they were made** and says when they are due: from the 1st of a month not done
   at every dev start and at the top of a regression, overdue from the 8th, by one clock (Australia/Sydney).
   **Release's stage 0 is the only enforcement**: it stops, starting nothing, while the month is not done.
4. **Every package stays within what everything else requires of it**: ranges in `package.json`, only the lockfile
   moving; peer dependencies checked everywhere; one version of TypeScript, esbuild and Prisma; the Node types on
   Node's major; exact versions only where an outside tool needs them. A check in Checks holds these rules.
5. **A major version is taken by hand**, on purpose, everywhere at once, as its own change proved by a dry run.
6. **Every security alert gets a decision**: fixed; dismissed in GitHub with a reason; or deferred to a named month,
   recorded in the repository. A critical or high alert in shipped code is decided within 7 days of its opening, and
   Release stops after that; any other in the next monthly dependency updates. Reminders come from the alert's
   opening, in the same places as the month's.
7. **The full regression runs every check CI makes that can run locally**, so GitHub confirms and is never where a
   failure is found. A workflow calls scripts; what only GitHub can do has its scripts' tests run locally instead.

## Consequences

### Positive

- An update is tested in minutes on the dev machine, then confirmed once on GitHub.
- Nobody has to remember the month or the alerts: the dev start and the regressions say so, and Release will not go
  out without them.
- An alert decided once stays decided; a deferred one comes back in its month.

### Negative

- The updates wait for someone to run them; a month nobody runs them, Release waits.
- The full regression takes longer, most of all when the upgrade test runs.
- The reminders and Release read the alerts with a GitHub login or token; without one, the reminder is silent and
  Release stops.

## References

Supersedes ADR-0191 (its step and Release starting it; its other decisions carried here as 1, 4, 5 and the security
alerts). ADR-0146 (a release is a proven build given a name), ADR-0190 (a release is started by one workflow). How it
works: [`docs/architecture/dependencies.md`](../architecture/dependencies.md).
