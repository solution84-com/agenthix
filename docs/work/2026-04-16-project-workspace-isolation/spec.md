---
title: Project & Product Workspace Isolation
date: 2026-04-16
branch: feature/project-workspace-isolation
---

## Overview

Three related changes shipped together:

1. **Wiki repo naming** — rename convention from `wiki-<product-slug>` to `<product-slug>-wiki` so product repos sort consistently on GitHub.
2. **Product directory structure** — products get a proper shared directory (`site/products/<slug>/`) with the wiki nested inside (`site/products/<slug>/wiki/`). This replaces the flat `site/wiki/<slug>/` layout and leaves room for future product-level content alongside the wiki.
3. **Per-project/product volume mounting** — agents currently share a single `/wiki` bind-mount giving every agent access to every product's wiki. This replaces it with scoped mounts: each agent container sees only the product and project directories for the memberships it holds.

---

## Background

### Current state

`AgentContainerManager._start()` mounts the entire wiki directory for every agent:

```
-v ${siteHostPath}/wiki:/wiki:rw
```

Every agent can read and write every product's wiki regardless of membership. Project workspace directories (`site/projects/<id>`) are not mounted at all — project context is injected into the system prompt using the host-side path, which does not resolve inside the container.

### Goals

- Agents see only the product and project directories they are members of.
- Products get a proper shared directory with the wiki nested inside — room for future product-level content without new infrastructure.
- Project workspace directories are mounted into containers so agents can read ROADMAP.md, PROJECT.md, and collaborate directly on the shared project surface.
- Container remounts happen safely — never mid-execution.
- Both products and projects are identified by human-readable slugs, not UUIDs.

---

## Design

### 1. Schema changes

**`Agent` model** — one new field:

```prisma
volumeRemountPending Boolean @default(false)
```

Set to `true` whenever the agent's project or product membership changes. Cleared to `false` by the run-time container preparation step immediately before execution. This is a generic "container config is stale — rebuild before next run" signal. Future volume types (credential rotations, new skill mounts, etc.) can reuse the same flag.

**`Project` model** — one new field:

```prisma
slug String @unique
```

Auto-generated from the project name on creation (same pattern as `Product.slug`). Used as the filesystem directory name for project workspaces, replacing the current UUID-based naming.

The Prisma migration adds the column as `String? @unique` (nullable) to avoid failing on existing rows. Existing project workspace directories are not renamed — clean slate is acceptable at this stage. Existing projects without a slug will have null until they are recreated or manually backfilled.

---

### 2. Host filesystem layout and container mount mapping

**Host layout (`AGENT_SITE_PATH`)**

```
${AGENT_SITE_PATH}/
├── agents/
│   └── <agent-handle>/
│       ├── workspace/              ← agent's own working directory
│       │   ├── .private/           ← identity, memory, skills
│       │   └── ...
│       └── home/
│           └── .claude/            ← per-agent OAuth credentials
├── products/
│   └── <product-slug>/             ← one directory per product
│       ├── wiki/                   ← cloned wiki repo (was: site/wiki/<slug>)
│       └── ...                     ← room for future product-level content
├── projects/
│   └── <project-slug>/             ← one directory per project
│       ├── ROADMAP.md
│       ├── PROJECT.md
│       └── history/
├── assets/                         ← platform assets (skills, templates) — read-only
├── shared/                         ← org-level shared files — read-only
└── secrets/
    └── .claude/                    ← platform OAuth credential source (never mounted into agents)
```

The previous `site/wiki/` directory is removed. Wiki content moves to `site/products/<slug>/wiki/`.

**Per-agent container mounts**

Each container receives only the product and project directories for the agent's own memberships. An agent that is a member of `product-a` and `project-x` — and nothing else — gets exactly:

```
docker run \
  -v ${AGENT_SITE_PATH}/agents/<handle>/workspace:/workspace                \
  -v ${AGENT_SITE_PATH}/agents/<handle>/home/.claude:/home/appuser/.claude  \
  -v ${AGENT_SITE_PATH}/assets:/assets:ro                                   \
  -v ${AGENT_SITE_PATH}/shared:/shared:ro                                   \
  -v ${AGENT_SITE_PATH}/products/product-a:/products/product-a:rw           \
  -v ${AGENT_SITE_PATH}/projects/project-x:/projects/project-x:rw          \
  ...
```

**Container filesystem (agent's view)**

What the agent above actually sees inside its container:

```
/
├── workspace/                        ← agent's own private working directory
│   ├── .private/                     ← identity, memory, skills
│   └── ...
├── home/appuser/.claude/             ← agent's own OAuth credentials
├── assets/                           ← platform assets, read-only
├── shared/                           ← org shared files, read-only
├── products/
│   └── product-a/                    ← ONLY this product (agent is a member)
│       └── wiki/                     ← cloned wiki repo, read-write
├── projects/
│   └── project-x/                    ← ONLY this project (agent is a member)
│       ├── ROADMAP.md
│       ├── PROJECT.md
│       └── history/
└── ...                               ← container OS, installed tools
```

A different agent — member of `product-b` and `project-y` — sees a completely different set:

```
/
├── workspace/                        ← its own workspace
├── products/
│   └── product-b/                    ← different product
│       └── wiki/
├── projects/
│   └── project-y/                    ← different project
└── ...
```

`/products/product-a` and `/projects/project-x` do not exist in this second container at all — not read-only, not empty, simply absent. An agent with no memberships gets no `/products` or `/projects` mounts at all.

---

### 4. `AgentMounts` type and `AgentContainerManager`

A new shared type captures what a container should see:

```ts
interface AgentMounts {
  products: { id: string; slug: string }[]
  projects: { id: string; slug: string }[]
}
```

Both sides are fully symmetric — both keyed by slug, both mounted at a predictable container path. `_start` builds mount args identically for both:

```

# products (one per membership) — wiki at /products/<slug>/wiki inside
-v ${siteHostPath}/products/<product-slug>:/products/<product-slug>:rw

# projects (one per membership)
-v ${siteHostPath}/projects/<project-slug>:/projects/<project-slug>:rw
```

Both are `:rw`. Product directories are writable so agents can push wiki changes back and write future product-level content. Project workspaces are shared collaboration surfaces — agents can work directly in them (concurrency handled via git worktrees) or clone to their own workspace.

`WorkspaceService.getProjectWorkspaceDir` signature changes from `(projectId: string)` to `(projectSlug: string)`. The directory on disk becomes `site/projects/<slug>`.

`wikiMirrorService.ts` path functions update to reflect the new product directory structure:
- `getWikiMirrorDir(slug)` → `site/products/<slug>/wiki` (was `site/wiki/<slug>`)
- `getAgentWikiDir(slug)` → `/products/<slug>/wiki` (was `/wiki/<slug>`)

---

### 5. Membership event hooks

Four mutation points in the service layer set `volumeRemountPending = true` on the affected agent after the membership change:

| File | Function | Event |
|---|---|---|
| `productMemberService.ts` | `addProductMember` | agent added to product |
| `productMemberService.ts` | `removeProductMember` | agent removed from product |
| `projectService.ts` | `addAgentToProject` | agent added to project |
| `projectService.ts` | `removeAgentFromProject` | agent removed from project |

Application-level detection (not a DB trigger). All membership mutation paths currently flow through these four functions. A DB trigger is noted as a future consideration if membership mutations spread to more code paths (migrations, bulk ops, HQ sync).

The flag is idempotent — setting `true` twice is harmless. No transaction needed: if the flag update fails, the worst case is the next run proceeds with stale mounts, which is the same as the current behaviour.

---

### 6. `prepareAgentContainer` and `RunContext`

Container lifecycle is application logic, not runtime-specific. It is extracted out of `ClaudeSDKRuntime` into a standalone function in `AgentEngine`:

```ts
async function prepareAgentContainer(
  agent: Agent,
  workspaceHostPath: string,
  workspaceContainerPath: string,
): Promise<string | null>  // null when AGENT_CONTAINER_ISOLATION is not set
```

The function is self-contained — it fetches memberships from the DB and builds mounts internally. Callers pass only the agent and workspace paths.

**Sequence when called:**

1. If `AGENT_CONTAINER_ISOLATION` is not set → return `null` (dev mode, no container)
2. Fetch agent memberships from DB (products with slug, projects with slug)
3. Build `AgentMounts` from memberships
4. If `agent.volumeRemountPending`:
   - Stop the container (`agentContainerManager.stop`)
   - Clear the flag in DB (`agent.volumeRemountPending = false`)
5. Call `agentContainerManager.ensureRunning(handle, workspaceHostPath, workspaceContainerPath, mounts)`
6. Return container name

Clearing the flag happens before `ensureRunning` (step 4b before step 5). If the restart fails the run fails and the flag is already cleared — a subsequent run starts fresh rather than retrying a potentially broken remount loop.

**`RunContext`** gains one field:

```ts
containerName?: string  // set when isolation is active
```

**`ClaudeSDKRuntime.runQuery`** reads `context.containerName` directly:

```ts
if (context.containerName) {
  spawnClaudeCodeProcess = buildDockerSpawnFn(context.containerName)
}
```

No membership queries, no `ensureRunning` call, no isolation mode check inside the runtime. `NativeRuntime` ignores `containerName` entirely — no change.

`prepareAgentContainer` is called from `AgentEngine.processRun` after resolving agent context, before calling `runtime.run(context)`.

---

### 7. Project path fix

`TaskRunner` currently builds the roadmap path using the host filesystem path, which does not resolve inside the container. Updated to use the container-side path when isolation is active:

```ts
const roadmapPath = process.env.AGENT_CONTAINER_ISOLATION === 'true'
  ? `/projects/${project.slug}/ROADMAP.md`
  : path.join(WorkspaceService.getProjectWorkspaceDir(project.slug), 'ROADMAP.md')
```

`AgentPromptBuilder` receives the path string and injects it as-is — no changes needed there.

---

### 8. Wiki repo naming fix

Two files, two lines:

**`wikiActions.ts`** — repo creation:
```ts
// before
const repoName = `wiki-${product.slug}`
// after
const repoName = `${product.slug}-wiki`
```

**`gitAccessService.ts`** — deploy key label:
```ts
// before
`agenthix/wiki-${product.slug}`
// after
`agenthix/${product.slug}-wiki`
```

Only affects newly created repos. Existing linked repos are unaffected.

---

## File change surface

| File | Change |
|---|---|
| `schema.prisma` | `Agent.volumeRemountPending`, `Project.slug` |
| `migrations/` | New migration for both fields |
| `src/agents/runtime/AgentContainerManager.ts` | `AgentMounts` type, selective per-slug mounts in `_start`, `ensureRunning` accepts mounts |
| `src/agents/runtime/types.ts` | `containerName` on `RunContext` |
| `src/agents/runtime/AgentEngine.ts` | `prepareAgentContainer` function (fetches memberships, builds mounts, handles remount); called before `runtime.run` |
| `src/agents/runtime/ClaudeSDKRuntime.ts` | Remove container lifecycle logic, read `context.containerName` |
| `src/agents/workspaceService.ts` | `getProjectWorkspaceDir(slug)`, `provisionProjectWorkspace(slug)`; new `getProductDir(slug)` |
| `src/wiki/wikiMirrorService.ts` | `getWikiMirrorDir` → `products/<slug>/wiki`; `getAgentWikiDir` → `/products/<slug>/wiki` |
| `src/agents/TaskRunner.ts` | Container-aware roadmap path, pass project slug |
| `src/wiki/productMemberService.ts` | Set flag on add/remove |
| `src/projects/projectService.ts` | `Project.slug` on create; set flag on add/remove member |
| `src/wiki/wikiActions.ts` | Repo naming fix; wiki dir now under `products/<slug>/wiki` |
| `src/agents/gitAccessService.ts` | Deploy key label fix |
| Tests | Update `AgentContainerManager`, `AgentEngine`, `ClaudeSDKRuntime`, `wikiMirrorService` tests |
