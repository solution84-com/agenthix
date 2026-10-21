# The tools panel

Part of the unit's design spec: see [the index](README.md).

## The tools panel

The panel is **one surface**: the place's facts and its tools are sections of the same view, with small uppercase
headings and no cards or padding around them. **One thin line runs under each section's heading, and one between the
facts and the Members row**, and sections are set apart by space. A row
with no count or state, such as Timeline or Settings, shows › so it reads as something to tap.

**Facts** for a project: Lead, Site, Default agent, Product, Access. There is no repository and no status. A
project's repositories belong to its Files (the project's own backup) and to each workspace.

**Members**, after the facts: one row with no heading, set apart by space above and below, with a few faces and a
count. It opens the **Members** view in the panel, as a tool does: the project's teams, people and agents
([Organisation](organisation.md)). Members are who works in the place, not a view of its work, so they are not in the tools list.
**Settings** stands alone at the foot, below the tool groups. The phone's project page has the same order: facts,
Members, tools, Settings.

**Tools**, grouped with the most-used first. Each shows a short count or state:

| Group | Tools |
|---|---|
| Work | Tasks (e.g. "1 needs you · 12"), Boards, Timeline |
| Agents at work | Runs ("2 running"), Automation ("On"), and a row of two buttons: **Run all** and **Stop all** |
| Files | Files, Artefacts, Knowledge, Workspaces ([The Files tools](files.md#the-files-tools)) |
| — (alone, at the foot) | Settings |

**Opening a tool** shows it in the panel, one at a time, with "‹ Tools" to go back. **The panel has one header
row**: a view inside a tool replaces it with its own (‹ Tasks · Backlog, ‹ WEB-27 · Session), never a second row
below. On a page, a view's place is in the screen bar's breadcrumb (*Tasks / Done*), not in a link inside the page. It updates live, so a person
can watch a change happen while they keep talking. The panel never switches tool by itself. There is no "Open full
view" link: Tool only gives a busy tool the whole space. The tools' own pages stay, for links from elsewhere.

**Run all** queues every queued task in the place, as today's project Overview does. **Stop all** stops the
place's running and queued runs ([Chat — the personal space](conversations.md#chat--the-personal-space)).

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Stop all for one place** | Stops a project's (or the personal space's) running and queued runs. It builds on `stopProjectRuns`, which already does this before a project is deleted. Allowed to project admins, and to the person in their own space |
