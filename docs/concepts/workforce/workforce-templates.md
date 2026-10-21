# Workforce Templates

Workforce templates are pre-packaged team configurations that let users stand up a working team in one action instead of building agents, teams, and projects from scratch. They lower the barrier to getting started and make it practical to test the platform quickly.

Templates are additive and reusable — they can be applied to any org, multiple times, to spin up different team structures for different purposes.

---

## Why workforce templates exist

The conversation-driven assembly flow works well once you know what you want, but it is friction-heavy when you just want to see the platform running with real agents. Templates solve this:

- **Speed** — apply a template and have a full workforce in seconds
- **Discoverability** — templates show users what a good team structure looks like
- **Repeatability** — useful for testing, demos, and fresh environments
- **Starting point** — templates are a floor, not a ceiling; users customise after applying

---

## Templates are not a snapshot of a workforce

**Templates** are curated starting points. They are authored once and applied many times to spin up a fresh workforce from nothing. Skills live as separate SKILL.md files alongside the template definition so common skills (e.g. `git-workflow`) are defined once and referenced by multiple agents without duplication. Templates have no concept of current state — they describe what to create, not what exists.

A team template exports and imports as a `team` package ([library.md](../library/library.md#packages-source-version-and-publisher)): the template itself, not the workforce it made.

### Not built: exporting a live workforce

There is no export of a live workforce — a snapshot of the agents, teams, projects and individually customised skills as they are now. If one is built, it is a different feature from templates and should not share their format: such an export would have to embed each agent's skills, because they may have diverged from any template, and it would be for portability and backup rather than a starting point.

---

## Where templates live in the UI

Templates are browsed from the **Library** page (`/library`) as its **Teams** tab, alongside Agents, Boards and Skills.

When an agent proposes a template (via the `propose_workforce_template` MCP tool), a notification goes to the organisation's admins, with a link to the review page; it is also among Needs attention on the **Organisation** page (`/org`).

---

## File format

A template is a directory bundle: a `template.json`, `agents/<handle>/agent.json` and a shared `skills/` pool. Bundled templates live in hq's `assets/library/workforce/<slug>/`. An organisation's own templates come only from importing a `team` package, which stores the bundle in hq's storage at `org/teams/<id>`; there is no way to make one inside the app — the Library's **New team…** goes to Organisation › Teams, which makes a team, not a template.

Application selections — which agents, teams, projects and skills to include, and each agent's resolved handle — are not a file and cannot be downloaded or re-uploaded: a proposal keeps them on the task row (see "Application selections" below).

The task (for agent-initiated flow) keeps the template id and the review selections in its `applicationData` column; the description stays human-readable prose with a link to the review page.

```typescript
interface WorkforceTemplate {
  id: string               // stable slug, e.g. "wft-solo-dev"
  name: string
  description: string
  tags: string[]           // e.g. ["software", "solo", "startup"]
  teams: TeamSpec[]
  projects: ProjectSpec[]
}

interface TeamSpec {
  name: string
  purpose: string
  agents: AgentSpec[]      // embedded — one team per agent enforced by structure
}

interface AgentSpec {
  handle: string           // unique within template; suffixed if collision at apply time
  name: string
  role: string
  responsibilities: string
  defaultModel?: string    // falls back to the runtime's default model
  skills?: AgentSkillSpec[] // embedded at apply time → files in the agent's package content
}

interface AgentSkillSpec {
  slug: string             // directory name, e.g. "git-workflow"
  name: string
  description: string
  content: string          // raw SKILL.md body (no frontmatter — written by apply)
}

interface ProjectSpec {
  name: string
  description: string
  defaultAgentHandle?: string  // resolved across all teams at apply time
  boards: BoardSpec[]
}

interface BoardSpec {
  name: string
  templateId: string       // board template slug, e.g. "sys-tpl-0002-sprint"
}
```

---

## Skills in templates

### Why embedded, not referenced

An agent's skills are part of its package content (ADR-0072), held by hq — not files on a site's disk. On apply they are written into the agent's content as `skills/{slug}/SKILL.md` and staged for every run of that agent.

Referencing library skills by slug would also break template portability — a slug that exists in one org's library may not exist in another. Templates are designed to be self-contained and shareable across instances.

**Decision: skills are always embedded in the template bundle.** The content travels with the template and is written into the agent's package content on apply.

### Apply-time behaviour

For each `AgentSpec` that includes skills, the apply step adds these files to the agent's package content:

```
skills/{slug}/SKILL.md
```

The file carries standard SKILL.md frontmatter synthesised from `name` and `description`, followed by `content`. A run loads the agent's current content, so it picks these up on its next run.

Skills in a template are agent-source skills and therefore present in every run of that agent. Each source is staged under its own name (`agent-<slug>`, `org-<slug>`, `platform-<slug>`, `boundary-<slug>`, `shared-<slug>`), so a skill from another source with the same slug is available beside it and does not replace it.

### Review page

Each agent row on the review checklist is expandable. Skills appear nested under their agent, each with its own `include` toggle. Deselecting a skill skips writing that SKILL.md at apply time but does not affect the agent itself. The selections carry `include` flags at the skill level, matching the same pattern used for agents, teams, and projects.

---

## Handle collisions

When the review page loads it checks every agent handle in the template against existing handles in the org. Each collision is surfaced inline — the user is never surprised by a silent rename.

For each colliding handle the review page shows:
- A collision badge on the agent row
- The proposed suffix (`dev` → `dev-1`, `dev-2`, etc.)
- An editable handle field — the user can accept the suffix, type a custom handle, or deselect the agent entirely

Apply is blocked until every collision is resolved. Once resolved, all downstream references within the same selections that pointed to the original handle (e.g. `defaultAgentHandle` on a project, team membership) are updated to the resolved handle before the apply runs. No cross-application state is touched.

Applying the same template twice to the same org will always produce a collision for every agent. The review page treats this as a normal case — the user sees the proposed suffixes for all agents and can decide whether to proceed or cancel.

---

## Two application paths

### Path 1 — User-initiated (synchronous)

1. A person opens Organisation › Library › Teams
2. Selects a template → navigates to the review page
3. Review page renders the full checklist (agents, teams, projects)
4. User deselects items they don't want, clicks **Apply**
5. Entities are created immediately; user is redirected to `/org`

No task is created. The apply action is synchronous: the `applyWorkforceTemplate` action creates the agents, teams, projects and boards itself, writing each agent's settings to its record and its instructions and skills to its package.

### Path 2 — Agent-initiated (async, review-gated)

1. Kernel calls `propose_workforce_template(templateId, reason)` via MCP
2. Server creates a task on the **Workforce Assembly** board in its *In review* column (status in progress)
3. A notification reaches the admins, and Needs attention on `/org` lists it: *"Kernel proposed Dev Team template · Review"*
4. User clicks through to the review page (rendered from the task)
5. User adjusts selections, clicks **Confirm & Apply** (an org admin)
6. The template is applied exactly as applying it from the library does, the confirmed selections are stored on the task, and the task moves to `done`. No run is queued: the task records the decision, it is not work for an agent. If applying fails, the task stays in review and the page shows the error; a proposal cannot be confirmed twice

---

## Application selections

When a template is proposed by the kernel, **no application file is written**. The proposal stores the template id on the task row itself, in the `applicationData` JSON column (`Task.applicationData` in `hq/schema.prisma`, written by `proposeWorkforceTemplateOp` in `hq/src/server/controlplane/workforceOps.ts`), and the review page writes its selections into the same column beside it. Nothing about an application is served over `/files/task/`: that route serves a task's own attachments, and it requires both a signed-in session and membership of the task's project (`getTaskFile`, `hq/src/server/fileServingHandlers.ts`). What `applicationData` holds beside the template id is `ApplicationSelections` — `{ teams, projects }`, with each agent carrying `handle`, `resolvedHandle`, `include` and `skills: { slug, include }` (`hq/src/library/workforceTemplateTypes.ts`).

Mutable state (the user's in-progress review selections) is kept in React state on the review page. "Save Progress" persists the current selections to `Task.applicationData.draftSelections`. "Confirm" sends the final selections to the `confirmWorkforceTemplate` action, which applies the template, stores them in `Task.applicationData.confirmedSelections` and moves the task to done; nothing is queued for the kernel.

If a team is deselected (`include: false`), its agents are excluded from apply. Individual agents within an included team can still be toggled independently.

Before this, the design was a write-once application file under the task's attachments, written back by the review page and read by an agent that carried out the apply; it was never built, and the selections on the task row replaced it.

---

## Bundled templates

### 1 · Solo Developer `wft-solo-dev`

Minimal footprint — one dev agent and one QA agent to validate work.

| Entity | Details |
|--------|---------|
| **Engineering Team** | |
| → Dev | `handle: dev` · writes code, runs tests, commits via git |
| → QA | `handle: qa` · reviews PRs, writes test plans, files bug reports |
| **Main Project** | Kanban board |

**Skills per agent:**

| Agent | Skill | Description |
|-------|-------|-------------|
| dev | `git-workflow` | Clone a repo, work on a feature branch per task, commit, push, and open a PR |
| dev | `code-quality` | Write tests alongside implementation, lint before committing, check for obvious issues |
| qa | `test-planning` | Write test plans covering happy path, edge cases, and regression for a given change |
| qa | `bug-reporting` | File structured bug reports with repro steps, expected vs actual, and severity |

```
Agents: 2  ·  Teams: 1  ·  Projects: 1  ·  Boards: 1  ·  Skills: 4
```

---

### 2 · Dev Team `wft-dev-team`

A small software product team. Most useful for testing the full task → review → done cycle.

| Entity | Details |
|--------|---------|
| **Engineering Team** | |
| → Lead Developer | `handle: lead-dev` · architecture decisions, code review, complex features |
| → Developer | `handle: dev` · feature implementation, bug fixes |
| → QA Engineer | `handle: qa` · test plans, regression, release sign-off |
| **Product Team** | |
| → Product Manager | `handle: pm` · owns the backlog, writes specs, prioritises work |
| **Product Project** | Sprint board |
| **Ops Project** | Issue tracker |

**Skills per agent:**

| Agent | Skill | Description |
|-------|-------|-------------|
| pm | `backlog-management` | Write specs, groom and prioritise the backlog, keep tasks well-defined |
| pm | `sprint-planning` | Plan sprint scope, break epics into tasks, communicate capacity |
| lead-dev | `git-workflow` | Clone a repo, work on a feature branch per task, commit, push, and open a PR |
| lead-dev | `code-review` | Review PRs for correctness, architecture fit, and test coverage; leave actionable feedback |
| dev | `git-workflow` | Clone a repo, work on a feature branch per task, commit, push, and open a PR |
| dev | `code-quality` | Write tests alongside implementation, lint before committing, check for obvious issues |
| qa | `test-planning` | Write test plans covering happy path, edge cases, and regression for a given change |
| qa | `bug-reporting` | File structured bug reports with repro steps, expected vs actual, and severity |

```
Agents: 4  ·  Teams: 2  ·  Projects: 2  ·  Boards: 2  ·  Skills: 8
```

---

### 3 · AI Startup `wft-ai-startup`

Full development lifecycle — frontend, backend, QA, docs. Closer to a real company structure.

| Entity | Details |
|--------|---------|
| **Engineering Team** | |
| → Frontend Developer | `handle: frontend` · UI, design system, user-facing features |
| → Backend Developer | `handle: backend` · APIs, data models, integrations |
| → QA Engineer | `handle: qa` · automated tests, quality gates, regression |
| **Product Team** | |
| → Product Manager | `handle: pm` · strategy, roadmap, stakeholder communication |
| → Technical Writer | `handle: docs` · changelogs, API docs, internal guides |
| **Product Development** | Sprint board |
| **Documentation** | Kanban board |
| **Internal Ops** | Issue tracker |

**Skills per agent:**

| Agent | Skill | Description |
|-------|-------|-------------|
| pm | `backlog-management` | Write specs, groom and prioritise the backlog, keep tasks well-defined |
| pm | `stakeholder-comms` | Write status updates, maintain the roadmap, communicate scope changes clearly |
| frontend | `git-workflow` | Clone a repo, work on a feature branch per task, commit, push, and open a PR |
| frontend | `ui-development` | Build components that follow the existing design system; prefer composition over custom styles |
| backend | `git-workflow` | Clone a repo, work on a feature branch per task, commit, push, and open a PR |
| backend | `api-development` | Design RESTful endpoints, keep data models normalised, document changes |
| qa | `test-planning` | Write test plans covering happy path, edge cases, and regression for a given change |
| qa | `bug-reporting` | File structured bug reports with repro steps, expected vs actual, and severity |
| docs | `technical-writing` | Write changelogs, API docs, and internal guides in plain language; keep docs close to the code |

```
Agents: 5  ·  Teams: 2  ·  Projects: 3  ·  Boards: 3  ·  Skills: 9
```

---

### 4 · Content Studio `wft-content-studio`

Editorial workflow — any team where the primary output is written content.

| Entity | Details |
|--------|---------|
| **Content Team** | |
| → Content Strategist | `handle: strategist` · editorial calendar, topic research, briefs |
| → Writer | `handle: writer` · drafts articles, scripts, copy |
| → Editor | `handle: editor` · reviews drafts, tone/quality, final sign-off |
| → SEO Researcher | `handle: seo` · keyword research, optimisation recommendations |
| **Content Pipeline** | Kanban board |

**Skills per agent:**

| Agent | Skill | Description |
|-------|-------|-------------|
| strategist | `editorial-planning` | Maintain the editorial calendar, write content briefs, research topics and angles |
| writer | `content-writing` | Draft articles and copy from briefs; match the brand voice; structure for readability |
| editor | `content-review` | Review drafts for tone, clarity, factual accuracy, and brand alignment; approve or return with notes |
| seo | `seo-research` | Research keywords, assess search intent, and recommend on-page optimisations for drafts |

```
Agents: 4  ·  Teams: 1  ·  Projects: 1  ·  Boards: 1  ·  Skills: 4
```

---

### 5 · Research Lab `wft-research-lab`

Investigative work — research teams, data science, academic contexts.

| Entity | Details |
|--------|---------|
| **Research Team** | |
| → Research Lead | `handle: research-lead` · defines research questions, reviews findings |
| → Data Analyst | `handle: analyst` · queries, models, visualisations |
| → Technical Writer | `handle: docs` · research reports, methodology docs |
| **Active Research** | Ideation board |
| **Published Work** | Kanban board |

**Skills per agent:**

| Agent | Skill | Description |
|-------|-------|-------------|
| research-lead | `research-methodology` | Frame research questions, define scope, review findings for validity and coherence |
| analyst | `data-analysis` | Write queries, build models, produce clear visualisations with stated assumptions |
| docs | `research-reporting` | Write research reports and methodology docs; make findings accessible to non-technical readers |

```
Agents: 3  ·  Teams: 1  ·  Projects: 2  ·  Boards: 2  ·  Skills: 3
```

---

## Canonical agent role assets

Agent role definitions live in hq's `assets/library/agents/<slug>/` and are seeded into the `AgentTemplate` table at startup (see [agent-templates.md](../library/agent-templates.md)). Each has a full `agent.json` config (permissions, model, approval, bash patterns), `instructions.md` and skills as proper `SKILL.md` files. Applying one creates the agent with those settings and that content.

Current canonical roles:
- **Kernel** — built-in orchestrator; seeded at server startup, not importable
- **Product Manager** — owns vision, brief, and strategic roadmap
- **Project Manager** — translates roadmap into sprint plans and task assignments
- **Skills Engineer** — observes work patterns and codifies them into reusable skills
- **Wasp Developer** — implements features in a Wasp/React/Prisma codebase
- **QA** — verifies completed tasks against acceptance criteria

They are applied from the Library's agent templates tab; an agent can also be exported and imported as an archive. Workforce templates that overlap (e.g., `wft-solo-dev` includes a developer and QA agent) define their own inline agents that are shallower than the canonical role assets.

---

## Decisions

- **Template source** — directory bundles in hq's `assets/library/workforce/<slug>/`. Seeded into the DB on startup (`ensureWorkforceTemplates()`), same pattern as board templates.
- **Application selections** — Held in `Task.applicationData` on the task row (`hq/schema.prisma`), never in a file and never served over `/files/task/`. The proposal writes `templateId` there (`proposeWorkforceTemplateOp`, `hq/src/server/controlplane/workforceOps.ts`); the template content itself stays in the seeded `WorkforceTemplate` row and is read back from it (`hq/src/library/queries.ts`). The original decision — a write-once `application.json` under the task's attachments — was not built; the two entries below are what the code does. An organisation's own templates come only from importing a `team` package; none can be made inside the app.
- **Draft selections** — Stored in `Task.applicationData.draftSelections` (mutable). The review page writes here when the user clicks "Save Progress". The kernel can read them via `get_task_details`.
- **Confirmed selections** — Stored in `Task.applicationData.confirmedSelections` after the user clicks "Confirm". The `confirmWorkforceTemplate` action (an organisation admin's) applies the template, stores these and moves the task to done; no run is queued.
- **Agents embedded in teams** — `AgentSpec` lives inside `TeamSpec`, not at the top level. This enforces the one-team-per-agent constraint by structure: an agent physically exists inside one team and cannot appear in two. Top-level agent arrays would allow the same handle to be referenced by multiple teams with no structural prevention.
- **Handle collisions** — surfaced on the review page before apply. Each collision shows a proposed suffix (`dev` → `dev-1`); the user can accept it, enter a custom handle, or deselect the agent. Apply is blocked until all collisions are resolved. All downstream references within the selections (project `defaultAgentHandle`, team membership) are updated to the resolved handle. No silent renames.
- **Partial apply** — users deselect individual agents, teams, projects, or skills on the review page. The review page keeps the `include` flags in its selections and saves them to `Task.applicationData.draftSelections`. Deselecting a team excludes all its agents. Individual agents within an included team can still be toggled independently.
- **Apply surface** — Library page for user-initiated (synchronous). `propose_workforce_template` MCP tool for agent-initiated (async, review-gated). Both converge on the same review page.
- **Task description** — human-readable prose only, with a link to the review page. No structured data in the description so users cannot corrupt the payload by editing.
- **Nothing runs on its own** — an agent has no schedule of its own, so a newly created agent does nothing until a person starts work for it or turns on a project's automation ([automation.md](../tasks/automation.md)).
- **Skills are embedded, not referenced** — skill content is carried in the template bundle. Embedding keeps templates self-contained and portable across orgs and instances. At apply time, each `AgentSkillSpec` becomes `skills/{slug}/SKILL.md` in the agent's package content. The review page exposes per-skill `include` toggles nested under each agent.
- **Skills are optional per-agent** — `skills` is an optional array on `AgentSpec`. An agent without skills is valid. Users can deselect individual skills on the review page without affecting the agent.
