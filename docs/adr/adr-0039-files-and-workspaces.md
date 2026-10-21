---
created: 2026-06-28
description: Nested storage per owner with permanent ownership, replacing the flat mutable-owner workspace model.
---

# Files and Workspaces: Nested Storage with Permanent Ownership

**Status:** Accepted

Supersedes adr-0038.

## Context

ADR-0038 made a Workspace the single storage primitive: **flat** storage (`workspaces/{slug}-{shortid}`), logical ownership as a **mutable field** (`ownerType`/`ownerId`), **promotion by flipping that field**, a project **born with an unremovable "default Workspace"** as its knowledge home, and the product wiki re-homed onto a docs-Workspace.

Building it surfaced three problems with that shape:

1. **The wiki was a workaround for a missing file viewer.** The only reason a "wiki" existed as a distinct feature was to read structured docs when there was no way to browse files. A file viewer is roadmapped (Phase 8 minimal / Phase 10 full); once `.md` is browsable, "the wiki" is just *browsing markdown*. The wiki is therefore not a type or a feature — it **dissolves into the viewer.**

2. **Every container needs a working directory — not a bespoke entity.** Generalising from the wiki: a project, product, and program each need (a) a files directory, (b) a viewer, (c) a way to version it, and (d) the ability to be an agent's working directory. None of that justifies modelling the container's *own* storage as a separate "default Workspace" the user navigates to.

3. **Flat storage + mutable ownership existed only to make promotion cheap.** The flat layout and the `ownerType` field were chosen so that "promote a throwaway app from a global chat into a project" was a zero-cost pointer flip with no file move. That optimised the *entire* storage model around one scenario. On reflection, ownership of storage should be **permanent and legible**, and *relocating content* should be an explicit copy/move operation — not an entity mutation. ADR-0038 itself listed "owner is not visible from the folder path" as a negative; that negative was self-inflicted by the flat choice.

This ADR keeps the good parts of ADR-0038 — storage separated from work, repo/preview/deploy as capabilities, the agent works in a directory, nothing the agent builds orphans — and corrects the shape: **two storage kinds per owner, under a nested ownership-legible layout, with permanent ownership.**

## Decision

### 1. Two storage kinds per owner: `files/` and `workspaces/`
Every owner — **project, product, program, and user** — has:
- **one intrinsic `files/` directory** — its working/knowledge home (docs, notes, roadmap, the container's own working content). It is **not a separate entity**; it exists with the owner. It replaces ADR-0038's "default Workspace".
- **zero or more `workspaces/`** — named, first-class **Workspace** units the owner holds (a frontend app, a backend service, a library). Each is the unit of "one runnable thing" (ADR-0038 §1 stands).

An **app is still just a runnable Workspace.** The new distinction is between the owner's *own* working dir (`files/`) and the *additional named units* it owns (`workspaces/`).

> ⚠️ **The shape stands; adr-0047 placed it on a site.** *(annotated 2026-08-30)* Storage is placed on an Execution Site, which this record predates. A person's `files/` home is not one directory but one per site they work on, created when first needed and never synchronised; and a `Workspace` carries its own site rather than inheriting one from its owner. The two-storage-kinds-per-owner shape itself is unchanged.

### 2. Nested storage, keyed by immutable id
Storage is **nested by owner**, so ownership is legible from the path:
```
projects/{projectId}/files/
projects/{projectId}/workspaces/{workspaceId}/
products/{productId}/files/
products/{productId}/workspaces/{workspaceId}/
programs/{programId}/files/
programs/{programId}/workspaces/{workspaceId}/
users/{userId}/files/
users/{userId}/workspaces/{workspaceId}/
```
> ⚠️ **Only projects and users own storage now.** *(annotated 2026-09-26)* [ADR-0061](adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) removed products and programmes as owners: they own no files and no workspaces, so the `products/` and `programs/` entries above name storage that does not exist. The rest of the layout stands.

Directories are keyed by **immutable ids**, not names — renaming an owner or a workspace never moves files (names are display labels). This keeps ADR-0038's rename-safety while restoring path-legible ownership.

**Storage keyed by id; presentation by slug.** Id-keying is a *storage* concern (rename-safety). For *presentation* — what an agent sees as its working paths — the runtime mounts each id-keyed host dir at a **slug-based** container path (host `projects/{id}` → container `/projects/{slug}`; cwd `/projects/{slug}/workspaces/{name-slug}-{shortId}`). Host storage stays id-keyed and rename-safe; the agent gets human-readable paths. The slug is display-only and never resolves host storage. A rename changes only the container-path label (and triggers a one-off container restart), never the on-disk directory.

### 3. Permanent ownership; relocation is an explicit copy/move
A Workspace's (and a `files/` dir's) **owner is fixed at creation and never changes.** A personal workspace is permanently personal; a project workspace permanently the project's. There is **no promotion / owner-flip.**

To move content to a different owner, the user invokes an explicit **copy/move-files** operation that relocates bytes into a destination under the target owner. Source and destination ownership are always clear; nothing changes hands by mutating a field.

This reverses ADR-0038 §4 (flat) and §5 (promotion). The cost — promotion is no longer free — is accepted deliberately: it is a rare, intentional action, better modelled as a real move.

### 4. Permanent ownership strengthens the access boundary
Consistent with [ADR-0036](./adr-0036-context-centric-security.md): the owner is the access boundary. With **permanent** ownership the boundary is stable — access is a check that the requester belongs to the owner, and runtime isolation is "mount only the authorised owner's subtree" (`projects/{id}/…`). Mutable ownership was a faint confused-deputy smell (content that changes hands); permanent ownership removes it. Collaboration is by **owning the storage in the shared context from the start**, or by an access **grant** — never by re-homing.

### 5. GitHub is a reusable repo-attachment, not a property of one entity
Versioning is a capability any storage location can have — a container's `files/` (back up your docs) **or** a `workspace/` (a code repo). So GitHub linkage is a **reusable attachment** targeting a storage location:
- **targets:** `{owner}/files`, **or** a specific `workspace`.
- **holds:** the repo URL + a deploy key; exposes the same connect engine (init-and-push = "Back up to GitHub"; link-and-pull = "Connect repo") and the same Operations (GitHub Actions) surface.

One component, reused across files and workspaces of every owner. (Exact schema — a polymorphic `RepoAttachment` table vs. fields — is a spec decision; the *decision here* is that GitHub is a **shared attachment keyed by a storage target**, never a column bolted onto Project/Product.)

### 6. The wiki dissolves; the "default Workspace" is removed
- **Wiki** is no longer a feature or a type. A product's docs are its `files/`, browsed via the file viewer, optionally backed up to GitHub. The wiki mirror/sync machinery is retired.
- **The default Workspace is removed.** Its role (knowledge home, agent cwd, history) is now `files/` — intrinsic, not an entity; no auto-create-on-project, no unremovable-Workspace special case, no ownership floor for it.

### 7. Surfacing: a Files tab + an owned-Workspaces list
- **Project / Product / Program** each gain a **Files tab** — a file viewer (stubbed initially) over the container's `files/`, the home of its GitHub attachment ("Back up to GitHub"), and selectable as the agent's cwd.
- The container also lists the **Workspaces** it owns; each Workspace keeps its own detail page (Overview / GitHub / Settings).
- A **user** has the same shape: a personal Files area + personal Workspaces.

*(How these compose into screens — e.g. whether a cross-owner Workspaces view exists alongside the per-container tabs — is for the design spec, not this ADR.)*

### 8. Sessions attach to a storage location as cwd; scratch is a subdir
A session's working directory (cwd) is a **storage location**: a container's `files/`, a specific `workspace/`, or — for a general 1:1 chat — the **user's `files/`** (the default). The agent may be granted additional locations, each gated by its owner. **Scratch** is a subdirectory of the active cwd; throwaway builds land there. "Keep this build" copies it into a new `workspace/` under the appropriate owner (§3). Nothing the agent builds orphans — it is always inside an owned, session-tracked location.

### 9. Global surfacing: a workspaces-only top-level page; Files stay per-owner
This resolves the §7 / Open-Question on cross-owner surfacing. There is **one top-level navigation domain, "Workspaces,"** and it lists **only Workspace units** (grouped by owner). An owner's `files/` home is **not** in the global list — Files is reached only through its owner (the project/product/program/user **Files tab** from §7).

The choice follows from what Files and Workspaces actually are:

- **Files = the owner's knowledge home.** Exactly one per owner, intrinsic (exists with the owner, never created or deleted), holds documents/context — `roadmap.md`, `PROJECT.md`, plans, specs, notes. *(Annotated 2026-10-07: `PROJECT.md` is now `AGENTS.md`, the place's instructions every run reads; what is known in the place is its `knowledge/` folder, beside Files.)* No git lifecycle by default (optionally backed up, §5). A project with *no code and no repo* still has Files — it is the unconditional place its roadmap and plans live.
- **Workspace = a build area.** Zero-or-more per owner, created/named/deleted on demand, normally a checkout of a **git repo**, where an agent builds and a session mounts and pushes.

They are the **same storage primitive** (a *location* — `{owner, optional workspaceId}`, as the code already names it: `listLocationFiles`, `resolvePrimaryLocation`), playing **different roles**: Files is the home location for knowledge; a Workspace is a named location for code. Because the role differs on cardinality (1 vs N), lifecycle (intrinsic vs created), content (docs vs code), and repo (none vs central), they stay **distinct concepts in the product**, not one overloaded "workspace" that means both "my docs" and "my codebase."

Why the *global* page is workspaces-only:
- A cross-owner **"all my docs"** index is not useful — `roadmap.md` is inherently owner-scoped; you read a project's docs *from that project*. So Files has **no global index**, only its per-owner tab.
- A cross-owner **"all my workspaces / codebases"** index *is* useful, and every row in it is genuinely a Workspace — so the label **"Workspaces" is exactly true**, with no "is Files a workspace?" ambiguity.

This rejects two alternatives considered: a single umbrella page mixing Files + Workspaces (the label would over- or under-claim — the abandoned "Storage" naming), and collapsing Files into a "Home workspace" (overloads "workspace" and re-introduces the default-Workspace this ADR removed in §6).

### 10. A third storage kind — `tasks/` — and the task-run access model
*(Amendment — surfaced during the runtime-reconciliation walkthrough.)*

A task is autonomous work **on a project**: the agent needs the whole project, and its file output must not pollute the curated `files/` knowledge home. So a project gains a **third storage kind**:
```
projects/{id}/files/                 ← knowledge home (ROADMAP, PROJECT, docs)   [§1]
projects/{id}/workspaces/{wsId}/     ← codebases (runnable units)                 [§1]
projects/{id}/tasks/{taskId}/        ← per-task working files                      [new]
```
`files/` keeps its name (maps 1:1 to the **Files** tab); `workspaces/` and `tasks/` are the other two kinds. "Files / Workspaces / Tasks" is the product vocabulary — three distinct kinds, even though all are files on disk.

**Task-run access (the rule for autonomous task sessions):** a task session is granted the **full project** — `files/` (read roadmap/docs), **all** of its `workspaces/` (the codebases), and its own `tasks/{taskId}/`. The run **cwd = `tasks/{taskId}/`**, so deliberate task output lands in the task's folder, not the knowledge root. This is consistent with §4/the access model: a task is autonomous/agent-bound, so full-project access is correct (unlike a user-driven chat, which stays scoped — multi-user principal-bound access remains deferred).

**Presentation vs storage (per §2):** on disk, `tasks/{taskId}` is keyed by the immutable **task id** (rename-safe). The container/agent-visible path uses the readable **task key** (`/projects/{slug}/tasks/{taskKey}`, e.g. `…/tasks/WEB-42`). Same host-id / container-readable split as §2 — the key is display-only.

This contrasts with a **workspace session** ("start session here") which is scoped to that one workspace (+ the project's `files/` for context), and a **chat** which is scoped to the user's files — i.e. the mounted set is session-type-dependent, decided in one access seam.

*(Annotation, 2026-09-26 — the task-run access model above is superseded by [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md): a container is bound to one storage location, so a task run mounts that location's whole set, which for a project includes its whole `tasks/` root; the mounted set no longer depends on the session type, and the container path no longer uses the readable task key. The `tasks/` storage kind itself stands.)*

### 11. Owner Files + GitHub surfacing parity (product, program)
*(Amendment — surfaced during the surfacing walkthrough.)*

§1 makes `files/` intrinsic to **every** owner (project / product / program / user), and §5 makes GitHub a reusable repo-attachment over any location. §7's Files tab and §9's per-owner surfacing therefore apply to **all** owners, not just projects — a product and a program each get a **Files** tab and a **GitHub** tab, identical to the project's.

This corrects a gap introduced when §6's wiki was removed: the de-wiki step relabelled the product's membership tab ("Wiki Team" → "Team") but never added the Files surface that §6 intended ("product docs *are* the product's files"). A product is not primarily a *members* page; like any owner it leads with its knowledge home (Files) and its repo (GitHub). The Team/membership surface is set aside until the multi-user access model (§4, deferred) — the `ProductMember` model is retained, only the UI tab is removed.

Implementation note (presentation, not a decision): products and programs render through the shared `@agenthix/ui` detail components, so Files/GitHub are added there as **slots** the host app fills with the **same** site-local `FileExplorer` / `RepoPanel` a project uses (both already owner-agnostic via `target = {ownerType, ownerId}`). Provisioning is generalised to `provisionOwnerFiles(ownerType, ownerId, name)`, called on product/program create so the Files home is seeded (a project keeps its richer ROADMAP/PROJECT provisioning). Result: one set of storage components, three owner kinds, identical surfaces.

> ⚠️ **This section describes storage and a function that no longer exist.** *(annotated 2026-09-26)* The function `provisionOwnerFiles` was removed together with product and programme storage and no longer exists; the code has `provisionProjectFiles` (`hq/src/storage/filesService.ts`), called when a project is created and asking the Execution Site to create and seed the project's `files/` home. Nothing provisions a product's or a programme's, because [ADR-0061](adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) removed them as owners of storage — so the Files and GitHub surfaces this section gives them, and the shared-component slots it describes for them, are not a decision that holds. A person's `files/` home is created on the site when first needed, as the note under §1 says. The rest of the record, for projects and users, stands.

## Consequences

### Positive
- **Ownership is legible and permanent** — readable from the path, stable for the access model, no owner-flip confusion.
- **One uniform rule for every owner** — files + workspaces, container or user; no special cases (no lazy personal Workspace, no unremovable default).
- **The wiki disappears as a concept** — fewer moving parts; docs are just files in the viewer, versioned like anything else.
- **GitHub is one reusable component** — files and workspaces share the connect + Operations engine.
- **Rename-safe** — id-keyed dirs; names are labels.
- **Stronger security boundary** — permanent ownership + subtree mounts (ADR-0036).

### Negative
- **Promotion is no longer free** — relocating content is a real copy/move, not a field update.
- **A reset / fresh schema** — the model differs from both `main` and the ADR-0038 branch. Dev is reset (no data worth keeping); production never shipped ADR-0038, so there is no production storage to migrate.
- **More directory hierarchy** — nested paths vs a flat root (and that hierarchy is exactly what makes ownership legible).

### Risks
- **Re-implementation effort** — this supersedes a substantially-built branch. Mitigated by *porting* the carry-forward code (the GitHub connect engine, runtime cwd/mount, file-viewer UI direction) rather than re-deriving it.
- **Copy/move-files is now load-bearing** for any cross-owner relocation; it must exist before promotion-like flows are usable.

## Open Questions
- **Copy/move-files UX + mechanics** — selection, conflict handling, whether move deletes the source.
- **`RepoAttachment` data model** — polymorphic target table vs. per-location fields (spec decision).
- **File-viewer scope** for the first cut (read-only render of md/code/images; download others) — already roadmapped (Phase 8/10).
- **Scratch lifecycle** — when/whether to sweep old session scratch (carried from ADR-0038).
- **Concurrency for same-path writes** — file-grained, mechanism deferred (carried from ADR-0038).

## References
- [ADR-0038 — Workspace as the Storage Entity](./adr-0038-workspace-as-storage-entity.md) — **superseded by this ADR.** Its build remains on `feature/workspace-storage-entity` (unmerged) as reference.
- [ADR-0036 — Context-Centric Security](./adr-0036-context-centric-security.md) — the owner is the access boundary; permanent ownership + subtree mounts.
- [ADR-0037 — Connectors, Environments, and Approved Workflows](./adr-0037-connectors-environments-and-scripts.md) — the GitHub/Operations surface, now a reusable attachment.
