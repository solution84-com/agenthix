---
created: 2026-10-14
description: How host management is built — the shared contracts first, then the host service and its CLI end to end, then the Fleet Console's server and the relay through hq, then every screen feature by feature against the boards, then a polish loop.
---

# Implementation Plan · Host management

## Goal

Host management as designed in [`spec.md`](spec.md), with the screens drawn in [`boards/`](boards/index.html):
one host service per machine holding that machine's authority, driven by its CLI, by the organisation's Fleet Console,
or by the Cloud controller; HQ with the organisation's authority and none over machines. The site
operator's first hour, the rest of the first-run wording and the registration token are folded in (spec 18).

**In scope:** the spec's sections 1–20 — the host service and its CLI, published and signed images, capacity and agent
protections, backups, moves, scheduled changes, suspend and erase, uploaded files on their own origin, the naming
module, the Fleet Console and its relay through HQ, HQ's read-only screens, the decision records, the deployment guide
and the user guide's install pages, and the walkthroughs of 19 on two machines.

**Out of scope:**
- **The features that need Agenthix Cloud** — connecting the organisation, Cloud's sites in the fleet, remote access
  through Cloud's relay with its authenticator code, fleet admins on Cloud, and the Cloud controller driving a host
  service. Cloud does not exist yet, so each ships as a **scaffold behind a feature flag**: its screens and commands
  are there, saying the feature is coming, on in development and off in production. They are built when Cloud
  builds its side, and this unit's walkthroughs 8, 9 and 12 pass then. Cloud's own side lives outside this repository
  (spec 21).
- **An egress proxy**, **a desktop app**, **other
  hosting providers' controllers** and **voice** —
  as the spec's 21 gives.
- **A `curl … | sh` installer** — the spec allows it later over the same `docker run`; nothing here needs it.
- **Migrating existing installs** — nothing is released, so old compose files, `compose.env` and volumes are ignored
  or wiped, never converted (the repository's clean-slate rule).

## Approach

**Contracts first, because three programs must agree on them before any is built.** The host service, the Fleet
Console and HQ each hold one end of every crossing in the spec's 4. Phase 1 puts those ends in `@agenthix/core` —
the closed set of operations, the sealed and signed envelope the Fleet Console and a host service exchange through HQ,
the messages HQ relays, the figures a host service reports, the scheduled-change notice, the move's challenge–response
and the branding module — with their cryptography and its tests. Every later phase builds against those types, so
lanes in parallel cannot drift apart on an interface none of them owns.

**The host service is a Node program in its own module, and the CLI lives inside it.** `host/` is a plain Node server
like the site ([ADR-0086](../../adr/adr-0086-the-execution-site-is-a-plain-node-server.md)): it runs as the `host`
container with the Docker socket and the state folder, listens on its owner and figures sockets, and drives the
compose projects of HQ and the site from published images. The CLI is the same image's command, reached through
`docker exec`, so the two never drift; the bash `./agenthix`, `cli/lib/` and `cli/hq-control.mjs` are replaced, not
kept beside it. Everything the CLI does is one of the host service's operations, so the Fleet Console and the Cloud
controller later reach the same code rather than a second implementation.

**One machine end to end before many.** Phase 2 makes a single machine complete from the command line: install, status
in sentences, HQ's commands, published and signed images, HQ's address set at start, capacity and protections,
backups, upgrades with rollback, scheduled changes, suspend and erase, the front door and uploaded files on their own
origin. That is the backbone everything else asks for, and it is the owner's "CLI working first".

**Then many machines, still without screens.** Phase 3 builds the Fleet Console's server — the console site — and what
it needs from HQ: the console site's connection (C8), HQ's relay of sealed messages to host services (C3), the fleet
admin role and sign-in through HQ, adding and disconnecting machines, moves between machines, the activity record,
and the scaffolds of Cloud's features behind their flag. Its API is complete and tested before a screen exists, so phase 4 maps
screens onto behaviour that already works.

**Then the screens, one feature at a time, against the boards.** Phase 4 builds the Fleet Console's React app in the
look the boards fix (`board.css`'s tokens become the app's), and HQ's read-only pages, in the order of the Fleet
Console's own menu. Each feature's screens are checked against its board in light and dark before the next starts.

**Then a feedback loop.** Phase 5 is the owner's walkthrough of the running product on two machines: a live triage
list, fixed one item at a time until none remain, correcting the spec and the boards in place where the design moves;
then the documents, the records and the close.

**Features still to come sit behind feature flags.** One small module in `@agenthix/core` names each feature that is
not ready — today the Cloud features above — and every program reads it. A flagged feature is **on in development and
off in production**: in production its screens and commands do not appear, and its routes and operations refuse on the
server, not only in the screen, so a hidden feature cannot be reached by calling it. Turning one on is a release
decision, never a setting a person changes on their machine.

**How the lead decides.** The owner's time is the scarce resource, so the lead settles what can be settled and raises
only what cannot:

- **Make reasonable assumptions**, above all where the answer is obvious, and record them in the lane's report.
- **A security threat is closed, then reported** to the owner — never left open waiting for an answer.
- **What cannot be closed, a real blocker, or an action that takes the design or architecture in a new direction**
  is written under *Deviations* below, the spec corrected in place where the design moved, and the owner told.
- **Everything for the owner is one ordered list of Open Questions** in the unit's handover, numbered, most important
  first, and carried in each report to the owner until answered.
- Hard stops stay hard: no push, no merge to `main`, no published image and no destructive operation on data without
  the owner's say-so each time.

**How the work is carried out.** Lanes, each one purpose in its own worktree off `feature/host-management`, merged
into it by the lead one at a time, rebased onto the branch head first.

- **Phase 1:** two lanes in parallel — *contracts and cryptography* (1.1–1.7) and *naming and flags* (1.8–1.9, 1.11) —
  while the lead writes the decision records (1.10). Contracts merge first.
- **Phase 2:** the *host service* lane (2.1–2.7) goes first, alone, since every other lane of the phase runs on it;
  then *images and address* (2.8–2.11), *capacity and protections* (2.12–2.14), *backups* (2.15–2.19), *scheduled
  changes and upgrades* (2.20–2.24), *suspend and erase* (2.25–2.26), *front door and files origin* (2.27–2.29) and
  *HQ and site changes* (2.30–2.34), at most three at once, merged in that order.
- **Phase 3:** *HQ's side* (3.1–3.6) first, then *the console site* (3.7–3.12) and *Cloud scaffolds* (3.13–3.15) in
  parallel, then *moves* (3.16–3.18). The lead writes the cross-app suite's host-service tests (3.19) and runs them.
- **Phase 4:** one lane per board, in the menu's order; at most two at once, since the shell lane (4.1–4.3) comes
  first and the rest build in it.
- **Phase 5:** by the lead, with fix lanes as the triage list needs them.
- **Models:** Opus for the contracts and cryptography, the relay, sign-in, protections and moves — security and races; Sonnet for bounded lanes (images, backups' plumbing, screens, documents). The lead runs
  on Opus and reviews every lane before it merges.
- **Resources:** lanes contend for Docker, memory and the fixed development ports. Lanes run the unit tests of what
  they touch and their modules' full suites once before reporting; **anything that starts containers — the host
  service's integration tests, the cross-app suite, the image builds — is run by the lead alone, after each merge**.
  Free memory, load and swap are watched while lanes run; at an alert the newest lane pauses first, and parallel lanes
  drop to one before anything is stopped.
- **The owner walks each phase's result through** on the branch before the next phase starts: phase 2 from the
  command line, phase 3 through the API and the CLI, phase 4 board by board.
- **Images:** publishing to the registry is outward-facing, so the first publish of signed images waits for the
  owner's approval; until then lanes build the images locally with the same workflow.
- **Landing:** `feature/host-management` is the line the platform is developed against until the first versioned
  release, as a `develop` branch is in gitflow; nothing from it goes to `main` before then. At that release it is
  regrouped into a clean history and merged to `main` as the host-management feature, with the owner's approval.

## Decision records

| | Records |
|---|---|
| **Depends on** | [ADR-0042](../../adr/adr-0042-hq-is-the-orgs-own.md) · [ADR-0046](../../adr/adr-0046-protocol-compatibility-between-hq-and-sites.md) · [ADR-0065](../../adr/adr-0065-a-site-serves-no-web-page.md) · [ADR-0066](../../adr/adr-0066-a-site-reaches-its-agents-over-a-private-network-per-boundary.md) · [ADR-0067](../../adr/adr-0067-hq-ends-at-one-plain-http-port.md) · [ADR-0069](../../adr/adr-0069-images-are-built-with-only-docker.md) · [ADR-0071](../../adr/adr-0071-a-preview-is-served-from-its-own-host-name.md) · [ADR-0086](../../adr/adr-0086-the-execution-site-is-a-plain-node-server.md) — all Accepted |
| **Implements** | The records the spec's 18 names, written in task 1.10: the host service is the only authority over a machine and HQ holds none; at most one HQ and one site per machine; the Fleet Console is a site that dials out to HQ, exposes nothing and signs its commands; fleet admin is a role on HQ accounts, named the same on Cloud, with HQ the authority over it; HQ's address is set when hq-web starts; every backup is sealed, its key held by a machine; a moved HQ's sites follow it by challenge–response; uploaded files are served from their own origin; organisation admins look after business operations and fleet admins the machines |
| **Revisits** | [ADR-0064](../../adr/adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md) (superseded: a site takes part when a fleet admin or Cloud adds it) · [ADR-0068](../../adr/adr-0068-hqs-browser-app-is-built-for-its-address.md) (superseded: the address is set at start) · [ADR-0108](../../adr/adr-0108-a-machine-carries-at-most-one-hq-and-one-site.md) (its naming superseded by [ADR-0120](../../adr/adr-0120-a-site-is-named-after-its-machine.md): a site is named after its machine) · [ADR-0070](../../adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md) (amended: loses its reference to the registration token) · [ADR-0044](../../adr/adr-0044-execution-site-registration-flow.md) (the registration-token flow it describes is removed) |

## Key decisions

| Decision | Why |
|---|---|
| **The host service and its CLI are Node and TypeScript, in a new `host/` module** | They share `@agenthix/core`'s contracts and cryptography with HQ, the site and the Fleet Console, and run on the same Node the repository pins. One language for every program that speaks the protocol |
| Against: keeping the CLI in bash beside a new service | Signing, sealing, a closed set of operations and sentences for every state are a program, not a script; two implementations of each command would drift |
| Against: a Go binary for the host service | A second language and toolchain for one module, and a second copy of every contract |
| **The Fleet Console is a new `console/` module: a plain Node server and a React app** | The boards' decision U2 and ADR-0086's pattern; Wasp would bring sign-in and data layers it must not have, since sign-in is HQ's |
| **Cryptography from Node's built-in Web Crypto only** — Ed25519 to sign, X25519 with AES-256-GCM to seal (and RFC 6238 for the authenticator code, when remote access is built), behind `@agenthix/core/host-crypto` | Every primitive the spec needs is in Node's standard library; a dependency on the path every command takes is a dependency to audit for ever |
| **Images published to GitHub's container registry, signed with Sigstore's cosign, verified by the host service before it runs one** | The registry sits beside the public repository and its workflows; cosign is the established way to sign container images, and keyless signing ties a signature to the workflow that built it |
| Against: building images on the machine from a clone | It is what the spec replaces: a clone and a build on every machine, and nothing to verify |
| **Cloud's features ship as scaffolds behind feature flags** — on in development, off in production, refused on the server when off | The owner's call: the feature is shown as coming, and built here when Cloud builds its side, rather than built twice against a stand-in now |
| Against: building the platform's side of the Cloud crossings now against a stand-in | Work on both ends of a contract nobody has exercised yet; it would be redone once Cloud's side exists |
| Against: hiding a flagged feature only in the screen | A hidden route is still a route; the flag is enforced where the operation runs |
| **Screens come after their behaviour** | The owner's order: a screen maps onto an API that already passes its tests, so the screen round fixes words and layout, not behaviour |
| **One phase per seam, five phases** | Contracts, one machine, many machines, screens, polish — each delivers something the next stands on and that can be walked through on its own |
| Against: merging to `main` per phase or at this unit's close | The owner's call: `main` goes from the initial source straight to the first release with host management in it, one clean step; the branch is the develop line until then |

## Work breakdown

Five phases. Each ends where the next one's work can begin on something that already runs: the contracts every program
shares, then one machine complete from the command line, then many machines through HQ, then the screens, then the
owner's walkthrough.

### Phase 1 — Contracts and naming
**Delivers:** `@agenthix/core` holds every contract the host service, the Fleet Console and HQ share, with tested
cryptography, the branding module and the feature flags; the decision records are written.
**Starts when:** —
**Execution plan:** none — lanes. The contracts are the spec's 4 and 6 written as types; a lane derives them.

- [x] 1.1 The closed set of host-service operations, as request and result types
- [x] 1.2 The sealed, signed envelope between the Fleet Console and a host service, with key pinning
- [x] 1.3 The relay messages HQ passes between the console site and host services (C3, C8)
- [x] 1.4 The figures a host service reports, and the site's effective ceilings
- [x] 1.5 The scheduled-change notice and its updates
- [x] 1.6 The move's mutual challenge–response on the stored credential hash
- [x] 1.7 The Cloud crossings' contracts (C6, the relay, the Cloud controller), as types only, for the scaffolds
- [x] 1.8 The branding module: display name, command name, image prefix; the recorded namespace
- [x] 1.9 HQ, the site and the shell layouts read product names from the branding module
- [x] 1.10 The decision records of the spec's 18, and the superseding notes on ADR-0064, ADR-0068 and ADR-0070
- [x] 1.11 Feature flags: the coming features named once, on in development and off in production, enforced on the server

### Phase 2 — One machine from the command line
**Delivers:** on a fresh machine, `docker run` and `agenthix install` bring up HQ and its default site from published,
signed images; every single-machine operation in the spec works from the CLI.
**Starts when:** phase 1 has merged.
**Execution plan:** none — lanes. Each lane's acceptance is a spec section; the host service lane goes first so the
rest have something to run on.

- [x] 2.1 The `host/` module: the `host` container, its state folder and recorded namespace
- [x] 2.2 The owner socket and the figures socket
- [x] 2.3 The CLI inside the host service's image, and the shortcut `agenthix install` offers
- [x] 2.4 Compose projects for HQ and the site, run from published images
- [x] 2.5 `agenthix install`: one question, HQ and its default site connected by configuration, one link
- [x] 2.6 `agenthix status`: every HQ and site on the machine in sentences with a next step
- [x] 2.7 HQ's commands through its control socket: `invite-admin`, `reset-password` (`fleet-admin` and `console-code` come with 3.1 and 3.12)
- [x] 2.8 Images labelled with their versions, built by one workflow
- [x] 2.9 Signing at publish, and the host service refusing an unsigned or wrongly signed image
- [x] 2.10 HQ's address set when hq-web starts, with its placeholder checks and its test
- [x] 2.11 HQ's status reports its real version, not `dev`
- [x] 2.12 Capacity held by the host service and applied by the site, narrowed only by HQ or project policy
- [x] 2.13 Agent protections applied and checked every minute; a site starts no agent until they hold
- [x] 2.14 Protections on Docker Desktop, inside its virtual machine
- [x] 2.15 Nightly sealed backups of every site, HQ's site with HQ, labelled by night
- [x] 2.16 `agenthix backup location <path>`: test write, key shown once, copies written there
- [x] 2.17 Exports with a key made for each
- [x] 2.18 Restore on the same machine, and `agenthix restore --from` on a new one
- [x] 2.19 HQ and a site reconcile after a restore, and HQ says what was lost
- [x] 2.20 Scheduled changes held by the host service, with change and cancel
- [x] 2.21 HQ hears of a scheduled change and tells the members whose work is affected
- [x] 2.22 Runs pause before a change and resume after it
- [x] 2.23 Upgrades with a backup first and a rollback when HQ or the site does not come up healthy
- [x] 2.24 Automatic fixes in the maintenance window
- [x] 2.25 Suspend and resume
- [x] 2.26 Erase at once or on a date, with the 30-day bin and restore within it
- [x] 2.27 `agenthix front-door on|off`, with its warnings, checks and rollback
- [x] 2.28 Uploaded files served from their own origin by short-lived signed links
- [x] 2.29 Downloads only, and saying so, where HQ has no subdomain for files
- [x] 2.30 The registration-token route and `HQ_REGISTRATION_TOKEN` removed
- [x] 2.31 The default site reaches HQ over a private Docker network
- [x] 2.32 HQ's refusal of the default site reaches HQ through the control socket, so its status names the cause
- [x] 2.33 `unregister` and the site's other commands say what is true
- [x] 2.34 The bash `./agenthix`, `cli/lib/` and `cli/hq-control.mjs` removed, with their tests
- [x] 2.35 A run that fails for lack of memory, disk or processes says so on the run, with the limit it hit and who was told
- [x] 2.36 Members warned when their projects' site is nearly out of disk or memory, and fleet admins told what to do
- [x] 2.37 A site at capacity reads as such where runs wait
- [x] 2.38 The host service replaces itself through a launcher, which can be switched off (ADR-0118)

### Phase 3 — Many machines through HQ
**Delivers:** the Fleet Console's server runs as the console site; machines connect, disconnect and move through it,
every command signed and relayed by HQ unread; fleet admins sign in with their HQ accounts; Cloud's features are
scaffolded behind their flag. Everything is reachable through the Fleet Console's API and the CLI, without screens.
**Starts when:** phase 2 has merged and the owner has walked one machine through from the command line.
**Execution plan:** none — lanes. The relay and sign-in lanes run on Opus; their acceptance is the spec's 4 and 7.

- [x] 3.1 The fleet admin role on HQ accounts, granted only by a fleet admin or the machine, announced
- [x] 3.2 The console site's connection to HQ (C8), by pairing secret on HQ's machine or a one-time code elsewhere
- [x] 3.3 HQ's relay of sealed messages between the console site and host services (C3)
- [x] 3.4 HQ accepts and removes a site's credential only from the console site or the Cloud controller
- [x] 3.5 The organisation admin's approval of sites removed; HQ's site screens become read-only (ADR-0064)
- [x] 3.6 The record of what fleet admins did, kept in HQ
- [x] 3.7 The `console/` module: the console site's server, on `127.0.0.1` only, started by `agenthix install` on HQ's machine
- [x] 3.8 Sign-in through HQ with the fleet admin role; refused when HQ does not answer, saying so
- [x] 3.9 Every command signed by the console site and checked by the host service against its pinned key
- [x] 3.10 Adding a site: a one-time code, `agenthix console connect`, the fingerprint confirmed
- [x] 3.11 Disconnecting from either side, effective at once on the machine
- [x] 3.12 The Fleet Console installed on another machine with `agenthix hq console-code` and `console install`
- [x] 3.13 Scaffold behind the Cloud flag: `agenthix cloud connect|disconnect`, saying the feature is coming
- [x] 3.14 Scaffold behind the Cloud flag: `agenthix console remote on|off` and the authenticator code, saying they are coming
- [x] 3.15 Scaffold behind the Cloud flag: the Cloud controller's operations on a host service, refused while off
- [x] 3.16 Move a site to a new machine, now or scheduled, with rollback to the old one
- [x] 3.17 Move HQ to a new address or a new machine; connected sites and host services follow by challenge–response
- [x] 3.18 Offline sites and machines pointed by `site hq-address` and `console hq-address`
- [x] 3.19 The cross-app suite drives a host service, HQ and a site end to end
- [x] 3.20 HQ shows a site's figures, versions and logs to fleet admins only, and none of Cloud's
- [x] 3.21 A machine that disconnects itself tells HQ it left, now or once HQ answers; fleet admins get a *Needs you* to remove it
- [x] 3.22 A machine not heard from for 10 minutes raises a *Needs you* for fleet admins, cleared when it connects
- [x] 3.23 A failed takeover ends on the new machine's signed word that it gave up and stopped the site
- [x] 3.24 The walkthrough's findings on what the command line says (status, connect, install, the Fleet Console's code)
- [x] 3.25 The walkthrough's findings on the Fleet Console: a retired one removed wherever it ran, the count of machines that follow it
- [x] 3.26 The walkthrough's findings in HQ: notification titles, copy buttons and links on plain http

### Phase 4 — The screens, feature by feature
**Delivers:** every screen on the boards, built on the Fleet Console's API and HQ's, matching its board in light and
dark.
**Starts when:** phase 3 has merged and the owner has walked many machines through.
**Execution plan:** none — lanes. Each lane's acceptance is its board page and the spec section it names.

- [x] 4.1 The Fleet Console's design tokens and components, from the boards' look
- [x] 4.2 The shell: sidebar, notices bell, person menu, *Local only* foot, collapse
- [x] 4.3 Sign-in and *Your account*
- [x] 4.4 Fleet: HQ's hero, the six tiles, site cards with their machines, the Cloud group in its four states
- [x] 4.5 A site's page: the site's cards, the machine's panel; capacity
- [x] 4.6 Add a site, restore from a backup, disconnect, move site
- [x] 4.7 Scaffold behind the Cloud flag: the Cloud group, a Cloud site, connecting the organisation
- [x] 4.8 HQ's site: the HQ, its default site and its machine; address and front door
- [x] 4.9 Move HQ, suspend, resume and erase
- [x] 4.10 Scheduled: the list, each action's *Now, or schedule for later?*, an upgrade rolled back
- [x] 4.11 Backups: the backup location, nightly backups, export and restore
- [x] 4.12 Activity and notices
- [x] 4.13 Fleet admins; fleet admins on Cloud scaffolded behind the Cloud flag
- [x] 4.14 Scaffold behind the Cloud flag: Remote access, and the authenticator code at sign-in
- [x] 4.15 HQ's *Where work runs*, a site's status, notices to members, the fleet admin role read-only

### Phase 5 — The walkthrough, and the close
**Delivers:** the walkthroughs of the spec's 19 pass on two machines; the documents and the records describe
what was built.
**Starts when:** phase 4 has merged.
**Execution plan:** none — by hand. A triage list kept live in the handover, fixed one item at a time.

- [x] 5.1 The owner's walkthrough on two machines, every finding on the triage list
- [x] 5.2 Every triage item fixed, or raised as its own issue
- [x] 5.3 `docs/architecture/deployment.md` rewritten for host management, its manual firewall steps gone
- [x] 5.4 The user guide's *Install Agenthix* and *Run it on a server* pages, and the CLI's pages
- [x] 5.6 QA stories and scenarios for host management, and the tests tagged with them
- [x] 5.7 The boards and the spec brought in line with what shipped
- [x] 5.8 The Fleet Console redesigned after the owner's review: the Dashboard, HQ's page and a site's page, the menu in three parts, notices beside the menu, Activity as the record, whole-card links, Maintenance and Help
- [x] 5.9 `docs/architecture/` and `docs/concepts/` describe host management and the fleet
- [ ] 5.10 ~~The host service's CLI says what the screens say: a moved or restored site takes its new machine's name, and the job is maintenance~~ — dropped from this unit, deferred as an issue
- [ ] 5.11 ~~HQ's and a site's *Logs* in the Fleet Console, today a page that says it comes later~~ — dropped from this unit, deferred as an issue
- [ ] 5.12 ~~What still describes the old install corrected or removed: the README, the per-module compose files' comments, HQ's message for connecting a site, the bug-report form, the publishing workflow's comment, and the guide's steps from source~~ — dropped from this unit, deferred as an issue
- [x] 5.13 The nightly backup and scheduled maintenance wait for each other instead of one failing the other
- [x] 5.14 Restoring an earlier night of HQ or a site on its own machine, from the Fleet Console's backups and from *Plan maintenance*
- [x] 5.15 The site starts again on a data folder shared from a Mac by Docker Desktop
- [x] 5.16 End-to-end tests of restoring a night in place, against real containers
- [x] 5.17 CI checks the Fleet Console's server and screens like every other module

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | None: the contracts, the naming module, the feature flags and the records were built as planned | — |
| 2 | A run that fails for lack of resources says why on the run, members are warned before, and figures, versions and logs go to fleet admins only (tasks 2.35–2.37, 3.20; spec §10 corrected) | The owner: each person stays within their role and is pointed at who can act. Nothing detected a container killed for memory or a full disk, so such a run ended with a generic error |
| 2 | The host service replaces itself through a launcher (task 2.38, ADR-0118); lane L had built only the manual switch | Without it every minor release needs a person on every machine; the owner chose to build it, switchable off, and to leave it unmaintained rather than remove it if time is short |
| 2 | `agenthix backup [export]` and `backup location` are machine commands, not `hq backup …` as the CLI board drew | Every machine has nightly backups and exports (§12); a machine with only a site has no `hq …` commands. The board is corrected in the UI pass |
| 3 | Moving the Fleet Console hands its machines over: the running one makes the code, and machines re-pin on a certificate it signs (spec §7 corrected); `hq console-code --no-machines` recovers from a lost one | As first built, a moved Fleet Console had new keys that no machine pinned, so every machine refused it; hq must never learn the code or choose the key, so the running Fleet Console vouches for the new one |
| 3 | The organisation admin's approval is removed end to end — the site's `register` command and HQ's device approval with their table — and the cross-app suite adds sites through a stand-in Fleet Console and host service | A site takes part only when a fleet admin or Cloud adds it (§10); what only the approval used would otherwise linger as dead code and a second way in |
| 3 | HQ has a read-only mode for a move to a new machine; a change of address on the same machine stops HQ for those minutes instead | HQ had no read-only mode; a same-machine address change is short and stopping is simpler, a move to a new machine is not |
| 3 | A machine that disconnects itself tells HQ it left, and fleet admins get a *Needs you* for it (task 3.21; spec §6 corrected) | In the walkthrough a disconnected machine looked exactly like a switched-off one; it told HQ nothing even when HQ was up |
| 3 | A machine not heard from for 10 minutes raises a *Needs you* for fleet admins (task 3.22; spec §10 corrected) | The owner: a machine that is down needs someone; until then nobody was told unless work waited on it |
| 3 | A failed takeover ends on the new machine's signed word, not only at the deadlines (task 3.23; spec §13 corrected) | In the walkthrough a takeover that failed within seconds left the site running nowhere for 12½ minutes |
| 4 | The Fleet Console runs on a Docker network of its own with its port published to 127.0.0.1:4300, as hq-web does, instead of in the machine's network; it accepts that network's gateway besides the loopback (spec §4, §5, §7 corrected) | On Docker Desktop the machine's network is the virtual machine's, so a browser on the Mac could never open it; a published port is forwarded to the Mac. The owner chose this over a forwarder or a tunnel |
| 4 | A suspended or erased hq is resumed or restored on its own machine, not from the Fleet Console (spec §15 corrected) | The Fleet Console reaches machines only through hq and nobody can sign in while hq is stopped (§7); the board drew *Resume hq* as a button there |
| 4 | A lost site is restored onto a new machine from its backup, which carries the site's credential; the new machine's host service renews it before the site starts, with the fleet admin's confirmation of that machine, only while neither the site nor its old machine is connected (ADR-0119; spec §12 corrected) | Without it a lost machine's site could not come back; the owner chose authority from the backup over a new power in HQ with a waiting period, and asked for a warning that a restore replaces a machine that may only be down |
| 4 | Exports made in the Fleet Console are downloaded through it: the machine holds the sealed file and streams it as signed, sealed command answers; the browser fetches it by a one-time link bound to the session, the one route a session opens without its token; the machine removes its copy once downloaded or after a day (spec §12 corrected) | In the walkthrough an export was written to the machine's own state folder, where nobody could take it; a browser download cannot carry the token, so a link spent on first use and tied to the session stands in for it |
| 4 | What a machine records belongs to the install it was for: planned maintenance, the backup log, the erase bin and move records end or are ignored once their HQ or site is gone, and a finished move no longer blocks the next (spec §12, §13, §14 corrected) | In the walkthrough a new site reported an earlier site's backup, old maintenance lingered, and a machine that once moved something away could never move again |
| 4 | A site can move to a machine already connected that runs no site, with no code; a machine waiting to receive, or left by a move that did not happen, is shown as a machine with no site and is told, sealed, why the move ended (spec §13 corrected) | A failed move left the same site listed on two machines, and a machine already in the fleet could never be used again: its host service refuses a second join |
| 4 | A machine replaced by a restore is told so by HQ, stops trying to connect and takes no runs, and says so in `agenthix status`; the Fleet Console lists it as *Replaced*, not as disconnected by a fleet admin (spec §6, §12 corrected) | In the walkthrough the old machine retried every five seconds without a word, HQ logged nothing, and its card said a fleet admin had disconnected it |
| 4 | A nightly backup missed while the host service was not running is caught up once when it runs again, labelled with the time it was taken (spec §12 corrected) | A machine off or asleep past the morning never backed up that night; a computer that sleeps every night would never back up at all |
| 4 | Each machine carries the setting *Notify the fleet admins if this machine stops answering*, ticked by default, asked where a machine joins and changed on its page; HQ's machine is always watched. Ticked and silent for 10 minutes, it reads *Not answering* and HQ raises the one notice, to fleet admins; unticked, it reads *Not heard from* and nobody is told. A host service stopped on purpose says so first, and reads *Stopped on its machine*. The Fleet Console tells HQ the setting and the stop (link protocol 1.5) (spec §6, §10 corrected; the boards' *Asleep* default superseded) | The owner, after the walkthrough: a machine that is switched off on purpose, or a laptop that sleeps, should not raise an alarm unless its fleet admins asked for one; HQ already raised the notice, so it stays the one place that does |
| 4 | The Host Manager is renamed the Fleet Console, all the way down: screens, guide, commands (`agenthix console …`) and internal names | The owner decided it during the review; cheapest before the first release |
| 5 | A site is always named after its machine, HQ's own after HQ's machine; a move or a restore renames it after its new machine, and two machines of one name cannot both carry a site ([ADR-0120](../../adr/adr-0120-a-site-is-named-after-its-machine.md), superseding ADR-0108's naming; spec §6, §13 corrected) | The owner, reviewing the Fleet Console: a site and its machine are one thing to the people looking after them; two names for it — *office-server on new-server* after a move — misled |
| 5 | The Fleet Console's screens redesigned: a **Dashboard** (what needs you, then HQ with its sites hanging from it, then the totals), **HQ's own page**, and **a page per site** with its machine below it; the menu in three parts — Dashboard and HQ fixed, the sites scrolling, the jobs pinned at the bottom; every action a button on the thing's page; a whole card is one link; no breadcrumbs; notices in a panel beside the menu, each opening what it is about and dismissible; Activity only the record, with filters (spec §7 corrected; boards *The redesign*) | The owner's review: notices could not be dismissed or opened, only a card's title was a link, scheduling and backups were three levels deep, Activity mixed notices with the record, and one page mixed HQ, a site and a machine |
| 5 | **Maintenance** replaces *Scheduled* and *each change its own action*: one *Plan maintenance…* panel beside the page, with *Which* and *What* as drop-downs that never start over, *When* saying what members see, and one button, *Do it now* or *Schedule for …*; one *Plan maintenance…* button on HQ's and each site's page; suspend can be scheduled and lives in the panel, erase stays its own button; an upgrade of HQ done now is followed until HQ answers on the new version; members read *Scheduled maintenance* (spec §11, §14, §15 corrected; board *Plan maintenance*) | The owner, trying it live: the three-step *Make a change* started over at each *Change…*, a site's buttons each preselected a different change, and "change" was the wrong word |
| 5 | **Help** in the Fleet Console: the user guide's running pages built into it, in the same version, opening without the internet, rendered without HTML; a *How this works* link on each section; commands in the guide, not on screens (spec §7) | The owner: a fleet admin meets many new ideas rarely and often under pressure; the fleet admin role's recovery command, for instance, is useless on a screen nobody can sign in to |
| 5 | A new browser tab signs in from an open one: it asks the Fleet Console's open tabs for the session's token over a channel only the same origin can open, and checks it with the server; signing out in one tab signs out all (spec §7) | The owner found every new tab asking to sign in again; the token stays in each tab's own storage, so the cookie alone still opens nothing |
| 5 | The nightly backup and scheduled maintenance wait for each other: an upgrade, a move or an erase due while a backup runs waits up to 30 minutes for it, and a backup due while a change runs waits for it the same night, logging the night as skipped, with the reason, only if the change outlasts it | The default maintenance window opened at the backup's own time, so whichever came second failed with the machine busy and nothing said why. Left for later: the default window's time and a suspend at that time |
| 5 | A fleet admin restores an earlier night of HQ or of a site on its own machine from the Fleet Console — a machine's nights with *Restore…*, and *Restore a backup* in *Plan maintenance*, the machine's name typed to confirm, now or at a set time. The host service gained the code for it: until then it could restore only a whole install, onto a machine where nothing ran, so a site could not be taken back to an earlier night where it stood. The backups a machine holds are listed by a new operation, `backup.list` | The spec's 12 allows a restore onto the same machine, and the CLI's refusal pointed at a screen that did not exist. A restore in place backs up first and refuses a backup of an earlier site; restoring HQ leaves the Fleet Console beside it as it is |
| 5 | The site accepts a data folder whose file system ignores ownership, when its own user can write there; on a file system that keeps ownership, a folder with files that is not the site's is still refused | On Docker Desktop for a Mac, a state folder in the Mac's home reads as root's whatever is set, so the site refused every start after its first |
| 5 | Phases 1–3 were merged to `main` as a checkpoint on 2026-10-15, and the unit merges to `main` at its close, not at the first release as *Landing* and the key decisions said | The owner's call |

## Closing note

**2026-10-16.** Accepted by the owner, who walked the product through on the test machines phase by phase and
reviewed the Fleet Console's redesign live. The close-out regression passes in every module and the cross-app suite.

- **Open items:** gathered from the plan, every lane report, the walkthroughs, the handover and the code, and checked
  against the code at close. **55 closed in the unit**: 52 found already fixed or no longer true, and the 3 critical
  ones fixed before the close — the nightly backup and scheduled maintenance failing each other (5.13), no way to
  restore an earlier night where a site stands (5.14), and the site refusing to start again on a Mac's shared folder
  (5.15). **26 deferred as issues, none blocking release** — no critical item is left open: Logs for HQ and a site in the Fleet Console; live previews in an install the host service makes; the first publish of signed images, and installing from them; a site added to a connected machine that runs none; the maintenance window and automatic fixes in the Fleet Console; an uninstall command; renaming a machine; the command line's words lag the screens; a moved site's backups left in the old machine's folder; an earlier site's data taken under a new site; moving HQ: progress and a read-only banner; Help in HQ; a restored HQ's unrecognised workspaces; text and files that still describe the old install; the per-module compose files and `front-door/`; the default maintenance window at the backup's time; browser tests of the Fleet Console's screens; facts the screens leave out because nothing reports them; notices matched by name, a move by the latest; small leftovers in the Fleet Console; a replaced machine retrying silently; code left by the device approval and credential rotation; documents linking to issues that do not exist here; ui's Modal has no dialog role; code coverage for host, console and console-web; restoring HQ takes its records back to that night.
- **Existing issues:** the registration token and the site operator's first hour closed as completed; the first-run
  wording closed as a duplicate of the text that still describes the old install; five others commented with what
  this unit found. The known failing site container test is unchanged.
- **QA:** the unit's QA contract is written — stories US-287 to US-315 and scenarios SC-816 to SC-939, with their
  tests tagged. **No full QA audit ran at close**, by the owner's decision: these entries are the builders' own
  account and await the audit before release.
- **Decision records:** every record under *Depends on* is still Accepted. ADR-0107 to ADR-0120, the records this unit
  created, are all Accepted and each carries a dated note of what acted on it. Under *Revisits*, ADR-0064
  and ADR-0068 are superseded by ADR-0115 and ADR-0111, ADR-0108's naming by ADR-0120, ADR-0070 is annotated, and
  ADR-0044's registration flow was already superseded through ADR-0064.

The plan is frozen from here: a record of how the work was done, not edited again.
