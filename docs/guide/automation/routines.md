---
title: Routines
description: Have an agent do the same job on a schedule, choose when and for whom, and read how each run went.
sidebar:
  order: 2
---

A **routine** is work that comes round again: a weekly status summary, a daily check of a dashboard. It is a schedule, an
agent and instructions. Each time the schedule comes round, the routine starts one **run** of its agent with its
instructions, and the run appears in [Runs](../projects/workroom.md#the-runs-panel-and-runs) like any other. A routine does
not make a task for each run. It is not tied to tasks unless its instructions ask the agent to make some.

A routine lives in a project, or in your own space. A routine is **on** or **off**.

## Where to find them

- **Routines** in a project, under **Agents at work**, lists that project's routines.
- **Routines** in the side bar lists the routines of all your projects and your own, with **New routine** asking where it goes.

The list starts with counts, some of which also filter it, and **Up next**: the next three times a routine will run. Below
is a card for each routine: its agent's picture (with a ring when a run is going, needs you or failed), what it does, when
it repeats, whom it runs on behalf of, a switch, **Run now**, and a mark for each of its last runs. Drag the cards to put
them in order. A run waiting for you shows as a **Needs you** bar on the card. You can reorder the routines of a project
you work in.

## Make a routine

You need to be able to work in the project, so a project **Viewer** can't make one.

1. Select **New routine**. It opens as a page of its own.
2. Give it a **Name**, choose its **Agent** and, if you like, a **Model**, and write its **Instructions**. They are Markdown.
3. Choose when it **Repeats** (see below), and the **Timezone**.
4. Select **Create routine**.

### Build the schedule

A routine's schedule is a cron rule plus a timezone. You don't need to write cron: choose a preset and fill in its
fields.

- **Every N minutes**: no more often than every 5 minutes
- **Every N hours**, at a minute past
- **Daily**, at one or more times
- **Weekdays**, at one or more times
- **Weekly**, on the days you tick, at one or more times
- **Monthly on a day**: day 1 to 31, at a time
- **Monthly on the first or last weekday**: for example the first Monday, at a time

**Advanced: cron expression** shows the rule the preset writes, and you can type any five-field rule (minute, hour, day of
month, month, day of week). Typing a rule that a preset can say selects that preset. The schedule is read back in plain
words, with the next three times it will run, so you can check it. **Timezone** decides what "9:00" means.

If a routine's agent is still on its previous run when the next time comes, that time is skipped and marked **Skipped**.

## Read and change a routine

Select a routine to open its page. The page is also its edit screen: **Name**, **Agent**, **Model**, **Instructions**,
the schedule, and the switch. Beside them are **Details**, **How it's going** (for example "9 of the last 10 finished"),
**Cost**, and **Its runs**, newest first, each with what it did, how long it took and what it cost. **All in Runs** opens them
in Runs, and **Older runs** reads further back.

A routine with a run waiting for you shows the question; **Answer** or **Review** opens it.

Select **Save change** to keep a change. The **⋯** menu has **Rename** and **Delete…**; deleting removes the routine and its
list of runs here, and the runs it made stay in Runs.

## Who a routine runs as

A routine always runs on behalf of **the last person who changed it**. A change is anything that edits the routine,
including switching it on or off. Their access bounds each run, and they answer its approvals. **On behalf of** on its page
shows who. When you save a change to a routine that runs on someone else's behalf, you are asked first: "This routine will
now run on your behalf, not Kai's." Saving moves it to you.

**Run now** starts one extra run at once, on behalf of whoever pressed it, and lists it as started by them. It doesn't change
whom the routine belongs to, and the scheduled runs stay on behalf of the last person who changed it. It is greyed, with the
reason, when the routine is off, has no agent, or its last run is still going.

If the person a routine runs for can no longer work in the project, the routine turns off and says so. Someone who works in the
project can change it, which makes it theirs.

If a routine's last three runs all fail, its person is told, and the notice stays in **Notifications** until a run succeeds.

## Let an agent set one up

If an administrator allows it, an agent can make or change a routine when you ask it to in a conversation you started. It can't
do this from a routine's own run: a routine's run never makes or changes routines. See
[Limits, and stopping everything](limits-and-stopping.md).
