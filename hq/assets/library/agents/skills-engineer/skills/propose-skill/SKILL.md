---
name: Propose Skill
description: Surface a candidate skill to the user for confirmation before writing anything.
---

# Propose Skill

Use this skill when you have identified a pattern worth codifying. Always run this before `codify-skill`. Never write a skill without the user confirming the pattern first.

## When to Use

- After `observe-patterns` identifies a candidate
- When an agent or user describes a repeatable process that has no existing skill
- When the user explicitly asks you to capture a pattern as a skill

## What to Present

Write a short proposal in chat. Cover:

1. **Pattern name** — a slug-style name for the skill (e.g., `save-project-files-update`, `write-sprint-plan`)
2. **Owning agent** — which agent would use this skill
3. **Trigger** — what situation causes the agent to invoke this skill
4. **Steps** — a numbered list of what the agent does (5–10 steps max; collapse trivial steps)
5. **Output** — what the skill produces
6. **Evidence** — which tasks or interactions you observed this pattern in

### Example Proposal

> I found a pattern worth codifying:
>
> **Skill:** `save-project-files-update`
> **Owner:** Product Manager
> **Trigger:** After writing or updating a document in the project's files and user has confirmed
> **Steps:**
> 1. Write the file to the project's files
> 2. Confirm the write and report what changed
> **Output:** Updated document saved to the project's files
> **Seen in:** Task #42 (Write brief), Task #57 (Update ROADMAP.md)
>
> Should I write this up as a skill?

## After the User Confirms

If the user says yes: proceed to `codify-skill`.
If the user says no: drop the candidate. Do not propose it again unless new evidence emerges.
If the user asks for changes to the pattern: revise your understanding and confirm the updated version before proceeding.

## Rules

- One proposal at a time — do not present multiple candidates in a single message
- Do not write any files during this skill — proposal only
- If the user has already confirmed the pattern in this same conversation, you may skip straight to `codify-skill`
