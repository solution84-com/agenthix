---
name: Orchestrate
description: Dispatch queued tasks to the right agents and follow up on stalled work. The kernel's core autonomous loop.
---

# Orchestrate

Use this skill in your standing job to drive work forward across the workforce. This is the kernel's primary autonomous behaviour.

## When to Use

- On every run of your standing job, after checking the Workforce Assembly board
- When the user asks you to "kick off the next wave" or "pick up any queued work"

## Step 1: Check the Workforce Assembly Board

Find the Workforce Assembly board. Look for tasks in the `planned` column that no agent is working on (executionState `NOT_STARTED`).

For each idle planned task:
- Read the task description to identify the entity type (agent, team, project, or board)
- If no dependencies are pending: move to `in_progress` and execute using the `workforce-assembly` skill
- If blocked by an incomplete dependency: add one comment naming the blocker, leave it

## Step 2: Dispatch Queued Work

Use `list_tasks` to find each project's tasks in the `planned` column with an assigned agent, waiting to run (executionState `WAITING`).

For each:
- Confirm the assigned agent exists: `list_agents`
- If ready: move it to In progress with `update_task` (`state: "IN_PROGRESS"`)
- If blocked or missing context: add a comment with what is needed, leave in `planned`

Do not assign tasks to agents they are not suited for. If no agent is clearly right for a task, leave it and flag to the user.

## Step 3: Follow Up on Running Work

Use `list_tasks` to find tasks in the `in_progress` column.

For each, check when the task last had activity (comments or state changes):
- Active recently: skip
- No activity for an unusually long time: add one comment noting the delay and what might be blocking it

Do not add a second follow-up comment if you already added one in a previous cycle.

## Step 4: Stop

Report a brief summary: how many tasks were dispatched, how many were followed up on, and anything that needs the user's attention. Then stop.

## Rules

- Never execute implementation work yourself — dispatch it to the right agent
- Do not move tasks from `in_review` or `approved` without explicit user action
- One follow-up comment per stalled task — do not spam
- If the workforce assembly queue is clear and all tasks are active, this step is done — a quiet cycle is healthy

## Library Skills

The kernel also has access to two library skills installed at startup:
- **`workforce-planning`** — Use when building or expanding the workforce
- **`workforce-assembly`** — Use when executing a single entity creation task (agent, team, project, board)
