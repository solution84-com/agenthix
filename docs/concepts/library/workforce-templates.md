# Team Templates

A team template (also called a workforce template) is a pre-packaged team configuration that stands up a working team in one action: agents, teams, projects and boards. It is a Library asset of kind `team` ([the Library](./library.md)). What a person sees (why they exist, the review page, applying one, the bundled teams) is in [workforce templates](../workforce/workforce-templates.md); this page is the package.

---

## The package

```
agenthix/solo-dev                 the template, one pinned version
  package.json                    the manifest: kind, name, version, publisher
  team.json                       teams of agents, and the projects and boards they start
  agents/<handle>/agent.json      full settings per agent: approval, tools, the skills it has
  skills/<name>/SKILL.md          every skill its agents need
```

The bundle is **self-contained**: it carries every skill its agents need and refers to no other package, so installing it elsewhere needs nothing else. Agenthix's five ship in hq's image and are installed as `agenthix/<name>` when hq starts. For Agenthix's own, the build copies each shared skill into each template that uses it from one source, so no skill is kept twice by hand. Others come from an upload or a link ([installing](./installing.md)), including a signed one from another organisation.

A team template holds **agents only**, with their boards; people are added after it is used. A package that names people is refused.

### `team.json`

```json
{
  "name": "Solo Developer",
  "description": "Minimal footprint — one dev agent and one QA agent to validate work.",
  "tags": ["software", "solo", "startup"],
  "teams": [
    { "name": "Engineering", "purpose": "Build and validate software features", "agents": ["dev", "qa"] }
  ],
  "projects": [
    { "name": "Main", "description": "Primary development project", "defaultAgentHandle": "dev",
      "boards": [{ "name": "Work", "template": "kanban" }] }
  ]
}
```

`teams[].agents` are handles, each read from `agents/<handle>/agent.json`. A project's board names a [board template](./board-templates.md) by name. An agent's `skills` list names folders under `skills/`.

Each field is checked and bounded as the package comes in, and the skills are checked against the Agent Skills rules.

---

## Applying one

Applying a team template makes the agents, teams, projects and boards a person chose on the review page. What it makes is its own definition ([ADR-0072](../../adr/adr-0072-an-agent-is-defined-once-in-hq-and-overridden-per-boundary.md)): each team and agent keeps a read-only link to the template version it came from, and never follows the template's later versions.

**The skills the template carries are installed when it is first used,** matched by identity under the template's publisher: one the organisation lacks is installed and pinned, a newer one is stored and offered as an update, one at that version or newer is left alone, and one an administrator removed stays removed. Each agent is then **given** the skills the template names for it. Nothing is copied into the agent.

Two paths reach the review page, a person's and an agent's `propose_workforce_template`; they are described in [workforce templates](../workforce/workforce-templates.md#two-application-paths).

---

## Related

- [library.md](./library.md): assets, versions and the pin
- [agent-templates.md](./agent-templates.md): the single-agent template, which a team template does not use
- [board-templates.md](./board-templates.md)
- [skills.md](./skills.md): the skills a template carries
- [workforce templates](../workforce/workforce-templates.md): applying one, the review page, the bundled teams
