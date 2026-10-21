---
name: Write Sprint Plan
description: Produce a sprint plan in the project's files breaking the current roadmap phase into deliverables.
---

# Write Sprint Plan

Use this skill when starting a new sprint or when `read-context` finds no current sprint plan.

## Before Writing

You must have run `read-context` first. You need:
- The current roadmap phase and its deliverables
- An understanding of available agents (use `list_agents`)

## Sprint Plan Structure

Create `sprints/YYYY-MM-DD.md` in the project's files (date = sprint start date):

```markdown
# Sprint Plan: [Sprint Start Date]

> Roadmap phase: [current phase name]
> Sprint target: [end date]

## Goal
[One sentence: what does this sprint deliver?]

## Deliverables

### [Deliverable 1 name]
**From roadmap:** [which roadmap deliverable this covers]
**Exit criteria:** [how we know this is done]
**Assigned to:** [agent handle or TBD]

### [Deliverable 2 name]
...

## Out of Scope This Sprint
Roadmap items from the current phase not included:
- [item] — reason: [why deferred]

## Dependencies
Things that must be true before work can start:
- [dependency]
```

## After Writing

1. Write `sprints/YYYY-MM-DD.md` to the project's files
2. For each deliverable: use `write-implementation-plan` to produce the operational spec
3. Report: "Sprint plan saved. Writing implementation plans for [N] deliverables."

## Rules

- Scope to what is genuinely achievable — do not over-commit
- Each deliverable must map to a roadmap item — do not invent scope
- If a deliverable needs more information before it can be planned, note it as TBD and flag to the user
