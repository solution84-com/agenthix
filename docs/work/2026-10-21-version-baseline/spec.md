---
created: 2026-10-21
description: Every version the platform carries counted from one baseline before the second release cut — one initial migration per app, every connection's protocol at 1.0 under one compatibility rule with one major of overlap, data formats at 1, one product version — the shapes between products made stable by rule and by a checked snapshot, every name on a machine consistent and grouped, and every name ready for the product to be renamed without breaking an install.
---

# Design Spec · Version baseline

**Kind:** initiative · **Issue:** the core package, and the rest tracked outside this repository · **Replaces:** ADR-0046's rule that a major version never restarts

## Why

The platform's versions grew through development and were never reset. hq has 112 migrations and the site 16. The
hq ↔ site protocol is at 17.13 with 31 gates for older sites, though no site anywhere runs one. The host relay is at
1.7. The mobile app and Agenthix Cloud exchange no version with hq at all, so when hq removed its old chats the mobile app
failed silently. Every `package.json` says 0.1.0 while the tags and images say 1.0.0-alpha.N. And the first release
published a core package that plain Node could not load.

Nothing outside the team has installed a release, so none of that history serves anyone. This unit makes the next
release, `v0.1.0-alpha.1`, the baseline every later version counts from, and sets the rules that keep the products
talking to each other after it.

## The connections, and what each gets

Every connection between parts installed or upgraded separately carries a version. hq's own web pages do not: hq
serves them, so they always match it.

| # | Connection | Its name | Today | From the baseline |
|---|---|---|---|---|
| 1 | hq ↔ Execution Site, the control and content channels | the site protocol | `PROTOCOL_VERSION` 17.13, 31 gates | `SITE_PROTOCOL_VERSION` 1.0, no gates |
| 2 | Fleet Console ↔ host service, and Agenthix Cloud ↔ host service | the host protocol | `HOST_RELAY_PROTOCOL_VERSION` 1.7 | `HOST_PROTOCOL_VERSION` 1.0 |
| 3 | hq ↔ the mobile app, and any later app | the client protocol | none | `CLIENT_PROTOCOL_VERSION` 1.0 |
| 4 | hq ↔ Agenthix Cloud: connecting, sign-in, the pledge, the downtime email | the Cloud protocol | none, shape checks only | `CLOUD_PROTOCOL_VERSION` 1.0 |
| 5 | `@agenthix/core` as a package other projects install | the release number | the product version, under Semantic Versioning |
| 6 | Stored data a later version must read: the database, sealed backups, agent packages | migrations and format numbers | one initial migration per app; formats at 1 |

**Names follow one pattern** (owner, 2026-10-21): a protocol is named after the party hq or the host service talks
to, and its constant is `<PARTY>_PROTOCOL_VERSION`. No name carries the product's: "site", "host", "client" and
"Cloud" name parties. **On the wire, each protocol's header and field
carry its name:** `X-Site-Protocol-Version`, `X-Host-Protocol-Version`, `X-Client-Protocol-Version`,
`X-Cloud-Protocol-Version`, and in a socket handshake `clientProtocolVersion`. hq's one web server receives both the
host protocol (the Fleet Console's link) and the client protocol (the mobile app), so a shared header name would be
ambiguous there. Which program and release is calling goes in the standard `User-Agent` header, `<party>/<release>`
(`mobile/1.2.0`, `hq/0.1.0-alpha.1`). The two existing names are renamed
at the baseline, while nothing outside the team runs them; after 1.0 a rename would itself break.

Each protocol keeps its own number; they move independently. A protocol version is never the product's release
version: a phone from a store and a self-hosted hq are rarely on the same release.

## The rule every connection follows

A protocol version is `major.minor`.

- **A minor version adds.** A new message, operation, event or optional field. Each side ignores what it does not
  know, so a minor version never breaks anyone.
- **A major version breaks.** Something removed, renamed or given a new meaning, or a new required field.

**Two sides talk while their majors are at most one apart** (owner, 2026-10-21). The newer side speaks the older
side's major:

| Peer is | The connection |
|---|---|
| The same major | Works. Each side uses only what the lower minor has |
| One major behind | Works. The newer side speaks the older major, through code kept for it |
| Two or more majors behind | **Refused**, with a message naming both versions and the side that must upgrade |
| Ahead | The peer decides, by the same rule from its side |

So when hq moves a connection from major 2 to 3, it still serves major 2, and drops major 1, which is then **retired**:
its code is deleted, the connection is refused, and the platform no longer supports an organisation still on it.

### The lifecycle of a piece of a protocol

| Stage | Example: deprecated in 1.4 | What it means | In the code |
|---|---|---|---|
| **Current** | 1.0–1.3 | Part of the current major | Normal |
| **Deprecated** | 1.4 to the last 1.x | Still current and still works for everyone, but scheduled to leave | Marked `@deprecated` (below). Editors strike it through wherever it is used |
| **Previous major** | 2.x | Gone from the current major; still spoken to peers on 1.x | Moved into that connection's code for the previous major, apart from the current code |
| **Retired** | 3.0 on | Two majors back: **stops working** | Deleted. A peer still on 1.x is refused |

So a deprecated thing keeps working for the rest of its own major, and through the whole of the next one for peers
still on it. It fails at the second major after the one it was deprecated in.

Something is removed from the current major only after it has been deprecated for at least one minor version, so a
peer has had a release in which to stop using it.

**Every deprecation mark says three things:** the version it was deprecated in, the version from which it **stops
working** (the second major after, `.0`), and what to use instead. In this form, so the snapshot test can read it:

```ts
/** @deprecated since 1.4; stops working in 3.0. Use `runPage` instead. */
```

Where nothing replaces it, the mark says so: `Nothing replaces it.` A mark without all three, or whose "stops working"
version is not two majors after its "since", fails the snapshot test.

### Writing rules, so most changes are minor

- A new field is optional, or has a default the older side would assume.
- An unknown field, value or message is ignored, never refused, so a closed set (an enumeration) always has a way to
  say "something this side does not know".
- A field is never renamed and never given a new meaning: a new one is added and the old one deprecated.
- A value is never sent to a peer that has not stated a minor version that understands it.

## Keeping the shapes stable

**1. The shapes settle before they are stamped 1.0.** Before the baseline, each connection is reviewed for changes
already known to be coming, and those land first:

- the mobile app's voice: hq's old voice events are gone, and the mobile app's voice moves to the
  conversation's voice events at 1.0, so they settle now, with any field the code sends but the types leave out;
- Agenthix Cloud's connection endpoints, which Cloud's server is about to be built against;
- anything the 31 gates of connection 1 show as half-finished.

**2. A committed snapshot of every connection's shape.** Core generates, for each connection, a file listing its
messages, operations and events with their fields and types, and which are deprecated, from the type declarations
the connection already has. The file is committed. A test compares it with what the code declares:

| The difference | The test requires |
|---|---|
| Only additions of optional things | The minor version moved |
| A removal, a changed type, a renamed field, or a new required field | The major version moved |
| A new or changed deprecation mark | The mark names its "since" version, the version it stops working in (two majors after) and its replacement |
| The major moves past a deprecated thing's "since" major | It has left the current major's code, kept only for peers one major behind |
| The major reaches a deprecated thing's "stops working" version | It is gone, and its peers are refused |

A breaking change can still be made, but never by accident, and always with the version that tells every peer.

The snapshot can only hold what core declares, so every connection's messages are declared there: the site
connection's methods each with their parameters and result (a map in core, which hq and the site both use), and no
field left `unknown` except one that carries arbitrary JSON by design, typed as JSON. Something leaves the current
major only after it has been deprecated for at least one minor: the test checks that a removed thing carried a mark
in the snapshot before.

**3. Tests between the products.** hq and the site meet in the cross-app suite. The Cloud stand-in and the mobile
app's contract test read the same snapshot, so a change hq makes is checked against what they expect.

## Each connection

**1. The site protocol.** The handshake already exchanges the protocol version (ADR-0046); the site's header, today
`X-HQ-Protocol-Version` (named after the wrong side), becomes `X-Site-Protocol-Version`, and each frame's `version`
field stays. From the baseline it applies the
rule above: a site one major behind is served through the previous major's code; two behind is refused, and hq and
the site each say which must upgrade. At 1.0 there is no previous major, so that code path is first written at the
first major change, with a test that runs it.

**2. The host protocol.** The Fleet Console and Cloud send `X-Host-Protocol-Version` (until now `X-Host-Relay-Version`);
the host service answers its own. The same rule, at 1.0.

**3. The client protocol: the mobile app** (as agreed for the mobile app on 2026-10-20; the number is 1.0 rather than 1.1, since the baseline restarts
every connection):

- hq states its release version and client protocol version **before sign-in**, in the answer the mobile app already reads at
  its address step.
- The app sends `X-Client-Protocol-Version: <major.minor>` and `User-Agent: mobile/<app release>` on every request,
  and `clientProtocolVersion` in the socket handshake. A later app (a desktop one) uses the same protocol with its own
  `User-Agent`.
- hq refuses an app two or more majors behind with HTTP 426 and a socket refusal naming which side to update. An app
  ahead of hq applies the same rule from its side, reading hq's version before sign-in. **No version at all is
  accepted** (a browser, or an app from before the baseline).
- Core lists the operations and events the mobile app relies on, the conversation's voice events included; the
  snapshot covers them. Every listed operation's argument and result is a declared type in core, built field by field
  rather than handed out as a database row, so a change to hq's database cannot reach the mobile app unseen; a test
  fails while any listed operation's shape is undeclared. The mobile app will reach parity with hq's web app, so an
  operation joins the list, declared, when the mobile app takes it up. What a voice client must do beyond sending and reading those events (deciding when the
  person has finished speaking, the keep-alive while they speak, reporting how much of a reply was heard) is written
  down beside them, since the events alone do not say it.
- Later, not in this unit: Settings › Phone showing each phone's app version.

**4. The Cloud protocol.** hq sends `X-Cloud-Protocol-Version: <major.minor>` and `User-Agent: hq/<release>` on every call to
Cloud, and Cloud answers with its own. The stand-in Cloud server checks it. Cloud's real server is built against 1.0.

**5. The core package.** It carries the product version. Under 0.x, removing or changing anything it exports is a minor
release of the product (`0.2.0`); from 1.0.0, a major. `npm run check:package` loads every entry
point with plain Node before it is published.

## Stored data

- **One initial migration per app.** hq's 112 migrations and the site's 16 become one each, generated from the
  current schema. Every database is recreated from it: the development and test databases here, with the owner's
  consent at the time (the `database-migrations` skill). The clean-slate rule holds until the first release
  candidate, `0.1.0-rc.1` (owner, 2026-10-21), and the initial migration may be squashed once more before it; from
  then on every schema change is a new migration that carries a release's data forward.
- **Formats at 1.** The agent package format (2), the board templates at 2, and the browser's voice settings (8)
  restart at 1, with whatever compares them checked to treat an unknown newer number safely. Those already at 1 stay.
- **A later version reads what an earlier one wrote.** A sealed backup, an agent package and the database are read by
  newer releases, so each format follows the same rule as a protocol: a newer reader reads one major back.

## Names on a machine

Every Docker name the platform creates is `<namespace>-<part>[-<what>]`: the namespace is the install's recorded one
(`agenthix` for a new install), the part is the image's own name, so a container and its image match, and volumes and
networks are named explicitly, so Docker Compose adds no prefix of its own. Databases use underscores, which Postgres
prefers. Labels stay `<namespace>.<key>`.

| Kind | Today | From the baseline |
|---|---|---|
| Host service | `host`, `host-launcher`, `host-previous` | `agenthix-host`, `agenthix-host-launcher`, `agenthix-host-previous` |
| hq | `agenthix-hq-server`, `-hq-web`, `-hq-db` | unchanged |
| Site | `agenthix-site`, `agenthix-site-db` | `agenthix-site-server`, `agenthix-site-db` |
| Agents | `agenthix-site-agent-<id>` | `agenthix-agent-<id>` |
| Fleet Console | `agenthix-console` | unchanged |
| Volumes | `agenthix-hq_hq_db`, `agenthix-hq_hq_storage`, `agenthix-site_site_db`, `agenthix-console_console_state`, `agenthix-host-figures` | `agenthix-hq-db-data`, `agenthix-hq-storage`, `agenthix-site-db-data`, `agenthix-console-state`, `agenthix-host-figures` |
| Networks | `agenthix-hq_internal`, `agenthix-site_internal`, `agenthix-hq-link`, `agenthix-edge`, `agenthix-fleet-console` | `agenthix-hq-internal`, `agenthix-site-internal`, `agenthix-hq-link`, `agenthix-edge`, `agenthix-console` |
| Databases | `agenthix`, `agenthix_site` | `agenthix_hq`, `agenthix_site` |

The Fleet Console's network still sorts before `agenthix-hq-link`, which its route out depends on. Unchanged: the
`agenthix` command, the `~/.agenthix` state folder, the image names, and the development containers `agenthix-dev-*`.

### One install per machine, and one group per part

| Part | On one machine | Started by | Its group in Docker Desktop |
|---|---|---|---|
| Host service | exactly 1 | the person, `docker run` | `agenthix-host`, by label |
| Site | exactly 1, named after the machine | the host service, compose | `agenthix-site` |
| hq | 0 or 1; a second is refused | the host service, compose | `agenthix-hq` |
| Fleet Console | 0 or 1 | the host service, compose | `agenthix-console` |
| Front door | 0 or 1, optional | the person, compose | `agenthix-front-door` |
| Agent containers | unbounded | the site, `docker run` | `agenthix-agents`, by label |

Docker Desktop groups containers by their compose project. A group is therefore also what the host service starts,
upgrades and removes with `--remove-orphans`, so parts that live separate lives, or are started by different hands,
get separate groups: acting on one never deletes another. The host service and the agents, started with `docker run`,
carry the label `com.docker.compose.project` of their own group: the host service's goes on the guide's `docker run`
and the launcher carries it to each new version; the site adds the agents'. The agents never share the site's group,
since the site's next upgrade would remove them as orphans mid-run.

**Cleaning up agents.** Their group deletes as one in Docker Desktop, or with `docker compose -p agenthix-agents down`.
The site keeps removing a person's or a project's containers by label, and erasing the site or uninstalling takes the
whole group down. An agent container holds nothing kept nowhere else; a removed one is made again when needed.

To be confirmed on a real machine while building: that Docker Desktop groups a `docker run` container by that label
alone, and that `compose down -p` removes containers compose did not create.

## Ready for a new name

If the product is renamed, no install, connection or person's data should be disturbed. Every place the name appears
is in one of four tiers, each with its own way out:

| Tier | Where | Rule | A rename then means |
|---|---|---|---|
| **A · On the wire and in the code** | headers, fields, `User-Agent` parties, environment variables between parts, internal identifiers | Never the product's name: neutral words (site, host, client, Cloud, hq) | Nothing |
| **B · On a person's machine** | container, volume, network and database names, labels, groups, the state folder | From the install's recorded namespace, written once at install | Nothing for an existing install, which keeps its namespace; new installs get the new one |
| **C · Published** | image names, the core package's name, the repository and the images' signer, Cloud's and the guide's addresses | Each from one setting; the host service trusts a **list** of signers and image names | A release that publishes under both names and trusts both, for one major; then the old names retire |
| **D · What people read** | screens, messages, the guide, the command | Text, and the branding module where code prints the name | A text change in a release; the old command kept as an alias for one major |

**At the baseline:**

- The settings a person writes in `host.env` lose the product's name: `REGISTRY_USERNAME`, `REGISTRY_TOKEN`,
  `CLOUD_URL`, `CLOUD_MACHINE_ID`, `CLOUD_ENROLMENT_CODE_FILE`.
- The variables passed to agent containers and between parts lose it too, under a neutral prefix named after who sets
  them.
- The site's labels and agent names come from the recorded namespace, like everything the host service names; so do
  the new groups.
- The host service trusts a list of signers and image names, with one entry today.
- Cloud's address and the guide's screenshot address are one setting each, defaulting to today's.

Screens and the guide are left as they are: changing text breaks nothing.

## The product version

Every `package.json` carries the product version, set once for a release, on its release branch (below). The release
run checks that the tag matches it instead of putting the tag's version into the build, so the repository, the
images, the core package and the tag always agree; Checks fails if any module disagrees. Between releases `main`
carries the last release's version (`0.0.0` until the first one). The baseline is `0.1.0-alpha.1`.

**The product stays below 1.0.0 until general availability** (owner, 2026-10-21): every 0.x release is early access,
and `1.0.0` is general availability. The first public release is `0.1.0`; the cuts before it are `0.1.0-alpha.N`,
then `0.1.0-rc.N`. Under 0.x a breaking change moves the minor (`0.2.0`) and a fix the patch. The product's version
is not a protocol's: every connection's protocol is at 1.0 whatever the product's version.

### Releases are cut on a release branch

Not every unit of work on `main` is ready to ship, and with this many parts, releasing whatever `main` holds is how
the first two cuts went wrong (owner, 2026-10-21). So a release is its own work, apart from any unit:

1. Units merge to `main` as they finish; none merges into a release branch.
2. When a release is due, `release/<version>` is cut from `main`. Its one job is to prove that everything up to that
   point passes the release bar: the version set in every `package.json`, the full regression and the image start
   test on the developer's machine, and Checks.
3. Only fixes for what the bar finds go on it. Anything larger becomes an issue or a unit of its own.
4. The tag goes on the release branch once the bar passes, and the release run publishes from it.
5. The release branch merges back into `main` with `--no-ff`, so its fixes and its version reach `main`, and is
   deleted; the tag keeps the commit. One release branch is open at a time.

The images' signer is the release workflow at the tag, not a branch, so tagging on a release branch changes nothing
an install trusts. Checks runs on `release/*` as on `main`.

## The release this unit cuts

`v0.1.0-alpha.1`, the first release cut on a release branch, `release/0.1.0-alpha.1`, with what the first two cuts
taught already fixed (pre-release versions accepted everywhere,
publishing in order behind *All checks passed*, core loaded as a consumer loads it) and the rest prepared for before
the tag:

- **The tests that fail only on shared CI runners** are fixed, since the release now waits on *All checks passed*:
  the host service's takeover test, and hq's run-state and paused-run integration tests.
- **hq's arm64 images build natively on the arm64 runner**, the Wasp stage on the building machine's own platform
  (Debian, where Wasp's CLI exists for arm64), instead of about 55 minutes under emulation; each image is then
  start-tested on its own architecture.
- **Every image is started before anything reaches the registry**, since alpha.1 and alpha.2 published a host
  service image that could not start: its bundle refused to load, and nothing had ever started it. One start test,
  the same everywhere, builds an image and starts it: the host service answers on its owner socket with its version,
  the Fleet Console answers its status, hq's server and the site start against a throwaway database and answer their
  health, hq's web image serves its page, and the agent image prints its version. It runs at three points:
  - **on the developer's machine, before a unit merges to `main`**, as part of the full regression, because it is
    cheap there and catches a broken image before it is even on `main`;
  - **in *Release branch build*, on every push to a release branch**, for amd64 and arm64, with the release's own
    build (not on `main` or pull requests, which get the typecheck, unit and integration suites);
  - **in the release run**, in each build job, on its own architecture, before the image is pushed: an image that
    fails is never sent.

  The full install from the published images stays a release's manual step (below): automating it needs images the
  release has signed, and a way around the signature check would be a hole in the shipped product.
- **The product is tested in the shape it is installed in**, since the send that froze over plain http at a network
  address (a browser gives some features, such as `crypto.randomUUID` and the microphone, only to a secure page:
  https or `localhost`) passed every test run at `localhost`. Three layers, cheapest first:
  - **a check in Checks** that hq's browser code calls no secure-page-only feature except through a helper with a
    fallback;
  - **hq's end-to-end tests also run at a non-secure address** (a made-up network name that resolves to the machine),
    in the full regression before a merge (an end-to-end job in Checks would cost 15–25 minutes a push and needs a
    model that answers), and the install test exercises the same at the real address;
  - **the install test**, on the release branch, before the tag: every image built, the host service started under a
    test namespace of its own, `agenthix install` at the machine's network address over plain http, then in a real
    browser the first admin made, a message sent, a conversation opened and the Fleet Console opened. A host service
    built on the machine (`dev`) is the one kind that may run images built there, so no signature check is bypassed.
    It runs on a fresh runner when a `release/*` branch is pushed, and here when the machine has no install.

  Voice needs a secure page, whatever the code does: the install's message and the guide say that voice needs https
  (the optional front door) or `localhost`.
- **What `v1.0.0-alpha.1` and `v1.0.0-alpha.2` published is deleted**: their tags, GitHub pre-releases, images and
  core package versions sort above every 0.x, so anything choosing the newest would choose them. Nothing outside the
  organisation uses them. Each deletion is the owner's to approve.
- **No QA audit for this cut** (owner, 2026-10-21): alpha.1 is a pre-release, the baseline that lets a Cloud-run hq
  be stood up, and a pre-release needs none. The full audit is required before `0.1.0`, the 17 November release.
- **Then the tag and what it publishes**, and the install from the images on a fresh machine, with a bad signature
  refused, which the first pre-release left: the Install page and the pinned Postgres digest move forward.

## Where the rule lives

The rule outlasts this unit, so it is written where a contributor finds it, each place doing one job:

| Where | What it holds |
|---|---|
| A new decision record in `docs/adr/` | The decision, briefly: every connection restarts at 1.0, one major of overlap, two back refused, deprecations name when they stop working; why, and what was rejected. ADR-0046 is marked superseded by it |
| `docs/architecture/versioning.md`, new | The rule as it stands: the connections and their versions, the compatibility table, the lifecycle, the writing rules, the deprecation form, and how to move a version. Edited as the rule changes |
| `AGENTS.md`, *Code conventions* | One line: a change to anything another product receives follows `docs/architecture/versioning.md` |
| `AGENTS.md`, *Git*, and a decision record | Releases are cut on a release branch: the steps above |
| The snapshot test in `core` | The rule enforced: version moves, deprecation marks, removals at the right major |

## Decision records

| | Records |
|---|---|
| **Writes** | One record: every connection's version restarts at 1.0 at this baseline, the rule above, one major of overlap, and the lifecycle. It supersedes ADR-0046. A second: releases are cut on a release branch |
| **Depends on** | ADR-0117 (signed published images) · ADR-0134 (hq connects to Cloud by device approval and signed tokens) |
| **Revisits** | ADR-0046, superseded |

## Out of scope

- **A version for the browser pages hq serves.** They always match hq.
- **Settings › Phone showing app versions.** Later work on the mobile app.

## Verified by

- The snapshot test fails for an addition without a minor bump, and for a removal or a required field without a
  major bump.
- The rule's compatibility check, for each connection, with peers at the same major, one behind, two behind and one
  ahead.
- The cross-app suite, the Cloud stand-in, and the mobile contract test against the snapshot.
- Each app's database created from its single initial migration passes its integration suite.
- The release run refuses a tag that does not match the product version.
- `v0.1.0-alpha.1` installs from its images on a fresh machine.
