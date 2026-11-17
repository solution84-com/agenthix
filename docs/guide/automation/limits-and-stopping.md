---
title: Limits, and stopping everything
description: Set how far agents may start work, how long a run may last, and stop what is running.
sidebar:
  order: 3
---

Runs spend a model's time, so they have limits. An organisation administrator sets the furthest any project may go. A
project's administrators can set the run time limit lower for that project, never higher.

## What the organisation allows

An organisation administrator opens **Manage**, then **Settings** and **Automation**. Select **Save** when done.

| Setting | What it does |
|---|---|
| **Maximum depth** | How far a chain of work that agents start for each other may go before a person must start the next step. At 0, every task an agent starts outside a person's own run waits for a person. From 0 to 20 |
| **Agents may set start times when asked** | Lets a project allow an agent to set a task's start time, or make or change a routine, but only in a run a person started. Off unless the organisation allows it |

![The organisation's Automation settings](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/automation-settings.png)

There is no setting that starts work by itself: a task runs only when someone starts it, as in
[Starting work](../projects/starting-work.md).

## How far agents can start work

An agent can start a task, in its own project, on behalf of the person its run is for. Agents can start tasks for each
other, which could otherwise go on without end, so a **chain depth** limit holds it. A task a person starts is at depth 0.
A task started by a run that another agent started is one deeper. Past the maximum depth, the task is still made, but it
isn't started: it waits for a person.

### What agents may schedule

A run a person started may set a task's start time or make a routine only when both the organisation and the project allow it
(**Agents may set start times when asked**). An agent working in a routine's run, or in any run no person started, can never
schedule work, so a schedule can't be used to get around these limits.

### See a project's limits

A project's **Automation** tool shows what runs now and what will start later. Its **Rules** view shows the project's
limits beside the organisation's, chain depth among them.

![A project's Automation tool: what runs now, and what will start later](https://github.com/solution84-com/agenthix/releases/download/v0.1.0/automation-overview.png)

![The Rules view of a project's Automation tool: its limits beside the organisation's](https://github.com/solution84-com/agenthix/releases/download/v0.1.0/automation-rules.png)

## How long a run may last

Every run has a **Time limit (minutes)**, and a run that no person started, such as a routine's, also has a **Turn limit**. A
turn is one round trip with the model. An administrator sets both under **Manage › Settings › Runs**, from 1 minute to 24 hours
(1440) and from 1 to 1000 turns. A project may only lower the time limit, under **Run time limit (minutes)** in its
**Settings**. A run that reaches a limit stops, and its task says which limit it reached. The run's page shows its time against
its limit.

A site also limits how many runs go at once. A run that has to wait for the site says so, in the Workroom, under its task.

## Stop everything

- **Stop one task.** Select **Stop** on the task.
- **Stop one agent.** **Stop** on the agent's card in the Workroom. On an agent's page in **Manage › Agents**, the **⋯**
  menu has **Stop its runs**.
- **Stop a whole project.** **Stop every run…** in the project's Workroom, and confirm. Every running task stops, and
  waiting tasks leave the line and go back to **Not started**. Only the project's administrators can use it. Nothing more
  starts until someone starts it.
- **Stop your own runs.** In your Workrooms page, **Stop every run of yours?** stops the runs you are responsible for.
- **Stop the whole organisation's.** An organisation administrator selects **Stop all** in the Runs panel.
- **Turn a routine off.** Switch it off on its card or its page: see [Routines](routines.md).
