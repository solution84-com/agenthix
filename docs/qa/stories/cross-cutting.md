---
name: User Stories — cross-cutting
description: Business-level requirements that span more than one module. Each story maps to acceptance criteria in multiple modules' scenarios files.
updated: 2026-11-14
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
- AC-371d: security updates reach an image whose code has not changed at least once a month, as part of releasing, without a person remembering.

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

## Features that are not on (added 2026-11-03)

Written at the close of the unit *live preview*, from the finished code. A feature that is not ready is behind a flag with a stage; one rule decides whether it is on, every program asks that rule, and an organisation's admin may switch a beta on or a feature new in this release off (stories US-424 and US-425 are the admin's and the developer's side, in [`hq.md`](hq.md)). The live preview is the first flag, at experimental, so a release that has it off keeps everything else.

### US-426 — Know that a feature that is off is closed everywhere

As an organisation that runs hq, I want a feature that is off to be out of sight and to refuse everywhere, so that unfinished work cannot be reached, run or billed by accident, and code work on branches is unaffected.

**Acceptance criteria:**
- AC-426a: one rule in core decides from the feature's stage, the kind of build and the organisation's switches; every program asks it; a deployment that forgets to say what it is counts as production.
- AC-426b: hq's screens hide what is off, and hq's server refuses its operations, routes and socket handlers as not available, doing nothing and saying nothing was changed.
- AC-426c: an agent is given no tool of a feature that is off, and what it is told says nothing of the feature.
- AC-426d: a site refuses the feature's methods and a relay its addresses, taking hq's word for two things only: a beta switched on and a new feature switched off; an agent cannot reach the switches.
- AC-426e: with live previews off, the workspace view, the lead's offer, the Fleet Console, the agents' app tools, the site's methods and the relay's app addresses show and do nothing of them, while branches, Git, merging, versions and *Restore* work as without them.

### US-427 — Test what ships, and see experiments apart

As a maintainer, I want every test to run as the product ships and a feature's own tests to switch it on, so that unfinished work cannot break what ships and nobody is stuck by an experiment they do not know.

**Acceptance criteria:**
- AC-427a: each test runs with every flag at its production value; a feature's own tests switch its flag on for their group with one helper and nothing switches a flag on globally.
- AC-427b: the tests that a feature is hidden and refuses while off always block a merge, and hold in the run with every flag on.
- AC-427c: a failing test of a feature at experimental is reported, not blocking, and the run's summary lists it by the flag's name; from preview on a feature's tests block like any other.
- AC-427d: the full regression adds one run of the end-to-end and cross-app suites with every flag on, to catch features that clash.

### US-428 — Remove a flag in time

As a maintainer, I want a release refused while a feature released in an earlier minor release still has its flag, so that flags do not pile up and the off path of a finished feature is not kept for ever.

**Acceptance criteria:**
- AC-428a: the release rehearsal and the tag's publishing refuse a version while a flag released in an earlier minor or major release is still listed, naming each flag and what to do.
- AC-428b: a patch or pre-release of the flag's own minor release does not count; a pre-release of a later minor does.

---

## Every screen's states and messages (added 2026-11-11)

Written at the close of the unit *a softer, more polished design system*, from the finished code, for hq and the Fleet Console alike.

### US-456 — Tell at a glance what is chosen, focused or unavailable

As a member or an admin, I want every screen to show what I have chosen, what I am on and what I cannot use in the same calm way, so that the product reads as one finished thing.

**Acceptance criteria:**
- AC-456a: what I have chosen never looks inactive: one of a small set is raised, a chosen row is a grey fill in full ink, a thing switched on is indigo, and a chosen card has a firm dark edge.
- AC-456b: a control answers me — a step on hover and another when pressed — and shows a ring when I reach it from the keyboard, never on a click; a field shows its focus by its own edge.
- AC-456c: a control I cannot use is faded and does not react when I point at it.
- AC-456d: indigo means only the main button, a link or something switched on.
- AC-456e: these looks hold on every screen of HQ and the Fleet Console, and the looks they replaced do not come back.

### US-457 — Be told what needs me without the page moving under me

As a member or an admin, I want a problem told to me in one place and a control I cannot use to say why itself, so that nothing pushes the page about and I always know what to do.

**Acceptance criteria:**
- AC-457a: when something I just pressed did not work, a dialog in the middle of the screen says what, with Close and Try again where trying again can help; the page does not move. *(Changed 2026-11-11: only what I pressed; US-464 to US-467.)*
- AC-457b: a control I cannot use for a known reason is greyed, says why when I point at it or reach it from the keyboard, and pressing it explains in the dialog, with any way on it offers.
- AC-457c: a mistake in a field I am filling in is said under that field.
- AC-457d: a page that is not there, or not mine to see, says so as the page itself, in HQ's words, and never as HQ not answering.

Written at the close of the unit *kinds of error message*, from the finished code, for hq and the Fleet Console alike.

### US-464 — Carry on when a screen cannot read something for a moment

As a member or an admin, I want a screen that could not read something to try again by itself and only then tell me, without covering what I am doing, so that a passing hiccup never stops me.

**Acceptance criteria:**
- AC-464a: a read that fails once shows me nothing; it is tried again quietly, and nothing is said while it is.
- AC-464b: when it keeps failing and I have nothing on screen yet, a line where the content would be says what could not be read, why, and offers Try again; when I already have it, the content stays and the meta line says *Not up to date* with the time it was read, only once it is a minute old.
- AC-464c: a page that is not there, or is not mine, says so in its own words with no Try again, and is not asked for again.

### US-465 — Know about HQ or a site being away without being stopped

As a member or an admin, I want to be told when HQ, a site or a scheduled change affects my work, in a place that does not stop me, so that I can carry on with what still works.

**Acceptance criteria:**
- AC-465a: a site that did not answer is named in a quiet line where its things would be; HQ not answering is one line under the screen bar; neither is a dialog.
- AC-465b: while that line says HQ is not answering, the screens do not add their own lines about the same.
- AC-465c: moving between pages while HQ is away never replaces the app with an error box; I stay where I am.
- AC-465d: a scheduled change reaches me as a notification, and my project's site line says the time of it.

### US-466 — See what went wrong in the conversation where it happened

As a member, I want a conversation's own failures shown in its thread and a message that did not go to stay in my box, so that I never lose my words or send twice.

**Acceptance criteria:**
- AC-466a: Stop, Retry, a card's button, Approve or Deny, reading an answer aloud or earlier messages that did not load say so as a line after the last message, with Try again, and the line goes when it works or I reload.
- AC-466b: a message that could not be sent stays in the box as *Not sent*, with why and Send again; a new conversation that could not start is a dialog and my words stay.

### US-467 — Be asked before what cannot be undone, and told when a press did not work

As a member or an admin, I want one clear question before something I cannot take back, and a dialog with Try again when something I pressed failed, so that I know what happened and what to do.

**Acceptance criteria:**
- AC-467a: when a press fails, a dialog says what and offers Try again where it can help; a field's refused value is said under the field.
- AC-467b: before deleting, stopping or starting work at once, widening reach, a merge or removing a safety check, one dialog asks, naming the action, with Cancel; the browser's own boxes are never used.
- AC-467c: when something worked and the screen does not show it, a short toast says so and goes by itself; an error is never a toast.

### US-478 — Have an install that is not a demo untouched by the demo

As the person who installs Agenthix for an organisation, I want everything the demo adds to be absent unless the install is a demo, so that my organisation never meets a script, a guard or a countdown.

**Acceptance criteria:**
- AC-478a: the demo is on only when `DEMO_MODE` is exactly `true`; unset, empty or anything else is off, and it is read once, at start, written only by the host service.
- AC-478b: with it off the guard passes everything, the entry route is not there, the demo's information says only that it is off, no script, seed or clip is read, models and voices reach their vendors as before, the site runs its harnesses and Docker as before, the voice socket's events reach the voice service, and files keep their own disposition.

## Agenthix Cloud waits behind a flag (added 2026-11-14)

Written at the close of the unit *0.1.0-alpha.4*, from the finished code (ADR-0189, which supersedes ADR-0130). A release ships before Agenthix Cloud's service opens, so every part that offers or uses it is behind one flag at preview.

### US-490 — Be offered no service that has not opened

As the person who installs Agenthix for an organisation, I want a release to offer, name and call nothing of Agenthix Cloud until its service opens, so that no one in my organisation is shown a service they cannot use.

**Acceptance criteria:**
- AC-490a: one flag, `cloud`, holds Agenthix Cloud back in every part; at preview it is off in a released build whatever an organisation's switch says, and on in development.
- AC-490b: with it off hq offers no connecting to Cloud, no Cloud as a provider, no signing in with an Agenthix account, no Cloud offers and no *where HQ runs*, refuses what asks for any of them, and asks Cloud nothing of its own accord; the sign-in pages show no trace of it, not even for a moment.
- AC-490c: with it off a site relays no model call to Cloud.
- AC-490d: with it off the host service ignores Cloud's settings and takes no enrolment, offers no `agenthix cloud` commands, and the Fleet Console offers no Cloud, no remote access to switch on and no code to set up; remote access that is already on can still be turned off.
- AC-490e: with it on, in development, all of it works as before.

## Failures said in words (added 2026-11-14)

Written at the close of the unit *what agents can do*, from the finished code. Every failure dialog and held-back line of hq and the Fleet Console's screens says what happened in words, never a request's address.

### US-494 — Be told what happened when a press fails

As a member or an administrator, I want a failed press to say that the server did not answer, or that something went wrong in it, or what it said, so that I never read a request's address or a status line.

**Acceptance criteria:**
- AC-494a: when HQ cannot be reached the dialog says *HQ did not answer.* with Try again, and when HQ failed with no words of its own, *Something went wrong in HQ.*; when HQ wrote words for it, those words.
- AC-494b: the Fleet Console's screens say it the same way for their own server, named in the sentence.

### US-496 — Keep outside software current and consistent

As a maintainer, I want every outside dependency kept within what the others require of it and brought up to date as part of releasing, so that each release carries the month's fixes and nothing installs versions nobody committed.

Written on 2026-11-15 from the finished code at the close of the dependency-updates unit.

**Acceptance criteria:**
- AC-496a: a change that breaks a dependency rule — an exact version off the allowed list, a switched-off peer check, two versions of TypeScript, esbuild or Prisma, Node's types off Node's major, TypeScript's range wider than patches, an outside image without a digest — fails Checks, naming the module, the file and the rule.
- AC-496b: the month's minor and patch updates are made together, within each package's ranges, moving only lockfiles, digests and action commits, and reach main only once Checks pass on them.
- AC-496c: *Retired 2026-11-15*: Release no longer takes the updates itself; the monthly dependency updates are made on the dev machine (AC-496f).
- AC-496d: every install, in CI, the images and a new checkout, installs exactly the committed lockfile, and CI fails when one changes it.
- AC-496e: a dev start stops when the branch is behind GitHub and installs a module whose lockfile changed, without pulling.
- AC-496f: the repository itself says when the monthly dependency updates are due: from the 1st at every dev start and at the top of the full and affected regressions, and Release stops while the month isn't done (Checks does not enforce it); a dry run and a patch release never wait for them.
- AC-496g: every security alert gets a decision — fixed, dismissed with a reason, or deferred to a named month — a critical or high one in shipped code within 7 days, reminded at every dev start and at the top of the full and affected regressions from the alert's opening, and Release stops after the 7 days (Checks does not enforce it).

