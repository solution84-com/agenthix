---
name: releasing
description: Use when cutting, proving, tagging or patching a release of Agenthix — the release branch every release is prepared and cut on, the Release workflow and its dry run, the release rehearsal, the release build, the tag that publishes, a patch, a failed release or publish, the merge back into main, and which lines are maintained. Maintainers only.
---

# Releasing

**Every release, major, minor or patch, is prepared and cut on its own branch, `release/v<version>`, then merged into
`main`** ([ADR-0194](../../../docs/adr/adr-0194-every-release-is-prepared-and-cut-on-its-own-release-branch.md)). The cut
is one run of the *Release* workflow (`.github/workflows/release.yml`,
[ADR-0190](../../../docs/adr/adr-0190-a-release-is-started-by-one-workflow.md)) on that branch. Nothing is built at the
tag, and no commit sets a version: every `package.json` stays at `0.0.0`
([ADR-0146](../../../docs/adr/adr-0146-a-release-is-a-proven-build-given-a-name.md)).

## The one path

1. **Cut the branch.** A major or minor from `main`: what `main` holds then is the release (`release/v0.2.0`). A patch
   from the tag it fixes, so nothing new rides along (`release/v0.2.1` from `v0.2.0`).
2. **Prepare it there**: the blockers, the QA audit (below) and their fixes, and nothing else. The branch takes fixes
   only, from the maintainers; `main` never flows into it. An alpha or a release candidate is cut on its final
   version's branch: `0.1.0-rc.1`, then `0.1.0`, both on `release/v0.1.0`.
   - **`main` stays open.** Pull requests always target `main` and wait for the next release. A fix merged to `main`
     meanwhile that this release also needs may be copied onto the branch with `git cherry-pick -x`; it is optional
     and rare.
   - **Pushing the branch only saves progress and runs *Checks*.** It starts no release build; releasing is only by
     hand. There is no ruleset for `release/**`: only maintainers can push, and until the cut its history may be
     cleaned and force-pushed with `--force-with-lease`. **Never after its tag.**
3. **Date the changelog**, as the branch's last commit before the cut: the release's heading in `CHANGELOG.md` takes
   the day it publishes (`## [0.2.0] - 2026-12-01`), and an empty `## [Unreleased]` goes above it for the next one. If
   the cut moves to another day, the date moves with it.
4. **Cut it**: run *Release* on the branch, with the version, once *Checks* passed on its tip (below).
5. **Merge it into `main`** after it publishes, with a merge commit, the way a unit's merge is made, so `main`'s ruleset
   applies; the merge commit has no tag. Where `main` has rewritten the code a fix touches, port the fix by hand
   instead. **Then delete the branch**, locally and on GitHub.

## The Release workflow

Start it from the repository's **Actions** tab, the VS Code task *[release] Release*, or:

```sh
gh workflow run release.yml --ref release/v0.2.0 -f version=0.2.0
```

One run goes at a time. Each stage is a job; the first that fails stops the run, and its last job names it:

0. **The monthly dependency updates and the security alerts.** It stops, starting nothing, when this month's updates
   aren't done (`scripts/deps/due.mjs`, the month in `scripts/deps/taken.json`, Australia/Sydney time) or a critical or
   high security alert in shipped code is past its 7 days with no decision (`scripts/deps/security.mjs`). **A major or
   minor is always checked**; only a patch version (`x.y.z` with `z` above 0, or its pre-release) on a release branch,
   and a dry run, skip it. The release makes no dependency updates: they are made on the dev machine and merged into
   `main` before the branch is cut ([dependencies.md](../../../docs/architecture/dependencies.md#the-monthly-dependency-updates)).
   - Stopped on the month: do the monthly updates, merge them into `main`, cherry-pick them onto the branch, and run
     again.
   - Stopped on an alert: fix it, dismiss it in GitHub with a reason, or defer it to a named month in
     `scripts/deps/deferred.json`, then run again (`node scripts/deps/security.mjs --triage` lists them). It also stops
     when the alerts can't be read.
1. **The commit and the version**: a real run is on `release/v<major.minor.patch>` of the version given, never `main`;
   the commit is the branch's tip and *Checks* passed for it; the version is new; no
   flag released in an earlier minor release is still listed ([feature flags](../../../docs/architecture/feature-flags.md));
   the Sigstore trust root hq carries is no older than 300 days (`npm run sigstore:refresh` in `hq/`, committed first).
   **No unmarked or misplaced break:** every breaking change since the previous tag (`scripts/release/breaks.mjs`) is a
   commit marked `type(area)!` with a `BREAKING CHANGE:` footer saying what an installation must do, and the version
   moves the line (a minor under `0.x`, a major from `1.0.0`); the release notes open with them.
2. **The guide's screenshots are captured** for that commit.
3. **They are pinned to the tag** (`npm run guide:pin`, [the guide's README](../../../docs/guide/README.md#releasing-the-screenshots)).
   When that changes the pages, the workflow commits the edit (`docs(guide): pin the screenshots to v<version>`) and
   pushes it to the branch with the pin's deploy key, which starts *Checks* for it; that commit is the one proved and
   tagged.
4. **The release build** (`release-build.yml`): every image part with a new key built for amd64 and arm64, started and
   attested; the install test; core packed.
5. **The tag**, on the branch's last commit, once *Checks* passed for it; then *Publish release* at the tag, which
   verifies each image's attestation and recomputed key, signs each version's index, publishes core and makes the
   release page with the screenshots linked to the tag.

**A dry run** does everything but push, tag and publish, on any pushed branch: the VS Code task *[release] Dry run
(this branch)*, or `gh workflow run release.yml --ref <branch> -f version=<version> -f dry_run=true`. It doesn't wait
for *Checks*. A pin commit it makes goes only to a ref of the run's own, deleted at its end.

**The release rehearsal is an optional local dry run** for the dev machine's architecture:
`RELEASE_VERSION=<version> scripts/release/prove.sh`. The full regression runs with it (`testing-a-change`), and before
a release the upgrade test (`scripts/upgrade-test/run.sh`) runs from the previous release to the candidate's images.

## When it fails

- **Before the tag**: fix it on the release branch, push, and run *Release* again. The fix reaches `main` with the
  merge back. A change to a workflow, or a script only a workflow runs, is proved by a run there, since the dev machine
  cannot prove it; a dry run proves it without pinning.
- **After the tag was created**: the admin deletes the tag and whatever that attempt published (images, the core
  package, the release page), the fix is made as above, and *Release* runs for the same version. A publish that failed
  for a passing reason (a registry outage) is retried without a new tag:
  `gh workflow run publish-images.yml --ref v<version>`.
- **A version that published is never published again**, even when it turns out not to work: its fix takes the next
  number (`1.0.2` after `1.0.1`), on a patch branch from the published tag.

## What holds for every release

- **A patch holds fixes only**, and any code behind a flag that is off in production; it never moves a flag forward,
  which only a minor or major does ([ADR-0172](../../../docs/adr/adr-0172-a-flag-has-a-stage.md)). From `v0.1.0`, a
  patch carries no database migration.
- **Release candidates and alphas are optional** (`1.0.1-rc.1`, then `rc.2`), with nothing but fixes between them, on
  the same branch. `0.1.0` has no release candidate.
- **Tags are permanent.** A ruleset stops `v*` tags being moved or deleted; the admin's bypass is for a publish that
  failed part-way. A tag pushed by hand still publishes, but a release is not made that way.
- **The pin's deploy key**, `RELEASE_PIN_DEPLOY_KEY` in the `release-pin` environment, which only `main` and
  `release/*` may use, may bypass `main`'s ruleset (GitHub allows no workflow token as a bypass actor). Revoking it is
  deleting the deploy key.
- **At most two lines are maintained**: the newest minor of the current major and of the one before. Before `1.0.0`,
  only the newest release ([versioning.md](../../../docs/architecture/versioning.md#the-product-version)).
- **A QA audit is required before a release**, `0.1.0` the first; a pre-release (`-alpha.N`, `-rc.N`) needs none.
