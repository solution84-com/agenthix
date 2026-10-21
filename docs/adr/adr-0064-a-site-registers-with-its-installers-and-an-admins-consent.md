---
created: 2026-09-24
description: A site joins an hq only when the person who installed it and an admin of that hq both agree — the installer by acting on the machine, the admin by approving in hq.
---

# ADR-0064: A Site Registers with Its Installer's and an Admin's Consent

**Status:** Superseded by adr-0115

## Context

Registering a site binds a machine to an hq. From then on that hq dispatches runs to it, and the site
starts containers on the machine with its disk and network.

Two parties have a stake in that binding: the org whose hq the site joins, and whoever installed the
site on the machine. A registration token proves only the first. An unregistered site is not
ownerless — someone installed it meaning to connect it to their own hq — yet anyone who reached it
first could bind it to an hq they ran themselves, since hq is self-hostable and minting a token for
one's own hq is free. The site then runs a stranger's work on the installer's machine. The window
opens on every fresh install and again whenever a site is revoked.

The site also listened on every interface, not on localhost as its registration form assumed, so that
form was reachable by anyone who could reach the port.

Two constraints hold whatever the answer. A site accepts no inbound connections, so it can sit behind
NAT with no public port. And a site holds no identity store (the HQ / Execution Site ownership
decision, recorded outside this repository), so it cannot sign a person in itself.

## Options considered

**Token upfront, as before.** An admin mints a one-time token and someone supplies it to the site —
by environment or by pasting it into the site's page. It proves the hq agreed and nothing about who
is supplying it. Rejected for any path where the site offers a way to supply it over the network.

**A page on the site, restricted to localhost, where the installer registers.** Keeps the browser
flow. Rejected because a page on `localhost` is reachable by every program on the machine and by any
web page open in the operator's own browser, and inside a container the site cannot tell where a
request came from at all — it relies on how the port was published.

**A one-time setup code the site prints in its boot log, required by a network-reachable form.**
Proves access to the machine, and works in a container. Rejected because it leaves a registration
surface on the network guarded by one secret, and still needs a terminal to read the log — so it is
no friendlier than a command, and less safe.

**Signing in to hq through the site's page, with the hq address entered on that page.** Rejected: a
login proves the person is an admin of *some* hq, and whoever reaches the page chooses which. An
attacker logs in to their own.

## Decision

**A site registers only when both parties agree, and each proves it in a way the other cannot
forge.** The installer proves it by acting on the machine; an hq admin proves it by being logged in
to that hq.

**By hand, registration is a device approval started on the machine.** The installer runs the site's
registration command there, which is also what names the hq. The site asks that hq for a short-lived
code over an outbound request, shows it, and polls. An admin logged in to hq enters the code and
approves, seeing what is asking — the site's name, its host and the address it connected from. The
site's next poll receives its machine credential.

**When hq creates the machine itself, the approval comes first.** An admin choosing in hq to create a
site is the approval, and hq creating the machine is the installer's proof. hq gives the new machine
a one-time, already-approved token in its startup configuration, and the site presents it on first
boot.

**Nothing on the site can register it from the network.** There is no registration form.

ADR-0044 rejected browser approval because delivering its result needed hq to call into the site.
A device approval does not: the site asks, and the site polls. The no-inbound rule is kept.

The codes and tokens this issues carry the properties adr-0044 already binds registration secrets
to: stored hashed, single-use under concurrency, every refusal identical, verified exactly and
without timing leaks.

## What this binds

- **Any way of registering a site** — a command, a desktop app, a provisioning integration — must
  carry both proofs. A graphical front end drives the same approval from the machine; it may not open
  a port that registers.
- **hq's registration endpoints** issue and redeem approvals rather than accept hand-minted tokens
  from the site's operator.
- **The approval page is a security surface.** What it shows is the admin's only way to tell their
  own machine from someone else's.

Undoing it means restoring a registration surface on the site, and the exposure above with it.

## Consequences

### Positive
- An unregistered site can no longer be claimed by whoever reaches it first.
- No registration secret passes through a person's hands on the manual path: nothing to paste, leak
  or lose.
- The same flow works on a laptop and on a VPS behind NAT, and records which admin approved.

### Negative
- Registering by hand needs a terminal until a desktop app exists.
- A site cannot be registered while its hq is unreachable, even by someone at the machine.

### Risks
- **An admin can be tricked into approving someone else's machine**, which puts that machine in the
  org and sends the org's work to it — the known weakness of device approval. Accepted, bounded by
  the code's short life, approval being admin-only, and the page showing where the request came from.
- **Anyone who can reach hq can ask it for codes.** A code does nothing until an admin approves it,
  so the cost is rows, not access; this is acceptable while codes expire and requests are throttled.
- **Automation that is not hq's own** — a provisioning tool an admin runs themselves — has no
  approved token to use unless hq offers a way to mint one. Left open; if one is added, the admin
  minting it stands in as the installer, and that is the choice to record.

## References

- adr-0044 — **supersedes its registration flow (token upfront)**. Its credential-handling
  properties still stand, and its placement section was already amended by adr-0047.
- adr-0065 — the site has no operator page, which leaves registration nowhere to happen on the site
- adr-0040 — hq-issued token lifetimes
- adr-0046 — protocol compatibility, which the new registration requests follow
