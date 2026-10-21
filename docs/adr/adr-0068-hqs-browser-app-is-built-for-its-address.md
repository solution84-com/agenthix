---
created: 2026-09-24
description: hq's browser app is built on the machine that runs it, with that machine's address baked in, because Wasp fixes the address at build time; no image of it is shared between deployments.
---

# ADR-0068: hq's Browser App Is Built for Its Address

**Status:** Superseded by adr-0111

## Context

A container image is ideally built once and configured at runtime. A browser app is compiled into
static files that run in a visitor's browser and cannot read the server's settings, so the usual ways
to make one portable are to have it call its own origin with relative addresses, or to load a small
settings file when the page opens.

hq is a Wasp app, and Wasp allows neither. Its browser app reads the server address only when it is
built, requires that address to be absolute, and opens its live connection to the server from it the
moment the app loads, before any of hq's own code runs. Runtime configuration is a known open
request upstream. hq stays on Wasp.

So a built hq browser app works at one address only.

## Options considered

**One shared image, the address replaced at start.** The app is built with a placeholder address and
its web container rewrites the placeholder in the built files before serving them. Rejected for now:
it edits a build after the fact, in a way the framework does not support, and a missing setting
silently leaves the placeholder in place. It is the option a published image would need.

**Configure the address at runtime.** Not available: see the context.

**Leave Wasp for hq.** Solves it outright, and is far larger than the problem: Wasp provides hq's
sign-in, sessions, every browser-to-server operation and how screens refresh after a write.

## Decision

**hq's browser app is built on the machine that runs it, with that machine's address.** The build is
one step whose only input is the address, so a person, a script, an installer, or an image that
builds when it starts can run it unchanged. No image of hq's browser app is shared between
deployments.

The server and the site are unaffected: both read their settings when they start.

## What this binds

- **Publishing ready-made images** can publish hq's server and the site as they are; hq's browser
  app needs a decision of its own at that point — placeholder replacement, a builder image, or
  building when it starts.
- **Changing hq's address means rebuilding its web container.** That rebuild holds no data.
- **Anything that automates installing hq** runs the build step with the address.

Undoing it means either the placeholder replacement or leaving Wasp.

## Consequences

### Positive
- The address is baked in the way the framework intends, with nothing edited after the build.
- A wrong address fails where it is easy to see: hq's pages load and cannot reach its server.

### Negative
- Every machine running hq builds, which takes minutes and needs internet access.
- There is no ready-made hq image to download.

### Risks
- **Moving hq to a new address** needs more than a rebuild: every site dials the address it
  registered with. That is left open, as a question about migrating an install, not about building.

## References

- adr-0042 — an org's hq is its own, and self-hostable
- adr-0067 — hq ends at one plain-HTTP port, served by its web container
- adr-0069 — images are built with only Docker on the machine
