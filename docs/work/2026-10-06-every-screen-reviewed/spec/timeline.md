# Timeline

Part of the unit's design spec: see [the index](README.md).

## The Timeline tool

Agreed on its own mockups. New. Boards say where work is; a timeline says **when**. A person comes to it to see
what happened and what is coming — milestones, epics, sprints, what agents worked on, what starts later.

- **Two scopes, one view:** the **Timeline** tool in the Work group, for the whole project, a lane per board
  (Project Tasks first, each folding away, **Boards ▾** to choose); and **Columns · Timeline** on a board, for that
  board, its sprints as bands.
- **A bar is a task**, labelled by its title only (no key). It shows three things, kept apart:
  - **Plan** — the bar itself, from the task's **start date** to its **finish date**. Dragging the bar, or either
    end, moves only the plan.
  - **Schedule** — **▶** where the agent is set to start: the task's start time, or a routine's round. Dragging ▶
    moves the start time. A routine stays its own thing (adr-0092): its row shows its rounds as ▶, and a round's
    task, once created, has its own plan, by default its round's day.
  - **Work** — darker slices inside the bar for each run, when the agent actually worked.
  Its colour says its state; a task that needs you is outlined. Clicking a bar opens the task inside the tool.
- **Epics and milestones:**
  - An **epic** is a task that groups other tasks ("Pricing page"); a task belongs to at most one epic. Its bar spans
    its own plan, or its tasks' when it has none.
  - A **milestone** is a dated goal ("Self-serve pricing live, 30 Nov"), shown as **⚑** on its date; an epic can
    belong to one milestone.
- **Scales:** Week (three weeks, a column a day), Month (three months, a column a week), Quarter (a year, a column a
  month). Week shows tasks under their epic; Month shows epics; Quarter shows milestones with their epics under
  them. **Show ▾** switches between them at any scale. A board's Timeline opens on Week, the project's on Month.
- **Backlog is not on the timeline**: it has no time yet; a board's Backlog count sits beside its lane.
- **Narrow and on a phone**, it is an agenda: This week · Next week · Later, each line a task with its date.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **A task's plan** | A task has a start date and a finish date, apart from its start time (when the agent starts) and its runs |
| **Epics and milestones** | An epic is a task that groups tasks (a task belongs to at most one); a milestone is a dated goal an epic can belong to. Agents can read and set both |
| **The timeline** | Lists tasks, epics and milestones with their plans, start times, routine rounds and runs, for a project or one board |
