---
created: 2026-10-18
description: How the first pre-release's guide and screenshots, the host service's side of Agenthix Cloud, an hq's connection to Cloud, what the platform shows of Cloud, and what a client other than the browser needs are built — five phases run as lanes off one branch, verified against stand-ins where Cloud's own side is needed.
---

# Implementation Plan · The first pre-release, and the platform's side of Agenthix Cloud

## Goal

Build what the [spec](spec.md) describes: the guide and its screenshots ready for a pre-release and the procedure
for cutting one (part A); the host service taking Cloud's controller on Cloud's machines (B); an hq connecting to
Cloud and offering sign-in with an Agenthix account (C); what the platform shows of Cloud, and the pledge card (D);
and what a client other than the browser needs from hq (E).

**In scope:** everything in the spec's parts A–E, the removal of the `cloud` flag, the decision records the spec
lists, the user guide and architecture documents brought up to date, and the QA contract for what was built.

**Out of scope:** the spec's *Out of scope*. Tagging, publishing images or screenshots, and merging to `main` are
the owner's, each on their say-so.

## Approach

**One branch, lanes off it.** The unit's branch is `feature/pre-release-and-cloud-support`. Each lane is one purpose,
one branch and one worktree, briefed from this plan and the spec; the lead rebases each finished lane onto the unit's
branch and merges it with `--no-ff`, one at a time (a one-commit lane lands as a plain commit). The lead runs the
unit's whole course without stopping for the owner, decides what the spec leaves open, fixes what is obvious, and
records each such call under *Deviations* for the morning report.

**Models.** Opus for the lead and for every lane that handles a secret, an identity or a trust boundary — B2, B6, B7,
B9, C1, C2 — and for the design boards. Sonnet for bounded work: the screenshot recipes, the guide review, the
workflow lint, the flag removal, images and backups plumbing, part E. Each brief names its model.

**Order.** Phase 1 and phase 2 start together, because they touch different modules. Phase 3 starts when phase 2's
connection (2.3) has merged; phase 5 when phase 1 is done; phase 4 last, since its screens show what phases 2 and 3
built. Within the resource limits below, at most **three lanes run at once**.

**Resources.** The machine has 24 GB of memory and 10 cores, and starts the night with 2.4 GB of its 4 GB swap in use.
- *What lanes contend for:* memory and CPU (installs, typechecks, test runs, Playwright), the shared test databases,
  Docker, and the same files where two lanes meet (`core/src/host/`).
- *One at a time:* integration suites, which share the test databases, and any Docker or Playwright run, behind one
  machine-wide lock (a lock directory under the unit's `execution/`). Lanes run **only the unit tests of what they
  changed and the typecheck of the modules they touched**, and integration tests only under the lock, never beside
  another heavy run. **The full regression — every module's typecheck, unit and integration suites, the cross-app
  suite and hq's end-to-end tests — runs once, by the lead, at the close.**
- *Watched:* a watcher samples free memory, swap use, memory pressure and load every 30 seconds into
  `execution/resources.log`, and raises an alert at each threshold and again when it recovers. Warning: free memory
  under 4 GB, swap over 3.2 GB, or load over 16. Critical: free memory under 2 GB, swap over 3.8 GB, or macOS memory
  pressure *critical*.
- *At a limit:* at a warning, no new lane starts and no integration suite begins. At critical, the Sonnet lanes pause
  first, newest first; then the Opus lanes, except one doing security work; nothing is killed unless a single
  process is the cause, which is looked at before anything else — a spike is treated as a possible fault, not just
  load.

**GitHub.** The lead may push the unit's branch and start workflows by hand within a budget of **10 pushes and 10
runs started by hand**, until the owner is back. No tag, no release, no image or screenshot publishing, no merge to
`main`. If the budget runs out before *Guide screenshots* passes, pushing stops, the lead decides whether what fails
can wait, and it goes first in the report for the owner. **No issue is opened on the public repository for this
unit or its phases:** the unit is tracked in the private planning repository, and public commits cite only the
existing public defect issues they fix.

**Documents.** The spec, this plan, the decision records, the boards and the guide changes are **committed on the
unit's branch without asking each time; the owner reviews them in full on return**, before anything merges.

**Security.** Anything found that weakens a trust boundary is fixed in the unit and reported. Something that cannot
be fixed here stops that phase, goes first in the report, and the owner is sent a push notification if it stops the
unit.

**Tests first.** Every behaviour change starts from a test that fails without it. Where Cloud's side is needed, a
stand-in plays it: a stand-in controller for part B (it signs, seals and pins with core's real primitives), a stand-in
Cloud server for part C.

## Decision records

| | Records |
|---|---|
| **Written by this unit** | Five, listed in the spec's *Decision records*, numbered from adr-0130, written as each decision's phase builds it |
| **Revisits** | ADR-0116 (the `cloud` flag goes; the rule stands) · host management's spec §7 (remote access on Cloud's own machines) |
| **Depends on** | ADR-0114, ADR-0115, ADR-0117 |

## Key decisions

| Decision | Why |
|---|---|
| The `cloud` flag is removed; each Cloud feature is gated by its own condition (owner) | Cloud is offered from the first release; a blanket switch hides it all. Nothing is held back (owner): a flag fixed into a build cannot choose who sees a feature |
| Sam is made a fleet admin in the guide's sample | The guide is written for an admin who sees Health now and the support bundle; the recipe follows the screen |
| The Fleet Console is captured against a typed sample of its API | The capture runner has no host service; typing the sample with core's types makes drift fail the typecheck |
| Images stay private until the first release; machines that pull them use registry credentials (owner) | A month before launch the code stays closed. The credential is read-only, and is revoked when the packages go public |
| Registry credentials may sit in a staging machine's start-up settings (owner) | The host service image must be pulled before any sealed channel exists; the credential can reach only images that will be public |
| Pre-release tags publish images too | Cloud's staging must bring a machine up before `v1.0.0` |
| The versioned package is built in phase 2 | Phase 2's work needs it; phase 3 adds the connection protocol to the same package |
| The connection uses device approval and signed tokens (RFC 8628, RFC 7523), sign-in OpenID Connect with PKCE | Established standards, no long-lived secret shipped or sent |
| Notifications through Cloud are left out | Their boundary needs a design of its own and Cloud's delivery service |

## Work breakdown

5 phases. Phases 1 and 2 are independent; 3 rests on 2's connection; 4 shows what 2 and 3 built; 5 rests on nothing
but runs after 1 to keep the machine within its limits.

### Phase 1 — The guide and screenshots for a pre-release
**Delivers:** *Guide screenshots* passes on the branch, run by hand; every guide page matches its screen and has the
pictures it needs, the Fleet Console's included; the pre-release procedure is written.
**Starts when:** —
**Execution plan:** none — lanes: recipes and capture (1.1–1.4), Fleet Console capture (1.5), guide review (1.6),
workflow lint (1.7); 1.8–1.9 by the lead.

- [x] 1.1 The guide seed makes Sam a fleet admin; `diagnostics` captures Health now and the support bundle
- [x] 1.2 `agent-instructions` waits for its section before clicking; every recipe the desktop shell broke follows its screen
- [x] 1.3 The server's clock text is masked and the sample's dates fixed
- [x] 1.4 The capture environment sets `HQ_STORAGE_ROOT`, and the local stack the README describes does too
- [x] 1.5 Fleet Console recipes against a typed sample of its API, in the capture workflow and the name check
- [x] 1.6 Every guide page read against its screen: steps, words, screenshot names and alt text; recipes added where a page needs one
- [x] 1.7 `actionlint` and `shellcheck` on every workflow, findings fixed, a pull-request check added
- [x] 1.8 The pre-release procedure in the guide's README and the image release steps in `deployment.md`; the README asks for a star
- [x] 1.9 *Guide screenshots* passes on the branch, run by hand

### Phase 2 — The host service takes Cloud's controller
**Delivers:** on a machine enrolled with Cloud, the stand-in controller enrols, reconnects and gets an answer to
every operation in spec part B; on a machine an organisation runs, nothing changes.
**Starts when:** —
**Execution plan:** none — lanes: flag and images (2.1–2.2), connection (2.3–2.4, Opus), front door and backups
(2.5–2.6), hq's side (2.7–2.8, Opus), remote access (2.9, Opus), resize, window and package (2.10–2.12). 2.3 merges
before the lanes that need a connection are briefed.

- [x] 2.1 The `cloud` flag removed from core, hq, the host service, the Fleet Console and its screens; each Cloud feature gated by its own condition
- [x] 2.2 Pre-release tags publish images and the host service accepts them; registry credentials from `host.env` used for the pull and the signature check, tested against a local registry
- [x] 2.3 Enrolment by a one-time code with a `cloud` role kept apart from the Fleet Console's join; the code file spent and deleted; keys pinned both ways
- [x] 2.4 Reconnecting by machine id and a fresh signed first frame; one controller per machine; requests recorded as Cloud's; works with hq down
- [x] 2.5 `frontDoor.set` with a given certificate and files host: no ACME, the files host kept through `address.set` and install
- [x] 2.6 `backup.location.set` to an S3-compatible store with short-lived credentials, renewal, restore from the location, and pruning that expects a refused delete
- [x] 2.7 `site.register` and `site.unregister` in hq, by credential hash, repeatable; `erase` names the hq's address
- [x] 2.8 `account.firstLink`, `account.resetLink`, `account.adminInvite` in hq, each announced to every admin
- [x] 2.9 Remote access on Cloud's machines: `remoteAccess.csr`, `.on`, `.off`, `.authenticator.add`, the allow list, the stop at `until`, the announcement in hq
- [x] 2.10 `resize.prepare` and `resize.finish`, runs paused across a restart
- [x] 2.11 `upgrades.set` from Cloud, with the window's time zone and its scheduled fixes moved or cancelled
- [x] 2.12 `@agenthix/core` built and versioned as a package, with a publishing workflow that runs from a tag
- [x] 2.13 Decision records: the flag, remote access on Cloud's machines, account links, registry credentials; host management's spec §7 amended

### Phase 3 — An hq connects to Agenthix Cloud
**Delivers:** against a stand-in Cloud server, an hq connects on an admin's approval, gets tokens by signing, offers
sign-in with an Agenthix account without depending on it, disconnects cleanly, and asks Cloud to email members
about a scheduled change.
**Starts when:** 2.3 has merged.
**Execution plan:** none — lanes: the protocol and connecting (3.1–3.2, Opus), sign-in (3.3, Opus), downtime email
(3.4).

- [x] 3.1 The connection protocol in core: device approval, signed token requests, disconnect; the stand-in Cloud server
- [x] 3.2 hq connects and disconnects from the Fleet Console's HQ page; tokens refreshed by signing; nothing secret shipped
- [x] 3.3 Sign-in with an Agenthix account: linking in Settings › Sign-in, OpenID Connect with PKCE, hq's own session after, the fallback on disconnect
- [x] 3.4 The email the day before a scheduled change, asked of Cloud through the connection
- [x] 3.5 The decision record for the connection
- [x] 3.6 HQ told when Cloud runs its machine; Cloud connects such an HQ with no code (`organisation.key`, `organisation.connect`)

### Phase 4 — What the platform shows of Cloud, and the pledge
**Delivers:** every platform outcome in spec part D, drawn on the boards and built.
**Starts when:** phases 2 and 3 are done.
**Execution plan:** none — the boards first (Opus), then lanes: hq's screens (4.2–4.4), the Fleet Console's (4.5),
the pledge (4.6).

- [x] 4.1 Boards for every new screen and state, light and dark, committed under `boards/`
- [x] 4.2 "Sign in with Agenthix Cloud" on sign-in and invitation pages, greyed out with its reason when not connected
- [x] 4.3 Settings › Sign-in, *Ask a fleet admin*, the organisation switcher with *Start your own organisation*
- [x] 4.4 The dismissible offers to fleet admins, Organisation › Infrastructure's line, Setup › Review's sentence
- [x] 4.5 The Fleet Console's Cloud section in each state, the count of people who asked, links out and back
- [x] 4.6 The pledge card, the README section, the guide paragraph and the Agenthix Cloud guide page
- [x] 4.7 The pledge card's words and its states for a linked account; the person's own signature in Settings
- [x] 4.8 The command line's Cloud commands do what they say: connect and disconnect from HQ's machine, remote access off, a fleet admin's authenticator started over

### Phase 5 — A client other than the browser
**Delivers:** every item of spec part E that is in scope.
**Starts when:** phase 1 is done.
**Execution plan:** none — one lane.

- [x] 5.1 A phone's session slides forward with use and lapses after 30 days unused, from pairing and from a password
- [x] 5.2 Settings › Devices and connections › Phone lists a person's phones and signs one out
- [x] 5.3 A liveness event hq acknowledges
- [x] 5.4 hq's version for a signed-in client, `/health` unchanged
- [x] 5.5 Socket events when notifications, *needs you* counts or runs change

### The close
The full regression; the QA contract for what was built; the guide and architecture documents brought up to date;
the decisions waiting for the owner, the release-blocking one first; the report.

## Deviations

| Change | Why |
|---|---|
| The guide sample's fixed date moved to Monday 2027-04-12 (1.3) | Any fixed date the real clock has passed made the automation seed shift by real weeks; a date ahead of the clock keeps every picture the same run to run. Every picture changes once. It must be moved forward again before the real clock reaches it |
| `@agenthix/core` is published under the repository owner's scope on GitHub's npm registry while the repository is private (2.12) | That registry requires the owner's scope; the workflow renames it at publish time, and pre-releases publish under the `next` tag |
| Pre-release images run but are never offered as an upgrade by themselves (2.2) | A machine is pointed at a pre-release deliberately; automatic offers stay on releases |
| The guide's server-clock text is rewritten to the sample's values, not masked (1.3) | Grey boxes read as a broken screen; the rewritten words read as an ordinary one and stay the same run to run |
| hq's own machine in the capture is named as in the sample (`HQ_MACHINE_NAME`) (1.1) | The runner's host name showed in several pictures |
| A Fleet Console card's title no longer shrinks under its help link (1.6) | Found in the pictures: *Protection* was drawn under *How this works* at the guide's width |
| The on-screen *Harness* on an agent's settings reads *Runtime* (1.6) | A word the product keeps for code was on screen; the guide said "runtime" already |
| Remote access's key and authenticator secrets are kept in the Fleet Console's state, not the host service's (2.9) | TLS ends and codes are checked there; the host service passes them on and keeps nothing |
| IPv6 addresses in remote access's allow list are refused for now (2.9) | The Fleet Console's network has no IPv6, so such clients arrive from its gateway and fail closed; giving it IPv6 changes every install's network |
| The `pledge` flag, and with it the flag module, is removed; the pledge card is on in a release (2.1, 4.6) | The pledge and the platform go live together on 17 November (owner) |
| HQ is told when Cloud runs its machine, and Cloud connects it with no code (3.6, ADR-0135) | Found at the close: nothing told HQ, so the *HQ on Agenthix Cloud* state never showed, and a Cloud customer had to approve a code for an HQ Cloud already knew (owner) |
| The pledge card asks Cloud whether a linked person signed, and fits its state to the answer (4.7) | The owner's call at the close: someone who signed is not asked again in every HQ, a linked person signs in one step, and a new version reaches signers; the pledge's design had hq call no one |
| The command line's Cloud commands work instead of saying the machine is not enrolled (4.8) | The owner kept them as a way to do it by hand; `console remote on` only says Cloud turns it on, since Cloud issues its certificate |
| The early-access state of the Cloud section is not built (4.5) | Whether connecting needs an early-access place is still open; a device approval cannot wait days |
| Links out to Cloud carry the path and entry point only, never hq's address (4.x) | The spec's rule that nothing names the organisation outranks the return address |
| Accepting an invitation still asks for a password; the Agenthix account is linked afterwards (4.2) | Signing in with Cloud is never the only way in |

## Closing note
