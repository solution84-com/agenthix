---
name: User Stories — cross-cutting
description: Business-level requirements that span more than one module. Each story maps to acceptance criteria in multiple modules' scenarios files.
updated: 2026-10-27
---

# User Stories — cross-cutting

> Stories that span more than one module (e.g. auth + site + hq).
> Audience: business readers — no implementation detail.
> Story ids are shared across every stories file; the next free one is `next-us` in [`hq.md`](hq.md). Which scenarios fulfil each criterion is recorded on the scenarios (`· fulfils AC-NNNx`), never here.

---

## Versions between the parts (added 2026-10-21)

Written from the finished code at the close of the version baseline unit.

### US-348 — Keep every part working while each is upgraded in its own time

As an organisation that runs HQ, sites, a Fleet Console and phones that are each upgraded when their owners choose, I want a part one major version apart from another to keep working with it, and a part too far apart to be refused with a plain reason, so that an upgrade never breaks something silently.

**Acceptance criteria:**
- AC-348a: HQ and a site, the Fleet Console or Agenthix Cloud and a host service, and HQ and Agenthix Cloud keep working together while their protocol versions are at most one major apart; two or more apart, the connection is refused with a message naming both versions and the part that must upgrade, and the screens say which.
- AC-348b: the mobile app learns HQ's release and protocol version before anyone signs in, keeps working with an HQ one major apart, and is refused by one too far apart with a reason it can show — update the app, or ask an admin to update HQ; a browser, or an app that states no version, is always served.
- AC-348c: something a part one minor version ahead sends that the other does not know — a field, a reason, an event — is ignored, never refused.

---

### US-349 — Change what one part sends another without breaking it unseen

As a contributor changing a message, an operation or an event another part receives, I want a test to tell me whether my change needs the protocol version to move, and which way, so that no part is broken by a change nobody noticed.

**Acceptance criteria:**
- AC-349a: everything each connection carries is declared in one shared place, field by field — the site's methods and events, and every operation and event the mobile app relies on — and HQ is checked to still have every one the mobile app relies on.
- AC-349b: a committed record of each connection's shape fails a change that does not move the version: an addition needs the minor to move, a break the major.
- AC-349c: nothing is removed without first being marked deprecated, and the mark says the version it was deprecated in, the version it stops working in (two majors on) and what to use instead.

---

### US-350 — Use HQ at a network address over plain http

As a member of an organisation whose HQ is reached at a network address without https, I want everything that can work there to work, and what cannot to say why, so that a plain install is usable from the first day.

**Acceptance criteria:**
- AC-350a: I can start a conversation and send messages from HQ at a network address over plain http.
- AC-350b: features a browser gives only to a secure page, such as voice and dictation, are greyed with the reason — they need https or `localhost` — rather than failing.
- AC-350c: the install tells the machine admin, when HQ is installed at such an address, that voice and dictation will not work there and how to have them.

---

## Releases and the tests behind them (added 2026-10-21)

### US-351 — Release only what was proved

As a maintainer, I want everything a release publishes to have been built, started and installed before the tag, so that a tag never publishes something broken.

**Acceptance criteria:**
- ~~AC-351a: the product has one version, carried by every module, and a release tag must name it.~~ **Retired 2026-10-24** — no module carries the version any more; the tag gives it at publish (AC-370a).
- AC-351b: before the tag, the product is installed from its own images at a network address over plain http and used in a browser, with no real model called.
- AC-351c: every image, for both architectures, is started and made to answer before it can be published, and is never sent if it does not start.
- AC-351d: the tag publishes only what a release build proved for the tagged commit — the checks, the images, the install test and the guide's screenshots — and refuses otherwise, saying what to do; once published, the release has its page.

---

### US-352 — Run the tests without reaching beyond them

As a contributor, I want the tests to call no model or voice provider, write nothing outside the repository and the temporary folder, and touch nothing on the machine they did not make, so that running them costs nothing and cannot damage an install or my own files.

**Acceptance criteria:**
- AC-352a: a test that reaches a model or voice provider fails, naming the test and the host.
- AC-352b: HQ's tests keep their files in a temporary folder of the run's own.
- AC-352c: the container tests act only on what carries their own namespace, and refuse, touching nothing, on a machine where they cannot run safely.

## Ports for people who build and test Agenthix (added 2026-10-24)

Written from the finished code at the close of the one port plan unit.

### US-368 — Know every port in one place, and run development and tests without clashes

As a contributor, I want every port and address block written once and tests and development servers that never fight each other or an installed copy for one, so that I can run what I am working on beside anything else on my machine.

**Acceptance criteria:**
- AC-368a: every port and address block comes from one file, and the document that lists them is held equal to it by a test.
- AC-368b: a development script that would use a taken port refuses, naming the port and its holder.
- AC-368c: tests that start servers take free ports, and two cross-app runs never share the test databases.
- AC-368d: the install test installs as a test installation, on free ports, beside whatever is installed.

## The release cycle (added 2026-10-24)

Written from the finished code at the close of the release cycle unit.

### US-371 — Build each image once for its content

As a contributor, I want an image built once for the code it is made from and reused until that code changes, so that a change to one part does not rebuild the others and the same code is not built again and again.

**Acceptance criteria:**
- AC-371a: one list names the images a release ships and what each is built from, and a test fails when an image's build reads something the list does not name.
- AC-371b: each image has a content key that changes when, and only when, something it is built from changes.
- AC-371c: the local image start test builds only the images whose content changed.
- AC-371d: security updates reach an image whose code has not changed, on a schedule, without a person remembering.

### US-372 — Run only the checks a change reaches

As a contributor, I want a change to run the checks for the code it reaches, once for the same code, so that a small change gets its answer quickly and a pull request cannot merge on checks that did not run.

**Acceptance criteria:**
- AC-372a: a change selects the checks of the module it is in and of every module that depends on it, and anything not known to be safe selects every check.
- AC-372b: the one required check fails when a check that should have run did not, or one that should not have run did.
- AC-372c: code that already passed is not checked again, and the run says which commit proved it.

### US-373 — Release a proven build by giving it a name

As a maintainer, I want a release to be a build that was proved and then named, so that what is published is exactly what was started and installed, and a release costs one run of the release bar.

**Acceptance criteria:**
- AC-373a: the release build builds, starts and vouches for each image once, reuses only an image it vouched for, and leaves a record of what it built.
- AC-373b: the tag promotes only images from a run that proved its commit, whose origin and content are checked against the tagged commit before anything is signed, and builds nothing.
- AC-373c: each release page carries a record of what was published.
- AC-373d: the install test installs the images the release ships, never images built again for it.
- AC-373e: the whole release bar can be rehearsed on a development machine before anything is pushed.
- AC-373f: the registry is cleaned of what no release needs and keeps everything a release record names.

## The lead against a real model (added 2026-10-26)

Written from the finished code at the close of the agent knowledge unit.

### US-389 — Check the lead against a real model before a release

As a maintainer, I want to check the conversation's agent against real models before a release, so that a change to its instructions or tools cannot quietly make a model stop looking in the right place.

**Acceptance criteria:**
- AC-389a: the checks send a model exactly what a real turn sends, in a fixed world, and grade only the tools it called and what it said: questions about the product, the person's own space, a place not in the conversation, a correction to a page, and the place's own process.
- AC-389b: the checks run on demand and before a release, never in the everyday test suites, and call nothing when no model is set up.
- AC-389c: a check passes for a model only when every run of it does, and the key used is never shown.

## Files, carried by relays (added 2026-10-27)

Written from the finished code at the close of the unit *seeing the agents' work*. hq decides, relays carry, sites hold and run: hq checks who may open a file and signs a short-lived ticket for it, a relay carries the bytes from the site, and the site serves only what the ticket names.

### US-397 — Trust that a file opens only for who may see it, and costs hq nothing

As an organisation that runs hq, I want every file an agent made to open through a relay on a ticket for that one file, so that nobody sees what they may not, a hostile file cannot act as the person who opens it, and an organisation's hours of work with many agents never make hq the bottleneck.

**Acceptance criteria:**
- AC-397a: a new installation opens files with nothing to set up: hq's relay starts with hq and answers on the files address, or, where there is none, on a path of hq's own address that serves downloads and text and never anything inline.
- AC-397b: no file byte passes through hq's server: hq answers the facts and a link, and the relay carries the bytes.
- AC-397c: a link is a ticket hq signed for one file, one person's opening and one purpose, good for minutes and dead once the file changes; no one but hq can make one, and nothing logs it.
- AC-397d: a site serves only the file a ticket names, inside the place it names: a path that climbs out, a link that leads out and another owner's file give nothing, and a relay reaches no other file.
- AC-397e: a file an agent wrote cannot act as the person opening it: it is served from another address that holds no hq session, with the browser told not to run or sniff it, and no other page can read it.
- AC-397f: limits keep a flood away: what is drawn of a file is bounded by kind, a person has a bounded number of streams, a site a bounded number of reads at once, and a slow reader holds only its own stream.
- AC-397g: hq records who opened which file, at which version and when, and whether to preview or download.
