# Scenarios — `console/`

> Module contract: what `console/` (the Fleet Console's server) promises the fleet admins who use it, the host services it commands and the HQ it dials out to. Flat capability list. Its screens, `console-web/`, have their own file, [`console-web.md`](console-web.md).
> **Scenario ids are unique across every file in this directory**, not per file, because a test cites a scenario by its id alone; the next free id for all of them is `next-sc` in [`hq.md`](hq.md). Ids are append-only: assigned once, never reused or renumbered.
> Written on 2026-10-16 from the finished code at the close of the host management unit. The stories these fulfil are in [`../stories/console.md`](../stories/console.md).

The Fleet Console has no accounts and no authority of its own: a fleet admin signs in with their HQ account, and every command to a machine is signed by the Fleet Console's key and checked by that machine's host service. It listens on `127.0.0.1` only and dials out to HQ, through which it reaches every machine.

---

## Who can reach it

- **SC-861** — The Fleet Console listens on `127.0.0.1` only, by default `127.0.0.1:4301` (our own convention, in development and inside its container; an installation publishes it on `127.0.0.1` at its Fleet Console port, 7801 unless chosen otherwise, **SC-1254**), refusing any other listen address, from its settings or its environment, and will not start a server anywhere else. In its container it listens only on its own network's address, takes that network's gateway as its one other peer, refuses to start when its route out is HQ's link network or outside a Linux container, and is published on the machine's `127.0.0.1` only; it answers nothing on HQ's link network. · fulfils AC-299b
- **SC-862** — Every request is refused unless it comes from the loopback (or, in its container, its network's gateway on its own address) — 403 otherwise; unless its Host header names the loopback, on any port, so DNS rebinding fails — 421 naming the address it is published at (`127.0.0.1:7801` by default, the installation's own port otherwise); and when it comes from another origin or another site. A state-changing request must be JSON, as a form cannot send. Every answer keeps the API out of frames and caches, and the screens may load only their own scripts, styles, fonts and images, nothing inline. · fulfils AC-299b
- **SC-863** — A session opens only with its HTTP-only, same-site strict cookie and its CSRF token header together; only hashes of the session secrets are kept in the state folder; a session ends when HQ no longer lists the person as a fleet admin, and at once when the role is removed, here or elsewhere. · fulfils AC-299a, AC-299c
- **SC-864** — Signing in asks HQ: an account that holds the fleet admin role gets a session; a member without the role, or a wrong password, gets none; while HQ does not answer nobody can sign in and the answer points to the command line on the machine; failed attempts for one username are limited; before sign-in it says whether HQ answers and whether anyone holds the role; signing out ends the session. · fulfils AC-299a
- **SC-865** — The screens are served at the root, with every route of the app falling back to it and never cached, and only hashed assets cached; a missing file is a 404, an unknown API request is JSON, a state-changing request never falls back to the app, and without a build the API still answers. · fulfils AC-299b

## Commands to a machine

- **SC-866** — A command to a host service is signed by the Fleet Console and sealed to the pinned host, so HQ passes it unread; its answer is taken only when signed by that host's pinned key, for the operation asked, and not replayed; a command is refused for a machine that is not pinned, fails at once when HQ says the machine is offline, and only the closed set passes through the API — downloading an export is not a command the API passes by itself. · fulfils AC-312a
- **SC-867** — What a fleet admin asks is recorded in HQ's activity record, an erase is announced, and planned maintenance is recorded with what it is and when, in words. · fulfils AC-309b

## Adding a site

- **SC-868** — Add a site gives a one-time code; HQ is given only its lookup, never the code; a joining machine that cannot prove it holds the code is ignored; the machine's name and fingerprint are shown, and on confirmation its site is installed and registered, named after the machine; a fleet admin who does not recognise it turns it away; a presence naming a pinned host under another fingerprint is refused; a development build installs a development build, a published one never does. · fulfils AC-301a, AC-301b
- **SC-869** — A join presenting a machine already in the fleet is refused while that machine is online, and nothing is replaced; while it is offline the fleet admin is warned and confirming replaces it and its site; confirmation is refused if it came online meanwhile. · fulfils AC-301c
- **SC-870** — A site is named after its machine: HQ is told each machine's name; a machine whose name is already a site in the fleet is turned away, in words that name it; a site that moves or is restored takes the new machine's name. · fulfils AC-301b
- **SC-871** — HQ's own machine joins from its command line through a socket only its owner can use: a join of 10 minutes whose binding, when it proves the code, is confirmed by itself and pinned as HQ's machine, installing nothing; anything else on that socket is an error. · fulfils AC-301a
- **SC-872** — A machine that says it runs HQ has the claim shown to the fleet admin and is marked as HQ's only on their confirmation, installing no site of its own; it is not marked while another machine holds the mark; HQ can neither add the claim, drop it, nor make it for a machine of its own. · fulfils AC-301a

## Moves

- **SC-873** — Move site… gives a code whose lookup alone reaches HQ; once a machine joins with it, the Fleet Console arms it, opens the transfer and asks the old machine; once the site answers from the new machine HQ records it there, the old copy is removed and the old machine leaves; it reads as not completed when the old machine put the site back, ends as soon as the new machine gives up, and tells the new machine why, sealed, when the old one refuses; a site's machine admin may ask for the code, sealed to that machine; HQ's own site is refused. · fulfils AC-302a
- **SC-874** — A move whose code ends before a machine is confirmed, or whose machine is refused, ends as not done and the site still runs where it was, free to move again; one the fleet admin cancels while it waits reads as cancelled, not failed. · fulfils AC-302c
- **SC-875** — A move may go to a machine already connected with no site, without a code; it is refused for a machine that carries a site, is offline, is the same machine or is not connected. The machine waiting to receive a site carries no site name of its own, stays connected with no site when the move ends without happening, and its joining is recorded as part of the move, not as a site added. · fulfils AC-302a
- **SC-876** — Move HQ… is asked only of the machine marked as HQ's, by a fleet admin or that machine's admin, and is refused when no machine is known as HQ's; when the new machine says HQ answers there, the mark moves to it, the old copy is removed and the old machine leaves; the mark cannot be moved by a message from HQ; a move that leaves HQ on its machine reads as not completed. · fulfils AC-302b
- **SC-877** — Moving the Fleet Console to another machine: the running one gives HQ only the lookup of its handover code and tells everyone; it answers the new one once, with a certificate the machines follow, sealed to it, and refuses a binding that does not prove the code or HQ putting its own identity in the new one's place. The new one takes the machines only from the running one's answer — nothing from HQ standing in for it, an altered answer, or a code HQ made — keeps its credential only once it said it holds the machines, counts each machine that follows it, and refuses to start empty when the move did not happen. · fulfils AC-312b

## Disconnecting and removing

- **SC-878** — Disconnecting a machine removes its site's and its own credentials in HQ, unpins it and is announced; HQ's own machine is refused, with what to do instead, and nothing changes. A machine disconnected here stays listed with who disconnected it and when, keeping no key, until a fleet admin removes it from the list, once; it is no longer listed once the same machine is added again. · fulfils AC-303a
- **SC-879** — A machine that left by itself shows as left by itself, from HQ's list, and not merely as offline, through presence frames, until HQ's list no longer says it; a move to such a machine says to remove it first, and goes ahead with the same code once it is removed. · fulfils AC-303b

## Restoring a lost site

- **SC-880** — A code to restore a lost site is opened for that site only, never for one whose machine is online; the fleet admin sees the lost machine, when it was last heard from, and the backup the new machine says it restores; on confirmation the new machine is asked, signed, to restore what its machine admin chose, and then replaces the lost one; a refused restore leaves the lost machine as it was, in the host service's words; confirmation is refused, and the code spent, when the lost machine has come back. · fulfils AC-304a, AC-304b

## Being told when a machine stops answering

- **SC-881** — Each machine's setting to notify the fleet admins if it stops answering is ticked by default and always for HQ's machine; it is asked with the code when a site is added or moved, changed on the machine's page, kept and recorded once per change, and accepts only true or false through the guards. HQ is told every machine's setting and stop when the link comes up, a change at once, and again after the link comes back; an HQ that does not know the method is left alone. · fulfils AC-308a
- **SC-882** — A machine's stop word, counted only from the pinned machine that sent it and only as the bare word, reads as stopped on purpose, tells no one, and ends when the machine answers again. · fulfils AC-308b

## Notices and Activity

- **SC-883** — The record of what fleet admins did is asked of HQ for the person signed in, a page at a time, and passed on as HQ gave it; it says when HQ is older than the record or is not answering, and is never read without a session. · fulfils AC-309b
- **SC-884** — Notices are HQ's, put away in HQ on behalf of the person signed in, with HQ's refusal for one that clears itself passed on; each carries what it opens — a machine's page (HQ's page for HQ's machine, the dashboard once the machine is gone), the fleet admins for a role change, a site's or HQ's page for an action on it, a move's progress or outcome — never taking one machine's name inside another's. · fulfils AC-309a
- **SC-885** — Scheduled-change notices from a machine are shown under the fingerprint it was pinned with, a newer one of the same change replacing the older, and dropped from a key that is not pinned. · fulfils AC-306c

## Fleet admins

- **SC-886** — The Fleet Console lists who holds the fleet admin role as HQ says; it grants and removes the role through HQ, on behalf of the signed-in fleet admin, recording nothing of its own since HQ records and announces it; it passes on HQ's refusal to remove the last fleet admin, and finds an HQ account by its username. · fulfils AC-310a

## Exports

- **SC-887** — Downloading an export streams the sealed file whole, with its name and size, after which the machine removes its copy and the Fleet Console keeps none; it is begun only behind the session and its CSRF token and opened once by the same session; it ends in words, keeping the machine's copy, when a chunk is signed by another machine, altered on the way or the wrong part, and says why when the export is no longer on the machine, before anything is sent. · fulfils AC-305b

## What the screens are told

- **SC-888** — HQ appears on the fleet as HQ names it, with the address people open it at, keeping the last answer while HQ is away and asking at most every few minutes; each site's agents running are as HQ last heard them, unknown when HQ has no report or does not answer; the signed-in person's username and when they were given the role come from HQ, and are never another person's. · fulfils AC-300a
- **SC-889** — A machine's figures are kept from any answer to a figures read, asked for once at a time when missing or older than a minute, never of a machine that is offline, and never recorded as something a fleet admin did. · fulfils AC-300b

## HQ's address and the link to HQ

- **SC-890** — The Fleet Console dials HQ at `/console-link`, over `wss` for an `https://` address, refusing plain `http://` beyond the machine or a private network; told of HQ's new address on the link, it keeps the old one until the new one passes the check, then dials it, across a restart, and stays where it was when the check fails; on HQ's machine it takes no such notice. · fulfils AC-313b
- **SC-891** — On the console link the Fleet Console presents the pairing secret on HQ's machine, or redeems a one-time code once by its lookup and presents the lasting credential from then on, telling HQ on its first connection that it has just started; it stops trying a code HQ refused. · fulfils AC-312b

## Agenthix Cloud

*(Changed 2026-11-14: Agenthix Cloud is behind the `cloud` flag, at preview, until its service opens (ADR-0189, **SC-2128**); everything here holds only while the flag is on, and with it off the part says nothing of Cloud and refuses what asks for it: see **SC-2133**.)*

- **SC-1068** — On a machine Cloud runs, remote access listens with the certificate chain Cloud had issued for the key made on the machine (the key kept readable by its owner only and never leaving it), announced with its end and the addresses it admits; a connection from an address outside the allow list is closed before any TLS; a certificate for another key, for another name, or that ends before remote access would is refused; asked again while on, it replaces all of it, also on the same port; a new request makes a new key while the key in use serves until a certificate for the new one arrives; off stops it now. · fulfils AC-336a, AC-336b · tests `console/src/__tests__/remoteAccess.test.ts`
- **SC-1069** — Remote access ends by itself at its end, ending what came through it, and after a restart comes back until its end and not after it. · fulfils AC-336a · tests `console/src/__tests__/remoteAccess.test.ts`
- **SC-1070** — Through the control socket, as the host service asks, the Fleet Console makes a request, turns remote access on with its certificate, says it is on, and turns it off; what is not valid is refused in words; an authenticator handed over is kept unclaimed, and handed over again is answered as added. · fulfils AC-336a · tests `console/src/__tests__/remoteControl.test.ts`
- **SC-1071** — The key remote access ends TLS with is a P-256 key whose certificate request is signed by it and names the one DNS name, and a certificate made for it reads as for that key and name; the allow list answers the addresses it holds (an IPv4 address also when it arrives mapped into IPv6) and nobody else, and cannot be made from anything wider; authenticator codes match RFC 6238's test values and are taken from this step or one either side, no further. · fulfils AC-336b, AC-336c · tests `console/src/__tests__/remoteKeys.test.ts`
- **SC-1072** — Signing in through remote access needs a code besides the HQ login: the sign-in page is told where it was opened from before anyone signs in; on the machine the HQ login alone is enough, as before; through remote access it alone opens nothing and HQ is not even asked; an unclaimed authenticator is claimed by a valid code, and the session, with a Secure cookie, works through remote access only; a code, or a recovery code, is taken once; a wrong code, a wrong password and an account without the role get the same answer; a malformed code is refused; with no authenticator set up it says so and opens nothing; wrong codes are limited as wrong passwords are; a session opened on the machine opens nothing through remote access; it answers only at its name and same-origin over https. · fulfils AC-336c · tests `console/src/__tests__/remoteSignIn.test.ts`, `console/src/__tests__/cloud.test.ts` (the describe *signing in through remote access*)
- **SC-1073** — A session that came through remote access can never turn it on or extend it, set up the code, or connect or disconnect the organisation, and ending remote access ends the sessions that came through it and no other; it can still turn remote access off and sign out of Cloud. · fulfils AC-336d, AC-337c · tests `console/src/__tests__/remoteSignIn.test.ts`, `console/src/__tests__/cloud.test.ts`
- **SC-1074** — Every Cloud route needs a session; reads say plainly that nothing is connected, linked, on or set up yet, and actions answer that the organisation is not connected and do nothing else, after checking how long was asked. · fulfils AC-337a · tests `console/src/__tests__/cloud.test.ts`
- **SC-1075** — The Fleet Console reads HQ's connection to Cloud (waiting on approval with the code to check, then connected; an HQ older than the connection reads as not connected; an answer it does not understand is not shown); what it offers in place of Connect is a pointer to HQ, under Manage › Providers. *(Changed 2026-10-23: the Fleet Console no longer connects or disconnects: HQ does, for an organisation admin (**SC-1179**), and HQ is never asked to here.)* · fulfils AC-337a, AC-337b, AC-337c · tests `console/src/__tests__/cloudConnect.test.ts`

## Its published port (added 2026-10-24)

- **SC-1254** — The Fleet Console knows the port it is published on (`CONSOLE_PUBLISHED_PORT`, 7801 outside an installation, refused when not a port), and every sentence that names its address names that one: the refusal of a request with the wrong Host header from the published port, the words `console install` prints before starting it, and the compose project that publishes it to `127.0.0.1` on that port only and dials HQ's own address; its own server stays on 4301 whichever port it is published on. · fulfils AC-369a · tests `console/src/__tests__/listen.test.ts`, `console/src/__tests__/guards.test.ts`, `host/src/cli/__tests__/consoleWords.test.ts`, `host/src/compose/__tests__/console.test.ts`

## The Fleet Console and hq's relay (added 2026-10-27)

The Fleet Console asks hq about hq's own relay as it asks about hq and its sites; it holds no files and no tickets.

- **SC-1591** — The Fleet Console reads hq's own relay from hq over its link (`relay.facts`) and gives it as hq gives it — address, the sites it serves, traffic, open streams and whether it answers — dropping an address that is not a web address, giving none for a relay not in its shape, and none from an hq older than the method or while hq does not answer. · fulfils AC-396a

## Live previews on a site (added 2026-11-02)

> **Behind the `livePreview` flag, at experimental, so not in the release:** SC-1754. The product does not keep these promises while the flag is off. The QA model has no mark for a promise outside the release, so this note stands in for one.

Written at the close of the unit *live preview*, from the finished code. The Fleet Console reads and sets a site's live previews through HQ, as the signed-in fleet admin; HQ holds the settings.

- **SC-1754** — The Fleet Console refuses a site's live previews to someone not signed in and passes on HQ's refusal of an account without the fleet admin role; it reads them as the signed-in fleet admin for the site HQ knows by its id (HQ's own site by the default site it reports), says so for a site HQ does not know, drops an answer not in its shape and says an older HQ is older; it sets *Live previews on this site*, the limit and the idle stop only to values HQ accepts; turning live previews off lists the ones it stops and asks first, without asking when none is open; it stops one live preview by its id and nothing that is not an id; a notice about a site's memory or a live preview stopped for it opens the site's page. · fulfils AC-422a, AC-422b, AC-422d

## Features on the Fleet Console (added 2026-11-03)

Written at the close of the unit *live preview*, from the finished code. The Fleet Console has no switches of its own: hq decides and the Fleet Console shows a flagged feature's section only while hq says it is on.

- **SC-1777** — The Fleet Console asks hq which flagged features are on (`features.on`), keeps only the flags it knows, keeps the answer briefly and then asks again, and fails closed: none is on while hq is not asked, does not answer or refuses. It tells a signed-in screen which are on and nobody else, and a flagged route answers 404, *not available* ending "Nothing was changed.", before its handler while the feature is off, and goes through while hq says it is on. · fulfils AC-429a, AC-429b · tests `console/src/__tests__/features.test.ts`
- **SC-1779** — While the live preview's flag is off, every route for a site's live previews answers 404 and asks hq nothing about them, the screens are told it is off, and a site's page has no live-preview section. · fulfils AC-429b, AC-426e · tests `console/src/__tests__/siteLivePreviews.test.ts`, `console-web/src/__tests__/sitePage.test.tsx`

## Agenthix Cloud behind the `cloud` flag, in the Fleet Console (added 2026-11-14)

Written at the close of the unit *0.1.0-alpha.4*, from the finished code. The Fleet Console asks hq whether `cloud` is on (US-490, **SC-2128**).

- **SC-2133** — While hq says the flag is off the Fleet Console's Cloud routes (`/api/cloud*`, `/api/remote-access`, `/api/authenticator`, with Cloud's asks and offers) answer not available after the session check, and the platform's Cloud reads too; through the control socket as the host service asks, remote access will not make a request, turn on or take a code and changes nothing, while turning it off and its status still answer; `/api/sign-in/remote` is not gated, since it answers before sign-in, when no flag can be known, and can say *remote* only when Cloud turned remote access on; a restart brings back remote access that was on, whatever the flag says. · fulfils AC-490d · tests `console/src/__tests__/cloud.test.ts`, `console/src/__tests__/remoteControl.test.ts`
