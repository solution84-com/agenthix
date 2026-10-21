---
name: Phase 8 — Remote Operations: Design
created: 2026-06-23
description: Design spec for Phase 8 — Remote Operations: Design. Front-matter added during the docs/ migration; body unchanged.
---


# Phase 8 — Remote Operations: Design

**Date:** 2026-06-23
**Status:** Draft
**Branch:** `feature/remote-operations`
**Roadmap:** Phase 8 — Remote Operations
**Architecture:** [Site Live Preview](../../docs/architecture/sites/site_live_preview.md) — the durable system design (owner / architect / team audience). This spec is the dev-facing Phase 8 build of it.
**Related:** [ADR-0036 — Context-Centric Security](../../docs/adr/adr-0036-context-centric-security.md), ADR-0034 — Dynamic Port Allocation (a decision on dynamic port allocation, recorded outside this repository)

> Scope is locked from the brainstorming session. This spec turns it into an implementable design.

## Goal

Run operations from your phone, **safely**: instruct the agent, and **preview the result before it deploys**. Two principles — the preview-before-deploy mechanism is **generic across web apps** (any HTTP app the agent builds, not just Agenthix); and the agent **pushes to GitHub but never deploys production** (promotion stays human-gated).

## Scope

**In:**
1. **Direct the agent remotely** — verify the chat → work loop is fully usable on a phone (rides on Phase 7).
2. **Web live preview** — the agent starts a dev server on its working tree; site reverse-proxies `/preview/:token` (HTTP + WebSocket) to it; kept warm, idle-expired.
3. **Push-not-deploy guardrail** + a **minimal secure secret primitive** (the GitHub push credential).
4. **Minimal read-only project-file preview** — browse/open a project's workspace files from mobile.

**Out (deferred):** mobile/native preview (`BL-025` (in the backlog it was raised on, since retired)); the full Project Files surface (Phase 10); the session-scoped-runtime overhaul (Phase 14 — this phase ships on the current long-lived container).

## Architecture

### 1. Web live preview

```
phone browser ──HTTPS──▶ site server ──/preview/:token──▶ proxy ──Docker net──▶ agent container
                          (session+token+requester check)        http://<container>:<devport>
                                                                  (dev server: npm run dev / vite / …)
```

**Dev-server lifecycle.** A new platform tool, `start_preview({ command, port })`, lets the agent (which knows its project) declare how to serve it. The **site** spins a **dedicated, ephemeral preview container** that bind-mounts the *same* working-tree host path the agent uses (no copy) and runs the command — but carries **no agent credentials** and a minimal image. Running the browser-facing dev server in a separate container isolates it from the agent's `.claude` material + git token (security). The site owns the lifecycle (create / health-check / warm / idle-destroy); the agent only *requests* it. The preview container is created per preview, so its port is published at creation; killed on idle. One preview per agent.

**Proxy.** Wasp `api` blocks can't do wildcard paths, so register a raw Express handler in `setupServer()` (alongside the existing custom routes in `site/src/server/setup.ts`):
- `app.use('/preview/:token', previewProxyHandler)` — HTTP proxy (via `http-proxy`) to `http://<containerName>:<port>`.
- Raw `httpServer.on('upgrade')` for `/preview/:token` → proxy the **WebSocket upgrade** to the dev server (HMR / hot reload). This is separate from Wasp's socket.io.
- Each request bumps `lastAccessAt`.

**Token model (Prisma).**
```
PreviewSession {
  id               String   @id @default(cuid())
  token            String   @unique       // unguessable (nanoid/crypto)
  agentId          String
  sessionId        String?                 // owning chat session, for auth scoping
  previewContainer String                  // ephemeral preview container name
  port             Int                     // port the dev server binds inside the container
  hostPort         Int?                    // published host port (dev); null when on shared network
  command          String
  status           String                  // starting | running | expired
  createdAt        DateTime @default(now())
  lastAccessAt     DateTime @default(now())
  expiresAt        DateTime
}
```

**Container networking.** The site reaches the preview container by an **environment-aware resolver**: in dev the site is a host process (Mac/Docker-Desktop can't reach container IPs), so the preview container **publishes its port to the host** and the site proxies to `localhost:<hostPort>`; in the containerized local/VPS stacks the site is a container on the shared network and proxies to `<previewContainer>:<port>`. Because the preview container is created per preview, the published port is set at `docker run` (no retrofit of a running container).

**Surfacing.** `start_preview` returns `https://<site>/preview/<token>`; the tool result puts the clickable link in chat.

**Warm + idle-expire.** First request may cold-start (install/build/boot → a "starting preview…" state); after that the dev server stays running and requests are instant. An in-memory `token → {container, port, lastAccessAt}` registry avoids a DB hit per request. A sweep kills dev servers idle past `expiresAt`.

**Per-requester authorization (ADR-0036).** The proxy checks the Wasp **user session** *and* that the requesting user may access the preview's owning resource — not merely "is the token valid." This is ADR-0036's principle showing up early; a leaked token alone does not grant access.

### 2. Secret primitive (GitHub push credential)

A minimal **per-site secure secret store** for the agent's git push credential (PAT / deploy key), injected into git operations via a credential helper at run time — **never** written into transcripts, logs, or the workspace. Extends the existing `SiteSecret` pattern; designed to generalize (it's the seed of ADR-0036's per-run secret injection), but Phase 8 only needs the one credential.

### 3. Push-not-deploy guardrail

- The agent can `git push` (using the secret above).
- **No agent tool or path deploys production.** Audit the agent tool set to confirm; production promotion is a **human action**, not an agent capability. The agent cannot self-destruct the host environment.

### 4. Minimal read-only project-file preview

- Read-only browse of the project workspace + open files, reusing the existing file-serving routes (`/files/agent/...`).
- Render markdown / code / diffs / images in-app; hand other types (docx/xlsx/pdf/…) to the device's native app.
- **No upload / edit** (that's Phase 10).

### 5. Direct the agent remotely

Verification pass: confirm the mobile chat → instruct → watch-work loop (Phase 7 overlay) is whole; patch gaps. No new architecture expected.

## ADR-0036 alignment

The agent's long-lived container is **unchanged** — the preview runs in its own ephemeral, credential-free container, which is *already* a short-lived isolated runtime with explicit create / warm / idle-destroy. So the later session-scoped-runtime shift (Phase 14) needs no rework here. The proxy's per-requester auth already follows the context-centric principle, and isolating the browser-facing surface from the agent's credentials is a direct application of ADR-0036's isolation boundary.

## Migrations (agent workflow)

Schema changes (e.g. the `PreviewSession` model here) migrate **without an interactive terminal** — proven during this build by generating + applying `preview_session` via `wasp db migrate-dev --name <n>` with stdin closed. The agent flow: change schema + code → ensure the project **compiles** (wasp type-checks the whole tree before migrating) → `migrate-dev --name <n>` (non-interactive) → commit the `migrations/` artifact → push; the deploy applies it via `prisma migrate deploy` on container start; **production application stays human-gated**. Full detail: the deployment architecture's migrations document.

## Testing / QA

New scenarios (QA contract) to add for: preview create → reachable → WebSocket hot-reload → idle-expire → unauthorized-requester rejected; secret never appears in transcript/logs; no agent path deploys production; read-only file preview renders in-app vs delegates by type.

## Open questions / risks

- **Cold-start UX** — install/build before first paint; need a clear "starting preview…" state and a timeout.
- **WebSocket upgrade routing** — co-existing with Wasp's socket.io on the same server; must match only `/preview/:token` upgrades.
- **Docker network wiring on the VPS** — attaching dynamically-`docker run` agent containers to the site network; verify on the VPS compose topology.
- **Dev-command trust** — `start_preview` runs an arbitrary command in the agent container; it's the agent's own sandbox, but the command/port should be validated.

## Module impact

- **site/** — heavy: Prisma model + migration, the proxy route + WS upgrade, `PreviewContainerManager` (spin/health-check/kill the ephemeral preview container), the env-aware target resolver, `start_preview` tool, idle sweep, secret store, read-only file preview, tool-set audit.
- **Parent infra** — the shared Docker network for preview containers in the local/VPS stacks (compose).
- **core/** — only if a preview type needs sharing (likely none for this phase).
