# Automation

Part of the unit's design spec: see [the index](README.md).

## The Automation tool

Agreed on its own mockup. A person comes to it to check automation is
running or pause it, to see what it is doing and what will start, and, less often, to change what starts work.

- **Status:** "● Running" (or Paused) with **Pause / Resume**. Pause stops new automated starts only; running
  work carries on, and Stop all ends it. Whether a new project starts running or paused is unchanged by this
  design (adr-0087: off until turned on); changing it is
  left for later.
- **Now:** at most a few lines — how many are running and in line (with the next round when throttled), and
  anything stuck named with its fix (for example "WEB-23 couldn't queue — no agent assigned · Assign"). Each run
  in detail is in Runs.
- **Two buttons, Routines and Rules,** between Now and Later. No tabs.
- **Later:** what will start, in time order — the next run of each routine (not the routine itself) and start
  times set on tasks. No switches here.
- **Routines** (its own view): each routine with its on/off switch, schedule, who it runs for and next run;
  New routine; opening one edits its task, schedule and person and shows its past rounds.
- **Rules** (its own view): the agents' switch ("Agents may set start times when asked"); the limits — throttle,
  chain depth, queue limit and turn limit (only runs no person started), each with the organisation's maximum;
  the run time limit shown read-only, because it applies to every run and is edited in the project's Settings;
  then **Columns that start work automatically** — only the columns switched on, each linking to its board. The
  switch itself stays on the board's column, its only control.
- **Archive finished tasks** moves to the project's Settings.
- **A routine** opens inside the tool (‹ Routines) at its own address; the old `/routines/<id>` forwards there.
  - **A sentence says what happens:** *Every weekday at 9:00, a task for Frontend dev in Release board › To do, on
    behalf of Avery*, with its time zone and who set it up. Its on/off switch is in its header, Delete under ⋯.
  - **Next round:** its time and its task, with **Run now** (starts that round at once, so a person can watch it;
    the schedule is unchanged), **Open** and **Skip this time**.
  - **Rounds:** squares for the last 10 (done, failed, needs you, waiting), then the list, newest first, each with
    its state and how long it took; Unlink under ⋯; Older rounds. The Routines list shows each routine's squares too.
    **Three failed rounds in a row** notify the routine's person.
  - **What it creates** and **When**, each with **Edit** in place (the same fields as New routine); **On behalf of**
    with Change for project admins, and Take it over when that person has lost access.
  - **A round with an agent starts at its time**, whatever column it is in, as a task's start time does; one with
    no agent waits for a person ([adr-0104](../../../adr/adr-0104-a-routines-round-starts-at-its-time.md)). New
    routine says which, in words.
- The same view in every layout and on mobile; the wide layout gives room, not more content.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **A routine's round starts at its time** | A round with an agent starts at its time like a task's start time, whatever its column; one with no agent waits (adr-0104). Run now starts the waiting round at once. Three failed rounds in a row notify the routine's person. Today a round starts only if its column starts work, and Project Tasks never does |
