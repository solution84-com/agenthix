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

**Templates** are curated starting points. They are authored once and applied many times to spin up a fresh workforce from nothing. A template is a Library asset ([the Library](../library/library.md)): it carries every skill its agents need, and those skills are installed once and shared by every agent that has them. Templates have no concept of current state — they describe what to create, not what exists.

A team template exports and imports as a `team` package ([the Library](../library/library.md#self-contained-packages)): the template itself, not the workforce it made.

### Not built: exporting a live workforce

There is no export of a live workforce — a snapshot of the agents, teams, projects and individually customised skills as they are now. If one is built, it is a different feature from templates and should not share their format: such an export would have to embed each agent's skills, because they may have diverged from any template, and it would be for portability and backup rather than a starting point.

---

## Where templates live in the UI

Templates are browsed from the **Library** page (`/library`) as its **Teams** tab, alongside Agents, Task templates and Skills.

When an agent proposes a template (via the `propose_workforce_template` MCP tool), a notification goes to the organisation's admins, with a link to the review page; it is also among Needs attention on the **Organisation** page (`/org`).

---

## File format

A team template is a package ([the Library](../library/library.md#self-contained-packages)) holding a `team.json`, an `agents/<handle>/agent.json` for each agent, and the skills its agents need under `skills/`. Agenthix's templates ship in hq's image as `agenthix/<name>` and are installed when hq starts. An organisation's own come from adding a `team` package from an upload or a link; there is no way to make one inside the app. The package is checked like any other asset ([installing](../library/installing.md)).

Application selections, which agents, teams, projects and skills to include and each agent's resolved handle, are not a file and cannot be downloaded or re-uploaded: a proposal keeps them on the task row (see "Application selections" below).

The task (for agent-initiated flow) keeps the template and the review selections in its `applicationData` column; the description stays human-readable prose with a link to the review page.

```json
{
  "name": "Solo Developer",
  "description": "Minimal footprint — one dev agent and one QA agent to validate work.",
  "tags": ["software", "solo", "startup"],
  "teams": [{ "name": "Engineering", "purpose": "Build and validate software features", "agents": ["dev", "qa"] }],
  "projects": [
    { "name": "Main", "description": "Primary development project", "defaultAgentHandle": "dev",
      "boards": [{ "name": "Work", "template": "kanban" }] }
  ]
}
```

`teams[].agents` are handles; each agent's settings are in `agents/<handle>/agent.json` (`name`, `role`, `responsibilities`, `approval`, `allowedTools`, `allowedBashPatterns`, and `skills`, a list of the skill folders it has). A project's board names a board template by name (`kanban`, `sprint`, `issues`, `ideation`, `roadmap`). A team holds agents only: people are added after, and a template that names people is refused. One team per agent is enforced by structure.

---

## Skills in templates

A template is self-contained: its package carries each skill its agents need. Agenthix's build copies each skill into every template that uses it from one source, so the same skill is not kept twice by hand.

When a template is first used, the skills it carries are **installed** as assets under the template's publisher (matched by identity, so one the organisation already has is reused, a newer one is offered as an update and one an administrator removed stays removed). Each agent is then **given** the skills the template names for it. Nothing is copied into the agent: an agent's skills are installed assets that it has, pinned and updated like any other ([library skills](../library/skills.md)). Boot installs the template, never the skills it carries, so a new organisation's Library holds only what has been used.

A run stages each as `agent-<name>` or `org-<name>`; the sources are in [skills](../skills/skills.md#names).

### Review page

Each agent row on the review checklist is expandable. Skills appear nested under their agent, each with its own `include` toggle. Deselecting a skill leaves the agent without it but does not affect the agent itself. The selections carry `include` flags at the skill level, matching the pattern used for agents, teams, and projects.

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
2. Server creates a task on the **Workforce Assembly** board (the one board hq keeps for this) in its *In review* column
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

Five ship in hq's image. Each skill is a shelf skill ([library skills](../library/skills.md#the-shelf)).

| Template | Teams and agents | Projects and boards | Skills |
|---|---|---|---|
| **Solo Developer** `agenthix/solo-dev` | Engineering: `dev`, `qa` | Main: Kanban | `dev-code-quality`, `qa-test-planning`, `qa-bug-reporting` |
| **Dev Team** `agenthix/dev-team` | Engineering: `lead-dev`, `dev`, `qa`. Product: `pm` | Product: Sprint Board. Ops: Issue Tracker | `dev-code-review`, `dev-code-quality`, `qa-test-planning`, `qa-bug-reporting`, `pm-backlog-management`, `pm-sprint-planning` |
| **AI Startup** `agenthix/ai-startup` | Engineering: `frontend`, `backend`, `qa`, `docs`. Product: `pm` | Product Development: Sprint Board. Documentation: Kanban. Internal Ops: Issue Tracker | `dev-ui-development`, `dev-api-development`, `qa-test-planning`, `qa-bug-reporting`, `technical-writing`, `pm-backlog-management`, `pm-stakeholder-comms` |
| **Content Studio** `agenthix/content-studio` | Content: `strategist`, `writer`, `editor`, `seo` | Content Pipeline: Kanban | `editorial-planning`, `content-writing`, `content-review`, `seo-research` |
| **Research Lab** `agenthix/research-lab` | Research: `research-lead`, `analyst`, `docs` | Active Research: Ideation. Published Work: Kanban | `research-methodology`, `data-analysis`, `research-reporting` |

Every agent also has the built-in skills. A template names no git skill: `working-with-git` is built in.

---

## Canonical agent role assets

Agent role definitions live in hq's image as agent templates, installed as `agenthix/<name>` when hq starts (see [agent templates](../library/agent-templates.md)). Each has a full `agent.json` config (permissions, model, approval, bash patterns), `instructions.md` and skills as proper `SKILL.md` files. Applying one creates the agent with those settings and that content.

Current canonical roles:
- **Kernel** — built-in orchestrator; seeded at server startup, not importable
- **Product Manager** — owns vision, brief, and strategic roadmap
- **Project Manager** — translates roadmap into sprint plans and task assignments
- **Skills Engineer** — observes work patterns and codifies them into reusable skills
- **Wasp Developer** — implements features in a Wasp/React/Prisma codebase
- **QA** — verifies completed tasks against acceptance criteria

They are applied from the Library's agent templates tab; an agent can also be exported and imported as an archive. Workforce templates that overlap (e.g., Solo Developer includes a developer and QA agent) define their own inline agents that are shallower than the canonical role assets.

---

## Decisions

- **Template source** — a team template is an asset in the Library, a package installed from hq's image or added from outside, with a pinned version ([the Library](../library/library.md)). What a team made from it is, is its own and never follows the template's later versions.
- **Application selections** — Held in `Task.applicationData` on the task row (`hq/schema.prisma`), never in a file and never served over `/files/task/`. The proposal writes the template there (`proposeWorkforceTemplateOp`, `hq/src/server/controlplane/workforceOps.ts`); the template content is read back from the Library's pinned version. The original decision — a write-once `application.json` under the task's attachments — was not built; the two entries below are what the code does. An organisation's own templates come only from importing a `team` package; none can be made inside the app.
- **Draft selections** — Stored in `Task.applicationData.draftSelections` (mutable). The review page writes here when the user clicks "Save Progress". The kernel can read them via `get_task_details`.
- **Confirmed selections** — Stored in `Task.applicationData.confirmedSelections` after the user clicks "Confirm". The `confirmWorkforceTemplate` action (an organisation admin's) applies the template, stores these and moves the task to done; no run is queued.
- **Agents embedded in teams** — `AgentSpec` lives inside `TeamSpec`, not at the top level. This enforces the one-team-per-agent constraint by structure: an agent physically exists inside one team and cannot appear in two. Top-level agent arrays would allow the same handle to be referenced by multiple teams with no structural prevention.
- **Handle collisions** — surfaced on the review page before apply. Each collision shows a proposed suffix (`dev` → `dev-1`); the user can accept it, enter a custom handle, or deselect the agent. Apply is blocked until all collisions are resolved. All downstream references within the selections (project `defaultAgentHandle`, team membership) are updated to the resolved handle. No silent renames.
- **Partial apply** — users deselect individual agents, teams, projects, or skills on the review page. The review page keeps the `include` flags in its selections and saves them to `Task.applicationData.draftSelections`. Deselecting a team excludes all its agents. Individual agents within an included team can still be toggled independently.
- **Apply surface** — Library page for user-initiated (synchronous). `propose_workforce_template` MCP tool for agent-initiated (async, review-gated). Both converge on the same review page.
- **Task description** — human-readable prose only, with a link to the review page. No structured data in the description so users cannot corrupt the payload by editing.
- **Nothing runs on its own** — an agent has no schedule of its own, so a newly created agent does nothing until a person starts work for it or turns on a project's automation ([automation.md](../tasks/automation.md)).
- **Skills are carried, then installed** — a template's package carries the skills its agents need so it is self-contained and portable across organisations and instances. They are installed as assets when the template is first used, and each agent is given its own; nothing is written into an agent's own content.
- **Skills are optional per-agent** — `skills` is an optional array on `AgentSpec`. An agent without skills is valid. Users can deselect individual skills on the review page without affecting the agent.
