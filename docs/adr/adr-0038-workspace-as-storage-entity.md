---
created: 2026-06-26
description: The workspace as the single storage primitive: a git-backed directory holding any content.
---

# Workspace as the Storage Entity, Separate from Project (Work)

**Status:** Superseded by adr-0039

*(original status)* Accepted — foundational model underpinning the build → preview → deploy loop. Refined 2026-06-26 through a design pass.

*(original status) Accepted — implementing now (pulled into the current phase). Foundational model underpinning the build → preview → deploy loop. Refined 2026-06-26 through a design pass.*

## Context

A concrete failure surfaced the problem. The kernel agent, in a **global** conversation (not tied to any project), built an app (`helloapp`) — it landed at `agents/kernel/workspace/helloapp`: a real working app, **but with no `.git`, no project, and no entity of any kind.** It could be previewed, which made it *feel* real, but there was no path to version, keep, or deploy it. Separately, the operator linked a GitHub repo to the **onboarding Project** — which connected the repo to the (empty) project checkout, never to `helloapp`. The two actions — *"build an app"* and *"link a project to a repo"* — are completely disconnected.

The root cause is a **conflation in the data model**. A repo is bolted directly onto entities that are really about something else:
- `Project.repoUrl` — a codebase repo welded onto a *unit of work*.
- `Product.wikiRepoUrl` — a wiki repo welded onto a *product umbrella*.

Because a repo lives in **multiple** places, "repo" cannot be the organizing entity — it's an attribute. And because a *Project* is a unit of work (any kind — software, research, ops; it generates `PROJECT.md` / `ROADMAP.md` knowledge, not code), fusing it with a codebase is the wrong shape. There was no first-class home for "the code," so agent-built apps orphan.

This ADR separates **work** from **storage/code** and gives the latter a first-class entity.

## Decision

### 1. Workspace — the storage entity
A **Workspace** is a first-class entity: a directory, **optionally git-backed**, holding **any** content — code, docs, data. It is the unit "the agent works in" — the same sense Claude Code and Codex use the word (the local working directory / repo). Content is **untyped**: a Workspace with runnable code can be **run, deployed, and operated**; one that holds only docs is not. No rigid type field — capabilities follow content.

An **"app" is just a runnable Workspace** — not a separate entity. Likewise a library, a service, a site. A Workspace is the **unit of one runnable thing** (one app ≈ one Workspace ≈ one dev command); multiple apps means multiple Workspaces, not many apps crammed in one directory. (Monorepos — several runnable targets in one Workspace — are a real but deferred refinement.)

### 2. Repo, preview, and deploy are capabilities — and preview is path-based, decoupled from the entity
A repo is an *attribute* many things can have. So "Repository" is never the organizing entity — only a capability **of a Workspace**.

**Preview is decoupled** from both the Workspace entity and git: it is a **runtime capability registered against a path** (bind-mount the directory, run its dev command, serve it), exactly as the shipped live-preview already works. It is **not** a stored field on the Workspace, and it does **not** require git or a Workspace to exist — the agent can preview a throwaway app straight from session scratch (§9). A durable Workspace *may* later persist a **deploy** config (for the deploy/Operations path), but that is separate from preview and added when deploy needs it.

### 3. Project = work; Product / Program = umbrellas; a project is born with a default Workspace
A **Project** organizes *work*: tasks, boards, roadmap, knowledge/context, members. It does **not** store code. **Product** and **Program** remain umbrellas. None of these *is* a repo; each may **own** Workspaces.

A **Project is born with one default Workspace** — its knowledge home (`PROJECT.md` / `ROADMAP.md` / plans / ADRs). It is **auto-created with the project**, marked **`isDefault`**, **unremovable** (it's the project's native storage), and **untyped** (it's not a special "docs type" — just the project's default Workspace). Linked/built repos are **additional** project-owned Workspaces. In the UI the default Workspace is rendered distinctly (the project's home), with additional Workspaces (repos) listed alongside — never as an undifferentiated list.

### 4. Ownership is logical (a DB field); storage is flat, keyed by id
A Workspace is **owned by exactly one context**, recorded as fields: `ownerType` ∈ `project | product | program | user`, plus `ownerId`. **Storage is flat** — every workspace lives under a single `workspaces/` root and **never moves** for its lifetime. The owner is *not* encoded in the path.
- **Headless = user-owned** (`ownerType: user`) — a personal workspace; e.g. a throwaway app promoted from a global chat.
- **Storage path = `workspaces/{slug}-{shortid}`.** The human-readable `slug` is a **display label, not the unique key** — real names collide (a project and its repo are often named the same; two projects can both link a repo named `api`). Uniqueness and **all references are by the stable `id`** (a short id suffix on the dir keeps it human-readable *and* collision-proof, rename-safe, and promote-safe since nothing moves).

### 5. Promotion — two distinct operations
- **Scratch → new Workspace** (the common case: "keep this throwaway app"): **materialise a new Workspace and move the artifact into it once** (+ optionally init a repo). A one-time copy at promotion; low-risk (it creates something new — if it fails, scratch is untouched).
- **Workspace owner-flip** (headless user-owned Workspace → a project/product/program): just **set `ownerType`/`ownerId`** — a single DB update, **no folder move** (storage is flat). A Workspace is **headless = private to its owner**; to collaborate, promote it into a context. There is no cross-owner "soft reference" (that would be a cross-context access leak).

### 6. Access = checks against the owner; runtime isolation = selective mount
Consistent with [ADR-0036](./adr-0036-context-centric-security.md): the **site is the hard/residential boundary**; the **project/user boundary within a site is soft, policy-driven** — access is a *check* that the requester belongs to the workspace's **owner context**, not a function of where the folder sits. Agent **runtime isolation** comes from **mounting only the authorized workspace(s)** into a run — which works regardless of the flat path. *(The full per-requester enforcement is ADR-0036 / a later phase; this ADR delivers the storage separation it builds on.)*

### 7. Ownership floor
A Workspace's owner context must always retain **≥1 member/owner**. Removing the last owner is blocked (ownership must transfer first). A project's **default Workspace is additionally unremovable** — a project always has its home storage.

### 8. Creation — building lands in scratch; a Workspace is created by promotion or manually
Not every build deserves a Workspace. "Show me the weather" is throwaway. So:
- The agent's build lands in **session scratch** (§9), **not** an auto-created Workspace. It's previewable from there (preview is path-based, §2).
- A **Workspace is created** either by **promotion** (scratch → Workspace, §5, when the user keeps it) or **manually** by a user. Both materialise storage + an optional repo.
- Because scratch lives in an **owned** workspace and is **session-tracked** (§9), a throwaway build is *owned but ephemeral* — it can never become the orphaned `helloapp` of the original failure.

### 9. Sessions attach to a primary Workspace + their own scratch
Mirroring agentic harnesses (a cwd + additional directories): a **session is attached to a *primary* Workspace** (the run's cwd) and may **expand to *additional* Workspaces** (each gated by its owner).
- **Primary defaults:** a focused session (opened on a Workspace, or a project task) → that Workspace; a **general 1:1 chat → the user's *personal* Workspace** (a user-owned Workspace, provisioned **lazily** on first need).
- **Session scratch.** Each session has its own scratch dir for artifacts, living **inside its primary Workspace** (for a general chat, inside the personal Workspace), **git-backed** so edits and "go back" come for free. Throwaway builds land here. There is no separate scratch *entity* — it's a directory within an owned Workspace, tracked by the session.
- **Working copy:** git is **optional** for Workspaces generally; by default a session works **directly in the directory** (no per-session copy). **Worktrees are opt-in**, for genuine parallel execution on a git-backed Workspace.
- **Concurrency is file-grained, not workspace-locked.** Contention arises only when two concurrent runs write the **same file/folder**; the resolution mechanism is an **implementation detail, deferred**.

### 10. Artifacts are files, not objects
Because Agenthix is **filesystem-native** (Claude Code / Codex model, not ChatGPT-Canvas), artifacts the agent produces are **files in a (scratch or) Workspace dir**, versioned by **git** (edit + go-back for free). There is **no artifact DB entity** — itemisation is the file tree plus references in the transcript. A thin `Artifact` record (titles/types/a panel/promote button) is **optional sugar layerable later**; it would only *point at* the file and would not change where content lives.

### Surfacing
- A Workspace has **its own details page** — preview, GitHub/Operations (per ADR-0037), settings, members.
- A **Project/Product/Program** page has a **"Workspaces" tab** listing the workspaces it owns (queried by owner). This **replaces the project's GitHub tab** — there is one entry point to a project's code, not two. The project's **default** Workspace is shown distinctly; repos are listed as additional.
- A **top-level area** for a user's headless Workspaces.
- **Viewing files** (render `md` / code / diffs / images in-app; download other types for the device's native app) is an **additive read-only viewer** over the filesystem — already roadmapped (Phase 8 minimal / Phase 10 full) and built on top without changing storage.

## Consequences

### Positive
- **Nothing the agent builds can orphan** — it lands in owned, session-tracked scratch; promotion makes it a durable Workspace. `helloapp` would have been owned from the first keystroke.
- **Work and storage are cleanly separated** — the `repoUrl`-on-Project / `wikiRepoUrl`-on-Product conflation is gone. Project goes back to being purely about work.
- **One storage primitive.** Repo and deploy are capabilities of a Workspace; preview is a path-based capability needing no entity at all.
- **Filesystem-native artifacts** — files + git give edit/version/go-back without an artifact subsystem; any viewer/editor layers on top.
- **Promotion is safe** — scratch→Workspace is a one-time create+move; owner-flip is a single field update with no move.
- **Aligns with the multi-tenant model** — owner is the access boundary; flat storage + owner-field + selective mount give isolation without path-nesting.

### Negative
- **New first-class entity + a migration.** Extract the codebase from `Project.repoUrl` into a Workspace; migrate `Product.wikiRepoUrl` → a docs-Workspace; land any orphaned builds.
- **Owner is not visible from the folder path** — debugging is a lookup / admin view rather than reading the tree (mitigated by the human `slug` prefix on the dir).
- **Term overlap.** "Workspace" collides with the legacy *agent* workspace (`agents/{handle}/workspace/`) until that is retired by the multi-tenant storage rework.

### Risks
- The **agent-workspace retirement** (storage becomes context-scoped, agent owns no data workspace) must land for the model to be fully clean; until then there's transitional overlap.
- The **Operations surface (GitHub tab) currently lives on Project** (ADR-0037 build) — it **re-homes onto the Workspace** as part of this work. The recent operations work is not wasted; it re-homes.

## Resolved in the 2026-06-26 design pass
- **Project knowledge** → the project's **default Workspace** (untyped, auto-created, unremovable), *not* a separate "docs type". (§3)
- **`Product.wikiRepoUrl`** → a product-owned **docs-Workspace**; migrated in this work, **sequenced last** behind a checkpoint.
- **Storage path** → `workspaces/{slug}-{shortid}`; `slug` is a display label, uniqueness/refs by `id`. (§4)
- **Personal Workspace** → provisioned **lazily** on first need. (§9)
- **Preview** → decoupled, path-based, not a Workspace field. (§2)
- **Credential** → PAT baseline (the per-repo deploy key is the agent's push credential); the connection stays **pluggable**; a GitHub App is the future **managed-hosting** option (a single App can't serve self-hosted sites — see [ADR-0037](./adr-0037-connectors-environments-and-scripts.md)).

## Open Questions
- **Concurrency resolution** for same-path writes — file-grained, mechanism deferred (optimistic conflict detection / git-merge where git-backed / last-write-wins early).
- **Worktree/working-copy mechanics** for git-backed parallel runs (when worktrees are used vs working in the dir directly).
- **Monorepo / multiple runnable targets** in one Workspace — deferred refinement (v1: one run config per Workspace).
- **Rich artifact UX** (Canvas-style in-place editing / version browser) — optional later layer; only the read-only viewer is near-term.
- **Scratch lifecycle** — when/whether to sweep old session scratch dirs.

## References
- [ADR-0036 — Context-Centric Security](./adr-0036-context-centric-security.md) — owner/context as the permission boundary; runtime container as the execution-isolation boundary.
- [ADR-0037 — Agent Operations: Connectors, Environments, and Approved Workflows](./adr-0037-connectors-environments-and-scripts.md) — the GitHub/Operations + preview surface that re-homes onto the Workspace; PAT-baseline / pluggable connection.
- Schema today: `Project.repoUrl`, `Product.wikiRepoUrl`, `Program`; `ProjectSshKey` / `ProductSshKey`; the orphaned `agents/kernel/workspace/helloapp` finding (2026-06-26) that motivated this.
