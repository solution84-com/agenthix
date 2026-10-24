---
created: 2026-10-21
description: A release is its own work, on a branch release/<version> cut from main, where the version is set and everything a release does except publish is proved; the tag goes on that branch and only publishes what it proved, and the branch then merges back into main.
---

# ADR-0137: A Release Is Cut on Its Own Release Branch

**Date:** 2026-10-21
**Status:** Superseded by adr-0146

## Context

Units of work merge to `main` as they finish, and not every one of them leaves `main` ready to ship. The platform
publishes six images, a package and an install that brings them together, and much of what can go wrong with them
shows only once they are built and started. The first two pre-releases were tagged on `main` and published a host
service image that could not start: its bundle refused to load, and nothing had ever started it before it reached
the registry.

A release therefore needs a place where the version is set and the whole release bar is proved, without holding up
the units still merging to `main`.

The first cut on a release branch then showed that a bar the tag adds to is not enough: its images were published
while its guide screenshots, taken only at the tag, failed there. The tag still did work of its own that the branch
never proved: it built the arm64 images, captured the screenshots and built the core package it published.

## Options considered

- **Tag whatever `main` holds.** No extra branch, but a release then ships whatever state the last unit left, and
  the bar is proved, if at all, on a moving target. This is how the first two pre-releases went wrong. Rejected.
- **Freeze `main` before a release.** Proves the bar on `main` itself, but stops every unit from merging until the
  release is out. Rejected.
- **A long-lived release line beside `main`.** Two lines to keep in step for ever, and fixes made on one forgotten on
  the other. Rejected.
- **A short-lived branch per release (chosen).** Cut from `main` when a release is due, it holds only the version
  and the fixes the bar needs, and goes back into `main` once tagged.

## Decision

1. Units merge to `main` as they finish; none merges into a release branch.
2. When a release is due, `release/<version>` is cut from `main`. **The version is set there and nowhere else**, in
   every `package.json` and lock file.
3. **The branch proves everything a release does except publish.** Every push to it runs, in CI, *Checks*, the
   install test, the guide's screenshots and the release's own build: every image for amd64 and arm64, built and
   started exactly as the tag builds them, and the core package built, checked and packed exactly as the tag
   publishes it. One definition of that build serves both the branch and the tag, so they cannot drift. All but
   *Checks* run on release branches only; `main` and pull requests get the typecheck, unit and integration suites.
   The full regression is not run again on the branch: it ran on a developer's machine before each unit merged, and
   the branch adds only the version.
4. Only fixes for what the bar finds go on it. Anything larger becomes an issue or a unit of its own.
5. **The tag goes on the release's merge commit.** When the work is ready, the release branch is merged into `main`
   locally with `--no-ff`, and that merge commit is pushed to the release branch (it contains the branch's head, so
   the branch moves forward to it), where the bar proves it. **The tag goes on that commit** once the bar passes, so
   every release is one merge commit on `main` with its release work beneath it. **The tag only publishes**: the same build, then
   the images pushed, signed and checked and the core package published, and the screenshots the branch captured for
   that commit. It refuses unless every part of the bar passed for the tagged commit on its release branch.
6. **If anything fails after the tag is pushed**, the tag and whatever that attempt published are deleted, the fix
   goes on the same release branch, and the same version is tagged again on the fixed commit. A new version number
   is only for a change to something released.
7. Once published, `main` fast-forwards to the tagged merge commit, and the branch is deleted. If `main` moved while the
   release was being proved, the release branch is merged with `main` again and proved again before the tag. One
   release branch is open at a time.

## What this binds

- Every push to `release/**` runs *Checks*, the install test, the guide's screenshots and the release build, which
  is the one definition of what a release builds; `main` and pull requests get *Checks* alone. The release workflow
  publishes only a tag whose commit passed all four on its release branch, and whose version every module carries.
- Nothing a tag does is proved for the first time at the tag: it builds what the branch built, and publishes the
  screenshots the branch captured. A failure after the tag is fixed under the same version, never by a new one.
- Between releases `main` carries the last release's version; no unit of work changes it.
- The images' signer is the release workflow at the tag (adr-0117), not a branch, so where the tag sits changes
  nothing an install trusts.
- Undoing this means going back to tagging `main`, which is cheap to do and is what this record rejects.

## Consequences

### Positive

- A release is proved on exactly what it ships, while units keep merging to `main`.
- An image that cannot start on either architecture, an install that does not work, a screenshot that cannot be
  taken or a core package that does not pack is found before the tag.
- A version number stands for one released thing: a failed attempt leaves no gap in the numbers.

### Negative

- Each release is a branch, a merge back and a regression of its own.
- Every push to a release branch builds all six images on both architectures, and the tag builds them again.
- A failed attempt has to be cleaned up by hand: its tag, and any image, package or screenshot folder it published.

### Risks

- A fix made on a release branch reaches `main` only when it merges back; a release branch left open lets the two
  drift. One branch open at a time, merged back as soon as it is tagged, keeps that short.

## Implementation notes

First followed for `v0.1.0-alpha.1` (2026-10-21). That release's first tag published while its guide screenshots had never run on the release branch; it was withdrawn and tagged again under the same version, and the rule gained what the release branch now proves (`release-build.yml` for both architectures, the install test, the screenshots) and the tag's gate. `v0.1.0-alpha.1` is tagged on its branch's last commit; from the next release the tag goes on the release's merge commit, proved on the release branch.

## References

- adr-0117, the signed images a host service runs.
- adr-0136, the protocol versions that are independent of the release version.
- How a release publishes its images: [`docs/architecture/deployment.md`](../architecture/deployment.md).
