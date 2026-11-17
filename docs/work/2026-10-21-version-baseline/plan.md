---
created: 2026-10-21
description: How the version baseline is built — the compatibility rule in core first, then every version reset to the baseline, the mobile app's and Cloud's versions added at 1.0, the shape snapshot and the documents that hold the rule, and the release that carries it — five phases, the first four as lanes off one branch, the last by hand.
---

# Implementation Plan · Version baseline

## Goal

Build what the [spec](spec.md) describes, and cut `v0.1.0-alpha.1` as the baseline every later version counts from.

**In scope:** the spec's sections from *The rule every connection follows* to *The release this unit cuts*, the core
package fix (already on the branch), the decision record, `docs/architecture/versioning.md`, the line in
`AGENTS.md`, and the QA contract for what changed.

**Out of scope:** the spec's *Out of scope*. Tagging, pushing, merging to `main`, publishing and resetting a database
are the owner's, each on their say-so.

## Approach

**The rule first, then the reset, then the snapshot.** The compatibility rule (two sides talk while their majors are
at most one apart) goes into core as one function every connection calls, so the reset in phase 2 and the new versions
in phase 3 are written against it. The snapshot comes after both, so the shapes it records are the 1.0 shapes; taken
earlier, it would record 17.13 and be rewritten at once.

**The reset deletes rather than converts.** Before the first release nothing is carried forward (AGENTS.md, *a clean
slate*): the 31 gates go with the code paths for older sites they guarded, the migrations are regenerated from the
current schemas rather than squashed by hand, and every database here is recreated. Whatever compares a format number
is checked to treat a number it does not know safely, since a browser may hold voice settings stored at 8.

**The new versions copy the existing handshake.** hq ↔ site already exchanges and records a version per connection;
the client API and Cloud's version follow the same shape (state, record, gate on the lower, refuse with the side that
must upgrade), in hq's HTTP and socket layers for the mobile app and in hq's Cloud client for Cloud.

**The snapshot is generated from the types the connections already declare.** A script in core emits, per
connection, the declarations of its message, operation and event types, and the list of the mobile app's operations and
events; a test compares that with the committed copy and classifies the difference by the spec's table. How the
declarations are read (the TypeScript compiler's own API is the likely route) is the lane's to settle; the table it
enforces is not.

**Lanes, merged by the lead.** Phases 1–4 run as lanes: one purpose, one branch and worktree, one
agent each, merged into `feature/version-baseline` by the lead, one at a time, rebased first. Phase 5 is the lead's,
by hand, since every step is the owner's to approve. The lead runs the suites lanes may not, and the full regression
once, before phase 5's tag.

**Models.** Opus for the compatibility rule (1.1), the client API (3.1–3.3) and Cloud's version (3.4), which decide who
may talk to whom; Sonnet for the gate removal, the format resets, the migrations and the documents. Each brief names its
model.

**Resources.** The machine has 24 GB of memory and 10 cores.

- *Contended:* memory and CPU (typechecks, test runs, Wasp builds), the shared test databases and fixed ports, Docker,
  and core's protocol files, which most lanes touch.
- *One at a time:* integration suites, the cross-app suite and anything with Docker run only by the lead. Lanes run the
  unit tests of what they changed and the typecheck of the modules they touched. At most **three lanes at once**, and
  never two that edit the same core file: phase 2's lanes are split by module for that reason.
- *Watched:* free memory, swap and load sampled every 30 seconds into `execution/resources.log`. Warning at free
  memory under 4 GB or load over 16; critical at free memory under 2 GB or memory pressure critical. An alert at each,
  and again on recovery.
- *At a limit:* at a warning no new lane starts; at critical the Sonnet lanes pause first, newest first.

**The owner's walkthrough** is the release itself: the install from the images in phase 5.

**Landing.** The branch is regrouped into a few commits and merged to `main` with `--no-ff`, on the owner's say-so.
The release is then cut on `release/0.1.0-alpha.1` from `main` (spec, *Releases are cut on a release branch*): the
tag goes on the release branch, which merges back into `main`.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0117 (signed published images), ADR-0134 (hq connects to Cloud): both Accepted |
| **Implements** | The new record this unit writes (4.3) |
| **Revisits** | ADR-0046, superseded by the new record at close |

## Key decisions

| Decision | Why |
|---|---|
| One major of overlap; two back refused and unsupported | The owner's rule (2026-10-21): a self-hoster or a phone updates in its own time, for one major |
| Deprecations name the version they stop working in | The owner's rule: the date something breaks is written where every developer sees it, and checked |
| Every connection restarts at 1.0, Cloud included | Nothing outside the team runs a release; Cloud's server is not built yet, and a version added later would itself be breaking |
| The rule is one function in core, called by every connection | Four connections with four copies of the rule is how ADR-0046's drift happened before |
| Migrations regenerated from the schema, not squashed by hand | The schema is the truth; regenerating cannot miss a migration's effect |
| The snapshot after the reset | Its first committed copy is the baseline's |
| Not a capability list instead of versions | The spec keeps `major.minor`: capabilities need negotiating per feature, which is what the 31 gates became |
| Not a version for the pages hq serves | hq serves them, so they always match |
| Names on a machine from the recorded namespace, one group per part | One install per machine; a group is a compose project, so separate lives get separate groups; agents never share the site's group, whose upgrade would remove them |
| Rename-ready by tier, not by a sweep | Wire and machine names are what break installs; text breaks nothing, so it stays (owner, 2026-10-21) |
| One naming pattern, renamed at the baseline | `<PARTY>_PROTOCOL_VERSION`, `X-<Party>-Protocol-Version`, `clientProtocolVersion`, `User-Agent`; no product name in an identifier; a rename after 1.0 would itself break (owner, 2026-10-21) |

## Work breakdown

Five phases. The seams: the rule must exist before anything is written against it; the reset must land before the new
versions start at 1.0 beside it; the snapshot must record the final shapes; the release carries all of it, and its
code fixes (4.6, 4.7) land with phase 4 so the tag goes on a `main` that needs nothing more.

### Phase 1 — The rule, and the shapes settled
**Delivers:** core's compatibility rule, used by hq ↔ site and the host relay; the shapes the spec names as known to
change, changed.
**Starts when:** —
**Execution plan:** none — lanes.

- [x] 1.0 The core package loads in plain Node and type-checks under NodeNext, checked before publishing
- [x] 1.1 One compatibility function in core (same major, one behind, two behind, ahead), with the refusal naming the side to upgrade
- [x] 1.2 hq ↔ site's handshake and the host relay's check call it
- [x] 1.3 The connections reviewed for changes already known to be coming, and those landed: Cloud's connection endpoints against the stand-in, half-finished work the gates show

### Phase 2 — The reset
**Delivers:** every version at its baseline.
**Starts when:** phase 1 has merged.
**Execution plan:** none — lanes.

- [x] 2.1 The site protocol: `PROTOCOL_VERSION` renamed `SITE_PROTOCOL_VERSION` at 1.0, the 31 gates and the code for older sites removed (core and hq; the site's side)
- [x] 2.2 The host protocol: `HOST_RELAY_PROTOCOL_VERSION` renamed `HOST_PROTOCOL_VERSION` at 1.0, its header `X-Host-Protocol-Version`; the site's header `X-HQ-Protocol-Version` renamed `X-Site-Protocol-Version` (2.1)
- [x] 2.3 Formats at 1: the agent package format, the board templates, the voice settings, each comparison safe for an unknown number
- [x] 2.4 One initial migration for hq and one for the site, generated from the schemas
- [x] 2.5 Every database here recreated from them, on the owner's say-so
- [x] 2.6 One product version: every `package.json` at one version (checked in Checks); the release run refuses a tag that does not match, and builds from the repository's version. The unit leaves it at `0.0.0` (no 0.x release yet); the release branch sets `0.1.0-alpha.1`
- [x] 2.7 Names on a machine: containers, volumes, networks and databases as the spec's table, every one from the recorded namespace, the site's labels and agent names included
- [x] 2.8 Groups: the host service and agent containers carry their own compose-project label; the launcher carries it over; erasing or uninstalling takes the agents' group down
- [x] 2.9 Rename-ready: neutral `host.env` settings and inter-part variables; the host service trusts a list of signers and image names; Cloud's and the guide's addresses one setting each
- [x] 2.10 The guide's install commands and `docs/architecture/deployment.md` give the new names

### Phase 3 — The mobile app's and Cloud's versions
**Delivers:** both new connections versioned at 1.0 under the rule.
**Starts when:** phase 2 has merged.
**Execution plan:** none — lanes.

- [x] 3.1 `CLIENT_PROTOCOL_VERSION` 1.0 in core, and hq stating it and its release version before sign-in
- [x] 3.2 hq reading `X-Client-Protocol-Version` and `User-Agent` on requests, and `clientProtocolVersion` in the socket handshake, and refusing with 426 and a socket refusal under the rule; no version accepted
- [x] 3.3 Core's list of the operations and events the mobile app relies on, its voice events included
- [x] 3.4 `CLOUD_PROTOCOL_VERSION` 1.0: hq sends `X-Cloud-Protocol-Version` and `User-Agent: hq/<release>`, reads Cloud's answer, applies the rule; the stand-in Cloud server checks it

### Phase 4 — The snapshot, where the rule lives, and the release made ready
**Delivers:** the rule enforced by a test and written where a contributor finds it; nothing left that would hold up
the tag.
**Starts when:** phase 3 has merged.
**Execution plan:** none — lanes.that

- [x] 4.1 The snapshot of every connection's shape, generated and committed, and its test classifying a difference by the spec's table
- [x] 4.2 The deprecation-mark check: "since", "stops working in" two majors on, the replacement; removal at the right major
- [x] 4.3 The decision record, superseding ADR-0046
- [x] 4.4 `docs/architecture/versioning.md`
- [x] 4.5 The line in `AGENTS.md`
- [x] 4.6 The tests that fail only on shared CI runners fixed: the host service's takeover test, hq's run-state and paused-run integration tests
- [x] 4.7 hq's arm64 images built natively, not under emulation
- [x] 4.8 Every image start-tested before it can reach the registry: one start test, run locally in the full regression before merging to `main`, in Checks on a release branch, and in each release build job before its push
- [x] 4.9 Releases cut on a release branch: the rule in `AGENTS.md` *Git* and a decision record; Checks runs on `release/*`
- [x] 4.10 The product tested as installed: the secure-page-only check in Checks and the non-secure end-to-end project in the full regression; the install test (images built, `agenthix install` at the network address over plain http, a browser walkthrough) run on `release/*`; the install's message and the guide say voice needs https or `localhost`
- [x] 4.11 hq's tests write nothing outside the repository and the system's temporary folder
- [x] 4.12 Every operation the mobile app uses has a declared argument and result in core, built field by field, not a database row; a test fails while one is undeclared (before 4.1)
- [x] 4.13 The site and host connections declared whole in core: the site's methods with parameters and results, no `unknown` but JSON by design; removal checked against a prior deprecation mark
- [x] 4.14 `agenthix uninstall`: refused while HQ or a site is on the machine; removes the Fleet Console, the agents' group, the firewall table, the install's volumes, networks and fetched images, and the state folder, with the host service's own container last through a helper from its image; a container test asserts nothing named after the namespace is left

### Phase 5 — The release
**Delivers:** `v0.1.0-alpha.1` published from the baseline, and installed from its images.
**Starts when:** phase 4 has merged, the full regression passes, and the branch is on `main`.
**Execution plan:** none — by hand: each step is the owner's to approve. Runs on `release/0.1.0-alpha.1`.

- [x] 5.0 `release/0.1.0-alpha.1` cut from `main`; every `package.json` set to `0.1.0-alpha.1`; Checks with the image start test, the install test and the guide's screenshots pass on it in CI (the full regression ran before the unit merged)

- [x] 5.1 `v0.1.0-alpha.1` tagged on the release branch's proven commit and pushed; *Publish release* passes, publishing only what the release branch proved
- [x] 5.2 The GitHub pre-release; the screenshots published, dry run then for real
- [x] 5.3 The core package installed from outside and loaded with plain Node
- [x] 5.4 This machine, torn down, installs from the images; a bad signature refused; a message sent from a browser at the machine's network address over plain http
- [x] 5.5 The Install page gives the published image, and the pinned Postgres digest moved forward
- [x] 5.6 The website unchanged by the pre-release, confirmed
- [x] 5.7 What `v1.0.0-alpha.1` and `v1.0.0-alpha.2` published deleted — tags, GitHub pre-releases, images, core package versions — each on the owner's say-so

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | The site protocol's shape changes found for 1.3 (fields optional only for an older site made required, unused methods removed, the dead credential report, one "decided at" field) move into 2.1 | They are the code the floors guard: done apart, the same files would be edited twice |
| 1 | The mobile app's voice is in its 1.0 list, with what a voice client must do written down | The owner (2026-10-21): the mobile app moves to the conversation's voice events as its first major version, now |
| 2 | None yet | |
| 3 | None yet | |
| 4 | 4.8 added: every image start-tested, locally before merging, in Checks and before each push | alpha.1 and alpha.2 published a host service image that could not start (owner, 2026-10-21) |
| 4 | 4.10 added: the product tested as installed (secure-page check, non-secure end-to-end project, the install test on `release/*`) | The send that froze over plain http passed every test run at `localhost` (owner, 2026-10-21) |
| 4 | 4.12 added: every operation the mobile app uses gets a declared shape before the snapshot | About 30 returned database rows or inline shapes the snapshot could not protect; the mobile app will reach parity with hq's web app (owner, 2026-10-21) |
| all | The cut is `0.1.0-alpha.1`, not `1.0.0-alpha.3`; the product stays below 1.0.0 until general availability; the clean-slate rule holds until `0.1.0-rc.1`; what `v1.0.0-alpha.1`/`.2` published is deleted, each on the owner's say-so | The owner (2026-10-21): 1.0.0 was never chosen, it came from naming the first pre-release |
| 4 | 4.13 added: the site's channel methods and every `unknown` field declared, and removal only after deprecation enforced | The snapshot found the site connection's methods declared in the site's code, not core, so nothing protected them; the owner's rule for 4.12 applied to every connection |
| 4 | 4.14 added: `agenthix uninstall`, a new command | Erasing left the host service, and removing it by hand left the install's firewall table, which blocked agent networks for the next install's tests (owner, Q20, 2026-10-21) |
| 5 | No QA audit before this cut, a pre-release; the full audit before `0.1.0`, the 17 November release | The owner (2026-10-21): this cut is the baseline for standing up a Cloud-run hq; the full audit belongs to the first release |
| 5 | Run on a release branch, `release/0.1.0-alpha.1`, which sets the version and merges back after the tag | The owner (2026-10-21): not every unit on `main` is release-ready; a release is its own work with its own bar |
| 5 | The release branch proves everything a release does and the tag only publishes; a failure after the tag is fixed on the same branch under the same version; from the next release the tag goes on the release's merge commit, proved on the release branch, and `main` fast-forwards to it | The owner (2026-10-21): the first alpha.1 tag published before its screenshots had run, which was a mistake, not a patch; each release should read as one merge on `main` |
| 5 | The full regression is not run again on the release branch, which adds only the version; it proves the bar in CI | The owner (2026-10-21): it ran when the unit closed |
| 4 | The image start test and the guide's screenshots run in CI on release branches only; `main` and pull requests get the typecheck, unit and integration suites | The owner (2026-10-21): `main` gets basic checks, the release branch the full suite; both still run in the full regression before a merge |
| 5 | The release branch proves everything a release does except publish: one release build (`release-build.yml`) for the branch and the tag, every image on amd64 and arm64 and core packed; the screenshots are taken and kept on the branch; the tag only publishes, and refuses unless all of it passed on the branch; Checks' amd64-only image job is removed; a failure after the tag is fixed on the same branch and the same version tagged again | `v0.1.0-alpha.1` published its images while its screenshots, taken only at the tag, failed there; the owner (2026-10-21): "nothing should fail after it has been confirmed in release branch. the tag should always be the release branch" |

## Closing note

**Closed 2026-10-21, accepted by the owner.** Every connection is at 1.0 under one compatibility rule
([adr-0136](../../adr/adr-0136-every-connection-restarts-at-1-0-and-peers-one-major-apart-still-talk.md)), the
modules carry one product version, and a release is cut on its own branch, which proves everything the release does
before the tag publishes it ([adr-0137](../../adr/adr-0137-a-release-is-cut-on-its-own-release-branch.md)).
`v0.1.0-alpha.1` was cut from this work, then installed from its published images and uninstalled again. Phase 5 was
that release; a release is its own work, and a later unit leaves it out of its phases.

**Open items:** 87 triaged at the close — 62 closed in the unit (with evidence), 18 deferred as issues (four of them
in the maintainers' planning), 7 decided by the owner (one raised as an issue). One is critical and blocks
release: finishing a sprint a second time finishes the next sprint too (Bug, High).
Four issues are closed by this work and three are narrowed.

**QA:** no audit ran at this close; the full audit is required before `0.1.0`. The unit wrote its own contract
(US-348–US-354, SC-1127–SC-1169), tagged 133 tests, and corrected or retired the entries the reset made stale; those
entries await that audit.

**Decision records:** adr-0136 written, superseding adr-0046; adr-0137 written; implementation notes on adr-0131,
adr-0136 and adr-0137.

This plan is frozen.

