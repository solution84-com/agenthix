---
title: Starting work
description: "How a task gets run: Run, Run at…, an agent's Start, Start all agents and Stop. Nothing starts on its own."
sidebar:
  order: 5
---

Work starts because someone started it. Moving a task to a column, giving it an agent or putting it in a sprint never
runs it. There is no switch that turns on running by itself, and no timer that picks up tasks. A task runs only through
one of these:

| To start | Where | What it does |
|---|---|---|
| **Run** › **Run now** | A task's page, or a card's **⋯** | Starts that one task now |
| **Run** › **Run at…** | A task's page | Starts that one task once, at a date and time you choose |
| **Start** | An agent's card in the [Workroom](workroom.md) | Starts the agent on its ready tasks, one at a time |
| **Start all agents…** | The Workroom's header | Does the same for every agent in the project |
| An agent's tool | A run that is already going | An agent may start a task in its own project, on behalf of the person its run is for |

A routine is a separate way work begins: it fires on a schedule. See [Routines](../automation/routines.md).

A task needs an agent to run. **Run** is greyed, with the reason, on a task with none (**Assign an agent first**). An
epic is never run.

## Run now and Run at…

Open a task and select **Run**. **Run now** starts it at once. **Run at…** asks for a date and time and starts the task
once then. The task's **Starts** detail shows the time, or **Not scheduled**. Clear it to cancel. Changing a task's plan
dates never starts or stops a run.

The run is done on behalf of the task's **On behalf of** person, and their access bounds it.

## Start, and Start all agents

Each agent in the project has its own card in the Workroom. Its **Start** runs its **ready** tasks. A task is ready when
it is in a **To do** column, has not been run, is not archived and is not an epic, has the agent, and has no **Run at…**
time still to come.

1. Select **Start** on the agent's card. A dialog lists the tasks it would run, in the project's rank order, each with a
   tick, and the tasks that can't run and why (an epic, a start time still to come).
2. Untick any you want to leave out and select **Start N tasks**.

The agent takes them **one at a time**, in rank order: the first now if the agent is free, and each next one when the run
before it ends, whether it finished, failed or was stopped. Those tasks show **Waiting** until their turn. A failed run
doesn't hold the line: it waits under **Needs you** and the agent moves on.

**Start all agents…** in the header does this for every agent at once, grouped by agent, in one confirmation.

A site also limits how many runs go at once. If its limit is reached, the next task waits and the Workroom says
so under the task.

## Stop

- **Stop** on a task's page stops its run, or takes it out of the line.
- **Stop** on an agent's card stops that agent's runs, and the tasks waiting in its line go back to **Not started**.
- **Stop every run…** in the Workroom's header asks once, naming how many runs it will stop and for which agents. It also
  takes waiting tasks out of line, back to **Not started**. Nothing more starts until someone starts it. Only a project
  administrator can use it.

A stopped run reads "Stopped by…" and its task goes back to **Not started**. A run that fails shows its reason on the
task, and **Run again**; **Dismiss** clears a failure you don't want.

## How far agents may start work

An agent that starts a task for another is limited. It starts the task on behalf of the person its run is for, only in its
own project, and a chain of tasks agents start for each other can go only so deep before a person must start the next
step. An organisation administrator sets that depth: see [Limits, and stopping everything](../automation/limits-and-stopping.md).
