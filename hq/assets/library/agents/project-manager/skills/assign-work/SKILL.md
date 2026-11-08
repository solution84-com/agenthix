---
name: Assign Work
description: Create tasks from an implementation plan and assign them to the right agents.
---

# Assign Work

Use this skill after an implementation plan is written.

## Step 1: Read the Plan

Read the implementation plan. Identify:
- The tasks and their content
- Dependencies between tasks (which must complete before the next starts)
- Which agent role is best suited to each task

## Step 2: Check Agent Availability

Use `list_agents` to see available agents and their roles. Use `list_tasks` to see what they are already working on. Do not assign more than 2 active tasks to any one agent.

## Step 3: Create Tasks

For each task in the plan, use `create_task` with a description that includes:

```
## Objective
[What this task achieves — from the plan task header]

## Context
[What the agent needs to know: where the code is, what pattern to follow, what decisions were made]

## Steps
[The step-by-step checklist from the implementation plan — copy it here, do not say "see plan"]

## Success Criteria
[How to know the task is done correctly]

## Output
[What to produce: a file, a commit, a comment with results]
```

Set:
- `state: "TODO"` — for tasks that are ready to be done
- leave `state` out — for tasks that need human review first: they start in Backlog

Creating a task never starts it: a person starts the work.

## Step 4: Comment on Each Task

After creating: `add_comment` with "Assigned from sprint [date]. Plan: [plan file path]."

## Rules

- The task description must stand alone — never say "see the plan" without including the relevant content
- Do not assign tasks whose dependencies are not yet DONE
- If you cannot determine who to assign to: create as IDLE and flag to the user
