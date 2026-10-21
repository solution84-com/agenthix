---
created: 2026-09-25
description: Every install brings hq and one site on the same machine, connected by a secret in both environments rather than by registration; the site cannot be revoked or removed, and every other site still registers with consent.
---

# ADR-0070: hq and Its Own Site Are Connected by Configuration

**Status:** Accepted

## Context

Registration ([ADR-0064](adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md)) exists
because a stranger could ask to join an org, so an installer and an admin both have to agree. For the
one site that comes with hq, on the same machine, both are the same person and the request cannot come
from a stranger. Making them register it anyway was the worst part of a first run: a code, an approval
page, and no guidance, with hq refusing to do anything until it was done. An earlier attempt to remove
the step made hq invent a placeholder site for itself, which was not a real machine and offered itself
where nothing could reach it.

## Options considered

**hq starts the site itself.** Needs published site images and access to the machine's Docker for hq,
which the deployment work removed on purpose. Kept as a later feature for adding further sites.

**A one-time registration token minted by hq.** Removes the approval, but a site that loses its link, or
an hq that loses its database, needs the token again — an install that can be broken and then needs
repairing.

> **Annotated 2026-10-14.** The registration-token route this option refers to is removed: a further site now takes
> part when a fleet admin adds it in the Host Manager (adr-0115). The default site still joins by its pairing secret,
> as decided below.

**A placeholder row hq creates for itself.** Rejected: nothing is behind it.

## Decision

**Every install brings hq and one site as a pair, on the same machine.** The organisation decides
later whether its operation stays there or is managed elsewhere.

**They are connected by configuration.** One secret is set in hq's and the site's environment. The
site uses it as its credential every time it connects, and hq makes sure at every boot that a default
site exists with that secret's hash as its credential. There is no registration and no approval, and
nothing to repair: a wiped database on either side is rebuilt from the same secret at the next start.

**The default site cannot be revoked, left or removed**, because an organisation must always have one.
Its secret is rotated by changing it in both environments and restarting. Every other site registers as
[ADR-0064](adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md) says.

## What this binds

- **Nothing on hq creates a site that has no machine behind it.** The default site is a real service
  running beside hq.
- **An operation that would take the default site away is refused by hq**, not hidden by a page.
- **The secret is a credential**, held like the others in the environment files and never logged.

Undoing it means going back to registering the site that comes with hq.

## Consequences

### Positive
- A first run needs no registration step and works before anyone opens hq.
- There is no state of "hq with no site" for an install to be stuck in.

### Negative
- The secret is a standing credential in two files on one machine. It sits beside the master key and
  the other secrets there, and rotating it is a manual change in both files.
- An hq deployed with no site service beside it shows a default site that is always offline.
