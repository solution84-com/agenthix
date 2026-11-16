---
name: Audit Skills
description: Review existing skills across the workforce for staleness, accuracy, and gaps. Flag issues without rewriting autonomously.
---

# Audit Skills

Use this skill to verify that the workforce's skill library reflects current practice.

## When to Use

- When asked to audit the workforce's skills
- When a skill is suspected to be broken or outdated (e.g., an agent failed while following it)
- When a significant platform change has been made (new tools, renamed files, changed workflows)

## Step 1: Enumerate Skills

For each project whose files you can read:
1. List all files matching `.agents/agents/*/skills/*/SKILL.md`
2. Record each skill: name, owning agent (the ID in the path — match it with `list_agents`), project, last-modified date

Skills published for every run of an agent are an org admin's to review. Ask the user to check those in hq when your findings suggest one is stale.

## Step 2: Read and Evaluate Each Skill

For each skill, check:

| Check | Pass | Flag |
|---|---|---|
| File paths referenced still exist | Files found in repo | File not found |
| Tools referenced are still available | Tool is in agent's `allowedTools` | Tool was removed or renamed |
| Steps match current observed practice | Pattern still used in recent tasks | Steps never appear in recent work |
| Skill is complete | All steps lead to a clear output | Steps trail off or reference undefined context |
| Not duplicated | No other skill covers the same trigger | Two skills for the same trigger |

## Step 3: Classify Each Finding

- **Stale** — references outdated paths, tools, or patterns
- **Broken** — will cause the agent to fail if followed literally
- **Redundant** — duplicates an existing skill
- **Gap** — observed work in recent tasks that no skill covers (feed to `observe-patterns`)

## Step 4: Report

Do not rewrite or delete skills autonomously. Instead:
- Write a concise summary of findings: which skills are healthy, which need attention
- For each flagged skill: state the specific issue and what the correct behaviour should be
- Propose updates to the user — get confirmation before making any changes

If all skills pass: report that the library is healthy and stop.

## Rules

- Never delete a skill without explicit user instruction
- Never rewrite a skill autonomously — even a clearly broken one
- If you cannot read a project's files, note the failure and continue — do not stop the whole audit
- A skill used once and never again is not stale — usage frequency is not a reason to remove it
