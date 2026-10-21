---
created: 2026-10-13
description: Host management — one host service per machine is the only authority over that machine, driven by its CLI, by the organisation's Fleet Console (a site that dials out to hq, exposes nothing, and signs its commands so hq relays them unread) or, on Cloud's machines, by the Cloud controller; hq keeps the organisation and no machine authority; published images, always-sealed backups of every site with a copy in a backup location of the organisation's choosing, moves that keep sites connected, maintenance now or scheduled with notice, agent protections, and uploaded files on their own origin.
---

# Design Spec · Host management

**Drafted** on 2026-10-13 from the design session held with the owner that day, and **settled** on 2026-10-14 with its
screens, which are drawn in [`boards/`](boards/index.html) beside it. How it is built is in `plan.md`, written next. Planned for the first release.

## Why this exists

Today a machine runs Agenthix because someone cloned this repository and ran `./agenthix install`, which builds every
image from source. Stopping, upgrading, backing up, adding a site and recovering are all done by hand with
`docker compose`. Nothing separates administering the machine from administering the organisation, and nothing lets a
hosted service run an hq without reaching round the product.

This spec makes administering a machine its own capability, with its own authority, separate from the organisation's.

## Terms

| Term | Means |
|---|---|
| **Host service** | The one service on every machine that runs Agenthix. It installs, starts, stops, upgrades, backs up, restores and erases hq and sites on that machine, and holds its capacity and protections. The only authority over the machine |
| **CLI** | The command line for one machine, shipped inside the host service's image. On the machine, `agenthix …` runs `docker exec -it host agenthix …` |
| **Fleet Console** | The fleet admins' portal: a site of its own kind — the **console site** — that dials out to hq like every site and runs no agents. It has no authority of its own (everything it does, a host service does) and no accounts (people sign in with their hq login). It runs on hq's machine by default |
| **Machine** | A computer or virtual machine running a host service. It carries at most one site, which is named after it |
| **Fleet** | An organisation's HQ and the sites that run its work — its own, and those Cloud runs for it |
| **Cloud** | The hosted service that can run an organisation's hq and sites on its own machines. It lives outside this repository; this repository builds only the platform's side of the connection to it |
| **Controller** | Something that drives a host service from outside the machine. Two exist: the Fleet Console, and the **Cloud controller** — Cloud's own service, never on screen — for the machines Cloud runs |
| **Sealed** | Encrypted so that only the holder of its key can read it |

The CLI's command is `agenthix`, a value of the branding setting ([§17](#17-naming)).

## 1. Roles

| Role | Comes from | Has authority over | Never has |
|---|---|---|---|
| **Machine admin** | The operating system: whoever can use Docker on the machine, locally or over SSH. Not an account in Agenthix | That one machine, through the CLI. On hq's machine, the root of trust: grants the fleet admin role when none is left, and gives the Fleet Console a new home | Anything on other machines, or inside the organisation |
| **Fleet admin** | A role on an hq account. The first account, made at install, holds it; after that only a fleet admin (in the Fleet Console) or a machine admin of hq's machine grants it — never an organisation admin | The organisation's own machines and sites, through the Fleet Console: adding them, connecting them, their capacity, and which sites take part | The organisation's people, projects or work |
| **Organisation admin** | An account in hq (hq's "admin") | The organisation's business operations: people, projects, agents, policy. Sees each site's status, read-only | Any machine or site, the host service or the Fleet Console |
| **Cloud owner** | Cloud's own role: the one person who pays for the organisation on Cloud | Billing, and everything a fleet admin on Cloud may do | The organisation's own machines; anything inside hq |

**The rule:** an organisation admin looks after the business's operations; a fleet admin looks after the machines and
how they connect. When a site goes down, the organisation admin sees it and why in hq, and speaks to the fleet admins if
they are not the same person. One person may hold several roles; each is granted and checked on its own. Outside hq's own screens, "admin" is always
qualified: *machine admin*, *fleet admin*, *organisation admin*.

**Fleet admin is one role, named the same in the Fleet Console and on Agenthix Cloud.** On Cloud, a fleet admin looks
after the machines Cloud runs for the organisation; in the Fleet Console, the organisation's own. When an organisation
is connected, the Fleet Console lists the organisation's **fleet admins on Cloud**; **HQ stays the authority** over its
own role. A person on that list becomes a fleet admin in HQ only through the usual routes — a fleet admin gives them
the role with *Give them the role here too*, or a machine admin of HQ's machine does — and the grant is announced like
any other. Cloud's list is a suggestion, never a grant, so a takeover of Cloud cannot make anyone a fleet admin in a
connected organisation, and so cannot act on its machines.

## 2. The boundary

**The host service alone holds a machine's authority.** The CLI, the Fleet Console and the Cloud controller are its
clients, and ask it to act through a closed set of operations ([§6](#connecting-a-machine-to-the-fleet-console)).
**hq is the hub**: every site, every host service and the Fleet Console dial out to its port, and it passes the
Fleet Console's messages to host services sealed — it can drop one, but cannot read it or make one up.
**hq holds the organisation's authority and no machine authority**: assigning a site work and setting policy over
it give no power to add, remove, restart, upgrade, inspect or reconfigure it or the machine it runs on. hq shows each
site's status and capacity, and the cause of a problem in words — never the machine's own figures, and never a
control.

**At most one hq and at most one site per machine**, both one machine admin's; hq never runs alone — hq's machine
always runs hq and its default site, which cannot be removed
([ADR-0070](../../adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md)). A second site on the same machine would put a site name on every command and split the machine's ceiling, for
nothing that a site's private network per boundary and hq's limits do not already give; allowing it later adds to the
design without breaking an install. A second organisation is a second machine or virtual machine: the machine is the boundary between organisations
([ADR-0042](../../adr/adr-0042-hq-is-the-orgs-own.md)).

**A machine is managed by one controller at a time**: the organisation's own machines by its Fleet Console, Cloud's
machines by the Cloud controller. The Fleet Console shows Cloud's machines through Cloud's API with the signed-in fleet
admin's own Cloud sign-in, and never acts on them otherwise.

## 3. Trust boundaries

**Diagram:** [Trust boundaries](diagrams/1-trust-boundaries.svg) — a data flow diagram with trust boundaries. Every arrow points from the side
that opens the connection, so every arrow head is a door; each arrow that crosses a boundary is a crossing the security
posture covers ([§4](#4-security-posture)).

Machines A and C may be one machine; the boundary between them then falls away, but the crossings stay. On hq's
machine the host service also reaches hq's private control socket ([§9](#9-the-machines-way-into-hq)), and runs hq,
its default site and, by default, the Fleet Console through Docker. **hq's port is the only thing that listens on the network.**

## 4. Security posture

| Crossing | Opened by | To | How the caller proves itself |
|---|---|---|---|
| **C1** | Fleet admin | Fleet Console | Being on the Fleet Console's machine, or an SSH tunnel to it — or the remote-access tunnel while it is on ([§7](#remote-access-to-the-fleet-console)) — then their hq sign-in with the fleet admin role, and through the tunnel also an authenticator code the Fleet Console holds |
| **C2** | People | hq | Sign-in to hq |
| **C3** | Host service | hq's port, relayed to the Fleet Console | Its machine credential to hq; every message signed and encrypted end to end between the Fleet Console and that host service, whose identities each pinned when they connected, so hq can only pass or drop it |
| **C8** | Fleet Console | hq's port | The pairing secret set at install (on hq's machine), or the credential from a one-time code a machine admin of hq's machine gave ([§7](#7-the-fleet-console)); hq checks a fleet admin's sign-in for it, and relays its sealed messages |
| **C4** | Site | hq | The pairing secret (the default site, [ADR-0070](../../adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md)) or the credential registered with hq when a fleet admin added the site, or Cloud added it ([§10](#10-hq-and-sites)) |
| **C5** | Agent containers | Their site | A private network per boundary, shared only with their site ([ADR-0066](../../adr/adr-0066-a-site-reaches-its-agents-over-a-private-network-per-boundary.md)) |
| **C6** | Fleet Console | Cloud's API | The signed-in fleet admin's own short-lived Cloud token, per action; only the linked account's identifier is remembered. Never signing in to the Fleet Console *with* a Cloud account |
| **C7** | Machine admin | Host service | The operating system: Docker access, then `docker exec` to the owner socket inside the host service's container |

Rules that hold across all of them:

- **Nothing dials a site, a host service, the Fleet Console or an agent from the network.** Each only dials out.
- **The Fleet Console is reached only at `127.0.0.1` of its own machine** (C1): Docker publishes its port there and
  nowhere else, it runs on a network no other container joins, and it accepts a connection only from that network's
  gateway, through which Docker forwards the published port ([§5](#5-network-topology)).
- **A takeover of hq cannot act on a machine**: it cannot make a command (each is signed by the Fleet Console), open
  the Fleet Console (it is not on the network) or pass its authenticator code through remote access.
- **The host service refuses anything outside its closed set of operations** — no shell, no arbitrary Docker command,
  no file access for any client.
- **The host service runs only signed images** ([§11](#11-images-versions-and-upgrades)).
- **Agents cannot reach the machine they run on** ([§8](#8-capacity-and-agent-protections)).
- **Every remote Fleet Console session, export and erase is announced** to all fleet admins and organisation admins.
- **The Cloud controller sees figures only** — versions, health, uptime, resource use, capacity — never the
  organisation's people, projects, agents or work.

Accepted and queued: agents keep ordinary internet access, so an agent that follows an instruction planted in what it
reads can still send the project it works on to an internet address. An egress proxy with a per-project allow-list is
queued; the guide says plainly that agents have internet access.

## 5. Network topology

**Diagram:** [Network topology](diagrams/2-network-topology.svg) — Cloud on top; hq's machine, which runs the Fleet Console by default, in the middle; the
organisation's other machines below, each host service dialling out to hq's port. Sites also dial hq ([§3](#3-trust-boundaries)); they are left out here so that only the management boundary shows.

**The Fleet Console on its machine.** Like hq-web, it runs on a Docker network and Docker publishes its port, 4300,
to the machine's `127.0.0.1` only — so on Docker Desktop, whose containers run in a virtual machine, a browser on
the computer opens it as well. The network is its own: no other container joins it. It listens on its address on
that network, never on every address, and accepts a connection only from that network's gateway, through which
Docker forwards the published port; the address and the gateway are read inside its container at start, never
taken from a request or from hq. On hq's machine it also joins hq's private link network, to dial hq-web by its
container name as hq's default site does, and answers nothing there: it does not start when its route out is a
network hq is on, and a packet that claims its own network's gateway as its source is dropped unless it arrives on
that network. Elsewhere it dials hq's own address. The Host header and origin checks of every request are the same
wherever it runs.

## 6. The host service

**It runs as a container**, `host`, started once with `restart: unless-stopped`, holding the Docker socket and a state
folder on the machine. Installing is one documented command:

```sh
docker run -d --name host --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock -v <state folder>:/state \
  --network host --cap-add NET_ADMIN <host service image>
```

followed by `agenthix install`, which on the first machine starts hq, its default site and the Fleet Console — the
two sites connected to hq by configuration, as ADR-0070 does for the default site — and prints one link for the first
account, which holds the organisation admin and fleet admin roles. The state folder is the one this command names — the guide's line uses `~/.agenthix`
— and the host service never chooses or moves it. The image carries the CLI, so upgrading the host service is pulling its image and the two
never drift. No clone of this repository and nothing beyond Docker is needed. A `curl … | sh` convenience may wrap the
same command later.

**What it holds**, in its state folder, readable only by the machine admin: each hq's and site's settings and secrets,
the machine's capacity and protections, nightly backups and their keys, planned maintenance, and its credentials to hq and the Fleet Console.

**Two sockets inside its container**:

- the **owner socket** — every operation, reached only through `docker exec` (the CLI);
- the **figures socket** — read-only, figures only, shared with the site it runs so that the site reports its
  capacity to hq ([§10](#10-hq-and-sites)).

**It runs** hq (hq-web, hq-server, hq-db), the site (site, site-db, the agent image) and, on the machine that is its
home, the Fleet Console, as compose projects from published images.

**The front door.** By default hq listens on its local plain-HTTP port and the CLI prints how to point the machine's
own web server at it, as the deployment guide does today. On request (`agenthix front-door on`) the host service runs a
front door itself, holding hq's, the uploaded files' and (optionally) the previews' certificates — after a warning that
it takes ports 80 and 443 and nothing else on the machine can serve web traffic on them, defaulting to *no*, needing an
explicit flag from scripts, and refused while either port is in use. It gets no Docker socket and no admin API; its
configuration is checked before a reload and rolled back if it fails; certificate expiry and renewal errors are among
the machine's figures. No wildcard certificate by default: previews keep their advanced setup.

### Connecting a machine to the Fleet Console

**Diagram:** [Connecting a machine](diagrams/7-connecting-a-machine.svg).

Joining needs both sides:

1. A fleet admin chooses **Add a site** in the Fleet Console and gets a one-time code of 12 characters (60 bits), so
   HQ, which relays the join, cannot guess it: each side proves its key under a secret derived from the code, which
   HQ never sees.
2. On the new machine, the machine admin runs `agenthix console connect <hq address> <code>`.
3. The Fleet Console shows the machine's name and fingerprint; the fleet admin confirms.
4. The host service and the Fleet Console pin each other's identity; the host service gets a machine credential to
   hq's relay and keeps one outward connection to hq's port.
5. The host service starts the machine's site and makes its credential; the Fleet Console registers the credential
   with hq over its own connection (C8). The site takes part at once. When the code came from a move, the machine
   instead waits to receive that site, or hq ([§13](#13-moves-that-keep-sites-connected)); when it came from a restore,
   it restores the site from its backup ([§12](#12-backups)).

**Notify if it stops answering.** Where a machine joins — *Add a site*, a move or a restore onto a new machine — the
fleet admin is asked whether to *Notify the fleet admins if this machine stops answering*, ticked by default; it can
be changed later on the site's page (*Notify…*). HQ's machine is not asked: it is always watched. What follows from
the setting is in [§10](#10-hq-and-sites).

**Every machine carries one site, and the site is named after its machine**
([ADR-0120](../../adr/adr-0120-a-site-is-named-after-its-machine.md)). The site is what HQ uses and what moves: its
credential, workspaces, capacity and backups. The machine is the hardware under it: its name (as its host service
reports it — the host name up to its first dot, unless the machine admin sets another), system, health, host service
and protections. Nobody names a site: it takes its machine's name when it is added, HQ's own site takes HQ's
machine's, and a move or a restore renames the site after its new machine. Two machines of one name, compared without
letter case, cannot both carry a site: a machine joining under a name already in the fleet is turned away, in words,
unless it takes the place of the machine of that name. The name never carries authority; nothing is found, matched or
allowed by it. In the Fleet Console a site and its machine are therefore one thing, tagged *Site* or *HQ's site*, with
the site's parts first on its page and the machine's after; HQ is a thing of its own, with its own page
([§7](#its-screens)).

**The closed set of operations** a controller may ask: read figures and logs; install, start, stop or remove an hq or a
site; upgrade to a published version; take, export, store, fetch and restore backups; set capacity;
set the address and the front door; schedule, reschedule and cancel maintenance; suspend, resume and erase. Nothing
else.

**Disconnecting** works from either side: `agenthix console disconnect` on the machine — effective at once, even when the
Fleet Console is unreachable — or **Disconnect…** on the site's page in the Fleet Console. A machine that disconnects
itself tells hq it left, with its site's own credential, whose only effect is to retire that site: at once when hq
answers, otherwise once hq answers again, and then it forgets the credential. hq and the Fleet Console then show the
machine as having disconnected itself, not as switched off, and fleet admins get a *Needs you* to remove it, which
clears when it is removed; the Fleet Console lists it under *Left the fleet* until a fleet admin chooses *Remove from
the list*, which makes HQ forget it and its site and changes nothing on the machine. A machine whose site was restored
elsewhere is listed there as *Replaced* ([§12](#12-backups)). Only a machine that never reaches hq again stays *Not
heard from*.

The same protocol serves the Cloud controller on the machines Cloud runs. **The connection between the platform and Cloud
is first-party**: both sides are maintained together and may change together; it is not a public interface.

## 7. The Fleet Console

**A site of its own kind — the console site.** It dials out to hq's port like every site (C8), runs no agents, and is
not listed in hq's *Where work runs*. It **exposes nothing**: its screens answer only at `127.0.0.1:4300` of its own
machine ([§5](#5-network-topology)), reached in a browser there or through an SSH tunnel, and it reaches other machines only through their host services'
messages, which hq relays (C3). **Every command it sends is signed with its own key**, which each host service pinned
when it connected, so hq passes commands along and cannot make one up.

**Where it runs.** On hq's machine by default, started by the install. It may run on another machine instead — another
site's machine, or a fleet admin's own computer: a machine admin of hq's machine gives a one-time code
(`agenthix hq console-code`), `agenthix console install <hq address> <code>` brings it up on the other machine, and the
old one is retired. The running Fleet Console makes that code and hands its machines over: the new one proves it holds
the code, and every machine moves to the new one's key on a certificate signed by the Fleet Console it already pins, so
hq, which sees neither the code nor the keys' exchange, can never make a machine pin a key of its own. The old one stays
in charge until the new one confirms it has taken over. If the Fleet Console is lost, `agenthix hq console-code
--no-machines` starts a new one with no machines, and each machine connects to it again. It does not move when hq
moves, or when hq moves onto Cloud: it dials hq's new address.

**No accounts of its own.** People sign in with their hq login; the Fleet Console asks hq, over its connection, and lets
in an account that holds the **fleet admin** role. One person may hold the organisation admin and fleet admin roles on
one account. The role is granted only by a fleet admin in the Fleet Console, or by a machine admin of hq's machine
(`agenthix hq fleet-admin <user>`), which also recovers it when no fleet admin is left; hq refuses a grant from anyone
else, and every grant is announced. On its machine or through an SSH tunnel, the hq sign-in is enough — being there is
the proof. **A session through remote access also needs an authenticator code** (a time-based one-time code, TOTP),
set up on the Fleet Console's machine, with ten recovery codes shown once; `agenthix console reset-code <user>` on that
machine resets it. A lost phone costs remote sign-in and never locks anyone out. **Signing in needs hq**: while hq does not answer, nobody can sign in, and the
sign-in page says so and points to the command line on the machine (`agenthix status`, `agenthix restore`) — which is
all that is left to do then, since the Fleet Console reaches other machines only through hq. Not passkeys: a passkey is bound to the
address it was made on, so one made at `127.0.0.1` fails through the relay. hq's own sign-in is otherwise unchanged; its methods are designed with
the cloud offering.

**A session needs its cookie and a token together**, so the cookie alone — which any other server on `127.0.0.1` also
receives — opens nothing. The token is kept in each browser tab's own storage, never in a cookie, the address or
storage shared across tabs. **A new tab signs in from an open one**: it asks the Fleet Console's other open tabs over a
channel only pages of the same origin — scheme, host and port — can open, takes the token one of them answers with,
and checks it with the server before showing anything; with no signed-in tab open, it shows the sign-in page.
Signing out in one tab signs out every tab. A session ends after an hour unused, or 12 hours after signing in, and
the fleet admin role is checked with hq again every minute.

**What it holds** is small: its key, its connection to hq, the fleet admins' authenticator secrets and the
organisation's connection to Cloud. The record of what fleet admins did is kept in hq; planned maintenance is held by
the host services that carry it out. Its state is backed up with the site it runs on.

**Why a takeover of hq stays contained.** Someone who takes over hq could give an account the fleet admin role, but
cannot reach the Fleet Console's screen (it is not on the network), cannot pass its authenticator code through remote
access, and cannot make a signed command. Two more guards bound the damage: a backup location is changed only on the
machine itself ([§12](#12-backups)), and an erase keeps everything for its grace period ([§15](#15-suspend-resume-and-erase)).

**The organisation's connection to Cloud.** An organisation whose hq is self-hosted may be connected to Agenthix
Cloud — registered there — so that Cloud can run sites for it and carry remote access. The connection is the
organisation's, held by the Fleet Console: it is made and removed only on the Fleet Console's machine, from HQ's page,
and the dashboard shows it on HQ. It is separate from each fleet admin's own Cloud sign-in.

**With Cloud.** A fleet admin who also holds a Cloud role signs in to Cloud from inside the Fleet Console (C6). Each side
authorises its own machines: the Fleet Console its own, Cloud its own against the person's Cloud role. Without Cloud, the
Fleet Console does everything for the organisation's own machines.

### Its screens

Drawn in the boards, *The redesign* and *Plan maintenance* first. The Fleet Console's words follow the guide's: HQ in
capitals, sites by their machines' names, states in sentences.

- **The menu has three parts.** At the top, always there: **Dashboard** and **HQ**. In the middle, scrolling however
  many there are: **Sites** — *Find a site*, then every site, HQ's own first and the rest by name, each with a dot for
  its state and the state in words beside it. Pinned at the bottom: the jobs — **Maintenance**, **Backups**,
  **Activity**, **Fleet admins**, **Remote access** (only with Cloud), **Help** — and the person signed in. HQ sits
  apart from the sites, not above them as a parent, and no page shows a trail of where it sits.
- **The Dashboard** opens with what needs a fleet admin, each with a button to the page that fixes it; then the
  fleet — HQ as the hub with every site drawn hanging from it; then the totals: agents running, the next maintenance,
  and how many backups are kept off their machine. Machines that left the fleet follow. *Add a site* is its action.
- **HQ's page** is about HQ — how people reach it, which sites depend on it, its version, its backups, one line on the
  agents its own site runs — and then the machine HQ runs on. **A site's page** is the site — its runs, version and
  backups — and then its machine: health, protections, system and the notify setting. Each page's header holds every
  action on that thing as a button, never in a menu: *Plan maintenance…*, *Back up now*, *Logs*, and on HQ's page
  *Open HQ ↗* and *Erase…*, on a site's *Notify…* and *Disconnect…*.
- **A card that shows a thing is one link as a whole**, to that thing's page, with no other link inside it.
- **Notices open in a panel beside the menu**, not under the bell: each opens what it is about, each can be dismissed,
  and *Dismiss all* is at the top of the list. **Activity is the record** of what fleet admins and machines did,
  newest first, filtered by who, what it was done to and its kind; it holds no notices and nothing on it can be
  dismissed or changed.
- **Help** carries the user guide's pages for running Agenthix, built into the Fleet Console in the same version as
  its screens, so they open without the internet; each section of a page has a *How this works* link to its part of
  the guide. A screen shows a command only when it must be run then; the rest are in the guide.

### Remote access to the Fleet Console

A tunnel turned on for a while, **only from the Fleet Console's machine**: a request on its local listener — its screen
in a browser on the machine or through an SSH tunnel — or `agenthix console remote on`. A session that arrived through
the remote tunnel can never turn it on or extend it, so it cannot keep itself open; anyone can turn it off, from
anywhere. On an organisation's own machine, Cloud can never turn it on. It runs for 2 hours by default, at most 8, and
needs the organisation connected to Agenthix Cloud, since the relay is Cloud's.

**The one exception: a machine Agenthix Cloud runs** ([ADR-0132](../../adr/adr-0132-cloud-may-turn-remote-access-on-for-a-machine-it-runs.md)).
On a machine enrolled with Cloud, where Agenthix is the machine admin, Cloud's pinned controller may turn remote access
on — and only it, only there. The browser then reaches the Fleet Console directly, at a name Cloud gives, on one port
the host service publishes; TLS ends at the Fleet Console with a key made on the machine that never leaves it; only
the addresses Cloud allows (each an IPv4 address or an IPv6 /64, at most 20) get past the bare connection; it stops by
itself at the time Cloud set, 8 hours away at most, also across a restart; and each time it is turned on is announced
in hq to the organisation's admins and fleet admins, with that time and those addresses. Every session through it
still needs a fleet admin's hq sign-in and an authenticator code, from an authenticator Cloud hands over unclaimed
and the first such fleet admin to sign in with it claims. Such a session, like one through the relay, can never turn
remote access on or extend it.

- While it is on, the Fleet Console dials out to Cloud's relay and keeps that connection open; the fleet admin opens it
  at an address under Cloud's domain.
- Encryption ends at the Fleet Console, which holds its own certificate: Cloud forwards bytes it cannot read.
- Every remote session is announced. It switches itself off when its time runs out.
- Without Cloud, the guide documents the same with the organisation's own tunnel to `127.0.0.1`.

Because Cloud controls the domain the relay answers on, it could in principle obtain a certificate for it; the guide
says so, and it is why remote access is off unless someone on the Fleet Console's machine turns it on.

## 8. Capacity and agent protections

**Diagram:** [Agent protections](diagrams/3-agent-protections.svg) — how an agent could attack the machine it runs on, and what the protections stop.

**Capacity.** The host service holds the machine's ceilings — memory, processors and processes per agent container, and
how many containers run at once — and passes them to the site it runs, which applies them when it starts a container.
hq or project policy may only narrow them; a run gets the smaller. The site reports its effective ceilings to hq with
its capacity figures.

**Protections.** The host service applies firewall rules for the address range agent networks use (`AGENT_NETWORK_RANGE`)
that block the machine's own ports, ports other containers publish on the machine, and the provider's metadata address
(`169.254.169.254`). It applies them at start and checks them every minute; a site starts no agent until they hold. On
Docker Desktop the rules are applied inside its virtual machine, where the containers run. **They have no settings
and cannot be switched off**, from the Fleet Console or the CLI, and allow no exceptions; the Fleet Console shows them as a
fact on each machine's page. The manual firewall steps in the deployment guide go. Ordinary internet access stays (see [§4](#4-security-posture)).

## 9. The machine's way into hq

The commands that need the machine's authority — the first admin's link, recovering a lost last admin, and status — go
from the CLI to the host service, which runs them in hq-server against hq's private control socket, as the installer does
today. hq's control socket stays hq's only door for the machine's authority.

| Command | Does |
|---|---|
| `agenthix hq invite-admin` | A first-admin link on a fresh install; an admin invitation, marked as from hq's machine, when every admin has gone |
| `agenthix hq reset-password <user>` | A one-time link to set that person's password; the other admins are told |
| `agenthix status` | Every hq and site on the machine, each state in a sentence with a next step — never an internal word |
| `agenthix hq fleet-admin <user>` | Grants that account the fleet admin role — how the role is recovered when no fleet admin is left; announced |
| `agenthix hq console-code` | A one-time code that lets the Fleet Console run on another machine ([§7](#7-the-fleet-console)) |

hq accepts a site's credential, and removes one, only from the Fleet Console over its connection (C8), when a fleet admin
adds or disconnects a site, or from the Cloud controller for Cloud's sites. A controller may ask for status only. Admin links and password resets are never offered to a
controller.

## 10. hq and sites

**What hq shows of a site** — read-only, on one page, *Where work runs*: its state in a sentence with the cause and who
acts on it (*"Unavailable since 09:14: its machine isn't answering. Your fleet admins have been told."*), runs going
against its capacity and how many wait, the limits each run gets, where it runs (*Self-hosted* or *Cloud*) and planned
interruptions. **Each person sees what their role can act on, and is pointed at who can act on the rest.** Members
and organisation admins see a machine's condition only as the cause in that sentence (*"its machine is nearly out of
disk"*), never as figures. A run that fails for lack of resources says so on the run, with the limit it hit and who was
told (*"This run stopped: it ran out of memory (each run on office-server gets 4 GB). Your fleet admins have been
told."*), and the same for a full disk or the process limit; before it comes to that, members whose projects run on a
site that is nearly out of disk or memory are warned on the project and on *Where work runs*, and fleet admins are told
with what to do. A site at capacity reads *"Runs are waiting: office-server is at capacity"*. Members see a planned
interruption as a notice, and a run that cannot start says why (*"Waiting: no site is available"*). **Fleet admins**
also see, in HQ, a site's figures, versions and logs (adr-0106's diagnostics); for **Cloud's sites** HQ shows the
sentence only, never Cloud's figures or logs.

**A machine that stops answering asks for a fleet admin when they asked to be told.** Each machine carries the
setting *Notify the fleet admins if this machine stops answering* ([§6](#connecting-a-machine-to-the-fleet-console)),
ticked by default and always on for HQ's machine. Nothing is ever done to a machine either way; the setting decides
only what fleet admins read:

- **Ticked, and not heard from for 10 minutes:** it reads *Not answering since 09:14* and needs attention in the Fleet
  Console, and HQ gives every fleet admin one *Needs you* — *Not heard from office-server since 09:14*, with *Open in
  the Fleet Console* — whether or not work waits on it; it clears itself when the machine connects again. HQ raises
  that notice alone; the Fleet Console tells HQ each machine's setting, and adds none of its own.
- **Not ticked:** it reads *Not heard from since 09:14*, needs no attention, and nobody is told.
- **Stopped on purpose:** a host service that is stopped tells the Fleet Console first, signed and sealed like any
  message, within two seconds and never holding the stop up. The machine then reads *Stopped on its machine at 09:14*,
  and nobody is told, whatever the setting, until it answers again.

Ten minutes is past any restart, upgrade or switch of the host service. The setting travels with the machine when the
Fleet Console moves. Organisation admins keep their own notice for a site that work waits on.

**hq has no control over a site.** A site takes part when a fleet admin adds it in the Fleet Console, or Cloud adds it,
and stops when it is disconnected there. Capacity is the fleet admin's; project policy may still narrow it for a
project. A site cannot ask to join from a machine the Fleet Console does not know: `agenthix site add --hq` and the
organisation admin's approval go, superseding
[ADR-0064](../../adr/adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md). The default site joins
by its pairing secret ([ADR-0070](../../adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md)).

The default site reaches hq over a private Docker network on hq's machine, not through `localhost`, which on Linux is
the container itself. When hq refuses the default site, the host service passes the refusal to hq through its control
socket, so the default site's status in hq names the actual cause.
**The registration-token route is removed** — `HQ_REGISTRATION_TOKEN` and the public route that redeems one, which
nothing issues.

**Screens.** HQ's screens about sites are drawn in the boards (*HQ · Execution Sites*): *Where work runs*, under the
organisation's settings, lists each site by its name — HQ's own as *hq-box · HQ's site* — with its state said once, in
the sentence under its name. The Fleet Console's screens are in [§7](#its-screens).

## 11. Images, versions and upgrades

**Published images**: hq-server, hq-web, the site, the agent image, the host service and the Fleet Console, each labelled
with its version (the agent image's `org.opencontainers.image.version` too), so hq's status stops reporting `dev`. Each
is **signed when published and verified by the host service before it runs it**; an unsigned or wrongly signed image is
refused.

**hq's address is set when hq-web starts.** The browser app is built once with an unmistakable placeholder that is a
valid address (for example `https://hq-address.invalid`), passed as `REACT_APP_API_URL`; hq-web's start script replaces
it with `HQ_URL` in the built files, refuses to start if `HQ_URL` is missing or malformed or the placeholder is not
found, and checks that none is left. A test builds the image, starts it with an address and checks the app reaches its
server. Changing hq's address is a restart. This supersedes
[ADR-0068](../../adr/adr-0068-hqs-browser-app-is-built-for-its-address.md); leaving Wasp stays rejected.

**Diagram:** [Upgrades](diagrams/8-upgrades.svg).

**Upgrades.** Fixes (patch versions) apply automatically in a maintenance window that a fleet admin, or Cloud for its
machines, sets — on by default, and may be turned off; new versions only on request. Every upgrade is maintenance
([§14](#14-maintenance)), done now or at a set time with notice; it takes a backup first, and rolls back if hq or the
site does not come up healthy. An upgrade of HQ done now is followed in the Fleet Console until HQ answers on the new
version, since HQ restarts and the answer to the request may never come back through it.

**The host service moves to a new version of itself through a launcher in its own image** (ADR-0118): it checks and
fetches its new image, then a short-lived launcher started from the current image swaps the container and puts the
old one back if the new one does not answer. A host service runs HQ and sites of its own major and minor version, so
a new minor version moves the host service first, then HQ and its sites. The launcher can be switched off on the
machine; the machine admin then switches the host service with the two commands the CLI prints.

## 12. Backups

**Diagram:** [Backups](diagrams/4-backups.svg).

**Every site is backed up, each machine on its own.** hq's site holds hq and its default site; every other site holds
an Execution Site; each backs up everything it holds. Every backup is sealed.

| What a backup holds | A site | hq's site |
|---|---|---|
| The site's database and its workspaces (the projects' files; on the default site, people's own storage) | ✓ | ✓ |
| hq's database, its storage folder and its secrets (without `SECRETS_MASTER_KEY` the keys and logins hq saves cannot be read after a restore) | — | ✓ |

| Backup | Where it is | Who holds its key |
|---|---|---|
| **Nightly** | The machine itself, in the host service's state folder | That machine's host service |
| **Copy in the backup location** | **A folder** the machine can write to — on the network (a NAS), a synced drive, a mounted bucket, anything the machine admin points it at | The person who turned it on: shown once, or saved as a small file |
| **Move** | In transit to the receiving machine | Passed straight to the receiving host service |
| **Export** | Wherever the person takes it: from the Fleet Console it is downloaded to the fleet admin's computer | The person exporting: a key made for that export, shown once or saved as a small file |
| **On Cloud's machines** | Cloud's storage | Cloud, which runs those sites anyway |

**The backup location is a folder.** When one is set, each nightly backup is also written, sealed, to a folder the
machine can write to, and read back from there to restore. The organisation chooses the folder and looks after where
it lives; the platform does not run storage for it. **A backup location is set and changed only on the machine itself**
(`agenthix backup location <path>`); the Fleet Console shows it but cannot change it, so neither a takeover of hq nor
a stolen session can send copies elsewhere. No backup location is set until someone chooses one; without one, a machine has its
nightly backups and exports, and its page says when the last export is old.

**An export made in the Fleet Console reaches the person.** The machine holds the sealed file apart from the machine
admin's own exports and the Fleet Console streams it to the browser, chunk by chunk, each chunk signed by the machine
and sealed to the Fleet Console like any answer, so hq sees neither the bytes nor the key. The browser fetches it by a
one-time link that lasts a minute and works only with the session that asked for it — the one route a session opens
without its token, since a download cannot carry one. Once the whole file has left, the machine removes its copy; one
never downloaded is removed after a day. Agenthix Cloud backs up the sites it hosts;
it is not a backup location for a self-hosted organisation. No machine exists only to store copies.

**Same night, separate backups.** Every machine backs up at the fleet's backup time (02:00 by default, in the
machine's own time), each on its own, so a restore can take the same night's copies for every machine it touches. A
night missed while the host service was not running — the machine off or asleep — is caught up once as soon as it
runs again, labelled with the time it was taken, unless the next night's backup is due within six hours; several
missed nights give one backup. A machine's backup record, like its planned maintenance, belongs to what it was taken
for: a new HQ or site on the machine starts with no backup history of its own. There is
no combined backup across machines. **After a restore, hq and a site reconcile when they reconnect**: a restored site
reports the workspaces it holds and hq says plainly what was lost (*"files changed after 02:00 were lost with the
machine"*); a restored hq takes back the runs and workspaces its sites hold that it recognises, and offers the rest to
keep or remove. Copying only what changed since the last backup, for large workspaces, may follow.

**One backup, restore, move or erase runs on a machine at a time.** A scheduled upgrade, move or erase that comes due
while a backup runs waits for it, up to 30 minutes, and says so; a nightly backup that finds the machine busy runs as
soon as it is free, the same night, and a night it cannot take is recorded as skipped, with the reason.

**Restore** is onto the same machine or another; restoring elsewhere is how hq or a site moves, and how a lost
machine's site comes back. **On the same machine**, a fleet admin chooses a night from that machine's backups in the
Fleet Console (*Restore…*, a kind of planned maintenance, now or at a time): the current state is backed up first, and
the site — or HQ with its own site — comes back to that night as itself, its name, settings and credentials unchanged;
the Fleet Console beside HQ keeps its own state. A night only in the backup location is restored at once, since its key
is never kept for later.

**A lost site comes back as itself on a new machine**
([ADR-0119](../../adr/adr-0119-a-sites-backup-carries-its-authority.md)). A site's backup carries, sealed with the
rest, the credential the site proves itself to HQ with, so whoever holds the backup and its key holds the site's
authority — no more than the backup already gives. When a site's machine is lost:

1. A fleet admin chooses **Backups › Restore a lost site…** (or **Add a site › Restore from a backup…**), picks the
   site — only one whose machine is offline, never HQ's own — and is warned before any code is made: the machine may
   only be down for a while; restoring replaces it, and HQ refuses it if it comes back; anything the site did since
   its backup is lost. The screen says when the machine was last heard from, in stronger words if that was within the
   last day or the machine was set not to notify when it stops answering. Then a one-time code.
2. On a new machine where nothing runs, the machine admin runs `agenthix restore --from <folder or file> <hq address>
   <code>`, chooses the backup there — in the backup location or an export file — and types its key there. The key
   never leaves that machine; HQ and the Fleet Console never see the backup or the key. The machine joins with the
   code, saying under its binding which backup it restores (the site and when the backup was taken), so HQ cannot
   alter what the fleet admin is shown.
3. The fleet admin compares the fingerprint, sees when the backup was taken and which machine is replaced, and
   confirms. The Fleet Console then asks the new machine, signed, to restore the backup its machine admin chose there
   (`backup.restore` from `joined`, never scheduled); the host service asks HQ first whether the site may come back
   there, restores the site's database, workspaces and the master key its stored secrets are sealed with, and leaves
   the site the note of the backup it came from.
4. **Before it starts, the site's credential is renewed at HQ**: the host service presents the backup's credential,
   its own machine credential and the hash of a new credential made on the machine. HQ accepts only while no
   machine is connected as the site and the machine it ran on is not connected either, and only from the machine a
   fleet admin confirmed with a code for restoring that site, once. In the same step HQ records the site on the new
   machine, and from then on the backup's credential is refused — the old machine's site with it — so a stolen
   backup cannot push out a site that runs. A refusal leaves nothing on the new machine.
5. The site starts and connects as itself, named after its new machine; HQ says what was lost since the backup. The
   old machine leaves the fleet as a move's old machine does, and its machine credential goes too. Every fleet admin
   and organisation admin is told.

**A replaced machine is told, and says so.** If the old machine comes back, HQ refuses its copy of the site with an
answer that says it was replaced by a restore, and when — given only to the credential the restore replaced, for that
site, so it tells nobody anything about another site. The copy then stops trying to connect, takes no runs, and keeps
its data; `agenthix status` on that machine says it was replaced, that HQ refuses it, and how to remove it. The Fleet
Console lists the old machine under *Left the fleet* as *Replaced*, with *Remove from the list*.

A backup taken before the site's last restore holds a credential HQ no longer takes, so after a restore the site's
next backup is the first one it can come back from again.

## 13. Moves that keep sites connected

**Diagram:** [Moves](diagrams/5-moves.svg) — the sequence of a move for an hq without its own domain.

**Where hq moves**: to a new address on the same machine, to Agenthix Cloud, or to **a new machine** — one with no site
of its own, as every machine runs at most one site. As for a site ([A site moves](#a-site-moves)), *Plan maintenance…*
with HQ and *Move* gives a one-time code; the new machine connects with `agenthix console connect <hq address> <code>`,
the fleet admin confirms its fingerprint, and it waits to receive hq and its default site, starting none of its own;
the old machine leaves the fleet as the move's last step. HQ's own site then takes the new machine's name.

**What moves with hq**: its sites' connections, the host services' connections and the Fleet Console's connection.
The Fleet Console stays where it runs and dials hq's new address; if it ran on hq's old machine, it is restored with hq's
site, so fleet admins carry on at `127.0.0.1:4300` on the new machine. **hq is read-only** from the
moment the move's backup starts, with notice, so nothing is lost between the backup and the switch. Changing hq's
address on the same machine is a move. Removing the copy left on the old machine is the move's last step, once the new
hq has taken over — not an erase.

- **An hq with its own domain** keeps it: the domain is pointed at the new machine, and sites and host services
  reconnect to the same address.
- **An hq without one** tells each connected site and host service its new address over their channel before it
  stops; each switches as a site does. The site keeps
  both addresses and switches once the new address passes the check below; until then it keeps trying the old one, and
  `status` says the move has not completed.
- **A site that was offline** is pointed at the new address by `agenthix site hq-address <address>` on its machine, or by
  the Fleet Console for it; **a machine that was offline**, or the Fleet Console, by `agenthix console hq-address <address>`. The default site
  is set by the host service during the restore.
- **The check is a mutual challenge–response keyed on the credential hash hq already stores.** The new hq proves it
  holds the hash and the site, or the host service with its machine credential, proves it knows its credential; the credential never crosses the network, so a stranger's
  address learns nothing and takes nothing over.

### A site moves

A site moves to a new machine — new hardware, a bigger server — with **Plan maintenance…** on its page, choosing
*Move*. Nothing connects to a site, so no address changes: the site keeps its credential, its workspaces and its place
in HQ, and takes the new machine's name ([§6](#connecting-a-machine-to-the-fleet-console)); the record says so
(*office-server now runs on new-server, and is named new-server*). HQ's own site does not move on its own; it moves
with HQ.

1. The fleet admin chooses *Move*, the new machine and *When* — now, or at a time members are told of. The new
   machine is either a new one, for which they get a one-time code, or a machine already connected that runs no site
   and takes part in no move, which needs no code.
2. On a new machine, the machine admin runs `agenthix console connect <hq address> <code>`; the fleet admin confirms
   its name and fingerprint as for any machine. The new machine waits to receive the site and starts none of its own;
   the Fleet Console shows it as a machine with no site, *Waiting to receive office-server*, never as running one.
3. At the set time, members are told and the site's runs pause; the site is **read-only** from the moment the final
   backup starts, so nothing is lost between the backup and the switch.
4. The old machine's host service passes the sealed backup straight to the new one, which restores it and starts the
   site; the site dials hq with its own credential and takes part again. Paused runs resume.
5. Removing the copy on the old machine is the move's last step, once the site answers from the new machine — not an
   erase — and the old machine leaves the fleet.

If the new machine does not take over, the site goes back to the old machine, which still holds everything, and hq
says the move did not complete. The new machine gives up as soon as its site exits or cannot start, stops it, and tells
the old machine so in a message it signs; the old machine starts the site again on that word. The deadlines that keep
the site from ever running on both machines stay, for when that word does not arrive. A move that ends before the new
machine begins to receive — cancelled, refused or failed — is told to that machine, sealed, with the reason; it stops
waiting, says so in `agenthix status`, and is ready for another move, and the Fleet Console lists it as a machine with
no site. A finished move never blocks a later one: a machine's move records belong to the install that moved. A
move's notice opens that move's outcome. On the machine, `agenthix site schedule move --at <time>` gives the same
code.

## 14. Maintenance

**Diagram:** [Scheduled maintenance](diagrams/6-scheduled-changes.svg) — who schedules and how hq hears; [the timeline of one piece of scheduled maintenance](diagrams/6b-scheduled-change-timeline.svg).

**Maintenance** is the work done to HQ or a site — an upgrade, a change of capacity, a move, a suspend, a restore or
an erase. It is done now, or scheduled for a set time — by a fleet admin in the Fleet Console, by the machine admin
with the CLI, or by Cloud for its own machines — and is **held by the host service of the machine affected**, which
carries it out at that time.

- **hq hears of it** through its private control socket when the work is on hq's machine, or from the site over
  its channel when it is on a site's machine. The same route serves self-hosted and Cloud machines. The Fleet Console
  hears of it from the machine, signed and sealed, as it is scheduled and as it moves on.
- **From scheduling**, hq shows a notice to the members whose work is affected (*Scheduled maintenance: …*). **A few
  minutes before**, it starts no new runs on what is affected, and running agents finish their current step and
  pause. **After**, paused runs resume. If it fails, the host service rolls back and hq says so.
- Moving it to another time or cancelling it sends an updated notice the same way.
- **What is planned belongs to what it is for.** Maintenance planned for an HQ or a site that is no longer on the
  machine — erased, moved away or replaced by a new install — ends as cancelled, with the reason; disconnecting a
  machine from its Fleet Console cancels everything planned on it, saying so.
- **In the Fleet Console, the job is called Maintenance.** The **Maintenance** page lists what is *Planned*, each
  with *Change time* and *Cancel*, and what was *Done recently*. **Plan maintenance…** — on that page, on HQ's page
  and on each site's page — opens one panel beside the page, which stays in view: **Which** (HQ or a site, by its
  machine's name and tag) and **What** (only what that thing allows: HQ an upgrade, a change of capacity, a move or a
  suspend; a site an upgrade, a change of capacity or a move; HQ's own site only a change of capacity, as it upgrades
  and moves with HQ) are drop-downs, always shown and always changeable; then the chosen kind's fields; then
  **When** — *Now* or *At a time…*, saying what members will see; then one button, *Do it now* or *Schedule for
  Sat 02:00*. Nothing starts over: changing What keeps Which, changing Which keeps What when the new thing allows it,
  and what was typed is kept while the panel is open. Opened from a thing's page, Which is that thing and What is
  left to the person. A move started there is followed on its own page. **Erase** stays its own button on HQ's page,
  with the same choice of now or a date ([§15](#15-suspend-resume-and-erase)).
- **The words.** On screens and in what members read, the general word is *maintenance* — *scheduled maintenance*
  where the time matters — and each kind is named for what it does: *Upgrade*, *Change capacity*, *Move*,
  *Suspend*. Never "booking", never "operation", and no longer "change". In the CLI: `agenthix hq schedule <change>
  --at <time>` and `agenthix site schedule <change> --at <time>`; `agenthix scheduled` lists them.

## 15. Suspend, resume and erase

**Diagram:** [Suspend and erase](diagrams/9-suspend-and-erase.svg).

- **Suspend** stops an hq or a site and keeps everything — data, backups, credentials. **Resume** starts it again.
  Suspend is maintenance like any other, now or at a set time, and members are told as for any scheduled
  maintenance. In the Fleet Console, HQ is suspended from *Plan maintenance…*; a site is suspended and resumed on its
  own machine. **A suspended hq is resumed, and an erased one restored, on its own machine** (`agenthix hq resume`,
  `agenthix hq restore`): the Fleet Console reaches every machine through hq, and nobody can sign in to it while hq is
  stopped (§7). While HQ is suspended its page offers *Resume HQ*, and says that if it gets no answer the machine
  admin runs `agenthix hq resume` on HQ's machine; an erased HQ's page gives the restore command.
- **Erase** works like any service's recycle bin: it takes a final sealed backup, removes the running data, and keeps
  that backup and any copy in the backup location for a **grace period** (30 days by default), during which restoring brings it back;
  then everything is purged, the copy in the backup location included. Confirming needs the hq's address typed in.
- **Erasing an hq happens at once by default, or on a date with notice** — the person erasing chooses; nothing forces
  a wait, since the grace period already undoes a mistake. When other people use the hq, the screen recommends notice
  and says how many will lose access without it (*"12 people use this hq. They won't be told unless you give
  notice."*). With a date, hq shows everyone a countdown — *"This hq will be erased on Fri 18:00 by a fleet admin.
  Export what you need, or ask them to cancel"* — and the 30 days start when it runs. The CLI is the same:
  `agenthix hq erase` at once, `--on <date>` scheduled. hq keeps no email, so an erase without notice reaches its people
  only when hq stops answering; accepted, since fleet admins own the machines, every erase is announced to them, and
  restoring stays possible for 30 days. Erasing a site is immediate; hq says the site has gone.

## 16. Uploaded files on their own origin

Files people upload — task attachments and images — are served from **`FILES_ORIGIN`**, an origin of their own, so hq's
own address never serves arbitrary content. hq-web routes that host only to hq-server's file handlers.

- **Access by short-lived signed links**, made by hq for one file and one person; the files origin shares no session or
  cookie with hq.
- **Every file** carries `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` and a
  `Content-Disposition`.
- **Where it comes from**: on `localhost`, `files.localhost:<port>` automatically; with a domain, a files host set at
  install (with a certificate from the host service's front door when that is used; a separate domain is the safer
  choice, as for previews); on a bare network address, there is no subdomain, so hq serves uploads only as downloads,
  never shown inline, and its settings page says so.

## 17. Naming

Names come in two kinds, and a rename must never break an install.

**Names stored on a machine come from the install's own recorded namespace.** At install the host service records
`namespace: agenthix` in its state folder; every name it creates or looks for on that machine — containers, compose
projects, volumes, networks, Docker labels, setting prefixes — is derived from that record, never from the code's current
branding. The state folder holding the record is the one the host service's `docker run` names (`~/.agenthix` in
the guide) and never moves; the host
service's own container is `host`. People recognise the app by its
namespace (`docker ps`, `~/.agenthix`), so it carries the product's name; because it is recorded, a later rebrand cannot
break it.

**If the product is ever renamed**, new code with the new name:

- keeps every existing install on its recorded namespace — nothing renamed, nothing lost — while new installs record
  the new one, and everything a person sees switches at once (below);
- answers to both names for an overlap period set at that release: both commands, both setting prefixes, both image
  names in the registry, both label sets;
- offers a deliberate migration (backup first, data copied into renamed volumes, the rest renamed, the record
  updated), with a notice in the CLI and the Fleet Console until it is done;
- when the overlap ends, refuses further upgrades until a machine is migrated — the running install keeps working.

This unit builds the recorded namespace and derives every stored name from it. The migration, the dual-name readers and
dual publishing are built only if a rename happens; nothing here prevents them.

**What a person sees comes from one setting.**

- **A branding module in `@agenthix/core`** holds the product's display name, the CLI's command name (`agenthix`) and the
  image name prefix. hq, the site, the host service, the Fleet Console and the CLI read it for every command they print
  and every message that names the product; nothing writes those names out itself. Today they are written into about ten
  files in hq, the site's command and messages, the installer and the compose files; this unit moves them all to the
  module.
- **The publishing workflow** takes the image names from the same module.
- **Package names** (`@agenthix/core`, `@agenthix/ui`) cannot come from a setting — npm reads them literally — and stay
  a search on rename.
- **The shortcut on the machine**: `agenthix install` prints a one-line command for the person to run, which saves a
  two-line script as `/usr/local/bin/agenthix` with `sudo` (or as `~/.local/bin/agenthix`, needing no password) that
  runs `docker exec -it host agenthix "$@"`; the host service never writes into the machine's own folders. It holds no logic,
  version or secret; without it, the `docker exec` form works the same. Windows uses the `docker exec` form or WSL.

**Words on screen.** On every screen and in every message the CLI prints, the organisation's instance is written
**HQ**, in capitals — *Open HQ ↗*, *Resume HQ*, *Acme Robotics' HQ* — as Agenthix Cloud writes it, so a word reads the
same in Cloud, in HQ and in the Fleet Console. Documents and code keep the lowercase `hq`, and so do commands, host
names and addresses (`agenthix hq …`, `hq-box`, `hq.acme.example`).

## 18. What else changes

- **Decision records**: the host service is the only authority over a machine, and hq holds none; at most one hq and one
  site per machine; the Fleet Console is a site that dials out to hq, exposes nothing and signs its commands, so hq
  relays them unread; fleet admin is a role on hq accounts, granted only by fleet admins or a machine admin of hq's
  machine;
  hq's address is set when hq-web starts (superseding ADR-0068); every backup is sealed, its key held by a machine; a
  moved hq's sites follow it by challenge–response; uploaded files are served from their own origin; organisation
  admins look after business operations and fleet admins the machines, so a site takes part when a fleet admin or
  Cloud adds it (superseding ADR-0064). ADR-0070 loses its reference to the registration token.
- **Documents**: [`docs/architecture/deployment.md`](../../architecture/deployment.md) is rewritten for host management;
  the user guide's *Install Agenthix* and *Run it on a server* pages describe installing, upgrading, backing up and
  recovering through it, and `./agenthix install` from a clone is no longer the guide's way in. A machine someone rents
  is "a VPS" or "a virtual machine", never "a cloud machine".
- **Folded in**, because this work replaces what they are about: the site operator's first hour (status in sentences with a next step;
  `unregister` saying what is true; a site named at install, after its machine; container limits reachable and listed; upgrade and removal
  notes) and the rest of the first-run wording (the default site's page naming the actual cause).

## 19. Walkthroughs the design must pass

Each through the host-management interface alone:

1. A machine admin installs Agenthix on a fresh machine with one command and gets hq, its default site and the Fleet
   Console, already connected, from published images, and one link for the first account, which holds both admin roles.
2. A fleet admin adds a site on a second machine; it takes part at once, and hq shows its status.
3. A fleet admin schedules an overnight upgrade; members are told; agents pause and resume; a failed upgrade rolls back.
4. A fleet admin changes a site's capacity; hq's capacity for it changes; its runs pause and resume.
5. hq's machine is lost; hq's site is restored on a new machine from its copy in the backup location, with its key —
   by the Fleet Console if it runs elsewhere, otherwise by `agenthix restore --from` there, which brings the Fleet
   Console back too — and the other sites follow. A site's machine is lost and its
   site restored from the same night's copy; hq says what was lost.
6. An hq moves from self-hosting onto Cloud and back, keeping its own domain; another, without a domain, moves to a new
   address and its sites and machines follow, offline ones by `agenthix site hq-address` and
   `agenthix console hq-address`; a Fleet Console on another machine keeps working. A site moves to a new machine at a
   scheduled time with its workspaces and takes the new machine's name, its runs pause and resume, and the old machine
   leaves the fleet.
7. An hq is suspended and resumed; another's erase is scheduled with notice, shown to its people, run, and restored
   within its grace period; a third is erased at once.
8. Remote access is turned on at the Fleet Console's machine; a fleet admin signs in from elsewhere with a code, cannot extend it, and
   it switches itself off.
9. Cloud brings up an hq and its default site on one of its machines and reads its figures, never its data.
10. An agent tries to reach the machine's own ports, another container's port and the metadata address, and is refused.
11. The Fleet Console is moved to a fleet admin's computer with a one-time code; someone who has taken over hq gives an
    account the fleet admin role and still cannot act on any machine.
12. A connected organisation's fleet admins on Cloud are listed in the Fleet Console; one is given the role in HQ by a
    fleet admin there; another, added on Cloud by someone who has taken over Cloud, gets no role in HQ.

## 20. Testing

Each module's own tests cover its part (the host service's operations and refusals, the relay's sealing, the
challenge–response, the files origin's links and headers, the address replacement). The cross-app suite gains a host
service driving hq and a site end to end. The walkthroughs above are checked by hand on two machines before the unit
closes. How each is built and tested is the plan's.

## 21. Out of scope

- **An egress proxy** with a per-project allow-list.
- **A desktop app** — a shell around the host service and the Fleet Console, kept under Post-launch.
- **Other hosting providers' controllers** — the controller interface is built for Cloud only.
- **Cloud's own side** — its relay, controller, dashboard and storage live outside this repository. Until it exists,
  the features that need it — connecting the organisation, Cloud's sites in the fleet, remote access with its
  authenticator code, fleet admins on Cloud, the Cloud controller on a host service — ship as scaffolds behind a
  feature flag, on in development and off in production, enforced where each operation runs; they are built here when
  Cloud builds its side.
- **Voice** — reviewed after this unit.
