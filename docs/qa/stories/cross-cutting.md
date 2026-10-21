---
name: User Stories — cross-cutting
description: Business-level requirements that span more than one module. Each story maps to acceptance criteria in multiple modules' scenarios files.
updated: 2026-10-21
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

As a maintainer, I want everything a release publishes to have been built, started and installed on its release branch before the tag, so that a tag never publishes something broken.

**Acceptance criteria:**
- AC-351a: the product has one version, carried by every module, and a release tag must name it.
- AC-351b: before the tag, the product is installed from its own images at a network address over plain http and used in a browser, with no real model called.
- AC-351c: every image, for both architectures, is started and made to answer before it can be published, and is never sent if it does not start.
- AC-351d: the tag publishes only what its release branch proved — the checks, the images, the install test and the guide's screenshots — and refuses otherwise, saying what to do; once published, the release has its page.

---

### US-352 — Run the tests without reaching beyond them

As a contributor, I want the tests to call no model or voice provider, write nothing outside the repository and the temporary folder, and touch nothing on the machine they did not make, so that running them costs nothing and cannot damage an install or my own files.

**Acceptance criteria:**
- AC-352a: a test that reaches a model or voice provider fails, naming the test and the host.
- AC-352b: HQ's tests keep their files in a temporary folder of the run's own.
- AC-352c: the container tests act only on what carries their own namespace, and refuse, touching nothing, on a machine where they cannot run safely.
