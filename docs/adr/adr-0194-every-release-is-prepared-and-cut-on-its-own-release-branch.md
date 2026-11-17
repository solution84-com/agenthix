---
created: 2026-11-17
description: Every release, major, minor or patch, is prepared and cut on its own branch, release/<version>, then merged into main with a merge commit; the tag lands on the branch's last commit. A major or minor is cut from main, a patch from the tag it fixes. main stays open, pull requests always target main, and a push to a release branch only saves progress and runs Checks. Supersedes ADR-0146 item 5 (a release branch only for a patch).
---

# ADR-0194: Every Release Is Prepared and Cut on Its Own Release Branch

**Date:** 2026-11-17
**Status:** Accepted

## Context

ADR-0146 made a release a tag on a commit of `main` and kept a release branch for a patch only, because a release
branch per release (ADR-0137) had written the version into the code, so every image was rebuilt and proved again for
it. That cost is gone: no version is built in, and an image is built once per content key and reused. What stayed is
the cost of cutting on `main`: the preparation (the blockers, the QA audit, their fixes) merges into `main` first, and
nothing else may merge until the tag is made, because Release refuses a branch that moved. Contributors' pull requests
then wait on a release.

## Options considered

- **Cut on `main`, with a freeze (ADR-0146, today's).** One branch, but `main` is closed from the preparation's merge
  to the tag, and a fix found during preparation reaches `main` before it is proved. Rejected.
- **A branch per release (chosen).** `main` never freezes, and what is proved, pinned and tagged is exactly the branch
  that was prepared. A fix on `main` the open release also needs is copied by hand, and the merge back can conflict
  after the tag; both are rare when preparation takes hours or days.

## Decision

1. **Every release, major, minor or patch, is prepared and cut on `release/<version>`** (`release/v0.2.0`). A major
   or minor branch is cut from `main`; a patch branch from the tag it fixes, so it carries nothing new. An alpha or a
   release candidate is a step towards its final version and is cut on that version's branch (`0.1.0-rc.1` on
   `release/v0.1.0`).
2. **The preparation happens on the branch**: the blockers, the QA audit and their fixes. A release branch takes
   fixes only, from the maintainers; `main` never flows into it.
3. **The Release workflow runs on the branch.** The pin commit and the tag land on the branch's last commit, never on
   `main`.
4. **After it publishes, the branch merges into `main` with a merge commit**, made the way a unit's merge is, so
   `main`'s ruleset applies; the merge commit has no tag. Where `main` has rewritten the code a fix touches, the fix
   is ported by hand. Once merged, the branch is deleted.
5. **`main` stays open.** Contributors' pull requests always target `main` and ship in the next release cut from it.
   A fix merged to `main` that the open release also needs is cherry-picked onto the branch (`git cherry-pick -x`);
   that is optional and rare.
6. **A push to a release branch only saves progress and runs Checks.** It starts no release build; releasing is only
   by hand. There is no ruleset for `release/**`: only maintainers can push, and a branch's history may be cleaned and
   force-pushed (`--force-with-lease`) until the cut, never after its tag.

## What this binds

- Release's dependency and security gate skips only a patch version (`x.y.z` with `z` above 0, or a pre-release of
  one) on a release branch, and a dry run; a major or minor is checked wherever it is cut.
- Only a release build started by hand, or called by Release, from `main` or a release branch proves a commit for a
  tag; a push proves nothing.
- Release refuses a real run anywhere but `release/v<major.minor.patch>` of the version it was given; a dry run may
  run on any branch. The pin commit therefore never goes to `main`, so `main` no longer needs the pin deploy key's
  bypass of its ruleset once the `release-pin` environment stops admitting `main`.
- ADR-0146's other items stand: the version is the tag's, an image is built once per content key, the tag builds
  nothing, and at most two lines are maintained. ADR-0190 stands, with its "on `main` (or a patch's release branch)"
  read as "on its release branch".

## Consequences

### Positive

- One path for every release, from a one-line patch to `1.0.0`.
- `main` never freezes, and contributors are never asked to wait.
- What is proved is what ships: the pin commit and the tag sit on the branch that was prepared and tested.

### Negative

- A release's fixes reach `main` only at the merge back.
- A fix made on `main` during preparation is copied onto the branch by hand.

### Risks

- The merge back can conflict when `main` has moved a lot. It is resolved after the tag, so the release itself is
  unaffected.

## References

ADR-0146 (superseded in part: item 5), ADR-0190, ADR-0137.

> **Acted on.** *(annotated 2026-11-17)* By the unit of work
> [`2026-11-17-v0.1.0-release`](../work/2026-11-17-v0.1.0-release/plan.md): `v0.1.0` was prepared, tagged and
> published on `release/v0.1.0`, a push to it ran only *Checks*, and a dry run of *Release* came first. The branch
> merged into `main` straight after the publish, before the installations were upgraded and the unit closed, so its
> close took a branch of its own. The releasing skill now merges a release branch last, after both.
