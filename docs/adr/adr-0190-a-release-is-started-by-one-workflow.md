---
created: 2026-11-14
description: A release is started by one workflow, Release, given the version; it checks the commit, captures and pins the guide's screenshots, runs the release build, tags the commit and publishes. Nobody pushes the tag by hand, and a failed release is fixed on a branch proved by a dry run of the same workflow. Supersedes, in part, ADR-0146 (the tag pushed by hand).
---

# ADR-0190: A Release Is Started by One Workflow

**Date:** 2026-11-14
**Status:** Accepted

## Context

Under ADR-0146 a release took several hand steps in order: download a capture of the guide's screenshots, run the pin
step and commit its edit on `main`, start the release build for that commit, wait for it, then tag the commit and
push the tag, which published. Each step could be done on the wrong commit or skipped, and the checks a release
depends on were spread across the steps. A push to `main` also ran nothing of the release, which was right and should
stay so.

## Options considered

- **Keep the hand steps (ADR-0146).** Each is simple, but the order and the commit are the maintainer's to get right
  every time. Rejected.
- **Release on every push to `main`.** Rejected: most pushes are not releases, and a release is a decision.
- **One workflow started by hand with the version, doing every step (chosen).**

## Decision

1. **A release is one run of the Release workflow**, started by hand on `main` (or a patch's release branch) with the
   version. It checks the commit is its branch's tip with Checks passed, the version is new, and no released flag is
   overdue; captures the guide's screenshots and pins them to the tag, committing and pushing the edit when there is
   one; runs the release build for that commit; then tags the commit and publishes. A stage that fails stops the run
   and is named on its page.
2. **The tag is no longer pushed by hand.** The workflow creates it, and starts the publishing workflow at the tag, so
   the signer a host service checks is unchanged (ADR-0117). A tag pushed by hand still publishes.
3. **A failed release is fixed on a branch** and proved there by a dry run of Release, which does everything but push,
   tag and publish; the fix then lands on `main` as one commit, and Release runs again.
4. **A push to `main` runs Checks only.**

## What this binds

- The workflow pushes the pin commit to `main`, so `main`'s rules let GitHub Actions bypass them; any workflow with
  write access to the repository's contents could then push to `main`, so a job is given that access only where it
  must write.
- The publishing workflow stays a workflow of its own, started at the tag, never called from Release: called, its
  signature would name Release's branch.

## Consequences

### Positive

- One button, one version and one place to read what happened; the commit proved is the commit tagged.

### Negative

- The guide's screenshots are captured twice in a release, once to pin and once in the release build.

## References

ADR-0146 (superseded in part: its tag pushed by hand), ADR-0117, ADR-0172.
