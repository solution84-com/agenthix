---
name: User Stories — host
description: Business-level requirements for the host service — what a machine admin, whoever can use Docker on a machine, needs from Agenthix on that machine. Written for business readers.
updated: 2026-11-02
---

# User Stories — `host/`

> Business-level requirements for the **machine admin**: whoever looks after a machine Agenthix runs on, by typing `agenthix` commands there. A machine admin is not an account in Agenthix.
> Audience: business readers — no implementation detail.
> Written on 2026-10-16 from the finished code at the close of the host management unit. Story ids are shared across every stories file; the next free one is `next-us` in [`hq.md`](hq.md). A retired story or criterion keeps its number. Which scenarios fulfil each criterion is recorded on the scenarios ([`../scenarios/host.md`](../scenarios/host.md)), never here.

---

## Installing and knowing how the machine is doing

### US-287 — Install Agenthix on one machine

As a machine admin, I want to install Agenthix with one command and one question, so that HQ, its site and the Fleet Console run on my machine and I can make the first account.

**Acceptance criteria:**
- AC-287a: I am asked only for HQ's address; HQ, its site and the Fleet Console start, and I get one link for the first account and a shortcut for later commands.
- AC-287b: an address that cannot work, or a missing piece of the setup, is refused before anything changes, saying what to fix.
- AC-287c: running it again is safe and changes nothing already set; no secret is printed or readable by anyone but the host service.
- AC-287d: on a release, only images whose signature checks are fetched and run.

---

### US-288 — Know how my machine is doing from the command line

As a machine admin, I want one command that tells me in plain sentences how HQ and the site are, so that I know what to do next without reading logs.

**Acceptance criteria:**
- AC-288a: `agenthix status` says how each thing is in a sentence that ends in what to do next, never in internal words, and fits my terminal.
- AC-288b: the commands I can type are listed, and a mistyped one points me at help.

---

## Keeping the machine safe

### US-289 — Keep agents off my machine

As a machine admin, I want agents kept away from my machine's own services, so that an agent cannot reach what it should not.

**Acceptance criteria:**
- AC-289a: agents cannot reach the machine's own ports, other containers' published ports or a cloud provider's credentials address, and this has no setting.
- AC-289b: when the protections cannot hold, I am told why and no agent starts until they do.
- AC-289c: I set how much each agent may use, within what the machine has.

---

### US-290 — Never lose more than a night's work

As a machine admin, I want my machine backed up every night and the copies kept somewhere else under a key only I hold, so that losing the machine does not lose the data.

**Acceptance criteria:**
- AC-290a: a sealed backup is taken every night, a missed night is caught up, and I see when the last one was.
- AC-290b: I choose a backup location; the key is shown once and the copies open only with it; I am told plainly when backups would die with the machine.
- AC-290c: I can export a backup sealed to a key made for it alone.
- AC-290d: a fleet admin can take or export a backup, but never choose where sealed data leaves my machine.

---

### US-291 — Bring a lost machine back

As a machine admin, I want to restore HQ or a lost site on a new machine from a backup, so that the organisation carries on after a machine is lost.

**Acceptance criteria:**
- AC-291a: HQ and its site come back on a new machine from the backup location or an export, with my key, and a wrong key changes nothing.
- AC-291b: a lost site comes back on a new machine with a fleet admin's code; my key never leaves the machine, and the site starts only once HQ takes it.

---

### US-292 — Upgrade without breaking anything

As a machine admin, I want upgrades checked, backed up and rolled back when they fail, so that an upgrade never leaves HQ or a site broken.

**Acceptance criteria:**
- AC-292a: an upgrade checks every image's signature, takes a backup, and goes back to the version before by itself if it does not come up healthy, and says so.
- AC-292b: fixes apply by themselves in a maintenance window I can move or turn off; a new version, or a fix that rolled back, never applies by itself.
- AC-292c: the host service upgrades itself, putting the old one back if the new one does not answer.

---

### US-293 — Schedule work on my machine

As a machine admin, I want to schedule, move and cancel maintenance with times in plain words, so that it happens when it suits the people who use Agenthix.

**Acceptance criteria:**
- AC-293a: I schedule, move and cancel with a time as I would type it, and it is said back in words.
- AC-293b: a change that was missed, failed or can no longer happen ends saying why.
- AC-293c: HQ and the Fleet Console hear of every change as it is scheduled and as it moves on.

---

### US-294 — Suspend, resume or erase HQ or a site

As a machine admin, I want to stop HQ or a site keeping everything, or erase it with a way back, so that I can pause or retire it without losing data by mistake.

**Acceptance criteria:**
- AC-294a: suspending stops it and keeps everything, members are told, and resuming starts it again.
- AC-294b: erasing HQ needs its address typed, takes a final backup kept 30 days, and can be undone within them; with a date, everyone sees a countdown.
- AC-294c: a site is erased on its own machine with its name typed; HQ's own site goes only with HQ.

---

## Joining the fleet

### US-295 — Let the Fleet Console manage my machine, or stop it

As a machine admin, I want my machine to take commands only from the Fleet Console I approved, and to leave it at once when I choose, so that nobody else — not even HQ — can command my machine.

**Acceptance criteria:**
- AC-295a: I connect with a code, compare the machine's fingerprint with the fleet admin, and the code never reaches HQ.
- AC-295b: my machine acts only on commands the Fleet Console signed, from a short list, that HQ cannot read, change or make up.
- AC-295c: I can disconnect at once, even when nothing answers; HQ is told when it can be, and the site's data stays.

---

### US-296 — Get the fleet back when nobody can sign in

As a machine admin of HQ's machine, I want to give the fleet admin role back, or move the Fleet Console, from the command line, so that the fleet is never left without anyone who can look after it.

**Acceptance criteria:**
- AC-296a: I give or take away the fleet admin role on an existing HQ account, and make a first-account or admin link, from HQ's machine.
- AC-296b: I can run the Fleet Console on another machine, or remove one HQ no longer lets in, and every machine follows the one that is current.

---

### US-297 — Serve HQ at the right address

As a machine admin, I want HQ served over HTTPS and its address changed safely, so that people and every machine can always reach it.

**Acceptance criteria:**
- AC-297a: the host service can serve HQ over HTTPS with its own certificates, warning first that it takes ports 80 and 443, and puts everything back if a certificate cannot be had.
- AC-297b: changing HQ's address tells every site and machine first, and each switches only once the new address is HQ; if HQ does not answer there, it is put back.

---

### US-298 — Move HQ or a site without running it twice

As a machine admin, I want HQ or a site moved to another machine with everything it holds, so that it never runs on both machines and never on neither for long.

**Acceptance criteria:**
- AC-298a: a site moves with its credential and workspaces, and comes back on the old machine if the new one does not take over.
- AC-298b: HQ moves with its site and the Fleet Console, read-only while it moves, and comes back on the old machine if needed, by itself or with one command.

---

## A machine Agenthix Cloud looks after

On a machine Agenthix Cloud runs for an organisation, Agenthix is the machine admin. Everything in this part applies only on a machine enrolled with Cloud, and only to requests from Cloud's pinned identity; a machine an organisation runs itself never enrols and none of it changes what the Fleet Console or the command line may do there.

### US-333 — Enrol a machine with Agenthix Cloud, and keep one controller

As the operator of a machine Agenthix Cloud will run, I want to hand the machine to Cloud with a one-time code, so that Cloud can look after it without any secret kept on the machine and without the Fleet Console and Cloud ever both commanding it.

**Acceptance criteria:**
- AC-333a: the machine dials Cloud, nothing dials the machine, and a code that is valid once, for at most an hour, read from a file only the machine's root can read, enrols it; any failed join spends the code.
- AC-333b: after enrolling, the machine reconnects with its own identity and proves nothing until Cloud's first message is fresh and signed by the identity it pinned.
- AC-333c: a machine with a Fleet Console pinned refuses to enrol, and a machine enrolled with Cloud refuses a Fleet Console.
- AC-333d: the connection to Cloud keeps working while HQ is down.

---

### US-334 — Let Agenthix Cloud look after the machine

As the operator of a machine Agenthix Cloud runs, I want Cloud to do what a machine admin does there — serve HQ over HTTPS, keep backups off the machine, set the maintenance window, resize the server, add sites and make admin links — and nothing else, so that the machine is looked after without Cloud holding more authority than it needs.

**Acceptance criteria:**
- AC-334a: Cloud may ask what a Fleet Console may ask and a short list of its own; anything else is refused, and its own operations are refused from everyone but Cloud.
- AC-334b: Cloud gives the front door a certificate and a files host, and the front door serves them without asking a certificate authority.
- AC-334c: Cloud points the machine's backups at a store under the machine's own prefix with short-lived credentials, and the machine keeps working when the store refuses to delete an old backup.
- AC-334d: Cloud sets the maintenance window in a time zone, and resizes the server with agents paused until it says the resize is done.
- AC-334e: Cloud adds and removes its own sites in HQ, and asks for one-time links to make the first admin, reset an admin's password or invite a new admin, each announced in HQ to the admins and never written to a log.

---

### US-335 — Install and upgrade from published images, pre-releases included

As a machine admin, I want the images HQ and its site run from to be published and signed from a pre-release tag as from a release, so that a pre-release can be installed and checked exactly as a release is, and a machine is never moved to one by itself.

**Acceptance criteria:**
- AC-335a: the release tag and the pre-release tags `-alpha.N`, `-beta.N` and `-rc.N` publish the images, and each image is checked against the workflow run for its own tag before it is fetched.
- AC-335b: a machine that pulls private images is given a registry credential in its start-up settings, used for the pull and the signature check and nothing else, and never logged or sent anywhere.
- AC-335c: an upgrade offers only the newest release, never a pre-release.
- AC-335d: Agenthix Cloud depends on the same implementation of the host protocol as this repository, published from the same tags.

---

## Sharing the machine, and leaving it (added 2026-10-21)

Written from the finished code at the close of the version baseline unit.

### US-353 — Take Agenthix off a machine completely

As a machine admin, I want one command that takes everything Agenthix put on the machine away, so that the machine is as it was without my hunting for containers, volumes, networks or firewall rules.

**Acceptance criteria:**
- AC-353a: it is refused, changing nothing and saying what to do first, while HQ or a site is still on the machine, or while anything would be lost that I did not choose to lose.
- AC-353b: data an erase keeps for 30 days is removed only after I type its address or name, never by a flag, and the backup location's copies are never touched.
- AC-353c: it lists exactly what goes and what it never touches, asks, removes everything named after the install, and says what it could not remove; afterwards nothing named after the install is left.
- AC-353d: nothing I put in the state folder myself is touched, and nothing outside it.

---

### US-354 — Find the install's parts, apart from everything else on the machine

As a machine admin, I want every container, volume and network Agenthix makes to be named after the install and grouped by part, and its networks never to take addresses the machine already uses, so that I can tell them apart, act on one part without harming another, and keep my own network working.

**Acceptance criteria:**
- AC-354a: every name Agenthix makes on the machine follows one pattern from the install's namespace.
- AC-354b: each part is its own group in Docker, so upgrading or removing one never removes another, and agents keep running through an upgrade of their site.
- ~~AC-354c: a machine has at most one HQ, whichever host service installed it.~~ **Retired 2026-10-24**: several installations can run on one machine for testing (US-367); what is refused is a port or an address block another holds (US-366).
- AC-354d: the install's networks take addresses from a range of their own and never overlap another network or the machine's own addresses; when none is left, the install says so before it changes anything.


---

### US-356 — Add the organisation's providers from the machine

As a machine admin, I want to add, list and remove the organisation's model and voice providers by typing a command on HQ's machine, so that I can stand up an install at a terminal with no browser.

**Acceptance criteria:**
- AC-356a: `agenthix provider add|list|remove` changes the organisation's providers as the machine, checked with the vendor, recorded and announced to every organisation admin as a change on the Providers page is.
- AC-356b: the key is asked for unseen and never typed on the command line, so it stays out of my shell's history and the machine's process list, and a removal asks first.

## Choosing ports, and sharing the machine with other installations (added 2026-10-24)

Written from the finished code at the close of the one port plan unit.

### US-365 — Choose the ports HQ and the Fleet Console are published on

As a machine admin, I want to say which ports HQ and its Fleet Console are published on when I install, change them later with one command, and have them kept through every upgrade, so that Agenthix never fights other software on my machine for a port.

**Acceptance criteria:**
- AC-365a: with nothing chosen, HQ is published on 7800 and the Fleet Console on 7801; HQ's port is the port in its address, or `--hq-port`, and the Fleet Console's is `--console-port`, on every command that installs them.
- AC-365b: a port outside the range I may choose, an address and `--hq-port` that disagree, or two parts on one port are refused, with the reason, before anything is changed.
- AC-365c: what I chose is kept across upgrades, a second run of install and the host service's own update, and a second run that asks for another port is refused rather than ignored.
- AC-365d: I change a port later with `agenthix hq address` or `agenthix console port`; a restore or a move chooses afresh on the machine that receives it.
- AC-365e: the Fleet Console and Agenthix Cloud can name the ports when they install or move HQ, on the host protocol, without breaking a host service that does not know them.

---

### US-366 — Be told before a port clash changes anything, and after one stops a part

As a machine admin, I want every command that publishes a port to check it first and refuse everything at once, and to be told plainly when another program has taken a port while Agenthix was stopped, so that a clash never leaves my installation half changed or silently down.

**Acceptance criteria:**
- AC-366a: before anything is fetched, written or started, install, restore, a move, the Fleet Console's install, an address or port change, the front door, remote access and an upgrade check the ports they would publish, and refuse, with every problem listed together, ending "Nothing was changed."
- AC-366b: a port is refused when it is out of range, used by another part of this installation, held by another installation on the machine, published by a container, or held by a program, including on Docker Desktop a program on the computer itself; the refusal names the holder.
- AC-366c: a part that cannot start because another program took its port is reported in the status, the host service's log and the Fleet Console, with the port, the holder and what to do.

---

### US-367 — Run more than one installation on a machine, for testing

As a maintainer who tests Agenthix beside an installed copy, I want each installation to have its own namespace, ports and agent addresses, and to be refused only what clashes, so that a test installation never disturbs the real one.

**Acceptance criteria:**
- AC-367a: an installation takes its namespace from `INSTALL_NAMESPACE` at its host service's first start, checks that its container is named for it, and keeps it for good.
- AC-367b: another installation's HQ is not a reason to refuse; another installation's port or address block is.
- AC-367c: each installation with a site gets an address slice for its agents of its own, picked before anything is written, and is refused with who holds them when none is left.
- AC-367d: the firewall rules that keep agents off the machine cover that installation's agents alone.

## Knowing the version of what runs (added 2026-10-24)

Written from the finished code at the close of the release cycle unit.

### US-370 — Know which version each part runs

As a machine admin, I want every part to say which version it runs, and to see since when an unchanged part has been the same, so that I know what is installed and what an upgrade really changed.

**Acceptance criteria:**
- AC-370a: HQ, the site, the Fleet Console and the host service each report the version they were published as, and `dev` when they were not published.
- AC-370b: the host service takes its version from the published image it was started from, and only after that version's signature checks.
- AC-370c: every container of a published part shows its version on the machine.
- AC-370d: `agenthix status` says, for HQ and the site, since which release their image has been unchanged.

### US-374 — Try the host service's own upgrade on a development machine

As a contributor, I want to switch a development host service to another image built on my machine and back, so that the whole switch is tested without publishing anything.

**Acceptance criteria:**
- AC-374a: a development host service switches to another image built on the machine, and puts the old one back when the new does not answer.
- AC-374b: a published host service is not given this: it switches only forward, to an image signed for the newer version.

---

## Live apps' addresses (added 2026-11-02)

Written on 2026-11-02 from the finished code at the close of the unit *live preview*.

> **Behind the `livePreview` flag, at experimental, so not in the release:** US-423. The product does not keep these promises while the flag is off. The QA model has no mark for a promise outside the release, so this note stands in for one.

### US-423 — Give live apps their own addresses

As a machine admin, I want to give live apps a preview domain with one command, so that each app opens at an address of its own.

**Acceptance criteria:**
- AC-423a: `agenthix front-door on --previews <domain>` sets the preview domain and checks the wildcard DNS record, the certificate and an answer from the relay, saying what failed.
- AC-423b: with HQ at `http://localhost`, live apps are under `preview.localhost`; at a bare network address there are none, and *Live preview* says a domain is needed.
- AC-423c: each app gets its certificate on first open, only for an app HQ recorded.
