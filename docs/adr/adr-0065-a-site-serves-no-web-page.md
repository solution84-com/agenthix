---
created: 2026-09-24
description: A site has no operator page; what changes its standing with hq is done from hq, what belongs to the machine is done on the machine, and a graphical front end drives the machine's command rather than a port.
---

# ADR-0065: A Site Has No Operator Page

**Status:** Accepted

## Context

A site had an operator console: a status page with actions to register the site and to rotate its
credential. It checked no one. Its comments said that was safe because the site bound to localhost,
but the site listened on every interface — which agent containers rely on to reach its endpoints — so
the page and its actions were reachable by anyone who could reach the port.

A site holds no identity store (the HQ / Execution Site ownership decision, recorded outside this
repository), so it cannot sign a person in itself. It accepts no inbound connections from hq, and it
may sit behind NAT where no one outside can reach it at all.

Registration is settled by adr-0064. What remains is how a registered site is operated — seeing its
status, rotating its credential, taking it out of hq — and whether the site needs a page to do it.

## Options considered

**Keep the page, authenticated by signing in through hq.** The page sends the browser to hq and
accepts a token hq signs for this site. Rejected: it builds sign-in, sessions and CSRF protection on
a module that holds no identity. It locks out someone at the machine whenever hq is down. And for a
site behind NAT, an admin anywhere else cannot reach the page however it is guarded.

**Keep the page, unlocked by a secret on the machine.** Rejected: one shared key, no record of who
acted, and nothing hq can take away.

**Keep the page, served only on localhost.** Rejected: a page on `localhost` is reachable by every
program on the machine and by any web page open in the operator's own browser, and inside a
container the site cannot check where a request came from. It needs host, origin and CSRF defences
to be safe, which is a surface to build and keep right for a page that shows a status line.

**Keep a read-only status page.** Changes nothing, so it is harmless to reach — but it still shows
the site's identity and its hq to whoever can, and a terminal command answers the same question.

## Decision

**A site has no operator page.** Its listener carries what agent containers need and a liveness
check that says nothing about the site. Wasp will not compile an app with no route, so `/`
renders a fixed sentence pointing to hq and the site's command; it carries no data and no
operation, and nothing about the site can be seen or changed through it.

> ⚠️ **The fixed sentence at `/` is gone; the decision is not.** *(annotated 2026-10-02)* The site no
> longer runs on Wasp (adr-0086), so nothing requires a route: its listener carries only what agent
> containers need and the liveness check, and `/` answers 404.

**What changes a registered site's standing with hq is done from hq**, by an admin logged in there,
and reaches the site over the channel the site opened: rotating its credential, and revoking it. It
works behind NAT and records who acted.

**What belongs to the machine is done on the machine**, with the site's own command: seeing its
status — which works when hq cannot be reached, which is when it matters — and taking the site out of
hq. The installer chose to join, so the machine can always leave.

**A graphical way in is a desktop app on the machine**, driving the same command inside the site's
container. Being allowed to control that container is the proof it acts on, and it opens no port.

## What this binds

- **Anything that operates a site** goes through hq over the channel, or through the site's command
  on the machine. A new operation is added to one of those two, never as a page or an endpoint on the
  site.
- **The desktop app** is a front end over the command, not a client of a port the site opens.
- **Anything a person must see about a site** while it is connected is shown by hq.

Undoing it means building authentication for a browser on a module that has no identity store.

## Consequences

### Positive
- Nothing on the site can be seen or changed from a browser, so there is nothing there to guard.
- Operating a site works the same whether or not anyone can reach its machine.
- Every change to a site's standing is made by a named admin, in hq.

### Negative
- Someone running a site on their own computer needs a terminal to see its status until the desktop
  app exists.
- Rotating the credential needs the channel to be up. When it is down because the credential is bad,
  rotating could not help anyway; revoking and registering again is the way back.

### Risks
- **An administration view of what is running on the site, and for whom**, is wanted in the desktop
  app later. That is org data, and control of the machine does not entitle someone to other members'
  activity, so that view needs an hq login. Building it as a view the site serves would reopen this
  decision.

## References

- adr-0064 — registration, the other half of what the console did
- adr-0044 — whose negative consequence accepted the console as unauthenticated on the grounds that
  it bound to localhost
- adr-0045 — request and response on the control channel, which carries hq's operations to the site
- adr-0050 — hq dispatches and executes nothing
- adr-0086 — the site is a plain Node server, so no route is required of it
