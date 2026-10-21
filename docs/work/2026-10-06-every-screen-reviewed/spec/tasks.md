# Tasks

Part of the unit's design spec: see [the index](README.md).

## The Tasks tool

Agreed on its own mockup. A person comes to it to act on what needs them, to see what is being worked on and what
is next, to open one task and see where it stands, and to add or place work. Most work is still asked for in a
conversation; Tasks shows its state.

- **Backlog and Done** are two buttons at the top, with their counts, always in reach. Search below them; when the
  tool is wide, filters by agent, board and priority beside search.
- **One list in three groups:** **Needs you** (each with its one action in place, for example Review or Assign),
  **Working on** (running, with how long) and **Up next** — every task on a board that is neither done nor
  running, those waiting to start first, then by priority, each naming its board and column. No tabs.
- **Narrow:** two lines per task — key and title; agent and state. **Wide:** a table — the priority as a dot, the
  task, agent and state, board and column, and the action.
- **New task** adds a title in place; it lands in Project Tasks' Backlog. "More details" opens the full form.
- **Backlog** (its own view): Project Tasks' Backlog column, by priority, with **Show also ▾** to add other
  boards' backlogs ([The Boards tool](boards.md)); each task can move to another board; a hint that the agent can plan them
  when asked in the conversation.
- **Done** (its own view): the last 30 days, newest first, each with its result line.
- **A task opens inside the tool** (‹ Tasks) when reached from a project's Tasks tool. Reached from anywhere else —
  Your tasks, a notification, a link — it opens as **its own page** (*Tasks / WEB-27*), the same view with room;
  its Session is *Tasks / WEB-27 / Session*. It shows, in order:
  - its key, board and column, title and description;
  - **what waits in its session** — for example a tool approval, answered there — with **Open session**;
  - its **comments** in full, with a box to comment;
  - its facts beside (below when narrow): agent, board and column, priority, on whose behalf, start time, files,
    who created it.
  One action for the state it is in (Run, Stop, Approve, Run again); the rest under ⋯.
- **Comments and the session are different things.**
  - **Comments** are the task's discussion, kept for good and written to be read later: people talk to each other
    about the task and leave direction for the agent's next run; the agent posts what each run did and where it got
    to, or asks for something it needs. Everyone with the task sees them.
  - **The session** is the agent's working record: every message, command and result, one per task, with each run
    as a divider. It is verbose and read when needed. Tool approvals sit in it, where the agent stopped. A person
    steps into it to direct the run now. Anything to keep, or for others, goes in a comment.
- **Open session** shows the session inside the tools panel (‹ WEB-27 › Session), never in the conversation's
  place: the breadcrumb is where the person is, the panel is what they look at beside it. A box at the bottom
  sends into the session; if nothing is running, the message starts a run at once. For room, the layout control.
- **A task is shared on equal footing.** Anyone on the project who may start runs can step into its session,
  interrupt or stop a run, start one and approve; the project's viewers only read. Every message shows who sent it.
- **The conversations list stays the person's own private conversations**; a task's session is reached through its
  task. Collaborative conversations, with tasks as their topics, come later.
- **Tasks in the navigation** is **Your tasks**: the tasks done on the person's behalf in every project, in the same
  groups, with a project filter and Done at the top.
- **Mobile:** the tool full screen, Backlog and Done at the top; a task full screen in the same order.

Where today's project tabs go:

| Today | In this design |
|---|---|
| Overview | Removed as a page. Description and facts go to the panel's facts. Members and Agents go to the Members view, opened from its row after the facts. "Running now" goes to Runs. Run All goes to the Agents at work group. The backlog becomes a view inside Tasks |
| Tasks, Boards, Settings | Tools of the same name |
| Files, Workspaces | The Files and Workspaces tools |
| GitHub | Inside Files |
| Routines | Inside Automation |
| — | Runs and Automation are new tools here |

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Names on messages** | Every person's message in a session records who sent it, and is shown with their name; today a transcript row is only "user" |
| **A run is on behalf of whoever started it** | A run a person starts — Run, Run again, or a message into the task's session — is on their behalf, and its approvals notify them; the start checks they are still on the project. The task's person ([adr-0089](../../../adr/adr-0089-every-task-runs-on-behalf-of-a-person.md)) is the default for runs nobody started. Today a run started by a message has no person behind it |
| **Anyone on the project may approve** | Anyone who may start runs in the project can approve a task's tool request, not only operators |
| **The agent reads the comments** | Each task run is given the comments written since that agent's last run on the task, marked new; the agent can fetch the rest. Today it only writes comments |
| **Your tasks** | The Tasks screen lists the tasks done on the person's behalf in every project; today it lists every task in the organisation |
