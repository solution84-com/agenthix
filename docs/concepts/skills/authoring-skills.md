# Authoring Skills

A skill is a `SKILL.md` file that instructs an agent how to behave in a specific context. This guide covers the file format, slug rules, and how to choose where a skill lives.

---

## SKILL.md format

```markdown
---
name: Human-readable name
description: One sentence — what does this skill do?
---

# Skill Name

The body is free-form markdown. Write instructions the agent will follow when this skill is active.
Use headings, bullet lists, and code blocks as needed.
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name shown in hq. When staged for a run it is replaced by the skill's `<source>-<slug>` name |
| `description` | Yes | One-line summary the model reads to decide whether to load the skill. A skill without one is not listed to the model on OpenCode |

When a skill is staged, its frontmatter is rebuilt from an allowlist: besides `name` and `description`, only `when_to_use`, `argument-hint`, `disable-model-invocation` and `user-invocable` are kept. Any other field — `hooks`, `allowed-tools`, `model` and the rest — is dropped and never reaches the harness ([skills.md](./skills.md)). Keep frontmatter minimal.

---

## Slug naming rules

The slug is the directory name on disk and the unique identifier for the skill within its source.

Rules:
- Lowercase letters, digits, and hyphens only
- Must start with a letter or digit
- No spaces, underscores, or special characters
- Pattern: `/^[a-z0-9][a-z0-9-]*$/`

Examples:

```
code-review        ✓
workforce-planning ✓
sprint-workflow    ✓
Code Review        ✗  uppercase
code_review        ✗  underscore
-my-skill          ✗  starts with hyphen
```

The UI auto-generates slugs from the skill name when creating a new skill.

---

## Choosing where a skill lives

A skill has one source, and the source decides who gets it ([skills.md](./skills.md)):

| I want this skill to… | Source |
|-----------------------|--------|
| Ship with the platform itself | `platform` (in the platform's own content; not editable in hq) |
| Apply to every agent in the organisation | `org` |
| Customise one agent everywhere it works | `agent` (part of the agent's definition) |
| Apply to one agent in one project or personal space only | `boundary`: `.agents/agents/<agentId>/skills/<slug>/SKILL.md` in that storage boundary |
| Apply to every agent working in one project or personal space | `shared`: `.agents/skills/<slug>/SKILL.md` in that storage boundary |

The first three are managed in hq, from the Library and from the agent's page. The last two are plain folders in the boundary's files, so whoever can edit the files can add one, and so can an agent working there.

---

## Same slug, different sources

There is no override. If an org skill and an agent skill are both called `code-review`, the agent is given both, as `org-code-review` and `agent-code-review`. Agents choose by description, so give a more specific skill a description that says when it applies rather than relying on it to replace a general one. To retire a general skill for one agent, remove it from the source it comes from.

Because a boundary skill is read when each turn starts, an edit takes effect on the agent's next turn without restarting anything.

---

## Tips

- Keep skills focused — one skill per responsibility
- Write skills as instructions to the agent, not documentation for humans
- Use the `description` field carefully — it is what the model reads to decide whether the skill fits, and it also appears in hq's skill lists
- Avoid duplicating system prompt content in skills; skills supplement identity, they don't replace it
