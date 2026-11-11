---
title: The Workroom and Runs
description: Watch a project's agents at work, answer what needs you, and read the history of every run.
sidebar:
  order: 6
---

Tasks are for planning; **runs** are what carry the plan out. A run is one go of an agent until it hands back: a task's
run, a reply in a conversation, or a routine's run. Runs are seen in three places, each for a different question.

| Place | The question it answers |
|---|---|
| **Workroom** (in a project) | What are this project's agents doing now, and what needs me? |
| **Workrooms** (in the side bar) | The same, for every project at once |
| **Runs** | What ran, who started it, what did it cost, what happened? |

## The Workroom

Open **Workroom** in a project, under **Agents at work**. Counts across the top show **Needs you**, **Running**,
**Waiting**, **Finished today** and **Spent today** (an estimate from tokens). Select **Needs you** to show only the agents
that need someone.

Below is one card for each of the project's agents. You can drag the cards to put them in the order you like; the order is kept
for the project. A card shows:

- The agent's picture with its ring, which is its state: a thin dotted ring when tasks wait in its line, a turning ring
  while it runs, a full ring with a dot when it needs you, a full ring with a ! when a run failed. No ring means nothing is
  going on.
- Numbers like a scoreboard: **Needs you**, **Ready** (tasks it could start now), **In line**, **Runs today** and **Today**
  (its cost).
- **Start** and **Stop**. See [Starting work](starting-work.md).
- **Now**: what it is doing, each run with how long it has gone, and **Stop this run**.
- **In line · rank order**: the tasks waiting for it, with why each waits ("next", "after the one above", "starts at
  09:00 (Run at…)", or "its site is busy"). Change the order on a board.
- **Finished today**: its recent results, with cost.
- **Needs you** bars at the foot, one for each thing waiting on a person: needs your okay, asked you something, reached
  its limit, needs someone to stand in, or failed. The bar's button is **Review**, **Answer** or **Run again**, and opens
  the task where you answer it.

The header has **Start all agents…** and **Stop every run…**. Both are greyed, with the reason, when they have nothing to
do or you are a **Viewer**.

## Workrooms

**Workrooms** in the side bar shows every project's Workroom on one page, with the same counts across all projects. A card
opens the project's own Workroom. Your personal projects are included, and for them the page shows your own runs.

## What needs you

A run needs a person when it asks for their okay, asks them a question, reaches its time limit, belongs to someone who has
lost access to the project, or fails. The **Needs you** count is the one place that adds these up, and it is the same
number in the Workroom, in the **Runs** button and on the run itself. Tasks do not count runs: the Tasks list counts
planning only.

## The Runs panel and Runs

The **Notifications** bell and the **Runs** button sit together at the foot of the side bar (on a phone, they are rows in
the menu). **Runs** shows a count of what needs you and opens a panel with your runs in four groups: **Needs you**,
**Running**, **Waiting** and **Finished today**. **All runs ›** opens **Runs**, and **Open Workrooms ›** opens Workrooms.

![The Runs screen, with a run waiting for approval open beside the list](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/runs-screen.png)

**Runs** is the history, in a project (under **Agents at work**) and across your organisation, where it shows your own
runs. Tabs across the top count them by state: **All**, **Running**, **Waiting**, **Needs you** and **Finished**. Search
by task key, title or agent, and narrow the list with:

- **Kind**: **Tasks**, **Routine runs** or **Replies in conversations**
- **Agent**
- **Started by**: you, other people, agents or a schedule (in a project), or **Project** and **Whose**: **all of mine**,
  **Started by me** or **On my behalf** (across the organisation)
- **When**: **Today**, **Last 7 days** or **Last 30 days**
- **Sort**: newest first, cost, or how long it took

The list shows twenty runs a page. Each row says which task or routine, who started it, how long it took, what it cost, and
how it ended.

Select a run to open its page. It shows its state, the task or routine it belongs to, who started it and on whose behalf,
its **Model**, its **Site**, its **Time** against its limit, its **Turns**, **Tokens** and cost, and any error. **Tool calls**
lists every call in order with a risk label: **Safe**, **Low**, **Medium**, **High** or **Flagged**; **High and Flagged**
shows only those. **Newer** and **Older** move to the runs either side of it.
