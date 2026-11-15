---
created: 2026-11-15
description: Outside dependencies stay pinned and take their minor and patch updates in a step of our own, run as part of releasing at most once a month, proved by Checks before main moves, with the release that follows as their one image build; every package stays within what the others require of it; majors are taken by hand; Dependabot's security alerts are on and its version updates are not used.
---

# ADR-0191: Dependencies Are Updated by Our Own Step, as Part of Releasing

**Date:** 2026-11-15
**Status:** Superseded by adr-0192

## Context

Every npm package, base image and workflow action is pinned, so a release is what was tested (ADR-0146). A pin never
moves by itself, and none was moving: Dependabot's pull requests for images and actions were never merged, nothing
watched the npm packages, and the workflow meant to raise the rebuild epoch each month could not open its pull
request. The versions had drifted apart behind a switched-off peer-dependency check, which hid a real conflict. A
first round of updates, tried by hand, broke only where files that move together were moved apart.

## Options considered

- **Dependabot's version updates.** It proposes one package or group at a time, while ours move together and must be
  proved together; it rewrites ranges Wasp compares as text, does not move `.nvmrc` or the workflows' cosign version,
  and its pull requests never run the release's build. Rejected.
- **Our own step before every release.** Releases may come more often than monthly, and updates at each were noise.
  Rejected.
- **A Release dry run inside the step**, then the release. It builds every image twice, though a failed release
  build publishes nothing. Rejected.
- **Our own step, part of releasing, at most once a month, proved by Checks, the release its one build (chosen).**

## Decision

1. **Everything stays pinned**: npm packages by their lockfiles, images by digest, actions by commit.
2. **Updates are made by a step of our own** (*Take the updates*), minor and patch only. **Release starts it** when
   the last run is more than a month old (ADR-0190's one button), and the step starts Release again once the updates
   are on `main`. Nothing else lands them.
3. **The updates reach `main` only once Checks passed on them**, and the release that follows is their one image
   build: when it fails, nothing is tagged or published, and the fix is proved by a dry run like any other.
4. **Every package stays within what everything else requires of it**: ranges in `package.json`, only the lockfile
   moving; peer dependencies checked everywhere; one version of TypeScript, esbuild and Prisma; the Node types on
   Node's major; exact versions only where an outside tool needs them. A check in Checks holds these rules.
5. **A major version is taken by hand**, on purpose, everywhere at once, as its own change proved by a dry run.
6. **Dependabot's security alerts are on**, and one marked critical is fixed at once, as its own change.

## Consequences

### Positive

- Every release carries the month's fixes, the system packages' included, without anyone remembering a separate job.
- What moves together is moved and proved together, and a rule broken quietly fails Checks.

### Negative

- A release whose updates are due waits for Checks on them first.
- `main` may briefly hold an update the image build rejects, until its fix lands.
- Between releases, a security fix arrives only through an alert acted on by hand.

## References

ADR-0146 (a release is a proven build given a name), ADR-0190 (a release is started by one workflow). The rules and
the step: [`docs/architecture/dependencies.md`](../architecture/dependencies.md).
