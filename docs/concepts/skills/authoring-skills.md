# Authoring Skills

A skill is a `SKILL.md` file that instructs an agent how to behave in a specific context. This guide covers the file format, name rules, and how to choose where a skill lives.

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
| `name` | Yes | Display name shown in hq. When staged for a run it is replaced by the skill's `<source>-<name>` name |
| `description` | Yes | One-line summary the model reads to decide whether to load the skill. A skill without one is not listed to the model on OpenCode |

When a skill is staged, its frontmatter is rebuilt from an allowlist: besides `name` and `description`, only `when_to_use`, `argument-hint`, `disable-model-invocation` and `user-invocable` are kept. Any other field — `hooks`, `allowed-tools`, `model` and the rest — is dropped and never reaches the harness ([skills.md](./skills.md)). Keep frontmatter minimal.

---

## Name rules

A skill's name is the name of its folder and its identity within a source. An installed skill is `publisher/name`, and the same rule applies to every part.

- 1 to 64 lowercase letters, digits and single hyphens
- No spaces, underscores, uppercase, or a hyphen at the start or end

```
code-review        ok
sprint-workflow    ok
Code Review        not allowed: uppercase and a space
code_review        not allowed: underscore
-my-skill          not allowed: starts with a hyphen
```

A name with its source in front when a run stages it (`shared-`, `workspace-12-`) is at most 64 characters, so a long name is refused where the source is long. A description is 1 to 1,024 characters. A body over 500 lines is warned about, not refused. Header keys outside the staged allowlist are flagged *ignored when run*.

---

## Choosing where a skill lives

| I want this skill to... | Put it |
|-------------------------|--------|
| Apply to every agent in the organisation, at one version everyone can roll back | In the Library, with every agent having it |
| Be had by some agents wherever they work | In the Library, added to those agents |
| Apply to every agent working in one project, reviewed by the project's administrators | In the project's files, `.agents/skills/<name>/SKILL.md`, published from the Skills page |
| Apply to one agent in one project only | `.agents/agents/<agent id>/skills/<name>/SKILL.md` in the project's files |
| Already exist in a team's repository | Leave it in the workspace's `.agents/skills/`, `.claude/skills/` or `.github/skills/`; switch it on |
| Be mine, in all my own conversations | In Your space, published |

Skills in files are plain folders, so whoever can write the files can add one, and so can an agent working there; the project's default and switches decide whether it runs ([skills in files](./skills-in-files.md)). Skills in the Library are checked on the way in and change only when someone publishes ([the Library](../library/library.md)).

To have an agent write one, ask it: it proposes the skill, and a person publishes it ([drafts and proposals](./drafts-and-proposals.md)). The built-in `skill-creator` is what teaches it to write a good one.

---

## Skill or knowledge

If the agent must do something a certain way, write a **skill**, or a line in the instructions if it applies to everything. If the agent needs something to know, write **knowledge**. For a process, write it once in knowledge and let a skill enforce it ([skills.md](./skills.md#instructions-skills-and-knowledge)).

---

## Same name, different levels

There is no override. If an installed skill and a project's skill are the same skill, the installed one is used and the other is set aside, with the reason shown ([the order](./skills.md#when-the-same-skill-comes-from-two-places)). If they are different skills that happen to share a folder name, both are staged under different sources and the agent chooses by description, so give a more specific skill a description that says when it applies. To retire a general skill for one agent, remove it from the level it comes from.

Because a skill is read when each turn starts, a published version or a switch takes effect on the agent's next turn without restarting anything.

---

## Tips

- Keep skills focused: one skill per responsibility
- Write skills as instructions to the agent, not documentation for humans
- Use the `description` field carefully: it is what the model reads to decide whether the skill fits, and it also appears in hq's skill lists
- Every skill an agent has costs listing space on every request; the agent's page estimates it and warns above about 20 skills or 4,000 tokens
- Avoid duplicating system prompt content in skills; skills supplement identity, they don't replace it
