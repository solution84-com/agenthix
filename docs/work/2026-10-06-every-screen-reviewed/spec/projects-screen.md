# The Projects screen

Part of the unit's design spec: see [the index](README.md).

## The Projects screen

Agreed on its own mockup. A person comes here to find a project, and to see **every board and every workspace in
their projects** and open one — the cross-project lists that left the navigation.

- **Four views:** **Projects · Boards · Workspaces · Routines**, switched under the header beside the search. The address
  carries the view (`/projects?view=boards`), so Back and a saved link return to it.
- **Projects:** the cards ([An agent's place, and managing agents](agents.md#an-agents-place-and-managing-agents)), with a product and a programme filter. A
  card's **"N boards"** opens the Boards view filtered to that project.
- **Boards:** one row per board in the person's projects: its name with "N needs you" as a badge, its project, a bar
  and counts of its tasks per column, and a sprint board's current sprint with days left. **Archived** and a
  project filter beside the search.
- **Workspaces:** one row per workspace in the person's projects and their own Chat: its name, its place, its
  repository, whether its preview is running, and its site, with a place filter. A site that does not answer is the
  Workspaces tool's one quiet line.
- **Routines:** one row per routine in the person's projects and their own Chat: its switch, name, place, when it
  repeats, who it runs for, its next round and squares for its last 10 rounds; project and On · Paused filters.
- **Opening a board, workspace or routine** goes into its project (or Chat) with it open in its tool (a routine in
  Automation), at its own address.
  There is one way to see a board, not two.
- **What is listed:** the boards and workspaces of projects the person is a member of, and their own; organisation
  admins see the same, not every project's.
- **＋ New project ▾**, the same on every view: the button makes a project; its arrow offers **New board…**,
  **New workspace…** and **New routine…**, which ask for the project (or place) first — only those where the person may add one — then
  show the tool's own form, and open what was made in its tool.
- **Mobile:** the three views as chips under the header; each list as compact rows of three lines.
- `/boards` and `/workspaces` go to the Boards and Workspaces views.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Boards and workspaces across projects** | The Projects screen lists every board and every workspace in the person's projects (and their own), each opening in its project's tool; New board and New workspace ask for the project first. Today `/boards` lists every board in the organisation and `/workspaces` every workspace, and nothing links to either |
| **Routines across projects** | The Projects screen's Routines view lists every routine in the person's projects and their own Chat, each with its last 10 rounds. Today routines are only listed inside each project's Automation tool |
