# Workforce Templates

A workforce template is a pre-packaged team configuration — agents, teams, projects, and boards — that stands up a working workforce in one action. Templates are curated starting points, not snapshots of live state.

---

## Source files and seeding

Workforce templates are authored as **self-contained directory bundles** in `assets/library/workforce/<slug>/` and seeded into the `WorkforceTemplate` DB table at startup via `ensureWorkforceTemplates()`. The DB record stores only queryable metadata — `id`, `name`, `description`, `version`, `tags`, `isSystem`, and an `assetPath` pointer. All template content (agents, skills) is read from disk at review and apply time.

```
assets/library/workforce/<slug>/
  template.json          — metadata + structure (teams, agents as handles, projects)
  skills/
    <slug>/SKILL.md      — shared skills pool; agents reference these by slug
  agents/
    <handle>/agent.json  — full runtime config per agent (approval, tools, skills list)
```

The bundle is self-contained: no external slug references, no DB lookups at apply time. `readWorkforceContent()` hydrates the full agent tree from disk.

---

## DB schema

```prisma
model WorkforceTemplate {
  id          String   @id           // stable slug, e.g. "wft-solo-dev"
  name        String
  description String   @default("")
  tags        String[] @default([])
  assetPath   String                 // a bundle folder: "library/workforce/wft-solo-dev", or "org/teams/<id>" for one made here
  isSystem    Boolean  @default(false)
  version     Int      @default(1)
  source         LibrarySource @default(MADE_HERE)   // built in, made here or marketplace
  packageVersion String        @default("1")
  publisher      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

## Bundle format

### `template.json`

```json
{
  "id": "wft-dev-team",
  "name": "Dev Team",
  "description": "A focused development team with a tech lead, developer, QA, and PM.",
  "version": 2,
  "tags": ["development", "engineering"],
  "teams": [
    {
      "name": "Engineering",
      "purpose": "Deliver features and maintain quality",
      "agents": ["lead-dev", "dev", "qa"]
    },
    {
      "name": "Product",
      "purpose": "Define scope and track delivery",
      "agents": ["pm"]
    }
  ],
  "projects": [
    {
      "name": "Development",
      "description": "Feature work and bug fixes",
      "defaultAgentHandle": "lead-dev",
      "boards": [
        { "name": "Sprint Board", "templateId": "sys-tpl-0002-sprint" }
      ]
    }
  ]
}
```

`teams[].agents` is a list of handle strings. `readWorkforceContent()` expands each handle into a full `AgentSpec` by reading `agents/<handle>/agent.json` from the bundle.

### `agents/<handle>/agent.json`

```json
{
  "name": "Lead Developer",
  "role": "Technical lead — architecture decisions, code review, unblocks the team",
  "responsibilities": "Own the architecture. Review all PRs...",
  "defaultModel": "claude-sonnet-5",
  "approval": "deferred",
  "allowedTools": [
    { "name": "read_file", "state": "always" },
    { "name": "bash", "state": "always" }
  ],
  "allowedBashPatterns": [
    { "pattern": "git ", "state": "always" }
  ],
  "skills": ["git-workflow", "code-review", "sprint-planning"]
}
```

`skills` is a list of slug strings referencing `<bundle>/skills/<slug>/SKILL.md`.

### `skills/<slug>/SKILL.md`

```markdown
---
name: Code Review
description: Review PRs for correctness, architecture fit, and test coverage
---

# Code Review
...
```

Skills live at the bundle level (not per-agent) to avoid duplication. Multiple agents in the same bundle can reference the same skill.

---

## System templates

| ID | Name | Agents | Teams | Projects |
|---|---|---|---|---|
| `wft-solo-dev` | Solo Developer | 2 | 1 | 1 |
| `wft-dev-team` | Dev Team | 4 | 2 | 2 |
| `wft-ai-startup` | AI Startup | 5 | 2 | 3 |
| `wft-content-studio` | Content Studio | 4 | 1 | 1 |
| `wft-research-lab` | Research Lab | 3 | 1 | 2 |

---

## Apply paths

### User-initiated

A person opens Organisation › Library › Teams → selects a template → review page → Apply. Entities are created immediately. No task is created.

### Agent-initiated

Kernel calls `propose_workforce_template(templateId, reason)`. A task is created on the Workforce Assembly board. A notification goes to the organisation's admins, and it is among the Organisation page's Needs attention until the proposal is confirmed. User reviews → Confirm. Confirming (an org admin) applies the template exactly as applying it from the library does, stores the confirmed selections on the task and moves it to done — no run is queued, because the task records the decision. If applying fails, the task stays in review and the page shows the error.

Both paths share the same review page.

---

## Review page

The review page renders a full checklist of teams, agents, projects, and boards. Users can:

- Deselect teams, agents, projects, or individual skills before applying
- Resolve handle collisions inline — each collision shows a proposed suffix; user can accept, customise, or deselect
- Apply is blocked until all collisions are resolved

Nothing is created until the user clicks Apply or Confirm.

---

## Related

- [library.md](./library.md) — library overview and file → DB seeding pattern
- [agent-templates.md](./agent-templates.md) — agent templates, which stand alone; a workforce template defines its own agents
- [board-templates.md](./board-templates.md) — board template schema referenced by `templateId`
- [skills.md](../skills/skills.md) — skill sources and how they are staged for each turn
