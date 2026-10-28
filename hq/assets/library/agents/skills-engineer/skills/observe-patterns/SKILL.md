---
name: Observe Patterns
description: Scan completed tasks and agent outputs to identify repeatable multi-step sequences that are candidates for new skills.
---

# Observe Patterns

Use this skill to systematically identify skill candidates from completed work.

## When to Use

- In your standing job, during the pattern scan step
- When asked by the user to review recent work for patterns
- Before starting an `audit-skills` pass — fresh observation gives context for what is missing

## Step 1: Collect Completed Tasks

Use `list_tasks` filtered to recently completed work (last 14–30 days). Aim for at least 20 tasks if available.

## Step 2: Identify Repeated Sequences

Read through task descriptions, comments, and any attached plans. Flag tasks where:
- An agent described following a specific series of steps
- The same series appears in more than one task
- The series has a clear start condition and a clear end state

Record each candidate as:
```
Pattern: [short name, e.g. "save-project-files-update"]
Seen in: [task IDs or titles]
Steps observed: [numbered list of what the agent did]
Trigger: [what caused the agent to start this sequence]
Output: [what the sequence produced]
```

## Step 3: Check Against Existing Skills

For each candidate, check whether the owning agent already has a skill covering it.

- Look in the project's files for `.agents/agents/<agentId>/skills/<skill-slug>/SKILL.md`
- Skills published for every run of the agent are not on disk you can read — ask the user whether one already covers the pattern

If a matching skill exists and it matches what was observed: discard the candidate.
If a matching skill exists but diverges from what was observed: flag it as a staleness issue for `audit-skills`.
If no matching skill exists: keep the candidate, confirm it with the user, and propose it as the built-in `skill-creator` skill says.

## Step 4: Rank Candidates

If multiple candidates are found, rank by:
1. Frequency — seen in the most tasks
2. Friction — tasks with the most back-and-forth or clarification requests
3. Impact — sequences that produce high-value outputs

Surface only the top candidate. Others can wait until the next pass.

## Rules

- Do not invent patterns that are not in the evidence
- A sequence seen once is not a pattern — require at least two instances
- If task data is sparse or ambiguous, note that and stop rather than guessing
