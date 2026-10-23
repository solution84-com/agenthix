# Agent Templates

An agent template is a complete, reusable role definition — settings, instructions and skills — that can be applied to create a fully configured agent in one action. Applying one creates the agent: its settings on the agent's record, and its instructions and skills as its package content held by hq. A template gives an agent no schedule: an agent never wakes itself, and work that repeats is a [routine](../tasks/routines.md) a person sets up.

---

## Source files and seeding

Agent templates are authored as directories in `assets/library/agents/<slug>/` and seeded into the `AgentTemplate` DB table at startup via `ensureAgentTemplates()`. The DB record stores only metadata — `slug`, `name`, `version`, `handle`, `isSystem`, and an `assetPath` pointer. File contents (`agent.json`, `instructions.md`, skills) are read from hq's assets when a template is applied and become the agent's settings and first content.

```
assets/library/agents/<slug>/
  agent.json          →  read at apply time → agent config
  instructions.md     →  read at apply time → the agent's instructions
  skills/             →  the skills named in agent.json are copied into the agent's package content
```

Seeding: `ensureAgentTemplates()` scans `assets/library/agents/` and upserts `{ slug, name, version, handle, assetPath, isSystem }`. No JSON content is stored in the DB record.

---

## DB schema

```prisma
model AgentTemplate {
  id        String   @id @default(cuid())
  slug      String   @unique        // stable identifier, e.g. "wasp-developer"
  name      String
  version   Int
  handle    String                  // suggested default handle
  assetPath String                  // relative path under assets root — e.g. "library/agents/wasp-developer"
  isSystem  Boolean  @default(true)
  source         LibrarySource @default(MADE_HERE)   // built in, made here or marketplace
  packageVersion String        @default("1")
  publisher      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

All content (agent config, instructions, skills) is read from the `assetPath` directory under hq's assets root at apply time — nothing is stored in the DB record; the applied agent's content is stored as its package.

### `agent.json` shape (on disk)

```json
{
  "approval": "deferred",
  "allowedTools": [
    { "name": "read_file", "state": "always" },
    { "name": "create_task", "state": "ask" }
  ],
  "allowedBashPatterns": [
    { "pattern": "git ", "state": "always" },
    { "pattern": "npm ", "state": "always" }
  ]
}
```

`instructions.md` and a `skills/` subdirectory live alongside `agent.json` in the same `assetPath` directory. `agent.json` also carries `name`, `handle`, `role`, `version` and a `skills` list of slugs.

---

## Handles

The `handle` on an agent template is a suggestion, not a guarantee. Applying a template (`applyAgentTemplate`) takes the handle the person chose, and the agent is created with that one — never blindly copied from the template.

Workforce templates do not use agent templates: each defines its own agents, with their own handles, which are checked against existing agents in the org and resolved on its review page.

---

## Agent archives

An agent archive (ZIP) holds one agent's current definition: `agent.json` (identity and settings), `instructions.md` and every file of every skill. Importing one replaces that agent's content and settings in place. Archives from before packages carry `PROFILE.md` and `RESPONSIBILITIES.md`, which are merged into the instructions on import.

---

## Canonical roles

| Slug | Name | Default handle | Skills |
|---|---|---|---|
| `kernel` | Kernel | `kernel` | `orchestrate`, `assembly`, `planning` |
| `product-manager` | Product Manager | `product-manager` | `write-brief`, `write-roadmap`, `review-roadmap`, `understand-vision`, `process-feedback` |
| `project-manager` | Project Manager | `project-manager` | `write-sprint-plan`, `write-implementation-plan`, `assign-work`, `review-work`, `read-context` |
| `skills-engineer` | Skills Engineer | `skills-engineer` | `observe-patterns`, `propose-skill`, `codify-skill`, `audit-skills` |
| `wasp-developer` | Wasp Developer | `wasp-developer` | `implement-wasp-feature`, `fix-bug`, `write-tests`, `git-workflow` |
| `qa` | QA | `qa` | `verify-task`, `run-tests`, `explore-feature` |

---

## Related

- [library.md](./library.md) — library overview and file → DB seeding pattern
- [workforce-templates.md](./workforce-templates.md) — workforce templates, which define their own agents rather than referencing agent templates
- [skills.md](../skills/skills.md) — skill sources and how they are staged for each turn
