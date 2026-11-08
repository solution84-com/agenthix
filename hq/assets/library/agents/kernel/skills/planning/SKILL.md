---
name: Workforce Planning
description: Plan and build an agent workforce. Use when asked to create agents, teams, or set up projects.
version: 7
---

# Workforce Planning

Use this skill when the user asks you to help build or expand their workforce.

## Step 1 — Read the current org

Before proposing anything, read what already exists: `get_org`, `list_agents`, `list_teams`, `list_projects`. Do not propose something that already exists.

## Step 2 — Ask clarifying questions

Understand the actual need before proposing structure. Ask one question at a time:

- What is the org trying to achieve?
- What work is not getting done, or getting done badly?
- Is this a gap in people, structure, or process?
- What is the minimum needed to get started?

Do not rush to propose. A well-understood need produces a better proposal.

## Step 3 — Propose the structure

Present the plan clearly — what you are proposing to create and why:
- Which agents to create, their roles, and a brief description of their responsibilities
- Which teams to create and which agents belong to each
- Which projects to create if needed, and the task types each needs beyond Task and Epic

Wait for the user to approve before proceeding.

## Step 4 — Find the Workforce Assembly project

Find the project named **"Workforce Assembly"** (`list_projects`), or create it if there is none. Read its task types with `list_boards`: when it has the **Team proposal** type, use that type and its **Planned** column; otherwise use the Task type in Backlog.

Before creating the tasks, explain to the user:

> "I'm going to map out all the work in the Workforce Assembly project. Each agent, team, and project gets its own task so you can see exactly what's planned. Nothing will be created until you're ready — tasks will sit in **Planned** until you ask me to start."

If the project already exists, reuse it — do not create a duplicate.

## Step 5 — Create one task per entity

Create one task per entity in this order: **agents first, then teams, then projects**.

For each task:
- **title**: e.g. `Create agent: Marketing Manager`
- **description**: structured spec the assembler will execute (see format below)
- **assignedAgentId**: your own agent ID
- **projectId**: the Workforce Assembly project
- **typeId** and **columnId**: the Team proposal type and its Planned column, when the project has them
- **queue**: leave it out — user reviews before anything runs

### Task description format

**Agent task:**
```
Create a new agent.

- **Name:** [name]
- **Role:** [one-line role]
- **Why:** [why this agent is needed — what gap it fills or what work it will own]
- **Responsibilities:**
[responsibilities in markdown — be specific about what this agent owns, produces, and maintains]
```

**Team task:**
```
Create a new team.

- **Name:** [name]
- **Purpose:** [purpose]
- **Why:** [why this team is needed — what it enables or organises]
- **Members:** [comma-separated agent names — resolve to IDs via list_agents at execution time]
```

**Project task:**
```
Create a new project.

- **Name:** [name]
- **Description:** [description]
- **Why:** [why this project is needed — what work it tracks]
- **Default agent:** [agent name, or "none"]
- **Task types:** [a task template from the Library to add to it, or "Task and Epic only"]
```

## Step 6 — Hand off

After creating all tasks, tell the user:

> "The plan is in the Workforce Assembly project — [N] tasks ready for review:
> [bullet list of task titles]
>
> Tasks are paused at **Planned**. I can work through them with you here in chat, or leave them for later. Each entity will move to **In Review** once created, so you can approve before anything goes live."

Do not execute the tasks. Let the user decide when to proceed.

## Principles

- **Minimum viable structure** — the smallest number of agents and teams that fills the gap
- **One role per agent** — no overlapping agents; reuse existing ones if they can cover the need
- **Teams group by capability** — not by project; teams are for access and cohesion
- **Never propose silently** — always explain the reasoning before creating anything
- **Plan first, execute later** — your job here is to map out the tasks, not run them
- **Never include kernel** — do not add the kernel agent to any team or project.
