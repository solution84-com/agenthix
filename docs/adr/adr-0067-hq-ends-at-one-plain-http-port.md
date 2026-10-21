---
created: 2026-09-24
description: hq's deployment ends at one plain-HTTP port served by its own web container; the machine's front door — domain, HTTPS, ports 80 and 443 — belongs to whoever runs the machine, and an optional front door is shipped separately.
---

# ADR-0067: hq Ends at One Plain-HTTP Port

**Status:** Accepted

## Context

Everything that reaches hq comes through one front door: people's browsers, and every site's control
channel and content transport. A site sends its machine credential through that door, so between
machines it must be HTTPS.

hq is two things behind that door — a browser app built into static files, and a server — so
something always has to serve the one and forward to the other. hq also records a caller's address
from the proxy in front of it, and approving a site relies on that address being real (adr-0064).

The machines hq runs on differ. A server may already have a front door shared by many applications —
Traefik, Caddy, nginx, a tunnel — which owns ports 80 and 443 and the certificates. A laptop may have
none and need none. Only one program on a machine can hold ports 80 and 443.

## Options considered

**hq's stack includes HTTPS itself** — a web server inside it that takes ports 80 and 443 and gets
its own certificate. Rejected: it fights any front door already on the machine, two hq deployments on
one machine collide on the same ports, and it hides that whatever holds those ports is the whole
machine's front door, not hq's.

**Keep nginx in hq's stack and leave HTTPS entirely to the operator.** Rejected as the whole answer:
someone with no front door has to build one before a site on another machine can connect safely, and
the obvious shortcut — publishing hq's port directly — works over plain HTTP with nothing to warn
them that a site's credential now crosses unencrypted.

**Require a particular front door, such as Traefik.** Rejected: no front door is standard. Each is
common for a different reason, and the machine's owner has usually chosen one already.

## Decision

**hq's deployment ends at one plain-HTTP port.** Its stack is its own web container — Caddy, serving
the browser app and forwarding every server path, the site channel included — the server, and the
database. The number of proxies hq trusts for a caller's address is a setting, applied to the web
container and the server alike.

**The machine's front door belongs to whoever runs the machine.** hq documents how to put the common
ones in front of that port.

**For a machine with no front door, a separate front door is shipped** — its own small stack, a
Caddy that holds ports 80 and 443 and gets certificates automatically, with hq as its first entry.
It is separate from hq's stack so that its ownership of the whole machine is visible, and it carries
that warning wherever it appears: it becomes the machine's front door, other applications then route
through it, and it is not for a machine that already has one.

## What this binds

- **Anything hq serves goes through its one port**, by a path its web container forwards. A new
  server path is added there.
- **hq never takes ports 80 or 443, and never holds a certificate itself.**
- **Anything that reads a caller's address** relies on the trusted-proxy setting being right for the
  machine; the documentation for each front door says what to set.

Undoing it means choosing a front door for every machine hq runs on.

## Consequences

### Positive
- hq fits a machine with any front door, or none, without competing for its ports.
- Several hq deployments can share one machine.
- One web server in the repository, used both inside hq and as the optional front door.

### Negative
- Someone without a front door has one more thing to start, and to understand before they do.
- The trusted-proxy count is set by hand and is wrong if the machine's arrangement changes.

### Risks
- **A wrong trusted-proxy count** either lumps every caller under the front door's address or lets a
  caller supply their own. Approval and the per-address throttles depend on it.
- **The optional front door needs the machine reachable from the internet** for its certificate
  check; behind a home router it cannot get one.

## References

- adr-0042 — an org's hq is its own, and self-hostable
- adr-0064 — approval shows the address a registering site connected from
- adr-0066 — a site publishes no port, so hq's is the only door
