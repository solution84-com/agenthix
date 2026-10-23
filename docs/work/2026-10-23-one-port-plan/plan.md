---
created: 2026-10-24
description: How the one port plan is built — the ports file and our convention first, then an installation that owns its published ports, address slice and identity, then every test run beside dev, then the documents and the decision record — four phases, carried out as lanes off one branch.
---

# Implementation Plan · One port plan

## Goal

Build what the [spec](spec.md) describes: dev, every test and several installations on one machine with no port or
address clash, every published port the machine admin's choice, and every number from one file.

**In scope:** the spec's Rules 1–7 in this repository, the decision record it names, the documents it lists, and the
QA contract for what changed.

**Out of scope:** the other products' own changes under Rule 8, made in their repositories; reinstalling the
maintainers' own installed copies (done by hand when the unit lands); several installations per machine as a
configuration supported for people (spec, *Not in this unit*).

## Approach

**The file first, then the host service, then the tests.** The ports file in `core` holds every number the rest reads,
so it lands first and everything after is written against it. The host service's work comes next because the tests
that are real installations (the install test, the host container tests) need what it adds: a namespace chosen at
start, chosen published ports, and a check that tells installations apart. The test runs that are not installations
(the cross-app suite, hq's browser tests) need only the file, so they may start as soon as phase 1 has merged,
alongside phase 2.

**One record of what an installation chose.** `installation.json` in the state folder holds the namespace, the two
published ports and the agent slice; the same values go onto every container as labels, and those labels are what
another installation's check reads. The host service already records the namespace once and reads it back
(`host/src/state/namespace.ts`); `installation.json` replaces that file and keeps its write-once rule. hq's stored
settings keep the bind address they derive from hq's address; the port itself comes from `installation.json`, so
there is one place it is written.

**One check, called by every operation that publishes.** The check is one function in the host service: given the
ports and the slice an operation is about to use, it returns every problem, each with its holder. It reuses the front
door's bind probe (`host/src/frontDoor/probes.ts`) and `docker ps --all` with labels, which `hqContainers` already
reads. Every operation calls it before it writes anything and turns its answer into one `Refusal`; the one-hq
refusal in `install.ts` is removed in the same change. After a reboot the host service compares what should be
running with what is, and reports a container whose start failed for a taken port in its status and the Fleet
Console.

**The agent slice reuses the installation networks' allocator.** `host/src/compose/subnets.ts` already picks a free
block that overlaps no Docker network and no address of the machine; the agent slice is the same search over
`10.213.0.0/16` in `/20`s, with other installations' labels added to what is taken. The firewall rules
(`host/src/protections/`) read the installation's slice instead of the constant, and the site receives it through
`AGENT_NETWORK_RANGE`, which it already reads.

**Tests ask for free ports and pass them on.** The cross-app harness and the guide's screenshot workflow bind port 0
to learn a free port, then start hq, the site and the fakes with it; hq's browser tests run against an hq already
running, and only their stand-in model moves. The cross-app suite's fakes already do this
(`tests/cross-app/harness/fakeVendor.ts`).

**Clean slate.** Nothing reads `namespace.json`, the console's old 4300 or the old defaults once this lands; an
installation made before it is uninstalled and installed again (spec, *Versioning and old state*).

**Lanes, merged by the lead.** Each phase runs as lanes (`running-lanes`): one purpose, one branch and worktree, one
agent each, merged into `feature/one-port-plan` by the lead one at a time, each squashed into one commit, rebased
first and fast-forwarded. Phase 2's lanes run in sequence where they touch the same install path (2.1–2.3, then
2.4–2.7) and beside it where they do not (2.8–2.9). The lead runs the suites lanes may not: the integration suites,
the cross-app suite, hq's browser tests, the host container tests and anything that starts Docker. The full
regression runs once, before the unit merges.

**Models.** Opus for the check (2.4–2.6), the agent slice and the firewall rules (2.8–2.9) and the installation's
identity (2.1), which decide what may run beside what and which agents a firewall covers. Sonnet for the ports file,
the flags and commands, the dev scripts, the tests and the documents. Each brief names its model.

**Resources.** The machine has 24 GB of memory and 10 cores, and runs an installed copy whose ports and firewall the
host container tests must not touch.

- *Contended:* memory and CPU (typechecks, tests, Wasp builds), Docker, the installed copy's ports and firewall table,
  the shared test databases, and `host/src/install/` and `host/src/compose/`, which most of phase 2 touches.
- *One at a time:* anything that starts Docker or fixed ports, run only by the lead. Lanes run the unit tests of what
  they changed and the typecheck of the modules they touched. At most **three lanes at once**, never two editing the
  same file.
- *Watched:* free memory, swap and load sampled every 30 seconds into the unit's scratch folder. Warning at free
  memory under 4 GB or load over 16; critical at free memory under 2 GB or memory pressure critical. An alert at
  each, and again on recovery.
- *At a limit:* at a warning no new lane starts; at critical the Sonnet lanes pause first, newest first.

**The proof** that the spec's *Done when* holds is run by the lead once phase 3 has merged: an installed copy, dev, the
cross-app suite, hq's browser tests, the install test, the host container tests and a test installation reached from
a phone, all at once on this machine.

**The owner's walkthrough** comes at the end of phase 3: the installed copy reinstalled fresh on 7800 and 7801, a
test installation beside it reached from a phone, and the dev stack and the test runs going at the same time.
Findings become fix lanes on the branch.

**Landing.** The branch is regrouped into a few ordered commits, fixes folded into what they fix, with a backup branch
first, and merged to `main` with `--no-ff`, on the owner's say-so.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0107 (the host service holds a machine's authority), ADR-0108 (at most one hq and one site per machine), ADR-0035 (test data isolated by database name): all Accepted |
| **Implements** | The new record *An installation owns its published ports and address blocks* (4.5) |
| **Revisits** | None: ADR-0108 stands as the supported configuration, and the new record points to it |

## Key decisions

| Decision | Why |
|---|---|
| The machine admin chooses each published port, recorded at install and kept | The product does not own the machine; stability comes from recording the choice, not from a fixed number (owner, 2026-10-24) |
| Our own numbers by one convention: 41 hq, 42 site, 43 Fleet Console; 00 web page, 01 server, 09 database | Ports inside containers never clash, so they only need to be easy to remember; it matches today's hq and site |
| Tests take free ports | Nobody types a test's address; no run can clash with dev or with another run |
| Defaults 7800 and 7801 | Within 1024–32767, the quietest hundred in the registered range, far from our own numbers, one pair to remember |
| A `/20` agent slice per installation | 4,096 addresses: sixteen installations with a site per machine, 512 agent containers at once per site |
| `installation.json` holds the choices, labels carry them to other installations | The state folder is the installation's own record; labels are what another host service can read |
| One check function, called by every operation that publishes | Seven operations with seven checks would drift; one function returns every problem with its holder |
| Not one prefix per stack, or per installation | An installation publishes two ports; one taken port would move a whole hundred (owner, 2026-10-24) |
| Not a range of ten ports with fixed slots | The same objection at a smaller size; a port per service is what the admin needs to move |
| Not ports taken at random for installations | An installed hq's address is what people type and the mobile app stores; it cannot move between starts |
| Not hundreds reserved for other products | Every product follows the same rules and keeps its own numbers clear of the platform's (owner, 2026-10-24) |
| Not a `/16` or `/18` agent block per installation | One or four installations per machine leaves no room for test installations; smaller than `/20` buys installations nobody needs |
| Not reading the old `namespace.json` | Before the first release candidate nothing carries old state forward |

## Work breakdown

Four phases. The seams: the ports file must exist before anything reads it; the host service must offer a namespace,
chosen ports and the check before the tests that are installations can use them; the documents describe what was
built, so they come last.

### Phase 1 — The ports file and our convention
**Delivers:** every number in one file in `core`, checked by a test; dev on the convention, every dev script and
configuration reading the file and checking its ports before it starts.
**Starts when:** —
**Execution plan:** none — lanes: the spec's Rules 1 and 7 are the acceptance and the files are few.

- [x] 1.1 The ports file in `core`: the convention, the published defaults and their bounds, the address blocks and the slice size, with its unit test
- [x] 1.2 The shell helper that prints the file as `NAME=value` lines for the dev scripts
- [x] 1.3 The Fleet Console's server on 4301, inside its container and in dev; console-web's dev server on 4300, its proxy target from the file
- [x] 1.4 hq's Vite and server ports from the file and the environment, Vite with `strictPort`
- [x] 1.5 The dev scripts (`pair.sh`, `fresh.sh`, `start.sh`, `db.sh`) reading the file, each checking its ports before it starts and naming the holder
- [x] 1.6 Dev's site agent block, `10.212.0.0/16`, in `site/.env.server.example`; the stale `HQ_ORIGIN` in `hq/.env.server.example` fixed

### Phase 2 — An installation owns its ports and its slice
**Delivers:** an installation whose namespace is chosen at start, whose two published ports are the admin's choice,
recorded and kept, checked before every operation that publishes, and whose agents are in a slice of their own.
**Starts when:** 1.1 has merged.
**Execution plan:** none — lanes: the spec's Rules 3–6 fix the behaviour and the refusal wording; the host service's
patterns (refusals, state files, compose generation) are established.

- [x] 2.1 `installation.json` in place of `namespace.json`; `INSTALL_NAMESPACE` at the host service's first start; the container-name check
- [x] 2.2 hq's and the Fleet Console's published ports from the installation, defaults 7800 and 7801; `--hq-port` and `--console-port` on `install`, `restore`, `console install` and a move received; an address and `--hq-port` that disagree refused
- [x] 2.3 Labels on every container the installation runs: its ports and its agent slice
- [x] 2.4 The check: bounds, another installation's labels, the bind probe naming a container or a program outside Docker, the agent slice; one refusal listing every problem
- [x] 2.5 Every operation that publishes calls the check before it writes, upgrades before they swap containers; the one-hq refusal removed
- [x] 2.6 A container that could not start for a taken port reported in `agenthix status` and the Fleet Console
- [x] 2.7 `agenthix console port <port>`, through the check
- [x] 2.8 The agent slice: a free `/20` of `10.213.0.0/16` picked at the site's first install, recorded, given to the site as `AGENT_NETWORK_RANGE`
- [x] 2.9 The firewall rules written for the installation's slice alone
- [x] 2.10 Status and command-line words naming the installation's own addresses, not fixed ones

### Phase 3 — Every test run beside dev
**Delivers:** the cross-app suite, hq's browser tests, the guide's screenshots, the install test and the host
container tests all running while dev and an installed copy run, proved together.
**Starts when:** phase 1 has merged for 3.1–3.2; phase 2 has merged for 3.3–3.5.
**Execution plan:** none — lanes: each test run is a small, separate change against the spec's Rule 2 and Rule 5.

- [x] 3.1 The cross-app harness on free ports, passed to hq, the site and its fakes; one run at a time holds the test databases
- [x] 3.2 hq's browser tests' stand-in model and the guide's screenshots on free ports, the `not-secure` project and the screenshot workflow included
- [x] 3.3 The install test as a test installation: its namespace by `INSTALL_NAMESPACE`, its ports chosen, no namespace file written by hand
- [x] 3.4 The host container tests on ports of their own and on `10.211.0.0/16`, no longer refusing while an installation runs
- [x] 3.5 The commands for a test installation in the running-locally skill, the mobile app's test hq as the example

### Phase 4 — The documents and the record
**Delivers:** every document describing what was built, one table of ports kept equal to the file, and the decision
recorded.
**Starts when:** phase 3 has merged.
**Execution plan:** none — lanes: documents against the spec, reviewed by the owner.

- [x] 4.1 `docs/architecture/ports.md`, and the test in `core` that keeps its table equal to the file
- [x] 4.2 `deployment.md` and `host-management.md`: installations, published ports, the check, test installations, the agent slice
- [x] 4.3 The user guide: 7800 and 7801, choosing other ports, the refusal and what to do
- [x] 4.4 The running-locally skill, the `AGENTS.md` files and `docs/CONTRIBUTING.md` linking to the ports document instead of writing numbers
- [x] 4.5 The decision record *An installation owns its published ports and address blocks*, pointing to ADR-0108
- [x] 4.6 The QA stories and scenarios for what changed, the tests that cover them tagged

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | None | — |
| 2 | Task 2.2 finished in a lane of its own (the host protocol's port fields and `console connect`'s flags), after the protocol snapshot was taught to tell apart messages sharing a tag by a second field. A walkthrough finding added a fix: on Docker Desktop the check publishes the port from a throwaway container, since the host service's own bind probe cannot see a program on the computer itself | The snapshot read an added optional field as breaking; the owner's walkthrough found a port held on the Mac not caught before publishing, and not named after a restart |
| 3 | hq's browser tests keep running against an hq already running (dev's by default); only their stand-in model takes a free port. The cross-app suite gained a lock so one run at a time holds the test databases. Spec Rule 2 corrected | Lane 3a found the browser tests never start an hq, so there was no hq of theirs to move; the busy-port guard the cross-app suite lost had also kept two runs off the shared test databases |
| 4 | None | — |

## Closing note

**2026-10-24.** Accepted by the owner after the walkthrough, every step of which passed once its two findings were
fixed. No full QA audit ran: the stories and scenarios this unit wrote (SC-1241 to SC-1254, US-365 to US-369) wait for
the audit before release.

- **Closed in the unit:** the Fleet Console's dashboard and menu now flag an hq that reports a problem while it reads as
  starting; a port held by a program on Docker Desktop is refused and reported; the container tests' two seeds record an
  installation and a slice; the install test reuses the image start test's images.
- **Deferred:** [#21](https://github.com/solution84-com/agenthix/issues/21) (the Fleet Console answering empty right
  after an install, once), [#22](https://github.com/solution84-com/agenthix/issues/22) (the cross-app model-usage test
  counting two rows, once), [#23](https://github.com/solution84-com/agenthix/issues/23) (two hq-move unit tests timing
  out under load), [#24](https://github.com/solution84-com/agenthix/issues/24) (the container tests' default image),
  [#25](https://github.com/solution84-com/agenthix/issues/25) (no free-disk check before image builds),
  [#26](https://github.com/solution84-com/agenthix/issues/26) (hq's chat-streaming browser test depending on earlier
  runs). None is critical; none blocks a release. The other products' parts under the spec's Rule 8 are tracked outside
  this repository.
- **Accepted, not queued:** two installations installing a site at the same moment could pick one slice (ADR-0145's
  Risks).
- **Records:** ADR-0145 written and annotated; ADR-0107, ADR-0108 and ADR-0035 still hold.
- **Full regression** on the branch: every module's typecheck and unit suite, hq's and the site's integration suites,
  the image start test, the install test and the host container tests pass; the cross-app suite passed 33 of 33 on a
  rerun after one failure (#22); hq's browser tests passed but for the chat-streaming spec (#26) once their seed data was
  in place.
