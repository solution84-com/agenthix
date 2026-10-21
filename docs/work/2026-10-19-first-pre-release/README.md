---
created: 2026-10-19
updated: 2026-10-20
description: The unit that cuts the first pre-release, v1.0.0-alpha.1, after the few changes Agenthix Cloud needs from hq first — pre-release tags named alpha, an hourly check-in with Cloud, Cloud's "too many requests" answered — and proves what its tag publishes for the first time, up to a machine installing from the images.
---

# The first pre-release

An **operational** unit with four small changes first: no design to settle, but more than one step, and the first run
of three publishing workflows. It makes the changes Agenthix Cloud needs from hq before it can connect to one, then
cuts `v1.0.0-alpha.1` and proves what that tag publishes.

**Named alpha, not beta** (2026-10-20): until launch only the team can run the platform, so the cuts before `1.0.0`
are `v1.0.0-alpha.N`; `-rc.N` once the scope is frozen; strict Semantic Versioning from `v1.0.0`. What each part can
talk to stays the protocol version's job, not the release number's.

**What passes when it is done:**

- **Pre-release tags are `-alpha.N`.** *Publish core* and *Publish images* take `v<major>.<minor>.<patch>-alpha.<n>`
  (their tag filters and version checks), and the host service accepts and orders it (`host/src/images/published.ts`,
  `host/src/upgrades/versions.ts`): alpha before beta before rc before the release. The documents that say `-beta.N`
  say `-alpha.N`.
- **A connected hq checks in with Cloud at least hourly.** While connected, hq signs for a token at least once an
  hour, whether or not anything needs one, so Cloud can tell an hq that stopped from one that is quiet, and an hq
  disconnected from Cloud's side learns it within the hour (`hq/src/cloud/cloudConnection.ts`).
- **Cloud's "too many requests" is answered.** When Cloud answers a connection request or a token request with `429`,
  hq waits as long as `Retry-After` says, and an admin asking to connect is told to try again then, rather than seeing
  a failure (`hq/src/cloud/cloudClient.ts`, which today reads only 200, 401 and 404).
- **The README asks for a star**, quietly, where a reader has found what they came for.
- **`v1.0.0-alpha.1` is tagged and released as a pre-release.** The procedure is in the guide's README, under *Tags*.
- **The guide's screenshots are published.** The capture run passes at the tag, and *Publish guide screenshots*
  runs, first as a dry run and then for real. `https://assets.agenthix.com/guide/v1.0.0-alpha.1/` serves the set.
- **The images are published and signed**, for amd64 and arm64, by *Publish images*, and `@agenthix/core` by
  *Publish core* ([deployment](../../architecture/deployment.md#releases-and-the-images-they-publish)).
- **A fresh machine installs from them:** the host service accepts a real signature and refuses a bad one. The
  Install page then gives the published image, and the pinned Postgres digest is moved forward.

**If something is wrong after the tag, it is fixed and a new tag is made** (`-alpha.2`). A tag's screenshots are
written once.

**It will hold** `plan.md`, written when the unit is first worked.
