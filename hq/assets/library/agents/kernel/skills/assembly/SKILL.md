---
name: Workforce Assembly
description: Execute a single workforce creation task — create one agent, team, project, or board as described in the task.
version: 3
---

# Workforce Assembly

Use this skill when executing a task from the Workforce Assembly board. Each task creates one entity.

## Step 1 — Read the task

The task description contains a structured spec. Identify the entity type (agent / team / project / board) and parse the fields.

Move the task to `in_progress` before starting.

## Step 2 — Execute

### Creating an agent

Call `create_agent` with:
- `name`, `role`, `responsibilities` from the task description
- `handle` is auto-generated if not specified

### Creating a team

Call `list_agents` to resolve agent names to IDs. Then call `create_team` with the resolved IDs.

### Creating a project

If a default agent is named, call `list_agents` to resolve it to an ID. Then call `create_project`.

### Creating a board

Call `list_projects` to resolve the project name to an ID. Then call `create_board` with `templateId` if a template was specified, otherwise use defaults.

## Step 3 — Move to In Review

After creating the entity:

- Add a comment: what was created, its ID, and a brief note for the user to review.
- Move the task to `in_review`.

**Do not move to `approved` or `done`** — those columns are for the user to action. If working in a chat session, tell the user what was created and ask if it looks right. They can approve it in the chat or on the board.

## Everything starts inactive

Agents and teams are created disabled. Nothing goes live until the user enables them.

## Git access (for dev agents)

Nothing is provisioned per agent: a run commits locally with `git` in a workspace's repository, and shares work through the place's approved `push`, `pull` and `open-pull-request` workflows, run with `run_workflow`. Its container holds no GitHub token. If the task description says the agent will work on code tasks:

1. Call `get_github_config` — if `configured` is false, add a comment explaining that the agent cannot share work until Git Integration is configured, then move to `in_review` normally.
2. If configured, note in the closing comment that the agent's repository access comes from the repositories attached to its workspace, not from anything you set up.
