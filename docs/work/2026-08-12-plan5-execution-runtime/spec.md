---
name: Plan 5 — Execution Runtime Extraction — Design
created: 2026-08-12
description: Design spec for Plan 5 — Execution Runtime Extraction — Design. Front-matter added during the docs/ migration; body unchanged.
---


# Plan 5 — Execution Runtime Extraction — Design

**Continues:** `2026-08-09-hq-site-module-split-design.md`, which holds through Plan 4 and
is superseded from Plan 5 onward by this document.
**Status:** **Superseded 2026-08-14 by `2026-08-14-hq-site-split-design.md`**, the
consolidated living design for the whole split — read that, not this. Kept as the
historical record of the Plan-5 design pass (sections A–J); its section H (authorization)
shipped as plan 5b-1. Work tracking lives in the hq/site split unit's implementation plan.
**Scope (historical):** sub-plans 5b–5f. 5a (the control channel) is built and unaffected.

Everything in the parent spec still stands unless contradicted here. This document states
only the delta: what the parent got wrong, what it never covered, and what that means for
the remaining sub-plans.

---

## Why this exists

The parent spec was written before any of the split was built, and four plans landed
against it successfully. Plan 5 is where reality pushed back. Two of its placement
decisions turn out to rest on a factually wrong premise about the code, and the whole
question of *what an agent can physically reach during a run* — which the extraction makes
urgent, because the runtime and the control-plane data stop sharing a process — was never
designed at all.

Amending the parent inline was tried and abandoned: at 51 KB with five existing inline
amendments, the delta disappeared into it. This document keeps the correction legible.

---

## A. Corrections to the parent spec

### A1. `Agent` has a site — §1a's "no site" is reversed

§1a's rule is right — *anything with disk-resident storage needs a site; anything that's
pure definition doesn't.* Its premise about Agent is wrong.

§1a called an Agent "pure definition (name, model, tools, autonomy) with no disk state of
its own." In fact `workspaceService.ts` gives every agent `agents/<handle>/workspace`,
holding `.private/` (PROFILE, RESPONSIBILITIES, HEARTBEAT, its own `skills/`, git
credentials) and `.artefacts/`, plus `agents/<handle>/home/.claude` for runtime state.
`AgentContainerManager._start` bind-mounts both on every run. An Agent has as much
disk-resident storage as a Project.

It is also **written by the agent itself** — self-improvement means an agent revises its
own skills. Materialising those materials read-only onto a second site is therefore
unavailable: a copy with a downstream writer is a second master needing reconciliation,
which is the delta-sync machinery §8 removed and should not rebuild.

**`Agent.homeSiteId` → `ExecutionSite.id`, required.** An agent is not hot-swappable
across sites. §1a's dispatch behaviour still holds — work routes to the site owning the
project's storage — but dispatch must now *refuse* when that site is not the agent's,
rather than assuming any agent executes anywhere. Two enforcement points: adding an agent
to a project whose `executionSiteId` differs, and assigning it a task in one. The refusal
must be explained in the interface, not surfaced as an opaque failure.

Note this reverses a reversal: §1a records that an earlier draft proposed pinning Agent to
a site and was "wrong; reconsidered and reverted before being built." That earlier draft
was right, for a reason neither version stated — the agent writes its own materials.

### A2. `User` has no site — §1a's `UserSettings.homeSiteId` is reversed

§1a reasoned that a personal files home is disk-resident storage like a Project's
Workspace, so it needs the same kind of site reference. The first half is right; the
conclusion does not follow.

A project is a shared object with a definite home. A person is a participant, not an
object — they show up wherever they are working. **A person's intrinsic files home exists
on every site**, created when first needed. `Site1/users/<id>/files` and
`Site2/users/<id>/files` are separate storage, not copies. Nothing synchronises between
them, so there is no second master and nothing to reconcile — the same reasoning that
forbids copying an agent permits this, because these are distinct drawers rather than
replicas of one thing.

Removed with it: `UserSettings.homeSiteId` and its relation, the `ensureHomeSite` call in
`createSession`, and the "choose an Execution Site for your personal files" prompt — the
visible symptom of the wrong model, asking a person to pick a machine to live on.

The selection rule that replaces it: **choose an agent, and the available locations are
exactly that person's locations on that agent's site.**

Accepted cost, needing an interface answer rather than a design one: someone who has
worked with agents on three sites has three files homes. The interface must show which
site a location is on.

### A3. `Workspace` gains a site of its own — new

A user-owned workspace (`WorkspaceOwnerType.user`, already in the schema) has no
owner-site to inherit, since a person now has none. Rather than special-casing that,
**`Workspace.siteId` goes on every workspace record** and inheritance is dropped entirely.
A project workspace's site must equal its project's; a user workspace's is where it was
created. The placement check becomes uniform instead of owner-dependent.

### A4. The resulting rule

> **An agent must be on the site holding every location the run works in.**

One line, no special cases. True for a project, true for a person's own files.
`Project.executionSiteId` is unchanged.

| Anchor | Status |
|---|---|
| `Agent.homeSiteId` | new, required — A1 |
| `Project.executionSiteId` | unchanged |
| `Workspace.siteId` | new, required — A3 |
| `UserSettings.homeSiteId` | removed — A2 |

---

## B. Context boundaries — what a run can physically reach

§2a and §2b answer whether a run is *authorized*. Nothing in the parent answers what it
can physically *reach*, which is the stronger boundary: an agent executes in a container
whose bind mounts are the entire extent of its file access. There is no other path to
disk. What it is *permitted to do* with what it reaches is section H.

### B1. The governing principle

**Prefer structural boundaries over behavioural ones.** A boundary enforced by which
directory was mounted cannot be argued with by a model, is not vulnerable to prompt
injection, and fails closed. A boundary enforced by instructing the model to be careful is
a judgement call on every write, and its failures are silent and permanent.

### B2. The live defect

`AgentPromptBuilder` instructs the model to file what it learns under
`.private/memory/users/{userId}/` and `.private/memory/projects/{projectId}/`. That
instruction is the entire mechanism — no service reads or writes those directories, and
`.private/` is a subdirectory of the agent workspace, which is mounted whole on every run.
**So what an agent recorded about one person is readable while it works for another,
today.** The partition is a naming convention the model is asked to honour.

ADR-0036 proposed fixing this by classifying every memory write and routing it to the
matching owner. That record lists mis-classification leaks as a live risk mitigated only
by conservative defaults; it was accepted and never implemented. Classification is a
per-write judgement — the behavioural boundary B1 rejects.

### B3. Memory about a person becomes a mount, partitioned by invoker

`agents/<handle>/users/<userId>` is bind-mounted **only when that person invokes the
agent**, at a container path carrying no identifier (`/memory`). Another person's run
cannot name a path outside its own partition, even in principle. There is nothing to
classify, because a conversation write has exactly one place it can land.

### B4. Two things that are not memory

- **Knowledge about a project** — stack, conventions, constraints, decisions — belongs to
  the project, at `projects/<projectId>/knowledge`. Every agent working the project
  benefits, it does not duplicate per agent, and the read boundary is project access,
  which §2a/§2b establish and mounts already enforce. This is the only shared memory in
  the model.
- **Reusable know-how** is a skill. Skills already have scopes (platform / org / project /
  agent), versions and a catalogue. Self-improvement should bias toward *revising* an
  existing skill — `version` is already in the frontmatter — rather than adding one per
  lesson.

Nothing left in the model requires a judgement about what is safe to write where.

### B5. Sessions and locations

A session works in a location, chosen rather than inferred.

- No location selected — the session defaults to the invoker's own files home on the
  agent's site.
- A location selected — any of that person's locations on that agent's site, or a project
  location they may reach.

Several locations may be mounted at once: one is the working directory, the rest sit
alongside it. The mount layer already supports this — `resolveAccessibleLocations` returns
a list, and in container mode every mount is an absolute path under `/`, so no additional
directory-trust step is needed. Only the session record is behind: `AgentSession` carries
a single `primaryWorkspaceId`.

---

## C. Storage inventory

Host paths are keyed by immutable id so a rename never moves a directory; container paths
use slugs so the agent can be told about them. Example values shown — host root
`<host-root>/site` (`AGENT_SITE_PATH`, what the Docker daemon resolves), container
root `/site` (`SITE_ROOT`, the server's own view).

**Every row is a whole bind mount.** `.private/` is *not* a mount — it is a subdirectory
of the agent workspace mount.

**The cwd is always the primary location.** `AgentEngine` sets it from the run's primary
location's container directory and nothing else — a task's working directory for a task
run, otherwise the chosen workspace, otherwise the invoker's files home. The agent
workspace is mounted on every run but is never the working directory.

**The working directory is not the boundary — the mount set is.** Worth stating because the
code itself was confused about this, and section C's rows label some locations "the cwd" in
a way that invites the same mistake. `DockerSpawner` runs `docker exec -w <container path>`,
so a run starts in its primary location's directory — not at `/`. But every mount is an
absolute path under `/` and is reachable from any working directory, and the runtime sets
`permissionMode: 'bypassPermissions'`, so Claude Code applies no path gating whatsoever.
**Nothing depends on the agent respecting a directory; the container's mount namespace is
the only enforcement, and the kernel enforces it.** That is precisely why B1's structural
boundary is available at all.

What the cwd decides is where relative paths resolve and where an agent naturally writes
when it is not told otherwise — a prompt concern, not a security one.

One qualification on "the mount set is everything it can touch": an agent can also write to
the container's own ephemeral layer, `/tmp` and anything outside the mounted paths. That is
the ~156 kB writable layer measured in E2, and it is discarded when the container is
recreated. So the precise claim is that the mount set is everything it can touch **that
persists**. `AgentEngine.resolveAccessibleLocations` is the single seam
for location mounts; the workspace, Claude Code state, assets and shared binds are fixed
in `AgentContainerManager._start`.

| Store | Lives on | Host path | Container path |
|---|---|---|---|
| Agent workspace — mounted every run, but never the cwd. Holds `.private/` (PROFILE, RESPONSIBILITIES, HEARTBEAT, `skills/`), `.artefacts/`, task files | agent's site | `…/agents/<handle>/workspace` | now `/site/agents/<handle>/workspace`<br>**→ `/workspace`** (E1) |
| Claude Code state — credentials and session state, not the runtime | agent's site | `…/agents/<handle>/home/.claude` | `/home/appuser/.claude` |
| **Agent's memory of a person** — new (B3) | agent's site | `…/agents/<handle>/users/<userId>` | **`/memory`** — no identifier; only the invoker's is ever mounted |
| Platform assets · org shared files — read-only, same for every agent | agent's site | `…/assets`, `…/shared` | `/assets:ro`, `/shared:ro` |
| Project files | project's site | `…/projects/<projectId>/files` | `/projects/<slug>/files` |
| **Project knowledge** — new (B4) | project's site | `…/projects/<projectId>/knowledge` | **`/projects/<slug>/knowledge`** |
| Project workspace | its own site (A3) | `…/projects/<projectId>/workspaces/<wsId>` | `/projects/<slug>/workspaces/<ws-slug>` |
| Task working directory | project's site | `…/projects/<projectId>/tasks/<taskId>` | `/projects/<slug>/tasks/<TASK-KEY>` — the cwd |
| User files — the default cwd; the person's intrinsic files home | **every** site, created lazily (A2) | `…/users/<userId>/files` | `/users/personal/files` |
| User workspace — what "headless" means: owned by one person, no project | its own site (A3) | `…/users/<userId>/workspaces/<wsId>` | `/users/personal/workspaces/<ws-slug>` |
| Skills, merged from four scopes, precedence platform → org → project → agent | catalogue on hq, copies per site | `assets/platform/skills`, `shared/org/skills`, `projects/<id>/skills`, the agent's own `.private/skills` | copied into `<workspace>/.tmp/skills-*/.claude/skills` |

### Default workspaces

Three rows above are **default workspaces** — an owner's intrinsic location, existing
without anyone creating it, each serving one intended purpose:

| Default workspace | Owner | Purpose |
|---|---|---|
| `projects/<projectId>/files` | project | where a project run's files go when no workspace is chosen |
| `projects/<projectId>/knowledge` | project | where an agent records what it learns about the project |
| `users/<userId>/files` | user | where a personal run's files go when no workspace is chosen |

They exist so that **there is always somewhere an agent can put a file, in every run** —
without anyone having created a workspace first, and without the agent inventing a
location. Each is owned by a project or a person, so its access boundary is one that
already exists; and each sits on the same machine as the agent, so no run can be left with
a working directory it cannot reach.

`knowledge` is the same mechanism pointed at a different purpose: a project-owned default
location whose intended content is what agents learn rather than what people put there. It
is likely to need a directory convention so the interface can present it as something a
person can navigate — comparable to the product wiki's structure — but **that convention is
out of scope here** and does not block anything in this document.

Two notes on rows that are not what they look like:

**Skills are merged server-side, not mounted.** `ClaudeSDKRuntime` reads the four scope
directories, resolves precedence, and copies the winners into a temporary directory inside
the agent workspace. The scope directories themselves are never bind-mounted. **After the
split this copy becomes a network transfer** — relevant to 5d's sizing.

**A user workspace needs no new path code.** `locationDir` is owner-generic, so
`site/users/<userId>/workspaces/<wsId>` already resolves today.

---

## D. Context matrix — what each run type mounts

| Store | Lives on | Project task (autonomous) | Chat (no project) | Chat (project active) | Heartbeat (scheduled) |
|---|---|---|---|---|---|
| Agent config + skills | agent | yes | yes | yes | yes |
| Agent's memory of a person | agent | no | yes | yes | no |
| Project knowledge | project | yes | no | yes | yes |
| Project workspace + files | project | yes | no | yes | yes |
| Org / project / platform skills | agent | yes | yes | yes | yes |
| **Sites that must agree** | | agent = project | none | agent = project | agent = project |

The memory partition is absent from autonomous and scheduled runs deliberately: there is
no invoker, so there is no partition to mount. A scheduled job therefore cannot be steered
into anyone's private context — a structural property, not a policy.

---

## E. Runtime and container operations

Findings from reading and running the current system. Each affects 5d.

### E1. The agent workspace container path must be remapped

Every location mount gets a clean container prefix; the agent workspace does not.
`AgentEngine` sets `workspaceContainerPath` from `getAgentWorkspaceDir(handle)`, so the
container sees the server's own `SITE_ROOT`-relative path. It is the only mount exposing
the site's internal directory layout.

After the split this is a correctness problem, not tidiness: **hq will not know a site's
`SITE_ROOT`**, so the container path is no longer derivable where the mount is described.
Remap to `/workspace`.

Coordinated, not a one-line edit: the path is embedded in prompts (`AgentPromptBuilder`
tells the agent its memory paths are relative to it), and the merged skills directory is
written beneath it.

**Same root cause:** `ownerSlug` returns the hardcoded literal `personal` for any user,
commented "single user today", so every person's files home presents as
`/users/personal/files`. Harmless while a site serves one person.

**Also, for the record:** `AGENT_SITE_PATH` is not incidental. It is the host side of
*every* bind mount — `prepareAgentContainer` throws without it under container isolation,
and `_start` builds the assets, shared and Claude-state mounts from it. The environment
file's comment mentions only the credential login command, which makes it look optional.

### E2. A container belongs to a session, not to an agent

`containerName(handle)` takes the handle alone — one container per agent regardless of who
is talking to it or which project is active. **Until this changes, B3's partition cannot be
enforced**, because there is no per-invoker container to mount a per-invoker directory into.
Any plan implementing section B depends on this landing first.

The unit is the **session**, not a "context" — see ADR-0049. A context cannot be enumerated
(a run is agent + optional invoker + one or more locations, and a person may select several
workspaces at once) and, more importantly, has no lifecycle: a container keyed by one would
be created on first use and live forever with nothing responsible for removing it. An
`AgentSession` already carries exactly the tuple that determines a mount set, and already
has a lifecycle to hang the container's on.

**This is also a performance fix.** `ensureRunning` reuses a container only when its mount
set matches the run's; otherwise `_start` destroys and recreates it. With one container per
agent, two people alternating with the same agent force a full recreate on every exchange.
A session's mount set is stable for its life, so that churn stops.

The cost is low. Measured on a development machine:

| | |
|---|---|
| Idle container | ~2.4 MiB memory, ~156 kB writable layer |
| Executing agent, floor | ~207 MiB (≈46 MiB Node.js runtime + ≈160 MiB CLI bundle) |
| Image | ~509 MB, shared across all containers via overlay2 — paid once per host |

So container *count* is cheap and *concurrency* is the constraint. Extra contexts cost
almost nothing at rest.

**Idle teardown is mandatory, not an optimisation.** Sessions accumulate and containers are
created with `--restart unless-stopped`, so per-session without teardown grows without
bound. The cost that matters is the container runtime's per-container shim on the host —
roughly 10–20 MiB each, outside the cgroup and therefore invisible to `docker stats`. At
155 ms to create and 99 ms to remove (measured), stopping on idle and recreating on resume
is imperceptible. Note that "idle" must mean no activity, not the absence of a session:
task-scoped sessions (ADR-0030) legitimately stay open for the length of their task.

**Naming, since nesting is unavailable.** Tested against Docker Desktop with six labelled
containers: it groups on `com.docker.compose.project` and nothing else —
`com.docker.compose.service` has no effect on display. One grouping level only, so
project → agent → context is not achievable. The group stays the **site** (the reason the
label exists: several sites per VPS stay attributable) and the hierarchy goes in the name:

```
<site>-agent-<handle>-<sessionId>
```

One shape, always. Neither project nor person appears: a session may hold several
workspaces, so there is no single project to name, and an autonomous or scheduled run has
no invoker, so there is no person to name. A name that is sometimes one shape and sometimes
another is worse than an opaque one.

**Context goes in labels instead** — invoker, task, mounted locations — where it may be
absent or plural without breaking the scheme, and stays searchable with
`docker ps --filter label=`. Names carry identity; labels carry context. The same mechanism
already groups a site's containers under its Compose project.

Either way the boundary becomes observable from outside the system: a violation is a
*container that should not exist*, rather than something found by auditing what got written
where.

**Unrelated bug found alongside:** `containerName` falls back to a hardcoded
`agenthix-dev-agent` prefix when `AGENT_CONTAINER_PREFIX` is unset, but
`composeProjectLabelArgs` returns no labels in the same case. So in development the name
looks right while the container carries `{}` and floats ungrouped — verified on the
running `kernel` container. Giving the label helper the same fallback fixes it,
independent of everything else here.

### E3. No resource limits on agent containers

`Memory: 0`, `CpuQuota: 0`, no `PidsLimit`. One agent can consume the whole host, which
also runs the databases. `--memory` and `--pids-limit` are a small change with real value,
and more pressing once container count grows under E2.

### E4. The seeded Claude credential cannot be rotated

One credential lives at `<SITE_ROOT>/secrets/.claude/.credentials.json`, written by
`agenthix claude-login`. `_seedCredentials` copies it into each agent's `home/.claude` on
**first** container start and never again, guarded by an explicit "preserves token
refreshes" check.

Anthropic rotates refresh tokens on use. Verified on the development site: the seed still
held an April token while `kernel`'s copy held a **different** one from June. So an agent
created today would be seeded with a dead credential.

**Decided:** re-authenticating is manual by nature, so the site detects the dead grant and
notifies its administrator to run `agenthix claude-login`. Accepted as fit for a
single-organisation install; a larger organisation should use an API key, which does not
expire or rotate. Revisit in a future release.

**Still open:** the refreshed credential never travels back to the site, so an
administrator would be told to re-authenticate while a live token sits in an agent's
directory. Re-seeding on every start and writing the container's copy back when it changes
would fix it. Site-owned work — `_seedCredentials` runs in hq's process today, so it moves
in 5d.

Note the runtime is **not** installed per agent: `Dockerfile.agent` installs the CLI
globally, one install for all agents. `~/.claude` is its config and state directory.

---

## F. Directions considered and rejected

Recorded so they are not re-proposed.

**An "agent know-how" memory tier.** An audit of the agent's private directory found a
render of the hq `Agent` row (PROFILE frontmatter), human-authored configuration (PROFILE
body, RESPONSIBILITIES, HEARTBEAT), skills, and a credential. Nothing accumulated. The
"generalized learnings" ADR-0036 names as that directory's purpose has no writer, no
service and no directory.

**A promoted shared-context store on hq**, readable by every agent a person invokes. §1
puts records on hq and substance on site; a promoted document is substance. It also
assumed an agent container could read hq directly, which §4b has not settled.

**Cross-user agent memory guarded by an instruction to strip sensitive detail.**
Sensitivity is not intrinsic to the text — "worried about the quarterly numbers" matches
no pattern a filter could catch and is precisely the leak. The instruction also shares a
context window with untrusted input the agent has read.

**Binding each agent to a single project.** Unnecessary: an agent that is a member of
exactly one project is already bounded to one. The boundary comes from what is granted,
not from what the agent fundamentally is.

**Binding each agent to a single person, as a pure delegate** inheriting only that
person's permissions. Genuinely attractive — it dissolves the confused deputy entirely, and
makes B3's partition unnecessary since one agent would have one user. Rejected because it
makes agents **personal property**: when someone leaves the organisation, their agents and
everything those agents learned leave with them. An organisation cannot build capacity out
of assets that depart with an employee. The related concern — that agents are not yet
trustworthy enough for broad latitude — is expressible as per-agent policy (`autonomy`,
`allowedTools`, manifest approval, all of which exist) rather than as an identity model
that would be hard to relax as agents earn trust.

---

## G. Open problems

**An agent-authored skill has no inactive state.** Agent skills are loose files under
`.private/skills/`, which `getScopeDirectories` reads unconditionally — a skill is live the
moment the file is written, with nothing between authoring and taking effect. The library
is a human-facing catalogue with PLATFORM, ORG and PROJECT scopes only; agent skills bypass
it. This costs twice: every active skill spends frontmatter on every run it is scoped to,
with no signal for which ones ever fire; and because skills are shared across every invoker
by design, a skill written during one person's session is active in another's. **Memory can
be partitioned by mount; skills cannot**, since being shared is their purpose — so this is
the one remaining writable channel between people through a shared agent. A human-gated
staging directory was considered and not adopted: a human in the loop on every learned
improvement may be the wrong trade for a system whose point is autonomous work.

**Nothing prunes the active skill set.** Usage counting would make "which skills are
earning their place" answerable, and is cheap to add later.

**Read-only materialisation must be enforced.** If an agent can write to a local copy of an
org or project skill, drift returns by the back door.

**Unattended runs have no human to defer to.** Scheduled and heartbeat runs have no
invoker, so an agent whose autonomy calls for human approval has nobody to approve.

**Project knowledge is a shared writable surface.** One agent writes what another reads.
That is the intent, but it is the first place it becomes true, and whether an agent may
write it freely is the same question as the skills one in a different form.

---

## H. Authorization — what a run is permitted to do

Section B answers what a run can physically *reach*. This answers what it is *permitted
to do* with the control-plane data it reaches over the §4b path. It is the design 5b had
to settle before building an API, and it is now settled.

### H1. The audit

Of the 45 tools an agent has — 8 from the runtime, 37 over MCP — most need no authority
model, because something already bounds them:

| Class | Count | Bounded by |
|---|---|---|
| Runtime filesystem and shell | 6 | The container's mount set, derived from the session. Bash additionally by `allowedBashPatterns`, off by default. |
| Runtime web | 2 | Nothing org-related is reachable. An egress question, not an authority one. |
| MCP, site-local (`ping`, `get_site_info`, `start_preview`) | 3 | Touch no org data. |
| MCP, the run's own work — task lifecycle, project reads and writes | 10 | The capability's own scope: `projectId`, `workspaceId`, `taskId`. |
| MCP, org-wide reads | 8 | Nothing, but reading carries no escalation. |
| MCP, project-scoped administrative (`create_board`, `archive_task`, `delete_task`) | 3 | Conceptually the project — a board and a task belong to one — but see the scoping defect in H4. |
| **MCP, org-escaping mutations** | **10** | **Nothing but whether the tool is switched on.** |

The 10 org-escaping tools, by name: `update_org`, `create_team`, `complete_org_setup`,
`create_product`, `update_product`, `delete_product`, `create_project`, `create_agent`,
`apply_agent_preset`, `propose_workforce_template`. These are the only tools through
which an agent can act on the organisation itself, and the only ones the decision below
constrains.

### H2. The decision

**An agent never holds authority of its own.**

- **Chat** — the run acts with the *invoking person's* permission. Every tool the agent
  is granted, capped by that person's role. A viewer gets a viewer's reach; an admin an
  admin's. hq applies the same check it would apply to that person's browser request.
- **Task and scheduled runs** — the run is confined to the *project's own scope*.
  Boards, tasks and archives inside the project remain available, bounded by the
  capability's `projectId`. The 10 org-escaping tools are unavailable, because there is
  no person to act for and a project holds no org authority to lend.
- **Everything else is unchanged** — mounts bound the filesystem, project membership
  bounds project data, and `Agent.allowedTools` keeps its existing meaning as a
  *ceiling*: what the agent may attempt. The principal's permission decides whether the
  attempt is permitted. Two layers, both already built.

**No new schema.** `UserSettings.role` exists and is already checked for browser
requests; the capability already carries `projectId`. No permission field on `Team`, on
`Project`, or on `Agent`.

**No invocation gating.** Chatting with an agent grants you nothing beyond your own
role, and queueing a task grants nothing beyond the project's own scope, which
membership already grants. Neither act is worth restricting — there is no escalation
surface left to guard.

**The arbitrary-admin defect stops mattering.** `TaskRunner` resolves a task session's
user with `findFirst({ where: { role: 'ADMIN' } })` — an arbitrary admin, because `Task`
never recorded who requested the work. Under this rule that fabricated value is never
consulted for authority: unattended runs derive theirs from the project scope alone.
(The session-ownership and privacy consequences of that fallback remain and are
recorded in section G.)

**If unattended org-level mutation is ever genuinely needed**, it must arrive as a
deliberate, named exception — an exception is easier to add than an escalation surface
is to remove.

### H3. Rejected on the way

Both alternatives were developed far enough to find the flaw, and are recorded so they
are not re-proposed.

**Team authority** — agents belong to a team, inherit its permission level, and only
team members may invoke them. Attractive for stability (agents outlast individuals) and
for unattended work (the agent holds standing with no invoker needed). Killed by its
costs: team membership becomes a privilege-granting act needing admin-only control; five
schema changes (`Team` today has no user members, no permission level, and an untyped
`agentIds` array nothing stops two teams sharing); cross-team collaboration needs a
three-state invocation rule; and the owning team cannot see what its agent was asked to
do in sessions it does not own. Each cost is answerable; together they are a second
permission system.

**Project as principal** — unattended runs act with a permission level carried by the
project, so org-level automation stays possible and attributable. Killed by one fact:
`createProject` has no role gate — any authenticated user can create a project
(`projects/actions.ts`, the only guard is 401). A project carrying org permission would
be a freely mintable authority holder: create a project, grant it power, queue work into
it. The team model's escalation surface, rebuilt in miniature. What made dropping it
cheap is the 10 + 3 split in H1 — the three project-scoped administrative tools stay
available unattended, so no real automation need was lost.

### H4. Enforcement — the capability is the vehicle, and becomes the MCP bearer

The capability minted at dispatch (§2a) already carries `userId`, `agentId`,
`sessionId`, `projectId`, `workspaceId`, `taskId`, `siteId` and the resolved tool
permissions, signed by hq and verified locally by site. It gains the invoker's **role**
for chat-minted capabilities; task-minted ones carry no role, which *is* the unattended
rule — site refuses org-escaping tools when the capability names no person.

**The MCP request's bearer becomes the run's capability, not the site's static key.**
This resolves three defects at once:

1. **The per-request database read disappears.** `handler.ts` reads `Agent.allowedTools`
   on every MCP request to compute never-tools; the capability already carries
   `permissions.neverTools`. Redundant before the split, a network call per request
   after it.
2. **Identity stops being self-asserted.** `X-Agent-Handle` is a header the agent's own
   configuration carries, so an agent can name any agent it likes. Claims signed by hq
   replace it.
3. **The container stops holding a permanent site-wide credential.** `AgentEngine` puts
   the static MCP key inside the agent container twice — as the MCP `Authorization`
   bearer, and as `AGENTHIX_MCP_KEY` for the git credential helper. After the split that
   key is the network credential to all org data, held by the least trusted process in
   the system. A capability is short-lived, run-scoped and expiring; the git helper
   takes the same token for the same reason.

*(As built, 2026-08-13: the container carries an opaque run token rather than the
capability JWT itself — the token resolves server-side to the run's live capability,
which the renewal loop refreshes in place, so long runs never hold a stale bearer and
the least-trusted process never holds a real credential at all.)*

**Renewal failure is soft, and that bounds how fast a demotion lands.** A capability
renews at 80% of its TTL by re-resolving from live rows, which is how a role change or
policy change reaches an already-running session. When renewal *fails*, the run
honours its existing capability until expiry rather than dying mid-flight. The stated
property: a demotion therefore propagates within one TTL **plus** the renewal-failure
window, not within one TTL alone. Accepted deliberately — the alternative is killing
healthy runs on transient hq unavailability.

### H5. Live defects found by the audit — independent of the split

- **`createProject` has no role gate.** Any authenticated user may create a project.
  This stands alone as a defect and is also what killed project-as-principal.
- **`archive_task` and `delete_task` are unscoped.** Both take a bare `taskId` and
  `findUnique` it with no project check — an agent granted them can archive or delete
  any task in the organisation, including in projects it has never joined. The
  capability already carries the `projectId` needed to close this.
- **`complete_org_setup` is always injected.** It sits in the PLATFORM group, pinned on
  for every agent and not user-configurable, yet it mutates the organisation. No
  configuration can prevent any agent calling it.
- **`create_product` and `update_product` are on by default** while their sibling
  `delete_product` is administrative. Every agent can mutate products unless someone
  turns it off.

### H6. Where a tool grant is defined — one list, one intersection

This section was left open when H2 was settled, and is now settled the same day. The
question was where a grant like read, write or bash belongs: it lives on the agent's
profile today, applied identically wherever the agent runs, yet what actually bounds
those tools is *where the agent is working* — a bash grant that is safe in a scratch
workspace is not the same grant in a production one.

**The answer generalises H2 rather than replacing it: every boundary states an
allowed-tools list in the same vocabulary, and a run's effective set is the
intersection of all of them.**

```
effective = agent ∩ principal ∩ workspace₁ ∩ workspace₂ ∩ … ∩ site
```

- **One vocabulary.** A workspace does not get a permission model of its own — no
  read-only/read-write mode field, no special restricted grammar. It carries an
  optional allowed-tools list of exactly the shape `Agent.allowedTools` already has.
  (A mode field was proposed and rejected for this reason: it would be a second
  permission vocabulary to keep coherent with the first.)
- **Intersection, not precedence.** No layer takes precedence over another, because
  precedence is the wrong relationship: a layer that could override another could
  *widen* what that layer refused, and every such layer is a place to attack.
  Intersection can only narrow. This is the shape H2 already settled for authority —
  chat is the agent's grant capped by the person's role — extended to every boundary.
- **The agent's list remains a real cap**, not mere configuration: a research agent
  granted only the read tools stays read-only in the most permissive workspace, and a
  fully-capable developer agent is held to reads in a workspace that allows nothing
  else. `neverTools` remains the hard deny that survives every layer.
- **A workspace's list caps the whole session while it is mounted** — not only the
  tools that touch its own files. Chosen deliberately over a "workspace speaks only
  about filesystem tools" carve-out, for consistency (one list, one rule) and because
  it is what makes the list a *data* protection rather than only an integrity one: a
  sensitive workspace that omits `web_fetch` and `web_search` means its contents
  cannot be sent out while mounted, because the whole session loses those tools. The
  accepted consequence: one restrictive mount narrows the entire session — an agent
  can lose write access to its own default files workspace while a read-only reference
  workspace is mounted. Strictest-wins is the design working, but the UI must surface
  *why* a tool went dark, or it will read as a fault.
- **An unconfigured workspace contributes nothing to the intersection.** No list means
  no cap. Restriction is a deliberate act by whoever configures the workspace. The
  alternative — restrictive until configured — would drag every session that touches
  an unconfigured workspace to read-only, including the default files workspaces whose
  entire purpose (§C) is being somewhere the agent can always write.
- **The site layer is a placeholder.** Machine-level bounds — egress for the web
  tools, resource limits — belong to the site, whose operator answers for its network,
  and are flagged by ADR-0049 as missing. They are not designed here; until they are,
  the web tools keep their current home as agent switches, off by default.

**Enforcement is structural, twice over.** The intersection is computed at capability
mint time — the capability's `permissions` carries the effective set, nothing new in
the claim shape. Tools outside the set are not registered on the MCP server or the
runtime, the mechanism that already exists for `neverTools`. And whenever the write
tools fall out of the effective set, every workspace mount additionally goes in
read-only, so the kernel enforces what the tool registry already refuses — the same
belt-and-braces principle as the rest of the model (§B1).

**Known gap until 5d, stated rather than discovered:** for an agent with
`autonomy: 'unrestricted'`, the intersection binds MCP tools (the post-intersection
`neverTools` reaches the SDK's disallowed list) but **not the runtime built-ins** —
the runtime deliberately grants unrestricted agents every built-in tool and skips the
per-call permission gates, so a restrictive workspace under an unrestricted agent
still leaves file-write, shell and web built-ins available. A naive fix (pruning
built-ins from `neverTools`) regressed the kernel before and is not attempted;
the gap closes structurally when 5d's read-only mounts land, which bind file and
shell access at the kernel regardless of what the SDK registers.

**Schema effect: one optional field** — an allowed-tools list on `Workspace`. Nothing
on `Team`, `Project` or `Agent` changes; the intersection is computed where the
capability is already minted.

---

## I. What this changes in the sub-plans

**5b — site → hq data path.** Section H is its authorization design and must land with it:
the capability becomes the MCP bearer, chat capabilities carry the invoker's role, and
task capabilities carrying no role is what makes the 10 org-escaping tools unavailable
unattended. Capability minting computes the H6 intersection, which needs the one additive
schema change H6 names — an optional allowed-tools list on `Workspace`. H5's defects
should be fixed alongside.

**5c — move workspace storage.** Now also adds `Workspace.siteId` (A3) and carries the
backfill: existing project workspaces take their project's site; existing user workspaces
take whatever `UserSettings.homeSiteId` said before it is dropped. 5c remains the cheap
test of the cross-database pattern; this addition does not change that purpose.

**5d — move the execution runtime.** Absorbs all of section E: the workspace path remap
(E1), per-session containers and their naming (E2), resource limits (E3), and credential
seeding moving to site (E4). Section B's memory partition also lands here, since it is a
mount decision — but **it depends on E2**, so per-session containers must come first
within 5d, or 5d splits.

**5e — move session, runs and transcripts.** Now also carries B5: `AgentSession` gains
several locations rather than one `primaryWorkspaceId`, and loses nothing else.

**5f — chat and voice relay.** Unaffected.

**New work not in any sub-plan yet:**

- `Agent.homeSiteId` with enforcement at project membership and task assignment (A1) —
  earliest sensible home is 5c, alongside the other placement fields.
- Removing `UserSettings.homeSiteId`, `ensureHomeSite` and the site-picker prompt (A2).
- `projects/<projectId>/knowledge` and the prompt changes that direct writes to it (B4).
- The dev container-labelling fix (E2) — independent of everything, can land any time.

---

## J. Effect on the decision record

| Record | Effect |
|---|---|
| ADR-0036 §1 | Amended — a person's data lives in the invoking agent's partition, not a user workspace. Security property preserved, mechanism changed. |
| ADR-0036 §5 | Superseded — no scope classification at write time; the mount decides structurally. |
| ADR-0036 §4 | Superseded by ADR-0049 — the intent is kept, but the isolation unit is a session, not a context. Section B depends on it. |
| ADR-0039 | Amended — a person's files home and workspaces stay, but exist per site rather than in one place; `Workspace` gains its own `siteId`. |
| ADR-0025 | Unchanged — the agent stays an organisation member with its record on hq. |
| [ADR-0047](../../docs/adr/adr-0047-where-a-run-may-execute.md) | New — where a run may execute. Section A is its reasoning. |
| [ADR-0048](../../docs/adr/adr-0048-partitioning-an-agents-memory-of-a-person.md) | New — partitioning an agent's memory of a person. Section B is its reasoning. |
| [ADR-0049](../../docs/adr/adr-0049-the-session-is-the-container-boundary.md) | New — the session is the container boundary. Section E2 is its reasoning. |
