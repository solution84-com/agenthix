---
created: 2026-10-24
description: How the release cycle is built — the version taken out of the build first, then content keys and the release build with promotion beside checks for what changed, then the records and documents, and last the unit's own release cut through the new flow — six phases, carried out as lanes off one branch.
---

# Implementation Plan · Release cycle

## Goal

Build what the [spec](spec.md) describes: each image built once per content and reused until its code changes, the
version given at publish, checks for what a change reaches, a release rehearsed on the dev machine before CI proves it
once, and a release that is a tag, with a release branch only for a patch.

**In scope:** the spec's Rules 1–8, the decision records and documents it lists, the QA contract for what changed, and
one release cut through the new flow on this unit's branch (below).

**Out of scope:** layer caching between CI builds, a host service that reads the release record, and GitHub's artifact
attestations (spec, *Not in this unit*, with their reasons); reinstalling the maintainers' own installed copies, done by
hand when the unit lands (an alpha install is reinstalled, not upgraded across this change).

## Approach

**The version comes out of the build first.** Every later saving depends on an image being the same image at any
commit whose code it carries, and that is false while the version is written into `package.json`, the labels and
three bundles. So phase 1 removes it and gives each container its version from outside: hq and the Fleet Console from
the environment the host service writes into their compose projects, the host service from the reference it was
started by, which it verifies against that version's signature (spec, Rule 1). The host service's switch to a new
version of itself changes with it, since it checks the new image's version label today. After phase 1, nothing yet
reuses an image, but nothing stops it.

**Then two independent tracks.** Content keys and the release build (phases 2 and 3) touch the Dockerfiles, the image
scripts and the release workflows; checks for what changed (phase 4) touches `checks.yml` and a new selection script.
They share no files, so phase 4 runs beside phases 2 and 3. Phase 3 needs phase 2's keys, so it follows it.

**One list of image parts.** `scripts/images/parts.json` replaces the three lists that name the parts today; the
release workflow, the start test and the install test read it, and a test holds it to the Dockerfiles' `COPY` lines.
The key is computed from Git alone, so it costs nothing to ask and the dev machine and CI compute the same key for the
same commit.

**The release build is one definition, run in two places.** `scripts/release/prove.sh` and the scripts it calls are
what both the release rehearsal and `release-build.yml` run, so a rehearsal that passes on the dev machine is the same
proof CI repeats on both architectures. `publish-images.yml` keeps its path and its tag form, because every install
trusts that file at that tag; it stops building and promotes what the release build pushed, after checking each
image's attestation and recomputing its key at the tagged commit.

**Documents last, from what was built.** The new decision record, the amendment to ADR-0117 and the rewritten
documents describe the code as it stands after phases 1–4, so they are written once those have merged.

**This unit cuts its own release on its branch — an exception the owner made on 2026-10-24.** The unit exists to
change the release flow, so the flow is proved by using it, before the unit merges: the full regression and the
release rehearsal on the dev machine, the branch pushed and the CI release build started on its last commit, then the
tag on that commit and the publish. The unit then merges to `main` with `--no-ff`, which puts the tagged commit in
`main`'s history: the same shape a patch branch has under Rule 5. Its version is the next pre-release,
`0.1.0-alpha.3` by default; the owner confirms it, and gives the say-so for every push, before the tag is pushed.
Outside this unit, a release stays its own work, cut from `main` after a unit closes.

**Lanes, merged by the lead.** Phases 1–5 run as lanes (`running-lanes`): one purpose, one branch and worktree, one
agent each, merged into `feature/release-cycle` by the lead one at a time, each squashed into one commit, rebased first
and fast-forwarded. Phase 1 is two lanes in sequence (the version out of the images and bundles, then the host
service's own version and its switch). Phases 2 and 4 then start together; phase 3 starts when phase 2 has merged.
The lead runs what lanes may not: anything that builds or starts images (the start test, the install test, the host
container tests, the release rehearsal), the integration and cross-app suites, hq's browser tests, and every GitHub
setting, push and workflow run. Phase 6 is the lead's, by hand. The full regression runs once, in phase 6, before the
release.

**Models.** Opus for the host service's own version and its switch (1.5–1.7) and for the tag's proof of origin
(3.6–3.7), which decide what an install trusts. Sonnet for the rest. Each brief names its model.

**Resources.** The dev machine has 24 GB of memory and 10 cores, and runs an installed copy the host container tests
must not touch.

- *Contended:* memory and CPU (typechecks, tests, Wasp builds), Docker and its disk (every image build), the shared
  test databases, and the image scripts, which phases 2 and 3 both touch.
- *One at a time:* anything that builds or starts images, run only by the lead. Lanes run the unit tests of what they
  changed and the typecheck of the modules they touched. At most **two lanes at once**, never two editing the same
  file.
- *Watched:* free memory, swap and load sampled every 30 seconds into the unit's scratch folder, and free disk before
  every image build. Warning at free memory under 4 GB, load over 16, or free disk under 20 GB; critical at free
  memory under 2 GB or memory pressure critical. An alert at each, and again on recovery.
- *At a limit:* at a warning no new lane starts and no image build begins; at critical the Sonnet lane pauses first.
  At low disk, `docker builder prune` on the build cache before anything is stopped.
- *GitHub's runners:* each push and workflow run costs minutes, so the branch is pushed once, in phase 6, unless a
  phase 3 workflow needs a run to be proved earlier, which the lead asks the owner for first.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0069 (images built with only Docker), ADR-0118 (the host service replaces itself through a launcher), ADR-0136 (protocol versions; peers one major apart talk), ADR-0145 (an installation's published ports): all Accepted |
| **Implements** | A new record, *a release is a proven build given a name* (task 5.1); the amendment to ADR-0117 (task 5.2) |
| **Revisits** | ADR-0137 (a release is cut on its own release branch): superseded by the new record. ADR-0117 (a host service runs only signed, published images): amended in place, its decision unchanged |

## Key decisions

| Decision | Why |
|---|---|
| The version out of the build is phase 1, alone | Every reuse depends on it, and it changes what a host service trusts; it is proved before anything builds on it |
| The host service's own version comes from its start reference, verified by that version's signature | The guide's `docker run` already names the version; an environment variable would make a person write it twice, and a forgotten one would leave a published host service in development mode |
| Against: rebuild the host image at the tag with its version | It is small, but then the tag builds again, and what is published is not what the rehearsal and the release build proved |
| One parts list, held to the Dockerfiles by a test | Against deriving the list from the Dockerfiles at run time: a parsed `COPY` misses intent (the guide folder the console reads), and a test that fails is reviewable where a parser's guess is not |
| `publish-images.yml` keeps its path and tag form | Every install trusts that file at that tag; moving it would need every install's trust changed |
| cosign attestations for proof of origin | GitHub's artifact attestations need GitHub Enterprise Cloud while the repository is private |
| Phase 4 beside phases 2–3 | They share no files; running them in sequence would cost a phase of waiting for nothing |
| This unit's release is cut on its branch (owner, 2026-10-24) | The unit changes the release flow, so the flow is proved by using it before the unit merges; merging with `--no-ff` afterwards gives the shape of a patch branch |
| Against: close the unit, then release from `main` | The flow would first run for real after the unit had merged, so a fault in it would be fixed outside the unit that made it |
| No layer cache between CI builds | Reuse by key removes most rebuilds; a cache is a later saving if hq's own build remains the cost |

## Work breakdown

Six phases. The seam after phase 1 is what every later phase builds on; phases 2–3 and 4 are independent of each other;
phase 5 describes what 1–4 built; phase 6 proves it by releasing.

### Phase 1 — The version out of the build
**Delivers:** an image built at any commit carries no version or commit; hq, the Fleet Console and the host service
report the version they were given, and a host service started from a version's tag trusts and reports that version.
**Starts when:** —
**Execution plan:** none — lanes (two in sequence: 1.1–1.4, then 1.5–1.8)

- [x] 1.1 Every `package.json` and lock file at `0.0.0`; `scripts/check-versions.mjs`, *Checks*' `versions` job and every workflow step that calls it removed
- [x] 1.2 The Dockerfiles take no `VERSION` or `COMMIT` argument and write no version or revision label; hq's `APP_VERSION` and `APP_COMMIT` are no longer set in its image
- [x] 1.3 The Fleet Console reads `CONSOLE_VERSION` at run time; `console/scripts/build.mjs` no longer replaces it
- [x] 1.4 The image start test drops its version check, and the core package is given its version when it is packed
- [x] 1.5 `host/scripts/build.mjs` no longer replaces `HOST_SERVICE_VERSION`; the host service takes its version from the image reference it was started by, and checks its own image's signature for that version before it serves
- [x] 1.6 The host service writes the version into the environment of each compose service that reports one (hq's server, the Fleet Console)
- [x] 1.7 The host service's switch starts its successor by `<image>:<to>@<digest>` and drops its version-label checks
- [x] 1.8 The publish workflow checks an image's version on its index annotation instead of its label
- [x] 1.9 Every container the host service starts carries the version as a label
- [x] 1.10 `agenthix status` says, for each part, the release its image was first built for
- [x] 1.11 A development build switches to another local image (no signature, no version order), and the launcher's container test runs the whole switch and the put-back again

### Phase 2 — Image parts and content keys
**Delivers:** one list of image parts, a content key per part computed from Git, every base image pinned, and local
image tests that build only parts whose key changed.
**Starts when:** phase 1 has merged (the labels it removes would otherwise change every key).
**Execution plan:** none — lanes

- [x] 2.1 `scripts/images/parts.json`; `start-test-all.sh` and `install-test/run.sh` read it, their own lists removed
- [x] 2.2 `scripts/images/keys.mjs` prints each part's content key for a commit
- [x] 2.3 A test fails when a Dockerfile copies a path outside its part's inputs; the host's workflow test holds the parts list to `PUBLISHED_PARTS`
- [x] 2.4 Every `FROM` pinned by digest, and Dependabot's `docker` ecosystem configured to move them
- [x] 2.5 The rebuild epoch, and a monthly scheduled workflow that opens a pull request moving it
- [x] 2.6 Each image labelled with its key; the local start test rebuilds only parts whose key differs, and the install test uses the start test's images instead of building its own

### Phase 3 — The release build and promotion
**Delivers:** the release rehearsal on the dev machine and the CI release build, running the same scripts, reusing
attested images by key; a tag that builds nothing and promotes what was proved, with its release record.
**Starts when:** phase 2 has merged.
**Execution plan:** none — lanes (3.1–3.5, then 3.6–3.8, the second on Opus)

- [x] 3.1 `scripts/release/prove.sh`: keys, build what is missing, start test, install test, screenshots, for the dev machine's architecture
- [x] 3.2 `release-build.yml` started by hand on a commit and by a push to `release/**`: per part and architecture, reuse `build-<key>-<arch>` when present and attested, otherwise build, start, push by digest and tag
- [x] 3.3 The release build attests each image it pushes (`cosign attest`, keyless) and leaves the candidate record
- [x] 3.4 The install test and the guide's screenshots run inside the release build, the install test from the candidate's images
- [x] 3.5 `release-branch-build.yml` removed, and every workflow and gate that named it changed
- [x] 3.6 `publish-images.yml` refuses unless *Checks* and the release build passed for the tagged commit, verifies each attestation and recomputes its key, then makes, annotates, signs and checks each part's index over the candidate digests
- [x] 3.7 The release record attached to the release page, and the registry cleanup of `build-…` images no record names, after 90 days
- [x] 3.8 A tag ruleset protecting `v*`, with the admin's bypass (already in place: *Release tags never move or vanish*)

### Phase 4 — Checks for what changed
**Delivers:** *Checks* runs the jobs a change reaches, says why, cannot pass with a selected job skipped, and does not
prove a tree twice; a unit's close can run the same selection locally.
**Starts when:** phase 1 has merged (it removes the `versions` job).
**Execution plan:** none — lanes

- [x] 4.1 `scripts/affected.mjs`: the dependency map from `package.json` `file:` links, the selection for a base, and a reason per job, with its tests
- [x] 4.2 *Checks*' `changes` job selects the jobs from it and writes the reasons to the run's summary
- [x] 4.3 *All checks passed* fails when a selected job did not succeed or a job not selected was not skipped
- [x] 4.4 A tree that already passed *All checks passed* on another commit selects nothing

### Phase 5 — Records and documents
**Delivers:** the decision records, documents and QA contract describe the release cycle as built.
**Starts when:** phases 1–4 have merged.
**Execution plan:** none — lanes

- [x] 5.1 The new decision record, *a release is a proven build given a name*; ADR-0137 marked superseded
- [x] 5.2 ADR-0117 amended: a published index carries the version, its signature names that version's tag, and the host service gives each container its version
- [x] 5.3 `docs/architecture/versioning.md`: the product version, an image's content key, where the rule is enforced
- [x] 5.4 `AGENTS.md`: the release steps under *Git* and *When to run the tests*
- [x] 5.5 `docs/architecture/deployment.md` and `docs/architecture/host-management.md`: how a release publishes, and how the host service learns its version
- [x] 5.6 The QA stories and scenarios for what changed, the tests that cover them tagged, and the host scenarios that name the old flow updated

### Phase 6 — The unit's release, through the new flow
**Delivers:** a published pre-release cut by the new flow, and its cost measured against today's.
**Starts when:** phases 1–5 have merged.
**Execution plan:** none — by hand (the lead, with the owner's say-so for each push and the tag)

- [x] 6.1 The full regression on the dev machine, then the release rehearsal on the branch's last commit, timed
- [ ] 6.2 *Checks* and the CI release build on that commit, their runner-minutes and image builds recorded
- [ ] 6.3 The tag (`v0.1.0-alpha.3` by default) on that commit, its publish timed, and an installation made from the published images through the real signature check; the release page says an earlier alpha is reinstalled, not upgraded
- [ ] 6.4 The measured figures recorded against T1–T7 in the spec's terms, in this plan's closing note

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | The two lanes run at the same time instead of in sequence, and task 1.8 moved to the first lane (1.1–1.4 and 1.8, then 1.5–1.7) | They share no file once `host/docker/Dockerfile` is the first lane's and `host/` the second's, so waiting bought nothing; 1.8 edits the publish workflow, which the first lane already owns |
| 1 | Tasks 1.9 and 1.10 added: a container label with the version, and "unchanged since" in `agenthix status` (owner, 2026-10-24); spec Rule 1 amended | With no version inside an image, the owner wanted each part's version visible where people look, and when it last changed, without a version per component |
| 1 | Task 1.11 added: a development build may switch to another local image (owner, 2026-10-24); spec Rule 1 amended | Lane 1b found the full switch could no longer be run on a dev machine, since a local build is `dev` and the launcher refused it; the owner chose to let a development build skip what only a published version has |
