---
name: User Stories — Fleet Console
description: Business-level requirements for the Fleet Console (console/ and console-web/) — what a fleet admin needs to look after the machines Agenthix runs on. Written for business readers.
updated: 2026-11-02
---

# User Stories — the Fleet Console (`console/`, `console-web/`)

> Business-level requirements for the **fleet admin**: a person in HQ who holds the fleet admin role and looks after the machines — HQ and its sites — in the Fleet Console.
> Audience: business readers — no implementation detail.
> Written on 2026-10-16 from the finished code at the close of the host management unit. Story ids are shared across every stories file; the next free one is `next-us` in [`hq.md`](hq.md). A retired story or criterion keeps its number. Which scenarios fulfil each criterion is recorded on the scenarios ([`../scenarios/console.md`](../scenarios/console.md), [`../scenarios/console-web.md`](../scenarios/console-web.md), and HQ's side in [`../scenarios/hq.md`](../scenarios/hq.md)), never here.

---

## Getting in

### US-299 — Sign in to the Fleet Console, and only I can

As a fleet admin, I want to sign in with my HQ account and know that nothing else can use the Fleet Console, so that whoever gets into HQ, or a page I open, cannot take over the machines.

**Acceptance criteria:**
- AC-299a: I sign in with my HQ username and password only if I hold the fleet admin role; otherwise I am told why and who can give it, and while HQ does not answer I am told what to run on the machine.
- AC-299b: the Fleet Console answers only on its own machine, and refuses requests from other pages, other names for the machine and forms.
- AC-299c: when my role is taken away, my sessions end at once.
- AC-299d: a new tab signs me in from a tab already open, and signing out in one tab signs me out of all.

---

## Seeing the fleet

### US-300 — See the whole fleet at a glance

As a fleet admin, I want one page that says what needs me and how every machine is, so that I notice a problem before people do.

**Acceptance criteria:**
- AC-300a: the Dashboard puts what needs me first, then HQ and every site in one line each, then the agents running, the next maintenance and the backups kept off their machine.
- AC-300b: each machine's state is a word I understand — Healthy, Needs attention, Not answering, Not heard from, No site — and a machine starting or stopped on purpose never alarms me.
- AC-300c: HQ and each site have a page of their own, named after the machine, where every action is a button.

---

## Adding, moving and removing

### US-301 — Add a site and know which machine I approved

As a fleet admin, I want to add a machine with a one-time code and compare its fingerprint, so that only the machine I mean joins the fleet.

**Acceptance criteria:**
- AC-301a: I give a code to the machine admin, see the machine's name and fingerprint when it arrives, and confirm or refuse it; the code never reaches HQ.
- AC-301b: the site is named after its machine, and two machines of the same name cannot both be sites.
- AC-301c: a machine already in the fleet is not replaced while it is online.

---

### US-302 — Move a site, or HQ, to another machine

As a fleet admin, I want to move a site or HQ at a time I choose and follow it step by step, so that a machine can be replaced without losing anything and without running it twice.

**Acceptance criteria:**
- AC-302a: a site moves at the time I chose, to a new machine or one already connected with no site, and runs on the old one again if the move does not complete.
- AC-302b: HQ moves with its site, and the Fleet Console when it runs beside it; I am told what follows HQ and what must be pointed by hand.
- AC-302c: I follow a move's steps as the machines report them, and can cancel it before it starts.

---

### US-303 — Disconnect a machine, and know when one left by itself

As a fleet admin, I want to take a machine out of the fleet, and see one that left by itself, so that the fleet lists only what is in it.

**Acceptance criteria:**
- AC-303a: disconnecting needs the machine's name typed, says what stays on it, and keeps the machine listed with who and when until I remove it from the list.
- AC-303b: a machine that left by itself shows so, not as offline, until I remove it.

---

### US-304 — Restore a lost site onto a new machine

As a fleet admin, I want to bring a lost site back on a new machine from its backup, so that its projects carry on.

**Acceptance criteria:**
- AC-304a: I am warned what is lost, and a code is offered only for a site whose machine is offline; I see which backup the new machine restores before I confirm.
- AC-304b: the restored site takes the lost one's place, and the old machine is refused if it comes back.

---

## Backups and maintenance

### US-305 — Watch the backups, and export one

As a fleet admin, I want to see that every machine backed up and whether its copies leave the machine, and to take or export a backup, so that I know the fleet can be brought back.

**Acceptance criteria:**
- AC-305a: Backups lists HQ and every site with their last backup and whether a copy is elsewhere, and warns of any kept on their own machine only, with the command its machine admin runs.
- AC-305b: I can export a backup and download it; its key is shown once, and the machine removes its copy once I have it.

---

### US-306 — Plan maintenance, now or later

As a fleet admin, I want to plan an upgrade, a capacity change, a move or a suspension for HQ or a site, now or at a time, so that it happens when it suits the people who use Agenthix.

**Acceptance criteria:**
- AC-306a: I choose which, what and when in one panel, beside the page I am on, without losing what I typed.
- AC-306b: a time is never so near that members cannot be told first.
- AC-306c: Maintenance lists everything planned and done in the last 30 days, and I can change a planned time or cancel it.

---

### US-307 — Suspend, resume or erase HQ

As a fleet admin, I want to suspend and resume HQ, or erase it with a countdown, from the Fleet Console, so that I can pause or retire it without the machine admin.

**Acceptance criteria:**
- AC-307a: HQ is suspended now or later, and HQ's page then offers Resume HQ and the command for when it cannot be reached.
- AC-307b: erasing needs HQ's address typed; with a date, everyone sees the countdown; I see the days left to bring it back.

---

## Being told

### US-308 — Know when a machine stops answering, without noise

As a fleet admin, I want to be told when a server stops answering, but not every time a laptop sleeps, so that the notices keep meaning something.

**Acceptance criteria:**
- AC-308a: each machine has a setting, ticked unless I untick it; ticked, I am told when it has been silent for 10 minutes; HQ's machine is always watched.
- AC-308b: a machine stopped on purpose, or one with the setting off, is shown as not heard from and nobody is told.

---

### US-309 — See what needs me, and what was done

As a fleet admin, I want my notices in one place and a record of what every fleet admin did, so that nothing done to the fleet is hidden.

**Acceptance criteria:**
- AC-309a: the bell holds my notices, each opening what it is about; I dismiss them, except those that clear themselves once fixed.
- AC-309b: Activity is the record of who did what, kept in HQ for a year where nobody can edit it, found by who, what and kind.

---

### US-310 — Give and take away the fleet admin role

As a fleet admin, I want to give the role to another HQ account or take it away, and everyone to be told, so that the fleet always has someone to look after it and the role is never handed out quietly.

**Acceptance criteria:**
- AC-310a: I give the role to an HQ account by its username, and take it away after being told what happens; the last fleet admin cannot be removed here.
- AC-310b: every grant and removal is announced to every fleet admin and organisation admin, and an organisation admin cannot give the role.

---

### US-311 — Read how it works without leaving the Fleet Console

As a fleet admin, I want the guide for running Agenthix inside the Fleet Console, so that the answer is beside the screen I am using.

**Acceptance criteria:**
- AC-311a: Help shows every page of the guide's running section, with working links between them, and each screen links to its part.

---

## Trust

### US-312 — Trust that only the Fleet Console commands a machine

As a fleet admin, I want every command to a machine signed by the Fleet Console and unreadable to HQ, so that someone who took over HQ still cannot command a machine.

**Acceptance criteria:**
- AC-312a: HQ passes commands and answers sealed, and cannot read, change or make one; an answer is taken only from the machine it was asked of.
- AC-312b: when the Fleet Console moves to another machine, the machines follow only what the running one signed; HQ cannot stand in for it.

---

### US-313 — Change how people reach HQ

As a fleet admin, I want to see and change HQ's address and front door from the Fleet Console, so that I can give HQ a domain and HTTPS without the command line.

**Acceptance criteria:**
- AC-313a: HQ's page says how HQ is served, and turning on the host service's front door warns first that it takes ports 80 and 443.
- AC-313b: when HQ's address changes, every machine and the Fleet Console follow only once the new address is HQ.

---

## Agenthix Cloud

### US-336 — Reach the Fleet Console of a machine Cloud runs, from anywhere

As a fleet admin of an organisation whose machine Agenthix Cloud runs, I want to reach the Fleet Console from my own browser at a name Cloud gives, so that I can look after the machines without being at them.

**Acceptance criteria:**
- AC-336a: remote access is off to start with, and only Cloud, on a machine it runs, turns it on, for a time and for the addresses it names; it stops by itself at its end and after a restart does not outlast it.
- AC-336b: connections from any other address are closed before anything is exchanged, and the key the connection is secured with never leaves the machine.
- AC-336c: signing in through it needs my HQ password and a code from my authenticator, and a session made on the machine opens nothing through it.
- AC-336d: a session that came through it can turn remote access off but never on.

---

### US-337 — Connect my organisation to Agenthix Cloud

As an organisation admin, I want to connect HQ to Agenthix Cloud from HQ, checking a code on both screens, and a fleet admin to see where the connection stands in the Fleet Console, so that I choose to connect and nothing is shared before I do.

**Acceptance criteria:**
- AC-337a: HQ shows a short code and the page to approve it on while a connection waits, and says plainly when the approval was refused, ran out or Cloud did not answer; the Fleet Console shows that state. *(Changed 2026-10-23)*
- AC-337b: an organisation admin connects HQ to Agenthix Cloud and disconnects it, from HQ's Providers; a fleet admin who is not one can see the state but not change it. *(Changed 2026-10-23)*
- AC-337c: through remote access the connection is shown but cannot be changed.
- AC-337d: on an HQ that Agenthix Cloud runs, Cloud connects it as it sets it up, with no code for me to check, and I cannot disconnect it.

## Its published port (added 2026-10-24)

### US-369 — Open the Fleet Console where this installation published it

As a fleet admin, I want every message about where to open the Fleet Console to name the port this installation published it on, so that I am never sent to an address that is not mine.

**Acceptance criteria:**
- AC-369a: the Fleet Console refuses a request that did not arrive at its address with a message naming its own published port, and its commands say that port, whether it is the default or the one the machine admin chose.

## hq's relay (added 2026-10-27)

Written from the finished code at the close of the unit *seeing the agents' work*. hq's relay is what carries every file's bytes between a browser and the site that holds it; it runs on hq's machine with hq.

### US-396 — See whether hq's relay is answering

As a fleet admin, I want to see hq's relay beside hq and be told at once when it is not answering, so that I know why people cannot open files and do not mistake it for the machine being down.

**Acceptance criteria:**
- AC-396a: HQ's page shows a card for hq's relay: the address people reach it at, the sites it serves, today's traffic and its open streams; with no files address it says so and that PDF preview is off, and links to the guide; what is not reported yet is said.
- AC-396b: a relay that is not answering is on the Dashboard's *Needs you* in the words people see and takes me to HQ; it is not listed while it answers.

---

## Live previews on the fleet (added 2026-11-02)

Written on 2026-11-02 from the finished code at the close of the unit *live preview*.

### US-422 — Decide which sites run live previews

As a fleet admin, I want to switch live previews on or off per site and set how many run at once and when an unused one stops, so that live previews do not crowd out the agents' work.

**Acceptance criteria:**
- AC-422a: each site's page has *Live previews on this site*, a limit and an idle stop; turning live previews off lists the ones it stops and asks first; lowering the limit stops none.
- AC-422b: I see the live previews open on a site, whose, which branch and when last used, and stop one after a confirmation.
- AC-422c: the page shows the site's memory and disk against the machine, with the disk branch copies use.
- AC-422d: I am told when a site passes 80% of its memory or its disk, and when it recovers.
