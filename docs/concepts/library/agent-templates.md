# Agent Templates

An agent template is a complete, reusable role definition — settings, instructions and skills — that can be applied to create a fully configured agent in one action. Applying one creates the agent: its settings on the agent's record, its instructions as its content held by hq, and the skills its role needs given to it. A template gives an agent no schedule: an agent never wakes itself, and work that repeats is a [routine](../tasks/routines.md) a person sets up.

---

## The package

An agent template is an asset of kind `agent` ([the Library](./library.md)): a package holding `agent.json`, `instructions.md` and a `skills/<name>/` folder for each skill its role needs. Agenthix's five (every canonical role but Kernel) ship in hq's image and are installed as `agenthix/<name>` when hq starts. Others come from an upload or a link ([installing](./installing.md)).

```
agenthix/project-manager        the template, one pinned version
  package.json                  the manifest: kind, name, version, publisher
  agent.json                    settings: name, handle, role, approval, tools, the skills it has
  instructions.md               the agent's instructions
  skills/<name>/SKILL.md        the role skills it carries
```

Applying one reads the pinned version once. The agent takes its settings and instructions, and **keeps a read-only link to the version it was made from**; it never follows the template's later versions, and a later edit to the agent changes only the agent ([ADR-0072](../../adr/adr-0072-an-agent-is-defined-once-in-hq-and-overridden-per-boundary.md)).

**Skills are given, not copied.** The first time an agent is made from a template, the skills it carries are installed as assets under the template's publisher, and the new agent is given the ones its `agent.json` names. After that they are ordinary installed skills the agent has: pinned, updated and rolled back like any other ([library skills](./skills.md)). A skill an administrator removed stays removed, and the agent is made without it, its page showing it as missing.

### `agent.json`

```json
{
  "name": "QA",
  "handle": "qa",
  "role": "Verifies completed work against acceptance criteria",
  "approval": "deferred",
  "allowedTools": [
    { "name": "read_file", "state": "always" },
    { "name": "create_task", "state": "ask" }
  ],
  "allowedBashPatterns": [
    { "pattern": "git ", "state": "always" }
  ],
  "skills": ["verify-task", "run-tests", "explore-feature"]
}
```

Every field is checked and bounded when the package comes in. The `skills` list names the folders under `skills/` that the agent has.

---

## Handles

The `handle` on an agent template is a suggestion, not a guarantee. Applying a template (`applyAgentTemplate`) takes the handle the person chose, and the agent is created with that one — never blindly copied from the template.

Team templates do not use agent templates: each defines its own agents, with their own handles, which are checked against existing agents in the org and resolved on its review page.

---

## Agent archives

An agent archive (ZIP) holds one agent's current definition: `agent.json` (identity and settings), `instructions.md` and every file of every skill. Importing one replaces that agent's content and settings in place. It is not the same as the Library's agent template: it changes one agent, and adds nothing to the Library.

---

## Canonical roles

| Slug | Name | Default handle | Skills |
|---|---|---|---|
| `kernel` | Kernel | `kernel` | `orchestrate`, `assembly`, `planning` |
| `product-manager` | Product Manager | `product-manager` | `write-brief`, `write-roadmap`, `review-roadmap`, `understand-vision`, `process-feedback` |
| `project-manager` | Project Manager | `project-manager` | `write-sprint-plan`, `write-implementation-plan`, `assign-work`, `review-work`, `read-context` |
| `skills-engineer` | Skills Engineer | `skills-engineer` | `observe-patterns`, `audit-skills` |
| `wasp-developer` | Wasp Developer | `wasp-developer` | `implement-wasp-feature`, `fix-bug`, `write-tests` |
| `qa` | QA | `qa` | `verify-task`, `run-tests`, `explore-feature` |

---

Writing a skill and proposing it is taught by the built-in `skill-creator`, and git work by the built-in `working-with-git`, so no template carries either. Kernel is the organisation's built-in agent: its template is written to it from hq's image and is never offered in the Library.

## Related

- [library.md](./library.md): assets, versions and the pin
- [skills.md](./skills.md): built-in, offered and role skills
- [workforce-templates.md](./workforce-templates.md): team templates, which define their own agents
- [skills](../skills/skills.md): where skills live and how a turn receives them
