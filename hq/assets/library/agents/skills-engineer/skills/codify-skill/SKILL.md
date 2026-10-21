---
name: Codify Skill
description: Write a confirmed pattern as a SKILL.md file — into a project's files for one project, or as a proposal to an org admin for every run of an agent.
---

# Codify Skill

Use this skill after `propose-skill` has been confirmed by the user. Do not run this skill without a confirmed proposal.

## Before Writing

You must have:
- User confirmation of the pattern from `propose-skill`
- The owning agent's handle (e.g., `product-manager`)
- The owning agent's ID (`agentId` from `list_agents`)
- Where the skill applies: one project, or every run of the agent

## Skill File Structure

Where the file goes depends on where the skill applies:

- **One project** — write it to that project's files at `.agents/agents/<agentId>/skills/<skill-slug>/SKILL.md`. Runs of that agent in that project load it.
- **Every run of the agent** — do not write it anywhere. An agent's own skills are published by an org admin; put the full file in your proposal to one.

`<skill-slug>` is lowercase letters, digits and hyphens, starting with a letter or digit, at most 55 characters.

The file:

```markdown
---
name: [Human-readable skill name]
description: [One sentence — what this skill does and when it produces value]
---

# [Skill Name]

[One paragraph. What this skill is for and when to use it. Written for the agent that will invoke it.]

## When to Use

[Bullet list of triggers — the situations that call for this skill]

## [Step Group 1: e.g., "Preparation"]

[Numbered steps. Each step must be specific enough to act on without reading anything else.]

1. [Do X]
2. [Do Y — include exact tool calls, paths, or commands where the implementation is non-obvious]

## [Step Group 2: e.g., "Execution"]

...

## After Completion

[What the agent should do or report when the skill is done]

## Rules

[Hard constraints. Things the agent must never do while following this skill.]
```

## After Writing

1. For a project skill: confirm to the user: "Skill `<name>` written to `<project>`'s files for `<agent-handle>`."
2. For a skill for every run: give the user the full SKILL.md and ask them to have an org admin publish it to `<agent-handle>`.

## Rules

- Keep the skill self-contained — the agent using it should not need to read anything else to follow it
- Write for the agent, not for a human reader — use imperative instructions
- Do not include optional or speculative steps — only what the pattern requires
- Maximum 400 words per skill — if it is longer, it is probably two skills
- One skill per confirmed pattern — do not bundle related-but-distinct processes
