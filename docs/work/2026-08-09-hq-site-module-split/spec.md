---
name: HQ / Site Module Split — Design
created: 2026-08-09
description: Design spec for HQ / Site Module Split — Design. Front-matter added during the docs/ migration; body unchanged.
---


# HQ / Site Module Split — Design

**Date:** 2026-08-09
**Status:** **Superseded 2026-08-14 by the hq/site split unit's design spec**, the consolidated living design for the whole split — read that, not this. This document is kept as the historical record of the original design and its amendment trail. Work tracking lives in `docs/plans/2026-08-14-hq-site-split.md`.

**Direction, current as of 2026-08-11 (settled after three reversals — see history below; this one is measured rather than argued):** `site`'s existing codebase **becomes `hq`** — renamed in place, keeping its git history, its full schema, its entire UI, and every control-plane concern. A new, small `site` module is built fresh, receiving **only the execution layer**: agent runtime, session drivers, workspace storage, MCP, voice, git, preview, and the outbound HQ-link mechanism. See §1 for the file-level mapping and §5 for the deployable-shape consequence.

**The rename has landed** (commit `c326c9e`, 2026-08-11): 512 files moved via `git mv`, behaviour-preserving — wasp compiles, `tsc --noEmit` clean, 746 tests pass across 111 files. Nothing is extracted yet.

**Amendment history (chronological, kept for context — only the Direction line above is current):**
1. Added §8 during Plan 1 review, after discovering existing `site/src/server/hq/` code built for a different (pre-ADR-0042) ownership shape.
2. Flipped direction once: `site` becomes `hq`, a new minimal app built for the execution layer — reasoning at the time was matching `agenthix/CLAUDE.md`'s wording ("most of today's `site` code becoming the new `hq`") literally. Plan 1's original scaffold (a fresh, near-empty `hq/`, built under the pre-flip direction) was reverted as part of this — see the Master Plan for the revert step.
3. §2 extended with an authorization-capability design (§2a) — site-side execution needs more than identity verification, it needs project/task-scoped permission that doesn't require calling `hq` mid-session.
4. New §4a settled chat/voice transport as relayed through `hq`, generalized transcript reads into the same mechanism, and resolved both failure axes (`site` unreachable → explicit error, no durable copy on `hq`; `hq` unreachable mid-session → live view drops but the run and storage are unaffected, browser catches up via an ordinary read on reconnect). §6 updated to cross-reference it.
5. **Flipped back** — the CLAUDE.md wording in step 2 describes the *end state of ownership*, not the mechanical path to it; both directions put the majority of files under `hq`, they just differ in which app inherits `site`'s git history vs. gets built fresh. Chosen on implementation risk instead: the execution-layer code (container lifecycle, Docker process management, streaming) is the highest-consequence code in the tree, and extracting *that* into a brand-new app is riskier than extracting the comparatively simple, higher-volume CRUD/UI code (§1, §5, §8 below reflect this). §2/§2a/§3/§4/§4a/§6 are written in terms of roles ("hq mints, site verifies") and needed no change across either flip.
6. **Flipped a third time, and this one rests on measurement rather than judgement.** Amendment #5 rejected extracting the execution layer as riskier than extracting "the comparatively simple, higher-volume CRUD/UI code." The first half stands — container lifecycle, Docker process management and streaming remain the most delicate code in the tree. The second half did not survive a file-level audit (a re-runnable boundary-audit script kept with that work in `.artifacts/dev/reports/`, gitignored):
   - **Volume:** direction A moved ~200 files / ~20,300 lines; direction B moves **88 files / ~8,000 lines**.
   - **The decisive measurement:** of the 192 files staying with the control plane, only **six** reach into the execution layer, and all six import types or one small pure utility. No UI file touches container management, the agent engine, or any runtime — the UI reaches the backend exclusively through Wasp operations, so a rename leaves all ~14,000 lines of it intact.
   - **The expensive work is identical either way:** 16 execution-layer files make **81 direct Prisma calls into control-plane models** (`mcpServer` 19, `TaskRunner` 15, `AgentEngine` 8, `workforceTools` 7, `dashboard/snapshot` 6, `storage/queries` 6). Those become §2a claims and §4b calls regardless of which app moves. Direction A added a 20,000-line port on top of that work; direction B adds a rename.
   - **Direction A had no safe intermediate state** — `hq` was empty until everything landed. The rename is safe by construction, and was verified so.
   
   Attempting direction A also surfaced that §1's carve-out table was wrong in five places (see the corrections folded into §1 below), which is itself evidence that a file-level mapping was the wrong abstraction for this change.

**Branch:** `feature/hq-site-module-split`
**Roadmap:** Phase 9 — Open-Source / Cloud Split (remaining work: "Design and build the `site` → `hq` + `site` module split")
**Related:** the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository — Monorepo Split: HQ as Org Source of Truth, Site as Execution Layer; [ADR-0038](../../docs/adr/adr-0038-workspace-as-storage-entity.md) — Workspace as Storage Entity; [ADR-0036](../../docs/adr/adr-0036-context-centric-security.md) — Context-Centric Security

> Scope locked from a brainstorming session on 2026-08-09. This spec turns it into an implementable design.

> **Superseded in full.** This spec held through Plan 4 and was first superseded from Plan 5
> onward by `2026-08-12-plan5-execution-runtime-design.md` (itself now superseded); both are
> consolidated into `2026-08-14-hq-site-split-design.md`, the single current design.

## Goal

Split `site`'s own codebase into two independently deployable Wasp apps — `hq` and `site` — so the org's own HQ role (single source of truth for org data, per ADR-0042) lives in the open-source product instead of not existing at all. Build this for a genuine multi-machine topology from the start: an org's HQ and its Execution Site(s) can run on separate machines, and an org can register more than one Execution Site.

This is new work carved out of `site`. It is not a merge of the old `hq/server`/`hq/client` codebase — that code already relocated out of this repository as a centrally-hosted service's seed, a different thing (a centrally-hosted cross-org service) from an org's own self-hosted HQ.

## Scope

**In:**
1. Split `site` into two independently deployable Wasp apps: `hq` (org source of truth) and `site` (execution layer), each with its own `main.wasp`, `schema.prisma`, and database.
2. A multi-Execution-Site registry — an org can register more than one Execution Site with its HQ.
3. An HQ-issued identity model — HQ issues short-lived signed tokens; Execution Sites verify them locally, holding no independent identity store (ADR-0042).
4. A remote container-control channel — each Execution Site dials out to its HQ over an authenticated, persistent connection to receive dispatched work and report status. Today's `AgentContainerManager` (local Docker `execFile`) stays local to whichever Site runs the container; only the *trigger* becomes remote.
5. The deployable/dev-environment layout for the two new apps (directory structure, local databases, `docker-compose*.yml` updates).

**Out (deferred):**
- Cross-org federation (the cross-org federation decision, recorded outside this repository, still Draft).
- HQ Site failover/election — explicitly deferred in ADR-0042; not revisited here.
- Data migration from existing single-schema installations. This pass is clean-slate; migrating existing rows into the split schema is separately-scoped follow-on work.
- Auto-placement or load-balancing of new projects across an org's Execution Sites — for now the user picks a site explicitly at creation time.
- Full multi-user RBAC (Phase 15 — Security & Access); this spec depends on membership-based authorization only, per ADR-0036.
- The HQ-side policy engine and work-queue's internal scheduling algorithm beyond "route to the site that owns the target Workspace" — policies are named as an HQ responsibility in ADR-0042 but not designed in depth here.

## Architecture

### 1. Responsibility split

**Direction (settled 2026-08-11, see Status line history):** `site` was renamed to `hq` and keeps everything — schema, UI, control plane, and for now the execution code too. A new `site` module is built fresh and receives **only** what the table below lists. **Everything not listed stays in `hq`, unchanged in place.** This is the inverse of how this section read before amendment #6; the content of the split is unchanged, only which app moves.

Grounded in ADR-0042's own wording — HQ holds "indices, aggregate views, agent/project metadata, policies, queues, orchestration"; Execution Sites are "the execution layer only... no independent identity store" — and confirmed against the actual tree by a re-runnable audit (88 files move, 192 stay):

| Carves out into the new `site` (execution layer) | Specific code | Rationale |
|---|---|---|
| Agent runtime | `agents/runtime/*` — `AgentContainerManager`, `AgentEngine`, `DockerSpawner`, `ClaudeSDKRuntime`, `NativeRuntime`, `toolPermissions`, `toolRegistry`, `workspaceLockService`, `manifestParser`, `riskRating`, `socket`, `agentUtils` | Runs containers on one specific machine's Docker |
| Session drivers | `ChatRunner.ts`, `TaskRunner.ts`, `AgentHeartbeat.ts`, `HeartbeatManager.ts`, `AgentPromptBuilder.ts`, `kernelBootstrapService.ts`, `gitAccessService.ts`, `skillsActiveService.ts` | Drive execution; `skillsActiveService` writes skill files into a live agent workspace on disk |
| Sessions & transcripts | `sessions/*` **backend only** — the UI stays in `hq`, see the resolution below | `AgentSession`/`AgentRun`/`TranscriptEntry`/`ToolCallLog` are runtime state owned by the machine that produced them |
| Workspace storage | `storage/*`, `preview/*`, `operations/*` | Real bytes on one machine's disk (ADR-0038) |
| Machine-scoped services | `server/mcp/*`, `server/voice/*` + `server/agents/agentVoiceActions.ts`, `server/git/*`, `server/github/repoApi.ts`/`githubRuns.ts`/`githubSecrets.ts`/`githubClient.ts`, `server/crypto/secretCrypto.ts`, `server/utils/containerLabels.ts`, `server/dashboard/*` | All operate on local containers, local disk, or a specific workspace's repo |
| Site config & the HQ link | `server/hq/*`, the `SiteConfig` and `HqConnection` models, `settings/`'s SiteConfig-scoped exports, the `/settings/hq` UI | This is the *site side* of the connection — the thing that dials out. Verified independently extractable: it touches only `siteConfig` and `hqConnection`, no control-plane models |
| Execution-layer shared modules | `shared/mcpTools.ts`, `shared/runtimeTools.ts`, `shared/promptSections.ts`, `shared/utils/aiMetrics.ts`, `shared/constants/voiceEvents.ts`, `server/siteConfig.ts`, `server/siteSecretService.ts`, `server/providerService.ts` | Execution concerns that happen to live under `shared/` or `server/` |

**Five corrections to this table's earlier form, all found by auditing the code rather than reasoning from the abstract areas — worth keeping visible, since each was wrong in the same direction (assuming a clean boundary where the code has none):**

1. **`githubSecrets.ts` and `githubClient.ts` are site-bound, not org-level.** The earlier table listed them alongside the genuinely org-level `githubApp.ts`/`githubAppApi.ts`. `githubSecrets.ts`'s only export takes a `RepoTarget` — a specific workspace's repo attachment — and calls `resolveRepoApi` in `repoApi.ts`; `githubClient.ts`'s only importers are `githubRuns.ts` and `githubSecrets.ts`. Both stay with the execution layer.
2. **`shared/` was missing entirely.** 65 files, ~4,900 lines — the app shell, sidebar, layout and shared UI components. Every page imports `AppLayout` from it. Under this direction it simply stays in `hq`, which is correct; under the previous one its absence would have broken every page.
3. **Session and chat UI belongs to `hq`, not `site`** — resolved below.
4. **`sessions/*` is mixed**, described in the repo's own context file as "session management UI **and** logic." The drivers and transcript storage move; the UI stays. It needs the same mid-file split this table already applies to `settings/`. Not inventoried in detail.
5. **`agents/workspaceService.ts` is mixed and must be split**, not assigned wholesale. It has **17 importers** across `agents/`, `library/`, `onboarding/`, `projects/`, `products/`, `settings/` and four `server/` handlers. `getAssetsRoot()`/`getProductDir()`/`resolveAssetPath()` serve hq content (board and agent templates, skills library, avatars, product wiki, `ORG.md`); `getAgentDir()`/`getAgentWorkspaceDir()`/`getAgentPrivateDir()` serve agent workspaces. Under this direction it stays in `hq` by default and only the agent-workspace subset is extracted, at extraction time.

**Session and chat UI is `hq`'s — correcting a contradiction this spec carried against itself.** The earlier table listed `sessions/*` and `server/voice/*` wholesale under the execution layer and never mentioned session pages, which read as "chat UI lives on the site." But §4a states the browser "always talks to `hq`," §2b says a workspace's own page is "necessarily rendered by `hq` (browsers can't reach `site` directly, no exceptions)", and this section's own conclusion — that `site` retains no `User`/`Session`/`Auth` tables — means **`site` cannot authenticate a browser user at all**, so it cannot render any per-user UI. Chat is not even a navigation destination in this app; it is the right-hand panel `AppLayout` itself mounts. Resolution: session **drivers and transcript storage** move to `site`; the session **UI** (`ChatPanel`, `RightSidebarPanel`, task/session pages, voice controls) stays in `hq`. `site`'s only browser surface is an operator console — install diagnostics, site config, the HQ link — and even that must authenticate against hq-issued tokens (§2), which is not yet designed.

**Resolved by this pass, more confidently than before:** `hqApi.ts`'s `hqProvisionUserHandler`/`hqCreateSessionHandler` (provision a local shadow `User` row, mint a local Wasp `Session`) **almost certainly become dead code** — not just awkward, actually dead — because `auth/`'s `User`/`Session`/`Auth`/`AuthIdentity` tables move to `hq` per the table above, leaving `site` with no local identity store to provision into or mint a session against at all. This isn't a placement question anymore, it's a "does this data model still exist on this app" question, and the answer is no. `hqConnectCallbackHandler` — **confirmed relevant, not just "maybe," as of this pass** — see the resolution in §8.

#### 1a. Which hq-owned entities need a site — added 2026-08-10

Three entities move to `hq` and each has a different answer to "does it need to know which `site` it runs on," settled by one rule: **anything with disk-resident storage needs a site; anything that's pure definition doesn't.**

- **`Agent` — no site.** *(Reversed 2026-08-12 — see the Plan 5 spec, §A1. The premise below is factually wrong: an agent has disk-resident storage it writes itself.)* Pure definition (name, model, tools, autonomy) with no disk state of its own. Hot-swappable across every project and every site in the org via `ProjectMember` — no validation needed when adding an agent to a project regardless of which site that project is on. It simply executes wherever the project it's currently working on lives; dispatch (§4) already routes each task to the site owning that project's Workspace, which is the only place "which site" ever gets decided for an agent's work. No `executionSiteId` field, no consistency rule against `ProjectMember`/`Task.assignedAgentId` — an earlier draft of this section proposed pinning `Agent` to a site and was wrong; reconsidered and reverted before being built.
- **`Project` — has a site.** Unchanged, already established: its Workspace is real bytes on one machine's disk, picked explicitly at project creation (§3).
- **`User` — needs a home site, new in this pass.** *(Reversed 2026-08-12 — see the Plan 5 spec, §A2. A person's files home exists on every site, so there is nothing to anchor.)* A user's personal, project-less chat falls back to their own "files/" home — confirmed directly against `site/src/storage/primaryLocationService.ts`'s `resolvePrimaryLocation()`, which already falls back to `{ ownerType: 'user', ownerId: session.userId }` and is described in that file's own comment as "provisioned lazily." That personal home is disk-resident storage, same as a Project's Workspace, just owned by a `User` instead — so it needs the same kind of site reference a Project has. Concretely: **`UserSettings.homeSiteId` → `ExecutionSite.id`** (§3) — a real, enforced Prisma foreign key, since both are `hq`-owned, same database. **Assigned lazily**: the first time a user starts a project-less chat with no `homeSiteId` set yet, they're prompted to pick a site (reusing §3's existing project-creation site-picker UX, not a new pattern) — or auto-assigned with no prompt at all in the single-registered-site case, which is the common one.

**Deliberately not designed here — see the Risks section:** migrating a `User`'s or `Project`'s data to a different site after the fact, and what happens to a site's data when an admin decommissions it.

**Related, not the same question:** whether an *agent* can access a given workspace's contents at all (as opposed to which site the workspace lives on) is a separate, now-settled design — see §2b.

**Still open, not resolved by this pass:**
- ~~the mobile client~~ **Resolved 2026-08-10:** no different from a browser. §4a already established that *every* client — no exceptions — talks to `hq`, which relays chat/voice to `site`; nothing about that principle is browser-specific. So a separate mobile client logs in against `hq` (same QR-scan exchange, unchanged in shape, just moved) and its chat/voice traffic relays through `hq` to `site` exactly like a browser's. `mobile/actions.ts` moves to `hq` alongside `auth/*` — it was omitted from §1's carve-out table by oversight, not by design; `MobileAuthToken` was already listed there as hq-owned, the code implementing it just wasn't explicitly named.
- The general "how does `site` read/call `hq` for data it needs but doesn't own" mechanism — illustrated concretely by `server/github/repoApi.ts` (stays in `site`) already calling `getTokenFor()` in `server/github/githubApp.ts` (moves to `hq`) *in-process* today, and by `server/dashboard/snapshot.ts`'s HQ-owned counts. §4a resolves this for chat/transcript data specifically (`hq` queries `site` live, generalized); the same shape likely applies in the other direction (`site` querying `hq`) for cases like this one, but that hasn't been designed yet. Needed before Plan 4 (and arguably before Plan 2) can be fully scoped.

**Consequence:** once `Project` (HQ's database) and `Workspace` (Site's database) live in separate databases, `Workspace.ownerId` pointing at a project stops being an enforceable foreign key — it becomes a logical, HQ-issued ID that Site trusts but cannot validate at the database layer. The same applies to any Site-side record referencing an HQ-side Agent or User. This is a real integrity trade-off inherent to the split, not incidental plumbing, and application-level consistency checks (not database constraints) are the mitigation.

### 2. Identity & the HQ↔Execution Site trust bridge

- A user (or agent run) authenticates against HQ and receives a short-lived signed token (org id, user id, roles, scopes).
- Execution Sites verify that token's signature locally, against HQ's public key (fetched and cached on registration, rotated via a standard key-id/JWKS-style pattern) — no network round-trip to HQ per request.
- This is the same shape Site uses today to verify Auth-issued JWTs, just re-pointed at HQ as the issuing authority.
- **Trade-off, accepted:** because verification is local, revocation (e.g., a user removed from the org) only takes effect when the token expires, not immediately. Token time-to-live is a tuning parameter for a later pass — short enough to bound the revocation window, long enough to avoid excessive re-auth traffic.

This is deliberately a *different* credential from the machine credential in §4 below — a human/agent-run identity token is not the same thing as an Execution Site's own machine identity.

#### 2a. Authorization is a capability, not a lookup — added 2026-08-10

Identity alone doesn't cover what `site` actually needs. §1 puts `Project`/`ProjectMember`/`Task` (the data that defines *who's allowed to touch what*) on `hq`, while the thing being protected — the `Workspace` a running agent container reads and writes — lives on `site`. If `site` had to ask `hq` "is this agent/user allowed to touch this workspace?" on every file operation or tool call during a run, that's a live dependency on `hq`'s reachability for something as basic as writing a file — slow (a network round trip per check) and fragile (a task stalls or fails the moment `hq` is unreachable, mid-run, for a permission it already had). It also silently contradicts §6's existing claim that *"work already running on a Site continues uninterrupted [when HQ goes down], since `AgentContainerManager` needs no HQ connectivity mid-run"* — that's only true if authorization doesn't require calling `hq` mid-run, and nothing before this revision explained how.

**The resolution: `hq` mints a signed, scoped, time-boxed capability at the moment it dispatches work — not a fact `site` looks up during execution.** When `hq` pushes a dispatch job down the control channel (§4: *"run task X"*), the payload carries an authorization claim alongside it — e.g. *"agent/user Y is authorized against Workspace Z, for this task, until this time"* — signed by `hq`, the same way the identity token is. `site` verifies the signature locally (same local-verification pattern as the rest of §2) once, at the start of the run, and needs nothing further from `hq` for the run's duration. The capability's lifetime is tied to the task/session it was minted for, not a standing grant — a new task means a new capability, minted fresh at dispatch time.

**This is not the same thing as the delta-sync/index-mirroring system removed in §8, and shouldn't be rebuilt as one.** The old sync machinery existed because Site and (the old) HQ had *different* owners and Site needed its own durable copy of data for sovereignty reasons — that reasoning doesn't apply under ADR-0042's single-owner model, and staying removed is still correct. This capability is different in kind: minted fresh per dispatch, scoped to one task/session, short-lived, never persisted as a standing local mirror of `ProjectMember` rows. It answers "was this specific run authorized," not "what does the org's membership table currently say" — `site` never needs the latter.

**Claim shape, settled 2026-08-10:** `userId`, `agentId`, `projectId` (nullable — null for personal/global chat, §1a), `workspaceId` (the session's primary location, matching `primaryLocationService.ts`'s existing concept), `taskId` (nullable — set for a dispatched task run, null for open-ended chat), `expiry`, and the resolved effective tool permissions — the agent's own `allowedTools`/`allowedBashPatterns` (§1a, stays global) combined with the §2b workspace access policy if one applies, pre-computed by `hq` at mint time so `site` never has to combine these itself. Signed by `hq`, verified locally by `site`.

**A sibling token, not a field merged into the identity token from earlier in this section.** They have different lifetimes and different minting triggers: identity is minted once at login, reasonably long-lived (the revocation-lag/re-auth-traffic trade-off already described above); the capability is minted fresh per dispatch *or per interactive session start* — chat needs one too, not just dispatched tasks, since it's the same authorization question either way — and should stay short and narrowly scoped. Merging them would force one into the other's wrong lifetime.

**Long-running session renewal:** voice chat and long tasks can outlive a single capability's TTL, and dropping a session every time it expires would be bad UX — but the whole point of this section was avoiding a live check *during* execution. Resolution: `site` proactively requests a renewed capability from `hq` before the current one expires (e.g. at 80% of TTL), over the connection that's already open, without pausing whatever's running. Invisible when `hq` is reachable. If `hq` is unreachable when renewal is attempted, the current capability keeps being honored until it actually expires — at which point, if `hq` is still down, this becomes the same "`hq` down" failure mode §4a/§6 already describe, not a new one. **Honest edge case, accepted rather than solved further:** §6's "work continues uninterrupted" promise holds as long as `hq` comes back before a capability's TTL runs out; an outage longer than that would eventually stall a very long-running task. Consistent with how the rest of this spec treats extended-outage scenarios elsewhere — a real, narrow trade-off, not an oversight.

#### 2b. Workspace access policy — added 2026-08-10

`Agent.allowedTools`/`allowedBashPatterns`/`autonomy` (§1) stay global per agent, unchanged — this section adds a second, independent layer in front of them, not a replacement.

**The problem:** an agent with normal write access shouldn't necessarily get that same access to every workspace it happens to touch — a user's personal workspace being the clearest case, but the same applies to any workspace someone wants to protect. Per-agent-per-workspace configuration doesn't scale in a multi-agent org (every agent × every workspace), so this is deliberately **workspace-wide, not agent-specific**: if a workspace has an access policy set, it applies to *whichever* agent is working there, full stop — not "which agents can write here," just "can anyone write here at all."

**Where it lives:** a real `hq`-owned record, not a file in the workspace — ruled out explicitly: this is a remote system, so a user can't see or hand-edit a file in a workspace anyway, and a schema-less config file is more error-prone than a validated form regardless of who or what writes it. Concretely: an `hq`-owned policy record (e.g. `WorkspaceAccessPolicy`) keyed by a **logical reference** to the `site`-owned `Workspace` it applies to (`siteId` + `workspaceId`, not a real foreign key — same already-accepted trade-off as `Workspace.ownerId → Project` in §1's Consequence). Minimal by design, matching exactly what's needed: presence of a policy record for a workspace blocks all agent read/write to it, regardless of agent; absence means no restriction beyond the agent's own normal permissions. Not designed to be more granular than that (e.g. block-writes-only) unless a real need for it shows up later.

**UI:** a form on the workspace's own page — which, per §4a, is necessarily rendered by `hq` (browsers can't reach `site` directly, no exceptions), so this fits the same pattern as everything else browser-facing rather than requiring anything new on that front. Ordinary Wasp CRUD on `hq`, same as `Project`/`Task`/everything else it already manages.

**Delivery to `site`:** rides inside the §2a capability, minted at dispatch time — not a separate live lookup. `site`'s `toolPermissions.ts` (or wherever tool-call mediation happens) checks the capability's embedded policy before checking the agent's own `allowedTools`/`allowedBashPatterns` — the workspace policy is checked first and can only restrict, never expand, what the agent's own permissions would otherwise allow. A local check at execution time either way; only *changing* the policy needs a round trip to `hq`, not enforcing it.

### 3. Site registry & routing

- HQ maintains an `ExecutionSite` registry per org: id, org, label, connection status, registered-at, and a machine credential (see §4).
- **Registration flow:** an HQ admin generates a one-time registration token; the operator supplies it to a new Execution Site's setup (env var or CLI); the Site calls a registration endpoint on HQ presenting that token; HQ issues the Site a persistent machine credential and records the new `ExecutionSite` row.
- **Placement:** when a project is created, the creation flow shows the org's registered Execution Sites and the user picks one explicitly. A user's personal home site works the same way but triggers lazily instead — the first project-less chat with no `homeSiteId` set yet (§1a) prompts the same site-picker, rather than being asked upfront at onboarding. No auto-placement logic exists in either case — most orgs will have exactly one registered site, making this a no-op choice (or an invisible auto-assignment, for the lazy case) until an org actually registers a second one.
- Because a project's Workspace physically lives on one specific Execution Site's disk, work for that project can only ever be routed to that site — the queue in §4 is a targeted dispatcher, not a general load balancer.

### 4. Remote container-control channel

- An Execution Site's machine credential from §3 (a bearer secret HQ stores and verifies — not the same asymmetric-key pattern as the user-token verification in §2, since only HQ itself needs to verify it) authenticates an **outbound** persistent WebSocket connection from Site to HQ. Site always dials HQ, never the reverse — this keeps working for a self-hosted Site behind NAT/a firewall with no public port opened, which matches the "self-host on any VPS" story. HQ needs a stable public endpoint, which it already has as the org's central service.
- **This channel does not use Wasp's built-in `auth`/session system on either side.** Wasp's `app.webSocket` hands the app the raw Socket.IO server instance; a custom `io.use()` middleware (or a dedicated namespace) on HQ verifies the Site's machine credential from the connection handshake, entirely independent of Wasp's human-login auth, which continues working unmodified for both apps' browser users. (Confirmed against Wasp's generator source — see `knowledge/notes/wasp/m2m-auth-and-websockets.md` in the `the org knowledge base` knowledge base.)
- HQ's work queue holds dispatch jobs (e.g. "run task X"), each tagged with the Execution Site that owns the target project's Workspace. When that site's connection is live, HQ pushes the job down the socket. **The dispatch payload carries the authorization capability from §2a alongside the job itself** — `site` doesn't separately ask `hq` whether the run is permitted; dispatching the job *is* the authorization event.
- Site acks, executes locally exactly as it does today (`AgentContainerManager` → local Docker `execFile`, Workspace mounted from its own disk), and streams status/results back over the same connection.
- HQ persists those updates into its Task/Session **index** — not the transcript itself, which stays on Site per §1.

#### 4a. Interactive traffic — chat/voice relay — added 2026-08-10

**Decision: relayed, not direct.** The browser never connects to an Execution Site directly for chat/voice — it always talks to `hq`, which forwards to `site` over the *same* outbound persistent connection §4 already established for dispatch/status. This is not a second channel; live chat, voice, and dispatch/status all ride the one connection `site` dials out with.

**Why relayed over direct:** a direct browser↔Site connection would need `site` to accept inbound traffic — breaking the NAT/firewall-friendly story that's §4's entire reason for existing, and only for the most-used feature. Relaying keeps `site` fully closed to inbound connections, no exceptions. The latency cost of the extra hop is accepted — `hq` and its org's `site`(s) are typically co-located (often the same machine for a single-site org), so the added hop is frequently negligible in practice; it only becomes a real cost once `hq` and a given `site` are on genuinely separate infrastructure.

**Reading transcript history uses the same relay, generalized — not a separate mechanism.** `hq` never stores transcript content (§1 already puts `TranscriptEntry` on `site`; `hq` holds only a lightweight index — exists, status, count). Loading a session's history is `hq` forwarding a query for `site`'s data over the same live connection, `site` answering from its own database, `hq` relaying the answer back — the general shape is **"`hq` can query into `site`'s live data over the existing connection,"** reusable for other on-demand reads later, not something chat-specific.

**Failure behavior, both axes — deliberately explicit, not degraded:**
- **`site` unreachable** (offline, disconnected, machine asleep): any request that needs `site`'s data — live chat or historical read — returns an explicit error. `hq` does not keep a durable copy of transcript content to fall back on; this is a deliberate choice, re-litigated and re-confirmed, not an oversight repeating the removed delta-sync system (§8) — that system existed for data-sovereignty reasons that no longer apply; this is a plain availability trade-off, accepted in exchange for not duplicating storage.
- **`hq` unreachable during an active session:** the live relay drops — the user visibly loses the live view — but nothing about the run itself is affected: `site` keeps executing and keeps writing its own transcript untouched, exactly as §6's "HQ down" bullet already promises for execution generally. Once `hq` reconnects, the browser reconnects and catches up by issuing the same read-query described above — recovery is an ordinary read, not a special "resume" code path. **No buffering, queueing, or outage-mode logic is needed on `site` for this to work** — it falls directly out of `site` already owning its transcript and `hq` already being able to query it live; there is nothing left to design here beyond what §1, this section, and §6 already establish.

#### 4b. Site calls hq — the MCP/runtime read+write path — added 2026-08-10

**The reverse direction from §4a, and simpler.** §4a needed a relay because the browser can't reach `site` directly — a real constraint. There's no equivalent constraint here: `site` already dials out to `hq` for the control channel, and `hq` already has a stable public endpoint. So when `site`'s own backend needs `hq`-owned data, it's an ordinary outbound HTTPS call from `site` to `hq`, authenticated with the same machine credential (§3) that authenticates the control-channel handshake — no relay, no WebSocket multiplexing.

**Scope — confirmed by reading `site/src/server/mcp/mcpServer.ts` directly, not assumed:** this is not a narrow, occasional mechanism. The MCP server (stays in `site`, §1) registers 30+ tools; the majority — `create_task`, `update_task`, `list_tasks`, `get_task_details`, `archive_task`, `add_comment`, `create_board`, `list_boards`, `create_product`, `delete_product`, `create_team`, `create_agent`, `update_org`, `list_agents`, `list_projects`, `get_org`, and more — read or write entities that now live on `hq`. This is the mechanism that makes most agent roles functional (a project-manager-role agent calls `create_task`/`update_task` as its normal, frequent operation), not an edge case. §2a's dispatch capability already carries most of the context needed for the task an agent was *just dispatched for* — this path covers everything else: on-demand MCP tool calls for data or mutations not already riding in that payload.

**Two different authorization shapes among these tools, not one:**
- **Project/task-scoped** (`create_task`, `update_task`, `list_tasks`, `get_task_details`, `archive_task`, `add_comment`, `create_board`, `list_boards`) — authorized via the §2a capability already minted for the current dispatch/session, scoped to that workspace/task.
- **Org-level, not scoped to any task at all** (`create_product`, `delete_product`, `create_team`, `create_agent`, `update_org`, `complete_org_setup`) — no dispatch capability to check, since there's no task these actions belong to. **Confirmed sufficient by existing design, not redesigned here:** agent-level permissioning for these already exists independent of this split and needs no new mechanism — not independently re-verified against code in this pass, taken as confirmed.

### 5. Deployable shape & dev layout

**Direction (settled 2026-08-11, matches §1):** the existing app keeps its codebase, git history and `main.wasp`/`schema.prisma` lineage, and **is renamed to `hq`**. A new, small Wasp app called `site` is built fresh, receiving only what §1's carve-out table lists.

- `hq/` is the renamed existing app — full schema, all UI, the control plane. Later pruned of the models §1 moves to `site`, but never rebuilt. `site/` becomes a new top-level Wasp app (own `main.wasp`, `schema.prisma`, `src/`) holding the execution layer. Both consume `@agenthix/core` and `@agenthix/ui` as packages, same pattern as today.
- **`site` has no Wasp `auth:` block at all.** §1 leaves it with no `User`/`Session`/`Auth` tables, so it cannot use Wasp's own auth. Its operator console authenticates against hq-issued tokens (§2) — real design work, not yet done.
- Local dev: one Postgres server, two logical databases. In production, since HQ and an Execution Site can be on separate machines, they naturally use separate instances.
- Each module owns its `docker-compose.local.yml`, pulled into the root file via `include`. **Done as part of the rename:** the root compose previously inlined `auth-*` and `hq-*` services for the pre-split world — that code moved out of this repository on 2026-08-09, and the old `hq-*` names would have collided with the renamed module's own services. Removed rather than left to clash.
- **Deployment naming still says "site" for hq, deliberately.** The deployment's services and routers, `SITE_DOMAIN`/`SITE_TAG`/`AGENT_SITE_PATH`, the `agenthix-site-*` image names, the database name, its volume and `SITE_ROOT` were all left unchanged by the rename: they carry local state or drive running installations, so renaming them is a coordinated redeploy rather than part of a behaviour-preserving rename. Follow-on work.

### 6. Error handling

- **HQ down:** the whole org is down — already accepted in ADR-0042. Already-issued tokens keep working locally on Sites until they expire (a bounded degradation window); new logins and new work dispatch queue up until HQ returns. Work already running on a Site continues uninterrupted, since `AgentContainerManager` needs no HQ connectivity mid-run — this depends on the §2a authorization capability having already been minted and verified locally at dispatch time, not on a live permission check during the run. **For an active chat/voice session specifically** (§4a): the live relay drops and the user loses the view, but the run itself is unaffected — the browser reconnects and catches up via an ordinary read once HQ returns, no special recovery logic involved.
- **One Execution Site down/disconnected:** only that site's projects are unreachable — a new, explicit consequence of allowing multiple sites per org (§3). HQ's queue holds that site's dispatch jobs until it reconnects; other sites are unaffected. **Any request for that site's data — live chat or historical transcript reads (§4a)** — returns an explicit error; HQ holds no durable copy to serve instead.
- **WebSocket drop (transient network blip):** Site reconnects with backoff using its stored machine credential; queued jobs resume. No data loss, since the queue lives in HQ's database, not in memory.

### 7. Testing

- `hq` and `site` each keep their own vitest unit/integration suites, following the existing per-app pattern in `site/AGENTS.md`.
- A new cross-app integration tier spins up both `hq` and `site` together to exercise the actual dispatch → execute → status-report round trip over the WebSocket, plus token issuance/verification — the one place a bug could hide *between* the two codebases where neither app's own suite would catch it.

### 8. Reconciling existing `HqConnection` / delta-sync code

Discovered during Plan 1 review: `site` already has a working Site↔HQ connection system — `core/src/protocol/connection.ts`, `site/src/server/hq/{hqConnection,deltaSync,connectionStatus}.ts`, the `HqConnection`/`SiteConfig`/`HqSyncTombstone` models in `schema.prisma`, and the `/settings/hq` UI. It was built for the *pre-ADR-0042* shape: Site's data was user-owned, HQ (now Agenthix Cloud) was the org knowledge base Because the two had different owners, HQ could only ever hold a derived, thin index of Site's data, never the real rows — data sovereignty required it. That's what the `hq_index.*` delta-sync messages, `HqSyncTombstone`, and the `hqId`/`hqAgentId` mirror-ID fields exist to reconcile.

Under ADR-0042, HQ and Site have the *same* owner. There is no sovereignty boundary left to preserve, so there is nothing to sync — HQ holds its slice of the real data directly (§1's table), not a mirrored copy. The delta-sync/index-push machinery solves a problem this shape no longer has.

**To be removed (was done in the original Plan 1, reverted along with the rest of its scaffold — see the Status line and Master Plan; this removal is orthogonal to the direction flip and still applies to whatever plan replaces Plan 1):**
- `hq_index.delta` / `hq_index.push` / `hq_index.delta_complete` / `hq_index.deletes_applied` message types and payloads (`core/src/protocol/connection.ts`)
- `deltaSync.ts`, `push.ts`, `observability.ts`, `HqSyncStatus.tsx` in full
- `HqSyncTombstone` model; `HqConnection.syncCursor` / `sessionSyncCursor` / `lastSyncedAt` / `lastPushAt`
- `hqId` on `Project` / `Board` / `Task`; `hqAgentId` on `Agent`

**NOT removed — correction to this section's earlier draft:** `UserSettings.hqConnectionId` / `hqUserId` / `hqLinked` were originally listed here for removal, but turned out to be load-bearing for `hqApi.ts` (see below), not part of the dead sync system. Left untouched by Plan 1. This is the correct, final state — don't re-list them for removal in a later plan without first resolving the reconciliation this section calls for.

**Salvage and adapt rather than rebuild from scratch — these stay exactly where they are, in `site`, per §1; only the target changes (retargeted from Cloud to the org's own new `hq`, not Cloud):**
- `HqConnectionManager`'s outbound-WebSocket-with-reconnect/backoff transport (`hqConnection.ts`) — already matches §4's "Site dials HQ outbound, works behind NAT" requirement; needs no relocation, just a retargeted URL
- The `{ version, type, siteId, payload }` message envelope in `core/src/protocol/connection.ts` (stays in `@agenthix/core`, shared by both apps) — extend with new message types for container-control dispatch (§4) and the §4a relay rather than standing up a second, parallel protocol
- `SiteConfig.siteId` as the stable per-installation identity §3's registry needs — already lives in `site`, where it belongs
- The nonce-based "Link HQ" `/sites/authorize` flow (`initiateHqConnect`/`redeemHqInvite`/etc., see §1's table) — structurally close to §3's one-time registration-token exchange; adapt rather than reinvent, stays in `site`'s codebase exactly where it is, calling out to `hq` instead of Cloud

**The `/settings/hq` UI's two presets stop meaning the same thing — no relocation needed, it's already in `site`.** `Local` (`localhost:4110`) is this spec's actual target — the org's own new `hq` — and becomes the real, working path. `Production` (`hq.agenthix.com`) targets Agenthix Cloud federation (a decision recorded outside this repository — out of scope, see Scope above); keep that UI slot in place but disabled/hidden, with a code comment marking it for future implementation when ADR-0043 is picked up. Do not delete the slot or the preset — just gate it off.

**`hqApi.ts` is a second existing identity mechanism, separate from the delta-sync system — and under this direction, its fate is clearer than it looked earlier.** `site/src/server/hq/hqApi.ts` (`hqConnectCallbackHandler`, `hqProvisionUserHandler`, `hqCreateSessionHandler`) plus `UserSettings.hqUserId`/`hqLinked`/`hqConnectionId` implement the *receiving* side of a link: accepting a callback, idempotently provisioning a local shadow `User`/`UserSettings` row, and minting a real Wasp `Session` for the caller. Per §1's resolution: once `auth/` — and with it `User`/`Session`/`Auth`/`AuthIdentity` — moves to `hq`, `site` has no local identity store left for `hqProvisionUserHandler`/`hqCreateSessionHandler` to provision into or mint a session against. **Those two are almost certainly dead code**, superseded by §2's stateless token verification.

**`hqConnectCallbackHandler` — resolved 2026-08-10, confirmed relevant, for one of two registration UX variants.** §3 describes registration as fully synchronous: an admin generates a token upfront, feeds it to a new site's setup, site presents it and gets a machine credential back in the same response — no async gap, no callback needed. But the *existing* nonce-based flow this section already flags for salvage (`initiateHqConnect` opens `/sites/authorize` for a human to approve **live, in their browser, on `hq`**) has a real async gap: site can't know synchronously when a human will click approve. `hqConnectCallbackHandler` is `hq`'s way of notifying `site` once that approval happens — adapted to deliver a machine credential (§3's shape) instead of the old Cloud-shaped provisioning payload. Both registration UX variants remain viable; which one Plan 3 actually builds is a UX decision, not resolved here — but the code-level question ("does this handler have any role left") is settled: yes, if the browser-approval variant is the one built.

## Consequences

### Positive
- HQ becomes a real, buildable single source of truth for org data, closing the gap ADR-0042 left open.
- An org can register more than one Execution Site from the start, rather than retrofitting multi-site support later.
- The machine-control channel works for self-hosters behind NAT, since Site always dials out.
- Wasp's built-in human auth is untouched on both apps; the machine-to-machine path is fully separate, custom code — no fighting the framework.

### Negative
- Two Wasp apps to scaffold, deploy, and operate instead of one — real setup and ongoing-maintenance cost.
- Cross-app references (`Workspace.ownerId` → a Project that lives in a different database) lose database-level referential integrity; consistency becomes an application-level concern.
- A disconnected Execution Site takes its own projects down, a new failure mode multi-site support introduces (previously, a single Site's downtime was the whole story).

### Risks
- Token TTL is a real security/availability trade-off (§2) not fully resolved here — needs a follow-on decision before this ships.
- The registration flow (§3) is a new attack surface (whoever holds a valid one-time registration token can register a machine into the org) — needs the same scrutiny as any credential-issuance flow.
- **Site decommissioning has no defined path (added 2026-08-10).** §3 designs *registering* an `ExecutionSite`; it says nothing about removing one. Once a `User`'s or `Project`'s data lives on a specific site (§1a), decommissioning that site with no migration process means its `Workspace`/`RepoAttachment`/transcript data is simply lost. Explicitly deferred — not designed in this spec, migrating a user's or project's data between sites is a "nice to have" for now — but flagged as a real gap to monitor, not a hypothetical: the risk grows as soon as an org has more than one site and any admin ever needs to retire one.

## Notes for follow-on work

- **Downstream roadmap review still pending**, per ADR-0042's Future Considerations and Phase 9's own text: Phases 14 (Social/OAuth), 15 (HQ multi-user), 16 (Notifications), 20 (HQ Managed Prep), 21 (Launch Prep), and 22 (Combined Launch) still assume today's separate `hq/` app in places and haven't been reviewed against this split yet. Not blocking for this spec, but flagged again here since implementation is about to start.
- **Minor cross-reference inconsistency spotted while researching this spec:** ADR-0036's References section says it's "implemented (core) by Phase 9 — Context-Centric Security Foundation," but the current `roadmap.md` numbers that phase as **Phase 10** (Phase 9 was renumbered to the OSS/Cloud Split when it was inserted). Not fixed as part of this spec — worth a small correction pass on the roadmap and ADR cross-references held outside this repository.
- **Explicitly deferred, not designed here:** the HQ-side policy engine's actual rule model, JWT TTL/refresh mechanics, and the data-migration path for existing installations' rows.
- **User-to-user privacy is undesigned — added 2026-08-11.** §2a and §2b both govern *agent*-to-workspace access. Nothing anywhere states whether an org admin may read another user's chat session or transcript. This matters more under this design than it would otherwise: §4a routes and renders all chat through `hq`, and §1 leaves `site` with no identity store, so `hq` is the only place such a rule could be enforced. Belongs with §2's identity work.
- **`site`'s operator console is undesigned — added 2026-08-11.** §1 leaves `site` with a small browser surface (install diagnostics, site config, the HQ link) but no way to authenticate anyone, since its `User`/`Session`/`Auth` tables are gone. It needs to verify hq-issued tokens (§2) for its own UI. Small, but currently in no plan.
- **Heartbeat scheduling — flagged unresolved, not designed here (2026-08-10).** `agents/AgentHeartbeat.ts`/`HeartbeatManager.ts` (stay in `site`, §1) currently run their own per-agent timers directly off `Agent.heartbeatEnabled`/`heartbeatInterval` (`hq`-owned fields) and directly query `UserSettings` (also `hq`-owned) to resolve an admin user for each routing session — both break once the databases actually split. Diagnosed during this pass, not resolved: the likely direction is moving the scheduling decision to `hq` (it already owns the config) and having `hq` trigger a pulse over the existing dispatch channel (§4) rather than `site` running independent timers — `HeartbeatManager.ts` already has a comment anticipating something like this ("future HQ webhook"). The routing session's own work once triggered likely needs no new mechanism, reusing `fetch_my_queued_tasks`/`run_task` (§4b). Distinct from this: `site/src/agents/workspaceService.ts`'s per-agent scratch directory (`<site_root>/agents/<handle>`) is unrelated to the DB `Workspace` model, purely `site`-local, and needs no change from the split at all — each site keeps its own independently. Left open pending further thought, not designed further here.

## References
- the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository — Monorepo Split: HQ as Org Source of Truth, Site as Execution Layer.
- [ADR-0038](../../docs/adr/adr-0038-workspace-as-storage-entity.md) — Workspace as the Storage Entity.
- [ADR-0036](../../docs/adr/adr-0036-context-centric-security.md) — Context-Centric Security.
- `site/src/agents/runtime/AgentContainerManager.ts` — today's local-Docker container lifecycle, unchanged in shape by this split.
- a note on Wasp's custom API and websocket auth, held in the maintainers' research notes, outside this repository — Wasp's custom API/WebSocket auth capabilities, researched for §4.
