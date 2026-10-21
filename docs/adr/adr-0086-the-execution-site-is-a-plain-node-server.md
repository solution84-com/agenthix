---
created: 2026-10-02
description: The Execution Site leaves Wasp and is a plain Node TypeScript server — Express 5, Prisma used directly, no browser app, its image built natively — while hq stays on Wasp.
---

# ADR-0086: The Execution Site Is a Plain Node Server

**Status:** Accepted

## Context

The site was a Wasp app that used very little of Wasp. It declares no authentication, no
operations, no jobs and no web socket: it serves a handful of HTTP endpoints to agent containers,
each authenticating in its own handler, and runs its own boot code. What Wasp contributed was an
Express app with those routes mounted, a Prisma client, an environment check, a migration wrapper,
a development watcher and a build — each a few lines of plain Node or a stock Prisma command.

What Wasp cost the site was concrete. Wasp refuses an app with no page, so the site carried a
React client nobody saw. Its environment check required two browser-app URLs the site never read.
Its image was built in an Intel-only stage, emulated on ARM machines, and shipped the browser app's
and development tools' dependencies. Its model relay worked only because a route-level override
removed the body parsers Wasp mounts on every route. And it could not be type-checked until Wasp
had generated its output.

The first published site image fixes the image's layout, start command and required settings for
every operator who runs it, so the layer under the site was cheapest to change before that.

## Options considered

**Stay on Wasp.** Rejected: it keeps the emulated build stage, the unused client and its
dependencies, and the two meaningless settings in the first published image, and every later change
becomes an upgrade note for operators.

**Plain `node:http`, no framework.** Rejected: every handler is written against Express's request
and response, and the JSON endpoints and the relay's path matching would be rewritten for no gain.

**Another framework (Fastify, Hono).** Rejected for the same reason: a rewrite of every handler's
request and response handling, where Express 5 is what Wasp already ran underneath.

## Decision

**The Execution Site is a plain Node TypeScript server, and hq stays on Wasp.**

- **Express 5**, the version Wasp ran, so every handler is unchanged. Body parsers are mounted per
  route, never for the whole app, so the model relay's body streams through unread.
- **Prisma used directly**, at the version Wasp pinned, against the site's own committed schema and
  migration folder. Migrations are made with `prisma migrate dev` and applied with
  `prisma migrate deploy`; the migration history carries over unchanged.
- **No browser app.** The site serves its agents' endpoints and a liveness check, nothing else.
- **The image is built natively** on every architecture, with only production dependencies, and the
  server itself handles `SIGTERM` and shuts down cleanly.

## What this binds

- **Nothing in `site/` imports Wasp**, and no Wasp command applies there. A site endpoint is an
  Express route the site mounts itself; a route that must stream its body gets no parser.
- **The site's migrations are plain Prisma migrations**, so a released site's database history
  carries forward with Prisma alone.
- **hq and the site follow different conventions** for routes, builds and migrations, and the
  repository's guidance says which applies where.

Undoing it means putting the site back under Wasp's build, its required settings and its page.

## Consequences

### Positive
- The site's image builds natively on ARM and Intel, and carries no browser app or development
  dependencies.
- An operator configures only settings the site reads.
- The site type-checks in a fresh checkout with nothing generated first.
- A stopped site container exits promptly and cleanly.

### Negative
- Two conventions in one repository: a contributor moving between hq and the site has to know which
  module they are in.
- The site owns the few lines Wasp wrote for it: the server entry, the route table, the environment
  check and the build.

### Risks
- **A body parser mounted for the whole app would silently break the model relay**, consuming its
  streamed bodies without an error. A test sends a large streamed body through the relay to catch it.

## References

- adr-0065 — a site has no operator page; the placeholder page Wasp required is gone
- adr-0069 — images are built with only Docker; the Wasp builder stage now applies to hq alone
- adr-0042 — the site holds no identity store

> **Acted on.** *(annotated 2026-10-02)* Carried out by the unit of work `2026-10-02-road-to-first-release`, merged to `main` on 2026-10-02 and verified in the running app and as a native image.
