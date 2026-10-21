---
name: HQ / Site Split — Design
created: 2026-08-14
description: Design spec for HQ / Site Split — Design. Front-matter added during the docs/ migration; body unchanged.
---


# HQ / Site Split — Design

**Status:** *Living* is not a spec state, and a spec carries none — its unit answers whether
the work is open. This line predates that rule; the sentence it introduced is kept.

The single current design of the hq/site split, until the split completes and what describes
the running system graduates into `docs/architecture/`.

**Consolidates** `2026-08-09-hq-site-module-split` and `2026-08-12-plan5-execution-runtime`.
Both are kept as historical records; this document gathers what is current in each and
nothing here contradicts them silently — where a decision reversed, the reversal is stated.

> This originally read *Supersedes*. **A spec is never superseded** under the current model:
> supersession belongs to decision records, and a later design belongs to a later unit of work
> rather than replacing an earlier one. Both named specs sit in their own closed units, and
> wherever a decision genuinely reversed, that reversal belongs in an ADR.
**Work tracking:** which parts of this design are built, which plan owns what, and every
change of direction live in the implementation plan of the unit `2026-08-14-hq-site-split` —
not here. This document describes the system.
**Related:** the ownership decision recorded outside this repository — HQ as org source of truth, Site as
execution layer; this repo's ADR-0036, 0038, 0039, 0040, 0041, 0044, 0045, 0047, 0048,
0049, 0050 (see the decision-record map at the end).

---

## 1. Goal

Split what was one Wasp app into two independently deployable Wasp apps:

- **`hq`** — the org's single source of truth (ADR-0042): identity, projects, tasks,
  agents, teams, products, billing, policies, queues — and the entire user-facing UI.
  One per org, self-hostable.
- **`site`** — an Execution Site: the execution layer only. Runs agent containers, holds
  workspace storage, transcripts and runtime state. No independent identity store. An org
  can register several, and hq and a site can run on separate machines.

Built for a genuine multi-machine topology from the start. "HQ" always means the org's own
instance — the old centrally-hosted service relocated out of this repository and is a
different product (a centrally-hosted cross-org service).

**Out of scope:** cross-org federation (ADR-0043, draft); HQ failover; migrating data from
the existing live deployments (clean-slate); auto-placement across sites; full multi-user
RBAC (Phase 15 — this design depends on membership and `UserSettings.role` only); the
policy engine's rule model beyond "route to the site owning the target workspace".

## 2. Principles

These recur throughout and are the tie-breakers when a detail is unspecified:

1. **One owner, no sync.** hq and its sites share an owner, so hq holds its slice of the
   real data directly — never a mirrored copy needing reconciliation. The pre-split
   delta-sync machinery was removed for this reason and must not be rebuilt. Where data
   does exist on both sides (the session copy, §10), **exactly one side writes each
   field** — one direction per field needs no cursors, tombstones or reconciliation.
2. **A site never accepts inbound connections. No exceptions.** A site dials out to hq
   for everything; hq reaching a site means sending a frame down the socket the site
   dialled. This is what makes self-hosting behind NAT work, and it has already cost a
   feature (the browser-approval registration flow was deleted as incompatible).
3. **Structural boundaries over behavioural ones.** A boundary enforced by which
   directory was mounted, which container exists, or which tool was never registered
   cannot be argued with by a model, is immune to prompt injection, and fails closed. A
   boundary enforced by instructing the model is a judgement call on every action with
   silent failures. Where both are available, build the structural one.
4. **Restriction composes by intersection, never precedence.** A layer that could
   override another could widen what that layer refused; intersection can only narrow.
5. **Fail explicit, not degraded.** A site being unreachable is an error the user sees,
   not silently stale data served from a copy hq deliberately does not keep.

## 3. Responsibility split

`site`'s original codebase was renamed to `hq`, keeping its git history, schema and all
UI. The new `site` module is built fresh and receives **only the execution layer** —
everything else stays in `hq` unchanged. Verified by a file-level audit: 88 files /
~8,000 lines move; of the 192 files staying, only six touch the execution layer, all via
types or one pure utility.

What moves to `site`:

| Area | Representative code |
|---|---|
| Agent runtime | `agents/runtime/*` — container manager, engine, spawner, SDK/native runtimes, tool permissions/registry, manifest parsing |
| Session drivers | `ChatRunner`, `TaskRunner`, heartbeat manager, prompt builder, kernel bootstrap, git access, active-skills service |
| Sessions & transcripts | backend only — `AgentSession`, `AgentRun`, `TranscriptEntry`, `ToolCallLog` (§10); the UI stays in hq |
| Workspace storage | `storage/*`, `preview/*`, `operations/*` — real bytes on one machine's disk (ADR-0038) |
| Machine-scoped services | MCP server, voice, git, repo-scoped GitHub code, container labels, dashboard snapshot |
| Site config & the HQ link | `SiteConfig`, `HqConnection` (site's copy), the outbound transport |

Three boundary rulings worth restating because the code invites the opposite reading:

- **All browser-facing UI belongs to hq.** `site` has no `User`/`Session`/`Auth` tables
  and no Wasp `auth:` block, so it cannot authenticate a browser user at all. Chat and
  session UI are hq's even though the drivers and transcripts are site's. `site`'s only
  browser surface is a local operator console (authentication for it: undesigned, §13).
- **`agents/workspaceService.ts` is mixed and must be split at extraction time** — 35
  importers; the asset/org/product paths stay on hq, the agent-workspace paths move.
- **Cross-database references are logical, not enforced.** Once `Project` (hq) and
  `Workspace` (site) live in different databases, references between them are hq-issued
  ids the other side trusts but cannot validate. An accepted integrity trade-off;
  application-level consistency checks are the mitigation.

## 4. Where things live — the site anchors

> **An agent must be on the site holding every location the run works in.**

One rule, no special cases:

| Anchor | State |
|---|---|
| `Agent.homeSiteId` | required (ADR-0047). An agent has real disk state — its workspace, `.private/` materials, skills — **written by the agent itself**. A copy with a downstream writer is a second master needing reconciliation (§2.1 forbids it), so an agent lives on exactly one site. Dispatch refuses, with an explained error, when a project's site is not the agent's — enforced when adding an agent to a project and when assigning it a task. |
| `Project.executionSiteId` | required. A project's storage is bytes on one machine, picked explicitly at creation. |
| `Workspace.siteId` | required, on every workspace. Inheritance from the owner is dropped: a project workspace's site must equal its project's; a user workspace's is wherever it was created. |
| `UserSettings.homeSiteId` | **does not exist** (reversed). A person is a participant, not an object with a home: their files home exists on *every* site they work on, created lazily. `Site1/users/<id>/files` and `Site2/users/<id>/files` are separate drawers, not replicas — nothing synchronises, so nothing reconciles. The interface must show which site a location is on. |

## 5. Identity and trust

### 5.1 Three credentials, deliberately distinct

| Credential | Held by | Proves | Lifetime |
|---|---|---|---|
| Identity token | a person's client | who the user is (`role`, `orgId`) | 60 min (ADR-0040) |
| Capability | a run (indirectly — §5.3) | what this specific run may do | 15 min, renewed at 80% (ADR-0040) |
| Machine credential | a site's server process | that the machine is a registered site | persistent, revocable |

hq signs the first two as RS256 JWTs and publishes a JWKS; a site verifies locally with no
network round trip. The trade-off is revocation lag bounded by the TTL — accepted. The
machine credential is a bearer secret only hq verifies (stored hashed, shown once at
registration). Both JWT types carry an audience naming their target site, so a token
minted for one site is refused by a sibling.

**Resolved 2026-08-16 (plan 5d-2):** the interim above is gone. Dispatch is genuinely
remote now — every agent run reaches its container through site's own MCP and
git-credential endpoints, both of which call `verifyHqToken`, which always pins the
audience. There is no longer a code path where a capability is verified without checking
`siteId`; the audience pin exists by construction, not by an interim branch someone has
to remember to delete. hq's MCP endpoint dropped the capability-verification branch
entirely at the same cutover (the static-key/admin branch it kept is a separate concern,
unrelated to run capabilities).

### 5.2 The capability

Minted by hq at the moment work starts — dispatch of a task, start of a chat or voice
session, a heartbeat tick — never looked up during execution. It carries everything the
run's authorization needs, pre-resolved:

`userId`, `agentId`, `sessionId`, `projectId` (null = personal chat), `workspaceId`
(null = the invoker's files home), `taskId` (null = open-ended chat), **`role`** (the
invoking person's org role for chat mints; **null for task and heartbeat mints — the
absence is the unattended rule**, §6.2), `siteId`, the resolved effective permissions
(`unrestricted`, `allowedTools`, `allowedBashPatterns`, `neverTools` — §6.4's
intersection, computed at mint), and the workspace-blocking flags (§6.5).

**Renewal** re-resolves from live rows at 80% of TTL over the already-open connection, so
role changes, policy changes and permission edits reach an already-running session within
one TTL. **Renewal failure is soft:** the run honours its existing capability until
expiry rather than dying on transient hq unavailability — so a demotion propagates within
one TTL *plus* the renewal-failure window. Accepted deliberately. An outage outlasting
the TTL stalls long runs; that is the same "hq down" mode as §11, not a new one.

### 5.3 The run token — what the container actually holds

The agent container never holds the capability JWT, and never the site's static MCP key.
It holds an **opaque, run-scoped token** that the server resolves to the run's *live*
capability — the renewal loop refreshes the underlying JWT in place, so long runs never
carry a stale bearer and the least-trusted process in the system never holds a real
credential at all. The token is revoked when the run ends. The git credential helper uses
the same token for the same reason. The static MCP key survives solely as an admin-held
credential for external operator clients; static-key callers act with admin-equivalent
authority and the key is never placed in containers.

### 5.4 Registration

An hq admin generates a one-time registration token; the operator supplies it to a new
site (environment variables at boot, or pasted into the status page); the site calls hq's
registration endpoint and receives its machine credential and the channel URL. Token-
upfront was chosen over browser-approval because approval-then-delivery requires hq to
call inbound into a site (ADR-0044). Entropy is the endpoint's defence — no rate limiting,
an accepted judgement recorded in that ADR.

## 6. Authorization — what a run may do

Mounts bound what a run can physically reach (§8); this bounds what it may do with the
org data it reaches.

### 6.1 The audit that shaped it

Of an agent's ~45 tools, most are already bounded — by the container's mount set, the
capability's own scope, or by touching nothing org-related. The residue: **ten
org-escaping mutations** (`update_org`, `create_team`, `complete_org_setup`,
`create_product`, `update_product`, `delete_product`, `create_project`, `create_agent`,
`apply_agent_preset`, `propose_workforce_template`) — the only tools through which an
agent can act on the organisation itself — plus three project-scoped administrative tools
(`create_board`, `archive_task`, `delete_task`) that needed project confinement.

### 6.2 The decision: an agent never holds authority of its own

- **Chat** — the run acts with the *invoking person's* permission: every tool the agent
  is granted, capped by that person's role. hq applies the same check it would apply to
  that person's browser request.
- **Task and scheduled runs** — confined to the project's own scope, bounded by the
  capability's `projectId`. The ten org-escaping tools are unavailable: there is no
  person to act for, and a project holds no org authority to lend. If unattended
  org-level mutation is ever genuinely needed, it arrives as a named exception.
- `Agent.allowedTools` keeps its existing meaning as a **ceiling** — what the agent may
  attempt; the principal's permission decides whether the attempt is permitted.

No invocation gating (chatting with an agent grants nothing beyond your own role), and no
new permission schema on `Team`, `Project` or `Agent`.

**Role floors, as built:** `create_project`, `create_product`, `update_product` require
OPERATOR; the other seven org-escaping tools require ADMIN; `archive_task`/`delete_task`
from chat require OPERATOR and from a task mint require a `projectId` match. A null role
is refused by every gate. One shared table (`rolePolicy.ts`) drives both the MCP gates
and the browser actions — the browser side has not yet reached full parity (QI-001 in
`docs/qa/qa-issues.md`).

### 6.3 Rejected authority models

Recorded so they are not re-proposed. **Team authority** (agents inherit a team's
permission level): every cost answerable, but together they are a second permission
system — privilege-granting team membership, five schema changes, a three-state
invocation rule, and the owning team blind to its agent's other sessions. **Project as
principal** (projects carry a permission level for unattended work): killed by one fact —
any user could create a project, so a project carrying org permission is a freely
mintable authority holder. The 10-vs-3 split above is what made dropping it cheap:
project-scoped administration stays available unattended, so no real automation was lost.

### 6.4 Where a tool grant is defined — one list, one intersection

```
effective = agent ∩ principal ∩ workspace₁ ∩ workspace₂ ∩ … ∩ site
```

- **One vocabulary.** Every boundary states an allowed-tools list of exactly the shape
  `Agent.allowedTools` already has. A workspace gets no permission model of its own — a
  read-only/read-write mode field was proposed and rejected as a second vocabulary to
  keep coherent with the first.
- **Intersection, not precedence** (§2.4). The agent's list remains a real cap — a
  research agent granted only read tools stays read-only in the most permissive
  workspace. `neverTools` is the hard deny surviving every layer, derived *after* the
  intersection so a workspace cap binds even `unrestricted` agents on the MCP side.
- **A workspace's list caps the whole session while it is mounted** — not only tools
  touching its own files. This is what makes the list a *data* protection, not only an
  integrity one: a sensitive workspace that omits the web tools means its contents cannot
  be sent out while mounted. Accepted consequence: one restrictive mount narrows the
  entire session; the UI must surface *why* a tool went dark or strictest-wins reads as
  a fault.
- **An unconfigured workspace contributes nothing** (`null` = no cap; `[]` = explicitly
  no tools). Restriction is a deliberate act — the alternative would drag every session
  touching an unconfigured workspace to read-only, including the default files
  workspaces whose entire purpose is being somewhere the agent can always write.
- **The site layer is a placeholder** for machine-level bounds (egress, resource
  limits) — flagged by ADR-0049, not yet designed.

**Enforcement is structural, twice over:** the intersection is computed at mint (the
capability's `permissions` carries the effective set); tools outside it are never
registered on the MCP server or runtime; and whenever the write tools fall out of the
set, workspace mounts additionally go in read-only so the kernel enforces what the
registry refuses. *Known gap until the runtime moves: for `autonomy: 'unrestricted'`
agents the intersection binds MCP tools but not the runtime built-ins — the runtime
deliberately grants those agents every built-in and skips per-call gates. A naive fix
(pruning built-ins via `neverTools`) regressed kernel onboarding and is not attempted;
the gap closes structurally with read-only mounts.*

### 6.5 Workspace access policy — the blocking layer

Independent of, and checked before, everything above: a `WorkspaceAccessPolicy` record on
a workspace blocks **all** agent access to it, for every agent, not bypassed by
`unrestricted`. Deliberately workspace-wide and binary — "can anyone work here at all",
not per-agent grants. It rides in the capability (`workspaceBlocked` for the primary
location — the run must not start; `blockedWorkspaceIds` across the mountable set —
those are never mounted and never contribute to the intersection). hq-owned record,
ordinary CRUD on the workspace's page.

## 7. Transport — three paths, each the simplest that works

### 7.1 The control channel (site → hq WebSocket)

A registered site opens one persistent outbound WebSocket to hq (`/hq-link`),
authenticated by its machine credential in the handshake — fully independent of Wasp's
own auth on both sides. The `{version, type, siteId, payload}` envelope carries
request/response correlation ids so either side can ask the other a question over the
same socket; protocol version is enforced at connect. hq tracks `ONLINE`/`OFFLINE` and
`lastSeenAt`. Dispatch rides this channel: `run.dispatch` is a `channel.request` that
acks acceptance (a created `runId`), never completion, **with the §5.2 capability
alongside it** (dispatching *is* the authorization event) — the run's actual outcome
returns later as a `run.status` event (§10.1, ADR-0050).

**"hq's work queue holds jobs" (as built, plan 5d-2):** the queue is the `Task` table
itself, not a separate in-memory or database job record — a task's `executionState`
(`QUEUED`/`IN_FLIGHT`/`RUNNING`/`DONE`/`FAILED`/`BLOCKED`) *is* the job state, tagged
by the owning site through the project it belongs to. This was already true before
5d-2; no separate job-queue library sits behind it (heartbeat scheduling, for instance,
is a plain in-process timer on hq that calls the same dispatch path a task claim does).
What 5d-2 changed is what happens when a dispatch fails: a site-unreachable `run.dispatch` returns its task to `QUEUED` with a
held-for-reconnect reason instead of retrying the socket or holding anything in memory;
the site's next reconnect drains every task carrying that reason through the ordinary
claim path (ADR-0050). Reconnect is backoff-with-stored-credential; queued jobs live in
hq's database, not memory.

### 7.2 The data path (site → hq HTTPS)

When site-side code needs hq-owned data mid-run — most of the MCP tool surface: task
lifecycle, boards, comments, org reads, the org-escaping mutations — it makes an ordinary
outbound HTTPS call to hq, authenticated by the machine credential, authorized by the
run's capability claims. No relay, no socket multiplexing: site reaching hq has no NAT
problem. Roughly 30 of the 37 MCP tools cross this path; the genuinely site-local
remainder (`ping`, `get_site_info`, `attach_file`, `start_preview`, the execution half of
`run_task`) never leaves the machine. Authorization decisions execute on hq from verified
claims — a site asserts nothing about identity or role.

### 7.3 The interactive relay (browser → hq → site)

The browser and mobile client never connect to a site — they talk to hq, which forwards
chat and voice over the socket the site already dialled. Reading transcript history is
the same mechanism generalized — hq querying into site's live data over the existing
connection — not a separate system, and reusable for other on-demand reads. The latency
of the extra hop is accepted; hq and its sites are typically co-located.

**Failure, both axes, deliberately explicit:** site unreachable → any request needing its
data errors visibly; hq keeps no durable transcript copy to fall back on. hq unreachable
mid-session → the live view drops, the run continues unaffected (its authorization was
minted up front, §5.2), and reconnection is an ordinary read — no buffering, queueing or
resume logic anywhere.

How new live data joins this path is settled by ADR-0051: a new typed event and handler,
never a generic relay.

## 8. Storage and context boundaries — what a run can reach

An agent executes in a container whose bind mounts are the entire extent of its
persistent file access. The runtime applies no path gating (`bypassPermissions`), and the
working directory is reachable-from-anywhere — **the mount set is the boundary and the
kernel enforces it**; the cwd only decides where relative paths resolve. (The container's
ephemeral layer and `/tmp` are writable but discarded on recreate.)

### 8.1 Inventory

Host paths key on immutable ids (a rename never moves a directory); container paths use
slugs. Host root `AGENT_SITE_PATH` — the host side of *every* bind mount, required under
container isolation; container root `/site` today, remapped per E1 below.

| Store | Lives on | Host path | Container path |
|---|---|---|---|
| Agent workspace — every run, never the cwd; holds `.private/` (profile, responsibilities, heartbeat, own skills), `.artefacts/` | agent's site | `…/agents/<handle>/workspace` | **`/workspace`** (after remap) |
| Claude Code state — credentials + session state | agent's site | `…/agents/<handle>/home/.claude` | `/home/appuser/.claude` |
| Agent's memory of a person (§8.2) | agent's site | `…/agents/<handle>/users/<userId>` | **`/memory`** — no identifier; only the invoker's is ever mounted |
| Platform assets · org shared files | agent's site | `…/assets`, `…/shared` | `/assets:ro`, `/shared:ro` |
| Project files (default location) | project's site | `…/projects/<id>/files` | `/projects/<slug>/files` |
| Project knowledge (§8.3) | project's site | `…/projects/<id>/knowledge` | `/projects/<slug>/knowledge` |
| Project workspace | its own site | `…/projects/<id>/workspaces/<wsId>` | `/projects/<slug>/workspaces/<ws-slug>` |
| Task working directory — the cwd of a task run | project's site | `…/projects/<id>/tasks/<taskId>` | `/projects/<slug>/tasks/<TASK-KEY>` |
| User files (default location; default cwd) | **every** site, lazily | `…/users/<userId>/files` | `/users/personal/files` |
| User workspace | its own site | `…/users/<userId>/workspaces/<wsId>` | `/users/personal/workspaces/<ws-slug>` |
| Skills — merged server-side from four scopes (platform → org → project → agent), copied into the workspace; never bind-mounted | catalogue on hq, copies per site | scope dirs | `<workspace>/.tmp/skills-*/.claude/skills` |

**Default workspaces** — `projects/<id>/files`, `projects/<id>/knowledge`,
`users/<id>/files` — exist so every run always has somewhere to put a file, without
anyone creating a workspace and without the agent inventing a location; each is owned by
a project or person (an access boundary that already exists) and lives on the agent's
machine (never an unreachable cwd).

### 8.2 Memory of a person is a mount, not a convention

The pre-split mechanism was an instruction to file notes under
`.private/memory/users/{userId}/` — a naming convention the model was asked to honour,
with every person's notes readable in every run. Replaced structurally:
`agents/<handle>/users/<userId>` is bind-mounted at `/memory` **only when that person
invokes the agent**. Another person's run cannot name a path outside its own partition
even in principle; autonomous and scheduled runs mount no partition at all, so a
scheduled job cannot be steered into anyone's private context (ADR-0048). This depends
on per-session containers (§9.2). ADR-0036's write-time classification is superseded —
nothing left in the model requires judging what is safe to write where.

### 8.3 Two things that are not memory

**Project knowledge** — stack, conventions, decisions — belongs to the project at
`projects/<id>/knowledge`: every agent on the project benefits, and the read boundary is
project access, already enforced by mounts. The only shared memory in the model. Its
directory convention (so people can navigate it) is out of scope here. **Reusable
know-how is a skill** — scoped, versioned, catalogued; self-improvement biases toward
revising an existing skill over adding one per lesson.

### 8.4 Sessions and locations

A session works in locations that are **chosen, not inferred**: none chosen → the
invoker's files home on the agent's site; otherwise any of that person's locations on
that site, or a project location they may reach. Several may be mounted at once — one is
the working directory, the rest sit alongside. The session record carries the several
locations (the mount layer already supports the list).

### 8.5 What each run type mounts

| Store | Project task | Chat (no project) | Chat (project) | Heartbeat |
|---|---|---|---|---|
| Agent workspace + skills | yes | yes | yes | yes |
| Memory of a person | **no** | yes | yes | **no** |
| Project knowledge / workspace / files | yes | no | yes | yes |
| Sites that must agree | agent = project | — | agent = project | agent = project |

## 9. Runtime and container operations

### 9.1 The workspace path remap (E1)

The agent workspace is the only mount exposing the site's internal layout
(`/site/agents/<handle>/workspace`); after the split hq cannot know a site's root, so the
path stops being derivable where the mount is described. Remap to `/workspace` —
coordinated with the prompt text that references it and the merged-skills directory
beneath it. Same root cause: `ownerSlug` hardcodes `personal` for every user, so every
files home presents as `/users/personal/files`; harmless single-user, wrong after.

### 9.2 A container belongs to a session (ADR-0049)

Containers are keyed by **session**, not agent — the session already carries exactly the
tuple determining a mount set (agent + optional invoker + locations) and has a lifecycle
to hang the container's on. This is the precondition for §8.2's partition, and a
performance fix: a session's mount set is stable for its life, so the recreate-per-
exchange churn of two people alternating with one agent stops. Costs measured: idle
container ~2.4 MiB, executing floor ~207 MiB, image shared via overlay — count is cheap,
concurrency is the constraint. **Idle teardown is mandatory, not an optimisation**
(per-container shim ~10–20 MiB outside the cgroup; create 155 ms, remove 99 ms — stop on
idle, recreate on resume). "Idle" means no activity, not no session.

Naming: `<site>-agent-<handle>-<sessionId>` — one shape always; neither project nor
person appears (a session may hold several workspaces; an unattended run has no
invoker). Context — invoker, task, locations — goes in labels, searchable with
`docker ps --filter`, absent or plural without breaking the scheme. A boundary violation
becomes *a container that should not exist* — observable from outside the system.

### 9.3 Resource limits (E3)

Agent containers currently run with no memory, CPU or pid limits on the host that also
runs the databases. `--memory` and `--pids-limit` land with the runtime move, more
pressing as container count grows under 9.2.

### 9.4 The seeded runtime credential (E4)

One Claude credential is seeded into each agent's `home/.claude` on first start — while
the provider rotates refresh tokens on use, so a credential that is never re-seeded
after that first start goes dead for every agent created afterward.

**As built (plan 5d-2):** seeding is freshest-wins, compared both ways, on site.
`expiresAt` is read from both the shared seed file (`secrets/.claude/.credentials.json`)
and each agent's own copy at container start; whichever is fresher wins and is copied to
the other (an absent or unparsable `expiresAt` is treated as maximally stale, never as
"skip this check"). `writeBackAgentCredentials` runs the same comparison in reverse on
container stop, idle sweep and explicit stop — a rotated token a long-running chat
picked up becomes the seed the *next* agent starts from, instead of staying trapped in
one agent's container. A dead grant (missing file, or `expiresAt` in the past) fails the
run fast with a remediation message and sends one `site.credentialHealth` event per
(agent handle, state) per hour; hq turns that into an admin notification, deduped per
(site, agent, state) per day. Both file operations tolerate a missing file silently
(dev without OAuth configured at all).

**Deferred, not designed:** an API-key runtime credential for larger installs (the
seeded-OAuth mechanism above assumes a single-org install); a persistent stamp on the
`ExecutionSite` row and a settings-page badge surfacing "credential attention needed"
next to a site — cut at 5d-2 for needing a schema field it did not scope (tracked in
the living plan's unassigned work).

## 10. Data ownership across the split

`Workspace` and `RepoAttachment` moved to site's database (they reference only each
other, §10 as originally designed). `AgentSession`, `AgentRun`, `TranscriptEntry`,
`ToolCallLog` moved together (plan 5d-2, absorbing what would have been plan 5e — see
the living plan's decision D1), keeping their delete cascades intact — the alternative
(session on hq) would have severed the cascades and silently orphaned bulk transcript
data on site forever.

**hq keeps a full copy of the `AgentSession` row** — the whole row, not a chosen subset —
because chat privacy (ADR-0041: owner-only, every role) keys on `userId` and site has no
`User` table. The copy is safe under §2.1's rule:

| hq writes (once, at creation) | site writes (the runtime, flowing back over the status stream) |
|---|---|
| `id`, `sessionKey`, `createdAt`, `userId`, `agentId`, `sessionType`, `taskId`, the location set | `title`, `status`, `model`, `metadata`, token counters, `updatedAt`, `expiresAt` |

If both sides ever write one field, this has become the deleted delta-sync system.

**As built, the write-back mechanism is `sessionPatch` (ADR-0050).** hq creates or
upserts its copy first, at dispatch time, and sends the creation fields down as a
`SessionSeed` in the dispatch payload; site upserts its authoritative row from that seed,
idempotently, keyed by `id`. The site-written fields above never travel as a separate
message — they ride the terminal `run.status` event as `sessionPatch`, and hq applies
them to the copy through an explicit six-field pick rather than a raw object update, so
a field this table does not name structurally cannot reach the copy no matter what a
site sends.

Two settled consequences, both confirmed as built: deleting a session is a two-database
operation whose half-completion is detected — a dangling-copy reconciler flags an hq
session copy whose site row is gone, distinguishing "not found" from "site
unreachable" — rather than assumed; and deleting a `User` or `Agent` stopped being
database-blocked once `AgentRun`/`TranscriptEntry`/`ToolCallLog` left hq's database
(their tables were dropped after a row-count-verified copy). Dangling scalar references
on the session copy are the accepted trade (small, cheap to detect), the same one every
cross-database reference already makes.

## 11. Error handling

- **hq down:** the whole org is down (accepted in ADR-0042) — but bounded: issued tokens
  keep working until expiry, running work continues (authorization was minted up front),
  live chat views drop and recover by ordinary reads, new work queues.
- **One site down:** only its projects are unreachable; its dispatch jobs hold in hq's
  queue; every read of its data errors explicitly (§7.3); other sites unaffected.
- **Socket drop:** reconnect with backoff on the stored credential; jobs resume from the
  database-backed queue.

## 12. Testing

Each app keeps its own unit/integration suites. A **cross-app integration tier** — hq and
site actually running together, exercising registration, a dispatch → execute → status
round trip, capability issuance and a relayed exchange — is required before the split is
done (landed — `tests/cross-app/`, one command: `npm run test:cross-app`): it is the only place a bug *between* the codebases can be caught, and the split's
history has repeatedly shown mocked suites agreeing with each other and being wrong
(mocked Prisma enforces no foreign keys; the registration flow once failed on every real
attempt while 871 unit tests passed).

## 13. Open problems and undesigned areas

Design gaps, distinct from unscheduled *work* (the plan document tracks that):

- **Agent-authored skills have no inactive state** — live the moment the file is
  written, shared across every invoker by design. Memory can be partitioned by mount;
  skills cannot (being shared is their purpose) — the one remaining writable channel
  between people through a shared agent. A human-gated staging directory was considered
  and not adopted; nothing prunes the active set either.
- **Project knowledge is a shared writable surface** — one agent writes what another
  reads. Intended, but the same question as skills in another form.
- **Unattended runs have no human to defer to** — an agent whose autonomy requires
  approval has nobody to approve on a scheduled run.
- **The operator console's authentication** — site's own UI must verify hq-issued
  tokens; undesigned.
- **Site decommissioning and cross-site migration** — no designed path; data on a
  retired site is simply lost today.
- **The site permission layer** (§6.4's placeholder) — egress and machine bounds.
- **Who owns a site's label** — the admin naming it at registration or the operator's
  `SiteConfig.name`; `site.identity_update` is accepted and ignored pending the call.
- **Task attribution** — `Task` never records who requested the work; under §6.2 the
  fabricated arbitrary-admin fallback is never consulted for *authority*, but the
  session-ownership consequences remain.

## Decision record map

| Record | Relationship to this design |
|---|---|
| ADR-0036 | §1 amended (person-data lives in the invoker partition), §4 superseded by ADR-0049, §5 superseded (no write-time classification — §8.2) |
| ADR-0038 | Foundation — workspace as the storage entity |
| ADR-0039 | Amended — files homes and workspaces exist per site; `Workspace` carries its own site |
| ADR-0040 | Token lifetimes; audience settled in Plan 4 |
| ADR-0041 | Conclusion kept (chat is owner-only, hq enforces), mechanism revised (session moves, hq keeps the copy — §10) |
| ADR-0042 | The premise — HQ as org source of truth, sites as execution layer (recorded outside this repository) |
| ADR-0044 | Registration is token-upfront; no inbound to sites |
| ADR-0045 | The control channel's decisions |
| ADR-0047 | Where a run may execute (§4) |
| ADR-0048 | Partitioning an agent's memory of a person (§8.2) |
| ADR-0049 | The session is the container boundary (§9.2) |
| ADR-0050 | Dispatch and status cross the control channel (§7.1, §10) |
